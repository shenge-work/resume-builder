#!/usr/bin/env node
/* =============================================================
 * ai-proxy.js · AI 转发层（阶段 1 基建）
 * -------------------------------------------------------------
 * 浏览器不能直连模型厂商（CORS + 不许暴露 API Key），所有 AI 请求经本模块转发。
 *
 *   GET  /api/ai/status  → {configured, provider, baseURL, model, nodeVersion}
 *   POST /api/ai/test    → {ok, latencyMs, model}  或 {ok:false, error}
 *   POST /api/ai/chat    → SSE 透传上游 OpenAI 兼容 /chat/completions
 *
 * 配置文件：<root>/ai.config.json（gitignored，含 Key）
 *   {
 *     "provider": "deepseek",
 *     "baseURL":  "https://api.deepseek.com",
 *     "apiKey":   "sk-xxxx",
 *     "models":   { "fast": "deepseek-v4-flash", "strong": "deepseek-v4-pro" },
 *     "temperature": 0.4,
 *     "timeoutMs": 60000
 *   }
 *
 * 零依赖：只用 Node 内置 http/https/fs/path。fetch 与 Readable.fromWeb 需 Node 18+。
 * ============================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'ai.config.json');
const USAGE_FILE = path.join(ROOT, 'data', 'ai-usage.json');

/* ---------- 配置读取 ---------- */
function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const cfg = JSON.parse(raw);
    if (!cfg || typeof cfg !== 'object') return null;
    return cfg;
  } catch (e) {
    return null;
  }
}

function enabled() {
  const c = readConfig();
  return !!(c && c.apiKey && c.baseURL);
}

/* ---------- 用量累计（阶段 1：只记请求次数与首 token 延迟，不解析 token 数） ---------- */
function bumpUsage(extra) {
  try {
    fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
    let cur = { requests: 0, errors: 0, since: Date.now() };
    try { cur = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); } catch (e) {}
    cur.requests = (cur.requests || 0) + 1;
    if (extra && extra.error) cur.errors = (cur.errors || 0) + 1;
    cur.lastAt = Date.now();
    if (extra && extra.model) cur.lastModel = extra.model;
    fs.writeFileSync(USAGE_FILE, JSON.stringify(cur, null, 2) + '\n', 'utf8');
  } catch (e) { /* 用量写入失败不影响主流程 */ }
}

/* ---------- 上游请求 ---------- */
function buildUpstreamUrl(cfg) {
  const base = String(cfg.baseURL || '').replace(/\/+$/, '');
  return base + '/chat/completions';
}

async function callUpstream(cfg, body) {
  if (typeof fetch !== 'function') {
    const e = new Error('当前 Node 版本不支持全局 fetch，请升级到 Node 18+（当前 ' + process.version + '）');
    e.code = 'UNSUPPORTED_NODE';
    throw e;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(cfg.timeoutMs) || 60000);
  let upstream;
  try {
    upstream = await fetch(buildUpstreamUrl(cfg), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      const err = new Error('上游超时（' + ((cfg.timeoutMs || 60000) / 1000) + 's）');
      err.code = 'TIMEOUT';
      throw err;
    }
    throw e;
  }
  clearTimeout(timer);
  return upstream;
}

/* ---------- GET /api/ai/status ---------- */
function readUsage() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); }
  catch (e) { return { requests: 0, errors: 0, since: Date.now() }; }
}

function status() {
  const cfg = readConfig();
  if (!enabled()) {
    return {
      configured: false,
      hint: '缺少 ai.config.json 或 apiKey/baseURL 未填',
      nodeVersion: process.version
    };
  }
  const u = readUsage();
  return {
    configured: true,
    provider: cfg.provider || 'unknown',
    baseURL: cfg.baseURL,
    model: (cfg.models && cfg.models.fast) || 'default',
    models: cfg.models || {},
    temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 0.4,
    nodeVersion: process.version,
    usage: {
      requests: u.requests || 0,
      errors: u.errors || 0,
      lastAt: u.lastAt || null,
      lastModel: u.lastModel || null
    }
  };
}

/* ---------- POST /api/ai/test ---------- */
async function test() {
  const cfg = readConfig();
  if (!enabled()) return { ok: false, error: 'AI 未配置：请在 ai.config.json 填入 baseURL 与 apiKey' };
  const model = (cfg.models && cfg.models.fast) || 'default';
  const t0 = Date.now();
  try {
    const upstream = await callUpstream(cfg, {
      model: model,
      messages: [{ role: 'user', content: 'ping（用一个字回答）' }],
      max_tokens: 8,
      stream: false
    });
    const text = await upstream.text();
    const latencyMs = Date.now() - t0;
    if (!upstream.ok) {
      bumpUsage({ error: true, model });
      return { ok: false, status: upstream.status, error: text.slice(0, 300), latencyMs, model };
    }
    bumpUsage({ model });
    return { ok: true, latencyMs, model, sample: text.slice(0, 120) };
  } catch (e) {
    bumpUsage({ error: true, model });
    return { ok: false, error: e.message, latencyMs: Date.now() - t0, code: e.code || null };
  }
}

/* ---------- POST /api/ai/chat（SSE 透传） ---------- */
async function chat(req, res, body) {
  const cfg = readConfig();
  if (!enabled()) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'AI 未配置：请在 ai.config.json 填入 baseURL 与 apiKey' }));
  }
  const model = body.model || (cfg.models && cfg.models.fast) || 'default';
  const payload = {
    model: model,
    messages: body.messages || [],
    temperature: typeof body.temperature === 'number' ? body.temperature : (cfg.temperature != null ? cfg.temperature : 0.4),
    stream: true
  };
  if (body.response_format) payload.response_format = body.response_format;
  if (body.max_tokens) payload.max_tokens = body.max_tokens;

  let upstream;
  try {
    upstream = await callUpstream(cfg, payload);
  } catch (e) {
    bumpUsage({ error: true, model });
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: '上游请求失败：' + e.message, code: e.code || null }));
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    bumpUsage({ error: true, model });
    res.writeHead(upstream.status || 502, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: text.slice(0, 500) || '上游返回错误', status: upstream.status }));
  }

  bumpUsage({ model });
  res.writeHead(upstream.status || 200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // 前端断开 → 取消上游，避免空转
  req.on('close', () => {
    try { upstream.body.cancel(); } catch (e) {}
  });

  // Readable.fromWeb 把 web stream 转成 Node stream 并 pipe 到 res；逐 chunk 透传，零 buffer
  try {
    const { Readable } = require('stream');
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (e) {
    // Node < 18 没有 Readable.fromWeb
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '当前 Node 版本不支持流式转发（' + e.message + '），请升级到 Node 18+' }));
  }
}

module.exports = {
  readConfig, enabled, status, test, chat
};
