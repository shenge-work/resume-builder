/* PDF 解析：extractName / extractContact / buildResumeData 纯函数用例
 * 契约：CommonJS module.exports = [{name, fn}]，断言走 ctx.assert(cond, msg)。
 * ctx 提供 ctx.extractName / ctx.extractContact / ctx.buildResumeData（由 run.js 从 tools/pdf-parse.js 注入）。
 * 说明：extractText/parsePdfToResume 依赖 pdf.js 真实解析，不进这里的纯函数用例（避免测试依赖 vendor 大文件）。 */
'use strict';

module.exports = [
  {
    name: '姓名识别：取首行短文本',
    fn: (ctx) => {
      ctx.assert(ctx.extractName(['测试者', 'Agent 开发工程师']) === '测试者', '首行短姓名被识别');
    }
  },
  {
    name: '姓名识别：跳过标题行「简历/RESUME」',
    fn: (ctx) => {
      const r = ctx.extractName(['RESUME', '测试者', '电话 13800000000']);
      ctx.assert(r === '测试者', '跳过 RESUME 标题，取到真实姓名');
    }
  },
  {
    name: '姓名识别：首行是联系方式时跳过',
    fn: (ctx) => {
      const r = ctx.extractName(['138-0000-0000', 'demo.resume@example.com', '测试者']);
      ctx.assert(r === '测试者', '跳过联系方式行，取到姓名');
    }
  },
  {
    name: '姓名识别：首行过长时放弃猜测',
    fn: (ctx) => {
      const r = ctx.extractName(['这是一段非常长的自我介绍文字超过了姓名的合理长度阈值不应该被当作姓名']);
      ctx.assert(r === null, '首行过长不臆造姓名');
    }
  },
  {
    name: '联系方式：抓取邮箱与手机号',
    fn: (ctx) => {
      const c = ctx.extractContact(['联系：demo.resume@example.com', '手机 13800138000']);
      ctx.assert(c.indexOf('demo.resume@example.com') >= 0, '邮箱被抓取');
      ctx.assert(c.indexOf('13800138000') >= 0, '手机号被抓取');
    }
  },
  {
    name: '联系方式：抓取学历/学校线索',
    fn: (ctx) => {
      const c = ctx.extractContact(['示例大学计算机学院 · 2021届统招本科']);
      ctx.assert(c.length >= 1 && /大学|本科/.test(c[0]), '学校/学历线索被抓取');
    }
  },
  {
    name: '联系方式：去重保序',
    fn: (ctx) => {
      const c = ctx.extractContact(['a@b.com', 'a@b.com', '13800000000']);
      ctx.assert(c.filter(x => x === 'a@b.com').length === 1, '邮箱去重');
    }
  },
  {
    name: 'buildResumeData：姓名与联系方式写入 data',
    fn: (ctx) => {
      const pdf = { lines: ['测试者', 'demo.resume@example.com', '一段工作经历描述文字'], pageCount: 2 };
      const r = ctx.buildResumeData(pdf);
      ctx.assert(r.data.name === '测试者', 'name 正确');
      ctx.assert(r.data.contact.indexOf('demo.resume@example.com') >= 0, 'contact 含邮箱');
      ctx.assert(r.data.sections.length >= 1, '至少生成一个 section');
      ctx.assert(r.data.sections[0].type === 'advantages', '落点为 advantages 类型');
    }
  },
  {
    name: 'buildResumeData：正文不丢（导入原文保留）',
    fn: (ctx) => {
      const pdf = { lines: ['张三', '工作经历正文一行', '项目经历正文二行'], pageCount: 1 };
      const r = ctx.buildResumeData(pdf);
      const texts = r.data.sections[0].items.map(i => i.text);
      ctx.assert(texts.indexOf('工作经历正文一行') >= 0, '正文一行保留');
      ctx.assert(texts.indexOf('项目经历正文二行') >= 0, '正文二行保留');
    }
  },
  {
    name: 'buildResumeData：姓名行不重复进正文',
    fn: (ctx) => {
      const pdf = { lines: ['测试者', '正文内容'], pageCount: 1 };
      const r = ctx.buildResumeData(pdf);
      const texts = r.data.sections[0].items.map(i => i.text);
      ctx.assert(texts.indexOf('测试者') < 0, '姓名行不重复进正文');
    }
  },
  {
    name: 'buildResumeData：meta 标记 PDF 页数',
    fn: (ctx) => {
      const r = ctx.buildResumeData({ lines: ['张三', '正文'], pageCount: 3 });
      ctx.assert(/3\s*页/.test(r.data.meta || ''), 'meta 含页数标记');
    }
  }
];
