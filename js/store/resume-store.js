/*
 * ResumeStore —— 统一数据门面（P0 跨平台改造第一步）
 * -----------------------------------------------------------------------------
 * 零依赖纯 JS，可直接被浏览器 <script> 加载（不引入任何 npm 包）。
 * 挂在 window.ResumeStore 上，UI 通过它读写数据，不关心数据到底存在哪：
 *   - 本地持久化：LocalStore / BrowserStore（IndexedDB，无则回退 localStorage）
 *   - 本地服务端写回：LocalServerStore（POST /api/resume，保留 npm start 实时写回 data/resume.json 的工作流；无服务时静默回退）
 *   - 远端同步：FeishuStore（飞书双写 + 版本历史；纯浏览器模式优雅降级）
 *
 * 设计要点：
 *   - save()/load() 走 LocalStore（浏览器内与 BrowserStore 共用同一后端）。
 *     【P2 预告】原生壳（Tauri）就绪后，LocalStore 会换成 invoke('save_resume') 命令，
 *     届时本文件对外接口不变，仅需替换 LocalStore 的实现。
 *   - FeishuStore 在「纯浏览器、无原生壳」模式下 available=false，push/pull/listVersions/
 *     restore/saveConfig 直接抛出友好 Error；loadConfig 返回 null。
 *   - 预留原生桥：若 window.__RESUME_NATIVE__ 存在且含对应方法，则委托给它（不强制实现）。
 *   - 任何持久化错误都在 store 内部被吞掉（save 返回已吞错的 Promise），绝不让异常冒泡到 UI。
 */
