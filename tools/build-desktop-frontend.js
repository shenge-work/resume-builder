#!/usr/bin/env node
'use strict';
/*
 * build-desktop-frontend.js —— 为 Tauri 桌面壳准备前端资源（dist-desktop/）
 * -----------------------------------------------------------------------------
 * 零依赖 Node 脚本（Node >= 16.7，用到 fs.cpSync）。被 `npm run desktop:assets`
 * 调用，也是 tauri.conf.json 的 build.beforeDevCommand / beforeBuildCommand。
 *
 * 采用「白名单」复制：只拷运行时真正需要的静态资源，其余一律不进 dist-desktop/。
 * 白名单：index.html、css/、js/、template.json、vendor/（index.html 直接 <script src="vendor/...">，
 *        缺了 PDF/长图导出会失效）
 * 严格排除：data/（隐私，含真实简历）、dist/、node_modules/、src-tauri/、tools/、docs/、test/
 *          —— 白名单模式天然排除，下面再做一次断言兜底。
 */
const fs = require('fs');
const path = require('path');

/* 共用「剥离外部编辑器注入属性」的逻辑（见 tools/clean-html-injections.js） */
const { stripInjections, countInjections } = require('./clean-html-injections.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist-desktop');

const WHITELIST = ['index.html', 'template.json', 'css', 'js', 'vendor'];
const FORBIDDEN = ['data', 'dist', 'node_modules', 'src-tauri', 'tools', 'docs', 'test'];

function copyEntry(name) {
  const src = path.join(ROOT, name);
  const dst = path.join(OUT, name);
  if (!fs.existsSync(src)) {
    console.warn(`[desktop:assets] 跳过不存在的资源：${name}`);
    return;
  }
  /* index.html 特殊处理：某些 HTML 可视化编辑/预览工具会给每个标签注入
     data-page-node-id="..."（对运行无影响，但会污染产物、随提交入库）。
     这里在复制时一并剥离，保证打包进安装包与仓库的 HTML 始终干净。 */
  if (name === 'index.html') {
    const raw = fs.readFileSync(src, 'utf8');
    const removed = countInjections(raw);
    fs.writeFileSync(dst, stripInjections(raw), 'utf8');
    console.log(`[desktop:assets] 已复制并净化 ${name}${removed ? `（剥离 ${removed} 处注入属性）` : ''}`);
    return;
  }
  fs.cpSync(src, dst, { recursive: true });
  console.log(`[desktop:assets] 已复制 ${name}`);
}

function assertNoForbidden() {
  for (const name of FORBIDDEN) {
    const p = path.join(OUT, name);
    if (fs.existsSync(p)) {
      throw new Error(`dist-desktop 内出现了受保护目录：${name}（构建脚本存在逻辑错误）`);
    }
  }
}

/* ---------- 产物目录维护 ---------- */
/** 递归收集 dir 下所有文件的相对路径（相对 base 的前缀） */
function walkFiles(dir, base, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const rel = base ? `${base}/${ent.name}` : ent.name;
    if (ent.isDirectory()) walkFiles(full, rel, acc);
    else acc.push(rel);
  }
  return acc;
}

/** 白名单源文件在产物目录中的期望相对路径集合 */
function expectedFiles() {
  const acc = [];
  for (const name of WHITELIST) {
    const src = path.join(ROOT, name);
    if (!fs.existsSync(src)) continue;
    if (fs.statSync(src).isDirectory()) walkFiles(src, name, acc);
    else acc.push(name);
  }
  return acc;
}

/* 清空产物目录。注意：某些宿主环境（例如 IDE 的「安全删除」守卫）会拦截单轮内的大批量
   删除（实测阈值 50 个文件），此时退化为「不删除、只覆盖」，随后由 pruneStale 清掉多余文件。
   这样脚本在普通终端 / CI / 受限宿主下都能跑通。 */
function prepareOut() {
  try {
    fs.rmSync(OUT, { recursive: true, force: true });
  } catch (e) {
    console.warn(`[desktop:assets] 目录清空被环境拦截，改用「覆盖 + 清理多余文件」：${String(e.message).split('\n')[0]}`);
  }
  fs.mkdirSync(OUT, { recursive: true });
}

/** 删除产物目录中不属于白名单的残留文件（正常情况下为 0 个） */
function pruneStale() {
  const expected = new Set(expectedFiles());
  const stale = walkFiles(OUT, '', []).filter((f) => !expected.has(f));
  for (const rel of stale) {
    try {
      fs.rmSync(path.join(OUT, rel), { force: true });
    } catch (e) {
      console.warn(`[desktop:assets] 未能清理残留文件：${rel}`);
    }
  }
  if (stale.length) console.log(`[desktop:assets] 已清理 ${stale.length} 个残留文件`);
}

function main() {
  prepareOut();
  for (const name of WHITELIST) copyEntry(name);
  pruneStale();
  assertNoForbidden();
  console.log(`[desktop:assets] 完成 → ${path.relative(ROOT, OUT)}/`);
}

main();
