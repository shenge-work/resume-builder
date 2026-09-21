/* =============================================================
 * js/store/library-share.js —— N3 分享与权限控制（纯逻辑层，零 DOM）
 * -----------------------------------------------------------------------------
 * 需求 N3 的 F1–F4 全部落在「简历库 meta 多几个字段」这件事上，因此这里
 * 只做纯数据与判定，不做任何界面：
 *
 *   F1 锁定     isLocked(meta)              —— 锁定后编辑区只读，防止误改定稿简历
 *   F2 分享开关 isPublic(meta) + shareGate  —— 只有显式开启分享的简历才允许导出分享页
 *   F3 分享标识 genToken/ensureToken/tokenOf—— 本地生成的唯一标识，随 meta 落盘
 *   F4 完整导出 buildBundle/parseBundle     —— 整库 JSON 备份的构造与校验（含血缘重映射）
 *
 * ⚠️ 关于 F3 的诚实边界（需求文档 §六 工程护栏 2 明确要求）：
 *   本项目没有服务端，分享靠「导出静态 HTML」。所以 token 不是可远程吊销的短链，
 *   而是分享页的**身份标识**（导出时写进页面 <meta name="resume-share-token">）。
 *   重设 token 只影响之后导出的页面 —— 已经发出去的静态页收不回来。
 *   界面文案必须如实说明这一点，不能假装能「吊销链接」。
 *
 * 挂载：window.ResumeShare = { ... }
 * ============================================================= */
