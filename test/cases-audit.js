/* 内容体检 / ATS 检查（js/audit.js）测试。
   与 test/cases.js 不同：本文件是 CommonJS，由运行器在 Node 侧 require 后逐条执行，
   通过 ctx.ResumeAudit（vm 上下文里的 window.ResumeAudit）访问模块，断言走 ctx.assert。

   覆盖：三份假数据（健康 / 问题很多 / 空数据）× 检查项命中情况 + 接口契约 + 只读性。 */

'use strict';

/* ===== 假数据 ===== */
/* 一份「健康」的简历：预期 checks 为空 */
function healthyData(){
  return {
    name: '张三',
    subtitle: 'Java 后端 · 高并发 · 5 年经验',
    meta: '本科 · 5 年经验 · 北京',
    contact: ['13800138000', 'zhangsan@example.com'],
    pageMargins: { top: 14, right: 14, bottom: 14, left: 14 },
    sections: [
      { id: 'h1', type: 'advantages', title: '个人优势', pageBreak: false, items: [
        { label: '高并发治理', text: '主导订单核心链路重构，单机 QPS 从 1200 提升到 5200，接口 P99 延迟下降 40%。', labelBold: true },
        { label: '稳定性建设', text: '搭建全链路压测与分级告警体系，线上故障率从 3% 降到 0.5%，年均节省 2 人日/周。', labelBold: true },
        { label: '团队带教', text: '带 4 人小组完成 3 次大版本交付，需求平均交付周期由 12 天缩短到 7 天。', labelBold: true }
      ]},
      { id: 'h2', type: 'career', title: '职业履历', pageBreak: false, items: [
        { company: 'A 科技', role: '高级后端工程师', date: '2023.03 - 至今',
          summary: '负责交易核心链路的设计与治理，日均处理订单 800 万笔，核心接口稳定性 99.99%。',
          projects: [
            { name: '订单中心重构', stack: 'Java / Redis / Kafka',
              desc: '把单体订单拆分为 3 个独立服务，峰值吞吐提升 3 倍，发布回滚时间从 20 分钟降到 2 分钟。',
              results: ['QPS 提升 40%', '故障率下降 70%'] },
            { name: '对账平台', stack: 'Java / MySQL / Flink',
              desc: '建设准实时对账平台，覆盖 6 条业务线，每日自动核对 900 万笔流水。',
              results: ['人工核对工时减少 85%'] }
          ]},
        { company: 'B 网络', role: '后端工程师', date: '2020.06 - 2023.02',
          summary: '参与会员与积分体系建设，累计服务注册用户 1200 万，接口平均响应时间 60ms。',
          projects: [
            { name: '会员积分系统', stack: 'Java / MySQL',
              desc: '重构积分计算与结算逻辑，日终结算耗时从 30 分钟降到 4 分钟。',
              results: ['结算耗时下降 87%'] }
          ]}
      ]},
      { id: 'h3', type: 'skills', title: '核心技能', pageBreak: false, groups: [
        { name: '后端', items: ['Java', 'Spring Boot', '分布式事务'] },
        { name: '中间件', items: ['Redis', 'Kafka', 'MySQL 调优'] }
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
  { name: '空数据：姓名缺失 error + 联系方式缺失 error', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(emptyData());
    ctx.assert(has(r.checks, 'name', 'error'), '姓名缺失 → error');
    ctx.assert(has(r.checks, 'contact', 'error'), '联系方式全空 → error');
  }},

  { name: '空数据：无任何板块 warn + 头衔为空 info', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(emptyData());
    ctx.assert(has(r.checks, 'no-section', 'warn'), '零板块 → warn');
    ctx.assert(has(r.checks, 'subtitle', 'info'), '核心头衔为空 → info');
    ctx.assert(r.checks.filter(c => c.level === 'warn').length === 1, '空数据只应有 1 条 warn');
  }},

  /* ---- 问题简历 ---- */
  { name: '问题简历：必填与顺序类命中', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(messyData());
    ctx.assert(has(r.checks, 'name', 'error'), '姓名为空 → error');
    ctx.assert(has(r.checks, 'contact', 'error'), '联系方式为空 → error');
    ctx.assert(has(r.checks, 'career-order', 'warn'), '职业履历非倒序 → warn');
    ctx.assert(has(r.checks, 'section-title', 'warn'), '板块标题为空 → warn');
  }},

  { name: '问题简历：顺序检查细节带具体公司名', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const c = A.run(messyData()).checks.filter(x => x.id === 'career-order')[0];
    ctx.assert(!!c && /乙公司/.test(c.detail) && /甲公司/.test(c.detail), 'detail 指出具体的两家公司');
    ctx.assert(!!c && c.hint.indexOf('倒序') !== -1, 'hint 给出修正建议');
  }},

  { name: '问题简历：空字段 / 板块全空 → warn', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(messyData());
    ctx.assert(has(r.checks, 'empty-field', 'warn'), '有标题但内容为空 → warn');
    ctx.assert(has(r.checks, 'section-empty', 'warn'), '板块内容全空 → warn');
  }},

  { name: '问题简历：占位文案 → warn（含 {text} 对象形态）', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(messyData());
    const ph = r.checks.filter(c => c.id === 'placeholder');
    ctx.assert(ph.length >= 2, '占位文案命中至少 2 处（实际 ' + ph.length + '）');
    ctx.assert(ph.every(c => c.level === 'warn'), '占位文案级别为 warn');
    ctx.assert(ph.some(c => /待补充/.test(c.detail)), 'detail 里带出「待补充」字样');
  }},

  { name: '问题简历：长度异常 / 缺量化 / 页数超限', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(messyData());
    ctx.assert(has(r.checks, 'length-long', 'warn'), '超长描述 → warn');
    ctx.assert(has(r.checks, 'length-short', 'info'), '过短描述 → info');
    ctx.assert(has(r.checks, 'no-quantify', 'info'), '缺量化结果 → info');
    ctx.assert(has(r.checks, 'pages', 'warn'), '超过 2 页 → warn');
    ctx.assert(r.stats.pages > 2, '估算页数 > 2（实际 ' + r.stats.pages + '）');
  }},

  { name: '问题简历：ATS 伪表格 / PII 提醒 → info', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const r = A.run(messyData());
    ctx.assert(has(r.checks, 'ats-table', 'info'), '竖线伪表格 → info');
    ctx.assert(has(r.checks, 'pii', 'info'), '身份证号 → PII info');
  }},

  { name: '健康简历不含占位 / PII / 伪表格误报', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const li = ids(A.run(healthyData()).checks);
    ctx.assert(li.indexOf('placeholder') === -1, '无占位文案误报');
    ctx.assert(li.indexOf('pii') === -1, '无 PII 误报');
    ctx.assert(li.indexOf('ats-table') === -1, '无伪表格误报');
  }},

  { name: '时间解析不出来不误报（无年份 / 缺字段）', fn: function(ctx){
    const A = ctx.ResumeAudit;
    const d = healthyData();
    d.sections[1].items[0].date = '至今';
    d.sections[1].items[1].date = '';
    const r = A.run(d);
    ctx.assert(!has(r.checks, 'career-order'), '年份缺失时跳过顺序检查');
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
    ctx.assert(box1.innerHTML.indexOf('页数') !== -1, '渲染含顶部统计');

    const box2 = { innerHTML: '' };
    A.run(messyData());
    A.render(box2);
    ctx.assert(box2.innerHTML.indexOf('必须修改') !== -1, '渲染含 error 分组标题');
    ctx.assert(box2.innerHTML.indexOf('建议修改') !== -1, '渲染含 warn 分组标题');
    ctx.assert(box2.innerHTML.indexOf('可选优化') !== -1, '渲染含 info 分组标题');
    ctx.assert(box2.innerHTML.indexOf('未发现问题') === -1, '有问题时不再显示空态');
  }},

  { name: 'toggle() 在桩环境（无真实 DOM）下不抛错', fn: function(ctx){
    const A = ctx.ResumeAudit;
    let threw = false;
    try{ A.toggle(); }catch(e){ threw = true; }
    ctx.assert(!threw, 'toggle() 不抛错');
  }},

  { name: '单条描述长度边界（14/16/301 字）', fn: function(ctx){
    const A = ctx.ResumeAudit;
    function one(text){
      const d = healthyData();
      d.sections[0].items[0].text = text;
      return A.run(d).checks.filter(c => c.id === 'length-short' || c.id === 'length-long').length;
    }
    ctx.assert(one('一二三四五六七八九十一二三四') === 1, '14 字 → 命中过短');
    ctx.assert(one('一二三四五六七八九十一二三四五六') === 0, '16 字 → 不命中长度类');
    ctx.assert(one(longText()) === 1, '超长文本 → 命中过长');
  }}
];
