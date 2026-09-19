/* =============================================================
 * ResumeLayout —— 全局骨架注入（P0）
 * -------------------------------------------------------------
 * 职责：
 *   1. 注入桌面端全局导航 rail（fixed 在左侧，宽 64px）
 *   2. 创建 #view-root 容器（二级页 / 新页面的挂载点，默认隐藏）
 *   3. rail 点击 -> ResumeRouter.navigate
 *
 * 设计取舍：
 *   - rail 用 fixed 而非 flex item：避免改动 body 的布局（现有 .app 是 height:100vh
 *     的 flex 容器，改成 flex item 会牵动打印样式）。fixed 浮在左侧，桌面端给
 *     .app 加 64px 左偏移；手机端 rail 直接 display:none。
 *   - .app 本身不搬到 #view-root：editor-view 直接接管 .app，路由切换只改 body 的
 *     class（route-library / route-editor），零 DOM 搬运，最小回归风险。
 * ============================================================= */
(function (global) {
  'use strict';

  var RAIL_HTML =
    '<aside class="global-rail" id="global-rail" aria-label="全局导航">' +
    '  <button type="button" class="rail-item" data-nav="/library" title="简历库">' +
    '    <span class="rail-icon" aria-hidden="true">▦</span>' +
    '    <span class="rail-label">简历库</span>' +
    '  </button>' +
    '  <button type="button" class="rail-item" data-nav="/editor" title="编辑器">' +
    '    <span class="rail-icon" aria-hidden="true">✎</span>' +
    '    <span class="rail-label">编辑器</span>' +
    '  </button>' +
    '  <button type="button" class="rail-item" data-nav="/templates" title="排版预设">' +
    '    <span class="rail-icon" aria-hidden="true">▤</span>' +
    '    <span class="rail-label">模板</span>' +
    '  </button>' +
    '  <button type="button" class="rail-item" data-nav="/tracker" title="投递追踪">' +
    '    <span class="rail-icon" aria-hidden="true">☰</span>' +
    '    <span class="rail-label">投递</span>' +
    '  </button>' +
    '  <button type="button" class="rail-item" data-action="ai-toggle" title="AI 助手 (Ctrl/Cmd+K)">' +
    '    <span class="rail-icon" aria-hidden="true">✦</span>' +
    '    <span class="rail-label">AI</span>' +
    '  </button>' +
    '  <button type="button" class="rail-item" data-nav="/settings" title="设置">' +
    '    <span class="rail-icon" aria-hidden="true">⚙</span>' +
    '    <span class="rail-label">设置</span>' +
    '  </button>' +
    '</aside>';

  var railEl = null;
  var viewRoot = null;

  function buildRail() {
    var wrap = document.createElement('div');
    wrap.innerHTML = RAIL_HTML.trim();
    railEl = wrap.firstChild;
    document.body.insertBefore(railEl, document.body.firstChild);
  }

  function buildViewRoot() {
    viewRoot = document.createElement('main');
    viewRoot.id = 'view-root';
    viewRoot.className = 'view-root';
    viewRoot.setAttribute('aria-live', 'polite');
    document.body.appendChild(viewRoot);
  }

  function bindNav() {
    railEl.addEventListener('click', function (e) {
      // data-action 按钮（非路由）：如 AI 开关
      var actionBtn = e.target.closest ? e.target.closest('[data-action]') : null;
      if (actionBtn) {
        var act = actionBtn.getAttribute('data-action');
        if (act === 'ai-toggle' && global.AIPanel) global.AIPanel.toggle();
        return;
      }
      var btn = e.target.closest ? e.target.closest('[data-nav]') : null;
      if (!btn) return;
      var target = btn.getAttribute('data-nav') || '/';
      if (target === '/editor') {
        // 跳到当前激活简历；拿不到 id 就用 /editor（editor-view 会保持现状）
        var id = null;
        try {
          if (global.ResumeEditor && typeof global.ResumeEditor.getActiveResumeId === 'function') {
            id = global.ResumeEditor.getActiveResumeId();
          }
        } catch (e) { /* 忽略 */ }
        target = id ? '/editor/' + id : '/editor';
      }
      global.ResumeRouter.navigate(target);
    });
  }

  function init() {
    buildRail();
    buildViewRoot();
    bindNav();
  }

  /* layout.js 在 body 末尾执行，此时 .app 已解析完；仍做一次 readyState 兜底。 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.ResumeLayout = {
    getRail: function () { return railEl; },
    getViewRoot: function () { return viewRoot; }
  };
})(window);
