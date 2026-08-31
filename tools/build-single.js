#!/usr/bin/env node
/* =============================================================
 * 构建脚本：把多文件项目打包回「单文件 HTML」
 * -------------------------------------------------------------
 * 用法：  node tools/build-single.js
 * 输出：  dist/简历编辑器-单文件.html  （离线可用，可直接双击打开；git 忽略）
 *
 * 说明：日常开发改 css/ / js/ 下的文件，需要分发时再跑本脚本。
 *       产物仅生成在 dist/（已在 .gitignore 中忽略），不再在仓库根放副本，
 *       从根本上消除「根目录 / dist 两份不同步」的隐患。不要直接手改产物，它每次都会被覆盖。
 * ============================================================= */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  ['js/app.js', 'js/app.js']
];
for (const [file, name] of files) {
  const tag = '<script src="' + file + '"></script>';
  if (!html.includes(tag)) { console.error('index.html 中未找到脚本引用：' + tag); process.exit(1); }
  html = html.replace(tag, () => inlineScript(read(file), name));
}

/* 3) data.js 特殊处理：把公开示范数据 template.json 注入 DEMO_DATA 钩子，
      使双击打开的单文件版无需服务器也能看到完整示范简历（file:// 下 fetch 不可用）。 */
{
  const dataTag = '<script src="js/data.js"></script>';
  if (!html.includes(dataTag)) { console.error('index.html 中未找到脚本引用：' + dataTag); process.exit(1); }
  let dataSrc = read('js/data.js');
  const templatePath = path.join(ROOT, 'template.json');
  if (!fs.existsSync(templatePath)) { console.error('未找到 template.json，无法注入示范数据'); process.exit(1); }
  const tmpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  const demoLiteral = JSON.stringify(tmpl.data || {});
  if (!dataSrc.includes('DEMO_DATA = null')) { console.error('js/data.js 中未找到 DEMO_DATA 钩子，无法注入示范数据'); process.exit(1); }
  dataSrc = dataSrc.replace('DEMO_DATA = null', 'DEMO_DATA = ' + demoLiteral);
  html = html.replace(dataTag, () => inlineScript(dataSrc, 'js/data.js（已注入 template.json 示范数据）'));
  console.log('✓ 已将 template.json 注入单文件版 data.js（离线演示可用）');
}

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(OUT_FILE, html, 'utf8');

/* 仅校验产物本身已正确写入 dist（不再比较根目录副本） */
const md5 = crypto.createHash('md5').update(fs.readFileSync(OUT_FILE)).digest('hex');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log('✓ 已生成单文件：dist/简历编辑器-单文件.html  (' + kb + ' KB)');
console.log('  md5  :', md5);
console.log('  剩余外部引用: ' + (html.match(/<script src=|<link rel="stylesheet"/g) || []).length + ' 个（应为 0）');
