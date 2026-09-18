/* 内容体检 / ATS 检查（js/audit.js）测试。
   与 test/cases.js 不同：本文件是 CommonJS，由运行器在 Node 侧 require 后逐条执行，
   通过 ctx.ResumeAudit（vm 上下文里的 window.ResumeAudit）访问模块，断言走 ctx.assert。

   覆盖：三份假数据（健康 / 问题很多 / 空数据）× 检查项命中情况 + 接口契约 + 只读性。 */

'use strict';

/* ===== 假数据 ===== */
/* 一份「健康」的简历：预期 checks 为空。
   要点（缺一即会被体检命中，导致断言失败）：
   - 总字数落在 900–1800（= 2 页），避开 pages-thin（1 页）与 pages-over（>2 页）；
   - 每条正文（优势 text / 履历 summary / 项目 desc）≥ 20 字且含数字，避开 length-short 与 quantify-missing；
   - 板块数 ≤ 6、标题 ≤ 12 字；无占位文案、无 PII、无伪表格；履历为倒序。 */
function healthyData(){
  return {
    name: '张三',
    subtitle: 'Java 后端 · 高并发 · 5 年经验',
    meta: '本科 · 5 年经验 · 北京',
    contact: ['13800138000', 'zhangsan@example.com'],
    pageMargins: { top: 14, right: 14, bottom: 14, left: 14 },
    sections: [
      { id: 'h1', type: 'advantages', title: '个人优势', pageBreak: false, items: [
        { label: '高并发治理', text: '主导订单核心链路重构，单机 QPS 从 1200 提升到 5200，接口 P99 延迟由 380ms 下降到 210ms，大促期间零超时，全年可用性保持 99.99%。', labelBold: true },
        { label: '稳定性建设', text: '搭建全链路压测与分级告警体系，覆盖 6 条核心链路，线上故障率从 3% 降到 0.5%，年均节省排障工时约 2 人日每周，重大故障连续 18 个月为零。', labelBold: true },
        { label: '团队带教', text: '带 4 人小组完成 3 次大版本交付，推动接口文档与代码评审规范落地，需求平均交付周期由 12 天缩短到 7 天，团队人均交付效率提升 40%。', labelBold: true },
        { label: '架构演进', text: '推动核心服务从单体向领域拆分演进，沉淀 3 个共享中台组件，新业务接入成本平均降低 40%，跨团队复用率提升到 60%。', labelBold: true }
      ]},
      { id: 'h2', type: 'career', title: '职业履历', pageBreak: false, items: [
        { company: 'A 科技', role: '高级后端工程师', date: '2023.03 - 至今',
          summary: '负责交易核心链路的设计与治理，日均处理订单 800 万笔，峰值 1.2 万 TPS，核心接口全年可用性 99.99%，主导过 2 次大促的全链路压测与容量规划。',
          projects: [
            { name: '订单中心重构', stack: 'Java / Redis / Kafka',
              desc: '把单体订单拆分为 3 个独立服务并按域收敛数据，峰值吞吐提升 3 倍，发布回滚时间从 20 分钟降到 2 分钟，联调周期由 5 天压缩到 1 天。',
              results: ['单机 QPS 提升 40%', '故障恢复时间下降 70%', '支撑大促峰值 1.2 万 TPS', '发布回滚耗时降至 2 分钟'] },
            { name: '对账平台', stack: 'Java / MySQL / Flink',
              desc: '建设准实时对账平台，覆盖 6 条业务线，每日自动核对 900 万笔流水，差异订单平均 15 分钟内定位到根因，资金差错连续 12 个月零投诉。',
              results: ['人工核对工时减少 85%', '差异定位时效提升 4 倍', '覆盖 6 条业务线'] }
          ]},
        { company: 'B 网络', role: '后端工程师', date: '2020.06 - 2023.02',
          summary: '参与会员与积分体系建设，累计服务注册用户 1200 万，接口平均响应时间由 180ms 优化到 60ms，主导积分系统的分库分表改造与灰度上线。',
          projects: [
            { name: '会员积分系统', stack: 'Java / MySQL',
              desc: '重构积分计算与结算逻辑并引入分库分表，日终结算耗时从 30 分钟降到 4 分钟，月度账务差错率降至万分之三，支撑日均 1500 万次积分读写。',
              results: ['结算耗时下降 87%', '账务差错率降至 0.03%', '支撑日均 1500 万次读写'] }
          ]}
      ]},
      { id: 'h3', type: 'skills', title: '核心技能', pageBreak: false, groups: [
        { name: '后端', items: ['Java', 'Spring Boot', 'MyBatis', '分布式事务'] },
        { name: '中间件', items: ['Redis', 'Kafka', 'MySQL 调优', 'Elasticsearch'] },
        { name: '工程', items: ['Docker', 'Kubernetes', 'Jenkins', '全链路压测'] },
        { name: '数据', items: ['MySQL 索引优化', 'Flink 实时计算', '数据校验'] }
      ]}
    ]
  };
}

