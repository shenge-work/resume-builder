#!/usr/bin/env node
'use strict';
/* 简历编辑器核心逻辑测试运行器。
   在隔离 vm 上下文里加载 js/data.js + js/app.js（二者为全局脚本、无模块导出），
   用 DOM/浏览器桩替代浏览器 API，再执行 test/cases.js 中的断言。纯 Node、零依赖。

   注意：js/app.js 已被 IIFE 封装，仅 window.ResumeEditor 暴露到全局。
   因此本运行器先加载 data+app，把 ResumeEditor 上的内部符号桥接到 vm 全局，
   再运行 cases（cases 以裸函数名调用，等价于浏览器中通过 window.ResumeEditor 调用）。 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* ---------- 极简 DOM / 浏览器 桩 ---------- */
function makeEl() {
  const el = {
    innerHTML: '', textContent: '', value: '', disabled: false, checked: false,
    style: {}, dataset: {},
    files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, removeChild() {}, remove() {}, click() {}, focus() {},
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
    offsetWidth: 0, offsetHeight: 0,
    getContext() { return { drawImage() {} }; }, toDataURL() { return ''; },
  };
  return el;
}

const store = new Map();
const alertCalls = [];
const ctx = {
  console, JSON, Date, Math, Object, Array, String, Number, Boolean,
  isNaN, parseInt, parseFloat, RegExp, Error, Promise, setTimeout, process,
  // 浏览器 API 桩
  localStorage: {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
  },
  location: { reload() {} },
  URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
  Blob: function () {},
  FileReader: function () {},
  html2canvas: undefined,
  addEventListener() {},
  removeEventListener() {},
  alert: (m) => { alertCalls.push(m); },
  confirmReturn: true,
  confirm: () => ctx.confirmReturn,
  alertCalls: alertCalls,
  document: {
    title: '',
    body: makeEl(),
    fonts: { ready: Promise.resolve() },
    getElementById() { return makeEl(); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement() { return makeEl(); },
    createDocumentFragment() { return makeEl(); },
  },
  // 断言上报通道
  __results: [],
  __ok(name, cond) { ctx.__results.push({ name, pass: !!cond }); },
};
ctx.window = ctx; // 自引用，模拟全局

/* ---------- 加载源码 ---------- */
const dataCode = fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8');
const appCode = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const caseCode = fs.readFileSync(path.join(ROOT, 'test', 'cases.js'), 'utf8');
const cssCode = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const htmlCode = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

vm.createContext(ctx);

/* 文件级结果收集 */
const fileResults = [];
const F = (name, cond) => fileResults.push({ name, pass: !!cond });

/* ---------- 第一步：加载 data + app（app 内部为 IIFE，仅挂 window.ResumeEditor）---------- */
try {
  vm.runInContext(dataCode + '\n' + appCode, ctx, { filename: 'resume-bundle.js' });
} catch (e) {
  fileResults.push({ name: '加载期异常: ' + (e && e.message ? e.message : e), pass: false });
}

/* ---------- 封装回归断言（必须在桥接前检查“未泄漏”）---------- */
F('封装生效：内部函数未泄漏到全局（blankSection）', typeof ctx.blankSection === 'undefined');
F('封装生效：仅 window.ResumeEditor 暴露 API', !!(ctx.ResumeEditor && typeof ctx.ResumeEditor.blankSection === 'function'));
F('封装生效：HTML 入口函数已暴露（toggleGuides）', !!(ctx.ResumeEditor && typeof ctx.ResumeEditor.toggleGuides === 'function'));

/* ---------- 桥接：把 ResumeEditor 上的内部符号映射到 vm 全局，供 cases 裸名调用 ---------- */
if (ctx.ResumeEditor) Object.assign(ctx, ctx.ResumeEditor);

/* ---------- 第二步：运行用例 ---------- */
try {
  vm.runInContext(caseCode, ctx, { filename: 'cases.js' });
} catch (e) {
  fileResults.push({ name: '运行期异常: ' + (e && e.message ? e.message : e), pass: false });
}

/* ---------- 文件级冒烟断言（打印样式 / 入口接线，不依赖浏览器）---------- */
F('打印样式存在 @media print', /@media\s+print/.test(cssCode));
F('打印时隐藏编辑区与工具栏', /@media\s+print[\s\S]*?\.toolbar,\.editor-pane[^;]*display\s*:\s*none/.test(cssCode));
F('打印条目分页保护 break-inside:avoid', /break-inside\s*:\s*avoid/.test(cssCode));
F('打印纸张为 A4', /@page\{[^}]*size\s*:\s*A4/.test(cssCode));
F('工具栏含 PDF 预览按钮', /ResumeEditor\.exportPDF\(\)/.test(htmlCode));
F('工具栏含导出图片版按钮', /ResumeEditor\.exportLongImage\(\)/.test(htmlCode));
F('工具栏含导出单文件 HTML 按钮', /ResumeEditor\.exportSingleFileHTML\(\)/.test(htmlCode));
F('工具栏含文件名输入框', /id="filenameBase"/.test(htmlCode));
F('导出预览弹层存在（exportModal）', /id="exportModal"/.test(htmlCode));
F('导出预览弹层含下载按钮 closeExportModal', /ResumeEditor\.closeExportModal\(\)/.test(htmlCode));
F('图片版导出按钮标注为「导出（图片版）"', /导出（图片版）/.test(htmlCode));
F('入口已接入 ResumeEditor 命名空间（toggleGuides）', /onclick="ResumeEditor\.toggleGuides\(\)"/.test(htmlCode));
F('入口已接入 ResumeEditor 命名空间（exportPDF）', /onclick="ResumeEditor\.exportPDF\(\)"/.test(htmlCode));

/* ---------- 报告 ---------- */
const all = ctx.__results.concat(fileResults);
let pass = 0, fail = 0;
for (const r of all) {
  if (r.pass) { pass++; console.log('  ✓ ' + r.name); }
  else { fail++; console.log('  ✗ ' + r.name); }
}
console.log('\n结果: pass=' + pass + ' fail=' + fail + ' total=' + all.length);
process.exit(fail > 0 ? 1 : 0);
