/*
 * ResumeLibrary —— 多简历仓库（M1 多简历数据模型）
 * -----------------------------------------------------------------------------
 * 零依赖纯 JS，挂在 window.ResumeLibrary 上，负责「多份简历」的编排：
 *   - 索引清单（体积小、频繁读写）：一份「我有哪些简历」的元数据表
 *   - 独立简历文档（体积大、按需加载）：每份简历 = 一个 {data,fonts,spacing,v} 载荷
 *
 * 与现有 ResumeStore 的关系：
 *   ResumeStore 是「单份简历」的读写门面（本地 IndexedDB / 飞书）；
 *   ResumeLibrary 在其之上新增「多份」的编排，**不改动 ResumeStore 的对外接口**。
 *   本期（M1/M2）只落地「本地多份」：所有文档存本地 IndexedDB（复用 ResumeStore 的
 *   LocalStore 后端键空间，但用独立 object store 与键前缀，避免与单份数据串味）。
 *
 * 设计要点：
 *   - 库本身不直接碰任何云平台，远端同步留待 M4 数据源适配器抽象后再接（接口已预留）。
 *   - 任何持久化错误都在库内部被吞掉，绝不让异常冒泡到 UI。
 *   - 首份简历自动「继承」现有单份数据（data/resume.json 或 localStorage），保证
 *     老用户升级后不丢内容。
 */
