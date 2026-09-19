/*
 * datasource.js —— 多数据源适配器契约 + 注册表（M4）
 * -----------------------------------------------------------------------------
 * 设计（docs/多简历与多数据源-技术设计方案.md 第 5 章）：
 *   云笔记平台是「面向人的文档/文件存储」，不是「面向程序的 KV 库」，
 *   所以适配器统一抽象为「文档读写」——每份简历 = 一个文档（docId），
 *   适配器负责在各平台里找到它、读它、写它。
 *
 * 契约（每个数据源实现同一接口，但能力可以不同）：
 *   {
 *     id: 'feishu',                       // 唯一标识
 *     displayName: '飞书',
 *     capabilities: {                     // 能力声明 —— UI 依此自动降级
 *       list: true,      // 能否列出该平台的文档
 *       read: true,      // 能否读取文档内容
 *       write: true,     // 能否写入文档
 *       versions: true,  // 是否有版本历史
 *       export: false,   // 仅导出（如 ima：手动粘贴场景）
 *       oauth: 'app',    // 授权方式：'app' | 'oauth' | 'none'
 *     },
 *     listDocuments():  Promise<[{docId, title, updatedAt}]>,
 *     readDocument(docId):       Promise<{data,fonts,spacing,v}>,
 *     writeDocument(docId, payload): Promise<{docId}>,
 *     listVersions(docId):       Promise<[{version_id, create_time, size}]>,
 *     restoreVersion(docId, versionId): Promise<{data,fonts,spacing,v}>,
 *     loadConfig(): Promise<config|null>,
 *     saveConfig(cfg): Promise<{configured:boolean}>,
 *     probe?(req): Promise<defaults>,     // 可选：一键绑定探测（飞书特有）
 *   }
 *
 * 规则：
 *   - 不支持的方法**不实现**（调用方先看 capabilities，实现了也允许抛「不支持」）。
 *   - 注册表不持有业务逻辑，只做登记与查找；UI/仓库层按 capabilities 决定显示什么。
 *   - 零依赖、纯 <script> 可加载；挂在 window.ResumeDataSourceRegistry。
 */
(function (global) {
  'use strict';

  var _adapters = {};          // id -> adapter
  var _order = [];             // 注册顺序（UI 展示顺序）
  var _defaultId = null;       // 默认数据源（主远端）

  var Registry = {
    /* 注册一个适配器；重复注册同 id 视为更新（保留原顺序） */
    register: function (adapter) {
      if (!adapter || typeof adapter !== 'object') throw new Error('DataSourceAdapter 必须是对象');
      if (!adapter.id || typeof adapter.id !== 'string') throw new Error('DataSourceAdapter 缺少 id');
      if (!adapter.displayName) throw new Error('DataSourceAdapter 缺少 displayName');
      if (!_adapters[adapter.id]) _order.push(adapter.id);
      // 规范化 capabilities：未声明的键一律 false/'none'（保守降级）
      var caps = adapter.capabilities || {};
      adapter.capabilities = {
        list: !!caps.list,
        read: !!caps.read,
        write: !!caps.write,
        versions: !!caps.versions,
        export: !!caps.export,
        oauth: caps.oauth || 'none'
      };
      _adapters[adapter.id] = adapter;
      // 第一个注册的自动成为默认源
      if (!_defaultId) _defaultId = adapter.id;
      return adapter;
    },

    /* 按 id 取适配器；不存在返回 null */
    get: function (id) {
      return _adapters[id] || null;
    },

    /* 全部适配器（按注册顺序） */
    list: function () {
      return _order.map(function (id) { return _adapters[id]; });
    },

    /* 默认数据源（主远端）；可用 setDefault 切换 */
    getDefault: function () {
      return _adapters[_defaultId] || null;
    },
    getDefaultId: function () {
      return _defaultId;
    },
    setDefault: function (id) {
      if (!_adapters[id]) throw new Error('数据源不存在: ' + id);
      _defaultId = id;
    },

    /* 能力查询快捷方式：某源是否支持某能力 */
    supports: function (id, cap) {
      var a = _adapters[id];
      if (!a) return false;
      if (cap === 'oauth') return a.capabilities.oauth !== 'none';
      return !!a.capabilities[cap];
    },

    /* 测试辅助：清空注册表（仅测试环境使用） */
    _reset: function () {
      _adapters = {}; _order = []; _defaultId = null;
    }
  };

  global.ResumeDataSourceRegistry = Registry;
})(typeof window !== 'undefined' ? window : this);
