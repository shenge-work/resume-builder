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

  /* ---------- 派生标题：取 JD 关键词 / 岗位名做标题，便于回溯 ---------- */
  function deriveTitle(baseTitle, jdText) {
    var base = String(baseTitle || '简历');
    var jd = String(jdText || '').trim();
    if (!jd) return base + ' · JD 定制版';
    // 取 JD 第一行作为岗位线索（截断）
    var first = jd.split(/[\n\r]+/)[0].trim();
    var seg = first.length > 16 ? first.slice(0, 16) + '…' : first;
    return base + ' · 定制「' + seg + '」';
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
