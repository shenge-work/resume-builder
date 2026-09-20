/*
 * native-bridge.js —— 原生壳（Tauri 2.x）飞书桥
 * -----------------------------------------------------------------------------
 * 零依赖、纯 <script> 可加载。职责：
 *   1. 只有检测到 window.__TAURI__.core.invoke 时才干活；**检测不到立即 return**，
 *      浏览器保持零注入、零回归（AC3）。
 *   2. 检测到时填充 window.__RESUME_NATIVE__，提供 resume-store.js 期望的 6 个方法：
 *      feishuPush / feishuPull / feishuListVersions / feishuRestore / feishuLoadConfig / feishuSaveConfig
 *   3. 业务编排复刻 tools/feishu-sync.js（docx 清空重写 + 云盘版本化上传 + 版本列表/下载），
 *      唯一区别：网络传输全部交给 Rust 命令（js/store 侧再也没有 fetch / CORS 问题）。
 *
 * 【关于脚本顺序】index.html 里本文件在 resume-store.js 之后加载，而 resume-store.js 在
 * 加载时就把 window.__RESUME_NATIVE__ 快照进了闭包变量 NATIVE（见该文件 132 行）。
 * 因此这里除「赋值 __RESUME_NATIVE__」外，还做一次**迟绑定**：把已创建的 FeishuStore 的
 * 6 个入口重定向到本桥。这样两种加载顺序都能工作，且resume-store.js 无需任何修改。
 */
