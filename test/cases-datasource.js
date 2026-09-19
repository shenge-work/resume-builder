/* M4 多数据源：注册表契约用例
 * 契约：CommonJS module.exports = [{name, fn}]，断言走 ctx.assert(cond, msg)。
 * ctx 提供 ctx.Registry（由 run.js 在 vm 上下文加载 datasource.js 后注入），
 * 每条用例前 run.js 已 _reset 清空注册表，用例间互不污染。 */
'use strict';

function makeAdapter(id) {
  return {
    id: id,
    displayName: id.toUpperCase(),
    capabilities: { list: true, read: true, write: true, versions: true, export: false, oauth: 'app' },
    listDocuments: function () { return Promise.resolve([]); },
    readDocument: function () { return Promise.resolve(null); },
    writeDocument: function () { return Promise.resolve({ docId: 'x' }); },
    listVersions: function () { return Promise.resolve([]); },
    restoreVersion: function () { return Promise.resolve(null); },
    loadConfig: function () { return Promise.resolve(null); },
    saveConfig: function () { return Promise.resolve({ configured: true }); }
  };
}

module.exports = [
  {
    name: '注册后可按 id 取回，displayName 保留',
    fn: (ctx) => {
      const R = ctx.Registry;
      const a = makeAdapter('local');
      R.register(a);
      const got = R.get('local');
      ctx.assert(got && got.id === 'local', '按 id 取回');
      ctx.assert(got.displayName === 'LOCAL', 'displayName 保留');
    }
  },
  {
    name: 'capabilities 未声明键规范化为保守值',
    fn: (ctx) => {
      const R = ctx.Registry;
      R.register({ id: 'x', displayName: 'X', capabilities: { read: true } });
      const caps = R.get('x').capabilities;
      ctx.assert(caps.read === true, '声明的 read 保留');
      ctx.assert(caps.list === false, '未声明的 list 归 false');
      ctx.assert(caps.versions === false, '未声明的 versions 归 false');
      ctx.assert(caps.export === false, '未声明的 export 归 false');
      ctx.assert(caps.oauth === 'none', '未声明的 oauth 归 none');
    }
  },
  {
    name: '第一个注册的自动成为默认源，setDefault 可切换',
    fn: (ctx) => {
      const R = ctx.Registry;
      R.register(makeAdapter('local'));
      ctx.assert(R.getDefaultId() === 'local', '首个注册者为默认');
      R.register(makeAdapter('feishu'));
      ctx.assert(R.getDefaultId() === 'local', '后续注册不改变默认');
      R.setDefault('feishu');
      ctx.assert(R.getDefaultId() === 'feishu', 'setDefault 生效');
      ctx.assert(R.getDefault().id === 'feishu', 'getDefault 返回切换后源');
    }
  },
  {
    name: 'list 按注册顺序返回全部适配器',
    fn: (ctx) => {
      const R = ctx.Registry;
      R.register(makeAdapter('local'));
      R.register(makeAdapter('feishu'));
      R.register(makeAdapter('tencent'));
      const ids = R.list().map(a => a.id);
      ctx.assert(ids.join(',') === 'local,feishu,tencent', '保持注册顺序');
    }
  },
  {
    name: '重复注册同 id 视为更新且不重复进 list',
    fn: (ctx) => {
      const R = ctx.Registry;
      R.register(makeAdapter('feishu'));
      R.register(makeAdapter('local'));
      const again = makeAdapter('feishu');
      again.displayName = '飞书新版';
      R.register(again);
      const ids = R.list().map(a => a.id);
      ctx.assert(ids.filter(x => x === 'feishu').length === 1, '同 id 只出现一次');
      ctx.assert(R.get('feishu').displayName === '飞书新版', '内容已更新');
    }
  },
  {
    name: 'supports 按能力查询：oauth 特殊键与普通能力',
    fn: (ctx) => {
      const R = ctx.Registry;
      R.register(makeAdapter('feishu')); // oauth: 'app', versions: true
      R.register({ id: 'ima', displayName: 'ima', capabilities: { export: true } });
      ctx.assert(R.supports('feishu', 'versions') === true, 'feishu 支持 versions');
      ctx.assert(R.supports('feishu', 'oauth') === true, 'oauth=app 视为支持');
      ctx.assert(R.supports('ima', 'oauth') === false, 'oauth=none 视为不支持');
      ctx.assert(R.supports('ima', 'export') === true, 'ima 支持 export');
      ctx.assert(R.supports('ima', 'write') === false, 'ima 不支持 write');
      ctx.assert(R.supports('不存在', 'read') === false, '未知源一律 false');
    }
  },
  {
    name: '缺 id / displayName / 非对象注册时抛错',
    fn: (ctx) => {
      const R = ctx.Registry;
      let threw1 = false, threw2 = false, threw3 = false;
      try { R.register(null); } catch (e) { threw1 = true; }
      try { R.register({ displayName: 'no id' }); } catch (e) { threw2 = true; }
      try { R.register({ id: 'x' }); } catch (e) { threw3 = true; }
      ctx.assert(threw1 && threw2 && threw3, '三种非法注册均抛错');
    }
  },
  {
    name: 'setDefault 不存在的 id 抛错',
    fn: (ctx) => {
      const R = ctx.Registry;
      let threw = false;
      try { R.setDefault('ghost'); } catch (e) { threw = true; }
      ctx.assert(threw, '未知 id 抛错');
    }
  }
];
