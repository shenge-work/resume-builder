/* M3 飞书一键绑定：buildProbeDefaults 纯函数用例
 * 契约：CommonJS module.exports = [{name, fn}]，断言走 ctx.assert(cond, msg)。
 * ctx 提供 ctx.buildProbeDefaults（由 run.js 从 tools/feishu-sync.js 注入）。 */
'use strict';

module.exports = [
  {
    name: '探测默认项回填完整五字段',
    fn: (ctx) => {
      const d = ctx.buildProbeDefaults('fld_abc123');
      ctx.assert(d && d.folder_token === 'fld_abc123', 'folder_token 回填探测结果');
      ctx.assert(d.doc_title === '简历数据备份', 'doc_title 默认值正确');
      ctx.assert(d.file_name === 'resume.json', 'file_name 默认值正确');
      ctx.assert(d.domain === 'feishu.cn', 'domain 默认值正确');
      ctx.assert(d.fileUploadMode === 'versioned', 'fileUploadMode 默认版本化');
    }
  },
  {
    name: 'folder_token 缺失时回退根目录 0',
    fn: (ctx) => {
      const d = ctx.buildProbeDefaults(null);
      ctx.assert(d.folder_token === '0', 'null → 回退 0');
      const d2 = ctx.buildProbeDefaults('');
      ctx.assert(d2.folder_token === '0', '空串 → 回退 0');
      const d3 = ctx.buildProbeDefaults(undefined);
      ctx.assert(d3.folder_token === '0', 'undefined → 回退 0');
    }
  },
  {
    name: 'folder_token 有效时原样保留',
    fn: (ctx) => {
      const d = ctx.buildProbeDefaults('fld_zzz999');
      ctx.assert(d.folder_token === 'fld_zzz999', '有效 folder_token 不被覆盖');
    }
  },
  {
    name: '认证分键：user 模式带 _user 后缀',
    fn: (ctx) => {
      ctx.assert(ctx.authStateKey('file_token', 'user') === 'file_token_user', 'user 模式 → file_token_user');
      ctx.assert(ctx.authStateKey('document_id', 'user') === 'document_id_user', 'user 模式 → document_id_user');
    }
  },
  {
    name: '认证分键：app/未知模式用原键（向后兼容旧 state）',
    fn: (ctx) => {
      ctx.assert(ctx.authStateKey('file_token', 'app') === 'file_token', 'app 模式 → 原键 file_token');
      ctx.assert(ctx.authStateKey('document_id', undefined) === 'document_id', '缺省 → 原键 document_id');
    }
  },
  {
    name: '认证分键：两套身份的键互不相同',
    fn: (ctx) => {
      ctx.assert(ctx.authStateKey('file_token', 'user') !== ctx.authStateKey('file_token', 'app'), 'user/app 键隔离（防串身份写错文件）');
    }
  }
];
