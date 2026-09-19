/* =============================================================
 * HistoryView —— 飞书历史版本页（P2）
 * -------------------------------------------------------------
 * 从 #feishuRestoreModal 迁出：列出 ResumeStore.listVersions() 返回的版本，
 * 点「恢复此版本」调 ResumeEditor.restoreFromFeishu()，完成后回编辑器。
 * ============================================================= */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtTime(sec) {
    if (!sec) return '';
    try { return new Date(Number(sec) * 1000).toLocaleString(); }
    catch (e) { return ''; }
  }

  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  var HistoryView = {
    root: null,

    onEnter: function () {
      if (!this.root) this.root = global.ResumeLayout.getViewRoot();
      document.body.classList.remove('route-editor');
      document.body.classList.add('route-library');
      this.render();
      this.load();
    },

    onLeave: function () {
      if (this.root) this.root.innerHTML = '';
    },

    render: function () {
      this.root.innerHTML =
        '<div class="history-page">' +
        '  <div class="settings-header">' +
        '    <button type="button" class="settings-back" data-nav="/settings">← 返回</button>' +
        '    <h1 class="settings-title">历史版本</h1>' +
        '  </div>' +
        '  <div class="history-list" id="historyList"><div class="lib-loading"><span class="spinner"></span>正在拉取飞书版本…</div></div>' +
        '</div>';
      this.root.querySelector('.settings-back').addEventListener('click', function (e) {
        e.preventDefault();
        global.ResumeRouter.navigate('/settings');
      });
    },

    load: function () {
      var self = this;
      var list = this.root.querySelector('#historyList');
      if (!global.ResumeStore || typeof global.ResumeStore.listVersions !== 'function') {
        list.innerHTML = '<div class="lib-empty"><div class="lib-empty-title">飞书不可用</div>' +
          '<div class="lib-empty-sub">当前浏览器模式未启用飞书同步</div></div>';
        return;
      }
      // 按当前激活简历 id 拉取对应云盘文件的版本（多份简历互不串数据）
      var resumeId = (global.ResumeEditor && global.ResumeEditor.getActiveResumeId) ? (global.ResumeEditor.getActiveResumeId() || 'default') : 'default';
      global.ResumeStore.listVersions(resumeId).then(function (versions) {
        if (!versions || !versions.length) {
          list.innerHTML = '<div class="lib-empty"><div class="lib-empty-title">还没有版本</div>' +
            '<div class="lib-empty-sub">先到「飞书同步」里点「上报到飞书」，云端就会留下第一个版本</div></div>';
          return;
        }
        list.innerHTML = versions.map(function (v, i) {
          return '<div class="history-item">' +
            '  <div class="history-item-info">' +
            '    <div class="history-item-title">版本 ' + esc(v.version_id || ('#' + (i + 1))) + '</div>' +
            '    <div class="history-item-meta">' + esc(fmtTime(v.create_time)) + ' · ' + esc(fmtSize(v.size)) + '</div>' +
            '  </div>' +
            '  <button type="button" class="lib-btn primary" data-restore="' + esc(v.version_id || '') + '">恢复此版本</button>' +
            '</div>';
        }).join('');

        list.querySelectorAll('[data-restore]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (btn.disabled) return;
            var vid = btn.getAttribute('data-restore');
            // 恢复中：按钮置灰 + spinner，避免重复点击
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span>恢复中…';
            Promise.resolve(global.ResumeEditor && global.ResumeEditor.restoreFromFeishu
              ? global.ResumeEditor.restoreFromFeishu(vid) : null).then(function (ok) {
              // 恢复完成后再回编辑器看结果（不再固定等 800ms，慢恢复不会空等）
              var id = (global.ResumeEditor.getActiveResumeId && global.ResumeEditor.getActiveResumeId()) || '';
              global.ResumeRouter.navigate('/editor/' + id);
            });
          });
        });
      }).catch(function (e) {
        list.innerHTML = '<div class="lib-empty"><div class="lib-empty-title">拉取失败</div>' +
          '<div class="lib-empty-sub">' + esc(e && e.message ? e.message : String(e)) + '</div></div>';
      });
    }
  };

  global.HistoryView = HistoryView;
})(window);
