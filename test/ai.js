#!/usr/bin/env node
'use strict';
/* AI 纯逻辑测试：presets 表 + SSE 解析器。
   不依赖网络、不依赖 DOM，用 vm 跑 IIFE，注入假 window。
   跑法：node test/ai.js */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const results = [];
function ok(name, cond) { results.push({ name, pass: !!cond }); }

function loadIIFE(file) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const sandbox = { window: {}, localStorage: { getItem() { return null; }, setItem() {} } };
  sandbox.window = sandbox; // IIFE 传 window，内部 global 即 sandbox
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  return sandbox;
}

/* ---------- presets ---------- */
(function testPresets() {
  const s = loadIIFE('js/ai/presets.js');
  const P = s.ResumeAIPresets;
  ok('presets.list 返回数组', Array.isArray(P.list()) && P.list().length >= 3);
  const d = P.get('deepseek');
  ok('deepseek 预设存在', !!d);
  ok('deepseek 有 baseURL', d && /^https:/.test(d.baseURL));
  ok('deepseek 有 fast 模型', d && typeof d.models.fast === 'string' && d.models.fast.length > 0);
  ok('get(unknown) 返回 null', P.get('__not_exist__') === null);
})();

/* ---------- SSE 解析 ---------- */
(function testSSE() {
  const s = loadIIFE('js/ai/provider.js');
  const parse = s.ResumeAI.parseSSEBuffer;

  // 单条 delta
  let r = parse('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n');
  ok('SSE 单 delta', r.deltas.length === 1 && r.deltas[0] === '你好' && r.done === false);

  // [DONE]
  r = parse('data: [DONE]\n\n');
  ok('SSE [DONE]', r.done === true && r.deltas.length === 0);

  // 不完整行 → 留 remaining
  r = parse('data: {"choices":[{"delta":{"content":"你');
  ok('SSE 不完整行留 remaining', r.deltas.length === 0 && r.remaining.indexOf('你') >= 0);

  // 拼上后续 → 解出
  r = parse(r.remaining + '好"}}]}\n\n');
  ok('SSE 跨 chunk 拼接', r.deltas.length === 1 && r.deltas[0] === '你好');

  // 注释行忽略
  r = parse(': ping\n\ndata: {"choices":[{"delta":{"content":"x"}}]}\n\n');
  ok('SSE 注释行忽略', r.deltas.length === 1 && r.deltas[0] === 'x');

  // 多个 delta 在同一 buffer
  r = parse(
    'data: {"choices":[{"delta":{"content":"甲"}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"乙"}}]}\n\n'
  );
  ok('SSE 多 delta 按序', r.deltas.join('') === '甲乙');

  // 空 buffer
  r = parse('');
  ok('SSE 空 buffer', r.deltas.length === 0 && r.done === false && r.error === null);

  // error 字段
  r = parse('data: {"error":{"message":"bad key"}}\n\n');
  ok('SSE error 提取', r.error === 'bad key');
})();

/* ---------- 报告 ---------- */
let fail = 0;
for (const r of results) {
  console.log((r.pass ? '  ✓ ' : '  ✗ ') + r.name);
  if (!r.pass) fail++;
}
console.log('\n结果: pass=' + (results.length - fail) + ' fail=' + fail + ' total=' + results.length);
process.exit(fail ? 1 : 0);