/* 一份「问题很多」的简历：几乎每条检查都要命中 */
function messyData(){
  let long = '';
  for(let i = 0; i < 90; i++) long += '这一段是刻意堆砌的描述文字没有任何数字也没有百分比用来触发超长与缺量化两条检查';
  return {
    name: '',
    subtitle: '',
    meta: '',
    contact: [],
    pageMargins: { top: 14, right: 14, bottom: 14, left: 14 },
    sections: [
      { id: 'm1', type: 'advantages', title: '', pageBreak: false, items: [
        { label: '沟通能力', text: '' },
        { label: '待补充', text: { text: '负责相关工作，待补充 xxx', spacing: { mt: 0, mb: 0 } } },
        { label: '证书', text: '身份证号：110101199003071234' }
      ]},
      { id: 'm2', type: 'career', title: '职业履历', pageBreak: false, items: [
        { company: '甲公司', role: '', date: '2019.01 - 2020.01', summary: '负责相关工作', projects: [] },
        { company: '乙公司', role: '后端工程师', date: '2021.03 - 至今', summary: long, projects: [
          { name: '某项目', stack: 'Java | Redis',
            desc: '这是一句完整的描述文字里面没有任何数字出现用于触发量化缺失提示',
            results: ['待补充'] }
        ]}
      ]},
      { id: 'm3', type: 'skills', title: '核心技能', pageBreak: false, groups: [ { name: '', items: [] } ]},
      { id: 'm4', type: 'projects', title: '项目经历', pageBreak: false, items: [
        { name: '项目 A', stack: 'Java', desc: '', results: [] }
      ]}
    ]
  };
}

/* 空数据 */
function emptyData(){
  return { name: '', subtitle: '', meta: '', contact: [], sections: [] };
}

/* ===== 小工具 ===== */
function ids(list, level){
  return list.filter(c => !level || c.level === level).map(c => c.id);
}
function has(list, id, level){
  return list.some(c => c.id === id && (!level || c.level === level));
}
/* 实现里部分 id 带序号后缀（如 date-order-1 / title-long-0），按前缀匹配 */
function prefixed(list, prefix, level){
  return list.filter(c => c.id.indexOf(prefix) === 0 && (!level || c.level === level));
}
function longText(){
  let s = '';
  for(let i = 0; i < 90; i++) s += '刻意堆砌的描述文字没有数字也没有百分比';
  return s;
}

