/* =============================================================
 * EditorView —— 现有「工作台」的路由包装（P0 零回归）
 * -------------------------------------------------------------
 * 现状：.app 这个大 div 已经在 index.html 里，app.js 加载时立即渲染。
 * 本 view 不搬 DOM、不改渲染逻辑，只做两件事：
 *   1. 路由切换时控制 .app 的显隐（靠 body 的 class）
 *   2. 当 URL 里带 /editor/:resumeId 时，调用 ResumeEditor.switchResume 切简历
 *
 * 视图缓存：onLeave 只隐藏 .app，不销毁、不解绑 —— 切到简历库再切回来，
 *   正在输入的内容、撤销栈、拖拽状态全部保留（设计文档 §3.4）。
 * ============================================================= */
(function (global) {
  'use strict';

  var EditorView = {
    root: null,

    onEnter: function (params) {
      if (!this.root) this.root = document.querySelector('.app');

      // 让 .app 显示、view-root 隐藏
      document.body.classList.remove('route-library');
      document.body.classList.add('route-editor');

      // 深链：/editor/:resumeId -> 切换到指定简历
      if (params && params.resumeId) {
        this._switchTo(params.resumeId);
      }
    },

    onParamsChange: function (params) {
      // 同 view 内从 /editor/A 跳到 /editor/B：只切简历，不重建 .app
      if (params && params.resumeId) {
        this._switchTo(params.resumeId);
      }
    },

    onLeave: function () {
      // 隐藏 .app（library 那边会把 view-root 填上）。
      // 这里不销毁 .app，也不 saveState —— 数据在 app.js 的防抖保存里已经落盘。
      document.body.classList.remove('route-editor');
      document.body.classList.add('route-library');
    },

    _switchTo: function (id) {
      try {
        if (global.ResumeEditor && typeof global.ResumeEditor.getActiveResumeId === 'function') {
          var cur = global.ResumeEditor.getActiveResumeId();
          if (cur === id) return; // 已经是这一份，不重复切
        }
        if (global.ResumeEditor && typeof global.ResumeEditor.switchResume === 'function') {
          global.ResumeEditor.switchResume(id);
        }
      } catch (e) {
        console.warn('[editor-view] switchResume failed', e);
      }
    }
  };

  global.EditorView = EditorView;
})(window);
