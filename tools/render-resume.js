#!/usr/bin/env node
'use strict';
/* =============================================================
 * JSON 数据 → 独立简历 HTML（用项目真实的渲染管线「跑」出来）
 * -------------------------------------------------------------
 * 复用项目既有 vm 沙箱思路：加载 js/data.js + js/app.js，
 * 通过项目自己暴露的 ResumeEditor.applyImported(JSON) 走完
 * 「导入 → 迁移 → 渲染」真实流程，再取出 .resume 这一块，
 * 包进一个干净的 A4 单页 HTML，可直接浏览器打开 / 打印成 PDF。
 *
 * 纯 Node、零依赖（仅用内置 vm，不需要 jsdom）。
 * 用法：
 *   node tools/render-resume.js [输入JSON] [输出HTML]
 * ============================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const inJson = process.argv[2] || path.join(ROOT, 'dist', '示例_简历数据_迁移版.json');
const outHtml = process.argv[3] || path.join(ROOT, 'dist', '示例_简历_迁移版.html');

/* ---------- 极简 DOM / 浏览器 桩（与 test/run.js 同思路） ---------- */
function makeEl() {
  return {
    innerHTML: '', textContent: '', value: '', disabled: false, checked: false, style: {}, dataset: {}, files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, remove() {}, click() {}, focus() {},
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
    offsetWidth: 0, offsetHeight: 0, getContext() { return { drawImage() {} }; }, toDataURL() { return ''; },
  };
}

try {
  const payload = JSON.parse(fs.readFileSync(inJson, 'utf8'));
  if (!payload || !payload.data || !Array.isArray(payload.data.sections)) {
    throw new Error('JSON 缺少 data.sections，无法渲染');
  }

  const store = new Map();
  const alertCalls = [];
  const els = {}; // 按 id 持久化，便于事后读取 preview.innerHTML
  const ctx = {
    console, JSON, Date, Math, Object, Array, String, Number, Boolean,
    isNaN, parseInt, parseFloat, RegExp, Error, Promise, setTimeout, process,
    localStorage: {
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k, v) { store.set(k, String(v)); },
      removeItem(k) { store.delete(k); },
    },
    location: { reload() {} },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    Blob: function () {}, FileReader: function () {},
    html2canvas: undefined,
    addEventListener() {}, removeEventListener() {},
    alert: (m) => { alertCalls.push(m); },
    confirm: () => true, confirmReturn: true, alertCalls,
    document: {
      title: '', body: makeEl(), fonts: { ready: Promise.resolve() },
      getElementById(id) { return els[id] || (els[id] = makeEl()); },
      querySelector() { return null; }, querySelectorAll() { return []; },
      addEventListener() {}, createElement() { return makeEl(); }, createDocumentFragment() { return makeEl(); },
    },
    __results: [], __ok(n, c) { ctx.__results.push({ name: n, pass: !!c }); },
  };
  ctx.window = ctx;

  const dataCode = fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8');
  const appCode = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const cssCode = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');

  vm.createContext(ctx);
  vm.runInContext(dataCode + '\n' + appCode, ctx, { filename: 'resume-bundle.js' });
  if (!ctx.ResumeEditor || typeof ctx.ResumeEditor.applyImported !== 'function') {
    throw new Error('未能从 app.js 暴露 ResumeEditor.applyImported（封装接口异常）');
  }

  // 走项目真实的「导入」管线：规范化 + 迁移 + 重渲染
  ctx.ResumeEditor.applyImported(payload);

  // 取渲染结果：优先用真实 renderPreview 写入的 preview.innerHTML（已含字体 CSS 变量）
  let resumeHtml = (els['preview'] && els['preview'].innerHTML) || '';
  if (!/class="resume"/.test(resumeHtml)) {
    // 兜底：直接调用 renderResumeInner 拼接 .resume 外壳
    const varStr = Object.keys(payload.fonts || {}).map(k => `--font-${k}:${payload.fonts[k].val}px`).join(';') + ';';
    resumeHtml = `<div class="resume" style="${varStr}">${ctx.ResumeEditor.renderResumeInner()}</div>`;
  }

  if (!resumeHtml || resumeHtml.length < 50) {
    throw new Error('渲染输出为空，渲染管线可能异常');
  }

  /* ---------- 组装独立 A4 简历 HTML ---------- */
  // css/style.css 含 .app/.toolbar 等编辑区样式，本文件不含这些节点，故只需覆盖 body 的
  // height:100%/overflow:hidden 以免裁切，并把背景设为灰色、加一点外边距模拟编辑预览。
  const override = `
  html,body{height:auto;overflow:visible;background:#e9e9e9;}
  body{padding:22px 0;font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Source Han Sans SC",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1a1a1a;}
  .resume{margin:0 auto;}
  @media print{ body{background:#fff;padding:0;} .resume{box-shadow:none;} }
`;
  const title = (payload.data.name || '简历') + ' · 简历（迁移版）';
  const doc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
${cssCode}
${override}
</style>
</head>
<body>
${resumeHtml}
</body>
</html>
`;

  fs.mkdirSync(path.dirname(outHtml), { recursive: true });
  fs.writeFileSync(outHtml, doc, 'utf8');
  const size = (fs.statSync(outHtml).size / 1024).toFixed(1);
  console.log('✓ 已用 resume-builder 真实渲染管线生成独立简历 HTML');
  console.log('  输入  :', inJson);
  console.log('  输出  :', outHtml);
  console.log('  姓名  :', payload.data.name);
  console.log('  体积  :', size + ' KB');
  console.log('  提示  : 浏览器打开即可查看；Ctrl/Cmd+P 可「另存为 PDF」（文字可选中）。');
} catch (e) {
  console.error('✗ 渲染失败:', e.message);
  process.exit(1);
}
