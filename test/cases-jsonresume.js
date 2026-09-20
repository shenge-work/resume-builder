/* JSON Resume 适配器（js/io/jsonresume-adapter.js）纯函数用例
 * 契约：CommonJS module.exports = [{name, fn}]，断言走 ctx.assert(cond, msg)。
 * ctx 提供 ctx.fromJsonResume / ctx.toJsonResume（由 run.js require 注入）。 */
'use strict';

module.exports = [
  {
    name: 'fromJsonResume：basics 映射姓名/头衔/联系方式',
    fn: (ctx) => {
      const jr = {
        basics: { name: '测试者', label: '全栈工程师', email: 'a@b.com', phone: '13800138000' }
      };
      const r = ctx.fromJsonResume(jr);
      ctx.assert(r.data.name === '测试者', '姓名映射');
      ctx.assert(r.data.subtitle === '全栈工程师', '头衔映射');
      ctx.assert(r.data.contact.indexOf('a@b.com') >= 0, '邮箱进 contact');
      ctx.assert(r.data.contact.indexOf('13800138000') >= 0, '电话进 contact');
    }
  },
  {
    name: 'fromJsonResume：work 映射为 career section',
    fn: (ctx) => {
      const jr = {
        basics: { name: '张三' },
        work: [{ name: '云启科技', position: '全栈工程师', startDate: '2023-03', endDate: '2025-06', summary: '负责研发' }]
      };
      const r = ctx.fromJsonResume(jr);
      const career = r.data.sections.find(s => s.type === 'career');
      ctx.assert(!!career, '生成 career');
      ctx.assert(career.items[0].company === '云启科技', '公司映射');
      ctx.assert(career.items[0].role === '全栈工程师', '岗位映射');
      ctx.assert(/2023\.03/.test(career.items[0].date), '日期格式化');
    }
  },
  {
    name: 'fromJsonResume：education 映射为教育 section',
    fn: (ctx) => {
      const jr = {
        basics: { name: '张三' },
        education: [{ institution: '示例大学', area: '计算机', studyType: '本科' }]
      };
      const r = ctx.fromJsonResume(jr);
      const edu = r.data.sections.find(s => s.type === 'advantages' && /教育/.test(s.title));
      ctx.assert(!!edu, '生成教育 section');
      ctx.assert(/示例大学/.test(edu.items[0].text), '学校进文本');
    }
  },
  {
    name: 'fromJsonResume：skills 映射为矩阵式技能',
    fn: (ctx) => {
      const jr = {
        basics: { name: '张三' },
        skills: [{ name: '后端', level: '熟练', keywords: ['Java', 'Spring'] }]
      };
      const r = ctx.fromJsonResume(jr);
      const sk = r.data.sections.find(s => s.type === 'skills');
      ctx.assert(!!sk, '生成 skills');
      ctx.assert(sk.groups[0].name === '后端', '分组名映射');
      ctx.assert(/\*\*Java\*\*/.test(sk.groups[0].keywords), '关键词加粗标记');
    }
  },
  {
    name: 'fromJsonResume：空输入抛错',
    fn: (ctx) => {
      let threw = false;
      try { ctx.fromJsonResume(null); } catch (e) { threw = true; }
      ctx.assert(threw, 'null 输入抛错');
    }
  },
  {
    name: 'toJsonResume：career 反向映射为 work',
    fn: (ctx) => {
      const resume = {
        data: {
          name: '张三',
          subtitle: '全栈',
          contact: ['a@b.com', '13800138000'],
          sections: [
            { type: 'career', items: [{ company: '云启科技', role: '全栈工程师', date: '', summary: '负责研发', projects: [] }] }
          ]
        }
      };
      const jr = ctx.toJsonResume(resume);
      ctx.assert(jr.basics.name === '张三', 'name 反向映射');
      ctx.assert(jr.basics.email === 'a@b.com', 'email 拆出');
      ctx.assert(jr.basics.phone === '13800138000', 'phone 拆出');
      ctx.assert(jr.work[0].name === '云启科技', 'work.name 反向映射');
      ctx.assert(jr.work[0].position === '全栈工程师', 'work.position 反向映射');
    }
  },
  {
    name: 'toJsonResume：skills 反向映射 keywords 去粗',
    fn: (ctx) => {
      const resume = {
        data: {
          name: '张三',
          contact: [],
          sections: [
            { type: 'skills', groups: [{ name: '后端', keywords: '**Java** · **Spring**', detail: '', items: [] }] }
          ]
        }
      };
      const jr = ctx.toJsonResume(resume);
      ctx.assert(jr.skills[0].name === '后端', 'skills.name 反向映射');
      ctx.assert(jr.skills[0].keywords.indexOf('Java') >= 0, 'keywords 去掉 ** 标记');
      ctx.assert(jr.skills[0].keywords.indexOf('Spring') >= 0, '第二个 keyword');
    }
  },
  {
    name: 'toJsonResume：无法映射的板块内容不丢（并入 summary）',
    fn: (ctx) => {
      const resume = {
        data: {
          name: '张三',
          contact: [],
          sections: [
            { type: 'highlights', cards: [{ text: '一条关键印记内容' }] }
          ]
        }
      };
      const jr = ctx.toJsonResume(resume);
      ctx.assert(/关键印记内容/.test(jr.basics.summary), 'highlights 内容并入 summary 不丢');
    }
  },
  {
    name: '往返：from → to 不丢失核心字段',
    fn: (ctx) => {
      const jr = {
        basics: { name: '往返测试', email: 'x@y.com' },
        work: [{ name: '公司A', position: '工程师', startDate: '2020-01', endDate: '2022-12', summary: 's' }],
        skills: [{ name: '技能', keywords: ['K1'] }]
      };
      const resume = ctx.fromJsonResume(jr);
      const back = ctx.toJsonResume(resume);
      ctx.assert(back.basics.name === '往返测试', '往返后姓名一致');
      ctx.assert(back.work[0].name === '公司A', '往返后公司一致');
      ctx.assert(back.skills[0].keywords.indexOf('K1') >= 0, '往返后技能一致');
    }
  }
];