(function (global) {
  'use strict';

  var DB_NAME = 'resume_library';        // 独立 IndexedDB 库，不与 resume-store 的 resume_builder 串味
  var DB_STORE = 'kv';                    // 单 object store，键区分「索引清单 / 文档 / 激活态」
  var KEY_INDEX = 'index';                // 索引清单键
  var KEY_ACTIVE = 'active';              // 当前激活简历 id 键
  var DOC_PREFIX = 'resume:';             // 简历文档键前缀：resume:<id>

  /* ============ 底层：Promise 化的 IndexedDB 封装（零依赖） ============ */
  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined' || !indexedDB) { reject(new Error('no indexedDB')); return; }
      var req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
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
        try { tx = db.transaction(DB_STORE, 'readonly'); store = tx.objectStore(DB_STORE); r = store.get(key); }
        catch (e) { reject(e); return; }
        r.onsuccess = function () { resolve(r.result === undefined ? null : r.result); };
        r.onerror = function () { reject(r.error || new Error('idb get error')); };
      }).then(function (v) { try { db.close(); } catch (_) {} return v; });
    });
  }
  function idbSet(key, val) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx, store, r;
        try { tx = db.transaction(DB_STORE, 'readwrite'); store = tx.objectStore(DB_STORE); r = store.put(val, key); }
        catch (e) { reject(e); return; }
        r.onsuccess = function () { resolve(); };
        r.onerror = function () { reject(r.error || new Error('idb put error')); };
      }).then(function () { try { db.close(); } catch (_) {} });
    });
  }
  function idbDel(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx, store, r;
        try { tx = db.transaction(DB_STORE, 'readwrite'); store = tx.objectStore(DB_STORE); r = store.delete(key); }
        catch (e) { reject(e); return; }
        r.onsuccess = function () { resolve(); };
        r.onerror = function () { reject(r.error || new Error('idb delete error')); };
      }).then(function () { try { db.close(); } catch (_) {} });
    });
  }

  /* ============ 内存态：索引缓存 + 激活 id ============ */
  var _index = null;      // [{id,title,source,updatedAt}] 的缓存，null 表示未加载
  var _activeId = null;   // 当前激活简历 id

  function genId() {
    return 'res_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ============ 索引清单读写 ============ */
  function readIndex() {
    if (_index) return Promise.resolve(_index);
    return idbGet(KEY_INDEX).then(function (idx) {
      _index = (idx && Array.isArray(idx)) ? idx : [];
      return _index;
    }).catch(function () { _index = []; return _index; });
  }
  function writeIndex() {
    return idbSet(KEY_INDEX, _index || []).catch(function () { /* 吞掉 */ });
  }
  function readActiveId() {
    if (_activeId) return Promise.resolve(_activeId);
    return idbGet(KEY_ACTIVE).then(function (v) { _activeId = v || null; return _activeId; })
      .catch(function () { _activeId = null; return null; });
  }
  function writeActiveId() {
    return idbSet(KEY_ACTIVE, _activeId || null).catch(function () { /* 吞掉 */ });
  }

  /* ============ 公开门面 ResumeLibrary ============ */
  var ResumeLibrary = {
    /* 初始化：加载索引与激活 id；若为空库，尝试继承现有单份数据建首份简历 */
    init: function () {
      return readIndex().then(function () { return readActiveId(); }).then(function () {
        // 空库 → 引导首份简历（由调用方在 app.js 里用种子数据 create 完成，
        // 这里只确保索引与激活态存在、不主动造数据）
        return { activeId: _activeId, count: (_index || []).length };
      });
    },

    /* 列出全部简历元数据（不含正文），按 updatedAt 倒序 */
    list: function () {
      return readIndex().then(function (idx) {
        return idx.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      });
    },

    /* 新建简历。opts = { title, fromResumeId?, payload? }
       - fromResumeId：基于某份复制（duplicate 走此路径）
       - payload：直接给定 {data,fonts,spacing,v}（新建空白 / 继承单份数据时用）
       返回新简历的元数据 {id,title,updatedAt} */
    create: function (opts) {
      opts = opts || {};
      var id = genId();
      var payload = null;
      var p;
      if (opts.payload && opts.payload.data) {
        payload = opts.payload;
      }
      return readIndex().then(function () {
        var title = opts.title || '未命名简历';
        var meta = { id: id, title: title, source: 'local', docId: null, updatedAt: Date.now(), tags: [] };
        _index.push(meta);
        _activeId = id;
        var chain;
        if (payload) {
          chain = idbSet(DOC_PREFIX + id, payload);
        } else if (opts.fromResumeId) {
          chain = idbGet(DOC_PREFIX + opts.fromResumeId).then(function (doc) {
            var copy = doc ? JSON.parse(JSON.stringify(doc)) : { data: { name: '', contact: [], sections: [] }, fonts: null, spacing: null, v: 8 };
            return idbSet(DOC_PREFIX + id, copy);
          });
        } else {
          chain = idbSet(DOC_PREFIX + id, { data: { name: '', contact: [], sections: [] }, fonts: null, spacing: null, v: 8 });
        }
        return chain.then(function () { return writeIndex(); }).then(function () { return writeActiveId(); })
          .then(function () { return meta; });
      });
    },

    /* 加载某份简历的完整载荷；不存在返回 null */
    load: function (id) {
      return idbGet(DOC_PREFIX + id).then(function (doc) { return doc || null; });
    },

    /* 保存某份简历（写入本地文档 + 更新索引 updatedAt/title） */
    save: function (id, payload, meta) {
      return readIndex().then(function () {
        var m = _index.filter(function (x) { return x.id === id; })[0];
        if (m) {
          if (meta && meta.title) m.title = meta.title;
          m.updatedAt = Date.now();
        }
        return idbSet(DOC_PREFIX + id, payload).then(function () { return writeIndex(); });
      });
    },

    /* 重命名 */
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

    /* 删除（若删的是激活简历，激活态清空） */
    remove: function (id) {
      return readIndex().then(function () {
        _index = _index.filter(function (x) { return x.id !== id; });
        if (_activeId === id) _activeId = null;
        return idbDel(DOC_PREFIX + id).catch(function () { /* 文档不存在也无妨 */ })
          .then(function () { return writeIndex(); })
          .then(function () { return writeActiveId(); });
      });
    },

    /* 切换激活简历 */
    setActive: function (id) {
      _activeId = id;
      return writeActiveId();
    },
    getActive: function () {
      return readActiveId().then(function () { return _activeId; });
    },

    /* 兼容测试/调试：暴露后端引用 */
    _stores: { idbGet: idbGet, idbSet: idbSet, idbDel: idbDel, KEY_INDEX: KEY_INDEX, KEY_ACTIVE: KEY_ACTIVE }
  };

  global.ResumeLibrary = ResumeLibrary;
})(typeof window !== 'undefined' ? window : this);
