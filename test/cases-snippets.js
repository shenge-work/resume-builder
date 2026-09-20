/* 经历素材库（js/store/snippet-library.js）纯函数用例
 * 契约：CommonJS module.exports = [{name, fn}]，断言走 ctx.assert(cond, msg)。
 * ctx 提供 ctx.normalizeTags / ctx.matchSnippets / ctx.makeSnippet。 */
'use strict';

module.exports = [
  {
    name: 'normalizeTags：去重去空 trim',
    fn: (ctx) => {
      const t = ctx.normalizeTags([' 微服务 ', '微服务', '', 'Java', null]);
      ctx.assert(t.length === 2, '去重去空后 2 个');
      ctx.assert(t[0] === '微服务' && t[1] === 'Java', 'trim + 保序');
    }
  },
  {
    name: 'normalizeTags：非数组返回空数组',
    fn: (ctx) => {
      ctx.assert(ctx.normalizeTags(null).length === 0, 'null 返回空');
      ctx.assert(ctx.normalizeTags('不是数组').length === 0, '字符串返回空');
    }
  },
  {
    name: 'makeSnippet：构造片段对象',
    fn: (ctx) => {
      const s = ctx.makeSnippet('  分布式锁实践  ', ['Java', 'Redis'], '  实现分布式锁  ');
      ctx.assert(s.title === '分布式锁实践', '标题 trim');
      ctx.assert(s.content === '实现分布式锁', '内容 trim');
      ctx.assert(s.tags.indexOf('Java') >= 0 && s.tags.indexOf('Redis') >= 0, '标签归一化');
      ctx.assert(/^snip_/.test(s.id), 'id 前缀正确');
    }
  },
  {
    name: 'matchSnippets：按关键词命中数排序',
    fn: (ctx) => {
      // 故意把「命中少」的放前面，验证 sort 真的按命中数重排（而非靠数组原顺序碰巧）
      const snips = [
        { id: 'b', title: 'Java 项目', tags: ['Java'], content: 'Spring Boot' },
        { id: 'c', title: '与关键词无关', tags: [], content: '其他' },
        { id: 'a', title: '微服务架构', tags: ['K8s', 'Docker', 'Java'], content: '搭建微服务' }
      ];
      const r = ctx.matchSnippets(snips, ['K8s', 'Java']);
      ctx.assert(r.length === 2, '命中 2 个片段（c 无关）');
      ctx.assert(r[0].snippet.id === 'a', '命中 2 词的排最前（靠排序而非原顺序）');
      ctx.assert(r[1].snippet.id === 'b', '命中 1 词的其次');
    }
  },
  {
    name: 'matchSnippets：英文关键词不区分大小写',
    fn: (ctx) => {
      const snips = [{ id: 'x', title: '', tags: [], content: '使用 Kubernetes 部署' }];
      const r = ctx.matchSnippets(snips, ['kubernetes']);
      ctx.assert(r.length === 1, '小写关键词命中大写内容');
    }
  },
  {
    name: 'matchSnippets：无关键词返回空',
    fn: (ctx) => {
      const r = ctx.matchSnippets([{ id: 'x', title: 'a', tags: [], content: 'b' }], []);
      ctx.assert(r.length === 0, '无检索词返回空');
    }
  }
];