(function (global) {
  'use strict';

  var TAURI = global.__TAURI__;
  if (!TAURI || !TAURI.core || typeof TAURI.core.invoke !== 'function') {
    return; // 浏览器 / 纯 Web 环境：什么都不做，行为与 T1 完成后完全一致
  }

  /* ============ 底层：Tauri invoke 薄封装 ============ */
  function invoke(cmd, args) {
    return Promise.resolve(TAURI.core.invoke(cmd, args || {}));
  }
  /* 通用 JSON 转发（对应 Rust feishu_request，参数必须包在 req 里） */
  function fapi(method, path, body) {
    return invoke('feishu_request', {
      req: { method: method, path: path, body: body === undefined ? null : body }
    });
  }
  /* 二进制上传（对应 Rust feishu_upload）；bytes 为 Uint8Array */
  function fupload(path, fields, bytes) {
    return invoke('feishu_upload', {
      req: {
        method: 'POST',
        path: path,
        fields: fields || {},
        file_b64: bytesToBase64(bytes),
        file_field: 'file'
      }
    });
  }
  function cfgLoad() { return invoke('feishu_config_load'); }
  function cfgSave(cfg) { return invoke('feishu_config_save', { cfg: cfg }); }
  function stateLoad() { return invoke('state_load'); }
  function stateSave(patch) { return invoke('state_save', { state: patch }); }

  /* ============ 二进制工具：UTF-8 字节 → base64（中文安全） ============ */
  /* 严禁 btoa(jsonStr)：btoa 只接受 Latin-1，遇到中文会抛 InvalidCharacterError。
     正确链路：JSON.stringify → UTF-8 编码成字节 → 字节转 base64。 */
  var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function utf8Bytes(str) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(str);
    // 极简兜底：手写 UTF-8 编码（仅在现代 WebView 缺 TextEncoder 时走到）
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return new Uint8Array(out);
  }

  function bytesToBase64(bytes) {
    var out = [], buf = [], n = 0, len = bytes.length, i = 0;
    while (i < len) {
      var b0 = bytes[i++];
      var b1 = i < len ? bytes[i++] : -1;
      var b2 = i < len ? bytes[i++] : -1;
      var trip = (b0 << 16) | ((b1 < 0 ? 0 : b1) << 8) | (b2 < 0 ? 0 : b2);
      buf[n++] = B64_CHARS.charAt((trip >> 18) & 0x3f);
      buf[n++] = B64_CHARS.charAt((trip >> 12) & 0x3f);
      buf[n++] = b1 < 0 ? '=' : B64_CHARS.charAt((trip >> 6) & 0x3f);
      buf[n++] = b2 < 0 ? '=' : B64_CHARS.charAt(trip & 0x3f);
      if (n >= 4096) { out.push(buf.join('')); buf = []; n = 0; }
    }
    if (n) out.push(buf.join(''));
    return out.join('');
  }

  /* ============ 配置 / 状态（Rust 侧持久化） ============ */
  /* 配置：app config dir/sync.config.json（Rust 已剥离 app_secret） */
  function loadConfig() {
    return cfgLoad().then(function (c) {
      return c && typeof c === 'object' ? c : null;
    });
  }
  /* 状态：等价浏览器模式的 sync.state.json —— {file_token, document_id}，由 Rust 保管 */
  function readState() {
    return stateLoad().then(function (s) {
      return s && typeof s === 'object' ? s : {};
    });
  }
  function writeState(patch) {
    return stateSave(patch).then(function (s) {
      return s && typeof s === 'object' ? s : patch;
    });
  }
  function openUrl(cfg, kind, id) {
    var domain = (cfg && cfg.domain) || 'feishu.cn';
    return kind === 'doc'
      ? 'https://' + domain + '/docx/' + id
      : 'https://' + domain + '/drive/home/' + id;
  }

  /* ============ 业务编排：移植自 tools/feishu-sync.js ============ */
  /* 状态键按「简历 id」分键（与 Node 版 stateKeyFor 一致），兼容旧的无 id 单份键：
     读：file_token_<id> / document_id_<id> 优先，缺省回退 file_token / document_id；
     写：总是写 file_token_<id> / document_id_<id>，多份简历互不覆盖。 */
  function stateKey(base, resumeId) {
    return base + '_' + (resumeId || 'default');
  }
  function readStateKey(st, base, resumeId) {
    return st[stateKey(base, resumeId)] || st[base] || null;
  }

  /* ============ 本地简历库（统一分文件模型，对应 src-tauri/src/storage.rs） ============
     <app_data_dir>/resumes/index.json + <id>.json，与飞书 file_token_<id> 分键同构。 */
  function resumeIndexLoad() { return invoke('resume_index_load'); }
  function resumeIndexSave(index) { return invoke('resume_index_save', { index: index }); }
  function resumeDocLoad(id) { return invoke('resume_doc_load', { id: id }); }
  function resumeDocSave(id, payload) { return invoke('resume_doc_save', { id: id, payload: payload }); }
  function resumeDocRemove(id) { return invoke('resume_doc_remove', { id: id }); }

  /* ============ 导出落盘 + 原生打印（对应 src-tauri/src/export.rs） ============
     背景：App 内浏览器式 Blob + <a download> 不落盘（WKWebView bug 216918），
     改走 Rust 弹系统保存对话框写盘；window.print() 在 WKWebView 静默空操作，
     改走 WebView.print() 原生打印。详见 docs/App导出不落盘问题-根因与改造方案.md。 */
  function saveFile(defaultName, bytes) {
    return invoke('save_file', { fileName: defaultName, bytesB64: bytesToBase64(bytes) });
  }
  function printPage() { return invoke('print_page'); }

  /* ResumeLibrary 可注入的本地文件后端（与 serve.js /api/library/* 同构） */
  function localLibraryBackend() {
    return {
      kind: 'native',
      listIndex: function () {
        return resumeIndexLoad().then(function (v) { return v || { active: null, items: [] }; });
      },
      writeIndex: function (index) { return resumeIndexSave(index).then(function () { return index; }); },
      loadDoc: function (id) { return resumeDocLoad(id); },
      saveDoc: function (id, doc) { return resumeDocSave(id, doc); },
      removeDoc: function (id) { return resumeDocRemove(id); }
    };
  }

  /* docx：确保文档存在 → 清空原有 block → 写入一个 code block（内含完整 JSON） */
  function ensureDoc(cfg, resumeId) {
    return readState().then(function (st) {
      var existing = readStateKey(st, 'document_id', resumeId);
      if (existing) return existing;
      return fapi('POST', '/docx/v1/documents', { title: cfg.doc_title || '简历数据备份' })
        .then(function (d) {
          var id = d && d.document && d.document.document_id;
          if (!id) throw new Error('创建飞书文档失败：返回缺少 document_id');
          return writeState({ [stateKey('document_id', resumeId)]: id }).then(function () { return id; });
        });
    });
  }

  function writeDoc(jsonStr, cfg, resumeId) {
    return ensureDoc(cfg, resumeId).then(function (docId) {
      return fapi('GET', '/docx/v1/documents/' + docId + '/blocks/' + docId + '/children?page_size=50')
        .then(function (list) {
          var items = (list && list.items) || [];
          return items.reduce(function (chain, it) {
            return chain.then(function () {
              return fapi('DELETE', '/docx/v1/documents/' + docId + '/blocks/' + it.block_id)
                .catch(function () { /* 忽略个别删除失败，与 Node 版一致 */ });
            });
          }, Promise.resolve());
        })
        .then(function () {
          return fapi('POST', '/docx/v1/documents/' + docId + '/blocks/' + docId + '/children', {
            children: [{
              block_type: 13,
              code: {
                elements: [{ type: 'text_run', text_run: { content: jsonStr, text_elements: [] } }],
                style: { language: 1, align: 1 }
              }
            }]
          });
        })
        .then(function () { return docId; });
    });
  }

  /* 云盘文件 resume.json：默认版本化上传（upload_prepare → upload_part → upload_finish） */
  function writeFile(jsonStr, cfg, resumeId) {
    var bytes = utf8Bytes(jsonStr);
    var mode = cfg.fileUploadMode || 'versioned';
    if (mode === 'new') {
      return fupload('/drive/v1/files/upload_all', {
        file_name: cfg.file_name || 'resume.json',
        parent_folder_token: cfg.folder_token || '0'
      }, bytes).then(function (d) {
        var token = d && d.file_token;
        if (!token) throw new Error('上传飞书文件失败：返回缺少 file_token');
        return writeState({ [stateKey('file_token', resumeId)]: token }).then(function () { return token; });
      });
    }
    return readState().then(function (st) {
      var prepareBody = {
        file_name: cfg.file_name || 'resume.json',
        parent_folder_token: cfg.folder_token || '0',
        size: bytes.length
      };
      var existingToken = readStateKey(st, 'file_token', resumeId);
      if (existingToken) prepareBody.file_token = existingToken; // 带 token 即在同一文件上新开版本
      return fapi('POST', '/drive/v1/files/upload_prepare', prepareBody);
    }).then(function (prepare) {
      if (!prepare || !prepare.upload_id) throw new Error('上传准备失败：返回缺少 upload_id');
      return fupload('/drive/v1/files/upload_part', {
        upload_id: prepare.upload_id,
        block_index: String(0)
      }, bytes).then(function () {
        return fapi('POST', '/drive/v1/files/upload_finish', {
          upload_id: prepare.upload_id,
          block_num: prepare.block_num || 1
        });
      });
    }).then(function (fin) {
      var token = fin && fin.file_token;
      if (!token) throw new Error('上传飞书文件失败：返回缺少 file_token');
      return writeState({ [stateKey('file_token', resumeId)]: token }).then(function () { return token; });
    });
  }

  /* ============ 对外 6 个桥方法 ============ */
  var api = {
    /* 推到飞书：docx + 云盘双写，按 payload.id 分键存储，返回 {ok,docUrl,fileUrl,size,dryRun?} */
    feishuPush: function (payload) {
      return loadConfig().then(function (cfg) {
        if (!cfg) throw new Error('飞书未配置：请在「飞书同步 → 同步配置…」中填写 App ID / App Secret');
        var jsonStr = JSON.stringify(payload, null, 2);
        var resumeId = (payload && payload.id) || 'default';
        if (cfg.dryRun) {
          return {
            ok: true, dryRun: true,
            docUrl: '[dry-run] 飞书文档',
            fileUrl: '[dry-run] 云盘文件',
            size: jsonStr.length
          };
        }
        return Promise.all([writeDoc(jsonStr, cfg, resumeId), writeFile(jsonStr, cfg, resumeId)]).then(function (r) {
          return {
            ok: true,
            docUrl: openUrl(cfg, 'doc', r[0]),
            fileUrl: openUrl(cfg, 'file', r[1]),
            size: jsonStr.length
          };
        });
      });
    },

    /* 拉最新：取该简历版本列表第一版 → 恢复该版本 */
    feishuPull: function (resumeId) {
      return api.feishuListVersions(resumeId).then(function (versions) {
        if (!versions || !versions.length) throw new Error('飞书中还没有可用版本，请先「上报到飞书」');
        return api.feishuRestore(versions[0].version_id, resumeId);
      });
    },

    /* 版本列表（该简历无 file_token → 空数组） */
    feishuListVersions: function (resumeId) {
      return readState().then(function (st) {
        var token = readStateKey(st, 'file_token', resumeId);
        if (!token) return [];
        return fapi('GET', '/drive/v1/files/' + token + '/versions').then(function (d) {
          return (d && d.items) || [];
        });
      });
    },

    /* 恢复指定版本：由 Rust 下载二进制并在 Rust 内 JSON.parse，返回 {data,fonts,spacing} */
    feishuRestore: function (versionId, resumeId) {
      if (!versionId) return Promise.reject(new Error('缺少版本 ID'));
      return invoke('feishu_restore_data', { versionId: versionId, resumeId: resumeId }).then(function (obj) {
        if (!obj || typeof obj !== 'object') throw new Error('飞书版本内容不是合法的简历 JSON');
        return obj;
      });
    },

    /* 读取配置（未配置 → null，表单留空，与浏览器行为一致）；已由 Rust 剥离 app_secret */
    feishuLoadConfig: function () {
      return loadConfig().catch(function () { return null; });
    },

    /* 保存配置 → {configured:boolean}（Secret 留空表示不修改） */
    feishuSaveConfig: function (cfg) {
      return cfgSave(cfg || {}).then(function (r) {
        return { configured: !!(r && r.configured) };
      });
    },

    /* 一键绑定探测：验证凭证 + 自动建「简历数据」文件夹，返回默认项（M3） */
    feishuProbe: function (req) {
      return invoke('feishu_probe', { req: req || {} });
    },

    /* 导出落盘：弹系统保存对话框写盘，返回保存路径；用户取消 → null */
    saveFile: function (defaultName, bytes) {
      return saveFile(defaultName, bytes);
    },

    /* 原生打印：弥补 window.print() 在 WKWebView 里静默空操作 */
    printPage: function () {
      return printPage();
    }
  };

  /* ============ 挂载 + 迟绑定 ============ */
  global.__RESUME_NATIVE__ = api;

  function guard(fn, args) {
    try {
      return Promise.resolve(fn.apply(null, args || []));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /* resume-store.js 已抢先加载并快照过 __RESUME_NATIVE__，此处把它的 FeishuStore / LocalStore
     重定向到上面的实现（不修改 resume-store.js 本身）。 */
  (function rebindFacade() {
    var RS = global.ResumeStore;
    if (!RS || !RS._stores) return;
    if (RS._stores.FeishuStore) {
      var F = RS._stores.FeishuStore;
      F.available = true;
      /* ⚠️ 调用方参数必须透传：feishuPull/feishuListVersions/feishuRestore 都按
         resumeId 定位远端文件（file_token_<id>），丢了参数会全部退化到 default 文档，
         造成「把 A 简历的内容拉进 B 简历」的跨文档覆盖事故。 */
      F.push = function (payload) { return guard(api.feishuPush, [payload]); };
      F.pull = function (resumeId) { return guard(api.feishuPull, [resumeId]); };
      F.listVersions = function (resumeId) { return guard(api.feishuListVersions, [resumeId]); };
      F.restore = function (versionId, resumeId) { return guard(api.feishuRestore, [versionId, resumeId]); };
      F.loadConfig = function () { return guard(api.feishuLoadConfig, []); };
      F.saveConfig = function (cfg) { return guard(api.feishuSaveConfig, [cfg]); };
      F.probe = function (req) { return guard(api.feishuProbe, [req]); };
    }
    /* LocalStore（单份 default 文档）→ 本地文件系统 */
    if (RS._stores.LocalStore) {
      RS._stores.LocalStore.get = function () { return guard(api.resumeDocLoad, ['default']); };
      RS._stores.LocalStore.set = function (payload) { return guard(api.resumeDocSave, ['default', payload]); };
    }
    /* ResumeLibrary（多份，index.json + <id>.json）→ 本地文件系统 */
    var Lib = global.ResumeLibrary;
    if (Lib && typeof Lib.setBackend === 'function') {
      Lib.setBackend(localLibraryBackend());
    }
  })();
})(typeof window !== 'undefined' ? window : this);
