/* 飞书扫码授权：buildAuthorizeUrl 纯函数用例
 * 契约：CommonJS module.exports = [{name, fn}]，断言走 ctx.assert(cond, msg)。
 * ctx 提供：
 *   - buildAuthorizeUrl(opts)：在「已配置 app_id」的 mock 配置下调用；
 *   - buildAuthorizeUrlWithoutConfig()：在「空配置（无 app_id）」的 mock 下调用，期望抛错。
 * buildAuthorizeUrl 已不再接受 app_id 参数（应用身份由后端 sync.config.json 预配置），
 * 测试通过 run.js 注入的 mock 覆盖读配置，不依赖本机真实 sync.config.json。 */
'use strict';

module.exports = [
  {
    name: '授权 URL 含 app_id 与 state',
    fn: (ctx) => {
      const r = ctx.buildAuthorizeUrl({ state: 'stateabc', redirect_uri: 'http://127.0.0.1:8000/api/feishu/oauth/callback' });
      ctx.assert(typeof r.url === 'string' && r.url.indexOf('cli_test123') >= 0, 'URL 含 app_id');
      ctx.assert(r.url.indexOf('stateabc') >= 0, 'URL 含 state');
    }
  },
  {
    name: '授权 URL 含 scope（drive/docx）',
    fn: (ctx) => {
      const r = ctx.buildAuthorizeUrl({});
      ctx.assert(/scope=/.test(r.url), 'URL 含 scope 参数');
      ctx.assert(/drive%3Adrive/.test(r.url), 'URL 含 drive:drive scope');
    }
  },
  {
    name: '未配置 app_id 时抛错（应用身份未预配置）',
    fn: (ctx) => {
      let threw = false, err = null;
      try { ctx.buildAuthorizeUrlWithoutConfig(); } catch (e) { threw = true; err = e; }
      ctx.assert(threw, '缺 app_id 配置时抛错');
      ctx.assert(threw && /应用尚未配置|sync\.config\.json/.test(err && err.message || ''), '抛错信息提示应用未配置');
    }
  },
  {
    name: 'state 为空时自动生成随机 state',
    fn: (ctx) => {
      const r = ctx.buildAuthorizeUrl({ redirect_uri: 'http://x/cb' });
      ctx.assert(r.state && r.state.length >= 8, '自动生成 state 非空');
    }
  },
  {
    name: 'redirect_uri 原样透传',
    fn: (ctx) => {
      const cb = 'http://127.0.0.1:9999/api/feishu/oauth/callback';
      const r = ctx.buildAuthorizeUrl({ redirect_uri: cb });
      ctx.assert(r.redirect_uri === cb, 'redirect_uri 透传');
      ctx.assert(r.url.indexOf('redirect_uri=') >= 0, 'URL 含 redirect_uri');
    }
  }
];
