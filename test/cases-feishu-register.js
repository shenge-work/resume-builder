/* 飞书「个人应用」扫码注册（Device Flow）纯函数用例
   覆盖：addons 编码（gzip+base64+URL-safe 往返）、poll 响应→本地状态的映射。
   网络相关的 begin / poll 走真实飞书端点，不在单测里打真实网络。
   遵循本仓库 cases 约定：module.exports = [{name, fn}]，fn(ctx) 通过 ctx.assert / ctx.feishuRegister 取依赖。 */
'use strict';
const zlib = require('zlib');

module.exports = [
  {
    name: 'encodeAddons 输出为 URL-safe（无 + / =）',
    fn(ctx) {
      const addons = { scopes: { user: ['drive:drive', 'docx:document'], tenant: ['drive:drive', 'docx:document'] } };
      const encoded = ctx.feishuRegister.encodeAddons(addons);
      ctx.assert(/^[A-Za-z0-9_-]+$/.test(encoded), 'encodeAddons 结果仅含 A-Z a-z 0-9 - _');
    }
  },
  {
    name: 'encodeAddons 解码后与原对象一致',
    fn(ctx) {
      const addons = { scopes: { user: ['drive:drive', 'docx:document'], tenant: ['drive:drive', 'docx:document'] } };
      const encoded = ctx.feishuRegister.encodeAddons(addons);
      const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(zlib.gunzipSync(Buffer.from(base64, 'base64')).toString('utf8'));
      ctx.assert(JSON.stringify(decoded) === JSON.stringify(addons), '解码往返一致');
    }
  },
  {
    name: 'mapPollStatus：success 返回 client_id/client_secret',
    fn(ctx) {
      const c = { domain: 'accounts.feishu.cn', larkDomain: 'accounts.larksuite.com', domainSwitched: false };
      const r = ctx.feishuRegister.mapPollStatus({ client_id: 'cli_x', client_secret: 'sec', user_info: { open_id: 'ou' } }, c);
      ctx.assert(r.status === 'success' && r.client_id === 'cli_x' && r.client_secret === 'sec', 'success 携带凭证');
      ctx.assert(c.domainSwitched === false, 'feishu 用户不触发域名切换');
    }
  },
  {
    name: 'mapPollStatus：authorization_pending → waiting',
    fn(ctx) { ctx.assert(ctx.feishuRegister.mapPollStatus({ error: 'authorization_pending' }, {}).status === 'waiting', 'pending→waiting'); }
  },
  {
    name: 'mapPollStatus：slow_down → slow_down',
    fn(ctx) { ctx.assert(ctx.feishuRegister.mapPollStatus({ error: 'slow_down' }, {}).status === 'slow_down', 'slow_down→slow_down'); }
  },
  {
    name: 'mapPollStatus：access_denied → failed',
    fn(ctx) { ctx.assert(ctx.feishuRegister.mapPollStatus({ error: 'access_denied', error_description: '用户拒绝' }, {}).status === 'failed', 'denied→failed'); }
  },
  {
    name: 'mapPollStatus：expired_token → expired',
    fn(ctx) { ctx.assert(ctx.feishuRegister.mapPollStatus({ error: 'expired_token' }, {}).status === 'expired', 'expired→expired'); }
  },
  {
    name: 'mapPollStatus：未知 error → failed',
    fn(ctx) { ctx.assert(ctx.feishuRegister.mapPollStatus({ error: 'weird' }, {}).status === 'failed', '未知错误→failed'); }
  },
  {
    name: 'mapPollStatus：空响应 → waiting',
    fn(ctx) { ctx.assert(ctx.feishuRegister.mapPollStatus({}, {}).status === 'waiting', '空→waiting'); }
  },
  {
    name: 'mapPollStatus：tenant_brand=lark 触发一次域名切换',
    fn(ctx) {
      const c = { domain: 'accounts.feishu.cn', larkDomain: 'accounts.larksuite.com', domainSwitched: false };
      const r = ctx.feishuRegister.mapPollStatus({ error: 'authorization_pending', user_info: { tenant_brand: 'lark' } }, c);
      ctx.assert(r.status === 'waiting' && c.domainSwitched === true, 'lark 品牌触发切换');
    }
  },
];
