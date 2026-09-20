/* =============================================================
 * 保存状态条（ResumeSaveStatus）
 * -------------------------------------------------------------
 * 把「改动到底有没有真的落盘」变成常驻可见的一行状态。此前这套反馈有三重不可见：
 *   1) #autosave 位于工具菜单面板头，而该面板默认 width:0 —— 桌面根本看不到；
 *   2) 移动端 .side-panel 被 display:none，sync-pane 里又没有对应元素 —— 手机全丢；
 *   3) 更关键的是「失败」压根没被表达：写盘失败会被 httpBackendWithFallback 静默降级到
 *      localStorage、并以「成功」返回，上层连 catch 都进不去。
 * 本模块把上述第三点补上：接管 ResumeLibrary 的降级通知，降级即显示可重试的告警。
 *
 * 状态：idle（隐藏）· info（启动/存储类型说明）· editing（编辑中）· saving（保存中）
 *      saved（已保存 HH:MM）· failed（保存失败，可重试）· degraded（磁盘写失败，暂存本浏览器，可重试）
 * 纯 DOM + 无依赖；不参与数据写入，只负责如实呈现。
 * ============================================================= */
(function (global) {
  'use strict';

  var el = null;
  var textEl = null;
  var retryBtn = null;
  var _state = 'idle';
  var _detail = '';
  var _retryHandler = null;
  var _bound = false;

  function pad(n) { return String(n).padStart(2, '0'); }
  function clockText(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  /* 各状态的文案。detail 由调用方给（失败原因 / 启动说明 / 保存时刻） */
  function textFor(state, detail) {
    switch (state) {
      case 'info': return detail || '';
      case 'editing': return '编辑中…';
      case 'saving': return '保存中…';
      case 'saved': return '✓ 已保存' + (detail ? ' · ' + detail : '');
      case 'failed': return '✗ 保存失败' + (detail ? '（' + detail + '）' : '') + ' · 点重试';
      case 'degraded': return '⚠ 磁盘写入失败，改动只暂存在本浏览器' + (detail ? '（' + detail + '）' : '') + ' · 点重试';
      default: return '';
    }
  }

  function render() {
    if (!el) return;
    /* 用 dataset 而非 setAttribute：极简 DOM 桩（测试环境）没有 setAttribute，
       而 dataset 赋值同样会落到 data-state 属性上，CSS 选择器行为一致。 */
    try { el.dataset.state = _state; } catch (e) { /* 无 dataset 的环境忽略 */ }
    if (textEl) textEl.textContent = textFor(_state, _detail);
    if (retryBtn) retryBtn.hidden = !(_state === 'failed' || _state === 'degraded');
    el.hidden = (_state === 'idle');
  }

  function set(state, detail) {
    _state = state;
    _detail = detail || '';
    render();
  }

  var api = {
    /* 绑定 DOM（#saveBar 内的 .save-bar-text / .save-bar-retry）并接管存储降级通知。
       缺 DOM 时所有方法安全空转（单文件版 / 测试环境）。 */
    init: function () {
      el = document.getElementById('saveBar');
      if (el) {
        textEl = el.querySelector ? el.querySelector('.save-bar-text') : null;
        retryBtn = el.querySelector ? el.querySelector('.save-bar-retry') : null;
      }
      if (retryBtn && !_bound) {
        _bound = true;
        retryBtn.addEventListener('click', function () {
          if (typeof _retryHandler === 'function') { try { _retryHandler(); } catch (e) {} }
        });
      }
      /* 存储降级（磁盘写失败 → 静默切 localStorage）时立刻把它摆到屏幕上 */
      try {
        if (global.ResumeLibrary && typeof global.ResumeLibrary.onDegrade === 'function') {
          global.ResumeLibrary.onDegrade(function () { api.markDegraded(); });
        }
      } catch (e) { /* 存储未就绪时忽略，后续 init 会重试 */ }
      render();
      return !!el;
    },

    /* 重试回调：由 app.js 注入「清降级锁 + 强制写一次盘」的动作 */
    onRetry: function (fn) { _retryHandler = (typeof fn === 'function') ? fn : null; },

    markInfo: function (text) { set('info', text); },
    markEditing: function () { set('editing'); },
    markSaving: function () { set('saving'); },
    markSaved: function () { set('saved', clockText(new Date())); },
    markFailed: function (reason) { set('failed', reason || ''); },
    markDegraded: function () { set('degraded', ''); },

    /* 供测试 / 调试 */
    state: function () { return _state; },
    text: function () { return textFor(_state, _detail); },
    _reset: function () { _state = 'idle'; _detail = ''; render(); }
  };

  global.ResumeSaveStatus = api;
})(typeof window !== 'undefined' ? window : this);
