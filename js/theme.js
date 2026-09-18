/* =============================================================
 * 主题（日间 / 夜间）——独立于业务，零依赖
 * -------------------------------------------------------------
 * 职责边界：
 *   本文件只管「编辑器外壳」的明暗，以及「纸张跟随夜间」开关（默认跟随）；
 *   它完全不碰简历数据与渲染逻辑（渲染由 js/app.js 负责）。
 *
 * 两套颜色是如何分离的：
 *   css/style.css 里定义了两组 CSS 变量 ——
 *     --ui-*     编辑器外壳（工具栏 / 面板 / 弹层 / 底部 Tab）
 *     --paper-*  简历纸张本身（用户要打印、导出 PDF 的那张 A4）
 *   <html data-theme="dark">            只换外壳，纸张仍是白纸
 *   <html data-theme="dark" data-paper="dark">  纸张也变暗（默认开启）
 *
 * 纸张跟随夜间的默认值与例外：
 *   夜间模式下纸张默认跟着变暗（整页夜间观感一致，可「视图」菜单关闭）；
 *   但这张纸最终是要导出 PDF / 打印的，所以导出时 app.js 会用
 *   beginExport()/endExport() 临时拉回白纸，
 *   导出的 PDF / 长图 / 单文件 HTML 永远是白底黑字。
 *
 * 必须在 js/data.js 之前加载（两者都排在 app.js 之前），
 * 并在 <head> 里配一段极小的 inline 脚本做「首屏防闪」（见 index.html）。
 * ============================================================= */
