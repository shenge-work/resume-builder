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

/* ============ 结构化字段抽取（A3：借鉴 OpenResume，尽力结构化 + 不臆造） ============ */
/* 在「识别姓名+联系方式」之上，进一步识别工作经历 / 教育 / 技能三个板块，
   抽取字段级信息（公司、岗位、时间、学校、学位、技能关键词），落到 career/skills 结构，
   供用户在编辑器里「一键套用 / 逐项确认」，而非手工重打。
   诚实原则不变：低置信度一律标注待确认，原文永远全保留兜底，绝不静默填错。 */

/* section 边界识别：简历常见板块标题关键词 → 归一化板块类型 */
const SECTION_ALIASES = [
  { type: 'career', re: /工作经历|工作经验|职业经历|项目经历|实习经历|WORK\s*EXPERIENCE|EXPERIENCE|EMPLOYMENT/i },
  { type: 'education', re: /教育背景|教育经历|学习经历|学历|EDUCATION/i },
  { type: 'skills', re: /专业技能|技能特长|技能|技术栈|SKILLS|TECHNICAL/i },
  { type: 'projects', re: /项目经验|项目经历|个人项目|PROJECTS/i }
];

/* 归一化一行文本到板块类型（命中返回 type，否则 null） */
function classifySectionLine(t) {
  const s = t.trim();
  if (!s || s.length > 20) return null;      // 板块标题一般较短
  for (const a of SECTION_ALIASES) {
    if (a.re.test(s)) return a.type;
  }
  return null;
}

/* 日期段匹配：2021.07 - 2023.02 / 2021-2023 / 2021年-2023年 / 2019.06-至今 */
const DATE_RANGE_RE = /(?:19|20)\d{2}(?:[.年\/-]\s?\d{1,2})?\s*(?:[—–\-~～至]\s*(?:至今|现在|今|(?:19|20)\d{2}(?:[.年\/-]\s?\d{1,2})?))/;

/* 从一行文本中抽出日期段（命中返回字符串，否则 null） */
function extractDateRange(t) {
  const m = t.match(DATE_RANGE_RE);
  return m ? m[0] : null;
}

/* 工作经历板块：逐行扫描，识别「公司 / 岗位 / 时间」块。
   策略：一段经历通常包含一行公司名、一行岗位（或公司+岗位同行）、一行时间。
   这里只对「时间行 + 紧邻的前 1~2 行」做低置信度猜测，抽不出就归入 summary 原文。 */
function extractCareer(lines) {
  const items = [];
  let cur = null;
  const flush = () => { if (cur && (cur.company || cur.role || cur.date)) items.push(cur); cur = null; };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    const cls = classifySectionLine(t);
    if (cls === 'education' || cls === 'skills' || cls === 'projects') { flush(); break; } // 离开工作经历区
    if (cls === 'career') { flush(); continue; } // 板块标题本身跳过

    const date = extractDateRange(t);
    if (date) {
      // 命中时间行：可能是新一段经历的起点，或当前经历的补全
      if (!cur) cur = { company: '', role: '', date: date, summary: '', __lowConfidence: false };
      else if (!cur.date) cur.date = date;
      else { flush(); cur = { company: '', role: '', date: date, summary: '', __lowConfidence: false }; }
      continue;
    }

    // 非时间行：尝试识别公司/岗位。公司名常含「公司/科技/集团/有限」等后缀；岗位含「工程师/经理/实习生」等
    if (!cur) {
      // 尚未进入一段经历，跳过（可能是板块说明）
      continue;
    }
    const isCompany = /公司|集团|科技|网络|信息|数据|软件|技术有限公司|实验室|研究院|bank|Inc\.?|Ltd\.?|Co\.?/i.test(t);
    const isRole = /工程师|开发|经理|负责人|实习生|顾问|设计师|产品|运营|架构师|主管|总监|专家|lead|engineer|developer|manager|intern/i.test(t);
    if (isCompany && !cur.company) cur.company = t;
    else if (isRole && !cur.role) cur.role = t;
    else if (cur.summary) cur.summary += '\n' + t;
    else cur.summary = t;
  }
  flush();

  // 诚实标注：公司或岗位为空时，标为低置信度（用户需确认）
  items.forEach(it => { if (!it.company || !it.role) it.__lowConfidence = true; });
  return items;
}

