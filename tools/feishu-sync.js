#!/usr/bin/env node
'use strict';
/*
 * 飞书同步模块（零依赖，仅用 Node 内置 https / fs）
 * -------------------------------------------------------------
 * 职责：把简历 JSON 双写到飞书——
 *   1) 飞书文档 docx：把 JSON 放进一个 code 块，文档自带版本历史（供人查看/回滚）
 *   2) 云盘文件 resume.json：带版本历史的文件上传（供程序读取/恢复）
 * 凭证只在「本地 Node 服务」里使用，绝不进浏览器（呼应项目既有的 ai-proxy 模式）。
 *
 * 所有对外端点集中在 BASE / 各函数内；若飞书接口形态有变动，只需改本文件。
 * 调试：设环境变量 FEISHU_DRY_RUN=1 可跳过真实网络请求，验证整条链路不崩。
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'sync.config.json');
const STATE_PATH = path.join(ROOT, 'sync.state.json');
const BASE = 'https://open.feishu.cn/open-apis';

/* ---------- 配置 / 状态（惰性读取，缺文件也不崩） ---------- */
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) { return null; }
}
/* 写入配置（表单保存用）：合并 patch 到现有配置并落盘 sync.config.json（gitignored，凭证不出本机） */
function writeConfig(patch) {
  const next = Object.assign(readConfig() || {}, patch || {});
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (e) { return {}; }
}
function writeState(patch) {
  const s = Object.assign(readState(), patch);
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
  return s;
}
function isDryRun() {
  const c = readConfig() || {};
  return process.env.FEISHU_DRY_RUN === '1' || c.dryRun === true;
}
function enabled() {
  const c = readConfig();
  return !!(c && c.app_id && c.app_secret);
}
function openUrl(kind, id) {
  const c = readConfig() || {};
  const domain = c.domain || 'feishu.cn';
  if (kind === 'doc') return `https://${domain}/docx/${id}`;
  return `https://${domain}/file/${id}`;
}

/* ---------- 底层 HTTPS 请求 ---------- */
function req(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + p);
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json; charset=utf-8' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const r = https.request({ method, hostname: url.hostname, path: url.pathname + url.search, headers }, res => {
      let b = '';
      res.on('data', c => (b += c));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        const ok = res.statusCode >= 200 && res.statusCode < 300 && j && j.code === 0;
        if (ok) resolve(j.data);
        else reject(new Error('飞书 ' + method + ' ' + p + ' → HTTP ' + res.statusCode + ' ' + (j ? JSON.stringify(j).slice(0, 400) : b.slice(0, 200))));
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

/* 需要鉴权的 JSON 请求 */
let _token = null, _exp = 0;
async function getToken() {
  if (_token && Date.now() < _exp) return _token;
  const c = readConfig();
  const d = await req('POST', '/auth/v3/tenant_access_token/internal', { app_id: c.app_id, app_secret: c.app_secret });
  _token = d.tenant_access_token;
  _exp = Date.now() + ((d.expire || 7200) - 60) * 1000;
  return _token;
}

/* ---------- 认证模式：扫码 OAuth（user）优先，自建应用（app）回退 ----------
 * user：扫码授权换来的 user_access_token（tools/feishu-oauth.js 保管/自动刷新），
 *       以「用户身份」读写用户自己的云盘/文档；
 * app：tenant_access_token（旧行为，应用身份）。
 * ⚠️ 两套身份的云盘命名空间互不相通（user 模式下 folder_token '0' 是用户根目录，
 * 且应用身份创建的 file_token/document_id 对用户身份不可见），因此 sync.state.json
 * 里的 file_token / document_id 必须按 mode 分键隔离，避免串身份读写错文件。 */
function authStateKey(base, mode) { return mode === 'user' ? base + '_user' : base; }
/* 按「简历 id + 认证模式」解析状态键（纯函数，可测）。
   resumeId 缺省为 'default'（兼容单份简历的旧状态键 file_token_default / file_token_default_user）。 */
function stateKeyFor(base, resumeId, mode) {
  return authStateKey(base + '_' + (resumeId || 'default'), mode);
}

async function getAuth() {
  try {
    const oauth = require('./feishu-oauth.js');
    const tok = await oauth.getValidToken();
    if (tok) return { token: tok, mode: 'user' };
  } catch (e) { /* 未扫码 / token 失效且无法刷新 → 回退应用身份 */ }
  return { token: await getToken(), mode: 'app' };
}

/* 显式传入 auth 的鉴权请求（auth = {token, mode}，由 getAuth() 产出） */
async function fapi(auth, method, p, body) {
  return req(method, p, body, auth.token);
}

