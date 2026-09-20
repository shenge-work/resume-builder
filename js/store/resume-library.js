/*  * ResumeLibrary —— 多简历仓库（统一分文件模型）
 * -----------------------------------------------------------------------------
 * 零依赖纯 JS，挂在 window.ResumeLibrary 上，负责「多份简历」的编排：
 *   - 索引清单（体积小、频繁读写）：一份「我有哪些简历」的元数据表
 *   - 独立简历文档（体积大、按需加载）：每份简历 = 一个 {data,fonts,spacing,v} 载荷
 *
 * 存储后端抽象（与飞书同步「分文件」同构——一份简历 = 一个文档，docId = resumeId）：
 *   1) window.__RESUME_NATIVE__（Tauri 原生壳）→ resume_index_* 与 resume_doc_* 命令
 *      → <app_data_dir>/resumes/index.json + <id>.json
 *   2) fetch 可用（npm start 开发模式）→ /api/library/* → data/resumes/index.json + <id>.json
 *      （若请求失败 —— file:// / 静态托管 / 写服务未启动 —— 自动降级 localStorage 兜底，
 *        见 httpBackendWithFallback：否则这些环境下编辑只存内存，刷新即全部丢失）
 *   3) 均不可用 → 内存 Map 降级（仅当前会话）
 *   外部可用 setBackend() 注入后端（native-bridge.js 在原生壳就绪后调用）。
 *
 * 文件名 = 简历 id（稳定锚点）：
 *   · 重命名 / 打标签只改 index.json 里的 title/tags，正文文件不动；
 *   · 与飞书按 id 分键（file_token_<id>）同构，本地与远端天然一致。
 * 内容指纹（lastHash / 同步进度）也随 index 项持久化：
 *   · lastHash       —— 本地最近一次落盘的内容指纹（本地自动保存哈希比对用）
 *   · lastPushedHash / lastRemoteFp / skipNextPull / lastPushNotifyAt —— 飞书自动同步进度
 *
 * 任何持久化错误都在库内部被吞掉，绝不让异常冒泡到 UI。
 */
