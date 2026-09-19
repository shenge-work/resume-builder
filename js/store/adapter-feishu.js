/*
 * adapter-feishu.js —— 飞书数据源适配器（M4）
 * -----------------------------------------------------------------------------
 * 把 ResumeStore 的飞书能力（FeishuStore：浏览器 HTTP / 原生 NATIVE 双路）
 * 包装成 DataSourceAdapter，注册进 ResumeDataSourceRegistry。
 *
 * 能力（对齐现状）：
 *   read/write/versions = true（上传/下载/版本历史齐备）；
 *   list = false（当前飞书链路是「单备份文档」模型，无多文档列表，M5+ 演进）；
 *   oauth = 'app'（自建应用 app_id/secret）。
 *
 * 文档模型（第一版）：
 *   飞书侧当前是「每应用一份备份（docx + 云盘 resume.json）」，因此
 *   readDocument/writeDocument 忽略 docId（恒为 'default'），与 ResumeStore 语义一致。
 * 依赖：window.ResumeStore（js/store/resume-store.js，须在本文件之前加载）。
 */
(function (global) {
  'use strict';

  var RS = global.ResumeStore;
  if (!RS || !RS._stores || !RS._stores.FeishuStore) {
    return; // resume-store 未加载：不注册（保持零回归）
  }
  var F = RS._stores.FeishuStore;

  global.ResumeDataSourceRegistry.register({
    id: 'feishu',
    displayName: '飞书',
    capabilities: { list: false, read: true, write: true, versions: true, export: false, oauth: 'app' },

    /* 飞书当前为单备份模型：docId 恒为 'default' */
    listDocuments: function () {
      return Promise.reject(new Error('飞书适配器暂不支持列出文档（单备份模型）'));
    },

    readDocument: function () {
      return F.pull();
    },

    writeDocument: function (_docId, payload) {
      return F.push(payload).then(function (r) { return { docId: 'default', docUrl: r.docUrl, fileUrl: r.fileUrl, dryRun: !!r.dryRun }; });
    },

    listVersions: function () {
      return F.listVersions();
    },

    restoreVersion: function (_docId, versionId) {
      return F.restore(versionId);
    },

    loadConfig: function () { return F.loadConfig(); },
    saveConfig: function (cfg) { return F.saveConfig(cfg); },
    probe: function (req) { return F.probe(req); }
  });
})(typeof window !== 'undefined' ? window : this);
