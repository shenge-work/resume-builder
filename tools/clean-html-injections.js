#!/usr/bin/env node
'use strict';
/*
 * clean-html-injections.js —— 清理外部 HTML 编辑/预览工具注入的标记属性
 * -----------------------------------------------------------------------------
 * 背景：本机的 HTML 可视化编辑 / 预览工具（Electron 进程持有文件）会给 index.html
 *      的**每一个标签**注入 data-page-node-id="..." 唯一标识，且会**累加增长**
 *      （曾观测到一次 134 → 149 处、文件 16.6KB → 19.7KB）。
 *      该属性对运行无影响，但会污染仓库与提交历史，必须剥离。
 *
 * 用法：
 *   node tools/clean-html-injections.js                 # 清理 index.html 与 dist-desktop/index.html
 *   node tools/clean-html-injections.js <file> [file2]  # 清理指定文件
 *   npm run clean:html
 *
 * 同时被 tools/build-desktop-frontend.js 复用（复制 index.html 到构建产物时顺带净化），
 * 保证即使源文件被再次注入，**打包进安装包的 HTML 始终是干净的**。
 */
const fs = require('fs');
const path = require('path');

/** 注入的标记属性（保留项目自有的 data-panel / data-mv 等） */
const INJECTION_RE = /\sdata-page-node-id="[^"]*"/g;

/** 返回剥离注入属性后的 HTML */
function stripInjections(html) {
  return html.replace(INJECTION_RE, '');
}

/** 返回注入属性的出现次数 */
function countInjections(html) {
  return (html.match(/data-page-node-id=/g) || []).length;
}

function cleanFile(file) {
  const rel = path.relative(process.cwd(), file);
  const raw = fs.readFileSync(file, 'utf8');
  const n = countInjections(raw);
  if (!n) {
    console.log(`[clean:html] 干净，无需处理：${rel}`);
    return 0;
  }
  fs.writeFileSync(file, stripInjections(raw), 'utf8');
  console.log(`[clean:html] 已清理 ${n} 处注入属性：${rel}`);
  return n;
}

if (require.main === module) {
  const ROOT = path.resolve(__dirname, '..');
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const files = args.length
    ? args
    : [path.join(ROOT, 'index.html'), path.join(ROOT, 'dist-desktop', 'index.html')];

  let total = 0;
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.warn(`[clean:html] 跳过不存在的文件：${f}`);
      continue;
    }
    total += cleanFile(f);
  }
  console.log(`[clean:html] 完成，共清理 ${total} 处`);
}

module.exports = { stripInjections, countInjections };