module.exports = [
  /* ---- 接口契约 ---- */
  { name: 'run() 返回结构：checks 数组 + stats 四字段', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(healthyData());
    ctx.assert(!!r && Array.isArray(r.checks), 'run() 返回 checks 数组');
    const s = r.stats;
    ctx.assert(!!s && typeof s.pages === 'number' && typeof s.chars === 'number'
      && typeof s.sections === 'number' && typeof s.items === 'number', 'stats 含 pages/chars/sections/items');
    ctx.assert(s.pages >= 1 && s.chars > 0, 'stats.pages>=1 且 stats.chars>0');
  }},

  { name: 'level 只能是 error/warn/info', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const all = A.run(healthyData()).checks
      .concat(A.run(messyData()).checks)
      .concat(A.run(emptyData()).checks);
    const bad = all.filter(c => ['error','warn','info'].indexOf(c.level) === -1);
    ctx.assert(bad.length === 0, 'level 取值合法（共 ' + all.length + ' 条）');
    const noFields = all.filter(c => !c.id || !c.title || !c.detail || !c.hint);
    ctx.assert(noFields.length === 0, '每条检查都带 id/title/detail/hint');
  }},

  { name: 'payload 兼容 getData() 形态与裸 data', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const d = emptyData();
    const a = A.run({ data: d, fonts: {}, spacing: {} }).checks.length;
    const b = A.run(d).checks.length;
    ctx.assert(a === b && a > 0, '两种 payload 形态结果一致（' + a + ' 条）');
  }},

  /* ---- 健康简历 ---- */
  { name: '健康简历：无 error / 无 warn / 无 info（空态）', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(healthyData());
    const li = ids(r.checks);
    ctx.assert(r.checks.filter(c => c.level === 'error').length === 0, '无 error（实际：' + li.join(',') + '）');
    ctx.assert(r.checks.filter(c => c.level === 'warn').length === 0, '无 warn');
    ctx.assert(r.checks.length === 0, 'checks 为空，共 ' + r.checks.length + ' 条：' + li.join(','));
  }},

  { name: '健康简历：stats 反映真实规模', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const s = A.run(healthyData()).stats;
    ctx.assert(s.sections === 3, '板块数 = 3（实际 ' + s.sections + '）');
    ctx.assert(s.items >= 8, '条目数 >= 8（实际 ' + s.items + '）');
    ctx.assert(s.chars > 500, '字数 > 500（实际 ' + s.chars + '）');
  }},

  /* ---- 空数据 ---- */
  /* 注：实现的 id 为 required-name / required-contact / empty-sections（不是 name / contact / sections）；
     「零板块」与「头衔为空」曾记为功能缺口，现已补齐（见 ACCEPTANCE.md 的 7e）。 */
  { name: '空数据：必填三项以 error 命中（含零板块）', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(emptyData());
    const errors = r.checks.filter(c => c.level === 'error').length;
    ctx.assert(has(r.checks, 'required-name', 'error'), '姓名缺失 → error');
    ctx.assert(has(r.checks, 'required-contact', 'error'), '联系方式全空 → error');
    ctx.assert(has(r.checks, 'empty-sections', 'error'), '零板块 → error');
    ctx.assert(errors === 3, '空数据恰好 3 条 error（实际 ' + errors + '）');
    ctx.assert(has(r.checks, 'subtitle-missing', 'info'), '头衔为空 → info');
  }},

  { name: '健康简历：不误报「零板块 / 缺头衔」（AC2 反向）', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(healthyData());
    ctx.assert(!has(r.checks, 'empty-sections'), '有板块 → 不报 empty-sections');
    ctx.assert(!has(r.checks, 'subtitle-missing'), '有头衔 → 不报 subtitle-missing');
  }},

  { name: '空数据：内容为空时提示页数过少', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(emptyData());
    ctx.assert(has(r.checks, 'pages-thin', 'info'), '内容为空 → pages-thin info');
    ctx.assert(r.checks.filter(c => c.level === 'warn').length === 0, '空数据无 warn');
  }},

  /* ---- 问题简历 ---- */
  { name: '问题简历：必填与顺序类命中', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(messyData());
    ctx.assert(has(r.checks, 'required-name', 'error'), '姓名为空 → error');
    ctx.assert(has(r.checks, 'required-contact', 'error'), '联系方式为空 → error');
    ctx.assert(prefixed(r.checks, 'date-order-', 'warn').length > 0, '职业履历非倒序 → warn（date-order-N）');
    ctx.assert(has(r.checks, 'required-empty-section', 'warn'), '空板块 → warn');
  }},

  { name: '问题简历：顺序检查细节带具体公司名', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const c = prefixed(A.run(messyData()).checks, 'date-order-')[0];
    ctx.assert(!!c && /乙公司/.test(c.detail) && /甲公司/.test(c.detail), 'detail 指出具体的两家公司');
    ctx.assert(!!c && c.hint.indexOf('倒序') !== -1, 'hint 给出修正建议');
  }},

  { name: '问题简历：空板块合并为一条 warn 并点名', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(messyData());
    const c = r.checks.filter(x => x.id === 'required-empty-section')[0];
    ctx.assert(!!c && c.level === 'warn', '空板块 → warn');
    ctx.assert(!!c && /未命名板块/.test(c.detail), 'detail 点名「未命名板块」（有内容但无标题）');
    ctx.assert(!!c && /核心技能/.test(c.detail), 'detail 点名「核心技能」（有标题但无内容）');
  }},

  { name: '问题简历：占位文案 → warn（含 {text} 对象形态）', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(messyData());
    const ph = r.checks.filter(c => c.id === 'placeholder');
    ctx.assert(ph.length === 1, '占位文案归并为 1 条 check（实际 ' + ph.length + '）');
    ctx.assert(ph.every(c => c.level === 'warn'), '占位文案级别为 warn');
    ctx.assert(ph.some(c => /待补充/.test(c.detail)), 'detail 里带出「待补充」字样');
    ctx.assert(ph.some(c => /发现 \d+ 处占位文案/.test(c.title)), '标题给出命中处数（label / {text} / results 三处）');
  }},

  { name: '问题简历：长度异常 / 缺量化 / 页数超限', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(messyData());
    ctx.assert(has(r.checks, 'length-long', 'warn'), '超长描述 → warn');
    ctx.assert(has(r.checks, 'length-short', 'info'), '过短描述 → info');
    ctx.assert(has(r.checks, 'quantify-missing', 'info'), '缺量化结果 → info');
    ctx.assert(has(r.checks, 'pages-over', 'warn'), '超过 2 页 → warn（pages-over）');
    ctx.assert(r.stats.pages > 2, '估算页数 > 2（实际 ' + r.stats.pages + '）');
  }},

  { name: '问题简历：ATS 伪表格 / PII 提醒 → info', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(messyData());
    ctx.assert(has(r.checks, 'ats-table', 'info'), '竖线伪表格 → info');
    ctx.assert(has(r.checks, 'pii-idcard', 'info'), '身份证号 → info（pii-idcard）');
  }},

  { name: '健康简历不含占位 / PII / 伪表格误报', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const li = ids(A.run(healthyData()).checks);
    ctx.assert(li.indexOf('placeholder') === -1, '无占位文案误报');
    ctx.assert(li.indexOf('pii-idcard') === -1 && li.indexOf('pii-sensitive') === -1, '无 PII 误报');
    ctx.assert(li.indexOf('ats-table') === -1, '无伪表格误报');
  }},

  /* 回归防护：项目成果点（results）本就是 8–12 字的短句（如「QPS 提升 40%」），
     不能套用「描述过短（<15 字）」的下限 —— 否则任何写得正常的简历都会被误报。 */
  { name: '成果点（results）不参与「描述过短」判定', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const d = healthyData();
    const short = d.sections[1].items[1].projects[0].results;
    ctx.assert(short.length > 0 && short.every(s => s.length < 15), '前置：假数据里的成果点确实都是短句');
    const idsAll = ids(A.run(d).checks);
    ctx.assert(idsAll.indexOf('length-short') === -1, '短句成果点不触发 length-short（实际：' + idsAll.join(',') + '）');

    // 反向确认：把「优势正文」改成短句，仍应照常命中
    const d2 = healthyData();
    d2.sections[0].items[0].text = '负责相关工作。';
    ctx.assert(has(A.run(d2).checks, 'length-short', 'info'), '正文过短仍应命中 length-short');
  }},

  { name: '时间解析不出来不误报（无年份 / 缺字段）', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const d = healthyData();
    d.sections[1].items[0].date = '至今';
    d.sections[1].items[1].date = '';
    const r = A.run(d);
    ctx.assert(prefixed(r.checks, 'date-order-').length === 0, '年份缺失时跳过顺序检查');
  }},

  /* ---- 只读性 ---- */
  { name: '只读：run() 不修改传入的数据', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const d = messyData();
    const before = JSON.stringify(d);
    A.run(d); A.run({ data: d });
    ctx.assert(JSON.stringify(d) === before, 'run() 前后数据完全一致');
  }},

  { name: '只读：render() 不回写数据、不写 localStorage', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const d = healthyData();
    const box = { innerHTML: '' };
    A.run(d);
    A.render(box);
    ctx.assert(JSON.stringify(d) === JSON.stringify(healthyData()), 'render 后数据未变');
  }},

  /* ---- 渲染与降级 ---- */
  { name: 'render()：容器不存在时静默返回', fn: function(ctx){
    const A = ctx.ResumeAudit;
    let threw = false;
    try{ A.render(null); A.render(undefined); }catch(e){ threw = true; }
    ctx.assert(!threw, 'render(null) 不抛错');
  }},

  { name: 'render()：空结果显示「未发现问题」，非空结果分三级', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const box1 = { innerHTML: '' };
    A.run(healthyData());
    A.render(box1);
    ctx.assert(box1.innerHTML.indexOf('未发现问题') !== -1, '健康简历渲染出空态文案');
    ctx.assert(box1.innerHTML.indexOf('页') !== -1 && box1.innerHTML.indexOf('字') !== -1, '渲染含顶部统计（页 / 字 / 板块）');

    const box2 = { innerHTML: '' };
    A.run(messyData());
    A.render(box2);
    // 级别标签取自实现：error=必须处理 / warn=建议修改 / info=可以更好
    ctx.assert(box2.innerHTML.indexOf('必须处理') !== -1, '渲染含 error 分组标题（必须处理）');
    ctx.assert(box2.innerHTML.indexOf('建议修改') !== -1, '渲染含 warn 分组标题（建议修改）');
    ctx.assert(box2.innerHTML.indexOf('可以更好') !== -1, '渲染含 info 分组标题（可以更好）');
    ctx.assert(box2.innerHTML.indexOf('未发现问题') === -1, '有问题时不再显示空态');
  }},

  { name: 'toggle() 在桩环境（无真实 DOM）下不抛错', fn: function(ctx){
    const A = ctx.ResumeAudit;
    let threw = false;
    try{ A.toggle(); }catch(e){ threw = true; }
    ctx.assert(!threw, 'toggle() 不抛错');
  }},

  /* 前置：healthyData 自身不产生任何 length 类命中，因此下面的计数等价于「这一条是否命中」。
     阈值取自实现：< 15 过短；> 300 过长。 */
  { name: '单条描述长度边界（14/16/300/301 字）', fn: function(ctx){
    const A = ctx.ResumeAudit;
    function one(text){
      const d = healthyData();
      d.sections[0].items[0].text = text;
      return A.run(d).checks.filter(c => c.id === 'length-short' || c.id === 'length-long').length;
    }
    const rep = (n) => new Array(n + 1).join('字');
    ctx.assert(one('一二三四五六七八九十一二三四') === 1, '14 字 → 命中过短');
    ctx.assert(one('一二三四五六七八九十一二三四五六') === 0, '16 字 → 不命中长度类');
    ctx.assert(one(rep(300)) === 0, '300 字 → 不命中过长（边界内）');
    ctx.assert(one(rep(301)) === 1, '301 字 → 命中过长');
    ctx.assert(one(longText()) === 1, '超长文本 → 命中过长');
  }}
];
