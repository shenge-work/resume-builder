/* 保存防抖性能 + 切换取消 pending 保存（跨简历污染防护）测试。
   与 cases-save-status.js 同构（CommonJS + ctx.assert + 可返回 Promise）。

   这一组针对两类「静默」缺陷：
   1. 性能债（第 1 层）：saveState 每敲一键都同步做全量 contentHash（O(整份简历)）。
      改造后哈希被推迟到 800ms 防抖窗口结束时才算一次 —— 连续 N 键从 N 次 O(简历) 降为 1 次。
      失效面：若哈希又退回「每键同步算」，连续 3 次 saveState 会同步调用 3 次 contentHash，
      本用例断言「防抖触发前 hash 调用次数为 0、防抖结束后为 1」会变红（变异测试可证伪）。
   2. 切换简历/载入新份时，pending 的防抖回调仍闭包着旧份的 payload（data/fonts/spacing 引用），
      若不清掉，会在 activeResumeId 切到新份后触发，把旧份数据写进新份文档（跨简历污染）。
      失效面：若 applyPayloadWithoutSave/switchResume 里漏掉 cancelPendingSave，
      「saveState 后立即 cancelPendingSave → 等待后 contentHash 与 ResumeStore.save 均不被调用」会变红。

   ⚠️ 必须自建隔离 vm 沙箱：桩 contentHash / ResumeStore.save 会改写模块级行为，
   在共享主上下文里做会污染其它用例（与存储降级用例同理）。 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ---------- 极简 DOM/浏览器桩（与 run.js 同款，足够让 app.js boot 不抛错） ---------- */
function makeEl() {
  return {
    innerHTML: '', textContent: '', value: '', disabled: false, checked: false,
    style: {}, dataset: {}, files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, removeChild() {}, remove() {}, click() {}, focus() {},
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
    offsetWidth: 0, offsetHeight: 0,
    getContext() { return { drawImage() {} }; }, toDataURL() { return ''; },
  };
}

/* 在完全隔离的 vm 沙箱里按真实 index.html 顺序加载最小依赖链，
   然后返回沙箱（供用例替换 contentHash / ResumeStore.save 计数）。 */
