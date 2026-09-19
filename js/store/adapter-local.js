/*
 * adapter-local.js —— 本地数据源适配器（M4）
 * -----------------------------------------------------------------------------
 * 把「本地 IndexedDB（ResumeLibrary）」包装成 DataSourceAdapter。
 * 本地是「锚点」数据源：永远可用、零门槛、离线兜底（设计文档 2.4 节）。
 *
 * 能力：list/read/write 全支持；versions 暂 false（快照能力后续接 recordHistory）；
 *       export true（本地导出文件即手动导出场景）；无授权概念。
 * 依赖：window.ResumeLibrary（js/store/resume-library.js，须在本文件之前加载）。
 */
(function (global) {
  'use strict';

  var Lib = global.ResumeLibrary;
  if (!Lib || typeof Lib.list !== 'function') {
    return; // resume-library 未加载：不注册（保持零回归）
  }

  global.ResumeDataSourceRegistry.register({
    id: 'local',
    displayName: '本地',
    capabilities: { list: true, read: true, write: true, versions: false, export: true, oauth: 'none' },

    listDocuments: function () {
      return Lib.list().then(function (items) {
        return items.map(function (m) {
          return { docId: m.id, title: m.title, updatedAt: m.updatedAt, source: 'local' };
        });
      });
    },

    readDocument: function (docId) {
      return Lib.load(docId);
    },

    writeDocument: function (docId, payload) {
      return Lib.save(docId, payload).then(function () { return { docId: docId }; });
    },

    loadConfig: function () { return Promise.resolve(null); },
    saveConfig: function () { return Promise.resolve({ configured: true }); }
  });
})(typeof window !== 'undefined' ? window : this);
