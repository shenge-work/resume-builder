#!/usr/bin/env node
'use strict';
/*
 * 飞书「个人应用」扫码注册（零依赖，仅用 Node 内置 https / zlib / crypto）
 * -------------------------------------------------------------
 * 复刻飞书官方 SDK 的 RegisterApp Device Flow（RFC 8628）：
 *   1) begin：向 accounts.feishu.cn/oauth/v1/app/registration 发起 device authorize，
 *      拿到 device_code + verification_uri_complete（即二维码内容）；
 *   2) 用户用手机飞书 App 扫描二维码并确认，飞书后台为其创建一个 PersonalAgent
 *      （个人应用），并授予基础权限；
 *   3) poll：用 device_code 轮询，成功时直接返回 client_id / client_secret
 *      —— 也就是自动创建出来的「应用身份」App ID / App Secret，无需人工在开放平台抄写。
 *
 * 与 OAuth 授权码模式（feishu-oauth.js，拿到的是 user_access_token）不同，本文件
 * 拿到的是「应用身份」凭证（tenant_access_token 可用），适合作为同步链路的应用身份。
 *
 * 关键端点 / 参数来自 larksuite node-sdk: scene/registration/index.ts：
 *   ENDPOINT = /oauth/v1/app/registration
 *   begin:  action=begin&archetype=PersonalAgent&auth_method=client_secret&request_user_info=open_id
 *   poll:   action=poll&device_code=<device_code>
 *   二维码 URL = verification_uri_complete + from=sdk&source=<sdk>/<source>&tp=sdk[&addons][&createOnly][&clientID]
 *   addons 编码：JSON.stringify → gzip → base64 → URL-safe（+/→-/_，去 =）
 */
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');

const DEFAULT_FEISHU_DOMAIN = 'accounts.feishu.cn';
const DEFAULT_LARK_DOMAIN = 'accounts.larksuite.com';
const ENDPOINT = '/oauth/v1/app/registration';
const SDK_NAME = 'node-sdk';
const SOURCE = 'resume-builder';

/* 个人应用默认预置的权限（best-effort：平台不认的名字会被确认页静默丢弃，不影响创建）。
   PersonalAgent 以用户身份运行，drive/docx 走 user 身份即可；tenant 一并带上以防万一。 */
const DEFAULT_ADDONS = {
  scopes: {
    user: ['drive:drive', 'docx:document'],
    tenant: ['drive:drive', 'docx:document']
  }
};

/* ---------- 底层：表单 POST + 自动跟随 3xx ----------
 * 注意：按 RFC 8628，飞书把 authorization_pending / slow_down 等轮询中间态以 HTTP 400
 * 返回（与 larksuite 官方 SDK 一致——SDK 把 400 错误体也当数据返回）。因此本函数
 * 对任意状态码都解析并返回 { statusCode, json }，仅在网络失败或响应非 JSON 时 reject；
 * 是否「成功」交给 beginRegistration / pollRegistration 按响应体判断。 */
