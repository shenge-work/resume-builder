/* =============================================================
 * PortfolioView —— 个人官网预览页（#/portfolio 或 #/portfolio/:id）
 * -------------------------------------------------------------
 * 「个人主页网页卡片」风格，不是 A4 PDF 排版：不调 renderResumeInner。
 * 自己写一个轻量 HTML 渲染器：
 *   - header：圆形头像（name 首字母）+ 大字号姓名 + 副标题（如有）
 *   - 联系方式：data.contact[] 横向 chip
 *   - 主体：data.sections[] 每个板块一张卡片
 * 纯展示，无编辑按钮。
 * 数据：await ResumeLibrary.load(id)；id 缺省时用 ResumeEditor.getActiveResumeId()。
 * ============================================================= */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* 兼容「纯字符串」与「{text}」两种形态（与 ResumeRender.T 一致） */
  function T(x) {
    return (x && typeof x === 'object' && 'text' in x) ? (x.text || '') : (x == null ? '' : String(x));
  }

  function hasText(x) {
    return T(x).trim().length > 0;
  }

  /* **xxx** → <b>xxx</b>，其余字符转义（与简历预览的高亮语义一致） */
  function boldHtml(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  }
  /* 矩阵式技能行：按 · 切段 → 各段加粗处理 → 统一分隔点拼接 */
  function kwHtml(s) {
    var parts = T(s).split(/[·・•]/).map(function (x) { return x.trim(); }).filter(Boolean);
    return parts.length ? parts.map(boldHtml).join('<span class="pf-sep">·</span>') : '';
  }

  /* ---------- 各板块类型渲染（字段名与 js/render/resume-render.js 保持一致） ----------
     ⚠️ 本函数是「板块 HTML」的**唯一实现**：应用内 #/portfolio/:id 预览与
     「导出为个人官网」（js/render/portfolio-html.js）都调它，保证两边永不漂移。
     新增板块类型时改这里 + resume-render.js（A4 降级渲染）+ export-extra.js（Word/文本）。 */
  function renderSection(sec, idx, opts) {
    opts = opts || {};
    /* headingVisible === false：只隐藏标题，内容照旧（与 A4 预览语义一致） */
    var showTitle = hasText(sec.title) && sec.headingVisible !== false;
    var title = showTitle ? esc(sec.title) : '';
    var body = '';

    if (sec.type === 'advantages') {
      var lis = (sec.items || []).filter(function (it) { return it && (hasText(it.label) || hasText(it.text)); }).map(function (it) {
        return '<li><b>' + esc(T(it.label)) + '</b>：' + esc(T(it.text)) + '</li>';
      }).join('');
      body = '<ul class="pf-list">' + lis + '</ul>';

    } else if (sec.type === 'kpi-band') {
      /* 官网专属：首屏「大数字 + 小标签」带（N9-F1） */
      var kpis = (sec.items || []).filter(function (it) {
        return it && (hasText(it.value) || hasText(it.label));
      }).map(function (it) {
        return '<div class="pf-kpi-item">'
          + (hasText(it.value) ? '<span class="pf-kpi-value">' + esc(T(it.value)) + '</span>' : '')
          + (hasText(it.label) ? '<span class="pf-kpi-label">' + esc(T(it.label)) + '</span>' : '')
          + '</div>';
      }).join('');
      body = kpis ? '<div class="pf-kpi">' + kpis + '</div>' : '';

    } else if (sec.type === 'project-cards') {
      /* 官网专属：项目卡片墙（N9-F1）。封面只用用户填的 cover，不留 AI 占位图。 */
      body = '<div class="pf-cards">' + (sec.cards || []).map(renderProjectCard).join('') + '</div>';

    } else if (sec.type === 'career') {
      body = (sec.items || []).map(function (job) {
        if (!job) return '';
        var head = '<div class="pf-subhead">' +
          '<span class="pf-subhead-title">' + esc(T(job.company)) + '</span>' +
          '<span class="pf-subhead-meta">' + esc(T(job.role)) + (hasText(job.date) ? ' · ' + esc(T(job.date)) : '') + '</span>' +
          '</div>';
        var summary = hasText(job.summary) ? '<p class="pf-desc">' + esc(T(job.summary)) + '</p>' : '';
        var projs = (job.projects || []).map(renderProject).join('');
        return '<div class="pf-block">' + head + summary + projs + '</div>';
      }).join('');

    } else if (sec.type === 'projects') {
      body = (sec.items || []).map(renderProject).join('');

    } else if (sec.type === 'skills') {
      body = (sec.groups || []).map(function (grp) {
        if (!grp) return '';
        var kw = kwHtml(grp.keywords), dt = kwHtml(grp.detail);
        /* 矩阵式技能行：漏了这段，新格式在作品集页会整块消失 */
        if (kw || dt) {
          return '<div class="pf-block"><div class="pf-subhead"><span class="pf-subhead-title">' +
            esc(T(grp.name)) + '</span></div>' +
            (kw ? '<p class="pf-skill-kw">' + kw + '</p>' : '') +
            (dt ? '<p class="pf-skill-detail">' + dt + '</p>' : '') + '</div>';
        }
        var lis = (grp.items || []).filter(hasText).map(function (it) {
          return '<li>' + esc(T(it)) + '</li>';
        }).join('');
        if (!lis) return '';
        return '<div class="pf-block"><div class="pf-subhead"><span class="pf-subhead-title">' +
          esc(T(grp.name)) + '</span></div><ul class="pf-list">' + lis + '</ul></div>';
      }).join('');

    } else if (sec.type === 'highlights') {
      var cards = (sec.cards || []).filter(function (c) { return hasText(c && c.text); }).map(function (c) {
        return '<div class="pf-hl-card">' + esc(T(c.text)) + '</div>';
      }).join('');
      var tags = (sec.tags || []).map(T).map(function (t) { return t.trim(); }).filter(Boolean).map(function (t) {
        return '<span class="pf-chip">' + esc(t) + '</span>';
      }).join('');
      body = '<div class="pf-hl">' + cards + (tags ? '<div class="pf-chip-row">' + tags + '</div>' : '') + '</div>';

    } else if (sec.type === 'growth') {
      body = '<div class="pf-phases">' + (sec.phases || []).map(function (ph) {
        if (!ph) return '';
        var d = '<div class="pf-phase">' +
          '<div class="pf-phase-label">' + esc(T(ph.label)) + '</div>' +
          (hasText(ph.date) ? '<div class="pf-phase-date">' + esc(T(ph.date)) + '</div>' : '') +
          (hasText(ph.title) ? '<div class="pf-phase-title">' + esc(T(ph.title)) + '</div>' : '') +
          (hasText(ph.desc) ? '<p class="pf-desc">' + esc(T(ph.desc)) + '</p>' : '') +
          '</div>';
        return d;
      }).join('<span class="pf-phase-sep" aria-hidden="true">▶</span>') + '</div>';

    } else {
      /* 未知类型兜底：把 items 里能取到的文本平铺成列表 */
      body = '<ul class="pf-list">' + (sec.items || []).map(function (it) {
        if (it == null) return '';
        if (typeof it === 'string' || (it && typeof it === 'object' && 'text' in it)) {
          return hasText(it) ? '<li>' + esc(T(it)) + '</li>' : '';
        }
        return '';
      }).join('') + '</ul>';
    }

    /* 锚点：导出官网时给每个有标题的板块一个 id，顶栏导航才能跳转；
       应用内预览不传 anchorPrefix，DOM 保持原样。 */
    var anchor = (opts.anchorPrefix && showTitle && idx != null)
      ? ' id="' + esc(opts.anchorPrefix + idx) + '"' : '';
    return '<section class="pf-card"' + anchor
      + (showTitle ? '><h2 class="pf-card-title">' + title + '</h2>' + body : '>' + body)
      + '</section>';
  }

  /* 板块列表 → HTML 字符串（唯一实现，两边共用；见 renderSection 顶部注释） */
  function renderSections(data, opts) {
    return ((data && data.sections) || []).map(function (sec, i) {
      return renderSection(sec, i, opts);
    }).join('');
  }

  function renderProject(p) {
    if (!p) return '';
    var head = '<div class="pf-subhead">' +
      '<span class="pf-subhead-title">' + esc(T(p.name)) + '</span>' +
      (hasText(p.stack) ? '<span class="pf-subhead-meta">' + esc(T(p.stack)) + '</span>' : '') +
      '</div>';
    var desc = hasText(p.desc) ? '<p class="pf-desc">' + esc(T(p.desc)) + '</p>' : '';
    var lis = (p.results || []).filter(hasText).map(function (r) {
      return '<li>' + esc(T(r)) + '</li>';
    }).join('');
    return '<div class="pf-block">' + head + desc + (lis ? '<ul class="pf-list">' + lis + '</ul>' : '') + '</div>';
  }

  /* 项目卡片（N9）：封面 + 一句话 + 指标芯片 + 技术栈芯片 + 「优化前→优化后→手段」证据链。
     cover 只接受用户填的地址；相对路径在单文件官网上会 404，导出时会另行提醒。 */
  function renderProjectCard(c) {
    if (!c) return '';
    var cover = hasText(c.cover)
      ? '<img class="pf-proj-cover" src="' + esc(T(c.cover)) + '" alt="" loading="lazy">' : '';
    var metrics = (c.metrics || []).map(T).map(function (m) { return String(m).trim(); }).filter(Boolean)
      .map(function (m) { return '<span class="pf-proj-metric">' + esc(m) + '</span>'; }).join('');
    /* 技术栈用 · / , / 、 / | 任一分隔都认（与技能行的分隔习惯一致） */
    var stack = T(c.stack).split(/[·・•,，、|]/).map(function (s) { return s.trim(); }).filter(Boolean)
      .map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('');
    var desc = hasText(c.desc) ? '<p class="pf-desc">' + esc(T(c.desc)) + '</p>' : '';
    var ev = [];
    if (hasText(c.before)) ev.push('优化前：' + T(c.before));
    if (hasText(c.after)) ev.push('优化后：' + T(c.after));
    if (hasText(c.approach)) ev.push('手段：' + T(c.approach));
    var evidence = ev.length ? '<p class="pf-evidence">' + esc(ev.join('　·　')) + '</p>' : '';
    var name = hasText(c.name) ? '<h3 class="pf-proj-name">' + esc(T(c.name)) + '</h3>' : '';
    if (!name && !cover && !desc && !metrics && !stack && !evidence) return '';
    return '<div class="pf-proj">' + name + cover
      + (metrics ? '<div class="pf-proj-metrics">' + metrics + '</div>' : '')
      + desc
      + (stack ? '<div class="pf-proj-stack">' + stack + '</div>' : '')
      + evidence
      + '</div>';
  }

  var PortfolioView = {
    root: null,
    currentId: null,

    onEnter: function (params) {
      if (!this.root) this.root = global.ResumeLayout.getViewRoot();
      document.body.classList.remove('route-editor');
      document.body.classList.add('route-library');
      this.currentId = (params && params.id) ? params.id : this.resolveActiveId();
      this.loadAndRender();
    },

    onParamsChange: function (params) {
      var id = (params && params.id) ? params.id : this.resolveActiveId();
      if (id === this.currentId) return;
      this.currentId = id;
      this.loadAndRender();
    },

    onLeave: function () {
      if (this.root) this.root.innerHTML = '';
    },

    resolveActiveId: function () {
      try {
        if (global.ResumeEditor && typeof global.ResumeEditor.getActiveResumeId === 'function') {
          return global.ResumeEditor.getActiveResumeId() || null;
        }
      } catch (e) { /* 忽略 */ }
      return null;
    },

    loadAndRender: function () {
      var self = this;
      var root = this.root;
      root.innerHTML = '<div class="pf-page"><div class="pf-loading">加载中…</div></div>';

      var id = this.currentId;
      var lib = global.ResumeLibrary;
      if (!lib || typeof lib.load !== 'function') {
        this.renderEmpty();
        return;
      }

      var p = id ? lib.load(id) : Promise.resolve(null);
      Promise.resolve(p).then(function (doc) {
        var payload = doc && doc.data ? doc : null;
        if (!payload || !payload.data) { self.renderEmpty(); return; }
        self.renderData(payload.data);
      }).catch(function () {
        self.renderEmpty();
      });
    },

    renderEmpty: function () {
      this.root.innerHTML =
        '<div class="pf-page">' +
        '  <div class="pf-empty">' +
        '    <div class="pf-empty-title">还没有可预览的简历</div>' +
        '    <div class="pf-empty-sub">先去编辑器写一份，或从简历库选一份</div>' +
        '  </div>' +
        '</div>';
    },

    renderData: function (data) {
      var root = this.root;
      var name = T(data.name) || '未命名';
      var first = name.trim() ? name.trim().charAt(0) : '?';
      var subtitle = T(data.subtitle);

      var chips = (data.contact || []).filter(hasText).map(function (c) {
        return '<span class="pf-chip">' + esc(T(c)) + '</span>';
      }).join('');

      var secs = renderSections(data);

      var backHref = this.currentId ? '/editor/' + this.currentId : '/editor';

      root.innerHTML =
        '<div class="pf-page">' +
        '  <div class="pf-back"><button type="button" class="pf-back-btn" id="pfBack">← 回到编辑器</button></div>' +
        '  <header class="pf-hero">' +
        '    <div class="pf-avatar" aria-hidden="true">' + esc(first) + '</div>' +
        '    <h1 class="pf-name">' + esc(name) + '</h1>' +
        (subtitle ? '<div class="pf-subtitle">' + esc(subtitle) + '</div>' : '') +
        (chips ? '<div class="pf-chip-row">' + chips + '</div>' : '') +
        '  </header>' +
        '  <main class="pf-sections">' + (secs || '<div class="pf-empty">这份简历还没有任何板块</div>') + '</main>' +
        '</div>';

      root.querySelector('#pfBack').addEventListener('click', function () {
        global.ResumeRouter.navigate(backHref);
      });
    }
  };

  /* N9：把「板块 HTML 渲染」作为纯函数暴露出去 —— 导出为个人官网
     （js/render/portfolio-html.js）直接复用，避免「预览好看、导出不一样」的漂移。 */
  PortfolioView.renderSection = renderSection;
  PortfolioView.renderSections = renderSections;
  PortfolioView.renderProjectCard = renderProjectCard;

  global.PortfolioView = PortfolioView;
})(typeof window !== 'undefined' ? window : globalThis);
