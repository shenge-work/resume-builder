/* 预览内 ↑↓ 排序（#8 触屏替代拖拽）：
   - 纯逻辑 reorderWithin(kind, secId, idx, pidx, dir) 覆盖 section / advantages / career job /
     nested project / skills group / projects-section item 六类，并在首尾越界时返回 false。
   - 渲染产物（renderResumeInner / reorderBtns）确实输出 data-reorder 按钮、且 projects 板块条目
     现在也带 draggable + data-drag（补齐原先不能重排的缺口）。
   全部走 vm 沙箱里的 ctx 函数，不依赖 DOM 桩的同一性。 */

function fixSections(RE, sections){
  const data = RE.getData().data;
  data.sections = sections;
  return data;
}
function lbls(arr){ return arr.map(x => x.label !== undefined ? x.label : (x.name !== undefined ? x.name : (x.company !== undefined ? x.company : x.id))); }

module.exports = [
  /* ---------- section ---------- */
  { name: '板块上移：中间板块移到前一块之前', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [
      {id:'s1',type:'advantages',title:'A',items:[]},
      {id:'s2',type:'career',title:'B',items:[]},
      {id:'s3',type:'skills',title:'C',groups:[]}
    ]);
    const moved = rw('section','s2',undefined,undefined,-1);
    ctx.assert(moved === true, '返回 true');
    ctx.assert(d.sections.map(s=>s.id).join(',') === 's2,s1,s3', '顺序变为 s2,s1,s3（实际 ' + d.sections.map(s=>s.id).join(',') + '）');
  }},
  { name: '板块下移：中间板块移到后一块之后', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [
      {id:'s1',type:'advantages',title:'A',items:[]},
      {id:'s2',type:'career',title:'B',items:[]},
      {id:'s3',type:'skills',title:'C',groups:[]}
    ]);
    const moved = rw('section','s2',undefined,undefined,1);
    ctx.assert(moved === true, '返回 true');
    ctx.assert(d.sections.map(s=>s.id).join(',') === 's1,s3,s2', '顺序变为 s1,s3,s2');
  }},
  { name: '板块首块上移：越界返回 false 且顺序不变', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [
      {id:'s1',type:'advantages',title:'A',items:[]},
      {id:'s2',type:'career',title:'B',items:[]}
    ]);
    const moved = rw('section','s1',undefined,undefined,-1);
    ctx.assert(moved === false, '返回 false');
    ctx.assert(d.sections.map(s=>s.id).join(',') === 's1,s2', '顺序不变');
  }},
  { name: '板块末块下移：越界返回 false 且顺序不变', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [
      {id:'s1',type:'advantages',title:'A',items:[]},
      {id:'s2',type:'career',title:'B',items:[]}
    ]);
    const moved = rw('section','s2',undefined,undefined,1);
    ctx.assert(moved === false, '返回 false');
    ctx.assert(d.sections.map(s=>s.id).join(',') === 's1,s2', '顺序不变');
  }},
  { name: '只有一个板块：上下移都越界返回 false', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'s1',type:'advantages',title:'A',items:[]}]);
    ctx.assert(rw('section','s1',undefined,undefined,-1) === false, '上移 false');
    ctx.assert(rw('section','s1',undefined,undefined,1) === false, '下移 false');
    ctx.assert(d.sections.map(s=>s.id).join(',') === 's1', '顺序不变');
  }},

  /* ---------- advantages 条目（kind=item, sec.items） ---------- */
  { name: '优势条目上移', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'adv',type:'advantages',title:'优势',items:[
      {label:'L1',text:''},{label:'L2',text:''},{label:'L3',text:''}
    ]}]);
    const sec = d.sections[0];
    const moved = rw('item','adv',1,undefined,-1);
    ctx.assert(moved === true, '返回 true');
    ctx.assert(lbls(sec.items).join(',') === 'L2,L1,L3', 'L2 上移（实际 ' + lbls(sec.items).join(',') + '）');
  }},
  { name: '优势条目下移', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'adv',type:'advantages',title:'优势',items:[
      {label:'L1',text:''},{label:'L2',text:''},{label:'L3',text:''}
    ]}]);
    const sec = d.sections[0];
    rw('item','adv',1,undefined,1);
    ctx.assert(lbls(sec.items).join(',') === 'L1,L3,L2', 'L2 下移');
  }},
  { name: '优势首条目上移越界 false', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'adv',type:'advantages',title:'优势',items:[
      {label:'L1',text:''},{label:'L2',text:''}
    ]}]);
    ctx.assert(rw('item','adv',0,undefined,-1) === false, '返回 false');
    ctx.assert(lbls(d.sections[0].items).join(',') === 'L1,L2', '顺序不变');
  }},
  { name: '优势末条目下移越界 false', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'adv',type:'advantages',title:'优势',items:[
      {label:'L1',text:''},{label:'L2',text:''}
    ]}]);
    ctx.assert(rw('item','adv',1,undefined,1) === false, '返回 false');
    ctx.assert(lbls(d.sections[0].items).join(',') === 'L1,L2', '顺序不变');
  }},

  /* ---------- career job（kind=job, sec.items） ---------- */
  { name: '经历 job 上移', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'car',type:'career',title:'经历',items:[
      {company:'C1',projects:[]},{company:'C2',projects:[]},{company:'C3',projects:[]}
    ]}]);
    const sec = d.sections[0];
    rw('job','car',1,undefined,-1);
    ctx.assert(lbls(sec.items).join(',') === 'C2,C1,C3', 'C2 上移');
  }},
  { name: '经历 job 下移', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'car',type:'career',title:'经历',items:[
      {company:'C1',projects:[]},{company:'C2',projects:[]},{company:'C3',projects:[]}
    ]}]);
    const sec = d.sections[0];
    rw('job','car',1,undefined,1);
    ctx.assert(lbls(sec.items).join(',') === 'C1,C3,C2', 'C2 下移');
  }},
  { name: '经历首 job 上移越界 false', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'car',type:'career',title:'经历',items:[
      {company:'C1',projects:[]},{company:'C2',projects:[]}
    ]}]);
    ctx.assert(rw('job','car',0,undefined,-1) === false, '返回 false');
  }},
  { name: '经历末 job 下移越界 false', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'car',type:'career',title:'经历',items:[
      {company:'C1',projects:[]},{company:'C2',projects:[]}
    ]}]);
    ctx.assert(rw('job','car',1,undefined,1) === false, '返回 false');
  }},

  /* ---------- nested project（kind=proj, sec.items[jobIdx].projects） ---------- */
  { name: 'job 内 project 上移', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'car',type:'career',title:'经历',items:[
      {company:'C1',projects:[{name:'P1'},{name:'P2'},{name:'P3'}]}
    ]}]);
    const job = d.sections[0].items[0];
    rw('proj','car',0,1,-1);
    ctx.assert(lbls(job.projects).join(',') === 'P2,P1,P3', 'P2 上移');
  }},
  { name: 'job 内 project 下移', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'car',type:'career',title:'经历',items:[
      {company:'C1',projects:[{name:'P1'},{name:'P2'},{name:'P3'}]}
    ]}]);
    const job = d.sections[0].items[0];
    rw('proj','car',0,1,1);
    ctx.assert(lbls(job.projects).join(',') === 'P1,P3,P2', 'P2 下移');
  }},
  { name: 'job 内首 project 上移越界 false', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'car',type:'career',title:'经历',items:[
      {company:'C1',projects:[{name:'P1'},{name:'P2'}]}
    ]}]);
    ctx.assert(rw('proj','car',0,0,-1) === false, '返回 false');
  }},
  { name: 'job 内末 project 下移越界 false', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'car',type:'career',title:'经历',items:[
      {company:'C1',projects:[{name:'P1'},{name:'P2'}]}
    ]}]);
    ctx.assert(rw('proj','car',0,1,1) === false, '返回 false');
  }},

  /* ---------- skills group（kind=item, sec.type=skills → sec.groups） ---------- */
  { name: '技能分组上移', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'sk',type:'skills',title:'技能',groups:[
      {name:'G1',keywords:'k'},{name:'G2',keywords:'k'},{name:'G3',keywords:'k'}
    ]}]);
    const sec = d.sections[0];
    rw('item','sk',1,undefined,-1);
    ctx.assert(lbls(sec.groups).join(',') === 'G2,G1,G3', 'G2 上移');
  }},
  { name: '技能分组下移', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'sk',type:'skills',title:'技能',groups:[
      {name:'G1',keywords:'k'},{name:'G2',keywords:'k'},{name:'G3',keywords:'k'}
    ]}]);
    const sec = d.sections[0];
    rw('item','sk',1,undefined,1);
    ctx.assert(lbls(sec.groups).join(',') === 'G1,G3,G2', 'G2 下移');
  }},
  { name: '技能首分组上移越界 false', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'sk',type:'skills',title:'技能',groups:[
      {name:'G1',keywords:'k'},{name:'G2',keywords:'k'}
    ]}]);
    ctx.assert(rw('item','sk',0,undefined,-1) === false, '返回 false');
  }},
  { name: '技能末分组下移越界 false', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'sk',type:'skills',title:'技能',groups:[
      {name:'G1',keywords:'k'},{name:'G2',keywords:'k'}
    ]}]);
    ctx.assert(rw('item','sk',1,undefined,1) === false, '返回 false');
  }},

  /* ---------- projects 板块条目（kind=item, sec.type=projects → sec.items） ---------- */
  { name: '项目板块条目上移', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'pr',type:'projects',title:'项目',items:[
      {name:'P1'},{name:'P2'},{name:'P3'}
    ]}]);
    const sec = d.sections[0];
    rw('item','pr',1,undefined,-1);
    ctx.assert(lbls(sec.items).join(',') === 'P2,P1,P3', 'P2 上移');
  }},
  { name: '项目板块条目下移', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'pr',type:'projects',title:'项目',items:[
      {name:'P1'},{name:'P2'},{name:'P3'}
    ]}]);
    const sec = d.sections[0];
    rw('item','pr',1,undefined,1);
    ctx.assert(lbls(sec.items).join(',') === 'P1,P3,P2', 'P2 下移');
  }},
  { name: '项目板块首条目上移越界 false', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'pr',type:'projects',title:'项目',items:[
      {name:'P1'},{name:'P2'}
    ]}]);
    ctx.assert(rw('item','pr',0,undefined,-1) === false, '返回 false');
  }},

  /* ---------- 连续移动正确性 ---------- */
  { name: '连续三次上移把末块推到最顶', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [
      {id:'s1',type:'advantages',title:'A',items:[]},
      {id:'s2',type:'career',title:'B',items:[]},
      {id:'s3',type:'skills',title:'C',groups:[]}
    ]);
    rw('section','s3',undefined,undefined,-1);
    rw('section','s3',undefined,undefined,-1);
    const moved = rw('section','s3',undefined,undefined,-1);
    ctx.assert(moved === false, '第三次已到顶，返回 false');
    ctx.assert(d.sections.map(s=>s.id).join(',') === 's3,s1,s2', 's3 已在最顶（实际 ' + d.sections.map(s=>s.id).join(',') + '）');
  }},

  /* ---------- 非法 / 边界输入 ---------- */
  { name: '未知 kind 返回 false', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    fixSections(RE, [{id:'s1',type:'advantages',title:'A',items:[{label:'L1',text:''}]}]);
    ctx.assert(rw('bogus','s1',0,undefined,-1) === false, '返回 false');
  }},
  { name: '不存在的 secId 返回 false', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    fixSections(RE, [{id:'s1',type:'advantages',title:'A',items:[{label:'L1',text:''}]}]);
    ctx.assert(rw('item','nope',0,undefined,-1) === false, '返回 false');
  }},
  { name: 'proj 但 job 越界返回 false', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    const d = fixSections(RE, [{id:'car',type:'career',title:'经历',items:[
      {company:'C1',projects:[{name:'P1'},{name:'P2'}]}
    ]}]);
    ctx.assert(rw('proj','car',9,0,undefined,-1) === false, '返回 false');
    ctx.assert(lbls(d.sections[0].items[0].projects).join(',') === 'P1,P2', '数据未被改动');
  }},
  { name: 'job 指向非 career 板块（无 items）返回 false', fn(ctx){
    const RE = ctx.ResumeEditor, rw = ctx.ResumeRender.reorderWithin;
    fixSections(RE, [{id:'sk',type:'skills',title:'技能',groups:[{name:'G1',keywords:'k'}]}]);
    ctx.assert(rw('job','sk',0,undefined,-1) === false, '返回 false');
  }},

  /* ---------- 渲染产物 ---------- */
  { name: 'reorderBtns：section 不带 data-idx，含 up/down 与 data-kind', fn(ctx){
    const html = ctx.ResumeRender.reorderBtns('section','s1',null,null);
    ctx.assert(/data-reorder="up"/.test(html) && /data-reorder="down"/.test(html), '含 up/down 按钮');
    ctx.assert(/data-kind="section"/.test(html) && /data-sec="s1"/.test(html), '含 kind/sec');
    ctx.assert(/data-idx=/.test(html) === false, 'section 不带 data-idx');
  }},
  { name: 'reorderBtns：proj 带 data-idx 与 data-pidx', fn(ctx){
    const html = ctx.ResumeRender.reorderBtns('proj','s1',2,3);
    ctx.assert(/data-idx="2"/.test(html) && /data-pidx="3"/.test(html), '含 data-idx=2 / data-pidx=3');
    ctx.assert(/aria-label="上移"/.test(html) && /aria-label="下移"/.test(html), '含可访问性 aria-label');
  }},
  { name: 'renderResumeInner：section 渲染出 reorder-btns', fn(ctx){
    const RE = ctx.ResumeEditor;
    fixSections(RE, [{id:'s1',type:'advantages',title:'优势',items:[{label:'L1',text:'t'}]}]);
    const html = ctx.ResumeRender.renderResumeInner();
    ctx.assert(/class="reorder-btns"/.test(html), '含 reorder-btns');
    ctx.assert(/data-reorder="up"/.test(html), '含 data-reorder 按钮');
  }},
  { name: 'renderResumeInner：projects 板块条目现在带 draggable + data-drag', fn(ctx){
    const RE = ctx.ResumeEditor;
    fixSections(RE, [{id:'pr',type:'projects',title:'项目',items:[{name:'P1'},{name:'P2'}]}]);
    const html = ctx.ResumeRender.renderResumeInner();
    ctx.assert(/data-drag="item:pr:0"/.test(html) && /data-drag="item:pr:1"/.test(html), 'projects 条目带 data-drag');
    ctx.assert(/draggable="true"/.test(html), 'projects 条目带 draggable（补齐原先不能重排的缺口）');
  }},
  { name: 'renderResumeInner：advantages 条目与 skills 分组都带 reorder-btns', fn(ctx){
    const RE = ctx.ResumeEditor;
    fixSections(RE, [
      {id:'adv',type:'advantages',title:'优势',items:[{label:'L1',text:'t'}]},
      {id:'sk',type:'skills',title:'技能',groups:[{name:'G1',keywords:'k'}]}
    ]);
    const html = ctx.ResumeRender.renderResumeInner();
    const up = (html.match(/data-reorder="up"/g) || []).length;
    ctx.assert(up >= 2, '至少 2 个上移按钮（优势条目 + 技能分组，实际 ' + up + '）');
  }}
];
