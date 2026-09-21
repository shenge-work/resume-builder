/* JD 派生版本（js/jd-derive.js）纯函数用例
 * 契约：CommonJS module.exports = [{name, fn}]，断言走 ctx.assert(cond, msg)。
 * ctx 提供 ctx.buildDerivedPayload / ctx.fillGroupFor / ctx.suggestSentence / ctx.deriveTitle。 */
'use strict';

module.exports = [
  {
    name: 'suggestSentence：生成 STAR 占位模板',
    fn: (ctx) => {
      const s = ctx.suggestSentence('Kubernetes');
      ctx.assert(/Kubernetes/.test(s), '含关键词');
      ctx.assert(/请补真实数字/.test(s), '提示补真实事实，不臆造');
    }
  },
  {
    name: 'fillGroupFor：缺失与弱覆盖分开标注',
    fn: (ctx) => {
      const g = ctx.fillGroupFor(['K8s'], ['Docker']);
      ctx.assert(!!g, '生成分组');
      ctx.assert(/【缺失】K8s/.test(g.items[0]), '缺失项带缺失标记');
      ctx.assert(/【弱覆盖·需突出】Docker/.test(g.items[1]), '弱覆盖项带突出标记');
    }
  },
  {
    name: 'fillGroupFor：空输入返回 null',
    fn: (ctx) => {
      ctx.assert(ctx.fillGroupFor([], []) === null, '无缺失/弱覆盖返回 null');
    }
  },
  {
    name: 'fillGroupFor：关键词去重',
    fn: (ctx) => {
      const g = ctx.fillGroupFor(['Java', 'Java'], ['Java']);
      ctx.assert(g.items.length === 1, '重复关键词只保留一个');
    }
  },
  {
    name: 'buildDerivedPayload：不修改入参（深拷贝）',
    fn: (ctx) => {
      const payload = {
        data: { name: '主简历', sections: [{ id: 's1', type: 'skills', title: '技能', groups: [{ name: '后端', keywords: '', items: [] }] }] },
        fonts: { base: { val: 12 } }, spacing: {}, v: 8
      };
      const analysis = { groups: { missing: [{ term: 'K8s' }], weak: [] } };
      const out = ctx.buildDerivedPayload(payload, analysis);
      ctx.assert(payload.data.sections[0].groups.length === 1, '入参未被修改（仍只有原分组）');
      ctx.assert(out.data.sections[0].groups.length === 2, '输出副本新增了分组');
      ctx.assert(out !== payload && out.data !== payload.data, '返回的是新对象');
    }
  },
  {
    name: 'buildDerivedPayload：无 skills section 时新建',
    fn: (ctx) => {
      const payload = { data: { name: 'X', sections: [{ id: 'a', type: 'advantages', title: '优势', items: [] }] } };
      const analysis = { groups: { missing: [{ term: 'Java' }], weak: [] } };
      const out = ctx.buildDerivedPayload(payload, analysis);
      const skills = out.data.sections.filter(s => s.type === 'skills');
      ctx.assert(skills.length === 1, '新建了 skills section');
      ctx.assert(/Java/.test(skills[0].groups[0].items[0]), '缺失词进入新分组');
    }
  },
  {
    name: 'buildDerivedPayload：无缺失/弱覆盖返回干净副本',
    fn: (ctx) => {
      const payload = { data: { name: 'X', sections: [{ id: 'a', type: 'advantages', title: '优势', items: [] }] } };
      const out = ctx.buildDerivedPayload(payload, { groups: { missing: [], weak: [] } });
      ctx.assert(out.data.sections.length === 1, '不追加分组');
      ctx.assert(out.data.sections[0].type === 'advantages', '原板块保留');
    }
  },
  {
    name: 'deriveTitle：带 JD 来源标记',
    fn: (ctx) => {
      const t = ctx.deriveTitle('我的简历', '高级 Java 工程师\n负责微服务架构');
      ctx.assert(/定制/.test(t), '含定制标记');
      ctx.assert(/高级 Java 工程师/.test(t), '含 JD 岗位线索');
    }
  },
  {
    name: 'deriveTitle：无 JD 时回退默认',
    fn: (ctx) => {
      const t = ctx.deriveTitle('我的简历', '');
      ctx.assert(t === '我的简历 · JD 定制版', '无 JD 用默认后缀');
    }
  },
  {
    name: 'deriveTitle：首行是「任职要求：1、…」时提取岗位名，而不是照抄章节标题',
    fn: (ctx) => {
      const jd = '任职要求：1、3年以上AI产品经理经验，熟悉大模型应用；2、具备Python或SQL数据分析能力；3、负责过AI产品0到1落地';
      const t = ctx.deriveTitle('陈培胜', jd);
      ctx.assert(/AI产品经理/.test(t), '提取到岗位名');
      ctx.assert(!/任职要求/.test(t), '不含章节标签');
      ctx.assert(!/3年以上/.test(t), '不含年限噪声');
      ctx.assert(!/数据分析能力/.test(t), '不含后续条目内容');
    }
  },
  {
    name: 'deriveTitle：首行「岗位 + 薪资 + （城市·年限）」保留城市、丢掉年限与职责正文',
    fn: (ctx) => {
      const jd = '全栈开发工程师 20-35K·13薪（杭州·3-5年·本科）。核心职责：1、深入公司业务，聚焦Web端、移动端核心开发';
      const t = ctx.deriveTitle('陈培胜', jd);
      ctx.assert(/全栈开发工程师/.test(t), '保留岗位名');
      ctx.assert(/（杭州）/.test(t), '保留城市');
      ctx.assert(!/本科/.test(t), '丢掉学历');
      ctx.assert(!/核心职责/.test(t), '丢掉职责正文');
    }
  },
  {
    name: 'deriveTitle：带招聘标签的短岗位名（招聘：AI产品经理）',
    fn: (ctx) => {
      const t = ctx.deriveTitle('我的简历', '招聘：AI产品经理');
      ctx.assert(/AI产品经理/.test(t), '提取到岗位名');
      ctx.assert(!/招聘/.test(t), '去掉招聘前缀');
    }
  },
  {
    name: 'deriveTitle：拿不到岗位线索时仍回退首行，且长度受控',
    fn: (ctx) => {
      const t = ctx.deriveTitle('我的简历', '这是一段很长的说明文字，既没有岗位关键词，也没有换行，完全不像招聘信息正文');
      ctx.assert(/^我的简历 · 定制「.+」$/.test(t), '结构完整且非空');
      ctx.assert(t.length <= 40, '长度受控，实际 ' + t.length);
    }
  },
  {
    name: 'deriveTitle：多行 JD 里首行是公司名、次行才是岗位',
    fn: (ctx) => {
      const t = ctx.deriveTitle('我的简历', '某某科技有限公司\n岗位职责：负责后端服务开发\n任职要求：精通 Java');
      ctx.assert(/定制「.+」/.test(t), '有名字');
      ctx.assert(!/岗位职责|任职要求/.test(t), '不把章节标题当名字');
      ctx.assert(!/负责|精通/.test(t), '不把「负责/精通…」这类要求句当名字');
    }
  }
];
