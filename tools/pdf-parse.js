#!/usr/bin/env node
'use strict';
/*
 * pdf-parse.js —— PDF 简历 → 结构化文本 / 尽力结构化简历数据（零系统依赖）
 * -----------------------------------------------------------------------------
 * 用 vendored 的 pdf.js（vendor/pdfjs.min.js，Apache 2.0，本地存放离线可用）在
 * Node 侧提取 PDF 文本，再尽力映射为项目简历的数据模型（{data,fonts,spacing,v}）。
 *
 * 为什么放服务端而不是浏览器：pdf.js 体积 ~377KB，且浏览器里还需 worker / 跨域处理；
 * 本地 serve.js 一次性加载、复用，浏览器只上传文件字节、接收解析结果。
 *
 * 关键约束（诚实原则，呼应项目「AI 永不直接落笔」的审阅哲学）：
 *   纯文本提取**无法**可靠还原简历的精确字段结构（哪段是公司、哪段是职责），
 *   所以这里只做「尽力识别 + 原文保留」：
 *     1) 姓名 —— 取首行（多数简历姓名在最顶部）
 *     2) 联系方式 —— 用邮箱 / 手机号正则从全文抓取
 *     3) 其余内容 —— 全部保留进一个「导入原文」板块，供用户在编辑器里校对/重组
 *   绝不臆造结构（不编造字段、不丢内容），宁可「少结构、多原文」。
 *
 * 导出：
 *   extractText(buffer)  → { text, lines, pageCount, meta }
 *   buildResumeData(pdf) → { data, fonts, spacing, v }（可直接进编辑器）
 */
const fs = require('fs');
const path = require('path');

const PDFJS_PATH = path.join(__dirname, '..', 'vendor', 'pdf.min.js');

/* 惰性加载 pdf.js：只在真正解析时才 require，避免「没装/没 vendor」时模块加载就崩 */
let _pdfjs = null;
function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  if (!fs.existsSync(PDFJS_PATH)) {
    throw new Error('缺少 vendor/pdfjs.min.js（PDF 解析依赖），请确认文件存在');
  }
  // pdf.js legacy build 是 UMD，CommonJS 下可直接 require
  _pdfjs = require(PDFJS_PATH);
  return _pdfjs;
}

/* ============ 文本提取 ============ */
/* 逐页 getTextContent → 收集 text item。pdf.js 的 item.str 是片段，需按换行合理拼接。
   这里用「行」聚合：item 携带 transform（y 坐标）与 hasEOL 标记，按 y 分行。 */
async function extractText(buffer) {
  const pdfjs = getPdfjs();
  // pdf.js 要求 Uint8Array（Buffer 虽是其子类，但内部 instanceof 判定会拒绝 Buffer，
  // 必须显式构造一个真正的 Uint8Array —— 拷贝一份即可，简历 PDF 体量小）
  const data = (buffer instanceof Uint8Array && !Buffer.isBuffer(buffer))
    ? buffer
    : new Uint8Array(buffer);
  // disableWorker：Node 下单线程跑（简历 PDF 体量小），避免 worker 路径的额外复杂度；
  // isEvalSupported=false 规避 Node 无 eval 的告警。
  const doc = await pdfjs.getDocument({
    data: data,
    disableWorker: true,
    isEvalSupported: false,
    verbosity: 0
  }).promise;

  const pageCount = doc.numPages;
  const pages = [];       // 每页的「行」数组
  let fullLines = [];

  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const lines = [];
    let cur = '';
    let lastY = null;
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      const y = (it.transform && it.transform[5]) || null;
      // 同一行（y 接近）累积；遇到换行标记或 y 明显变化则断行
      if (lastY === null || Math.abs((y || 0) - lastY) < 2) {
        cur += it.str;
      } else {
        if (cur.trim()) lines.push(cur.trim());
        cur = it.str;
      }
      if (it.hasEOL) { if (cur.trim()) lines.push(cur.trim()); cur = ''; lastY = null; continue; }
      lastY = y;
    }
    if (cur.trim()) lines.push(cur.trim());
    pages.push(lines);
    fullLines = fullLines.concat(lines);
  }

  const text = fullLines.join('\n');
  const meta = null; // pdf.js legacy 的 getMetadata 在部分环境需额外能力，暂不取
  return { text, lines: fullLines, pages, pageCount, meta };
}

