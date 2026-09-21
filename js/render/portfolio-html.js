/* =============================================================
 * js/render/portfolio-html.js —— N9 个人求职官网导出（纯渲染层，零 DOM）
 * -----------------------------------------------------------------------------
 * 「导出为个人官网」是简历数据的**第五种渲染格式**（PDF / Word / TXT / MD / JSON 之外），
 * 与其它导出平级。本文件只做两件事，都是纯函数，可脱离浏览器单测：
 *
 *   A. 脱敏（F2）：classifyContact / redact —— 决定官网里公开哪些联系方式。
 *      默认隐藏：手机号、身份证号、详细住址、期望薪资。
 *      官网和 PDF 是**两个信任等级**的产物：官网默认脱敏，PDF 永远完整。
 *
 *   B. 渲染（F1）：buildPortfolioHtml —— 把一份简历数据渲染成**单个自包含 HTML**。
 *      内联全部 CSS、零外部依赖、双击可开、可直接丢 GitHub Pages / Vercel。
 *      板块 HTML 复用 js/views/portfolio-view.js 的 renderSections()，
 *      保证「应用内 #/portfolio/:id 预览」与「导出产物」永远长一个样（不漂移）。
 *
 *   C. 附言与部署指引（F4）：buildPitch / buildDeployNotes —— 把「用在哪」也产品化。
 *
 * ⚠️ 三条产品护栏（见 docs/技术设计方案/个人求职官网导出-技术设计方案.md §十）：
 *   1) 官网**不替代** PDF 简历 —— 文案里如实说，不宣传「靠它拿 offer」；
 *   2) 公开前**默认脱敏**（手机号 / 住址 / 身份证 / 期望薪资）；
 *   3) 数字与公司名**永远来自用户已录入数据**，不在这里编造任何占位内容。
 *   因此本文件里不会出现「AI 生成的形象照 / 项目封面」，封面只用用户填的 cover。
 *
 * ⚠️ 依赖：js/views/portfolio-view.js 必须已加载（它提供 renderSections）。
 *   缺失时**直接抛错**，而不是悄悄退化成「官网只有标题没有内容」。
 *
 * 挂载：window.ResumePortfolio = { ... }（双环境：浏览器 IIFE + Node CommonJS）
 * ============================================================= */
