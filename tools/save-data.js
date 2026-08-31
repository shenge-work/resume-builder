#!/usr/bin/env node
/* 把浏览器「导出数据」得到的 JSON 落盘为仓库根目录 data/resume.json（可版本化的数据源）。
 *
 * 用法：
 *   node tools/save-data.js <导出的JSON路径> [--out <输出路径，默认仓库根 data/resume.json>]
 *
 * 校验：必须含 data.sections 数组；写出时统一为 {data, fonts, spacing, v} 四件套、
 *       2 空格缩进、末尾换行，与编辑器「导出数据」/「从仓库 data/resume.json 重载」完全互通。
 *
 * 注意：浏览器无法直写仓库文件，因此导出后的「回写仓库」必须借助本命令（或手动放置）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'data/resume.json');

function fail(msg){
  process.stderr.write('✗ ' + msg + '\n');
  process.exit(1);
}

const args = process.argv.slice(2);
let src = null;
let out = DEFAULT_OUT;
for(let i=0;i<args.length;i++){
  if(args[i] === '--out'){ out = path.resolve(args[++i] || fail('--out 需要一个路径')); }
  else if(!src){ src = args[i]; }
  else { fail('多余参数：' + args[i]); }
}
if(!src) fail('用法：node tools/save-data.js <导出的JSON路径> [--out <输出路径>]');

if(!fs.existsSync(src)) fail('源文件不存在：' + src);
let raw;
try{ raw = fs.readFileSync(src, 'utf8'); }catch(e){ fail('读取失败：' + e.message); }
let obj;
try{ obj = JSON.parse(raw); }catch(e){ fail('不是有效的 JSON：' + e.message); }

if(!obj || typeof obj !== 'object' || !obj.data || !Array.isArray(obj.data.sections)){
  fail('JSON 格式不正确（缺少 data.sections）');
}

// 只保留项目约定的四件套，避免混入无关字段
const payload = {
  data: obj.data,
  fonts: obj.fonts,
  spacing: obj.spacing,
  v: obj.v || 6
};

try{
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}catch(e){ fail('写入失败：' + e.message); }

const secCount = (obj.data.sections || []).length;
process.stdout.write(
  '✓ 已写入 ' + path.relative(ROOT, out) + '\n' +
  '  姓名：' + (obj.data.name || '(未填)') + '\n' +
  '  板块数：' + secCount + '\n' +
  '  含 fonts/spacing/v：' + (!!obj.fonts) + '/' + (!!obj.spacing) + '/' + (payload.v) + '\n' +
  '  下一步：git add data/resume.json && git commit -m "更新简历数据"\n'
);