/* ============ 字段识别（尽力而为，不臆造） ============ */
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE_RE = /(?:\+?86[-\s]?)?1[3-9]\d{9}/;
const PHONE_SEP_RE = /(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}/;

/* 从全文抓联系方式：邮箱 / 手机号 / 学历线索（去重、保序） */
function extractContact(lines) {
  const found = [];
  const push = (v) => { if (v && found.indexOf(v) < 0) found.push(v); };
  for (const ln of lines) {
    const em = ln.match(EMAIL_RE);
    if (em) push(em[0]);
    const ph = ln.match(PHONE_SEP_RE) || ln.match(PHONE_RE);
    if (ph) push(ph[0]);
    // 学历 / 学校线索（含「大学/学院/本科/硕士/博士」）
    if (/大学|学院|本科|硕士|博士|统招|全日制|届/.test(ln)) push(ln);
  }
  return found;
}

/* 取姓名：逐行扫描，取第一个「像姓名」的行（跳过联系方式/标题/过长行）。
   用宽松的电话匹配（含连字符），避免「138-0000-0000」这类行被误判为姓名。 */
function extractName(lines) {
  for (const ln of lines) {
    const t = ln.trim();
    if (!t) continue;
    if (EMAIL_RE.test(t) || PHONE_SEP_RE.test(t) || PHONE_RE.test(t)) continue; // 联系方式行跳过
    if (/简历|RESUME|CV/i.test(t) && t.length <= 12) continue; // 标题「简历」「RESUME」跳过
    if (t.length <= 4) return t;                              // 姓名一般 ≤4 字
    // 「姓名｜头衔」拼接：取竖线/空格前的短段；短则当作姓名
    const seg = t.split(/[｜|\s·]+/).filter(Boolean)[0];
    if (seg && seg.length <= 6) return seg;
    // 本行过长且拆不出短段 → 继续找下一行（不在此放弃，简历可能前几行是标签/头衔）
  }
  return null;
}

/* ============ 构建简历数据模型 ============ */
/* 生成一个「可直接进编辑器」的 {data,fonts,spacing,v}。
   结构策略（诚实优先）：
   - name / contact 尽力识别
   - 正文全部保留进一个 advantages 类型 section「导入原文」（每行一条 text），
     让用户在编辑器里校对、拆分、重组，而不是交给不可靠的自动解析硬凑字段。 */
function buildResumeData(pdf) {
  const { lines, pageCount } = pdf;
  const name = extractName(lines) || '';
  const contact = extractContact(lines);

  const sections = [];
  // 「导入原文」板块：正文行（剔除已识别为姓名/联系方式的短行）逐行保留
  const bodyLines = lines.filter(ln => {
    const t = ln.trim();
    if (!t) return false;
    if (t === name) return false;
    if (EMAIL_RE.test(t) && t.length < 60) return false;      // 纯联系方式行
    if (PHONE_RE.test(t) && t.length < 40) return false;
    return true;
  });

  if (bodyLines.length) {
    sections.push({
      id: 'import_' + Date.now().toString(36),
      type: 'advantages',
      title: '导入原文（请校对整理）',
      pageBreak: false,
      items: bodyLines.map(t => ({
        label: '',
        text: t,
        labelBold: false,
        spacing: { mt: 0, mb: 4 }
      }))
    });
  }

  return {
    data: {
      name: name,
      subtitle: '',
      subtitleBold: false,
      meta: pageCount ? ('PDF 导入 · ' + pageCount + ' 页') : 'PDF 导入',
      metaBold: false,
      contact: contact,
      sections: sections
    },
    fonts: null,   // null → 编辑器用默认字体
    spacing: null, // null → 编辑器用默认间距
    v: 8,
    savedAt: Date.now()
  };
}

/* ============ 一键：buffer → 简历数据 ============ */
async function parsePdfToResume(buffer) {
  const pdf = await extractText(buffer);
  const resume = buildResumeData(pdf);
  return { resume, pdf };
}

module.exports = { extractText, buildResumeData, extractContact, extractName, parsePdfToResume, getPdfjs };