(function (global) {
  'use strict';

  var MODE_KEY = 'resume-theme-mode';     // auto | light | dark
  var PAPER_KEY = 'resume-theme-paper';   // '0' = 纸张恒定白纸（手动关）；缺省/'1' = 夜间时纸张跟着变暗
  var listeners = [];
  var exportDepth = 0;   // >0 表示正在导出：纸张强制白纸

  /* localStorage 在 file:// 或隐私模式下可能抛错，一律兜底 */
  function readStore(key) {
    try { return global.localStorage ? global.localStorage.getItem(key) : null; }
    catch (e) { return null; }
  }
  function writeStore(key, val) {
    try { if (global.localStorage) global.localStorage.setItem(key, val); }
    catch (e) { /* 写不进去就用默认值，不影响使用 */ }
  }
  function prefersDark() {
    try {
      return typeof global.matchMedia === 'function' &&
        global.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) { return false; }
  }

  function normalizeMode(m) {
    return (m === 'light' || m === 'dark') ? m : 'auto';
  }
  function getMode() { return normalizeMode(readStore(MODE_KEY)); }
  function paperFollows() { return readStore(PAPER_KEY) !== '0'; }

  /* 实际落地的明暗（auto 会在此处被解析成 light / dark） */
  function resolvedTheme() {
    var m = getMode();
    if (m === 'auto') return prefersDark() ? 'dark' : 'light';
    return m;
  }
  function isDark() { return resolvedTheme() === 'dark'; }

  /* 纸张当前该用什么：导出期间恒为白纸 */
  function effectivePaper() {
    if (exportDepth > 0) return 'light';
    return (isDark() && paperFollows()) ? 'dark' : 'light';
  }

  /* ===== 落到大 DOM：<html data-theme=… data-paper=…> ===== */
  function applyToDom() {
    var root = document.documentElement;
    if (!root) return;
    var theme = resolvedTheme();
    var paper = effectivePaper();
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    if (paper === 'dark') root.setAttribute('data-paper', 'dark');
    else root.removeAttribute('data-paper');
    syncMetaThemeColor(root, theme);
  }

  /* 移动端浏览器工具栏着色（桌面无害）；没有该 meta 时静默跳过 */
  function metaThemeColor() {
    try { return document.querySelector('meta[name="theme-color"]'); } catch (e) { return null; }
  }
  function syncMetaThemeColor(root, theme) {
    var el = metaThemeColor();
    if (!el) return;
    var cs = global.getComputedStyle ? global.getComputedStyle(root) : null;
    var val = theme === 'dark' ? '#101010' : '#f0f0f0';
    if (cs) {
      try {
        var v = (cs.getPropertyValue('--ui-bg') || '').trim();
        if (v) val = v;
      } catch (e) { /* 保持兜底值 */ }
    }
    el.setAttribute('content', val);
  }

  /* ===== 界面上的按钮 / 菜单项文案 ===== */
  /* 找不到对应 DOM 就跳过，绝不因为缺元素而中断主题切换 */
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  function setCheck(id, on) {
    var wrap = document.getElementById(id);
    if (!wrap) return;
    var box = wrap.querySelector('.check');
    if (box) box.textContent = on ? '✓' : ' ';
  }
  function refreshUI() {
    var dark = isDark();
    var mode = getMode();
    /* 工具栏按钮 + 手机聚合页按钮：文案描述「点下去会变成什么」 */
    var label = dark ? '日间模式' : '夜间模式';
    setText('themeBtnLabel', label);
    setText('themeBtnLabelMobile', label);
    var btn = document.getElementById('themeBtn');
    if (btn) btn.title = '当前：' + (dark ? '夜间' : '日间') + '（点击切换）';
    setText('themeStatusLabel', dark ? '夜间' : '日间');

    setCheck('themeDarkItem', dark);
    setCheck('themeAutoItem', mode === 'auto');
    setCheck('themePaperItem', paperFollows());
    if (typeof global.ResumeTheme._notify === 'function') global.ResumeTheme._notify();
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) { /* 单个订阅者出错不影响其它 */ }
    }
  }

  function onSubmitChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  /* ===== 对外操作 ===== */
  function setMode(mode) {
    writeStore(MODE_KEY, normalizeMode(mode));
    applyToDom(); refreshUI(); notify();
    return getMode();
  }
  /* 工具栏一键切换：在 light / dark 之间直接翻转（从 auto 里跳出来，符合直觉） */
  function toggleTheme() {
    return setMode(isDark() ? 'light' : 'dark');
  }
  function cycleTheme() {
    var order = ['auto', 'light', 'dark'];
    var next = order[(order.indexOf(getMode()) + 1) % order.length];
    return setMode(next);
  }
  function setPaperFollows(on) {
    writeStore(PAPER_KEY, on ? '1' : '0');
    applyToDom(); refreshUI(); notify();
    return paperFollows();
  }
  function togglePaperFollows() { return setPaperFollows(!paperFollows()); }

  /* 导出守卫：包住 PDF / 长图 / 单文件 HTML 的渲染过程，保证产物是白纸 */
  function beginExport() {
    exportDepth++;
    applyToDom();
  }
  function endExport() {
    if (exportDepth > 0) exportDepth--;
    applyToDom();
  }

  function init() {
    applyToDom();
    refreshUI();
    /* 跟随系统：系统主题变化时实时切（仅 mode=auto 时有意义） */
    try {
      if (typeof global.matchMedia === 'function') {
        var mq = global.matchMedia('(prefers-color-scheme: dark)');
        var handler = function () { applyToDom(); refreshUI(); notify(); };
        if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
        else if (typeof mq.addListener === 'function') mq.addListener(handler);
      }
    } catch (e) { /* 老浏览器不支持就算了 */ }
    /* 多标签页之间保持一致 */
    try {
      global.addEventListener && global.addEventListener('storage', function (e) {
        if (e && (e.key === MODE_KEY || e.key === PAPER_KEY)) { applyToDom(); refreshUI(); notify(); }
      });
    } catch (e) { /* 忽略 */ }
    /* DOM 就绪后再刷一次按钮文案（若在 <head> 阶段就 init，此时按钮还不存在） */
    try {
      if (document.readyState === 'loading' && document.addEventListener) {
        document.addEventListener('DOMContentLoaded', function () { applyToDom(); refreshUI(); });
      }
    } catch (e) { /* 忽略 */ }
    return resolvedTheme();
  }

  global.ResumeTheme = {
    init: init,
    getMode: getMode,
    setMode: setMode,
    cycleTheme: cycleTheme,
    toggleTheme: toggleTheme,
    isDark: isDark,
    resolvedTheme: resolvedTheme,
    paperFollows: paperFollows,
    setPaperFollows: setPaperFollows,
    togglePaperFollows: togglePaperFollows,
    effectivePaper: effectivePaper,
    beginExport: beginExport,
    endExport: endExport,
    onChange: onSubmitChange,
    refreshUI: refreshUI,
    _notify: notify
  };

  /* 尽早落地一次；若此刻 body 还没就绪，也只影响 UI 文案，DOM 属性已生效 */
  try { init(); } catch (e) { /* 绝不因主题失败拖垮页面 */ }
})(typeof window !== 'undefined' ? window : this);