/* 飞书云盘文件上传用 multipart/form-data */
function buildMultipart(fields, fileBuf) {
  const b = '----feishusync' + Date.now();
  const parts = [];
  for (const k in fields) {
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${fields[k]}\r\n`));
  }
  parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="resume.json"\r\nContent-Type: application/json\r\n\r\n`));
  parts.push(fileBuf);
  parts.push(Buffer.from(`\r\n--${b}--\r\n`));
  return { boundary: b, body: Buffer.concat(parts) };
}
async function fpostMultipart(auth, p, fields, fileBuf) {
  const t = auth.token;
  const { boundary, body } = buildMultipart(fields, fileBuf);
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + p);
    const headers = {
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
      'Authorization': 'Bearer ' + t,
      'Content-Length': body.length
    };
    const r = https.request({ method: 'POST', hostname: url.hostname, path: url.pathname + url.search, headers }, res => {
      let b = '';
      res.on('data', c => (b += c));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        if (res.statusCode >= 200 && res.statusCode < 300 && j && j.code === 0) resolve(j.data);
        else reject(new Error('飞书 multipart ' + p + ' → HTTP ' + res.statusCode + ' ' + (j ? JSON.stringify(j).slice(0, 400) : b.slice(0, 200))));
      });
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

async function fpostOctet(auth, pathWithQuery, buf) {
  const url = new URL(BASE + pathWithQuery);
  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/octet-stream',
      'Authorization': 'Bearer ' + auth.token,
      'Content-Length': buf.length
    };
    const r = https.request({ method: 'POST', hostname: url.hostname, path: url.pathname + url.search, headers }, res => {
      let b = '';
      res.on('data', c => (b += c));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        if (res.statusCode >= 200 && res.statusCode < 300 && j && j.code === 0) resolve(j.data);
        else reject(new Error('飞书 octet ' + pathWithQuery + ' → HTTP ' + res.statusCode + ' ' + (j ? JSON.stringify(j).slice(0, 400) : b.slice(0, 200))));
      });
    });
    r.on('error', reject);
    r.write(buf);
    r.end();
  });
}

/* 取文件下载内容（兼容「直接返回文件体」与「返回预签名 url」两种情况） */
async function fetchUrl(u) {
  return new Promise((resolve, reject) => {
    const url = new URL(u);
    const r = https.request({ method: 'GET', hostname: url.hostname, path: url.pathname + url.search }, res => {
      let b = '';
      res.on('data', c => (b += c));
      res.on('end', () => resolve(b));
    });
    r.on('error', reject);
    r.end();
  });
}
async function reqRaw(p, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + p);
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const r = https.request({ method: 'GET', hostname: url.hostname, path: url.pathname + url.search, headers }, res => {
      let b = '';
      res.on('data', c => (b += c));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        if (j && j.code === 0 && j.data && j.data.url) resolve(fetchUrl(j.data.url));
        else resolve(b);
      });
    });
    r.on('error', reject);
    r.end();
  });
}

/* ---------- 飞书文档 docx ---------- */
async function ensureDoc(auth, resumeId, resumeName) {
  const key = authStateKey('document_id_' + resumeId, auth.mode);
  const st = readState();
  if (st[key]) return st[key];
  const c = readConfig();
  const title = (resumeName ? resumeName + ' - ' : '') + (c.doc_title || '简历数据备份');
  const d = await fapi(auth, 'POST', '/docx/v1/documents', { title });
  const id = d.document.document_id;
  writeState({ [key]: id });
  return id;
}
async function writeDoc(auth, jsonStr, resumeId, resumeName) {
  const docId = await ensureDoc(auth, resumeId, resumeName);
  // 先分页拿全部 children，再用 batch_delete 一次清空（避免逐条删失败）
  let allItems = [];
  let pageToken = '';
  do {
    const qs = pageToken ? `?page_size=200&page_token=${pageToken}` : '?page_size=200';
    const list = await fapi(auth, 'GET', `/docx/v1/documents/${docId}/blocks/${docId}/children${qs}`);
    allItems = allItems.concat((list && list.items) || []);
    pageToken = (list && list.page_token) || '';
  } while (pageToken);
  if (allItems.length > 0) {
    try {
      await fapi(auth, 'DELETE', `/docx/v1/documents/${docId}/blocks/${docId}/children/batch_delete`, { start_index: 0, end_index: allItems.length });
    } catch (e) {
      // fallback: 逐条删
      for (const it of allItems) {
        try { await fapi(auth, 'DELETE', `/docx/v1/documents/${docId}/blocks/${it.block_id}`); } catch (e2) {}
      }
    }
  }
  await fapi(auth, 'POST', `/docx/v1/documents/${docId}/blocks/${docId}/children`, {
    index: 0,
    children: [{
      block_type: 14,
      code: {
        elements: [{ text_run: { content: jsonStr } }],
        style: { language: 1 }
      }
    }]
  });
  return docId;
}

