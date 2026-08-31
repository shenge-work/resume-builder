#!/usr/bin/env node
'use strict';
/* =============================================================
 * 旧版单文件简历 HTML → 项目可导入 JSON
 * -------------------------------------------------------------
 * 旧版「简历编辑器」单文件 HTML 把简历内容内嵌在一个
 *   let data = { ... };
 * 的 JS 对象里。本工具把该对象提取出来，归一化为当前
 * resume-builder 的数据形态，并输出成与项目「导入数据」按钮
 * 完全兼容的 JSON（{ data, fonts, spacing, v }）。
 *
 * 纯 Node、零依赖。用法：
 *   node tools/migrate-legacy.js <旧版HTML路径> [输出JSON路径]
 * ============================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const oldPath = process.argv[2] || path.join(ROOT, '旧版单文件简历.html');
const outJson = process.argv[3] || path.join(ROOT, 'dist', '示例_简历数据_迁移版.json');

/* ---------- 1. 从旧 HTML 中精确提取 data 对象字面量（尊重字符串/嵌套括号） ---------- */
function extractDataLiteral(html) {
  const kw = html.match(/\b(?:let|var|const)\s+data\s*=/);
  if (!kw) throw new Error('未在旧文件中找到 "let data = / var data = / const data ="');
  const start = kw.index;
  let i = html.indexOf('{', start);
  if (i < 0) throw new Error('未找到数据对象起始 {');
  let depth = 0, inStr = false, strCh = '', esc = false;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (ch === '\\') { esc = true; }
      else if (ch === strCh) { inStr = false; }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        // 返回从 '{' 到匹配 '}' 的对象字面量文本
        return html.slice(html.indexOf('{', start), i + 1);
      }
    }
  }
  throw new Error('未匹配到数据对象结束 }');
}

/* ---------- 2. 读取当前项目的默认字体/间距（让 JSON 自包含、可一键导入） ---------- */
function readDefaults() {
  const dataCode = fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8');
  const dctx = { console };
  vm.createContext(dctx);
  vm.runInContext(dataCode + '\n; this.__f = defaultFonts; this.__s = defaultSpacing;', dctx, { filename: 'data.js' });
  return { fonts: dctx.__f, spacing: dctx.__s };
}

/* ---------- 3. 读取当前项目的 SAVE_VERSION（与导出格式一致） ---------- */
function readSaveVersion() {
  const appCode = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const m = appCode.match(/SAVE_VERSION\s*=\s*(\d+)/);
  return m ? Number(m[1]) : 6;
}

/* ---------- 4. 归一化：剔除旧版遗留的「逐字段间距标量」(*)Spacing，仅保留当前 schema 的 {spacing} 对象 ---------- */
const LEGACY_SPACING_KEYS = [
  'nameSpacing', 'subtitleSpacing', 'metaSpacing', 'contactSpacing',
  'companySpacing', 'roleSpacing', 'dateSpacing', 'summarySpacing',
  'logoSpacing', 'logoSizeSpacing', 'logoWidthSpacing', 'logoGapSpacing',
  'stackSpacing', 'descSpacing', 'nameSpacing'
];
function stripLegacySpacing(node) {
  if (Array.isArray(node)) { node.forEach(stripLegacySpacing); return; }
  if (node && typeof node === 'object') {
    for (const k of LEGACY_SPACING_KEYS) if (k in node) delete node[k];
    for (const key of Object.keys(node)) stripLegacySpacing(node[key]);
  }
}

/* ---------- 主流程 ---------- */
try {
  const html = fs.readFileSync(oldPath, 'utf8');
  const literal = extractDataLiteral(html);

  const sandbox = { console };
  vm.createContext(sandbox);
  let oldData;
  try {
    oldData = vm.runInContext('(' + literal + ')', sandbox, { filename: 'old-data.js' });
  } catch (e) {
    throw new Error('旧数据对象解析失败：' + (e && e.message ? e.message : e));
  }
  if (!oldData || !Array.isArray(oldData.sections)) {
    throw new Error('旧数据缺少 data.sections，结构异常');
  }

  // 去重：LEGACY_SPACING_KEYS 里手滑写了两次，先去重
  const uniq = Array.from(new Set(LEGACY_SPACING_KEYS));
  const realStrip = (node) => {
    if (Array.isArray(node)) { node.forEach(realStrip); return; }
    if (node && typeof node === 'object') {
      for (const k of uniq) if (k in node) delete node[k];
      for (const key of Object.keys(node)) realStrip(node[key]);
    }
  };
  realStrip(oldData);

  const { fonts, spacing } = readDefaults();
  const v = readSaveVersion();

  const payload = { data: oldData, fonts, spacing, v };

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2), 'utf8');

  const size = fs.statSync(outJson).size;
  console.log('✓ 已提取旧版内容并写出 JSON');
  console.log('  来源  :', oldPath);
  console.log('  输出  :', outJson);
  console.log('  姓名  :', oldData.name);
  console.log('  板块数:', oldData.sections.length, '→', oldData.sections.map(s => `${s.type}("${s.title}")`).join(', '));
  console.log('  体积  :', (size / 1024).toFixed(1) + ' KB', '(含公司 logo 等内嵌资源)');
  console.log('  提示  : 该 JSON 可直接在 resume-builder 编辑器中点击「导入数据」加载。');
} catch (e) {
  console.error('✗ 迁移失败:', e.message);
  process.exit(1);
}
