#!/usr/bin/env node
/**
 * 简历编辑器 · 本地写服务（零依赖）
 *
 * 纯前端浏览器无法向磁盘写文件，因此「实时保存回 data/resume.json」需要一个能接收
 * 写入请求的本地服务。本文件既是静态文件服务器，又暴露一个写接口：
 *
 *   GET  /                       → index.html（编辑器）
 *   GET  /<任意静态资源>          → 项目内文件（含 data/resume.json）
 *   POST /api/resume             → 把请求体 JSON 落盘为 data/resume.json（实时保存）
 *
 * 启动：node tools/serve.js   或   npm start   （默认端口 8000，可用 PORT 环境变量覆盖）
 *
 * 注意：data/ 已被 .gitignore 忽略，所以写回的 resume.json 是「本机私有、不进公开仓库」的。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 8000;
const DATA_FILE = path.join(ROOT, 'data', 'resume.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  if (Buffer.isBuffer(body) || typeof body === 'string') res.end(body);
  else res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(u.pathname);

  // —— 写接口：把当前编辑器数据落盘为 data/resume.json ——
  if (req.method === 'POST' && pathname === '/api/resume') {
    let buf = '';
    req.on('data', (c) => {
      buf += c;
      if (buf.length > 20 * 1024 * 1024) { req.destroy(); } // 体积兜底，防止恶意超大请求
    });
    req.on('end', () => {
      let obj;
      try { obj = JSON.parse(buf); }
      catch (e) { return send(res, 400, { error: 'JSON 解析失败: ' + e.message }); }
      if (!obj || !obj.data || !Array.isArray(obj.data.sections)) {
        return send(res, 400, { error: '格式不正确（缺少 data.sections）' });
      }
      try {
        fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2) + '\n', 'utf8');
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 500, { error: '写入失败: ' + e.message });
      }
    });
    return;
  }

  // —— 静态文件（GET / HEAD）——
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { error: 'Method Not Allowed' });
  }
  const rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(ROOT, rel));
  // 路径穿越防护：解析后的绝对路径必须仍在 ROOT 之内
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    return send(res, 403, { error: 'Forbidden' });
  }
  fs.readFile(filePath, (err, content) => {
    if (err) return send(res, 404, { error: 'Not Found' });
    const ext = path.extname(filePath).toLowerCase();
    if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }); return res.end(); }
    send(res, 200, content, MIME[ext] || 'application/octet-stream');
  });
});

server.listen(PORT, () => {
  console.log('简历编辑器已启动 → http://localhost:' + PORT);
  console.log('· 编辑器内的每次编辑会自动写回 data/resume.json（实时保存，刷新不丢）');
  console.log('· 若用 file:// 或 python -m http.server 打开，浏览器无法写回，编辑仅存本浏览器本地');
});
