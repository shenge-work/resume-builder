#!/usr/bin/env node
/* =============================================================
 * 构建脚本：把多文件项目打包回「单文件 HTML」
 * -------------------------------------------------------------
 * 用法：  node tools/build-single.js
 * 输出：  dist/简历编辑器-单文件.html          （离线可用，可直接双击打开，git 忽略）
 *         ./简历编辑器-单文件.html              （同一份内容，自动同步到仓库根，方便直接下载/打开）
 *
 * 说明：日常开发改 css/ / js/ 下的文件，需要分发时再跑本脚本。
 *       不要直接手改产物，它每次都会被覆盖；根目录副本由本脚本自动同步，无需手动 cp。
 * ============================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT_FILE = path.join(DIST, '简历编辑器-单文件.html');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read('index.html');

/* 内联脚本中若出现 </script 会提前结束标签，必须转义 */
const safe = (code) => code.replace(/<\/script/gi, '<\\/script');
const inlineScript = (code, name) =>
  '\n<!-- ===== 内联：' + name + '（由 build-single.js 生成） ===== -->\n<script>' + safe(code) + '</script>\n';

/* 1) CSS 内联 */
const css = read('css/style.css');
const LINK = '<link rel="stylesheet" href="css/style.css">';
if (!html.includes(LINK)) { console.error('index.html 中未找到样式表引用：' + LINK); process.exit(1); }
html = html.replace(LINK, '<style>' + css + '</style>');

/* 2) JS 内联（顺序必须与 index.html 一致） */
const files = [
  ['vendor/html2canvas.min.js', 'html2canvas 1.4.1'],
  ['vendor/jspdf.umd.min.js', 'jsPDF 2.5.1'],
  ['js/data.js', 'js/data.js'],
  ['js/app.js', 'js/app.js']
];
for (const [file, name] of files) {
  const tag = '<script src="' + file + '"></script>';
  if (!html.includes(tag)) { console.error('index.html 中未找到脚本引用：' + tag); process.exit(1); }
  html = html.replace(tag, () => inlineScript(read(file), name));
}

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(OUT_FILE, html, 'utf8');

/* 同步仓库根的「可直接双击打开」副本：同一份 Buffer 写入两个路径，
   从根本上消除「改了 dist 却忘了 cp 根目录」导致两份不同步的隐患。 */
const ROOT_FILE = path.join(ROOT, '简历编辑器-单文件.html');
fs.writeFileSync(ROOT_FILE, html, 'utf8');

const crypto = require('crypto');
const md5of = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const identical = md5of(OUT_FILE) === md5of(ROOT_FILE);

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log('✓ 已生成单文件：dist/简历编辑器-单文件.html  (' + kb + ' KB)');
console.log('✓ 已同步根目录副本：简历编辑器-单文件.html  ' + (identical ? '（与 dist 字节一致 ✓）' : '（⚠ 不一致，请检查）'));
console.log('  剩余外部引用: ' + (html.match(/<script src=|<link rel="stylesheet"/g) || []).length + ' 个（应为 0）');
if (!identical) process.exit(1);