/* ---------- 云盘文件 resume.json（带版本历史） ---------- */
async function writeFile(auth, jsonStr, resumeId, resumeName) {
  const c = readConfig();
  const buf = Buffer.from(jsonStr, 'utf8');
  const mode = c.fileUploadMode || 'versioned';
  const key = authStateKey('file_token_' + resumeId, auth.mode);
  let fileToken;
  if (mode === 'new') {
    // 每次新建文件（简单，但同一文件不再累积版本历史；docx 仍保留版本）
    const d = await fpostMultipart(auth, '/drive/v1/files/upload_all', {
      file_name: ((resumeName ? resumeName : (c.file_name || 'resume.json').replace(/\.json$/, ''))) + '.json',
      parent_type: 'explorer',
      parent_node: c.folder_token || '',
      size: buf.length
    }, buf);
    fileToken = d.file_token;
    writeState({ [key]: fileToken });
  } else {
    // 版本化：首次 upload_all 创建；之后用 upload_all 带 file_token 覆盖更新
    const st = readState();
    const existingToken = st[key];
    const fields = {
      file_name: ((resumeName ? resumeName : (c.file_name || 'resume.json').replace(/\.json$/, ''))) + '.json',
      parent_type: 'explorer',
      parent_node: c.folder_token || '',
      size: buf.length
    };
    if (existingToken) fields.file_token = existingToken;
    const d = await fpostMultipart(auth, '/drive/v1/files/upload_all', fields, buf);
    fileToken = d.file_token;
    writeState({ [key]: fileToken });
  }
  return fileToken;
}

/* ---------- 版本列表 / 恢复 ----------
 * ⚠️ 版本列表与恢复必须来自**同一个云盘文件**（file_token）：
 *   文档 docx 的版本历史（obj_type=docx）与 resume.json 文件的版本互不通用，
 *   若用 docx 的 version_id 去下载 resume.json 文件的版本，会 404 或拿到错误内容。
 *   因此这里统一以「云盘文件 file_token」为版本来源，docx 仅作人读备份。 */
async function listVersions(resumeId) {
  const auth = await getAuth();
  const key = stateKeyFor('file_token', resumeId, auth.mode);
  const st = readState();
  if (!st[key]) return [];
  try {
    const d = await fapi(auth, 'GET', `/drive/v1/files/${st[key]}/versions?page_size=50`);
    return (d && d.items) || [];
  } catch (e) {
    return [];
  }
}
async function getVersion(versionId, resumeId) {
  const auth = await getAuth();
  const key = stateKeyFor('file_token', resumeId, auth.mode);
  const st = readState();
  if (!st[key]) throw new Error('尚未上报过，飞书中没有可用版本');
  return reqRaw(`/drive/v1/files/${st[key]}/versions/${versionId}/download`, auth.token);
}

/* ---------- 对外：一键绑定探测（M3） ----------
 * 输入：app_id + app_secret（表单只填这 2 项）
 * 步骤：1) 换 tenant_access_token 验证凭证  2) 自动创建默认文件夹「简历数据」
 *       3) 回填默认项（domain / doc_title / file_name / fileUploadMode / folder_token）
 * 返回：{ folder_token, doc_title, file_name, domain, fileUploadMode }
 * 注：domain 无法从 token 响应直接判定租户（feishu.cn / larksuite.com 均由 open.feishu.cn
 *     开放平台承载），故保持默认 feishu.cn，用户可在表单手动改（链接域名仅影响展示）。 */
/* 默认项构造（纯函数，可测）：folder_token 为空/缺失时回退 '0'=根目录，不阻断绑定 */
function buildProbeDefaults(folderToken) {
  return {
    folder_token: folderToken || '0',
    doc_title: '简历数据备份',
    file_name: 'resume.json',
    domain: 'feishu.cn',
    fileUploadMode: 'versioned'
  };
}

async function probe(appId, appSecret) {
  if (!appId || !appSecret) throw new Error('缺少 App ID 或 App Secret');
  // 1) 验证凭证（换 token；失败即抛出飞书错误）
  const token = await req('POST', '/auth/v3/tenant_access_token/internal', { app_id: appId, app_secret: appSecret });
  const tk = token.tenant_access_token;
  if (!tk) throw new Error('换取 tenant_access_token 失败：响应缺少 tenant_access_token');
  // 2) 自动创建默认文件夹「简历数据」（根目录；已存在同名文件夹则复用——飞书允许重名，这里始终新建，
  //    若希望复用需额外 list 查询，首版保持「每次新建」，用户可手动改成已有 folder_token）
  const folder = await req('POST', '/drive/v1/files/create_folder', { name: '简历数据', folder_token: '' }, tk);
  const folderToken = folder && (folder.token || folder.folder_token);
  // 3) 回填默认项
  return buildProbeDefaults(folderToken);
}

/* ---------- 对外：上报 ---------- */
async function report(payload) {
  if (!enabled()) throw new Error('飞书未配置（缺少 sync.config.json 或 app_id / app_secret）');
  const jsonStr = JSON.stringify(payload, null, 2);
  if (isDryRun()) {
    return { dryRun: true, docUrl: '[dry-run] 飞书文档', fileUrl: '[dry-run] 云盘文件', size: jsonStr.length };
  }
  const auth = await getAuth();
  const resumeId = payload.id || 'default';
  const resumeName = payload.name || '';
  const [docId, fileToken] = await Promise.all([writeDoc(auth, jsonStr, resumeId, resumeName), writeFile(auth, jsonStr, resumeId, resumeName)]);
  return { docUrl: openUrl('doc', docId), fileUrl: openUrl('file', fileToken), size: jsonStr.length, authMode: auth.mode };
}

module.exports = { enabled, isDryRun, report, listVersions, getVersion, readConfig, writeConfig, probe, buildProbeDefaults, authStateKey, stateKeyFor, getAuth };
