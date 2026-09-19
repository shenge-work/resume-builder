/* =============================================================
 * 简历渲染引擎（纯函数 + HTML 字符串构建）
 * -------------------------------------------------------------
 * 从 js/app.js 物理拆分。本文件不碰 DOM、不调用其它模块，
 * 只依赖 js/data.js 暴露的全局 data / currentFonts / currentSpacing /
 * defaultPageMargins（均为顶层 let/const，跨脚本可读可写）。
 * 挂 window.ResumeRender 供 app.js 解构复用。
 * ============================================================= */
(function(global){
"use strict";
/* ============ 工具 ============ */
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
/* 把 **xxx** 转为 <strong>xxx</strong>，其它字符转义 */
function boldText(s){
  const safe = esc(s);
  return safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
function getSection(id){ return data.sections.find(s=>s.id===id); }
function getVarStr(){ return Object.keys(currentFonts).map(k=>`--font-${k}:${currentFonts[k].val}px`).join(';')+';'; }

/* 行间距：全局默认值 + 该行独立偏移 */
function spacingStyle(type, itemSpacing){
  const g = currentSpacing[type] || {mt:0, mb:0};
  const s = itemSpacing || {mt:0, mb:0};
  const mt = (g.mt||0) + (s.mt||0);
  const mb = (g.mb||0) + (s.mb||0);
  return `margin-top:${mt}px;margin-bottom:${mb}px;`;
}
function z(v){ return (v==null || v==='' || Number.isNaN(Number(v))) ? 0 : Number(v); }
function getPageMargins(){ return data.pageMargins || defaultPageMargins; }
function mmToPx(mm){ return mm * 3.7795275591; }  // 96 DPI: 1 mm ≈ 3.7795 px
function pxToMm(px){ return px / 3.7795275591; }

/* 取文本：兼容「对象 {text}」与「纯字符串」两种数据形态（迁移过渡用） */
function T(x){ return (x && typeof x==='object' && 'text' in x) ? (x.text||'') : (x||''); }
function S(x){ return (x && typeof x==='object' && 'spacing' in x) ? x.spacing : (x||{}); }

/* ============ 渲染简历 HTML（来自数据模型） ============ */
function renderResumeInner(){
  let h='';
  const subTag = data.subtitleBold ? 'b' : 'span';
  const metaTag = data.metaBold ? 'b' : 'span';
  h+=`<header class="header">`
     +`<div class="header-left"><h1 class="name" style="${spacingStyle('name', data.nameSpacing)}">${esc(data.name)}</h1>`
     +`<div class="subtitle" style="${spacingStyle('subtitle', data.subtitleSpacing)}"><${subTag}>${esc(data.subtitle)}</${subTag}></div></div>`
     +`<div class="header-right"><div class="meta" style="${spacingStyle('meta', data.metaSpacing)}"><${metaTag}>${esc(data.meta)}</${metaTag}></div>`
     + data.contact.map((c,i)=>`<div style="${spacingStyle('contact', ((data.contactSpacing||[])[i]||{}))}">${esc(T(c))}</div>`).join('') + `</div></header>`;
  data.sections.forEach(sec=>{
    const secBreak = sec.pageBreak ? ' page-break-before' : '';
    h+=`<section class="section${secBreak}" data-drag="section:${sec.id}" draggable="true" style="${spacingStyle('section', sec.spacing)}">`;
    h+=`<h2 class="section-title">${esc(sec.title)}</h2>`;
    if(sec.type==='advantages'){
      h+='<ul class="adv">';
      sec.items.forEach((it,i)=>{
        const tag = it.labelBold!==false ? 'b' : 'span';
        h+=`<li class="adv-li" data-drag="item:${sec.id}:${i}" draggable="true" style="${spacingStyle('adv', it.spacing)}"><${tag}>${esc(it.label)}</${tag}>：${esc(T(it.text))}</li>`;
      });
      h+='</ul>';
    } else if(sec.type==='career'){
      sec.items.forEach((job,i)=>{
        const jobBreak = job.pageBreak ? ' page-break-before' : '';
        h+=`<div class="job${jobBreak}" data-drag="job:${sec.id}:${i}" draggable="true" style="${spacingStyle('job', job.spacing)}">`;
        h+=`<div class="job-header">`;
        let wrapStyle='';
        const lg = Number(job.logoGap);
        if(job.logoGap!=='' && job.logoGap!=null && !isNaN(lg) && lg>0){ wrapStyle = ` style="gap:${lg}px"`; }
        h+=`<div class="job-title-wrap"${wrapStyle}>`;
        if(job.logo && job.logo.trim()){
          const ls = Number(job.logoSize);
          const def = (job.logoSize==='' || job.logoSize==null || isNaN(ls) || ls<=0) ? 28 : ls;
          let logoStyle = `height:${def}px`;
          const lw = Number(job.logoWidth);
          if(job.logoWidth!=='' && job.logoWidth!=null && !isNaN(lw) && lw>0){ logoStyle += `;width:${lw}px`; }
          h+=`<img class="job-logo" src="${esc(job.logo)}" alt="" style="${logoStyle}">`;
        }
        h+=`<p class="job-title" style="${spacingStyle('jobTitle', job.companySpacing)}">${esc(T(job.company))}</p></div>`
          +`<span class="job-date" style="${spacingStyle('jobDate', job.dateSpacing)}">${esc(T(job.date||''))}</span></div>`;
        h+=`<p class="job-role" style="${spacingStyle('jobRole', job.roleSpacing)}">${esc(T(job.role))}</p>`;
        if(job.summary && T(job.summary).trim()){
          const quote = job.summaryQuote !== false;
          const color = esc(job.summaryColor || '#888888');
          const qStyle = quote ? `padding:6px 0 6px 10px;border-left:2px solid ${color};background:var(--paper-card-bg,#fafafa);` : '';
          h+=`<div class="job-summary" style="${spacingStyle('summary', job.summarySpacing)}${qStyle}">${esc(T(job.summary)).replace(/\n/g,'<br>')}</div>`;
        }
        (job.projects||[]).forEach((p,pi)=>{
          const projBreak = p.pageBreak ? ' page-break-before' : '';
          h+=`<div class="project nested${projBreak}" data-drag="proj:${sec.id}:${i}:${pi}" draggable="true" style="${spacingStyle('project', p.spacing)}">`;
          h+=`<p class="project-title" style="${spacingStyle('pTitle', p.nameSpacing)}">${esc(T(p.name))}</p>`
            +`<span class="stack" style="${spacingStyle('pStack', p.stackSpacing)}">${esc(T(p.stack))}</span>`;
          const pQuote = p.descQuote !== false;
          const pColor = esc(p.descColor || '#888888');
          const pQStyle = pQuote ? `padding:6px 0 6px 10px;border-left:2px solid ${pColor};background:var(--paper-card-bg,#fafafa);` : '';
          h+=`<p class="desc" style="${spacingStyle('pDesc', p.descSpacing)}${pQStyle}">${esc(T(p.desc))}</p>`;
          h+=`<ul>`;
          (p.results||[]).forEach((r,ri)=>{
            const rt = T(r);
            if(!rt.trim()) return;
            h+=`<li style="${spacingStyle('result', S(r).spacing)}">${esc(rt)}</li>`;
          });
          h+='</ul></div>';
        });
        h+='</div>';
      });
    } else if(sec.type==='projects'){
      sec.items.forEach((p,i)=>{
        const projBreak = p.pageBreak ? ' page-break-before' : '';
        h+=`<div class="project nested${projBreak}" style="${spacingStyle('project', p.spacing)}">`;
        h+=`<p class="project-title" style="${spacingStyle('pTitle', p.nameSpacing)}">${esc(T(p.name))}</p>`
          +`<span class="stack" style="${spacingStyle('pStack', p.stackSpacing)}">${esc(T(p.stack))}</span>`;
        const pQuote = p.descQuote !== false;
        const pColor = esc(p.descColor || '#888888');
        const pQStyle = pQuote ? `padding:6px 0 6px 10px;border-left:2px solid ${pColor};background:var(--paper-card-bg,#fafafa);` : '';
        h+=`<p class="desc" style="${spacingStyle('pDesc', p.descSpacing)}${pQStyle}">${esc(T(p.desc))}</p>`;
        h+=`<ul>`;
        (p.results||[]).forEach((r,ri)=>{
          const rt = T(r);
          if(!rt.trim()) return;
          h+=`<li style="${spacingStyle('result', S(r).spacing)}">${esc(rt)}</li>`;
        });
        h+='</ul></div>';
      });
    } else if(sec.type==='skills'){
      sec.groups.forEach((grp,g)=>{
        h+=`<div class="skill-group" data-drag="item:${sec.id}:${g}" draggable="true" style="${spacingStyle('skillGroup', grp.spacing)}"><h4 style="${spacingStyle('skillTitle', grp.nameSpacing)}">${esc(T(grp.name))}</h4><ul>`;
        grp.items.forEach((it,ii)=>{
          const itt = T(it);
          if(!itt.trim()) return;
          h+=`<li style="${spacingStyle('skillItem', S(it).spacing)}">${esc(itt)}</li>`;
        });
        h+='</ul></div>';
      });
    } else if(sec.type==='highlights'){
      // 高亮卡（左侧灰竖条）+ 标签芯片。文本里 **xxx** 视为加粗。
      h+='<div class="highlights">';
      (sec.cards||[]).forEach(card=>{
        const txt = T(card && card.text);
        if(txt.trim()) h += '<div class="highlight-card">'+boldText(txt)+'</div>';
      });
      const tags = (sec.tags||[]).map(t=>String(T(t)).trim()).filter(Boolean);
      if(tags.length){
        h+='<div class="highlight-tags">';
        tags.forEach(t=>{ h+='<span class="highlight-tag">'+esc(t)+'</span>'; });
        h+='</div>';
      }
      h+='</div>';
    } else if(sec.type==='growth'){
      // 三栏时间轴：phase ▸ phase ▸ phase，中间用 ▶ 串接
      const phases = sec.phases || [];
      h+='<div class="growth">';
      phases.forEach((ph,i)=>{
        h+=`<div class="growth-phase">`;
        h+=`<span class="phase-label">${esc(T(ph.label))}</span>`;
        if(T(ph.date).trim()) h+=`<div class="phase-date" style="${spacingStyle('phaseDate', ph.dateSpacing)}">${esc(T(ph.date))}</div>`;
        if(T(ph.title).trim()) h+=`<div class="phase-title" style="${spacingStyle('phaseTitle', ph.titleSpacing)}">${esc(T(ph.title))}</div>`;
        if(T(ph.desc).trim()) h+=`<p class="phase-desc" style="${spacingStyle('phaseDesc', ph.descSpacing)}">${esc(T(ph.desc))}</p>`;
        h+='</div>';
        if(i < phases.length - 1){ h += '<div class="growth-arrow" aria-hidden="true">▶</div>'; }
      });
      h += '</div>';
    }
    h+='</section>';
  });
  return h;
}

function blankItem(type){
  if(type==='advantages') return {label:'',text:'',labelBold:true,spacing:{mt:0,mb:0}};
  if(type==='career')     return {company:'',role:'',date:'',summary:'',summaryQuote:true,summaryColor:'#888888',pageBreak:false,projects:[],spacing:{mt:0,mb:0},companySpacing:{mt:0,mb:0},roleSpacing:{mt:0,mb:0},dateSpacing:{mt:0,mb:0},summarySpacing:{mt:0,mb:0},logoSpacing:{mt:0,mb:0},logoSizeSpacing:{mt:0,mb:0},logoWidthSpacing:{mt:0,mb:0},logoGapSpacing:{mt:0,mb:0}};
  if(type==='projects')   return blankProject();
  return {};
}
function blankProject(){ return {name:'',stack:'',desc:'',results:[], descQuote:true, descColor:'#888888', pageBreak:false, spacing:{mt:0,mb:0}, nameSpacing:{mt:0,mb:0}, stackSpacing:{mt:0,mb:0}, descSpacing:{mt:0,mb:0}}; }
/* 新建一个空板块（用于「添加板块」）。id 随机生成，避免与已有板块冲突 */
function blankSection(type){
  const id = 's_' + Math.random().toString(36).slice(2, 9);
  if(type==='advantages') return {id, type:'advantages', title:'个人优势', pageBreak:false, items:[ blankItem('advantages') ]};
  if(type==='career')     return {id, type:'career', title:'职业履历', pageBreak:false, items:[ blankItem('career') ]};
  if(type==='skills')     return {id, type:'skills', title:'核心技能', pageBreak:false, groups:[ {name:'', items:[], spacing:{mt:0,mb:0}, nameSpacing:{mt:0,mb:0}} ]};
  if(type==='projects')   return {id, type:'projects', title:'项目经历', pageBreak:false, items:[ blankProject() ]};
  if(type==='highlights') return {id, type:'highlights', title:'关键印记', pageBreak:false, cards:[ {text:''}, {text:''} ], tags:['','','']};
  if(type==='growth')     return {id, type:'growth', title:'技术成长路径', pageBreak:false, phases:[ blankPhase(), blankPhase(), blankPhase() ]};
  return {id, type:'advantages', title:'个人优势', pageBreak:false, items:[ blankItem('advantages') ]};
}
function blankPhase(){
  return {label:'PHASE', date:'', title:'', desc:'', spacing:{mt:0,mb:0}, dateSpacing:{mt:0,mb:0}, titleSpacing:{mt:0,mb:0}, descSpacing:{mt:0,mb:0}};
}
/* 列表行（联系方式 / 量化成果 / 技能点）转为 {text, spacing} 对象，兼容旧版纯字符串 */
function objify(x, text){
  const sp = (x && typeof x==='object' && x.spacing) ? x.spacing : {mt:0, mb:0};
  return {text: text==null?'':text, spacing: sp};
}
function itemHead(tag, secId, idxAttr, idx){
  return `<div class="item-head"><span class="tag">${tag}</span>`
    +`<button class="mini-btn" data-action="move-item" data-sec="${secId}" ${idxAttr}="${idx}" data-dir="up" title="上移">↑</button>`
    +`<button class="mini-btn" data-action="move-item" data-sec="${secId}" ${idxAttr}="${idx}" data-dir="down" title="下移">↓</button>`
    +`<button class="mini-btn del" data-action="del-item" data-sec="${secId}" ${idxAttr}="${idx}" title="删除">×</button></div>`;
}

const preview = document.getElementById('preview');

/* 打印 / 静默导出的页边距必须跟随「页面边距」面板：
   css/style.css 里的 @page{size:A4;margin:14mm} 只是出厂默认，这里用一条动态规则覆盖它。
   刻意不写成 @page{margin:var(--x)} —— @page 规则内的 var() 各浏览器解析时机不一致，不可靠。 */
const PRINT_PAGE_STYLE_ID = 'printPageMarginStyle';
function safeMm(v, fallback){
  // 空值必须显式回退：Number(null) === 0，否则导入的外部 JSON 里一个 null 会变成「0mm 边距」
  if(v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  if(!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
}
function syncPrintPageMargin(){
  const m = getPageMargins();
  const css = '@media print{@page{size:A4;margin:'
    + safeMm(m.top, 14) + 'mm ' + safeMm(m.right, 14) + 'mm '
    + safeMm(m.bottom, 14) + 'mm ' + safeMm(m.left, 14) + 'mm;}}';
  let el = document.getElementById(PRINT_PAGE_STYLE_ID);
  if(!el){
    el = document.createElement('style');
    el.id = PRINT_PAGE_STYLE_ID;
    // document.head 在极简 DOM 桩（tools/render-resume.js、测试沙箱）里可能不存在，逐级兜底
    const host = document.head || document.documentElement || document.body;
    if(host && host.appendChild) host.appendChild(el);
  }
  if(el.textContent !== css) el.textContent = css;
}

function renderPreview(){
  const m = getPageMargins();
  const marginStyle = `width:210mm;max-width:none;box-sizing:border-box;padding-top:${mmToPx(m.top)}px;padding-right:${mmToPx(m.right)}px;padding-bottom:${mmToPx(m.bottom)}px;padding-left:${mmToPx(m.left)}px;`;
  preview.innerHTML = `<div class="resume" style="${getVarStr()}${marginStyle}">${renderResumeInner()}</div>`;
  syncPrintPageMargin();
  drawPageGuides();
  RB.saveState();
}

/* ============ 拖拽重排（左侧预览） ============ */
let drag = null;
preview.addEventListener('dragstart', e=>{
  const el = e.target.closest('[data-drag]'); if(!el) return;
  const p = el.dataset.drag.split(':');
  drag = {kind:p[0], secId:p[1], idx:p[2], pidx:p[3], el};
  e.dataTransfer.effectAllowed='move';
  try{ e.dataTransfer.setData('text/plain', el.dataset.drag); }catch(_){}
  setTimeout(()=>el.classList.add('dragging'),0);
});
preview.addEventListener('dragover', e=>{
  if(!drag) return;
  const el = e.target.closest('[data-drag]'); if(!el) return;
  const d = el.dataset.drag.split(':');
  const ok =
    (drag.kind==='section' && d[0]==='section') ||
    (drag.kind==='item'    && d[0]==='item'    && d[1]===drag.secId) ||
    (drag.kind==='item'    && d[0]==='job'     && d[1]===drag.secId) ||
    (drag.kind==='job'     && d[0]==='item'    && d[1]===drag.secId) ||
    (drag.kind==='job'     && d[0]==='job'     && d[1]===drag.secId) ||
    (drag.kind==='proj'    && d[0]==='proj'    && d[1]===drag.secId && d[2]===drag.idx);
  if(!ok) return;
  e.preventDefault();
  const r = el.getBoundingClientRect();
  const before = e.clientY < r.top + r.height/2;
  clearDrop();
  el.classList.add(before ? 'drop-before' : 'drop-after');
  drag.dropEl = el; drag.dropBefore = before;
});
preview.addEventListener('drop', e=>{
  if(!drag || !drag.dropEl) return;
  e.preventDefault();
  RB.recordHistory('action');
  const td = drag.dropEl.dataset.drag.split(':');
  if(drag.kind==='section') moveSection(drag.secId, td[1], drag.dropBefore);
  else if(drag.kind==='job') moveJob(drag.secId, +drag.idx, +td[2], drag.dropBefore);
  else if(drag.kind==='proj') moveProj(drag.secId, +drag.idx, +drag.pidx, +td[3], drag.dropBefore);
  else moveItem(drag.secId, +drag.idx, +td[2], drag.dropBefore);
  clearDrag(); renderPreview(); renderEditor();
});
preview.addEventListener('dragend', clearDrag);
function clearDrop(){ preview.querySelectorAll('.drop-before,.drop-after').forEach(x=>x.classList.remove('drop-before','drop-after')); }
function clearDrag(){ clearDrop(); if(drag&&drag.el) drag.el.classList.remove('dragging'); drag=null; }

function moveSection(fromId,toId,before){
  const arr=data.sections; const from=arr.findIndex(s=>s.id===fromId); if(from<0) return;
  const [m]=arr.splice(from,1);
  let to=arr.findIndex(s=>s.id===toId); if(to<0) to=arr.length-1;
  if(!before) to++; arr.splice(to,0,m);
}
function moveItem(secId,fromIdx,toIdx,before){
  const sec=getSection(secId); if(!sec) return;
  const arr = sec.type==='skills' ? sec.groups : sec.items;
  if(fromIdx<0||fromIdx>=arr.length) return;
  reInsert(arr, fromIdx, toIdx, before);
}
function moveJob(secId,fromIdx,toIdx,before){
  const sec=getSection(secId); if(!sec||!sec.items) return;
  reInsert(sec.items, fromIdx, toIdx, before);
}
function moveProj(secId,jobIdx,fromIdx,toIdx,before){
  const sec=getSection(secId); if(!sec||!sec.items[jobIdx]) return;
  const arr = sec.items[jobIdx].projects; if(!arr) return;
  reInsert(arr, fromIdx, toIdx, before);
}
function reInsert(arr, from, to, before){
  if(from<0||from>=arr.length) return;
  const [m]=arr.splice(from,1);
  let t=to; if(from<to) t--; if(!before) t++;
  if(t<0) t=0; if(t>arr.length) t=arr.length;
  arr.splice(t,0,m);
}

/* ============ 右侧纯文本编辑器（表单，无代码） ============ */
const editor = document.getElementById('editor');
function renderEditor(){
  let h='';
  const fl = (label, inputHtml, code, spacingVal)=>{
    const sp = spacingVal || {mt:0, mb:0};
    const mt = z(sp.mt), mb = z(sp.mb);
    return '<div class="field"><label>'+label+'</label>'
      + inputHtml
      + '<span class="spacing-row">'
      + '<label>上间距 <input type="number" step="1" data-action="spacing-mt" data-sp="'+esc(code)+'" value="'+mt+'"></label>'
      + '<label>下间距 <input type="number" step="1" data-action="spacing-mb" data-sp="'+esc(code)+'" value="'+mb+'"></label>'
      + '</span></div>';
  };
  // 基本信息
  h+='<div class="card"><div class="card-head">基本信息</div><div class="card-body">'
    + fl('姓名', '<input data-field="name" value="'+esc(data.name)+'">', 'g:name', data.nameSpacing)
    + fl('核心头衔（用 “·” 分隔）', '<input data-field="subtitle" value="'+esc(data.subtitle)+'">', 'g:subtitle', data.subtitleSpacing)
    +'<div class="field" style="display:flex;align-items:center;gap:10px;"><label class="check"><input type="checkbox" data-field="subtitleBold" '+(data.subtitleBold?'checked':'')+'> 加粗显示核心头衔</label></div>'
    + fl('顶部标签（年龄 / 年限 / 方向）', '<input data-field="meta" value="'+esc(data.meta)+'">', 'g:meta', data.metaSpacing)
    +'<div class="field" style="display:flex;align-items:center;gap:10px;"><label class="check"><input type="checkbox" data-field="metaBold" '+(data.metaBold?'checked':'')+'> 加粗显示顶部标签</label></div>';
  (data.contact||[]).forEach((c,i)=>{
    h += fl('联系方式 第 '+(i+1)+' 行', '<textarea data-field="contact" data-ci="'+i+'" rows="2">'+esc(T(c))+'</textarea>', 'c:'+i, (c&&typeof c==='object'&&c.spacing)?c.spacing:undefined);
  });
  h +='</div></div>';
  // 各板块
  data.sections.forEach(sec=>{
    h+='<div class="card"><div class="card-head"><span class="grow">'+esc(sec.title)+'</span>'
      +'<button class="mini-btn" data-action="move-sec" data-sec="'+sec.id+'" data-dir="up" title="上移板块">↑</button>'
      +'<button class="mini-btn" data-action="move-sec" data-sec="'+sec.id+'" data-dir="down" title="下移板块">↓</button>'
      +'<button class="mini-btn del" data-action="del-section" data-sec="'+sec.id+'" title="删除板块">×</button></div>'
      +'<div class="card-body">'+ fl('板块标题', '<input data-sec="'+sec.id+'" data-field="title" value="'+esc(sec.title)+'">', 's:'+sec.id, sec.spacing)
      +'<div class="field" style="display:flex;align-items:center;gap:10px;"><label class="check"><input type="checkbox" data-sec="'+sec.id+'" data-field="pageBreak" '+(sec.pageBreak?'checked':'')+'> 强制本板块从新一页开始</label></div>';
    if(sec.type==='advantages'){
      sec.items.forEach((it,i)=>{
        h+='<div class="item-row">'+itemHead('优势 '+(i+1),sec.id,'data-iidx',i)
          + fl('小标题', '<input data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="label" value="'+esc(it.label)+'">', 'a:'+sec.id+':'+i, it.spacing)
          +'<div class="field" style="display:flex;align-items:center;gap:10px;"><label class="check"><input type="checkbox" data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="labelBold" '+(it.labelBold!==false?'checked':'')+'> 小标题加粗</label></div>'
          + fl('内容', '<textarea data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="text" rows="2">'+esc(T(it.text))+'</textarea>', 'a:'+sec.id+':'+i, it.spacing)
          +'</div>';
      });
      h+='<button class="add-btn" data-action="add-item" data-sec="'+sec.id+'">＋ 添加优势条目</button>';
    } else if(sec.type==='career'){
      sec.items.forEach((job,i)=>{
        h+='<div class="item-row">'+itemHead('公司 '+(i+1),sec.id,'data-iidx',i);
        const code = 'j:'+sec.id+':'+i;
        h += fl('公司', '<input data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="company" value="'+esc(T(job.company))+'">', code+':company', job.companySpacing);
        h += fl('岗位', '<input data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="role" value="'+esc(T(job.role))+'">', code+':role', job.roleSpacing);
        h += fl('时间', '<input data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="date" value="'+esc(T(job.date||''))+'">', code+':date', job.dateSpacing);
        h += fl('Logo（图片 URL / DataURI，可留空）', '<textarea data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="logo" rows="2">'+esc(T(job.logo||''))+'</textarea>', code+':logo', job.logoSpacing);
        h += fl('Logo 高度（px，留空则默认 28）', '<input type="number" min="8" max="120" step="1" data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="logoSize" value="'+((job.logoSize===''||job.logoSize==null)?28:esc(job.logoSize))+'">', code+':logoSize', job.logoSizeSpacing);
        h += fl('Logo 宽度（px，留空则按原始比例）', '<input type="number" min="8" max="320" step="1" data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="logoWidth" value="'+((job.logoWidth===''||job.logoWidth==null)?'':esc(job.logoWidth))+'">', code+':logoWidth', job.logoWidthSpacing);
        h += fl('Logo 与名称间距（px，留空则默认 9）', '<input type="number" min="0" max="60" step="1" data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="logoGap" value="'+((job.logoGap===''||job.logoGap==null)?'':esc(job.logoGap))+'">', code+':logoGap', job.logoGapSpacing);
        h += fl('公司概述（纯文本段落）', '<textarea data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="summary" rows="4">'+esc(T(job.summary||''))+'</textarea>', code+':summary', job.summarySpacing);
        h +='<div class="field" style="display:flex;align-items:center;gap:10px;"><label class="check"><input type="checkbox" data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="summaryQuote" '+(job.summaryQuote!==false?'checked':'')+'> 公司概述引用样式</label></div>'
          +'<div class="field" style="display:flex;align-items:center;gap:10px;"><label class="check"><input type="checkbox" data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="pageBreak" '+(job.pageBreak?'checked':'')+'> 强制该公司从新一页开始</label></div>'
          +'<div class="field" style="display:flex;align-items:center;gap:10px;"><label class="check">引用颜色 <input type="color" data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="summaryColor" value="'+esc(job.summaryColor||'#888888')+'"></label></div>';
        (job.projects||[]).forEach((p,pi)=>{
          const pcode = 'p:'+sec.id+':'+i+':'+pi;
          h+='<div class="sub-row"><div class="item-head"><span class="tag">项目 '+(pi+1)+'</span>'
            +'<button class="mini-btn" data-action="move-proj" data-sec="'+sec.id+'" data-iidx="'+i+'" data-pidx="'+pi+'" data-dir="up">↑</button>'
            +'<button class="mini-btn" data-action="move-proj" data-sec="'+sec.id+'" data-iidx="'+i+'" data-pidx="'+pi+'" data-dir="down">↓</button>'
            +'<button class="mini-btn del" data-action="del-proj" data-sec="'+sec.id+'" data-iidx="'+i+'" data-pidx="'+pi+'">×</button></div>';
          h += fl('项目名', '<input data-sec="'+sec.id+'" data-iidx="'+i+'" data-pidx="'+pi+'" data-field="pname" value="'+esc(T(p.name))+'">', pcode+':name', p.nameSpacing);
          h += fl('技术栈', '<input data-sec="'+sec.id+'" data-iidx="'+i+'" data-pidx="'+pi+'" data-field="pstack" value="'+esc(T(p.stack))+'">', pcode+':stack', p.stackSpacing);
          h += fl('简介', '<textarea data-sec="'+sec.id+'" data-iidx="'+i+'" data-pidx="'+pi+'" data-field="pdesc" rows="2">'+esc(T(p.desc))+'</textarea>', pcode+':desc', p.descSpacing);
          h +='<div class="field" style="display:flex;align-items:center;gap:10px;"><label class="check"><input type="checkbox" data-sec="'+sec.id+'" data-iidx="'+i+'" data-pidx="'+pi+'" data-field="descQuote" '+(p.descQuote!==false?'checked':'')+'> 项目描述引用样式</label></div>'
            +'<div class="field" style="display:flex;align-items:center;gap:10px;"><label class="check"><input type="checkbox" data-sec="'+sec.id+'" data-iidx="'+i+'" data-pidx="'+pi+'" data-field="pageBreak" '+(p.pageBreak?'checked':'')+'> 强制该项目从新一页开始</label></div>'
            +'<div class="field" style="display:flex;align-items:center;gap:10px;"><label class="check">引用颜色 <input type="color" data-sec="'+sec.id+'" data-iidx="'+i+'" data-pidx="'+pi+'" data-field="descColor" value="'+esc(p.descColor||'#888888')+'"></label></div>';
          (p.results||[]).forEach((r,ri)=>{
            h += fl('量化成果 第 '+(ri+1)+' 行', '<textarea data-sec="'+sec.id+'" data-iidx="'+i+'" data-pidx="'+pi+'" data-field="presults" data-ri="'+ri+'" rows="2">'+esc(T(r))+'</textarea>', pcode+':results:'+ri, (r&&typeof r==='object'&&r.spacing)?r.spacing:undefined);
          });
          h +='</div>';
        });
        h+='<button class="add-btn sub" data-action="add-proj" data-sec="'+sec.id+'" data-iidx="'+i+'">＋ 为该公司添加项目</button></div>';
      });
      h+='<button class="add-btn" data-action="add-item" data-sec="'+sec.id+'">＋ 添加公司</button>';
    } else if(sec.type==='skills'){
      sec.groups.forEach((grp,g)=>{
        const kcode='k:'+sec.id+':'+g;
        h+='<div class="item-row"><div class="item-head"><span class="tag">技能分组 '+(g+1)+'</span>'
          +'<button class="mini-btn" data-action="move-group" data-sec="'+sec.id+'" data-gidx="'+g+'" data-dir="up">↑</button>'
          +'<button class="mini-btn" data-action="move-group" data-sec="'+sec.id+'" data-gidx="'+g+'" data-dir="down">↓</button>'
          +'<button class="mini-btn del" data-action="del-group" data-sec="'+sec.id+'" data-gidx="'+g+'">×</button></div>';
        h += fl('分组名', '<input data-sec="'+sec.id+'" data-gidx="'+g+'" data-field="gname" value="'+esc(T(grp.name))+'">', kcode+':gname', grp.nameSpacing);
        (grp.items||[]).forEach((it,ii)=>{
          h += fl('技能点 第 '+(ii+1)+' 行', '<textarea data-sec="'+sec.id+'" data-gidx="'+g+'" data-field="gitems" data-ri="'+ii+'" rows="2">'+esc(T(it))+'</textarea>', kcode+':gitems:'+ii, (it&&typeof it==='object'&&it.spacing)?it.spacing:undefined);
        });
        h +='</div>';
      });
      h+='<button class="add-btn" data-action="add-group" data-sec="'+sec.id+'">＋ 添加技能分组</button>';
    } else if(sec.type==='projects'){
      sec.items.forEach((p,i)=>{
        const pcode='p:'+sec.id+':'+i;
        h+='<div class="item-row">'+itemHead('项目 '+(i+1),sec.id,'data-iidx',i);
        h += fl('项目名', '<input data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="pname" value="'+esc(T(p.name))+'">', pcode+':name', p.nameSpacing);
        h += fl('技术栈', '<input data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="pstack" value="'+esc(T(p.stack))+'">', pcode+':stack', p.stackSpacing);
        h += fl('简介', '<textarea data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="pdesc" rows="2">'+esc(T(p.desc))+'</textarea>', pcode+':desc', p.descSpacing);
        (p.results||[]).forEach((r,ri)=>{
          h += fl('量化成果 第 '+(ri+1)+' 行', '<textarea data-sec="'+sec.id+'" data-iidx="'+i+'" data-field="presults" data-ri="'+ri+'" rows="2">'+esc(T(r))+'</textarea>', pcode+':results:'+ri, (r&&typeof r==='object'&&r.spacing)?r.spacing:undefined);
        });
        h +='</div>';
      });
      h+='<button class="add-btn" data-action="add-item" data-sec="'+sec.id+'">＋ 添加项目</button>';
    } else if(sec.type==='highlights'){
      (sec.cards||[]).forEach((card,i)=>{
        const ccode='h:'+sec.id+':c:'+i;
        h+='<div class="item-row"><div class="item-head"><span class="tag">高亮卡 '+(i+1)+'</span>'
          +'<button class="mini-btn" data-action="move-card" data-sec="'+sec.id+'" data-cidx="'+i+'" data-dir="up" title="上移">↑</button>'
          +'<button class="mini-btn" data-action="move-card" data-sec="'+sec.id+'" data-cidx="'+i+'" data-dir="down" title="下移">↓</button>'
          +'<button class="mini-btn del" data-action="del-card" data-sec="'+sec.id+'" data-cidx="'+i+'" title="删除">×</button></div>';
        h += fl('高亮卡正文（**xxx** 标记加粗）', '<textarea data-sec="'+sec.id+'" data-cidx="'+i+'" data-field="hcard" rows="3">'+esc(T(card && card.text))+'</textarea>', ccode+':text');
      });
      h+='<button class="add-btn" data-action="add-card" data-sec="'+sec.id+'">＋ 添加高亮卡</button>';
      h+='<div class="item-row"><div class="item-head"><span class="tag">标签芯片</span></div>';
      (sec.tags||[]).forEach((t,i)=>{
        h += fl('标签 '+(i+1), '<input data-sec="'+sec.id+'" data-tidx="'+i+'" data-field="htag" value="'+esc(T(t))+'">', 'h:'+sec.id+':t:'+i);
      });
      h+='<button class="add-btn" data-action="add-tag" data-sec="'+sec.id+'">＋ 添加标签</button>';
      h+='</div>';
    } else if(sec.type==='growth'){
      (sec.phases||[]).forEach((ph,i)=>{
        const pcode='g:'+sec.id+':'+i;
        // phase 用 data-pidx，复用 itemHead 但 idxAttr 不同
        h+='<div class="item-row"><div class="item-head"><span class="tag">阶段 '+(i+1)+'</span>'
          +'<button class="mini-btn" data-action="move-phase" data-sec="'+sec.id+'" data-pidx="'+i+'" data-dir="up" title="上移">↑</button>'
          +'<button class="mini-btn" data-action="move-phase" data-sec="'+sec.id+'" data-pidx="'+i+'" data-dir="down" title="下移">↓</button>'
          +'<button class="mini-btn del" data-action="del-phase" data-sec="'+sec.id+'" data-pidx="'+i+'" title="删除">×</button></div>';
        h += fl('阶段标签（如 PHASE 1）', '<input data-sec="'+sec.id+'" data-pidx="'+i+'" data-field="phaseLabel" value="'+esc(T(ph.label))+'">', pcode+':label');
        h += fl('时间段', '<input data-sec="'+sec.id+'" data-pidx="'+i+'" data-field="phaseDate" value="'+esc(T(ph.date))+'">', pcode+':date', ph.dateSpacing);
        h += fl('主题（如 Java 架构 · 工程基石）', '<input data-sec="'+sec.id+'" data-pidx="'+i+'" data-field="phaseTitle" value="'+esc(T(ph.title))+'">', pcode+':title', ph.titleSpacing);
        h += fl('描述', '<textarea data-sec="'+sec.id+'" data-pidx="'+i+'" data-field="phaseDesc" rows="3">'+esc(T(ph.desc))+'</textarea>', pcode+':desc', ph.descSpacing);
        h +='</div>';
      });
      h+='<button class="add-btn" data-action="add-phase" data-sec="'+sec.id+'">＋ 添加阶段</button>';
    }
    h+='</div></div>';
  });
  // 添加板块
  h+='<div class="card add-section-card"><div class="card-head">添加板块</div><div class="card-body add-section-body">'
    +'<button class="add-btn" data-action="add-section" data-type="advantages">＋ 个人优势</button>'
    +'<button class="add-btn" data-action="add-section" data-type="career">＋ 职业履历</button>'
    +'<button class="add-btn" data-action="add-section" data-type="skills">＋ 核心技能</button>'
    +'<button class="add-btn" data-action="add-section" data-type="projects">＋ 项目经历</button>'
    +'<button class="add-btn" data-action="add-section" data-type="highlights">＋ 关键印记</button>'
    +'<button class="add-btn" data-action="add-section" data-type="growth">＋ 技术成长路径</button>'
    +'</div></div>';
  editor.innerHTML = h;
}



/* 解析间距微调目标（data-sp 编码） */
function parseSpacingTarget(code){
  const parts = String(code).split(':');
  const kind = parts[0];
  if(kind==='g'){ const k=parts[1]+'Spacing'; data[k]=data[k]||{mt:0,mb:0}; return {obj:data, key:k}; }
  if(kind==='c'){ const i=+parts[1]; data.contact=Array.isArray(data.contact)?data.contact:[]; data.contact[i]=objify(data.contact[i], T(data.contact[i]||'')); return {obj:data.contact, key:i}; }
  if(kind==='s'){ const sec=getSection(parts[1]); sec.spacing=sec.spacing||{mt:0,mb:0}; return {obj:sec, key:'spacing'}; }
  if(kind==='a'){ const sec=getSection(parts[1]); const it=sec.items[+parts[2]]; it.spacing=it.spacing||{mt:0,mb:0}; return {obj:it, key:'spacing'}; }
  if(kind==='j'){ const sec=getSection(parts[1]); const job=sec.items[+parts[2]]; if(parts[3]){ const f=parts[3]; job[f+'Spacing']=job[f+'Spacing']||{mt:0,mb:0}; return {obj:job, key:f+'Spacing'}; } job.spacing=job.spacing||{mt:0,mb:0}; return {obj:job, key:'spacing'}; }
  if(kind==='p'){ const sec=getSection(parts[1]); const job=sec.items[+parts[2]]; const pr=job.projects[+parts[3]]; if(parts[4]){ if(parts[4]==='results'){ const ri=+parts[5]; pr.results[ri]=objify(pr.results[ri], T(pr.results[ri]||'')); return {obj:pr.results, key:ri}; } pr[parts[4]+'Spacing']=pr[parts[4]+'Spacing']||{mt:0,mb:0}; return {obj:pr, key:parts[4]+'Spacing'}; } pr.spacing=pr.spacing||{mt:0,mb:0}; return {obj:pr, key:'spacing'}; }
  if(kind==='k'){ const sec=getSection(parts[1]); const grp=sec.groups[+parts[2]]; if(parts[3]){ if(parts[3]==='gitems'){ const ri=+parts[4]; grp.items[ri]=objify(grp.items[ri], T(grp.items[ri]||'')); return {obj:grp.items, key:ri}; } grp[parts[3]+'Spacing']=grp[parts[3]+'Spacing']||{mt:0,mb:0}; return {obj:grp, key:parts[3]+'Spacing'}; } grp.spacing=grp.spacing||{mt:0,mb:0}; return {obj:grp, key:'spacing'}; }
  return null;
}

/* 编辑输入：只改文字 → 更新模型 → 重渲染预览（不重建右侧，保留焦点） */
editor.addEventListener('input', e=>{
  const t=e.target;
  RB.recordHistory('edit');   // 每次输入前记录（同类型在短时间内的连续输入会合并为一个撤销步）
  if(t.dataset.action==='spacing-mt' || t.dataset.action==='spacing-mb'){
    const target = parseSpacingTarget(t.dataset.sp);
    if(target){ const k = t.dataset.action==='spacing-mt' ? 'mt' : 'mb'; target.obj[target.key] = target.obj[target.key] || {mt:0,mb:0}; target.obj[target.key][k] = z(t.value); renderPreview(); }
    return;
  }
  const f=t.dataset.field; if(!f) return;
  if(f==='name'){ data.name=t.value; renderPreview(); return; }
  if(f==='subtitle'){ data.subtitle=t.value; renderPreview(); return; }
  if(f==='subtitleBold'){ data.subtitleBold=t.checked; renderPreview(); return; }
  if(f==='meta'){ data.meta=t.value; renderPreview(); return; }
  if(f==='metaBold'){ data.metaBold=t.checked; renderPreview(); return; }
  if(f==='contact'){ const i=+t.dataset.ci; data.contact[i]=objify(data.contact[i], t.value); renderPreview(); return; }
  const sec=getSection(t.dataset.sec); if(!sec) return;
  if(f==='title'){ sec.title=t.value; renderPreview(); return; }
  if(f==='pageBreak' && t.dataset.iidx==null && t.dataset.pidx==null && t.dataset.gidx==null && t.dataset.cidx==null && t.dataset.tidx==null){ sec.pageBreak = t.checked; renderPreview(); return; }
  if(sec.type==='advantages'){
    const i=+t.dataset.iidx; const it=sec.items[i];
    if(f==='label') it.label=t.value;
    else if(f==='labelBold') it.labelBold=t.checked;
    else if(f==='text') it.text=t.value;
    renderPreview();
  } else if(sec.type==='career'){
    const i=+t.dataset.iidx; const job=sec.items[i];
    if(f==='company') job.company=t.value;
    else if(f==='role') job.role=t.value;
    else if(f==='date') job.date=t.value;
    else if(f==='logo') job.logo=t.value;
    else if(f==='logoSize') job.logoSize = t.value==='' ? '' : Number(t.value);
    else if(f==='logoWidth') job.logoWidth = t.value==='' ? '' : Number(t.value);
    else if(f==='logoGap') job.logoGap = t.value==='' ? '' : Number(t.value);
    else if(f==='summary') job.summary=t.value;
    else if(f==='summaryQuote') job.summaryQuote = t.checked;
    else if(f==='summaryColor') job.summaryColor = t.value;
    else if(f==='pageBreak' && t.dataset.pidx==null) job.pageBreak = t.checked;
    else if(f==='pname'||f==='pstack'||f==='pdesc'||f==='descQuote'||f==='descColor'||f==='pageBreak'){
      const p=job.projects[+t.dataset.pidx]; if(!p) return;
      if(f==='pname') p.name=t.value; else if(f==='pstack') p.stack=t.value;
      else if(f==='pdesc') p.desc=t.value;
      else if(f==='descQuote') p.descQuote = t.checked;
      else if(f==='descColor') p.descColor = t.value;
      else if(f==='pageBreak') p.pageBreak = t.checked;
    } else if(f==='presults'){
      const p=job.projects[+t.dataset.pidx]; if(!p) return;
      const ri=+t.dataset.ri; p.results[ri]=objify(p.results[ri], t.value);
    }
    renderPreview();
  } else if(sec.type==='skills'){
    const g=+t.dataset.gidx; const grp=sec.groups[g];
    if(f==='gname') grp.name=t.value;
    else if(f==='gitems'){ const ri=+t.dataset.ri; grp.items[ri]=objify(grp.items[ri], t.value); }
    renderPreview();
  } else if(sec.type==='projects'){
    const i=+t.dataset.iidx; const p=sec.items[i];
    if(f==='pname') p.name=t.value; else if(f==='pstack') p.stack=t.value;
    else if(f==='pdesc') p.desc=t.value;
    else if(f==='presults'){ const ri=+t.dataset.ri; p.results[ri]=objify(p.results[ri], t.value); }
    renderPreview();
  } else if(sec.type==='highlights'){
    if(f==='hcard'){ const i=+t.dataset.cidx; sec.cards[i] = sec.cards[i] || {}; sec.cards[i].text = t.value; }
    else if(f==='htag'){ const i=+t.dataset.tidx; sec.tags[i] = t.value; }
    renderPreview();
  } else if(sec.type==='growth'){
    const i=+t.dataset.pidx; const ph=sec.phases[i]; if(!ph) return;
    if(f==='phaseLabel') ph.label=t.value;
    else if(f==='phaseDate') ph.date=t.value;
    else if(f==='phaseTitle') ph.title=t.value;
    else if(f==='phaseDesc') ph.desc=t.value;
    renderPreview();
  }
});


editor.addEventListener('click', e=>{
  const b=e.target.closest('button[data-action]'); if(!b) return;
  const act=b.dataset.action;
  // 添加板块：无需已存在的 sec，单独处理
  if(act==='add-section'){
    const t=b.dataset.type; if(!t) return;
    RB.recordHistory('action');
    data.sections.push(blankSection(t));
    renderEditor(); renderPreview(); return;
  }
  const secId=b.dataset.sec; const sec=getSection(secId); if(!sec) return;
  if(act==='del-section'){
    if(data.sections.length<=1){ alert('至少保留一个板块，无法删除。'); return; }
    if(!confirm('确定删除整个「'+sec.title+'」板块吗？此操作可用「撤销」恢复。')) return;
    RB.recordHistory('action');
    const i=data.sections.findIndex(s=>s.id===secId); if(i>=0) data.sections.splice(i,1);
  } else if(act==='move-sec'){
    RB.recordHistory('action');
    const i=data.sections.findIndex(s=>s.id===secId); const j=i+(b.dataset.dir==='up'?-1:1);
    if(j>=0&&j<data.sections.length){ [data.sections[i],data.sections[j]]=[data.sections[j],data.sections[i]]; }
  } else if(act==='add-item'){ RB.recordHistory('action'); sec.items.push(blankItem(sec.type)); }
  else if(act==='del-item'){ RB.recordHistory('action'); sec.items.splice(+b.dataset.iidx,1); }
  else if(act==='move-item'){ RB.recordHistory('action'); const i=+b.dataset.iidx; const j=i+(b.dataset.dir==='up'?-1:1); if(j>=0&&j<sec.items.length){ [sec.items[i],sec.items[j]]=[sec.items[j],sec.items[i]]; } }
  else if(act==='add-group'){ RB.recordHistory('action'); sec.groups.push({name:'',items:[],spacing:{mt:0,mb:0},nameSpacing:{mt:0,mb:0}}); }
  else if(act==='del-group'){ RB.recordHistory('action'); sec.groups.splice(+b.dataset.gidx,1); }
  else if(act==='move-group'){ RB.recordHistory('action'); const g=+b.dataset.gidx; const j=g+(b.dataset.dir==='up'?-1:1); if(j>=0&&j<sec.groups.length){ [sec.groups[g],sec.groups[j]]=[sec.groups[j],sec.groups[g]]; } }
  else if(act==='add-proj'){ RB.recordHistory('action'); const job=sec.items[+b.dataset.iidx]; if(job){ job.projects=job.projects||[]; job.projects.push(blankProject()); } }
  else if(act==='del-proj'){ RB.recordHistory('action'); const job=sec.items[+b.dataset.iidx]; if(job&&job.projects) job.projects.splice(+b.dataset.pidx,1); }
  else if(act==='move-proj'){
    RB.recordHistory('action');
    const job=sec.items[+b.dataset.iidx]; const p=+b.dataset.pidx; const j=p+(b.dataset.dir==='up'?-1:1);
    if(job&&job.projects&&j>=0&&j<job.projects.length){ [job.projects[p],job.projects[j]]=[job.projects[j],job.projects[p]]; }
  }
  else if(act==='add-phase'){ RB.recordHistory('action'); sec.phases=sec.phases||[]; sec.phases.push(blankPhase()); }
  else if(act==='del-phase'){ if(!sec.phases||sec.phases.length<=1){ alert('至少保留一个阶段，无法删除。'); return; } RB.recordHistory('action'); sec.phases.splice(+b.dataset.pidx,1); }
  else if(act==='move-phase'){ RB.recordHistory('action'); const i=+b.dataset.pidx; const j=i+(b.dataset.dir==='up'?-1:1); if(sec.phases&&j>=0&&j<sec.phases.length){ [sec.phases[i],sec.phases[j]]=[sec.phases[j],sec.phases[i]]; } }
  else if(act==='add-card'){ RB.recordHistory('action'); sec.cards=sec.cards||[]; sec.cards.push({text:''}); }
  else if(act==='del-card'){ RB.recordHistory('action'); sec.cards=sec.cards||[]; if(sec.cards.length<=1){ alert('至少保留一张高亮卡。'); return; } sec.cards.splice(+b.dataset.cidx,1); }
  else if(act==='move-card'){ RB.recordHistory('action'); sec.cards=sec.cards||[]; const i=+b.dataset.cidx; const j=i+(b.dataset.dir==='up'?-1:1); if(j>=0&&j<sec.cards.length){ [sec.cards[i],sec.cards[j]]=[sec.cards[j],sec.cards[i]]; } }
  else if(act==='add-tag'){ RB.recordHistory('action'); sec.tags=sec.tags||[]; sec.tags.push(''); }
  else if(act==='del-tag'){ RB.recordHistory('action'); sec.tags=sec.tags||[]; sec.tags.splice(+b.dataset.tidx,1); }
  renderEditor(); renderPreview();
});

/* ============ 撤销 / 重做（全量状态快照栈） ============ */
/* 取当前完整状态的可序列化快照 */

/* ============ 字体设置 ============ */
const settings = document.getElementById('settings');
function renderSettings(){
  settings.innerHTML = Object.keys(currentFonts).map(k=>{
    const s=currentFonts[k];
    return `<div class="setting"><label>${s.label}${s.desc?`<small>${s.desc}</small>`:''}</label>`
      +`<input type="number" min="${s.min}" max="${s.max}" step="0.5" value="${s.val}" data-key="${k}"></div>`;
  }).join('');
  settings.querySelectorAll('input').forEach(inp=>{
    inp.addEventListener('input', function(){
      const k=this.dataset.key; let v=parseFloat(this.value); if(isNaN(v)) return;
      RB.recordHistory('setting');
      v=Math.max(currentFonts[k].min, Math.min(currentFonts[k].max, v));
      currentFonts[k].val=v; renderPreview();
    });
  });
}
function resetFonts(){ RB.recordHistory('action'); currentFonts=JSON.parse(JSON.stringify(defaultFonts)); renderSettings(); renderPreview(); }
function renderSpacingSettings(){
  const wrap = document.getElementById('spacingSettings');
  wrap.innerHTML = Object.keys(currentSpacing).map(k=>{
    const s=currentSpacing[k];
    return `<div class="setting"><label>${s.label}</label>`
      +`<span style="display:flex;gap:6px;align-items:center;">`
      +`<small style="color:var(--ui-faint);">上</small><input type="number" min="-40" max="80" step="1" value="${s.mt}" data-k="${k}" data-pos="mt" title="上间距" style="width:46px;">`
      +`<small style="color:var(--ui-faint);">下</small><input type="number" min="-40" max="80" step="1" value="${s.mb}" data-k="${k}" data-pos="mb" title="下间距" style="width:46px;">`
      +`</span></div>`;
  }).join('');
  wrap.querySelectorAll('input').forEach(inp=>{
    inp.addEventListener('input', function(){
      const k=this.dataset.k; const pos=this.dataset.pos;
      let v=parseFloat(this.value); if(isNaN(v)) return;
      RB.recordHistory('setting');
      v=Math.max(-40, Math.min(80, v));
      currentSpacing[k][pos] = v; renderPreview();
    });
  });
}
function resetSpacing(){ RB.recordHistory('action'); currentSpacing=JSON.parse(JSON.stringify(defaultSpacing)); renderSpacingSettings(); renderPreview(); }
function renderMarginSettings(){
  const wrap = document.getElementById('marginSettings');
  if(!wrap) return;
  const m = getPageMargins();
  const mk = (label, key)=>`<div class="setting"><label>${label}</label><input type="number" min="0" max="60" step="1" value="${m[key]}" data-margin="${key}" title="${label}" style="width:60px;"></div>`;
  wrap.innerHTML = mk('上边距', 'top') + mk('右边距', 'right') + mk('下边距', 'bottom') + mk('左边距', 'left');
  wrap.querySelectorAll('input[data-margin]').forEach(inp=>{
    inp.addEventListener('input', function(){
      const key = this.dataset.margin;
      let v = parseFloat(this.value); if(isNaN(v)) return;
      RB.recordHistory('setting');
      v = Math.max(0, Math.min(60, v));
      data.pageMargins = data.pageMargins || {top:14, right:14, bottom:14, left:14};
      data.pageMargins[key] = v;
      renderPreview();
    });
  });
}
function resetMargins(){ RB.recordHistory('action'); data.pageMargins = JSON.parse(JSON.stringify(defaultPageMargins)); renderMarginSettings(); renderPreview(); }

/* ============ A4 分页参考线（与 PDF 截图分页严格对齐，支持强制换页） ============ */
let guidesOn = false;
/* 以 A4 210 mm 为基准，把页边距去掉后得到内容区域；
   分页参考线与图片版 PDF 都按内容区域高度计算。 */
function getPageMetrics(){
  const resume = preview.querySelector('.resume');
  if(!resume) return null;
  const m = getPageMargins();
  const pl = mmToPx(m.left), pr = mmToPx(m.right), pt = mmToPx(m.top), pb = mmToPx(m.bottom);
  const pageW = resume.offsetWidth;       // A4 实际渲染宽度（px）
  const contentW = pageW - pl - pr;       // A4 内容区域宽度（px）
  const pageH = contentW * 297 / 210;     // A4 内容区域高度（px）
  const totalH = Math.max(0, resume.offsetHeight - pt - pb); // 内容总高度（px）
  return { resume, pageW, contentW, pageH, totalH, pt, pr, pb, pl };
}
// 计算真实分页位置：先收集右侧勾选的「强制换页」元素 offsetTop，再与自然 A4 高度取并集
// 返回的 break 值是相对于内容区域顶部的偏移（不含上页边距）
function computePageBreaks(){
  const m = getPageMetrics();
  if(!m) return [];
  const { resume, pageH, totalH, pt } = m;
  const forced = Array.from(resume.querySelectorAll('.page-break-before'))
    .map(el => (el.offsetTop - resume.offsetTop) - pt)
    .filter(y => y > 2)
    .sort((a, b) => a - b);
  const breaks = [0];
  let last = 0;
  for(const y of forced){
    let cy = last;
    while(cy + pageH < y - 1){ cy += pageH; breaks.push(cy); }
    breaks.push(y);
    last = y;
  }
  let cy = last;
  while(cy + pageH < totalH - 1){ cy += pageH; breaks.push(cy); }
  // 最后一页边界
  if(breaks[breaks.length-1] < totalH - 1) breaks.push(totalH);
  // 去重并排序（浮点像素可能产生极小误差，取整）
  return [...new Set(breaks.map(v => Math.round(v)))].sort((a, b) => a - b);
}
function drawPageGuides(){
  preview.querySelectorAll('.page-guide').forEach(g=>g.remove());
  if(!guidesOn) return;
  const m = getPageMetrics();
  if(!m) return;
  const breaks = computePageBreaks();
  if(breaks.length < 2) return;
  const rect = m.resume.getBoundingClientRect();
  const prect = preview.getBoundingClientRect();
  const left = rect.left - prect.left + m.pl;
  const frag = document.createDocumentFragment();
  for(let n = 1; n < breaks.length; n++){
    const y = breaks[n] + m.pt;
    const d = document.createElement('div'); d.className = 'page-guide';
    d.style.top = (rect.top - prect.top + y) + 'px';
    d.style.left = left + 'px';
    d.style.right = 'auto';
    d.style.width = m.contentW + 'px';
    d.innerHTML = '<span>第 ' + n + ' 页底 / 第 ' + (n + 1) + ' 页顶</span>';
    frag.appendChild(d);
  }
  preview.appendChild(frag);
}
function toggleGuides(){
  guidesOn = !guidesOn;
  document.getElementById('guideBtn').textContent = guidesOn ? '隐藏分页线' : '显示分页线';
  drawPageGuides();
}
window.addEventListener('resize', ()=>{ if(guidesOn) drawPageGuides(); });

/* ============ 预览等比缩放：窄屏下让 A4 整页可见 ============
   为什么用 transform 而不是 zoom / 改宽度：
   - transform 只影响绘制，不触发重排 → offsetWidth/offsetHeight 读数与实际排版不变，
     与打印/导出的 WYSIWYG 一致（zoom 实测会使内容重排，offsetHeight 2451→2464）；
   - 导出用的 makeCaptureClone 会显式 clone.style.transform='none' 且用 live.offsetWidth 取尺寸，
     因此缩放不会污染导出成品；
   - 打印由 @media print 里的 !important 复位（见 css/style.css）。
   触发时机：预览尺寸变化、内容重渲染（renderPreview 会重建 .resume 节点）、窗口缩放/旋转。 */
function applyPreviewScale(){
  const resume = preview.querySelector('.resume');
  if(!resume) return;
  const cs = getComputedStyle(preview);
  const avail = preview.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  const naturalW = resume.offsetWidth, naturalH = resume.offsetHeight;
  if(avail <= 0 || !naturalW || !naturalH) return;   // 预览不可见（手机处于编辑/同步页）时跳过
  const s = Math.min(1, avail / naturalW);
  const scaled = s < 0.999;
  preview.classList.toggle('is-scaled', scaled);
  if(!scaled){
    resume.style.transform = '';
    resume.style.transformOrigin = '';
    resume.style.marginBottom = '';
    return;
  }
  resume.style.transformOrigin = 'top left';
  resume.style.transform = 'translateX(' + Math.max(0, (avail - naturalW * s) / 2) + 'px) scale(' + s + ')';
  // 视觉高度变为 naturalH*s，用负 margin 把布局高度补回缩放后的高度，避免底部出现大片空白
  resume.style.marginBottom = (-(1 - s) * naturalH) + 'px';
}
if(typeof MutationObserver === 'function'){
  new MutationObserver(applyPreviewScale).observe(preview, {childList:true});
}
if(typeof ResizeObserver === 'function'){
  new ResizeObserver(applyPreviewScale).observe(preview);
}
window.addEventListener('resize', applyPreviewScale);
window.addEventListener('orientationchange', applyPreviewScale);

function migrateQuoteColors(d){
  (d.sections||[]).forEach(sec=>{
    if(sec.type==='career'){
      (sec.items||[]).forEach(job=>{
        if(job.summaryColor==='#1a1a1a') job.summaryColor='#888888';
      });
    }
  });
}
/* 移除旧版「插入分页符」痕迹：删除 <<PAGE_BREAK>> 标记、__break 占位块；
   并将联系方式 / 量化成果 / 技能点 的纯字符串数组升级为 {text, spacing} 对象数组 */
const PB = '<<PAGE_BREAK>>';
function stripPB(s){ return String(s==null?'':s).split(PB).join(''); }
function toLine(x){ if(x && typeof x==='object' && 'text' in x){ x.text = stripPB(x.text); x.spacing = x.spacing||{mt:0,mb:0}; return x; } return {text: stripPB(x||''), spacing:{mt:0,mb:0}}; }
function ensureSpacing(obj, fields){ if(!obj) return; fields.forEach(f=>{ if(obj[f+'Spacing']==null) obj[f+'Spacing']={mt:0,mb:0}; }); }
function migrateSpacing(d){
  if(Array.isArray(d.contact)) d.contact = d.contact.map(toLine);
  (d.sections||[]).forEach(sec=>{
    if(sec.spacing==null) sec.spacing={mt:0,mb:0};
    if(sec.type==='advantages'){
      sec.items = (sec.items||[]).filter(it=>!it.__break).map(it=>{ it.spacing=it.spacing||{mt:0,mb:0}; it.text=stripPB(it.text||''); return it; });
    } else if(sec.type==='career'){
      sec.items = (sec.items||[]).filter(j=>!j.__break).map(job=>{
        ensureSpacing(job, ['company','role','date','summary','logo','logoSize','logoWidth','logoGap']);
        job.spacing=job.spacing||{mt:0,mb:0};
        ['company','role','date','summary'].forEach(f=> job[f]=stripPB(job[f]||''));
        (job.projects||[]).forEach(p=>{
          ensureSpacing(p, ['name','stack','desc']);
          p.spacing=p.spacing||{mt:0,mb:0};
          ['name','stack','desc'].forEach(f=> p[f]=stripPB(p[f]||''));
          p.results=(p.results||[]).map(toLine);
        });
        return job;
      });
    } else if(sec.type==='skills'){
      sec.groups = (sec.groups||[]).filter(g=>!g.__break).map(grp=>{
        ensureSpacing(grp, ['name']); grp.spacing=grp.spacing||{mt:0,mb:0};
        grp.name=stripPB(grp.name||'');
        grp.items=(grp.items||[]).map(toLine);
        return grp;
      });
    } else if(sec.type==='projects'){
      sec.items = (sec.items||[]).filter(it=>!it.__break).map(p=>{
        ensureSpacing(p, ['name','stack','desc']); p.spacing=p.spacing||{mt:0,mb:0};
        ['name','stack','desc'].forEach(f=> p[f]=stripPB(p[f]||''));
        p.results=(p.results||[]).map(toLine);
        return p;
      });
    }
  });
}
/* v6 迁移：新版间距默认值新增「公司块」「技能分组」独立类型，并整体收紧；
   若用户本地仍保存旧版默认值，直接重置为当前 defaultSpacing（保留每行独立微调） */
function migrateSpacingDefaults(){
  currentSpacing = JSON.parse(JSON.stringify(defaultSpacing));
}

// 迁移：确保 career 板块每段的 pageBreak 为合法布尔值（旧数据可能缺失该字段）
function migratePageBreaks(d){
  (d.sections||[]).forEach(sec=>{
    if(sec.type==='career'){
      (sec.items||[]).forEach(job=>{
        if(job.pageBreak === undefined) job.pageBreak = false;
      });
    }
    // 板块级 pageBreak：缺失补 false（让「强制本板块从新一页开始」开关默认关闭）
    if(typeof sec.pageBreak !== 'boolean') sec.pageBreak = false;
  });
}

global.ResumeRender = {
  // pure utils
  esc: esc, boldText: boldText, getSection: getSection, getVarStr: getVarStr,
  spacingStyle: spacingStyle, z: z, getPageMargins: getPageMargins,
  mmToPx: mmToPx, pxToMm: pxToMm, T: T, S: S,
  // html builders
  renderResumeInner: renderResumeInner,
  // constructors
  blankItem: blankItem, blankProject: blankProject, blankSection: blankSection,
  blankPhase: blankPhase, objify: objify, itemHead: itemHead,
  // preview + drag
  safeMm: safeMm, syncPrintPageMargin: syncPrintPageMargin,
  renderPreview: renderPreview,
  // editor form
  renderEditor: renderEditor, parseSpacingTarget: parseSpacingTarget,
  // settings panels
  renderSettings: renderSettings, resetFonts: resetFonts,
  renderSpacingSettings: renderSpacingSettings, resetSpacing: resetSpacing,
  renderMarginSettings: renderMarginSettings, resetMargins: resetMargins,
  // page guides
  getPageMetrics: getPageMetrics, computePageBreaks: computePageBreaks,
  drawPageGuides: drawPageGuides, toggleGuides: toggleGuides,
  applyPreviewScale: applyPreviewScale,
  migrateQuoteColors: migrateQuoteColors,
  migrateSpacing: migrateSpacing,
  migrateSpacingDefaults: migrateSpacingDefaults,
  migratePageBreaks: migratePageBreaks
};
})(typeof window !== "undefined" ? window : globalThis);
