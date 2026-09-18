#!/usr/bin/env node
'use strict';
/*
 * verify-frontend-assets.js —— 前端资源完整性门禁（CI 用，零依赖）
 * -----------------------------------------------------------------------------
 * 为什么需要它：本项目是「无打包器 + <script> 顺序加载」的结构，新增一个 js 模块
 * 必须同时做两件事，漏掉任何一件都不会报错、而是**静默失效**：
 *   1. 在 index.html 里加 <script src="...">   —— 漏了 = 模块运行时不可达（死代码）
 *   2. 该文件在白名单构建脚本覆盖范围内      —— 漏了 = 安装包/桌面壳里没有这个文件
 * 另外还有一类历史问题：某些 HTML 可视化编辑器会给每个标签注入 data-page-node-id，
 * 污染仓库与产物。
 *
 * 本脚本做四类判定：
 *   [FAIL] index.html 引用的本地 js/css 在仓库中不存在
 *   [FAIL] 上述文件未出现在 dist-desktop/（说明桌面壳产物缺文件）
 *   [FAIL] dist-desktop/ 内出现受保护目录（data/ 隐私、node_modules/、target/ 等）
 *   [WARN] index.html 或 dist-desktop/index.html 仍残留注入属性
 *
 * 用法：node tools/verify-frontend-assets.js       （返回码 0=通过，1=失败）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DESKTOP = path.join(ROOT, 'dist-desktop');
const INDEX = path.join(ROOT, 'index.html');

/* dist-desktop/ 里绝不允许出现的目录（与 build-desktop-frontend.js 的 FORBIDDEN 保持一致） */
const FORBIDDEN = ['data', 'dist', 'node_modules', 'src-tauri', 'tools', 'docs', 'test', 'gen'];

const failures = [];
const warnings = [];

function fail(msg) { failures.push(msg); }
function warn(msg) { warnings.push(msg); }

/* ---------- 1. 抽出 index.html 引用的本地资源 ---------- */
function localRefs(html) {
  const refs = new Set();
  const patterns = [
    /<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi,
    /<link[^>]*\shref\s*=\s*["']([^"']+)["']/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const raw = m[1].trim();
      /* 只校验本地相对路径：跳过 http(s)、协议相对、data:、行内锚点 */
      if (/^(https?:)?\/\//i.test(raw) || /^(data|blob|mailto):/i.test(raw) || raw.startsWith('#')) continue;
      refs.add(raw.replace(/^\.\//, '').split('?')[0].split('#')[0]);
    }
  }
  return [...refs];
}

/* ---------- 2. 递归收集某目录下所有文件的相对路径 ---------- */
function walk(dir, base, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const rel = base ? base + '/' + ent.name : ent.name;
    if (ent.isDirectory()) walk(full, rel, acc);
    else acc.push(rel);
  }
  return acc;
}

function main() {
  if (!fs.existsSync(INDEX)) {
    fail('找不到 index.html');
    return report();
  }
  const html = fs.readFileSync(INDEX, 'utf8');
  const refs = localRefs(html);

  if (!refs.length) fail('index.html 里没有解析出任何本地 js/css 引用，解析逻辑可能已失效');

  /* 2a. 引用的文件在仓库中存在？ */
  for (const rel of refs) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      fail(`index.html 引用了不存在的文件：${rel}（模块漏创建或路径写错）`);
    }
  }

  /* 2b. 引用的文件都进了 dist-desktop/？ */
  if (!fs.existsSync(DESKTOP)) {
    fail('dist-desktop/ 不存在 —— 请先运行 npm run desktop:assets');
  } else {
    for (const rel of refs) {
      if (!fs.existsSync(path.join(DESKTOP, rel))) {
        fail(`dist-desktop/ 缺少 index.html 引用的文件：${rel}（白名单构建脚本漏拷）`);
      }
    }
  }

  /* 2c. 存在但「未被 index.html 引用」的 js 模块 —— 提示疑似死代码（不算失败） */
  const jsFiles = walk(path.join(ROOT, 'js'), 'js', []).filter((f) => f.endsWith('.js'));
  const referenced = new Set(refs);
  const orphans = jsFiles.filter((f) => !referenced.has(f));
  if (orphans.length) {
    warn(`js/ 下有未被 index.html 引用的模块（疑似运行时不可达）：${orphans.join('、')}`);
  }

  /* ---------- 3. 受保护目录不得进 dist-desktop/ ---------- */
  if (fs.existsSync(DESKTOP)) {
    for (const name of FORBIDDEN) {
      if (fs.existsSync(path.join(DESKTOP, name))) {
        fail(`dist-desktop/ 内出现受保护目录：${name}/（隐私或构建产物泄漏风险）`);
      }
    }
  }

  /* ---------- 4. 注入属性残留（告警，不阻塞） ---------- */
  const pollution = (p, label) => {
    if (!fs.existsSync(p)) return;
    const n = (fs.readFileSync(p, 'utf8').match(/data-page-node-id/g) || []).length;
    if (n) warn(`${label} 残留 ${n} 处 data-page-node-id 注入属性，请运行 npm run clean:html 清理`);
  };
  pollution(INDEX, 'index.html');
  pollution(path.join(DESKTOP, 'index.html'), 'dist-desktop/index.html');

  return report(refs.length);
}

function report(refCount) {
  if (warnings.length) {
    for (const w of warnings) console.log('  ⚠ ' + w);
  }
  if (failures.length) {
    for (const f of failures) console.log('  ✗ ' + f);
    console.log(`\n[verify-frontend-assets] 失败 ${failures.length} 项（警告 ${warnings.length} 项）`);
    process.exit(1);
  }
  console.log(`\n[verify-frontend-assets] 通过：校验 ${refCount || 0} 个本地引用，无缺失、无泄漏，警告 ${warnings.length} 项`);
}

main();