/* 教育板块：识别「学校 / 学位 / 时间」。学校含「大学/学院」；学位含「本科/硕士/博士/学士」 */
function extractEducation(lines) {
  const items = [];
  let cur = null;
  const flush = () => { if (cur && (cur.school || cur.degree || cur.date)) items.push(cur); cur = null; };

  let inEdu = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    const cls = classifySectionLine(t);
    if (cls === 'education') { inEdu = true; flush(); continue; }
    if (cls && cls !== 'education' && inEdu) { flush(); break; }   // 离开教育区
    if (!inEdu) continue;

    const date = extractDateRange(t);
    const isSchool = /大学|学院|学校|University|College|Institute/i.test(t);
    const isDegree = /本科|硕士|博士|学士|专科|统招|全日制|Bachelor|Master|PhD|博士研究生|硕士研究生/i.test(t);

    if (date && !cur) { cur = { school: '', degree: '', date: date, __lowConfidence: false }; continue; }
    if (!cur) cur = { school: '', degree: '', date: '', __lowConfidence: false };

    if (isSchool && !cur.school) cur.school = t;
    else if (isDegree && !cur.degree) cur.degree = t;
    else if (date && !cur.date) cur.date = date;
    else if (isSchool) cur.school = t;
  }
  flush();
  items.forEach(it => { if (!it.school && !it.degree) it.__lowConfidence = true; });
  return items;
}

/* 技能板块：抽取技能关键词（常见技术词 / 工具 / 框架）。
   用一份白名单正则匹配，命中即收集（去重），避免把整段描述当技能。 */
const SKILL_TOKEN_RE = /(?:Java|Python|Golang|Go|C\+\+|C#|JavaScript|TypeScript|Node\.js|Vue|React|Angular|Spring|Spring\s*Boot|MyBatis|Docker|Kubernetes|K8s|MySQL|PostgreSQL|Redis|MongoDB|Kafka|RocketMQ|RabbitMQ|Flink|Spark|Hadoop|ClickHouse|Linux|Git|Nginx|Elasticsearch|LangChain|LangGraph|RAG|PyTorch|TensorFlow|LLM|机器学习|深度学习|微服务|分布式|高并发|性能优化)/gi;

function extractSkills(lines) {
  const found = [];
  let inSkills = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    const cls = classifySectionLine(t);
    if (cls === 'skills') { inSkills = true; continue; }
    if (cls && cls !== 'skills' && inSkills) break;
    if (!inSkills) continue;
    const matches = t.match(SKILL_TOKEN_RE);
    if (matches) {
      for (const m of matches) {
        const norm = m.replace(/\s+/g, '');
        if (found.indexOf(norm) < 0) found.push(norm);
      }
    }
  }
  return found;
}

/* ============ 构建简历数据模型 ============ */
/* 生成一个「可直接进编辑器」的 {data,fonts,spacing,v}。
   结构策略（A3 升级，仍诚实优先）：
   - name / contact 尽力识别
   - career / education / skills 尽力结构化（低置信度标注待确认，绝不臆造）
   - 未能结构化的正文，仍全保留进一个 advantages 类型 section「导入原文」兜底，
     让用户在编辑器里校对、拆分、重组，绝不丢内容。 */
function buildResumeData(pdf) {
  const { lines, pageCount } = pdf;
  const name = extractName(lines) || '';
  const contact = extractContact(lines);

  const sections = [];

  // —— A3：结构化板块 ——
  const careerItems = extractCareer(lines);
  if (careerItems.length) {
    sections.push({
      id: 'career_' + Date.now().toString(36),
      type: 'career',
      title: '工作经历（AI 识别，请校对）',
      pageBreak: false,
      items: careerItems.map(it => ({
        company: it.company || '（未识别，请补）',
        logo: '',
        role: it.role || '（未识别，请补）',
        date: it.date || '',
        summary: it.summary || '',
        projects: []
      }))
    });
  }

  const eduItems = extractEducation(lines);
  if (eduItems.length) {
    // 教育经历落到 career 里不太贴切；这里用 advantages 承载「学校 · 学位 · 时间」便于编辑器直接改
    sections.push({
      id: 'edu_' + Date.now().toString(36),
      type: 'advantages',
      title: '教育背景（AI 识别，请校对）',
      pageBreak: false,
      items: eduItems.map(it => ({
        label: '',
        text: [it.school, it.degree, it.date].filter(Boolean).join(' · ') || '（未识别，请补）',
        labelBold: false,
        spacing: { mt: 0, mb: 4 }
      }))
    });
  }

  const skillTokens = extractSkills(lines);
  if (skillTokens.length) {
    sections.push({
      id: 'skills_' + Date.now().toString(36),
      type: 'skills',
      title: '专业技能（AI 识别，请校对）',
      pageBreak: false,
      groups: [{
        name: '技能关键词',
        keywords: skillTokens.map(k => '**' + k + '**').join(' · '),
        detail: '以下关键词由 PDF 自动识别，请校对分组与描述。',
        items: []
      }]
    });
  }

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

module.exports = {
  extractText, buildResumeData, extractContact, extractName, parsePdfToResume, getPdfjs,
  extractCareer, extractEducation, extractSkills, extractDateRange, classifySectionLine
};
