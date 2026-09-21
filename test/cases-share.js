/* N3 分享与权限控制（js/store/library-share.js）纯逻辑测试。
   与 cases-audit.js 同构：CommonJS，由运行器 require 后逐条执行，
   通过 ctx.ResumeShare 访问 vm 上下文里的 window.ResumeShare，断言走 ctx.assert。

   覆盖：锁定 / 分享判定、分享门禁（shareGate）、分享标识（token）、
   整库备份的构造（buildBundle）与解析（parseBundle）、导入时的血缘重映射。
   这些都是「不碰 DOM 的纯函数」——所以能直接断言，不需要浏览器。

   ⚠️ ResumeLibrary 侧的写入路径（meta 白名单透传、删除撤销栈）在 cases-library.js 里测。 */

'use strict';

module.exports = [
  {
    name: '锁定 / 分享判定：只在显式为 true 时算数',
    fn: (ctx) => {
      const S = ctx.ResumeShare;
      ctx.assert(S.isLocked(undefined) === false, 'undefined 视为未锁定');
      ctx.assert(S.isLocked({}) === false, '缺字段视为未锁定');
      ctx.assert(S.isLocked({ isLocked: true }) === true, 'isLocked:true 判为锁定');
      ctx.assert(S.isLocked({ isLocked: 1 }) === true, '真值也算锁定（容错老数据）');
      ctx.assert(S.isPublic({}) === false, '缺字段视为未分享');
      ctx.assert(S.isPublic({ isPublic: true }) === true, 'isPublic:true 判为已分享');
    }
  },
  {
    name: '分享门禁 shareGate：没简历 / 未开启 / 已开启 三态',
    fn: (ctx) => {
      const S = ctx.ResumeShare;
      const a = S.shareGate(null);
      ctx.assert(a.allowed === false && a.reason === 'no-resume', '没有简历 → 不允许（no-resume）');
      const b = S.shareGate({ id: 'res_1', title: '张三的简历' });
      ctx.assert(b.allowed === false && b.reason === 'not-public', '未开启分享 → 不允许（not-public）');
      ctx.assert(b.message.indexOf('张三的简历') >= 0, '提示里带上简历标题，便于用户对号入座');
      const c = S.shareGate({ id: 'res_1', isPublic: true });
      ctx.assert(c.allowed === true && c.reason === 'ok', '已开启分享 → 允许');
      ctx.assert(c.message === '', '允许时不产生提示文案');
    }
  },
  {
    name: '分享标识 token：20 位、两次不同、ensure 不改写 meta',
    fn: (ctx) => {
      const S = ctx.ResumeShare;
      const t1 = S.genToken();
      const t2 = S.genToken();
      ctx.assert(typeof t1 === 'string' && t1.length === 20, 'token 长度 20');
      ctx.assert(/^[a-z0-9]{20}$/.test(t1), 'token 只含小写字母与数字（可安全放进 URL / 文件名）');
      ctx.assert(t1 !== t2, '两次生成不相同（随机性）');
      ctx.assert(S.tokenOf({}) === '', '无 token 时 tokenOf 返回空串');
      ctx.assert(S.tokenOf({ shareToken: 'abc' }) === 'abc', '有 token 时原样返回');
      const meta = { id: 'res_1' };
      const got = S.ensureToken(meta);
      ctx.assert(got.length === 20, 'ensureToken 无 token 时补一个新的');
      ctx.assert(meta.shareToken === undefined, '⚠️ ensureToken 不写回 meta（落盘必须由调用方显式 patchMeta）');
      ctx.assert(S.ensureToken({ shareToken: 'keepme' }) === 'keepme', '已有 token 时确保不被覆盖');
    }
  },
  {
    name: '分享标识文案：如实说明「无法远程吊销」',
    fn: (ctx) => {
      const S = ctx.ResumeShare;
      ctx.assert(S.tokenNote({}) === '', '没有 token 时不产生文案');
      const note = S.tokenNote({ shareToken: 'abc123' });
      ctx.assert(note.indexOf('abc123') >= 0, '文案里含 token');
      ctx.assert(note.indexOf('无法远程吊销') >= 0, '⚠️ 必须写明静态页发出去后无法远程吊销（需求 §六 护栏 2）');
    }
  },
  {
    name: '备份 meta 白名单：只带白名单字段，N3 新字段在内',
    fn: (ctx) => {
      const S = ctx.ResumeShare;
      ['isPublic', 'isLocked', 'shareToken'].forEach((k) => {
        ctx.assert(S.META_KEYS.indexOf(k) >= 0, '白名单含 ' + k );
      });
      const out = S.sanitizeMeta({
        id: 'res_1', title: 'T', tags: ['a'], isLocked: true,
        innerCache: 'xx', __secret: 'yy', undefined0: undefined
      });
      ctx.assert(out.id === 'res_1' && out.title === 'T', '保留 id / title');
      ctx.assert(Array.isArray(out.tags) && out.tags[0] === 'a', '保留 tags');
      ctx.assert(out.isLocked === true, '保留 isLocked');
      ctx.assert(!('innerCache' in out), '剔除不在白名单里的字段');
      ctx.assert(!('__secret' in out), '剔除未知字段（不把内部缓存带出去）');
      ctx.assert(S.sanitizeMeta(null) && Object.keys(S.sanitizeMeta(null)).length === 0, 'null 安全返回空对象');
    }
  },
  {
    name: 'buildBundle：构造整库备份并跳过无 id 项',
    fn: (ctx) => {
      const S = ctx.ResumeShare;
      const bundle = S.buildBundle([
        { meta: { id: 'res_1', title: 'A', isPublic: true }, payload: { data: { sections: [] } } },
        { meta: { title: '没有 id' }, payload: { data: { sections: [] } } },
        null
      ]);
      ctx.assert(bundle.format === S.BUNDLE_FORMAT, 'format 正确');
      ctx.assert(bundle.v === S.BUNDLE_V, '版本号正确');
      ctx.assert(bundle.count === 1 && bundle.items.length === 1, '只收下带 id 的那一份');
      ctx.assert(typeof bundle.exportedAt === 'number' && bundle.exportedAt > 0, '带导出时间戳');
      ctx.assert(bundle.items[0].meta.isPublic === true, '权限状态随备份带出');
      ctx.assert(!!bundle.items[0].payload, 'payload 原样带回');
    }
  },
  {
    name: 'parseBundle：识别整库备份 / 单份载荷 / 坏输入',
    fn: (ctx) => {
      const S = ctx.ResumeShare;
      const good = S.buildBundle([
        { meta: { id: 'res_1', title: 'A', isPublic: true, isLocked: true, shareToken: 'tok' }, payload: { data: { sections: [] } } }
      ]);
      const r1 = S.parseBundle(JSON.stringify(good));
      ctx.assert(r1.ok === true && r1.items.length === 1, '整库备份可解析');
      ctx.assert(r1.items[0].meta.shareToken === 'tok', '解析后保留 shareToken');

      /* 单份简历载荷也允许导入（历史导出 / 手工拼的 JSON） */
      const r2 = S.parseBundle({ data: { name: '李四', contact: [], sections: [] } });
      ctx.assert(r2.ok === true && r2.single === true, '单份载荷被识别（single）');
      ctx.assert(r2.items[0].meta.title === '李四', '单份载荷用姓名兜底标题');

      ctx.assert(S.parseBundle('{不是 json').ok === false, '坏 JSON → ok:false');
      ctx.assert(S.parseBundle('{不是 json').error.indexOf('JSON') >= 0, '坏 JSON 给出可读错误');
      ctx.assert(S.parseBundle({ format: 'someone-else' }).ok === false, '陌生 format → ok:false');
      ctx.assert(S.parseBundle({ hello: 1 }).ok === false, '没有 items 数组 → ok:false');
      const empty = S.parseBundle({ items: [{ meta: {}, payload: null }] });
      ctx.assert(empty.ok === false, 'items 里没有可用正文 → ok:false');
      ctx.assert(empty.skipped === 1, '如实统计被跳过的条数');
    }
  },
  {
    name: '导入血缘重映射：只映射备份内的母简历',
    fn: (ctx) => {
      const S = ctx.ResumeShare;
      const idMap = { res_old_parent: 'res_new_parent' };
      ctx.assert(S.resolveImportedParent({ parentId: 'res_old_parent' }, idMap) === 'res_new_parent', '备份内母简历 → 映射到新 id');
      ctx.assert(S.resolveImportedParent({ parentId: 'res_not_here' }, idMap) === undefined, '母简历不在备份里 → 不写血缘（避免悬空引用）');
      ctx.assert(S.resolveImportedParent({}, idMap) === undefined, '无 parentId → 不写');
      ctx.assert(S.resolveImportedParent({ parentId: 'x' }, null) === undefined, '无 idMap → 不写');
    }
  }
];