(function (global) {
  'use strict';

  /* 占位邮箱：设计文档 §5.4 明确吸收视频做法（公开页不直接暴露真实邮箱时用它）。
     ⚠️ 只在用户**显式**勾选「邮箱用占位符替换」时才用，绝不默认替换——
     默认替换会让 HR 联系不到人，那不是脱敏，是帮倒忙。 */
  var PLACEHOLDER_EMAIL = 'you@example.com';

  var DEFAULT_PRIVACY = {
    /* 隐藏手机号 / 身份证 / 详细住址 / 期望薪资（默认开，安全侧） */
    hideSensitive: true,
    /* 邮箱用 example.com 占位（默认关） */
    maskEmail: false,
    /* 内嵌「未脱敏的完整简历」供访客下载 PDF（默认关）
       ⚠️ 开启后完整联系方式会随 HTML 源码公开（查看源代码可见），
       必须由用户在确认弹窗里显式选择，不能在代码里替他做主。 */
    embedFullResume: false
  };

  /* 默认隐藏的联系方式类别 */
  var SENSITIVE_KINDS = { phone: true, id: true, address: true, salary: true };

  /* ============ 基础件 ============ */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  /* 兼容「纯字符串」与「{text}」两种历史形态（与 ResumeRender.T 一致） */
  function T(x) {
    if (x && typeof x === 'object' && 'text' in x) return x.text == null ? '' : String(x.text);
    return x == null ? '' : String(x);
  }
  function trim(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function has(x) { return trim(T(x)).length > 0; }
  /* **xxx** → <b>xxx</b>，其余转义 */
  function boldHtml(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  }
  function clone(x) {
    try { return JSON.parse(JSON.stringify(x == null ? {} : x)); }
    catch (e) { return {}; }
  }

  /* =============================================================
   * A. 联系方式分类与脱敏
   * ============================================================= */
  /* 纯函数：一行联系方式 → 类别。
     类别：email / phone / id / address / salary / link / education / other
     顺序有讲究：邮箱优先于手机号（邮箱里可能带数字串），身份证优先于手机号（18 位含 11 位子串风险）。 */
  function classifyContact(text) {
    var s = trim(T(text));
    if (!s) return 'other';
    var packed = s.replace(/[\s\-()（）]/g, '');
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(s)) return 'email';
    /* 二代身份证：17 位数字 + 校验位（数字或 X） */
    if (/\b\d{17}[\dXx]\b/.test(packed)) return 'id';
    if (/(?:^|\D)1[3-9]\d{9}(?:\D|$)/.test(packed)) return 'phone';
    if (/(期望薪资|期望月薪|期望年薪|薪资要求|月薪|年薪|\d+\s*[kK]\s*[-~～]\s*\d+\s*[kK])/.test(s)) return 'salary';
    if (/(省|市|区|县|镇|路|街|道|号|弄|巷|小区|大厦|公寓|号楼)/.test(s) && /\d/.test(s)) return 'address';
    if (/^https?:\/\//i.test(s) || /(?:github|gitee|gitlab|zhihu|juejin|linkedin|behance|dribbble|notion)\./i.test(s)) return 'link';
    if (/(大学|学院|学校|本科|硕士|博士|统招|全日制|届)/.test(s)) return 'education';
    return 'other';
  }

  function normalizePrivacy(p) {
    p = p || {};
    return {
      hideSensitive: p.hideSensitive === undefined ? DEFAULT_PRIVACY.hideSensitive : !!p.hideSensitive,
      maskEmail: p.maskEmail === undefined ? DEFAULT_PRIVACY.maskEmail : !!p.maskEmail,
      embedFullResume: p.embedFullResume === undefined ? DEFAULT_PRIVACY.embedFullResume : !!p.embedFullResume
    };
  }

  /* 纯函数：按隐私策略把一份简历数据脱敏。
     返回 { data, published, hidden, masked }：
       data      —— 脱敏后的**新对象**（原数据不动，绝不就地改用户的简历）
       published —— 将公开的联式方式行 [{kind, text}]（弹窗里给用户逐条确认）
       hidden    —— 被隐藏的行 [{kind, text}]
       masked    —— 被占位替换的行 [{kind, text}] */
  function redact(data, privacy) {
    var p = normalizePrivacy(privacy);
    var out = clone(data || {});
    var published = [], hidden = [], masked = [];
    var src = Array.isArray(out.contact) ? out.contact : [];
    var kept = [];
    src.forEach(function (c) {
      var text = T(c);
      if (!trim(text)) return;
      var kind = classifyContact(text);
      if (p.hideSensitive && SENSITIVE_KINDS[kind]) { hidden.push({ kind: kind, text: text }); return; }
      if (p.maskEmail && kind === 'email') {
        masked.push({ kind: kind, text: text });
        kept.push(PLACEHOLDER_EMAIL);
        published.push({ kind: kind, text: PLACEHOLDER_EMAIL });
        return;
      }
      kept.push(text);
      published.push({ kind: kind, text: text });
    });
    out.contact = kept;
    return { data: out, published: published, hidden: hidden, masked: masked };
  }
  /* 便捷包装：只要脱敏后的数据 */
  function sanitizeData(data, privacy) { return redact(data, privacy).data; }

  /* 纯函数：类别的中文名（弹窗里逐条列出「将公开什么」用） */
  function kindLabel(kind) {
    return {
      email: '邮箱', phone: '手机号', id: '身份证号', address: '详细住址',
      salary: '期望薪资', link: '主页链接', education: '教育信息', other: '其它'
    }[kind] || '其它';
  }

  /* =============================================================
   * B. 官网 HTML 渲染
   * ============================================================= */
  /* 板块渲染器复用 portfolio-view.js：应用内预览与导出产物共用一份实现。
     缺失时明确抛错（宁可报错，也不要静默导出「只有标题没有内容」的官网）。 */
  function sectionRenderer() {
    var pv = global.PortfolioView;
    if (!pv || typeof pv.renderSections !== 'function') {
      throw new Error('[ResumePortfolio] 缺少 js/views/portfolio-view.js 导出的 renderSections()，无法渲染官网板块');
    }
    return pv;
  }

  /* 官网主题 CSS（新粗野主义 / 杂志风，见设计文档 §5.3）。
     全部走 CSS 变量：将来加「深色开发者风」第二主题只需换这一组变量（P3）。
     刻意不跟随 prefers-color-scheme：这是一张「海报」，纸张底色是它的一部分，
     暗色下 offset 硬阴影会糊成一片。故锁定 color-scheme: light。 */
  var THEME_CSS = [
    ':root{',
    '  --pf-ink:#141414; --pf-paper:#f6f2e9; --pf-card:#ffffff;',
    '  --pf-accent:#ff5a1f; --pf-muted:#6b6b6b; --pf-line:#141414;',
    '  --pf-shadow:6px 6px 0 var(--pf-ink);',
    '  color-scheme:light;',
    '}',
    '*{box-sizing:border-box;}',
    'html{-webkit-text-size-adjust:100%;}',
    'body{margin:0;background:var(--pf-paper);color:var(--pf-ink);',
    '  font:15px/1.75 system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;}',
    'a{color:var(--pf-accent);}',
    '.pf-wrap{max-width:1080px;margin:0 auto;padding:0 20px 72px;}',
    /* 长 URL / 长校名不得撑破版心（390px 无横向滚动是验收项） */
    '.pf-site{overflow-wrap:break-word;}',
    /* 顶栏 */
    '.pf-nav{position:sticky;top:0;z-index:20;background:var(--pf-paper);border-bottom:2px solid var(--pf-line);}',
    '.pf-nav-in{max-width:1080px;margin:0 auto;padding:10px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;}',
    '.pf-nav-name{font-weight:900;letter-spacing:-.01em;}',
    '.pf-nav-links{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;margin-left:auto;}',
    '.pf-nav-links a{color:var(--pf-ink);text-decoration:none;border-bottom:2px solid transparent;padding-bottom:1px;}',
    '.pf-nav-links a:hover{border-bottom-color:var(--pf-accent);}',
    /* 首屏 */
    '.pf-hero{padding:56px 0 40px;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:32px;align-items:start;}',
    '.pf-name{font-size:clamp(42px,8.5vw,92px);line-height:1.02;font-weight:900;letter-spacing:-.03em;margin:0 0 14px;}',
    '.pf-subtitle{font-size:clamp(16px,2.4vw,22px);font-weight:700;margin:0 0 18px;}',
    '.pf-meta{color:var(--pf-muted);font-size:14px;margin:0 0 14px;}',
    '.pf-idcard{background:var(--pf-card);border:2px solid var(--pf-line);box-shadow:var(--pf-shadow);padding:20px;}',
    '.pf-idcard-h{font-size:12px;letter-spacing:.16em;font-weight:800;text-transform:uppercase;',
    '  color:var(--pf-accent);margin:0 0 12px;}',
    '.pf-chip-row{display:flex;flex-wrap:wrap;gap:8px;margin:0;}',
    /* ⚠️ 芯片默认 nowrap：长内容（如「某某大学 · 2020 统招全日制本科」）在窄屏必须能折行，
       否则一个芯片就把整页撑出横向滚动条（390px 无横向滚动是验收项，见下方 max-width:720px）。 */
    '.pf-chip{display:inline-block;border:1.5px solid var(--pf-line);background:var(--pf-card);',
    '  padding:3px 10px;font-size:13px;line-height:1.5;border-radius:999px;white-space:nowrap;max-width:100%;}',
    '.pf-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:18px;}',
    '.pf-btn{display:inline-block;border:2px solid var(--pf-line);background:var(--pf-accent);color:#fff;',
    '  font:inherit;font-weight:800;padding:11px 20px;cursor:pointer;text-decoration:none;box-shadow:4px 4px 0 var(--pf-ink);}',
    '.pf-btn:hover{transform:translate(-1px,-1px);}',
    '.pf-btn.ghost{background:var(--pf-card);color:var(--pf-ink);}',
    /* 板块（类名与 js/views/portfolio-view.js 的 renderSections 产物一致：
       同一套 DOM，两份样式表 —— 应用内预览用 layout.css，导出产物用这里的主题） */
    '.pf-sections{margin-top:44px;display:block;}',
    '.pf-card{background:var(--pf-card);border:2px solid var(--pf-line);box-shadow:var(--pf-shadow);',
    '  padding:22px 22px 18px;margin:0 0 22px;transition:transform .16s ease,box-shadow .16s ease;}',
    '.pf-card:hover{transform:translate(-3px,-3px);box-shadow:9px 9px 0 var(--pf-ink);}',
    '.pf-card-title{font-size:clamp(20px,3vw,28px);font-weight:900;letter-spacing:-.01em;margin:0 0 18px;',
    '  padding-bottom:8px;border-bottom:3px solid var(--pf-line);}',
    '.pf-block{margin:0 0 18px;}',
    '.pf-block:last-child{margin-bottom:0;}',
    /* 大数字带 */
    '.pf-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;}',
    '.pf-kpi-item{background:var(--pf-paper);border:2px solid var(--pf-line);padding:16px 14px;}',
    '.pf-kpi-value{display:block;font-size:clamp(26px,4.4vw,40px);font-weight:900;line-height:1.1;',
    '  letter-spacing:-.02em;color:var(--pf-accent);}',
    '.pf-kpi-label{display:block;margin-top:6px;font-size:13px;font-weight:700;color:var(--pf-muted);}',
    /* 项目卡片墙 */
    '.pf-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;}',
    '.pf-proj{background:var(--pf-paper);border:2px solid var(--pf-line);padding:16px;',
    '  display:flex;flex-direction:column;gap:10px;transition:transform .16s ease,box-shadow .16s ease;}',
    '.pf-proj:hover{transform:translate(-2px,-2px);box-shadow:4px 4px 0 var(--pf-ink);}',
    '.pf-proj-name{font-size:19px;font-weight:900;margin:0;letter-spacing:-.01em;}',
    '.pf-proj-cover{width:100%;display:block;border:2px solid var(--pf-line);object-fit:cover;}',
    '.pf-proj-metrics{display:flex;flex-wrap:wrap;gap:8px;margin:0;}',
    '.pf-proj-metric{border:1.5px solid var(--pf-line);background:var(--pf-accent);color:#fff;',
    '  font-size:12px;font-weight:800;padding:2px 9px;}',
    '.pf-proj-stack{display:flex;flex-wrap:wrap;gap:6px;margin:0;}',
    '.pf-proj-stack span{font-size:12px;color:var(--pf-muted);border:1px dashed var(--pf-line);padding:1px 7px;}',
    '.pf-evidence{font-size:12.5px;color:var(--pf-muted);border-left:3px solid var(--pf-accent);padding-left:9px;}',
    /* 职业履历 / 技能 / 高亮 等（与 portfolio-view 的类名对应） */
    '.pf-subhead{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin:0 0 6px;}',
    '.pf-subhead-title{font-size:17px;font-weight:800;}',
    '.pf-subhead-meta{font-size:13px;color:var(--pf-muted);}',
    '.pf-desc{margin:4px 0 8px;}',
    '.pf-list{margin:6px 0 0;padding-left:20px;}',
    '.pf-list li{margin:3px 0;}',
    '.pf-skill-kw{margin:2px 0;}',
    '.pf-skill-detail{margin:2px 0;color:var(--pf-muted);font-size:14px;}',
    '.pf-skill-seg,.pf-sep{margin:0;}',
    '.pf-hl-card{background:var(--pf-card);border:2px solid var(--pf-line);padding:12px 14px;margin:0 0 10px;}',
    '.pf-phase{border-left:3px solid var(--pf-line);padding-left:12px;margin:0 0 12px;}',
    '.pf-phase-label{font-weight:800;font-size:13px;letter-spacing:.1em;color:var(--pf-accent);}',
    '.pf-phase-date{font-size:13px;color:var(--pf-muted);}',
    '.pf-phase-title{font-weight:800;}',
    '.pf-custom{white-space:pre-wrap;}',
    '.pf-foot{margin-top:56px;padding-top:16px;border-top:2px solid var(--pf-line);',
    '  font-size:12.5px;color:var(--pf-muted);}',
    '.pf-hint{font-size:12.5px;color:var(--pf-muted);margin:10px 0 0;}',
    /* 打印块：只在下单 PDF 时出现 */
    '.pf-print{display:none;}',
    '@media (max-width:720px){',
    '  .pf-hero{grid-template-columns:1fr;padding-top:36px;}',
    '  .pf-wrap{padding:0 14px 56px;}',
    '  .pf-nav-in{padding:8px 14px;}',
    /* 窄屏：长联系方式芯片允许折行（否则撑出横向滚动条）；
       KPI 数字带保证至少两列，不然一屏只能看到一个大数字。 */
    '  .pf-chip{white-space:normal;overflow-wrap:anywhere;}',
    '  .pf-kpi{grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;}',
    '  .pf-cards{grid-template-columns:1fr;}',
    '}',
    '@media print{',
    '  @page{size:A4;margin:14mm;}',
    '  body{background:#fff;}',
    '  .pf-nav,.pf-site{display:none !important;}',
    '  .pf-print{display:block !important;}',
    '  *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
    '  .pf-print h1{font-size:22pt;margin:0 0 4pt;}',
    '  .pf-print h2{font-size:13pt;margin:14pt 0 5pt;border-bottom:1px solid #999;padding-bottom:2pt;}',
    '  .pf-print h3{font-size:11.5pt;margin:9pt 0 3pt;}',
    '  .pf-print p{margin:3pt 0;}',
    '  .pf-print ul{margin:3pt 0;padding-left:18pt;}',
    '  .pf-print li{margin:2pt 0;}',
    '  .pf-print .pf-print-sub{color:#555;}',
    '  .pf-print h2,.pf-print h3{break-after:avoid;}',
    '  .pf-print li,.pf-print p{break-inside:avoid;}',
    '}'
  ].join('\n');

  /* 纯函数：把简历数据拍平成线性区块（供打印版 PDF 使用）。
     形态与 js/export-extra.js 的 buildBlocks 一致（h1/h2/h3/p/li），
     ⚠️ 两处必须同步覆盖所有板块类型 —— test/cases-portfolio.js 有「两处都覆盖 KPI 与项目卡片」
     的对照断言钉住，新增板块类型时漏改一边会红。 */
  function blocksFor(data) {
    var B = [];
    var h = function (k, t) { var v = trim(t); if (v) B.push({ kind: k, text: v }); };
    var li = function (t) { var v = trim(t); if (v) B.push({ kind: 'li', text: v }); };
    var p = function (t) { var v = trim(t); if (v) B.push({ kind: 'p', text: v }); };
    if (!data) return B;

    h('h1', data.name);
    h('p', data.subtitle);
    h('p', data.meta);
    var contact = (data.contact || []).map(function (c) { return trim(T(c)); }).filter(Boolean);
    if (contact.length) p(contact.join(' | '));

    (data.sections || []).forEach(function (sec) {
      if (!sec) return;
      var st = trim(sec.title);
      /* F6 逐节标题显隐：headingVisible === false 的板块在打印版里同样不出标题
         （与 A4 预览语义一致），但**内容照旧打印**，不能整段丢掉。 */
      var shownTitle = (sec.headingVisible === false) ? '' : st;
      var type = sec.type;
      if (type === 'kpi-band') {
        if (!st) return;
        h('h2', shownTitle);
        li((sec.items || []).map(function (it) {
          if (!it) return '';
          var v = trim(T(it.value)), l = trim(T(it.label));
          return (v || l) ? (v + (l ? ' ' + l : '')) : '';
        }).filter(Boolean).join(' · '));
      } else if (type === 'project-cards') {
        if (!st) return;
        h('h2', shownTitle);
        (sec.cards || []).forEach(function (c) {
          if (!c) return;
          var cn = trim(T(c.name));
          if (!cn && !has(c.desc)) return;
          h('h3', cn);
          var metrics = (c.metrics || []).map(function (m) { return trim(T(m)); }).filter(Boolean);
          if (metrics.length) p(metrics.join(' · '));
          if (trim(T(c.stack))) p(trim(T(c.stack)));
          p(T(c.desc));
          var ev = [];
          if (trim(T(c.before))) ev.push('优化前 ' + trim(T(c.before)));
          if (trim(T(c.after))) ev.push('优化后 ' + trim(T(c.after)));
          if (trim(T(c.approach))) ev.push('手段 ' + trim(T(c.approach)));
          if (ev.length) p(ev.join('；'));
        });
      } else if (type === 'advantages') {
        if (!st) return;
        h('h2', shownTitle);
        (sec.items || []).forEach(function (it) {
          if (!it) return;
          var label = trim(T(it.label)), text = trim(T(it.text));
          if (!label && !text) return;
          li(label ? label + '：' + text : text);
        });
      } else if (type === 'career') {
        if (!st) return;
        h('h2', shownTitle);
        (sec.items || []).forEach(function (job) {
          if (!job) return;
          h('h3', trim(T(job.company)));
          var sub = [trim(T(job.role)), trim(T(job.date))].filter(Boolean).join(' | ');
          if (sub) p(sub);
          p(T(job.summary));
          (job.projects || []).forEach(function (pr) {
            if (!pr) return;
            var pn = trim(T(pr.name));
            if (pn) li('**' + pn + '**' + (trim(T(pr.stack)) ? '（' + trim(T(pr.stack)) + '）' : ''));
            p(T(pr.desc));
            (pr.results || []).forEach(function (r) { li(T(r)); });
          });
        });
      } else if (type === 'skills') {
        if (!st) return;
        h('h2', shownTitle);
        (sec.groups || []).forEach(function (g) {
          if (!g) return;
          var name = trim(T(g.name)), kw = trim(T(g.keywords)), dt = trim(T(g.detail));
          if (kw || dt) {
            if (kw) li(name ? '**' + name + '**：' + kw : kw);
            if (dt) p(dt);
            return;
          }
          var items = (g.items || []).map(function (x) { return trim(T(x)).replace(/\*\*/g, '').replace(/[。．.；;，,、\s]+$/, ''); }).filter(Boolean);
          if (!name && !items.length) return;
          li(name ? '**' + name + '**：' + items.join('、') : items.join('、'));
        });
      } else if (type === 'projects') {
        if (!st) return;
        h('h2', shownTitle);
        (sec.items || []).forEach(function (pr) {
          if (!pr) return;
          h('h3', trim(T(pr.name)));
          if (trim(T(pr.stack))) p(trim(T(pr.stack)));
          p(T(pr.desc));
          (pr.results || []).forEach(function (r) { li(T(r)); });
        });
      } else if (type === 'highlights') {
        if (!st) return;
        h('h2', shownTitle);
        (sec.cards || []).forEach(function (c) { li(T(c)); });
        var tags = (sec.tags || []).map(function (t) { return trim(T(t)); }).filter(Boolean);
        if (tags.length) p(tags.join(' · '));
      } else if (type === 'growth') {
        if (!st) return;
        h('h2', shownTitle);
        (sec.phases || []).forEach(function (ph) {
          if (!ph) return;
          h('h3', [trim(T(ph.label)), trim(T(ph.title))].filter(Boolean).join(' · '));
          if (trim(T(ph.date))) p(trim(T(ph.date)));
          p(T(ph.desc));
        });
      } else if (sec.headingVisible === false) {
        (sec.items || []).forEach(function (it) { li(T(it)); });
      } else {
        /* 未知类型 / 自定义：尽力保留文本，别丢内容 */
        if (!st && !trim(T(sec.html))) return;
        if (shownTitle) h('h2', shownTitle);
        if (trim(T(sec.html))) p(T(sec.html));
        (sec.items || []).forEach(function (it) { li(T(it)); });
      }
    });
    return B;
  }

  /* 纯函数：区块列表 → 打印版 HTML（连续的 li 包进 <ul>，避免裸 li） */
  function printHtmlFromBlocks(blocks) {
    var html = '', open = false;
    (blocks || []).forEach(function (b) {
      if (b.kind === 'li') {
        if (!open) { html += '<ul>'; open = true; }
        html += '<li>' + boldHtml(b.text) + '</li>';
        return;
      }
      if (open) { html += '</ul>'; open = false; }
      if (b.kind === 'h1') html += '<h1>' + boldHtml(b.text) + '</h1>';
      else if (b.kind === 'h2') html += '<h2>' + boldHtml(b.text) + '</h2>';
      else if (b.kind === 'h3') html += '<h3>' + boldHtml(b.text) + '</h3>';
      else html += '<p>' + boldHtml(b.text) + '</p>';
    });
    if (open) html += '</ul>';
    return html;
  }

  /* 纯函数：把简历数据 + 隐私策略渲染成**单个自包含**官网 HTML。
     opts = { data, privacy, pdfHref, generatedAt }
       data        简历数据（不含 data 包裹层）
       privacy     见 normalizePrivacy
       pdfHref     可选。给了就用真下载链接（<a download>），否则按钮走 window.print()。
                   本项目 P1 走打印分支：静态站没有后端，打印「另存为 PDF」是唯一
                   在任何托管上都能用、且文字可选中的路径。 */
  function buildPortfolioHtml(opts) {
    opts = opts || {};
    var raw = opts.data || {};
    var privacy = normalizePrivacy(opts.privacy);
    var rd = redact(raw, privacy);
    var site = rd.data;
    var pv = sectionRenderer();

    var name = trim(T(site.name)) || '我的个人主页';
    var subtitle = trim(T(site.subtitle));
    var title = subtitle ? (name + ' · ' + subtitle) : name;
    var desc = subtitle || trim(T(site.meta)) || name + ' 的个人主页';

    /* 首屏档案卡：联系方式 chips */
    var chips = (site.contact || []).map(function (c) { return trim(T(c)); }).filter(Boolean)
      .map(function (t) { return '<span class="pf-chip">' + esc(t) + '</span>'; }).join('');

    /* 锚点导航：只给有标题的板块做锚点 */
    var navLinks = (site.sections || []).map(function (sec, i) {
      if (!sec || !trim(sec.title) || sec.headingVisible === false) return '';
      return '<a href="#pf-sec-' + i + '">' + esc(trim(sec.title)) + '</a>';
    }).filter(Boolean).join('');

    var sectionsHtml = pv.renderSections(site, { anchorPrefix: 'pf-sec-' });

    var pdfBtn = opts.pdfHref
      /* 给了真文件（如内嵌的 data URI PDF）→ 用真下载链接 */
      ? '<a class="pf-btn" download href="' + esc(opts.pdfHref) + '">下载 PDF 简历</a>'
      /* 静态站没有后端：用浏览器打印「另存为 PDF」——任何托管都能用，且文字可选中 */
      : '<button type="button" class="pf-btn" onclick="window.print()" ' +
        'title="打开浏览器打印对话框，在目标里选「另存为 PDF」">下载 PDF 简历</button>';

    var generatedAt = opts.generatedAt || '';
    var footNote = '本页由简历编辑器导出，内容与 PDF 简历同源。' +
      (generatedAt ? '生成时间 ' + esc(generatedAt) + '。' : '') +
      '点「下载 PDF 简历」会打开浏览器打印对话框，选「另存为 PDF」即可保存。';

    /* 打印版的简历正文：默认与官网同源（已脱敏）；
       用户显式选择「内嵌完整简历」时才用未脱敏数据（此时 HTML 源码里就带着完整联系方式，
       所以确认弹窗必须把这条风险说明白）。 */
    var printSource = privacy.embedFullResume ? raw : site;
    var printHtml = printHtmlFromBlocks(blocksFor(printSource));

    return '<!DOCTYPE html>\n'
      + '<html lang="zh-CN">\n<head>\n'
      + '<meta charset="UTF-8">\n'
      + '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n'
      + '<meta name="description" content="' + esc(desc) + '">\n'
      + '<meta name="generator" content="resume-builder portfolio">\n'
      + '<title>' + esc(title) + '</title>\n'
      + '<style>\n' + THEME_CSS + '\n</style>\n'
      + '</head>\n<body>\n'
      /* 打印版：只在打印时显示（默认 display:none） */
      + '<article class="pf-print">' + printHtml + '</article>\n'
      + '<div class="pf-site">\n'
      + '  <nav class="pf-nav"><div class="pf-nav-in">'
      + '<span class="pf-nav-name">' + esc(name) + '</span>'
      + (navLinks ? '<span class="pf-nav-links">' + navLinks + '</span>' : '')
      + '</div></nav>\n'
      + '  <div class="pf-wrap">\n'
      + '    <header class="pf-hero">\n'
      + '      <div class="pf-hero-main">'
      + '<h1 class="pf-name">' + esc(name) + '</h1>'
      + (subtitle ? '<p class="pf-subtitle">' + esc(subtitle) + '</p>' : '')
      + (trim(T(site.meta)) ? '<p class="pf-meta">' + esc(trim(T(site.meta))) + '</p>' : '')
      + '</div>\n'
      + '      <aside class="pf-idcard"><p class="pf-idcard-h">Contact</p>'
      + (chips ? '<div class="pf-chip-row">' + chips + '</div>' : '<p class="pf-meta">（未公开联系方式）</p>')
      + '<div class="pf-actions">' + pdfBtn + '</div>'
      + '<p class="pf-hint">平台不会自动推荐这个页面，把链接主动发给对方才有效。</p>'
      + '</aside>\n'
      + '    </header>\n'
      + '    <main class="pf-sections">' + sectionsHtml + '</main>\n'
      + '    <footer class="pf-foot">' + footNote + '</footer>\n'
      + '  </div>\n'
      + '</div>\n'
      + '</body>\n</html>\n';
  }

  /* =============================================================
   * C. 附言与部署指引（设计文档 §5.1 / §9.4：把「用在哪」也产品化）
   * ============================================================= */
  var URL_HINT = '【这里粘贴你的官网链接】';

  /* 纯函数：可直接复制到招聘软件的附言 */
  function buildPitch(name, url) {
    var link = trim(url) || URL_HINT;
    var who = trim(name) ? ('我是' + trim(name) + '，') : '';
    return who + '这是我的个人网站，里面有更完整的项目细节和作品，您方便时可以看一下：' + link;
  }

  /* 纯函数：部署三步走 + 诚实提醒 */
  function buildDeployNotes(fileName) {
    var f = trim(fileName) || '导出的 .html 文件';
    return [
      '【一、部署（三选一，都免费）】',
      '1) Netlify Drop：打开 app.netlify.com/drop，把 ' + f + ' 拖进去 → 立刻拿到 https://xxx.netlify.app 链接',
      '2) Vercel：vercel.com 新建项目后拖拽上传，或直接连 GitHub 仓库',
      '3) GitHub Pages：新建仓库，把文件改名 index.html 推上去 → 仓库 Settings → Pages 选 main 分支',
      '',
      '【二、想要更像自己的域名（可选）】',
      '申请 名字.is-a.dev 或 名字.us.kg（免费），CNAME 到上面的托管即可。',
      '',
      '【三、诚实提醒】',
      '· 平台不会因为你用了它就给曝光：流量靠你在简历 PDF、招聘软件沟通、GitHub README 里**主动递链接**。',
      '· 公开部署前再确认一遍脱敏结果（本文件已按你的勾选处理）。',
      '· 官网**不替代** PDF 简历：HR 初筛主要看 PDF，官网更适合技术岗 / 作品展示 / 面试官深度阅读。'
    ].join('\n');
  }

  /* 纯函数：统计封面图里「相对路径」的数量。
     单文件官网是自包含的，相对路径的封面在托管上会 404 —— 必须提示用户，
     而不是导出一个「有几张图裂了」的官网。 */
  function relativeCoverCount(data) {
    var n = 0;
    ((data && data.sections) || []).forEach(function (sec) {
      if (!sec || sec.type !== 'project-cards') return;
      (sec.cards || []).forEach(function (c) {
        var src = trim(T(c && c.cover));
        if (src && !/^(https?:|data:)/i.test(src)) n++;
      });
    });
    return n;
  }

  var api = {
    PLACEHOLDER_EMAIL: PLACEHOLDER_EMAIL,
    DEFAULT_PRIVACY: DEFAULT_PRIVACY,
    SENSITIVE_KINDS: SENSITIVE_KINDS,
    THEME_CSS: THEME_CSS,
    classifyContact: classifyContact,
    kindLabel: kindLabel,
    normalizePrivacy: normalizePrivacy,
    redact: redact,
    sanitizeData: sanitizeData,
    blocksFor: blocksFor,
    printHtmlFromBlocks: printHtmlFromBlocks,
    buildPortfolioHtml: buildPortfolioHtml,
    buildPitch: buildPitch,
    buildDeployNotes: buildDeployNotes,
    relativeCoverCount: relativeCoverCount
  };
  global.ResumePortfolio = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
