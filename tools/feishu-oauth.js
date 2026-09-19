#!/usr/bin/env node
'use strict';
/*
 * feishu-oauth.js —— 飞书扫码授权（OAuth 授权码模式）凭证管理 + 换 token
 * -----------------------------------------------------------------------------
 * 背景：现有 feishu-sync.js 用「自建应用 app_id/app_secret → tenant_access_token」读写云盘/文档，
 *       用户需手动把 secret 粘贴进表单。本模块新增「扫码授权」：
 *         用户用手机扫二维码授权 → 飞书回调 code → 后端用 app_id/app_secret 换
 *         user_access_token（带 drive/docx scope）→ 存本机 gitignored 文件。
 *       之后云盘/文档读写即改用 user_access_token（以「用户身份」访问用户自己的云盘）。
 *
 * 凭证只存本机（sync.oauth.json，gitignored），绝不进浏览器；浏览器只经 serve.js 中转。
 *
 * OAuth 流程（飞书开放平台）：
 *   1) 授权页（引导扫码）：
 *      GET https://accounts.feishu.cn/open-apis/authen/v1/authorize
 *          ?app_id=<app_id>&redirect_uri=<cb>&state=<state>&scope=drive:drive%20docx:document
 *   2) 用户授权后，飞书重定向到 redirect_uri?code=xxx&state=yyy
 *   3) 换 token（服务端）：
 *      POST https://open.feishu.cn/open-apis/authen/v2/oauth/token
 *      body: { grant_type:'authorization_code', client_id, client_secret, code, redirect_uri }
 *      → { access_token, refresh_token, expires_in }
 *   4) 刷新（access_token 过期时）：
 *      grant_type='refresh_token' + refresh_token
 *
 * 依赖：Node 内置 https / fs / crypto；复用 open.feishu.cn 开放平台域。
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OAUTH_PATH = path.join(ROOT, 'sync.oauth.json');   // gitignored，凭证不出本机
const CONFIG_PATH = path.join(ROOT, 'sync.config.json'); // 复用自建应用 app_id/app_secret

const AUTHORIZE_URL = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
const TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token';
const SCOPE = 'drive:drive docx:document drive:drive:version:readonly';

/* ---------- 配置读取（app_id/app_secret 来自 sync.config.json，与现有同步共用） ---------- */
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) { return null; }
}