(function (global) {
  'use strict';

  var _backend = null;    // 当前后端（惰性检测）
  var _index = null;      // [{id,title,source,docId,updatedAt,tags,lastHash,...}] 缓存
  var _activeId = null;   // 当前激活简历 id
  var _backendSet = false;

  function genId() {
    return 'res_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ============ 后端检测 / 注入 ============ */
  function nativeBackend(NATIVE) {
    return {
      kind: 'native',
      listIndex: function () {
        return Promise.resolve(NATIVE.resumeIndexLoad()).then(function (v) { return v || { active: null, items: [] }; });
      },
      writeIndex: function (idx) { return Promise.resolve(NATIVE.resumeIndexSave(idx)).then(function () { return idx; }); },
      loadDoc: function (id) { return Promise.resolve(NATIVE.resumeDocLoad(id)); },
      saveDoc: function (id, doc) { return Promise.resolve(NATIVE.resumeDocSave(id, doc)); },
      removeDoc: function (id) { return Promise.resolve(NATIVE.resumeDocRemove(id)); }
    };
  }

  function httpBackend() {
    function j(method, path, body) {
      return fetch(path, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      }).then(function (r) {
        return r.json().then(function (j2) {
          if (!r.ok) throw new Error(j2 && j2.error ? j2.error : ('HTTP ' + r.status));
          return j2;
        });
      });
    }
    return {
      kind: 'http',
      listIndex: function () {
        return j('GET', '/api/library/index').then(function (v) { return (v && v.index) || { active: null, items: [] }; });
      },
      writeIndex: function (idx) { return j('POST', '/api/library/index', idx).then(function () { return idx; }); },
      loadDoc: function (id) { return j('GET', '/api/library/doc?id=' + encodeURIComponent(id)).then(function (v) { return (v && v.doc) || null; }); },
      saveDoc: function (id, doc) { return j('POST', '/api/library/doc?id=' + encodeURIComponent(id), doc); },
      removeDoc: function (id) { return j('DELETE', '/api/library/doc?id=' + encodeURIComponent(id)); }
    };
  }

  function memoryBackend() {
    var docs = {};
    var idx = { active: null, items: [] };
    return {
      kind: 'memory',
      listIndex: function () { return Promise.resolve(JSON.parse(JSON.stringify(idx))); },
      writeIndex: function (v) { idx = JSON.parse(JSON.stringify(v)); return Promise.resolve(v); },
      loadDoc: function (id) { return Promise.resolve(docs[id] ? JSON.parse(JSON.stringify(docs[id])) : null); },
      saveDoc: function (id, doc) { docs[id] = JSON.parse(JSON.stringify(doc)); return Promise.resolve(doc); },
      removeDoc: function (id) { delete docs[id]; return Promise.resolve({ ok: true }); }
    };
  }

  /* ============ localStorage 兜底后端 ============
     file://（单文件版双击打开）、静态托管（python http.server / GitHub Pages）、
     写服务未启动等场景下 fetch /api/* 必然失败，没有兜底时编辑只存内存，刷新即全部丢失。
     这里用 localStorage 承载同一套「index + 分文档」模型，让这些环境恢复持久化。 */
  var LS_INDEX_KEY = 'resume_library_index_v1';
  var LS_DOC_PREFIX = 'resume_library_doc_';
  function localStorageBackend() {
    function readJson(key, fallback) {
      try { var raw = global.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
      catch (e) { return fallback; }
    }
    function writeJson(key, val) {
      try { global.localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 配额满等：吞掉，绝不让异常冒泡 */ }
      return Promise.resolve(val);
    }
    return {
      kind: 'localstorage',
      listIndex: function () { return Promise.resolve(readJson(LS_INDEX_KEY, { active: null, items: [] })); },
      writeIndex: function (idx) { return writeJson(LS_INDEX_KEY, idx); },
      loadDoc: function (id) { return Promise.resolve(readJson(LS_DOC_PREFIX + id, null)); },
      saveDoc: function (id, doc) { return writeJson(LS_DOC_PREFIX + id, doc); },
      removeDoc: function (id) {
        try { global.localStorage.removeItem(LS_DOC_PREFIX + id); } catch (e) {}
        return Promise.resolve({ ok: true });
      }
    };
  }

  /* http 后端 + 自动降级：任一请求失败（网络错误 / 404 / 非 JSON）即永久切到 localStorage
     并用 localStorage 重试本次操作。锁定后不再回 http，避免读写分裂在两个存储里。
     npm start 正常场景 http 全部成功，localStorage 永不启用（数据仍统一落 data/resumes/）。 */
  var _lsFallback = null;
  /* 降级通知钩子：http 写盘失败会静默切到 localStorage，并在调用方看来「成功」。
     若不把这一刻暴露给 UI，用户会以为改动已经落盘，直到某天发现文件根本没变
     —— 因此降级必须是一次**可被感知的事件**，而不是无声的兜底。 */
  var _degradeHandler = null;
  function httpBackendWithFallback() {
    var http = httpBackend();
    function wrap(name) {
      return function () {
        var args = arguments;
        if (_lsFallback) return _lsFallback[name].apply(null, args);
        return http[name].apply(null, args).catch(function () {
          if (!_lsFallback) {
            _lsFallback = localStorageBackend();
            if (typeof _degradeHandler === 'function') { try { _degradeHandler(); } catch (e) {} }
          }
          return _lsFallback[name].apply(null, args);
        });
      };
    }
    return {
      kind: 'http+ls',
      listIndex: wrap('listIndex'),
      writeIndex: wrap('writeIndex'),
      loadDoc: wrap('loadDoc'),
      saveDoc: wrap('saveDoc'),
      removeDoc: wrap('removeDoc')
    };
  }

  function detectBackend() {
    if (_backend) return _backend;
    var NATIVE = (global.__RESUME_NATIVE__ && typeof global.__RESUME_NATIVE__ === 'object') ? global.__RESUME_NATIVE__ : null;
    if (NATIVE && typeof NATIVE.resumeDocLoad === 'function' && typeof NATIVE.resumeIndexLoad === 'function') {
      _backend = nativeBackend(NATIVE);
    } else if (typeof fetch === 'function') {
      _backend = httpBackendWithFallback();
    } else {
      _backend = memoryBackend();
    }
    return _backend;
  }

  /* 后端必须是 {listIndex, writeIndex, loadDoc, saveDoc, removeDoc} */
  function setBackend(b) {
    if (!b || typeof b.listIndex !== 'function' || typeof b.writeIndex !== 'function' ||
        typeof b.loadDoc !== 'function' || typeof b.saveDoc !== 'function' || typeof b.removeDoc !== 'function') {
      return false;
    }
    _backend = b;
    _backendSet = true;
    // 换后端后内存态作废（下次操作重新从新后端读）
    _index = null;
    _activeId = null;
    // 外部注入后端（原生壳就绪）后，http→localStorage 降级标记作废
    _lsFallback = null;
    return true;
  }

  /* ============ 索引 / 激活态读写 ============ */
  function readIndex() {
    if (_index) return Promise.resolve(_index);
    return detectBackend().listIndex().then(function (idx) {
      _index = (idx && Array.isArray(idx.items)) ? idx.items : [];
      _activeId = (idx && idx.active) || null;
      return _index;
    }).catch(function () { _index = []; _activeId = null; return _index; });
  }
  function writeIndex() {
    return detectBackend().writeIndex({ active: _activeId, items: _index || [] }).catch(function () { /* 吞掉 */ });
  }
  function readActiveId() {
    if (_activeId) return Promise.resolve(_activeId);
    return readIndex().then(function () { return _activeId; });
  }

  /* ============ 公开门面 ResumeLibrary ============ */
  var ResumeLibrary = {
    /* 注入存储后端（原生壳就绪后由 native-bridge.js 调用） */
    setBackend: setBackend,

    /* 初始化：加载索引与激活 id；空库由调用方（app.js）用种子数据 create 完成 */
    init: function () {
      return readIndex().then(function () {
        return { activeId: _activeId, count: (_index || []).length };
      });
    },

    /* 列出全部简历元数据（不含正文），按 updatedAt 倒序 */
    list: function () {
      return readIndex().then(function (idx) {
        return idx.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      });
    },

    /* 同步取某份简历的元数据（依赖内存索引缓存；未初始化返回 null） */
    getMeta: function (id) {
      if (!_index) return null;
      for (var i = 0; i < _index.length; i++) {
        if (_index[i].id === id) return _index[i];
      }
      return null;
    },

    /* 新建简历。opts = { title, fromResumeId?, payload?, parentId?, kind?, jobId?, jdText? }
       - fromResumeId：基于某份复制（duplicate 走此路径）
       - payload：直接给定 {data,fonts,spacing,v}（新建空白 / 继承单份数据时用）
       - parentId / kind / jobId / jdText：简历血缘（Resume Matcher 的 master→tailored 模型）。
         kind = 'master' | 'derived'（缺省 'master'）；派生版 parentId 指向母简历、jobId 关联 JD、
         jdText 存 JD 原文（供回溯 / 复用），全部可选、向后兼容。
       返回新简历的元数据 {id,title,updatedAt,...} */
    create: function (opts) {
      opts = opts || {};
      var id = genId();
      var payload = null;
      if (opts.payload && opts.payload.data) payload = opts.payload;
      return readIndex().then(function () {
        var title = opts.title || '未命名简历';
        var meta = { id: id, title: title, source: 'local', docId: null, updatedAt: Date.now(), tags: [],
          kind: opts.kind === 'derived' ? 'derived' : 'master' };
        if (opts.parentId != null) meta.parentId = opts.parentId;
        if (opts.jobId != null) meta.jobId = opts.jobId;
        if (opts.jdText != null) meta.jdText = String(opts.jdText);
        _index.push(meta);
        _activeId = id;
        var chain;
        if (payload) {
          chain = detectBackend().saveDoc(id, payload);
        } else if (opts.fromResumeId) {
          chain = detectBackend().loadDoc(opts.fromResumeId).then(function (doc) {
            var copy = doc ? JSON.parse(JSON.stringify(doc)) : { data: { name: '', contact: [], sections: [] }, fonts: null, spacing: null, v: 8 };
            return detectBackend().saveDoc(id, copy);
          });
        } else {
          chain = detectBackend().saveDoc(id, { data: { name: '', contact: [], sections: [] }, fonts: null, spacing: null, v: 8 });
        }
        return chain.then(function () { return writeIndex(); })
          .then(function () { return meta; });
      });
    },

    /* 加载某份简历的完整载荷；不存在返回 null */
    load: function (id) {
      return detectBackend().loadDoc(id).then(function (doc) { return doc || null; });
    },

    /* 保存某份简历（写入本地文档 + 更新索引 updatedAt/title/lastHash 等元数据）。
       meta 可带：title（重命名）、lastHash（本地内容指纹）、
       lastPushedHash / lastRemoteFp / skipNextPull / lastPushNotifyAt（飞书同步进度）、
       parentId / kind / jobId / jdText（简历血缘，白名单透传，缺省不动） */
    save: function (id, payload, meta) {
      return readIndex().then(function () {
        var m = _index.filter(function (x) { return x.id === id; })[0];
        if (m) {
          if (meta && meta.title) m.title = meta.title;
          if (meta && typeof meta === 'object') {
            if (meta.lastHash !== undefined) m.lastHash = meta.lastHash;
            if (meta.lastPushedHash !== undefined) m.lastPushedHash = meta.lastPushedHash;
            if (meta.lastRemoteFp !== undefined) m.lastRemoteFp = meta.lastRemoteFp;
            if (meta.skipNextPull !== undefined) m.skipNextPull = !!meta.skipNextPull;
            if (meta.lastPushNotifyAt !== undefined) m.lastPushNotifyAt = meta.lastPushNotifyAt;
            if (meta.parentId !== undefined) m.parentId = meta.parentId;
            if (meta.kind !== undefined) m.kind = meta.kind === 'derived' ? 'derived' : 'master';
            if (meta.jobId !== undefined) m.jobId = meta.jobId;
            if (meta.jdText !== undefined) m.jdText = String(meta.jdText);
          }
          m.updatedAt = Date.now();
        }
        return detectBackend().saveDoc(id, payload).then(function () { return writeIndex(); });
      });
    },

    /* 局部更新某份简历的同步/指纹/血缘元数据（不动正文、不动 updatedAt） */
    patchMeta: function (id, meta) {
      return readIndex().then(function () {
        var m = _index.filter(function (x) { return x.id === id; })[0];
        if (!m || !meta || typeof meta !== 'object') return;
        if (meta.lastHash !== undefined) m.lastHash = meta.lastHash;
        if (meta.lastPushedHash !== undefined) m.lastPushedHash = meta.lastPushedHash;
        if (meta.lastRemoteFp !== undefined) m.lastRemoteFp = meta.lastRemoteFp;
        if (meta.skipNextPull !== undefined) m.skipNextPull = !!meta.skipNextPull;
        if (meta.lastPushNotifyAt !== undefined) m.lastPushNotifyAt = meta.lastPushNotifyAt;
        if (meta.parentId !== undefined) m.parentId = meta.parentId;
        if (meta.kind !== undefined) m.kind = meta.kind === 'derived' ? 'derived' : 'master';
        if (meta.jobId !== undefined) m.jobId = meta.jobId;
        if (meta.jdText !== undefined) m.jdText = String(meta.jdText);
        return writeIndex();
      });
    },

    /* 重命名（只改索引，正文文件不动） */
    rename: function (id, title) {
      return readIndex().then(function () {
        var m = _index.filter(function (x) { return x.id === id; })[0];
        if (m) { m.title = title || m.title; m.updatedAt = Date.now(); }
        return writeIndex();
      });
    },

    /* 设置标签（覆盖写）。tags 为字符串数组，自动 trim + 去空 + 去重 */
    setTags: function (id, tags) {
      return readIndex().then(function () {
        var m = _index.filter(function (x) { return x.id === id; })[0];
        if (m) {
          var arr = Array.isArray(tags) ? tags : [];
          var seen = {};
          m.tags = arr.map(function (t) { return String(t || '').trim(); })
                      .filter(function (t) { return t && !seen[t] && (seen[t] = true); });
          m.updatedAt = Date.now();
        }
        return writeIndex();
      });
    },

    /* 复制：基于某份新建（标题加「副本」后缀） */
    duplicate: function (id) {
      var self = this;
      return readIndex().then(function () {
        var m = _index.filter(function (x) { return x.id === id; })[0];
        var title = (m ? m.title : '简历') + ' 副本';
        return self.create({ title: title, fromResumeId: id });
      });
    },

    /* 派生：基于母简历生成一份「一岗一版」派生简历（Resume Matcher 的 master→tailored）。
       opts = { parentId, title, payload?, jobId?, jdText? }
       - parentId：母简历 id（必填，派生版血缘锚点）
       - payload：给定则直接用；否则复制母简历正文
       - jobId / jdText：关联的 JD（可选，供回溯 / 复用）
       生成的派生版 kind='derived'、parentId 指向母简历。 */
    derive: function (opts) {
      opts = opts || {};
      var self = this;
      return readIndex().then(function () {
        var parent = opts.parentId;
        if (!parent) { throw new Error('derive 缺少 parentId'); }
        var m = _index.filter(function (x) { return x.id === parent; })[0];
        var title = opts.title || ((m ? m.title : '简历') + ' 定制版');
        var createOpts = {
          title: title,
          fromResumeId: parent,
          parentId: parent,
          kind: 'derived'
        };
        if (opts.payload && opts.payload.data) createOpts.payload = opts.payload;
        if (opts.jobId != null) createOpts.jobId = opts.jobId;
        if (opts.jdText != null) createOpts.jdText = opts.jdText;
        return self.create(createOpts);
      });
    },

    /* 列出某份母简历的所有派生版（按 updatedAt 倒序）。无血缘信息时返回 []。 */
    children: function (parentId) {
      return readIndex().then(function (idx) {
        return idx.filter(function (x) { return x.parentId === parentId; })
                  .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      });
    },

    /* 删除（若删的是激活简历，激活态清空；正文文件一并删除） */
    remove: function (id) {
      return readIndex().then(function () {
        _index = _index.filter(function (x) { return x.id !== id; });
        if (_activeId === id) _activeId = null;
        return detectBackend().removeDoc(id).catch(function () { /* 文档不存在也无妨 */ })
          .then(function () { return writeIndex(); });
      });
    },

    /* 切换激活简历 */
    setActive: function (id) {
      _activeId = id;
      return writeIndex();
    },
    getActive: function () {
      return readActiveId();
    },

    /* 当前实际生效的存储类型（供 UI 显示准确的持久化状态提示）：
       'native'（App 内）/ 'http+ls'（npm start 正常）/ 'localstorage'（已降级，仅存本浏览器）/ 'memory' */
    backendKind: function () {
      if (_lsFallback) return 'localstorage';
      try { return detectBackend().kind; } catch (e) { return 'unknown'; }
    },

    /* 注册「降级发生」回调（磁盘写盘失败、已切到浏览器存储）。
       UI 用它把静默降级变成屏幕上看得见的一行提示 + 可点的重试。 */
    onDegrade: function (fn) { _degradeHandler = (typeof fn === 'function') ? fn : null; },

    /* 当前是否处于降级态（数据仅存本浏览器，不再落盘） */
    isDegraded: function () { return !!_lsFallback; },

    /* 从降级态恢复并重试磁盘后端：清掉降级锁定，让下一次读写重新走 http。
       仍失败会再次降级并再次触发 onDegrade —— 调用方据此决定要不要继续提示。 */
    retryDisk: function () {
      var was = !!_lsFallback;
      _lsFallback = null;
      return was;
    },

    /* 兼容测试/调试：暴露后端引用 */
    _stores: {
      setBackend: setBackend,
      detectBackend: detectBackend,
      /* 清掉已定型的后端与降级锁，让下一次调用按当前环境重新探测。
         测试用：先让后端定型，再换上一个「必然失败的 fetch」来验证降级通知是否真的发出。 */
      _resetBackend: function () { _backend = null; _lsFallback = null; },
      _index: function () { return _index; }
    }
  };

  global.ResumeLibrary = ResumeLibrary;
})(typeof window !== 'undefined' ? window : this);
