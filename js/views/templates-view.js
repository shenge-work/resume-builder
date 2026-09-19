/* =============================================================
 * TemplatesView —— 排版预设页（#/templates）
 * -------------------------------------------------------------
 * 纯展示 + 一键套用：三张并排卡片（紧凑 / 标准 / 宽松）。
 * 点卡片 → ResumeEditor.applyLayoutPreset(mode) → 自动跳回 #/editor 看效果。
 * 当前生效档默认高亮「标准」；本会话内点过的档保持高亮（刷新后回到标准）。
 * ============================================================= */
(function (global) {
  'use strict';

  /* 当前生效档。没有持久化，默认「标准」，与 app.js 无预设状态一致。 */
  var activePreset = 'normal';

  var PRESETS = [
    { mode: 'compact',  title: '紧凑', desc: '字号 ×0.92，间距 ×0.8，内容更密', hint: '适合内容偏多、想压进一页' },
    { mode: 'normal',   title: '标准', desc: '恢复默认字号与间距',              hint: '编辑器出厂默认档' },
    { mode: 'relaxed',  title: '宽松', desc: '字号 ×1.08，间距 ×1.2，更透气',   hint: '适合内容偏少、想拉开节奏' }
  ];

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

    render: function () {
      var self = this;
      var root = this.root;

      var cards = PRESETS.map(function (p) {
        var on = (p.mode === activePreset) ? ' active' : '';
        return '' +
          '<button type="button" class="tpl-card' + on + '" data-mode="' + p.mode + '">' +
          '  <div class="tpl-card-title">' + esc(p.title) + '</div>' +
          '  <div class="tpl-card-desc">' + esc(p.desc) + '</div>' +
          '  <div class="tpl-card-hint">' + esc(p.hint) + '</div>' +
          '</button>';
      }).join('');

      root.innerHTML =
        '<div class="tpl-page">' +
        '  <div class="tpl-header"><h1 class="tpl-title">排版预设</h1></div>' +
        '  <div class="tpl-grid">' + cards + '</div>' +
        '  <div class="tpl-footer muted">更多模板即将上线</div>' +
        '</div>';

      root.querySelectorAll('.tpl-card').forEach(function (card) {
        card.addEventListener('click', function () {
          var mode = card.getAttribute('data-mode');
          activePreset = mode;
          self.render();
          self.apply(mode);
        });
      });
    },

    apply: function (mode) {
      try {
        if (global.ResumeEditor && typeof global.ResumeEditor.applyLayoutPreset === 'function') {
          var r = global.ResumeEditor.applyLayoutPreset(mode);
          if (r && typeof r.then === 'function') r.catch(function (e) { console.warn('[templates] applyLayoutPreset', e); });
        } else {
          console.warn('[templates] ResumeEditor.applyLayoutPreset 未就绪');
        }
      } catch (e) {
        console.warn('[templates] applyLayoutPreset failed', e);
      }
    }
  };

  global.TemplatesView = TemplatesView;
})(window);