/* ---------- OAuth 状态读写（sync.oauth.json） ---------- */
function readOauth() {
  try { return JSON.parse(fs.readFileSync(OAUTH_PATH, 'utf8')); } catch (e) { return null; }
}
function writeOauth(patch) {
  const next = Object.assign(readOauth() || {}, patch || {});
  fs.writeFileSync(OAUTH_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}
function clearOauth() {
  try { fs.unlinkSync(OAUTH_PATH); } catch (e) { /* 不存在无妨 */ }
}

/* ---------- 底层 HTTPS JSON 请求（复用 open.feishu.cn 开放平台） ---------- */
function reqJson(method, urlStr, body, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const payload = body ? JSON.stringify(body) : null;
    const h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers || {});
    if (payload) h['Content-Length'] = Buffer.byteLength(payload);
    const r = https.request({ method, hostname: url.hostname, path: url.pathname + url.search, headers: h }, res => {
      let b = '';
      res.on('data', c => (b += c));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(j);
        else reject(new Error('飞书 OAuth ' + method + ' ' + url.pathname + ' → HTTP ' + res.statusCode + ' ' + (j ? JSON.stringify(j).slice(0, 400) : b.slice(0, 200))));
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

/* ---------- 生成授权链接 ---------- */
/* state 用随机串防 CSRF；回调地址指向本地 serve.js 的 /api/feishu/oauth/callback
   应用身份（app_id/app_secret）统一由后端 sync.config.json 预配置，前端无需填写。 */
function buildAuthorizeUrl(opts) {
  opts = opts || {};
  const cfg = readConfig() || {};
  const appId = cfg.app_id;
  if (!appId) throw new Error('飞书应用尚未配置：请在 sync.config.json 中设置 app_id / app_secret，或由管理员使用「自动探测并绑定」完成初始化');
  const state = opts.state || crypto.randomBytes(12).toString('hex');
  const redirectUri = opts.redirect_uri || 'http://127.0.0.1:' + (process.env.PORT || 8000) + '/api/feishu/oauth/callback';
  const q = new URLSearchParams({
    app_id: appId,
    redirect_uri: redirectUri,
    state: state,
    scope: SCOPE
  });
  return { url: AUTHORIZE_URL + '?' + q.toString(), state, redirect_uri: redirectUri };
}

/* ---------- 用 code 换 user_access_token ---------- */
async function exchangeCode(code, redirectUri) {
  const cfg = readConfig() || {};
  if (!cfg.app_id || !cfg.app_secret) throw new Error('缺少 App ID / App Secret（应用身份），无法换取用户凭证');
  const body = {
    grant_type: 'authorization_code',
    client_id: cfg.app_id,
    client_secret: cfg.app_secret,
    code: code,
    redirect_uri: redirectUri
  };
  const j = await reqJson('POST', TOKEN_URL, body);
  if (!j || !j.access_token) throw new Error('换取 user_access_token 失败：响应缺少 access_token');
  const oauth = writeOauth({
    access_token: j.access_token,
    refresh_token: j.refresh_token || '',
    expires_at: Date.now() + ((j.expires_in || 3600) - 60) * 1000,
    refresh_expires_at: j.refresh_expires_in ? Date.now() + (j.refresh_expires_in - 60) * 1000 : 0,
    scope: j.scope || SCOPE,
    updated_at: Date.now()
  });
  return oauth;
}

/* ---------- 刷新 user_access_token ---------- */
async function refreshToken() {
  const cfg = readConfig() || {};
  const o = readOauth();
  if (!o || !o.refresh_token) throw new Error('尚未扫码授权，或缺少 refresh_token');
  if (!cfg.app_id || !cfg.app_secret) throw new Error('缺少 App ID / App Secret');
  const body = {
    grant_type: 'refresh_token',
    client_id: cfg.app_id,
    client_secret: cfg.app_secret,
    refresh_token: o.refresh_token
  };
  const j = await reqJson('POST', TOKEN_URL, body);
  if (!j || !j.access_token) throw new Error('刷新 user_access_token 失败');
  return writeOauth({
    access_token: j.access_token,
    refresh_token: j.refresh_token || o.refresh_token,
    expires_at: Date.now() + ((j.expires_in || 3600) - 60) * 1000,
    refresh_expires_at: j.refresh_expires_in ? Date.now() + (j.refresh_expires_in - 60) * 1000 : 0,
    scope: j.scope || o.scope || SCOPE,
    updated_at: Date.now()
  });
}

/* ---------- 取一个有效的 user_access_token（惰性刷新） ---------- */
async function getValidToken() {
  const o = readOauth();
  if (!o || !o.access_token) throw new Error('尚未扫码授权，请先「扫码授权」');
  if (Date.now() < (o.expires_at || 0)) return o.access_token;
  // 过期：有 refresh_token 则刷新
  if (o.refresh_token && Date.now() < (o.refresh_expires_at || 0)) {
    const no = await refreshToken();
    return no.access_token;
  }
  throw new Error('user_access_token 已过期且 refresh_token 不可用，请重新扫码授权');
}

/* ---------- 状态查询（供前端展示，绝不回传 token 明文） ---------- */
function status() {
  const o = readOauth();
  if (!o || !o.access_token) return { authorized: false };
  return {
    authorized: true,
    scope: o.scope || SCOPE,
    expires_at: o.expires_at || 0,
    updated_at: o.updated_at || 0,
    hasRefresh: !!o.refresh_token
  };
}

module.exports = {
  buildAuthorizeUrl, exchangeCode, refreshToken, getValidToken, status, readOauth, clearOauth, SCOPE
};
