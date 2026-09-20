#!/usr/bin/env node
/* 生成 macOS dmg（绕过两类环境限制）。
   背景：`npm run desktop:build`（tauri build）在两类环境下会在最后一步 dmg 打包失败：
   1. WorkBuddy 沙箱把 grep 换成 toybox，其 grep 无视 --color=never、强制输出 ANSI 颜色码，
      导致 create-dmg 的 find_mount_dir 正则解析崩坏（`brackets not balanced`）；
   2. headless/CI 环境无 Finder 自动化权限，create-dmg 的 osascript 报 -10004 权限违例。
   本脚本不复用 tauri build，而是：
     · 复用 tauri build 已产出的 `src-tauri/target/release/bundle/macos/<App>.app`；
     · 把 bundle_dmg.sh 里所有 `grep` 替换为 `/usr/bin/grep`（绕过 toybox）；
     · 追加 `--skip-jenkins`（跳过 Finder AppleScript，dmg 仍正常生成，仅无自定义背景/图标定位）。
   用法：node tools/build-dmg.js [--version <x.y.z>]
   产物：src-tauri/target/release/bundle/dmg/<App>_<version>_aarch64.dmg
   注意：需先成功跑过一次 `tauri build`（确保 .app 已产出）；本脚本只补 dmg 这一步。 */

'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BUNDLE = path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle');

// 读版本号（唯一权威：src-tauri/tauri.conf.json）
const tauriConf = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const version = process.argv.includes('--version')
  ? process.argv[process.argv.indexOf('--version') + 1]
  : tauriConf.version;
const appName = tauriConf.productName || tauriConf.package.productName || 'Resume Studio';

const appDir = path.join(BUNDLE, 'macos', appName + '.app');
const dmgDir = path.join(BUNDLE, 'dmg');
const dmgPath = path.join(dmgDir, `${appName}_${version}_aarch64.dmg`);
const scriptPath = path.join(dmgDir, 'bundle_dmg.sh');

if (!fs.existsSync(appDir)) {
  console.error('✗ 未找到 .app 产物：' + appDir);
  console.error('  请先运行 `npm run desktop:build`（tauri build 会产出 .app，dmg 一步可失败）。');
  process.exit(1);
}
if (!fs.existsSync(scriptPath)) {
  console.error('✗ 未找到 bundle_dmg.sh：' + scriptPath + '（tauri build 会自动生成它）。');
  process.exit(1);
}

// 1) 把脚本里所有 grep 替换为 /usr/bin/grep（绕过 toybox grep 的 ANSI 颜色输出）
let script = fs.readFileSync(scriptPath, 'utf8');
const patched = script.replace(/([^a-zA-Z\/])grep /g, '$1/usr/bin/grep ');
fs.writeFileSync(scriptPath, patched);

// 2) 清理残留挂载与临时 rw dmg + 已存在的目标 dmg（避免 convert 报「文件已存在」）
try { spawnSync('hdiutil', ['detach', '/Volumes/dmg.'], { stdio: 'ignore' }); } catch (e) {}
for (const f of fs.readdirSync(dmgDir)) {
  if (f.startsWith('rw.')) { try { fs.unlinkSync(path.join(dmgDir, f)); } catch (e) {} }
}
try { fs.unlinkSync(dmgPath); } catch (e) {}

// 3) 跑 bundle_dmg.sh（系统 grep + skip-jenkins）
console.log('生成 dmg：' + dmgPath);
const args = [
  '--skip-jenkins',
  '--volname', appName,
  '--icon', appName + '.app', '160', '220',
  '--app-drop-link', '400', '220',
  dmgPath,
  appDir,
];
const r = spawnSync('bash', [scriptPath, ...args], { stdio: 'inherit', env: Object.assign({}, process.env) });
if (r.status !== 0) {
  console.error('✗ dmg 打包失败（exit ' + r.status + '）。');
  process.exit(r.status || 1);
}
if (!fs.existsSync(dmgPath)) {
  console.error('✗ dmg 未生成：' + dmgPath);
  process.exit(1);
}
console.log('✓ dmg 已生成：' + dmgPath + '（' + (fs.statSync(dmgPath).size / 1024 / 1024).toFixed(2) + ' MB）');
console.log('  说明：--skip-jenkins 跳过了 Finder 美化（headless/CI 无自动化权限），dmg 功能完整、仅无自定义背景/图标定位。');
