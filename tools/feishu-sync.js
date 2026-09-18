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
  return `https://${domain}/drive/home/${id}`;
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
async function fapi(method, p, body) {
  const t = await getToken();
  return req(method, p, body, t);
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
async function fpostMultipart(p, fields, fileBuf) {
  const t = await getToken();
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
async function ensureDoc() {
  const st = readState();
  if (st.document_id) return st.document_id;
  const c = readConfig();
  const d = await fapi('POST', '/docx/v1/documents', { title: c.doc_title || '简历数据备份' });
  const id = d.document.document_id;
  writeState({ document_id: id });
  return id;
}
async function writeDoc(jsonStr) {
  const docId = await ensureDoc();
  const list = await fapi('GET', `/docx/v1/documents/${docId}/blocks/${docId}/children?page_size=50`);
  const items = (list && list.items) || [];
  for (const it of items) {
    try { await fapi('DELETE', `/docx/v1/documents/${docId}/blocks/${it.block_id}`); } catch (e) { /* 忽略个别删除失败 */ }
  }
  await fapi('POST', `/docx/v1/documents/${docId}/blocks/${docId}/children`, {
    children: [{
      block_type: 13,
      code: {
        elements: [{ type: 'text_run', text_run: { content: jsonStr, text_elements: [] } }],
        style: { language: 1, align: 1 }
      }
    }]
  });
  return docId;
}

/* ---------- 云盘文件 resume.json（带版本历史） ---------- */
async function writeFile(jsonStr) {
  const c = readConfig();
  const buf = Buffer.from(jsonStr, 'utf8');
  const mode = c.fileUploadMode || 'versioned';
  let fileToken;
  if (mode === 'new') {
    // 每次新建文件（简单，但同一文件不再累积版本历史；docx 仍保留版本）
    const d = await fpostMultipart('/drive/v1/files/upload_all', {
      file_name: c.file_name || 'resume.json',
      parent_folder_token: c.folder_token || '0'
    }, buf);
    fileToken = d.file_token;
    writeState({ file_token: fileToken });
  } else {
    // 版本化上传：首次不带 file_token 即创建，之后带 file_token 即在同文件上新开版本
    const st = readState();
    const prepare = await fapi('POST', '/drive/v1/files/upload_prepare', {
      file_name: c.file_name || 'resume.json',
      parent_folder_token: c.folder_token || '0',
      size: buf.length,
      file_token: st.file_token || undefined
    });
    const uploadId = prepare.upload_id;
    await fpostMultipart('/drive/v1/files/upload_part', { upload_id: uploadId, block_index: 0 }, buf);
    const fin = await fapi('POST', '/drive/v1/files/upload_finish', { upload_id: uploadId, block_num: prepare.block_num || 1 });
    fileToken = fin.file_token;
    writeState({ file_token: fileToken });
  }
  return fileToken;
}

/* ---------- 版本列表 / 恢复 ---------- */
async function listVersions() {
  const st = readState();
  if (!st.file_token) return [];
  const d = await fapi('GET', `/drive/v1/files/${st.file_token}/versions`);
  return (d && d.items) || [];
}
async function getVersion(versionId) {
  const st = readState();
  if (!st.file_token) throw new Error('尚未上报过，飞书中没有可用版本');
  const t = await getToken();
  return reqRaw(`/drive/v1/files/${st.file_token}/versions/${versionId}/download`, t);
}

/* ---------- 对外：上报 ---------- */
async function report(payload) {
  if (!enabled()) throw new Error('飞书未配置（缺少 sync.config.json 或 app_id / app_secret）');
  const jsonStr = JSON.stringify(payload, null, 2);
  if (isDryRun()) {
    return { dryRun: true, docUrl: '[dry-run] 飞书文档', fileUrl: '[dry-run] 云盘文件', size: jsonStr.length };
  }
  const [docId, fileToken] = await Promise.all([writeDoc(jsonStr), writeFile(jsonStr)]);
  return { docUrl: openUrl('doc', docId), fileUrl: openUrl('file', fileToken), size: jsonStr.length };
}

module.exports = { enabled, isDryRun, report, listVersions, getVersion, readConfig, writeConfig };