function makeSandbox() {
  const store = new Map();
  const sandbox = {
    console, JSON, Date, Math, Object, Array, String, Number, Boolean, Promise, Error, RegExp,
    setTimeout, clearTimeout, isNaN, parseInt, parseFloat,
    process,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
    location: { reload() {} },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    Blob: function () {}, FileReader: function () {},
    html2canvas: undefined,
    addEventListener() {}, removeEventListener() {},
    alert() {}, confirm() { return true; },
    print() {},
    fetch: () => Promise.reject(new Error('no network in test sandbox')),
    indexedDB: undefined,
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
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // 按 index.html 顺序加载（run.js 同序）：data → editor-schema → render → export-pdf → feishu-sync → pane-mobile → resume-store → app
  const order = [
    'js/data.js',
    'js/render/editor-schema.js',
    'js/render/resume-render.js',
    'js/export/export-pdf.js',
    'js/feishu/feishu-sync.js',
    'js/ui/pane-mobile.js',
    'js/store/resume-store.js',
    'js/app.js',
  ];
  let bundle = '';
  for (const p of order) {
    const code = read(p);
    if (!code) continue;
    bundle += code + '\n';
  }
  vm.runInContext(bundle, sandbox, { filename: 'resume-bundle-debounce.js' });
  return sandbox;
}

module.exports = [
  /* ---------- 1. 哈希防抖：连续 saveState 只在防抖结束算一次 contentHash ---------- */
  {
    name: '连续 saveState 只算一次 contentHash（防抖合并）',
    fn: async (ctx) => {
      const sb = makeSandbox();
      let hashCalls = 0;
      sb.ResumeFeishu.contentHash = function () { hashCalls++; return 'h_' + hashCalls; };
      let saveCalls = 0;
      sb.ResumeStore.save = function () { saveCalls++; return Promise.resolve(); };

      const saveState = sb.ResumeEditor.saveState;
      saveState(); saveState(); saveState();
      // 防抖窗口（800ms）内：不应同步算 hash、也不写盘
      ctx.assert(hashCalls === 0,
        '防抖窗口内连续 3 次 saveState 不同步算 hash（每键全量哈希已去除），实际 ' + hashCalls + ' 次');
      ctx.assert(saveCalls === 0, '防抖窗口内不写盘，实际 ' + saveCalls + ' 次');

      await new Promise((r) => setTimeout(r, 900));
      ctx.assert(hashCalls === 1,
        '防抖结束只算 1 次 contentHash（3 键合并为 1 次 O(简历) 哈希），实际 ' + hashCalls + ' 次');
      ctx.assert(saveCalls === 1, '防抖结束写盘 1 次，实际 ' + saveCalls + ' 次');
    },
  },
  /* ---------- 2. cancelPendingSave：切换/载入新份前取消 pending，不写旧份数据 ---------- */
  {
    name: 'cancelPendingSave 取消 pending 保存（不把旧份写进新份）',
    fn: async (ctx) => {
      const sb = makeSandbox();
      let hashCalls = 0;
      sb.ResumeFeishu.contentHash = function () { hashCalls++; return 'h'; };
      let saveCalls = 0;
      sb.ResumeStore.save = function () { saveCalls++; return Promise.resolve(); };

      sb.ResumeEditor.saveState();
      ctx.assert(hashCalls === 0, 'saveState 后立即 cancel 前，hash 尚未触发（防抖未结束）');

      sb.ResumeEditor.cancelPendingSave();
      await new Promise((r) => setTimeout(r, 900));
      ctx.assert(hashCalls === 0, 'cancelPendingSave 后防抖回调不再算 hash，实际 ' + hashCalls + ' 次');
      ctx.assert(saveCalls === 0, 'cancelPendingSave 后不写盘（旧份数据不会写进新份），实际 ' + saveCalls + ' 次');
    },
  },
  /* ---------- 3. 源码级接线：cancelPendingSave 已暴露 + 被切换/载入路径调用 ---------- */
  {
    name: 'cancelPendingSave 已暴露且被 applyPayloadWithoutSave / switchResume 调用',
    fn: (ctx) => {
      const appCode = read('js/app.js');
      ctx.assert(/cancelPendingSave: cancelPendingSave/.test(appCode),
        'app.js 暴露 cancelPendingSave（供测试/切换路径调用）');
      // 用 indexOf 切片取「函数定义 → 函数体结束的 }」之间内容，再检查是否含调用，
      // 避免固定字符间距 / 下一个顶层函数标记（可能落在 async function 上）的脆弱匹配。
      function bodyOf(sig) {
        const start = appCode.indexOf(sig);
        if (start === -1) return '';
        const braceOpen = appCode.indexOf('{', start);
        if (braceOpen === -1) return '';
        // 从开括号往后做花括号配平，找到函数体结束的 }
        let depth = 0;
        for (let i = braceOpen; i < appCode.length; i++) {
          if (appCode[i] === '{') depth++;
          else if (appCode[i] === '}') { depth--; if (depth === 0) return appCode.slice(start, i + 1); }
        }
        return appCode.slice(start);
      }
      const applyBody = bodyOf('function applyPayloadWithoutSave(obj){');
      ctx.assert(/cancelPendingSave\(\);/.test(applyBody),
        'applyPayloadWithoutSave 载入新份前调用 cancelPendingSave（防跨简历污染）');
      const switchBody = bodyOf('async function switchResume(id){');
      ctx.assert(/cancelPendingSave\(\);/.test(switchBody),
        'switchResume 在 await save 之前调用 cancelPendingSave');
    },
  },
];
