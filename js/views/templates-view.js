/* =============================================================
 * TemplatesView —— 主题模板页（#/templates，N1 落地页）
 * -------------------------------------------------------------
 * 从旧版「排版预设」空壳升级为真正的主题画廊：
 *   · 5 套内置主题卡片（经典 / 现代蓝 / 雅致墨绿 / 暖橙 / 极简），点击即套用并跳回编辑器看效果；
 *   · 当前生效主题高亮；
 *   · 底部「主题微调」面板：对当前主题的强调色做颜色微调（写 data.theme.overrides，可撤销、随简历持久化），
 *     以及「重置微调」回到主题出厂外观。
 * 字体 / 间距 / 纸张边距微调复用编辑器右侧已有的「字号配置 / 间距配置 / 页面边距」面板（不再重复造）。
 * 主题切换与微调均经 ResumeEditor.applyTheme / customizeThemeColor，进撤销栈、带 savedAt 写盘。
 * ============================================================= */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var TemplatesView = {
    root: null,

    onEnter: function () {
      if (!this.root) this.root = global.ResumeLayout.getViewRoot();
      document.body.classList.remove('route-editor');
      document.body.classList.add('route-library');
this.render();
    },

    onLeave: function () {
      if (this.root) this.root.innerHTML = '';
    },

    /* 取当前生效主题 id（模板 / 编辑器共享同一份 data.theme） */
    activeId: function () {
      try { return global.ResumeEditor && global.ResumeEditor.getActiveThemeId
        ? global.ResumeEditor.getActiveThemeId() : 'classic'; }
      catch (e) { return 'classic'; }
    },

    /* 代表色（用于卡片色板）：优先取主题 color.rule，否则中性灰 */
    swatchColor: function (theme) {
      var c = (theme.color && (theme.color.rule || theme.color.strong)) || '#888888';
      return c;
    },

    render: function () {
      var self = this;
      var root = this.root;
      var themes = (global.ResumeThemeTemplates && global.ResumeThemeTemplates.allThemes())
        ? global.ResumeThemeTemplates.allThemes() : [];
      var active = this.activeId();

      var cards = themes.map(function (t) {
        var on = (t.id === active) ? ' active' : '';
        var sw = self.swatchColor(t);
        var strong = (t.color && t.color.strong) || '#1a1a1a';
        return '' +
          '<button type="button" class="tpl-card' + on + '" data-theme="' + esc(t.id) + '">' +
          '  <div class="tpl-swatch" style="background:' + esc(sw) + ';">' +
          '    <span class="tpl-swatch-name" style="color:' + esc(strong) + ';">' + esc(t.name) + '</span>' +
          '  </div>' +
          '  <div class="tpl-card-title">' + esc(t.name) + (on ? ' · 当前' : '') + '</div>' +
          '  <div class="tpl-card-desc">' + esc(t.desc) + '</div>' +
          '</button>';
      }).join('');

      /* 微调面板：对当前主题的强调色做颜色微调（写 data.theme.overrides.color） */
      var tintKeys = (global.ResumeThemeTemplates && global.ResumeThemeTemplates.TINT_KEYS)
        ? global.ResumeThemeTemplates.TINT_KEYS : [];
      var labelMap = {
        rule: '标题/分隔线主色', strong: '强调文字', kwText: '关键词高亮字',
        panelBar: '高亮卡竖条', chipText: '技术栈标签字', tagText: '标签芯片字', arrow: '时间线箭头'
      };
      var colorRows = tintKeys.map(function (k) {
        var cur = '#888888';
        try {
          var pal = (global.ResumeEditor && global.ResumeEditor.getCurrentPalette)
            ? global.ResumeEditor.getCurrentPalette() : null;
          if (pal && pal[k]) cur = pal[k];
          else {
            var th = global.ResumeThemeTemplates.getTheme(active);
            cur = (th.color && th.color[k]) || '#888888';
          }
        } catch (e) {}
        return '<label class="tpl-color-row"><span>' + esc(labelMap[k] || k) + '</span>' +
          '<input type="color" data-tint="' + esc(k) + '" value="' + esc(cur) + '"></label>';
      }).join('');

      root.innerHTML =
        '<div class="tpl-page">' +
        '  <div class="tpl-header"><h1 class="tpl-title">主题模板</h1>' +
        '    <p class="tpl-sub muted">一键切换简历视觉风格，切换与微调均可撤销、随简历保存。</p></div>' +
        '  <div class="tpl-grid">' + cards + '</div>' +
        '  <div class="tpl-custom">' +
        '    <div class="tpl-custom-head">主题微调（当前：' + esc(this._activeName(active)) + '）</div>' +
        '    <div class="tpl-color-grid">' + colorRows + '</div>' +
        '    <div class="tpl-custom-actions">' +
        '      <button type="button" class="mini-btn" id="tplResetBtn">重置微调</button>' +
        '      <button type="button" class="mini-btn" id="tplBackBtn">返回编辑器预览</button>' +
        '    </div>' +
        '  </div>' +
        '  <div class="tpl-footer muted">字体 / 间距 / 纸张边距微调在编辑器右侧对应面板；切换主题会套用该主题的字号与间距。</div>' +
        '</div>';

      /* 主题卡片：点击套用并跳回编辑器看效果 */
      root.querySelectorAll('.tpl-card').forEach(function (card) {
        card.addEventListener('click', function () {
          var id = card.getAttribute('data-theme');
          try {
            if (global.ResumeEditor && typeof global.ResumeEditor.applyTheme === 'function') {
              global.ResumeEditor.applyTheme(id);
            } else { console.warn('[templates] applyTheme 未就绪'); }
          } catch (e) { console.warn('[templates] applyTheme failed', e); }
        });
      });

      /* 颜色微调：input 即写 overrides（防抖由 saveState 内部承担） */
      root.querySelectorAll('input[data-tint]').forEach(function (inp) {
        inp.addEventListener('input', function () {
          var key = inp.getAttribute('data-tint');
          try {
            if (global.ResumeEditor && typeof global.ResumeEditor.customizeThemeColor === 'function') {
              global.ResumeEditor.customizeThemeColor(key, inp.value);
            }
          } catch (e) { console.warn('[templates] customizeThemeColor failed', e); }
        });
      });

      var resetBtn = root.querySelector('#tplResetBtn');
      if (resetBtn) resetBtn.addEventListener('click', function () {
        try { if (global.ResumeEditor && global.ResumeEditor.resetThemeOverrides) global.ResumeEditor.resetThemeOverrides(); } catch (e) {}
        self.render();
      });
      var backBtn = root.querySelector('#tplBackBtn');
      if (backBtn) backBtn.addEventListener('click', function () {
        if (global.ResumeRouter) global.ResumeRouter.navigate('/editor');
      });
    },

    _activeName: function (id) {
      var themes = (global.ResumeThemeTemplates && global.ResumeThemeTemplates.allThemes()) || [];
      for (var i = 0; i < themes.length; i++) if (themes[i].id === id) return themes[i].name;
      return id;
    }
  };

  global.TemplatesView = TemplatesView;
})(window);
