/* =============================================================
 * JSON Resume 适配器（A2：互操作）
 * -------------------------------------------------------------
 * 把「本项目自有简历数据模型」与「JSON Resume 标准」
 *   https://jsonresume.org/schema/ （事实标准）双向互转。
 *
 * 用途：用户可自由迁移——导入第三方 JSON Resume、把本简历导出为标准 JSON Resume
 *   （可被 resume-cli、Reactive Resume 等生态工具直接消费）。
 *
 * 设计原则：
 *   1. 纯函数、零依赖、不联网、不改数据源。
 *   2. 字段映射「尽力而为」：标准里有、本项目没有的字段（如 profiles/languages/
 *      awards/references），导入时尽量收纳，导出时能映射的映射、映射不了的丢弃但
 *      不报错；绝不臆造数据。
 *   3. 双环境兼容：浏览器 script 加载挂 window.ResumeJSONResume；
 *      Node require 返回同名对象（供测试直接 require）。
 *
 * 接口：
 *   fromJsonResume(jr) → 本项目 { data, fonts, spacing, v, savedAt }
 *   toJsonResume(resume) → JSON Resume 标准对象
 * ============================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;                 // Node / 测试
  }
  if (root) {
    root.ResumeJSONResume = api;          // 浏览器全局
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- 工具 ---------- */
  function str(v) { return (v === null || v === undefined) ? '' : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function first(v) { const a = arr(v); return a.length ? a[0] : undefined; }

  /* 日期区间转「YYYY.MM - YYYY.MM」风格（本项目 date 字段习惯） */
  function formatDateRange(start, end) {
    const s = formatDate(start);
    const e = formatDate(end);
    if (s && e) return s + ' - ' + e;
    if (s) return s + ' - 至今';
    if (e) return e;
    return '';
  }
  function formatDate(d) {
    if (!d) return '';
    const m = str(d).match(/^(\d{4})-(\d{1,2})/);
    if (m) return m[1] + '.' + m[2];
    return str(d);
  }

  let __idSeq = 0;
  function genId(prefix) {
    __idSeq += 1;
    return (prefix || 'jr') + '_' + Date.now().toString(36) + '_' + __idSeq;
  }

  /* ---------- JSON Resume → 本项目模型 ---------- */
  function fromJsonResume(jr) {
    if (!jr || typeof jr !== 'object') throw new Error('JSON Resume 数据无效');

    const basics = jr.basics || {};
    const sections = [];

    const name = str(basics.name);
    const subtitle = str(basics.label);

    const contact = [];
    if (basics.email) contact.push(str(basics.email));
    if (basics.phone) contact.push(str(basics.phone));
    if (basics.url) contact.push(str(basics.url));
    if (basics.location) {
      const loc = [basics.location.city, basics.location.region, basics.location.countryCode]
        .filter(Boolean).join(' · ');
      if (loc) contact.push(loc);
    }

    /* —— work → career —— */
    const work = arr(jr.work);
    if (work.length) {
      sections.push({
        id: genId('career'),
        type: 'career',
        title: '工作经历',
        pageBreak: false,
        items: work.map(w => ({
          company: str(w.name || w.company),
          logo: '',
          role: str(w.position),
          date: formatDateRange(w.startDate, w.endDate),
          summary: str(w.summary),
          projects: []
        }))
      });
    }

    /* —— education → advantages（学校 · 学位 · 时间）—— */
    const edu = arr(jr.education);
    if (edu.length) {
      sections.push({
        id: genId('edu'),
        type: 'advantages',
        title: '教育背景',
        pageBreak: false,
        items: edu.map(e => ({
          label: '',
          text: [str(e.institution), str(e.area || e.studyType), formatDateRange(e.startDate, e.endDate)]
            .filter(Boolean).join(' · '),
          labelBold: false,
          spacing: { mt: 0, mb: 4 }
        }))
      });
    }

    /* —— skills → skills（矩阵式）—— */
    const skills = arr(jr.skills);
    if (skills.length) {
      sections.push({
        id: genId('skills'),
        type: 'skills',
        title: '专业技能',
        pageBreak: false,
        groups: skills.map(s => ({
          name: str(s.name) || '技能',
          keywords: arr(s.keywords).map(k => '**' + str(k) + '**').join(' · '),
          detail: str(s.level) ? ('水平：' + str(s.level)) : '',
          items: []
        }))
      });
    }

    /* —— projects → career 的一个「项目经历」板块（用 advantages 承载，字段明确）—— */
    const projects = arr(jr.projects);
    if (projects.length) {
      sections.push({
        id: genId('projects'),
        type: 'advantages',
        title: '项目经历',
        pageBreak: false,
        items: projects.map(p => ({
          label: str(p.name),
          text: [str(p.description), arr(p.highlights).join('；')].filter(Boolean).join('：'),
          labelBold: true,
          spacing: { mt: 0, mb: 4 }
        }))
      });
    }

    /* —— summary / 其他文本 —— */
    if (basics.summary) {
      sections.push({
        id: genId('summary'),
        type: 'advantages',
        title: '个人简介',
        pageBreak: false,
        items: [{ label: '', text: str(basics.summary), labelBold: false, spacing: { mt: 0, mb: 4 } }]
      });
    }

    /* N1 主题还原（AC #6）：从 JSON Resume 的 meta.theme 扩展字段恢复主题 id + 微调。
       无该字段时回落默认 classic，与本项目 seedPayload 形状一致。 */
    const themeRaw = (jr.meta && jr.meta.theme) || null;
    const theme = themeRaw
      ? {
          id: str(themeRaw.id) || 'classic',
          overrides: (themeRaw.overrides && typeof themeRaw.overrides === 'object') ? themeRaw.overrides : {}
        }
      : { id: 'classic', overrides: {} };

    return {
      data: {
        name: name,
        subtitle: subtitle,
        subtitleBold: false,
        meta: 'JSON Resume 导入',
        metaBold: false,
        contact: contact,
        sections: sections,
        theme: theme
      },
      fonts: null,
      spacing: null,
      v: 8,
      savedAt: Date.now()
    };
  }

  /* ---------- 本项目模型 → JSON Resume ---------- */
  function toJsonResume(resume) {
    const data = (resume && resume.data) ? resume.data : (resume || {});
    const sections = arr(data.sections);

    const basics = {
      name: str(data.name),
      label: str(data.subtitle),
      email: '',
      phone: '',
      summary: ''
    };

    /* contact：拆出 email / phone / url，其余并入 location 或 summary */
    const contactRest = [];
    (data.contact || []).forEach(c => {
      const s = str(c);
      if (!s) return;
      if (/@/.test(s) && !basics.email) basics.email = s;
      else if (/^[+\d][\d\s-]{6,}$/.test(s) && !basics.phone) basics.phone = s;
      else if (/^https?:\/\//i.test(s) && !basics.url) basics.url = s;
      else contactRest.push(s);
    });

    const out = { basics: basics };

    /* 逆映射各 section */
    const work = [];
    const education = [];
    const skills = [];
    const projects = [];

    sections.forEach(sec => {
      const type = sec.type;
      if (type === 'career') {
        (sec.items || []).forEach(job => {
          work.push({
            name: str(job.company),
            position: str(job.role),
            startDate: '',
            endDate: '',
            summary: str(job.summary),
            highlights: []
          });
        });
      } else if (type === 'skills') {
        (sec.groups || []).forEach(g => {
          skills.push({
            name: str(g.name),
            level: '',
            keywords: str(g.keywords).split('·').map(k => k.replace(/\*\*/g, '').trim()).filter(Boolean)
          });
        });
      } else if (type === 'advantages') {
        const title = str(sec.title);
        if (/教育|学历/.test(title)) {
          (sec.items || []).forEach(it => education.push({ institution: str(it.text), area: '', studyType: '', startDate: '', endDate: '' }));
        } else if (/项目/.test(title)) {
          (sec.items || []).forEach(it => projects.push({ name: str(it.label), description: str(it.text), highlights: [] }));
        } else if (/简介|summary|关于|个人/.test(title)) {
          basics.summary = (sec.items || []).map(i => str(i.text)).join('\n');
        } else {
          /* 其他 advantages 归入 work 的第一段 highlights 或独立 project，稳妥起见并入 summary */
          const extra = (sec.items || []).map(i => (i.label ? str(i.label) + '：' : '') + str(i.text)).join('\n');
          if (extra) basics.summary = basics.summary ? basics.summary + '\n' + extra : extra;
        }
      } else if (type === 'highlights' || type === 'growth') {
        /* 无标准对应字段，丢弃但保内容 → 并入 summary 兜底，绝不丢 */
        const extra = JSON.stringify(sec).slice(0, 0); // 占位：这部分通过下面通用兜底处理
        void extra;
      }
    });

    /* 非标准板块兜底：把无法映射的内容并入 summary，保证不丢 */
    sections.forEach(sec => {
      const type = sec.type;
      if (type === 'highlights' || type === 'growth') {
        const txt = (sec.items || []).map(i => str(i.text)).concat(
          (sec.phases || []).map(p => [p.date, p.title, p.desc].filter(Boolean).join(' · ')),
          (sec.cards || []).map(c => str(c.text))
        ).filter(Boolean).join('\n');
        if (txt) basics.summary = basics.summary ? basics.summary + '\n' + txt : txt;
      }
    });

    if (work.length) out.work = work;
    if (education.length) out.education = education;
    if (skills.length) out.skills = skills;
    if (projects.length) out.projects = projects;

    /* meta 兜底进 summary（保留原样不丢） */
    if (data.meta && !/导入/.test(str(data.meta))) {
      const m = str(data.meta);
      if (m) basics.summary = basics.summary ? basics.summary + '\n[' + m + ']' : m;
    }

    /* N1 主题扩展字段（AC #6）：JSON Resume 标准无主题概念，
       这里以 meta.theme 扩展字段带出主题 id + 微调 overrides，
       供第三方工具消费，也供本项目再导入时还原主题。
       仅当主题非默认（非 classic 或带微调）时才写入，避免污染标准导出。 */
    if (resume && resume.data && resume.data.theme) {
      const t = resume.data.theme;
      const hasTheme = (t.id && t.id !== 'classic') || (t.overrides && Object.keys(t.overrides).length);
      if (hasTheme) {
        out.meta = out.meta || {};
        out.meta.theme = { id: t.id || 'classic', overrides: t.overrides || {} };
      }
    }

    return out;
  }

  return { fromJsonResume, toJsonResume, formatDate, formatDateRange };
});
