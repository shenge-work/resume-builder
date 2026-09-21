/* =============================================================
 * JD 派生版本（ResumeJdDerive，A4：借鉴 Resume Matcher 的「master resume → JD → 定制版」）
 * -------------------------------------------------------------
 * 在「JD 匹配分析」之上，生成一份**针对该 JD 的派生简历**：
 *   - 基于主简历复制（不覆盖主简历，ResumeLibrary.create({fromResumeId})）
 *   - 把「缺失 / 弱覆盖」的关键词，作为一份「JD 定制待补」技能分组插到副本里，
 *     供用户逐条改写为真实经历（而非 AI 凭空编造）
 *   - 标题带 JD 来源标记，投递后可回溯到主简历
 *
 * 纯规则、纯前端、零依赖、不联网。纯函数可单测：
 *   buildDerivedPayload(payload, analysis) → 新 payload（不修改入参）
 *   fillGroupFor(missingTerms, weakTerms) → 技能分组对象
 *   suggestSentence(term) → 一句话模板（STAR 占位，绝不编造事实）
 *   deriveTitle(baseTitle, jdText) → 派生标题
 *
 * 与 jd-match.js 的分工：jd-match.js 只做「只读匹配分析」；本模块做「基于分析结果的
 * 派生版本生成」，两者通过 analysis 结果（groups.missing/weak）衔接，互不依赖实现细节。
 * ============================================================= */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- 一句话模板：给「缺失关键词」一个可填写的 STAR 占位，绝不编造事实 ---------- */
  function suggestSentence(term) {
    var t = String(term || '').trim();
    if (!t) return '';
    return t + '：在＿＿项目中，负责＿＿，通过＿＿使＿＿（请补真实数字与背景）。';
  }

  /* ---------- 把缺失/弱覆盖关键词整理成一个「JD 定制待补」技能分组 ----------
     关键词去重、保序；缺项与弱项分开注释，便于用户知道「哪些要补、哪些要突出」。 */
  function fillGroupFor(missingTerms, weakTerms) {
    var m = (missingTerms || []).map(function (t) { return String(t || '').trim(); }).filter(Boolean);
    var w = (weakTerms || []).map(function (t) { return String(t || '').trim(); }).filter(Boolean);
    var seen = {};
    var items = [];
    function push(t, tag) {
      if (!t || seen[t]) return;
      seen[t] = true;
      items.push(tag + suggestSentence(t));
    }
    m.forEach(function (t) { push(t, '【缺失】'); });
    w.forEach(function (t) { push(t, '【弱覆盖·需突出】'); });
    if (!items.length) return null;
    return {
      name: 'JD 定制待补（请逐条改写为真实经历）',
      keywords: '',
      detail: '以下由「JD 匹配分析」的缺失/弱覆盖关键词自动生成，是待填写的提示，不是最终内容。',
      items: items
    };
  }

  /* ---------- 深拷贝 payload 并插入派生分组（不修改入参 payload） ---------- */
  function buildDerivedPayload(payload, analysis) {
    var data = (payload && payload.data) ? payload.data : (payload || {});
    var out = {
      data: JSON.parse(JSON.stringify(data)),
      fonts: payload && payload.fonts ? JSON.parse(JSON.stringify(payload.fonts)) : null,
      spacing: payload && payload.spacing ? JSON.parse(JSON.stringify(payload.spacing)) : null,
      v: (payload && payload.v) || 8,
      savedAt: Date.now()
    };
    if (!Array.isArray(out.data.sections)) out.data.sections = [];

    var groups = (analysis && analysis.groups) || {};
    var missing = (groups.missing || []).map(function (x) { return x.term; });
    var weak = (groups.weak || []).map(function (x) { return x.term; });
    var g = fillGroupFor(missing, weak);
    if (!g) return out;   // 无缺失/弱覆盖 → 返回干净副本（等同一个 duplicate）

    // 追加为 skills 分组（矩阵式技能表）：若已存在同名分组则合并，否则新建 section
    var target = null;
    out.data.sections.forEach(function (sec) {
      if (sec && sec.type === 'skills' && !target) target = sec;
    });
    if (target) {
      if (!Array.isArray(target.groups)) target.groups = [];
      target.groups.push(g);
    } else {
      out.data.sections.push({
        id: 'jd_fill_' + Date.now().toString(36),
        type: 'skills',
        title: '专业技能',
        pageBreak: false,
        groups: [g]
      });
    }
    return out;
  }

  /* ---------- 派生标题：取 JD 里的「岗位名」做标题，便于回溯 ----------
     真实 JD 有两种「首行不能直接当名字」的常见形态：
       ① 整段粘成一行 / 首行是章节标签 + 编号条目：
          「任职要求：1、3年以上AI产品经理经验，熟悉大模型应用；2、具备Python…」
       ② 首行是「岗位 + 薪资 + 城市 + 年限」长串：
          「全栈开发工程师 20-35K·13薪（杭州·3-5年·本科）。核心职责：1、…」
     所以：先去章节标签 / 编号 / 年限 / 句末标点，再优先取「像岗位名」的片段，
     实在取不到才回退到首行截断（老行为），避免生成「定制「任职要求：1、3年以上…」」这类名字。 */
  var TITLE_MAX = 20;
  var NOISE_LABEL = /^(岗位职责|职位描述|工作职责|职责描述|任职要求|任职资格|任职条件|岗位要求|职位要求|工作要求|招聘|诚聘|急聘|招募|我们希望你|你需要|你将负责|工作内容|技能要求|加分项|其他要求|福利待遇|薪资福利|团队介绍|关于我们|公司介绍|Job Description|Responsibilities|Requirements|Qualifications)\s*[：:]\s*/i;
  var ENUM_HEAD = /^(?:[（(]\s*\d+\s*[)）]|\d+\s*[、.．)）]|[①-⑳]|[-•·*])\s*/;
  var DUR_HEAD = /^\d+\s*年(?:以上|以内|及以上|以上工作经验|以上经验|经验)?(?:相关)?/;
  var TAIL_NOISE = /(?:相关)?(?:工作)?(?:经验|优先|者优先|背景)$/;
  var ROLE_WORD = /(工程师|开发|前端|后端|全栈|客户端|服务端|测试|运维|算法|架构师|产品经理|产品|运营|设计师?|分析师?|数据分析|项目经理|主管|经理|总监|专员|顾问|实习生|研究员|科学家|销售|市场|品牌|商务|财务|人事|法务|采购|供应链|客户成功|增长|培训师?|教师|Engineer|Developer|Manager|Designer|Analyst|Architect|Intern|Specialist|Consultant|Director|Lead|PM|SRE|DevOps)/i;
  var VERB_HEAD = /^(负责|熟悉|具备|掌握|精通|了解|参与|能够|能|有|具有|要求|需要|从事|完成|推动|落地|协助)/;
  var CLAUSE_SEP = /[，,；;、]/;
  var SENT_END = /[。；;!！?？]/;

  /* 反复剥离章节标签与编号（两者会交替出现：「岗位职责：1、…」） */
  function stripNoise(s) {
    var out = String(s == null ? '' : s).trim();
    for (var i = 0; i < 6; i++) {
      var before = out;
      out = out.replace(NOISE_LABEL, '').replace(ENUM_HEAD, '').trim();
      if (out === before) break;
    }
    return out;
  }

  /* 去掉句首年限、句尾「经验/优先」等噪声与残留标点 */
  function tidyPhrase(s) {
    var out = String(s == null ? '' : s).replace(DUR_HEAD, '').trim();
    for (var i = 0; i < 4; i++) {
      var before = out;
      out = out.replace(TAIL_NOISE, '').replace(/[、，,；;：:。．.]+$/, '').trim();
      if (out === before) break;
    }
    return out;
  }

  /* 首行里真正可用的那一小句：去噪声 → 截到第一个句末标点 */
  function firstClause(line) {
    return tidyPhrase(stripNoise(line).split(SENT_END)[0]);
  }

  /* 「像岗位名」＝ 短、无子句分隔、不以动词开头、命中岗位词 */
  function isTitleLike(s) {
    if (!s || s.length > 40) return false;
    if (CLAUSE_SEP.test(s) || VERB_HEAD.test(s)) return false;
    return ROLE_WORD.test(s);
  }

  /* 过长时优先按「岗位 + 薪资 + （城市）」切，其次才硬截断 */
  function shortenClue(s) {
    if (s.length <= TITLE_MAX) return s;
    var i = s.indexOf('（');
    if (i > 0) {
      var head = s.slice(0, i).trim();
      var inner = s.slice(i + 1).split('）')[0];
      var city = inner.split(/[·|]/)[0].trim();   // 括号内第一段通常是城市
      if (head.length >= 4 && city && city.length <= 6) return head + '（' + city + '）';
    }
    return s.slice(0, 16) + '…';
  }

  /* 在短片段里找岗位名：「3年以上AI产品经理经验」→「AI产品经理」 */
  function roleSegment(text) {
    var parts = stripNoise(text).split(CLAUSE_SEP);
    for (var i = 0; i < parts.length; i++) {
      var p = tidyPhrase(parts[i]);
      if (p.length < 2 || p.length > 24) continue;
      if (VERB_HEAD.test(p) || !ROLE_WORD.test(p)) continue;
      return shortenClue(p);
    }
    return '';
  }

  function hintFromJd(jd) {
    var lines = String(jd || '').split(/[\n\r]+/).map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 6);
    var i, clue;
    for (i = 0; i < lines.length; i++) {           // 第一轮：整行就像岗位名
      clue = firstClause(lines[i]);
      if (isTitleLike(clue)) return shortenClue(clue);
    }
    for (i = 0; i < lines.length; i++) {           // 第二轮：从条目里挑出岗位片段
      clue = roleSegment(lines[i]);
      if (clue) return clue;
    }
    return '';
  }

  function deriveTitle(baseTitle, jdText) {
    var base = String(baseTitle || '简历');
    var jd = String(jdText || '').trim();
    if (!jd) return base + ' · JD 定制版';
    var clue = hintFromJd(jd);
    if (!clue) {
      /* 兜底：仍取首行（老行为），只是先去掉章节标签与首句噪声 */
      var raw = jd.split(/[\n\r]+/)[0].trim();
      clue = firstClause(raw) || raw;
      if (clue.length > 16) clue = clue.slice(0, 16) + '…';
    }
    return base + ' · 定制「' + clue + '」';
  }

  global.ResumeJdDerive = {
    buildDerivedPayload: buildDerivedPayload,
    fillGroupFor: fillGroupFor,
    suggestSentence: suggestSentence,
    deriveTitle: deriveTitle
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

/* CommonJS 导出（供测试 require） */
if (typeof module !== 'undefined' && module.exports) {
  var _g = (typeof globalThis !== 'undefined' ? globalThis : this);
  module.exports = {
    buildDerivedPayload: _g.ResumeJdDerive.buildDerivedPayload,
    fillGroupFor: _g.ResumeJdDerive.fillGroupFor,
    suggestSentence: _g.ResumeJdDerive.suggestSentence,
    deriveTitle: _g.ResumeJdDerive.deriveTitle
  };
}
