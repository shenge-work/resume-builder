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
  },

  /* ---------- A3：结构化字段抽取 ---------- */
  {
    name: 'classifySectionLine：板块标题归一化',
    fn: (ctx) => {
      ctx.assert(ctx.classifySectionLine('工作经历') === 'career', '工作经历→career');
      ctx.assert(ctx.classifySectionLine('教育背景') === 'education', '教育背景→education');
      ctx.assert(ctx.classifySectionLine('专业技能') === 'skills', '专业技能→skills');
      ctx.assert(ctx.classifySectionLine('这是很长的一行正文不会命中板块标题') === null, '长正文不误判为标题');
      // 关键失效面：含关键词但整行过长（非板块标题）→ 必须仍返回 null，否则正文会被误切
      ctx.assert(ctx.classifySectionLine('这里有一大段非常长的文字其中提到了工作经历这个词汇但整行远超板块标题该有的长度') === null, '含关键词但超长不误判为板块标题');
    }
  },
  {
    name: 'extractDateRange：抽取日期段',
    fn: (ctx) => {
      ctx.assert(ctx.extractDateRange('2023.03 - 2025.06') === '2023.03 - 2025.06', '点分日期段');
      ctx.assert(ctx.extractDateRange('2019.06-至今') === '2019.06-至今', '至今日期段');
      ctx.assert(ctx.extractDateRange('负责后端开发') === null, '非日期行返回 null');
    }
  },
  {
    name: 'extractCareer：识别公司/岗位/时间',
    fn: (ctx) => {
      const lines = [
        '工作经历',
        '2023.03 - 2025.06',
        '云启科技',
        '全栈工程师',
        '参与企业 SaaS 平台的功能研发'
      ];
      const items = ctx.extractCareer(lines);
      ctx.assert(items.length === 1, '识别出一段经历');
      ctx.assert(items[0].company === '云启科技', '公司名识别');
      ctx.assert(items[0].role === '全栈工程师', '岗位识别');
      ctx.assert(items[0].date === '2023.03 - 2025.06', '时间识别');
    }
  },
  {
    name: 'extractCareer：多段经历切分',
    fn: (ctx) => {
      const lines = [
        '工作经历',
        '2023.03 - 2025.06', '云启科技', '全栈工程师',
        '2021.07 - 2023.02', '智联数据', '后端工程师'
      ];
      const items = ctx.extractCareer(lines);
      ctx.assert(items.length === 2, '切分为两段');
      ctx.assert(items[0].company === '云启科技' && items[1].company === '智联数据', '两段公司名各自正确');
    }
  },
  {
    name: 'extractCareer：低置信度标注',
    fn: (ctx) => {
      const lines = ['工作经历', '2023.03 - 2025.06', '一段只有时间没有公司岗位的行'];
      const items = ctx.extractCareer(lines);
      ctx.assert(items.length === 1, '识别出一段');
      ctx.assert(items[0].__lowConfidence === true, '缺公司/岗位标低置信度');
    }
  },
  {
    name: 'extractEducation：识别学校/学位',
    fn: (ctx) => {
      const lines = ['教育背景', '示例大学', '计算机科学与技术 · 本科', '2019 - 2023'];
      const items = ctx.extractEducation(lines);
      ctx.assert(items.length >= 1, '识别出教育经历');
      ctx.assert(/示例大学/.test(items[0].school), '学校识别');
      ctx.assert(/本科/.test(items[0].degree), '学位识别');
    }
  },
  {
    name: 'extractSkills：抽取技能关键词去重',
    fn: (ctx) => {
      const lines = ['专业技能', 'Java、Python、Docker、Kubernetes', '熟悉 Java 与 Spring Boot'];
      const s = ctx.extractSkills(lines);
      ctx.assert(s.indexOf('Java') >= 0, 'Java 被抽取');
      ctx.assert(s.indexOf('Docker') >= 0, 'Docker 被抽取');
      ctx.assert(s.filter(x => x === 'Java').length === 1, 'Java 去重');
    }
  },
  {
    name: 'buildResumeData：结构化落到 career section',
    fn: (ctx) => {
      const lines = ['张三', 'demo@example.com', '工作经历', '2023.03 - 2025.06', '云启科技', '全栈工程师'];
      const r = ctx.buildResumeData({ lines, pageCount: 1 });
      const career = r.data.sections.find(s => s.type === 'career');
      ctx.assert(!!career, '生成 career section');
      ctx.assert(career.items[0].company === '云启科技', '公司落到 career.items');
    }
  },
  {
    name: 'buildResumeData：结构化不丢原文兜底',
    fn: (ctx) => {
      const lines = ['张三', '工作经历', '2023.03 - 2025.06', '云启科技', '全栈工程师'];
      const r = ctx.buildResumeData({ lines, pageCount: 1 });
      const hasImport = r.data.sections.some(s => s.type === 'advantages' && /导入原文/.test(s.title));
      ctx.assert(hasImport, '导入原文兜底 section 仍存在');
    }
  },
  {
    name: 'buildResumeData：无结构化板块时行为同旧版',
    fn: (ctx) => {
      const lines = ['测试者', '一段普通工作描述没有明确板块标题'];
      const r = ctx.buildResumeData({ lines, pageCount: 1 });
      ctx.assert(!r.data.sections.some(s => s.type === 'career'), '无板块标题不臆造 career');
      ctx.assert(r.data.sections[0].type === 'advantages', '落点为 advantages（原文）');
    }
  }
];