function postForm(domain, params, depth) {
  depth = depth || 0;
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const opts = {
      method: 'POST',
      hostname: domain,
      path: ENDPOINT,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(opts, (res) => {
      // 飞书可能返回 3xx（极少），跟随最多 3 跳
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && depth < 3) {
        const loc = res.headers.location;
        if (loc) {
          try {
            const u = new URL(loc);
            return resolve(postForm(u.hostname, params, depth + 1));
          } catch (e) { /* 落到下面的解析 */ }
        }
      }
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); }
        catch (e) { json = null; }
        resolve({ statusCode: res.statusCode, json: json, raw: data });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* ---------- addons 编码（与官方 SDK 完全一致） ---------- */
function encodeAddons(addons) {
  const json = JSON.stringify(addons);
  return zlib.gzipSync(Buffer.from(json, 'utf8'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/* ---------- begin：发起设备授权，返回二维码 URL 等 ---------- */
async function beginRegistration(opts) {
  opts = opts || {};
  const domain = opts.domain || DEFAULT_FEISHU_DOMAIN;
  const larkDomain = opts.larkDomain || DEFAULT_LARK_DOMAIN;
  const beginRes = await postForm(domain, {
    action: 'begin',
    archetype: 'PersonalAgent',
    auth_method: 'client_secret',
    request_user_info: 'open_id'
  });
  const bj = beginRes.json;
  if (beginRes.statusCode < 200 || beginRes.statusCode >= 300 || !bj || !bj.device_code || !bj.verification_uri_complete) {
    // 飞书错误通常以 {code, msg} 形式返回；尽量透出
    const msg = (bj && (bj.msg || bj.error_description)) || ('HTTP ' + beginRes.statusCode + ' ' + (beginRes.raw || '').slice(0, 200));
    throw new Error('飞书设备流初始化失败：' + msg);
  }
  const qrUrl = new URL(bj.verification_uri_complete);
  qrUrl.searchParams.set('from', 'sdk');
  qrUrl.searchParams.set('source', SDK_NAME + '/' + (opts.source || SOURCE));
  qrUrl.searchParams.set('tp', 'sdk');
  if (opts.createOnly === true) qrUrl.searchParams.set('createOnly', 'true');
  if (opts.appId) qrUrl.searchParams.set('clientID', opts.appId);
  const addons = opts.addons || DEFAULT_ADDONS;
  if (addons) qrUrl.searchParams.set('addons', encodeAddons(addons));
  return {
    device_code: bj.device_code,
    user_code: bj.user_code || '',
    verification_uri: bj.verification_uri || bj.verification_uri_complete,
    qrUrl: qrUrl.toString(),
    interval: bj.interval || 5,                // 秒
    expires_in: bj.expires_in || 600,          // 秒
    domain: domain,
    larkDomain: larkDomain
  };
}

/* ---------- poll：用 device_code 轮询终态 ----------
 * 返回：
 *   { status: 'waiting' }
 *   { status: 'slow_down' }                              // 需放慢轮询（调用方 interval += 5s）
 *   { status: 'success', client_id, client_secret, user_info }
 *   { status: 'failed',  error, error_description }
 *   { status: 'expired', error, error_description }
 * ctx 跨调用持有：{ domain, larkDomain, domainSwitched } —— 处理国际 Lark 域名切换。 */

/* 纯函数：把飞书 poll 响应映射为本地状态对象（抽出来便于离线单测）。
 * 同时会按需翻转 ctx.domainSwitched（国际 Lark 用户首次出现时）。 */
function mapPollStatus(res, ctx) {
  if (ctx && res.user_info && res.user_info.tenant_brand === 'lark' && !ctx.domainSwitched) {
    ctx.domainSwitched = true;
  }
  if (res.client_id && res.client_secret) {
    return {
      status: 'success',
      client_id: res.client_id,
      client_secret: res.client_secret,
      user_info: res.user_info || null
    };
  }
  switch (res.error) {
    case 'authorization_pending':
      return { status: 'waiting' };
    case 'slow_down':
      return { status: 'slow_down' };
    case 'access_denied':
      return { status: 'failed', error: res.error, error_description: res.error_description || '用户拒绝授权' };
    case 'expired_token':
      return { status: 'expired', error: res.error, error_description: res.error_description || '二维码已过期' };
    default:
      if (res.error) return { status: 'failed', error: res.error, error_description: res.error_description || res.error };
      return { status: 'waiting' };
  }
}

async function pollRegistration(deviceCode, ctx) {
  const domain = ctx && ctx.domainSwitched ? ctx.larkDomain : ctx.domain;
  const r = await postForm(domain, { action: 'poll', device_code: deviceCode });
  const res = r.json || {};
  return mapPollStatus(res, ctx);
}

module.exports = { beginRegistration, pollRegistration, mapPollStatus, encodeAddons, DEFAULT_ADDONS, DEFAULT_FEISHU_DOMAIN, DEFAULT_LARK_DOMAIN };
