/* App 导出落盘（原生分流）测试。
   背景：打包成 App 后 Blob + <a download> 不落盘（WKWebView bug 216918），
   改走 Rust save_file / print_page 命令（见 docs/App导出不落盘问题-根因与改造方案.md）。

   这里测两层契约（不碰真实 DOM / Rust）：
   1. native-bridge 挂载契约：当 __TAURI__.core.invoke 存在时，__RESUME_NATIVE__ 上必须有
      saveFile（弹保存对话框写盘）与 printPage（原生打印）两个桥方法，且 saveFile 会把
      字节正确 base64 编码后 invoke('save_file', {...})。
   2. 接线契约（源码级）：export-extra.js 的 saveBytes/saveText 必须复用 ResumeExport.downloadBlob
      统一落盘（而非各自 createObjectURL + <a download>），否则 Word/TXT/MD/静默 PDF 在 App 里仍不落盘；
      静默 PDF 的 fallback 必须优先走 __RESUME_NATIVE__.printPage（window.print() 在 WKWebView 是空操作）。 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* 在隔离 vm 沙箱里加载 native-bridge.js，桩一个会记录 invoke 调用的 __TAURI__。 */
function loadNativeBridge() {
  const calls = [];
  const sandbox = {
    console, JSON, Date, Math, Object, Array, String, Number, Boolean, Promise, Error, RegExp,
    setTimeout, clearTimeout, parseInt, parseFloat, isNaN, Uint8Array,
    TextEncoder: typeof TextEncoder !== 'undefined' ? TextEncoder : undefined,
    __TAURI__: {
      core: {
        invoke: (cmd, args) => { calls.push({ cmd, args }); return Promise.resolve({}); }
      }
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('js/store/native-bridge.js'), sandbox, { filename: 'native-bridge.js' });
  return { api: sandbox.__RESUME_NATIVE__, calls };
}

module.exports = [
  {
    name: '原生桥挂载 saveFile 与 printPage',
    fn: (ctx) => {
      const { api } = loadNativeBridge();
      ctx.assert(!!api, '检测到 __TAURI__ 时挂载 __RESUME_NATIVE__');
      ctx.assert(api && typeof api.saveFile === 'function', '挂载 saveFile');
      ctx.assert(api && typeof api.printPage === 'function', '挂载 printPage');
    }
  },
  {
    name: 'saveFile 将字节 base64 编码后调 invoke("save_file")',
    fn: (ctx) => {
      const { api, calls } = loadNativeBridge();
      const bytes = new Uint8Array([0xe4, 0xb8, 0xad]);  // UTF-8 的「中」
      return api.saveFile('简历.pdf', bytes).then(() => {
        const c = calls.find(x => x.cmd === 'save_file');
        ctx.assert(!!c, 'invoke 收到 save_file 命令');
        ctx.assert(c.args && c.args.fileName === '简历.pdf', 'fileName 透传');
        ctx.assert(c.args && c.args.bytesB64 === '5Lit', 'bytes 正确 base64 编码（中文安全，非 btoa）');
      });
    }
  },
  {
    name: 'printPage 调 invoke("print_page")',
    fn: (ctx) => {
      const { api, calls } = loadNativeBridge();
      return api.printPage().then(() => {
        ctx.assert(calls.some(x => x.cmd === 'print_page'), 'invoke 收到 print_page 命令');
      });
    }
  },
  {
    name: '接线：export-extra 的 saveBytes/saveText 复用 downloadBlob（非各自 <a download>）',
    fn: (ctx) => {
      const src = read('js/export-extra.js');
      // saveBytes 与 saveText 都必须在 downloadBlob 可用时改调它，而非直接 createObjectURL + a.click
      const reuses = /ResumeExport\.downloadBlob/.test(src);
      ctx.assert(reuses, 'export-extra 复用 ResumeExport.downloadBlob 统一落盘');
      // 浏览器回退路径仍在（原生不存在时），保证 npm start 零回归
      ctx.assert(/a\.download\s*=/.test(src), '浏览器回退 <a download> 仍保留');
    }
  },
  {
    name: '接线：静默 PDF fallback 优先走 printPage（WKWebView 里 window.print 是空操作）',
    fn: (ctx) => {
      const src = read('js/export-extra.js');
      ctx.assert(/printPage/.test(src), 'fallback 引用 printPage');
      ctx.assert(/N\.printPage\(\)/.test(src), '原生壳优先调 __RESUME_NATIVE__.printPage()');
    }
  },
  {
    name: '接线：export-pdf 的 downloadBlob 是唯一统一落盘入口并暴露给 app.js',
    fn: (ctx) => {
      const pdfSrc = read('js/export/export-pdf.js');
      ctx.assert(/function downloadBlob/.test(pdfSrc), 'export-pdf 定义 downloadBlob');
      ctx.assert(/downloadBlob: downloadBlob/.test(pdfSrc), 'downloadBlob 暴露到 ResumeExport');
      // downloadBlob 必须判断原生 saveFile，否则 App 内仍走 <a download> 不落盘
      ctx.assert(/__RESUME_NATIVE__/.test(pdfSrc) && /saveFile/.test(pdfSrc), 'downloadBlob 判断原生 saveFile');
      // 成功提示走 ResumeNotifier（RB.notify 不存在，走它会静默无反馈）
      ctx.assert(/ResumeNotifier/.test(pdfSrc), '保存成功提示走 ResumeNotifier（非 RB.notify）');
      ctx.assert(!/RB\.notify/.test(pdfSrc), '不再引用不存在的 RB.notify');
    }
  }
];