(function (global) {
  'use strict';

  var BUNDLE_FORMAT = 'resume-builder-library';
  var BUNDLE_V = 1;
  var TOKEN_LEN = 20;

  /* 备份/恢复时保留的 meta 字段白名单（避免把内部缓存字段一并带出去） */
  var META_KEYS = [
    'id', 'title', 'source', 'docId', 'updatedAt', 'tags', 'kind',
    'parentId', 'jobId', 'jdText',
    /* N3 新增 */
    'isPublic', 'isLocked', 'shareToken',
    /* 飞书同步进度：一起备份，恢复后不必重新整份推送 */
    'lastHash', 'lastPushedHash', 'lastRemoteFp'
  ];

  function isLocked(meta) { return !!(meta && meta.isLocked); }
  function isPublic(meta) { return !!(meta && meta.isPublic); }

  /* F2 分享门禁：允许导出分享页的唯一条件是「这份简历显式开启了分享」。
     返回 {allowed, reason, message}；reason 供 UI 决定提示语气，纯函数便于测试。
     reason: 'no-resume'（没选中简历）/ 'not-public'（未开启）/ 'ok' */
  function shareGate(meta) {
    if (!meta || !meta.id) {
      return { allowed: false, reason: 'no-resume', message: '请先选择或新建一份简历。' };
    }
    if (!isPublic(meta)) {
      return {
        allowed: false,
        reason: 'not-public',
        message: '「' + (meta.title || '未命名简历') + '」还没有开启分享。开启后导出的只读页会带上这份简历的分享标识。'
      };
    }
    return { allowed: true, reason: 'ok', message: '' };
  }

  /* F3 分享标识（token）：本地随机生成，随 meta 落盘。 */
  function genToken() {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var s = '';
    for (var i = 0; i < TOKEN_LEN; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }
  function tokenOf(meta) { return (meta && meta.shareToken) ? String(meta.shareToken) : ''; }
  /* 有则原样返回，无则给一个新 token。
     ⚠️ 不写回、不落盘 —— 落盘由调用方经 ResumeLibrary.patchMeta 完成，
     调用方用 `ensureToken(m) !== tokenOf(m)` 判断是不是新生成的。 */
  function ensureToken(meta) { return tokenOf(meta) || genToken(); }

  /* 分享标识的展示文案（复制到剪贴板 / 通知里用，避免 UI 各处自己拼） */
  function tokenNote(meta) {
    var t = tokenOf(meta);
    if (!t) return '';
    return '分享标识：' + t +
      '（导出分享页时会写入页面 meta，用于标记这份简历的分享版本；' +
      '本项目无托管后端，已导出的静态页发出去后无法远程吊销，重设标识只影响之后导出的页面。）';
  }

  /* ---------- F4 整库备份 ---------- */

  function sanitizeMeta(meta) {
    var out = {};
    if (!meta || typeof meta !== 'object') return out;
    META_KEYS.forEach(function (k) {
      if (meta[k] !== undefined && meta[k] !== null) out[k] = meta[k];
    });
    return out;
  }

  /* 构造整库备份对象。entries = [{meta, payload}]，payload 为 {data,fonts,spacing,v}。 */
  function buildBundle(entries, opts) {
    opts = opts || {};
    var items = [];
    (entries || []).forEach(function (e) {
      if (!e) return;
      var meta = sanitizeMeta(e.meta);
      if (!meta.id) return;
      items.push({ meta: meta, payload: e.payload || null });
    });
    return {
      format: BUNDLE_FORMAT,
      v: BUNDLE_V,
      app: 'resume-builder',
      exportedAt: Date.now(),
      note: opts.note || '简历库完整备份：含每份简历的元数据（标签 / 血缘 / 分享与锁定状态）与正文载荷。',
      count: items.length,
      items: items
    };
  }

  /* 解析备份（字符串或已解析对象）。
     返回 {ok, items:[{meta,payload}], skipped, error}。
     兼容两种输入：① 本函数产出的整库备份；② 单份简历载荷 {data:{sections}}（当作一份导入）。 */
  function parseBundle(input) {
    var obj = input;
    if (typeof input === 'string') {
      try { obj = JSON.parse(input); }
      catch (e) { return { ok: false, items: [], skipped: 0, error: '不是有效的 JSON 文件。' }; }
    }
    if (!obj || typeof obj !== 'object') {
      return { ok: false, items: [], skipped: 0, error: '备份内容为空。' };
    }
    /* ② 单份载荷：{data:{...,sections:[]}} */
    if (!obj.items && obj.data && Array.isArray(obj.data.sections)) {
      return {
        ok: true, skipped: 0, error: '',
        single: true,
        items: [{ meta: { title: obj.data.name || '导入的简历' }, payload: obj }]
      };
    }
    if (obj.format && obj.format !== BUNDLE_FORMAT) {
      return { ok: false, items: [], skipped: 0, error: '备份格式不认识（format=' + obj.format + '）。' };
    }
    if (!Array.isArray(obj.items)) {
      return { ok: false, items: [], skipped: 0, error: '备份里没有 items 数组，可能不是简历库备份。' };
    }
    var items = [];
    var skipped = 0;
    obj.items.forEach(function (it) {
      var payload = it && it.payload;
      if (!payload || !payload.data || !Array.isArray(payload.data.sections)) { skipped++; return; }
      items.push({ meta: sanitizeMeta(it.meta), payload: payload });
    });
    if (!items.length) {
      return { ok: false, items: [], skipped: skipped, error: '备份里没有可导入的简历（正文缺失或格式不符）。' };
    }
    return { ok: true, items: items, skipped: skipped, error: '' };
  }

  /* 导入时血缘重映射：备份里的 parentId 指向备份内的旧 id，导入会分配新 id。
     返回该 meta 应该写入的新 parentId；无需改写时返回 undefined
     （母简历不在本次备份里 → 不写血缘，避免留下悬空的 parentId）。 */
  function resolveImportedParent(meta, idMap) {
    if (!meta || !idMap) return undefined;
    var old = meta.parentId;
    if (old === undefined || old === null || old === '') return undefined;
    return idMap[old] || undefined;
  }

  global.ResumeShare = {
    BUNDLE_FORMAT: BUNDLE_FORMAT,
    BUNDLE_V: BUNDLE_V,
    META_KEYS: META_KEYS,
    isLocked: isLocked,
    isPublic: isPublic,
    shareGate: shareGate,
    genToken: genToken,
    tokenOf: tokenOf,
    ensureToken: ensureToken,
    tokenNote: tokenNote,
    sanitizeMeta: sanitizeMeta,
    buildBundle: buildBundle,
    parseBundle: parseBundle,
    resolveImportedParent: resolveImportedParent
  };
})(typeof window !== 'undefined' ? window : globalThis);