(function (global) {
  'use strict';

  var DB_NAME = 'resume_builder';     // IndexedDB 库名
  var DB_STORE = 'kv';                // IndexedDB object store 名
  var IDB_KEY = 'resume_v1';          // IndexedDB 键
  var LS_KEY = 'resume_builder_data_v1'; // localStorage 回退键（与 app.js SAVE_KEY 一致，保证双写互通）

  /* ============ 底层：Promise 化的 IndexedDB 封装 ============ */
  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined' || !indexedDB) { reject(new Error('no indexedDB')); return; }
      var req;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('indexedDB open error')); };
    });
  }

  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx, store, r;
        try {
          tx = db.transaction(DB_STORE, 'readonly');
          store = tx.objectStore(DB_STORE);
          r = store.get(key);
        } catch (e) { reject(e); return; }
        r.onsuccess = function () { resolve(r.result === undefined ? null : r.result); };
        r.onerror = function () { reject(r.error || new Error('idb get error')); };
      }).then(function (v) { try { db.close(); } catch (_) {} return v; });
    });
  }

  function idbSet(key, val) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx, store, r;
        try {
          tx = db.transaction(DB_STORE, 'readwrite');
          store = tx.objectStore(DB_STORE);
          r = store.put(val, key);
        } catch (e) { reject(e); return; }
        r.onsuccess = function () { resolve(); };
        r.onerror = function () { reject(r.error || new Error('idb put error')); };
      }).then(function () { try { db.close(); } catch (_) {} });
    });
  }

  function lsGet() {
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function lsSet(val) {
    try { global.localStorage.setItem(LS_KEY, JSON.stringify(val)); } catch (e) { /* 吞掉：禁用存储时静默 */ }
  }

  /* ============ LocalStore / BrowserStore ============ */
  /* 浏览器内两者共用同一 IndexedDB/localStorage 后端。
     【P2】原生壳就绪后 LocalStore 改为 Tauri 命令；BrowserStore 保留为离线兜底。
     当前阶段为「统一后端」实现，满足 AC2 的「IndexedDB（无则回退 localStorage）」要求。 */
  var LocalStore = {
    get: function () {
      if (typeof indexedDB !== 'undefined' && indexedDB) {
        return idbGet(IDB_KEY).catch(function () { return lsGet(); });
      }
      return Promise.resolve(lsGet());
    },
    set: function (payload) {
      if (typeof indexedDB !== 'undefined' && indexedDB) {
        return idbSet(IDB_KEY, payload).catch(function () { lsSet(payload); });
      }
      lsSet(payload);
      return Promise.resolve();
    }
  };

  // 浏览器内 BrowserStore 与 LocalStore 指向同一后端（注释标明 P2 将分离）
  var BrowserStore = LocalStore;

  /* ============ LocalServerStore（保留 npm start 服务端写回，避免回退现有工作流） ============ */
  /* 原 pushRepo 的逻辑平移到此：若本机跑着 serve.js（npm start 打开），则把数据 POST 到
     /api/resume 落盘为 data/resume.json；file:// 或只读服务器下该请求静默失败，回退 IndexedDB。
     这样「浏览器模式用 IndexedDB」与「npm start 实时写回 data/resume.json」两路并存，互不冲突。
     【P2】原生壳就绪后，此后端在桌面端可被 Tauri 命令取代；移动端无本地服务，自然走 IndexedDB。 */
  var LocalServerStore = {
    available: function () { return typeof fetch === 'function'; },
    save: function (payload) {
      if (typeof fetch !== 'function') return Promise.resolve();
      var body = JSON.stringify(payload);
      return fetch('/api/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
      }).catch(function () { /* 服务不可写：静默，依赖 IndexedDB 兜底 */ });
    }
  };

  /* ============ FeishuStore ============ */
  var FEISHU_UNAVAILABLE_MSG = '飞书同步需在安装包（原生壳）中启用；当前浏览器模式仅本地保存';
  // 原生桥：若存在 window.__RESUME_NATIVE__ 且含对应方法，则委托；否则浏览器模式不可用
  var NATIVE = (global.__RESUME_NATIVE__ && typeof global.__RESUME_NATIVE__ === 'object') ? global.__RESUME_NATIVE__ : null;

  /* 浏览器模式 HTTP 后端：直连本地 serve.js 的 /api/sync*（凭证仍在服务端，不进浏览器）。
     仅当「无原生壳 + 有 fetch」时启用；file:// 或静态服务器下 fetch 失败则走下面的 reject 分支。 */
  function httpJson(method, path, body) {
    return fetch(path, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j && j.error ? j.error : ('HTTP ' + r.status));
        return j;
      });
    });
  }
  /* 版本列表 / 恢复 / 拉取均按「简历 id」定位远端文件；缺省 'default'（兼容单份简历）。
     resumeId 来自 ResumeLibrary 的简历 id，经 reportToFeishu 的 payload.id 写入
     sync.state.json 的 file_token_<id> 键，两边必须一致才能读到同一份数据。 */
  function syncQS(resumeId) {
    return resumeId ? ('?resumeId=' + encodeURIComponent(resumeId)) : '';
  }

  var FeishuStore = {
    available: !!NATIVE,  // 纯浏览器无原生壳 → false
    push: function (payload) {
      if (NATIVE && typeof NATIVE.feishuPush === 'function') return Promise.resolve(NATIVE.feishuPush(payload));
      if (typeof fetch === 'function') {
        return httpJson('POST', '/api/sync', payload).then(function (j) {
          return { ok: true, docUrl: j.docUrl, fileUrl: j.fileUrl, size: j.size, dryRun: !!j.dryRun, authMode: j.authMode };
        });
      }
      return Promise.reject(new Error(FEISHU_UNAVAILABLE_MSG));
    },
    pull: function (resumeId) {
      if (NATIVE && typeof NATIVE.feishuPull === 'function') return Promise.resolve(NATIVE.feishuPull(resumeId));
      if (typeof fetch === 'function') {
        // 浏览器 HTTP 后端：等价「取该简历最新版本并恢复」
        return httpJson('GET', '/api/sync/versions' + syncQS(resumeId)).then(function (j) {
          var vs = j.versions || [];
          if (!vs.length) throw new Error('飞书中还没有可用版本，请先「上报到飞书」');
          return httpJson('POST', '/api/sync/restore', { versionId: vs[0].version_id, resumeId: resumeId }).then(function (r) {
            try { return JSON.parse(r.json); } catch (e) { return r.json; }
          });
        });
      }
      return Promise.reject(new Error(FEISHU_UNAVAILABLE_MSG));
    },
    listVersions: function (resumeId) {
      if (NATIVE && typeof NATIVE.feishuListVersions === 'function') return Promise.resolve(NATIVE.feishuListVersions(resumeId));
      if (typeof fetch === 'function') {
        return httpJson('GET', '/api/sync/versions' + syncQS(resumeId)).then(function (j) { return j.versions || []; });
      }
      return Promise.reject(new Error(FEISHU_UNAVAILABLE_MSG));
    },
    restore: function (versionId, resumeId) {
      if (NATIVE && typeof NATIVE.feishuRestore === 'function') return Promise.resolve(NATIVE.feishuRestore(versionId, resumeId));
      if (typeof fetch === 'function') {
        return httpJson('POST', '/api/sync/restore', { versionId: versionId, resumeId: resumeId }).then(function (r) {
          try { return JSON.parse(r.json); } catch (e) { return r.json; }
        });
      }
      return Promise.reject(new Error(FEISHU_UNAVAILABLE_MSG));
    },
    loadConfig: function () {
      // 浏览器模式：优先直连本地服务读取；无服务（file:// 等）返回 null
      if (NATIVE && typeof NATIVE.feishuLoadConfig === 'function') return Promise.resolve(NATIVE.feishuLoadConfig());
      if (typeof fetch === 'function') {
        return httpJson('GET', '/api/sync/config').then(function (j) { return j.config || null; }).catch(function () { return null; });
      }
      return Promise.resolve(null);
    },
    saveConfig: function (cfg) {
      if (NATIVE && typeof NATIVE.feishuSaveConfig === 'function') return Promise.resolve(NATIVE.feishuSaveConfig(cfg));
      if (typeof fetch === 'function') {
        return httpJson('POST', '/api/sync/config', cfg).then(function (j) { return { configured: !!j.configured }; });
      }
      return Promise.reject(new Error(FEISHU_UNAVAILABLE_MSG));
    },
    probe: function (req) {
      if (NATIVE && typeof NATIVE.feishuProbe === 'function') return Promise.resolve(NATIVE.feishuProbe(req));
      if (typeof fetch === 'function') {
        return httpJson('POST', '/api/sync/probe', req);
      }
      return Promise.reject(new Error(FEISHU_UNAVAILABLE_MSG));
    }
  };

  /* ============ 公开门面 ResumeStore ============ */
  var ResumeStore = {
    /* 读取本地持久化的 {data,fonts,spacing,v}，无则返回 null */
    load: function () {
      return LocalStore.get();
    },
    /* 写入本地持久化（防抖由调用方做）。两路并行：
       ① LocalStore（IndexedDB，无则 localStorage）——跨平台离线兜底；
       ② LocalServerStore（POST /api/resume）——保留 npm start 实时写回 data/resume.json 的工作流。
       任一后端失败都被吞掉，绝不让异常冒泡到 UI。 */
    save: function (payload) {
      return Promise.all([
        LocalStore.set(payload).catch(function () { /* 静默兜底 */ }),
        LocalServerStore.save(payload)
      ]);
    },
    /* 从飞书拉最新（可用时）；resumeId 缺省 'default'；浏览器模式抛出友好 Error */
    pull: function (resumeId) {
      return FeishuStore.pull(resumeId);
    },
    /* 推到飞书（可用时），返回 {ok,docUrl,dryRun}；不可用抛友好 Error */
    push: function (payload) {
      return FeishuStore.push(payload);
    },
    /* 返回某份简历的飞书版本数组；不可用抛友好 Error */
    listVersions: function (resumeId) {
      return FeishuStore.listVersions(resumeId);
    },
    /* 返回该版本的 {data,fonts,spacing} 载荷对象；不可用抛友好 Error */
    restore: function (versionId, resumeId) {
      return FeishuStore.restore(versionId, resumeId);
    },
    /* 返回飞书配置对象或 null */
    loadConfig: function () {
      return FeishuStore.loadConfig();
    },
    /* 保存飞书配置，返回 {configured:boolean} */
    saveConfig: function (cfg) {
      return FeishuStore.saveConfig(cfg);
    },
    /* 一键绑定探测：验证凭证 + 自动建文件夹，返回默认项 */
    probe: function (req) {
      return FeishuStore.probe(req);
    }
  };

  // 暴露调试/测试用后端引用（不强制使用）
  ResumeStore._stores = { LocalStore: LocalStore, BrowserStore: BrowserStore, FeishuStore: FeishuStore };

  global.ResumeStore = ResumeStore;
})(typeof window !== 'undefined' ? window : this);
