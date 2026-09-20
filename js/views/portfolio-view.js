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

  /* ---------- 各板块类型渲染（字段名与 js/render/resume-render.js 保持一致） ---------- */
  function renderSection(sec) {
    var title = esc(sec.title || '');
    var body = '';

    if (sec.type === 'advantages') {
      var lis = (sec.items || []).filter(function (it) { return it && (hasText(it.label) || hasText(it.text)); }).map(function (it) {
        return '<li><b>' + esc(T(it.label)) + '</b>：' + esc(T(it.text)) + '</li>';
      }).join('');
      body = '<ul class="pf-list">' + lis + '</ul>';

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

    return '<section class="pf-card"><h2 class="pf-card-title">' + title + '</h2>' + body + '</section>';
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

      var secs = (data.sections || []).map(renderSection).join('');

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

  global.PortfolioView = PortfolioView;
})(window);
