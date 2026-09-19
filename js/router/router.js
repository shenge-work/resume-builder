/* =============================================================
 * ResumeRouter —— 微型 hash 路由（P0 多页面骨架）
 * -------------------------------------------------------------
 * 零依赖，挂在 window.ResumeRouter。
 *
 * 为什么是 hash 路由：
 *   - file:// 直开（单文件版 / Tauri）下 history.pushState 不可用；
 *   - hash 是纯前端能力，永远可用，刷新 / 直接打开都不会 404。
 *
 * View 契约（所有页面都遵守）：
 *   view.onEnter(params)      进入页面（params 含路径参数与 query）
 *   view.onParamsChange(p)    同一路由内参数变化（如 /editor/A → /editor/B）
 *   view.onLeave()            离开页面（解绑事件 / 暂停定时器 / 把脏数据落盘；
 *                              ★ 不要销毁自身数据 —— 切走再切回内容不能丢）
 *
 * 与 app.js 的关系：
 *   路由层不关心简历数据；它只负责「把哪个 view 的 root 挂进 DOM」。
 *   现有 .app 工作台由 EditorView 接管，onLeave 只隐藏不销毁。
 * ============================================================= */
(function (global) {
  'use strict';

  var routes = [];
  var currentView = null;
  var currentParams = {};

  /* '/editor/:resumeId' -> { keys:['resumeId'], re:/^\/editor\/([^/]+)$/ } */
  function compile(pattern) {
    var keys = [];
    var src = pattern.replace(/:[^/]+/g, function (m) {
      keys.push(m.slice(1));
      return '([^/]+)';
    });
    return { keys: keys, re: new RegExp('^' + src + '$') };
  }

  function parseHash() {
    var raw = (location.hash || '#/').slice(1) || '/';
    var qi = raw.indexOf('?');
    var path = qi >= 0 ? raw.slice(0, qi) : raw;
    var queryStr = qi >= 0 ? raw.slice(qi + 1) : '';
    var query = {};
    if (queryStr) {
      queryStr.split('&').forEach(function (kv) {
        if (!kv) return;
        var eq = kv.indexOf('=');
        var k = eq >= 0 ? kv.slice(0, eq) : kv;
        var v = eq >= 0 ? kv.slice(eq + 1) : '';
        try {
          query[decodeURIComponent(k)] = decodeURIComponent(v);
        } catch (e) { /* 坏 query 段跳过 */ }
      });
    }
    return { path: path, query: query };
  }

  var ResumeRouter = {
    /* 注册路由。pattern: '/editor/:resumeId' */
    register: function (pattern, view) {
      routes.push(Object.assign({ view: view }, compile(pattern)));
    },

    /* 启动路由监听。在所有 view 注册完、app.js 初始化完之后调用。 */
    start: function () {
      var self = this;
      window.addEventListener('hashchange', function () { self.resolve(); });
      this.resolve();
    },

    /* 编程式跳转。path 形如 '/editor/res_8f3a'。 */
    navigate: function (path) {
      if (path.charAt(0) !== '/') path = '/' + path;
      var target = '#' + path;
      if (location.hash === target) {
        // 同 hash：强制重新 resolve（用于「同路由但要重新 onEnter」的兜底）
        this.resolve();
      } else {
        location.hash = target;
      }
    },

    /* 根据当前 hash 匹配路由并切换 view。 */
    resolve: function () {
      var parsed = parseHash();
      var path = parsed.path;

      for (var i = 0; i < routes.length; i++) {
        var r = routes[i];
        var m = path.match(r.re);
        if (!m) continue;

        var params = Object.assign({}, parsed.query);
        r.keys.forEach(function (k, idx) {
          try { params[k] = decodeURIComponent(m[idx + 1]); }
          catch (e) { params[k] = m[idx + 1]; }
        });

        if (currentView === r.view && typeof r.view.onParamsChange === 'function') {
          try { r.view.onParamsChange(params); }
          catch (e) { console.warn('[router] onParamsChange error', e); }
        } else {
          if (currentView && typeof currentView.onLeave === 'function') {
            try { currentView.onLeave(); }
            catch (e) { console.warn('[router] onLeave error', e); }
          }
          currentView = r.view;
          try { r.view.onEnter(params); }
          catch (e) { console.warn('[router] onEnter error', e); }
        }
        currentParams = params;
        this.highlightNav(path);
        return;
      }

      console.warn('[router] no route matched:', path);
    },

    /* 给 rail 上的 [data-nav] 加 .active（/editor/xxx 命中 /editor 前缀） */
    highlightNav: function (path) {
      var items = document.querySelectorAll('[data-nav]');
      for (var i = 0; i < items.length; i++) {
        var target = items[i].getAttribute('data-nav') || '';
        var active;
        if (!target || target === '/') {
          active = (path === '/');
        } else {
          active = (path === target) || path.indexOf(target + '/') === 0;
        }
        items[i].classList.toggle('active', active);
      }
    },

    getParams: function () { return currentParams; },
    getCurrentView: function () { return currentView; }
  };

  global.ResumeRouter = ResumeRouter;
})(window);
