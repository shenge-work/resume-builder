/* =============================================================
 * 简历编辑器 - 业务逻辑
 * -------------------------------------------------------------
 * 渲染、拖拽排序、字号/间距配置、分页参考线、PDF 导出、自动保存。
 * 数据与默认值来自 js/data.js（需先加载）
 * ============================================================= */
(function(global){
'use strict';
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
  saveState();
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
  recordHistory('action');
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
  recordHistory('edit');   // 每次输入前记录（同类型在短时间内的连续输入会合并为一个撤销步）
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
    recordHistory('action');
    data.sections.push(blankSection(t));
    renderEditor(); renderPreview(); return;
  }
  const secId=b.dataset.sec; const sec=getSection(secId); if(!sec) return;
  if(act==='del-section'){
    if(data.sections.length<=1){ alert('至少保留一个板块，无法删除。'); return; }
    if(!confirm('确定删除整个「'+sec.title+'」板块吗？此操作可用「撤销」恢复。')) return;
    recordHistory('action');
    const i=data.sections.findIndex(s=>s.id===secId); if(i>=0) data.sections.splice(i,1);
  } else if(act==='move-sec'){
    recordHistory('action');
    const i=data.sections.findIndex(s=>s.id===secId); const j=i+(b.dataset.dir==='up'?-1:1);
    if(j>=0&&j<data.sections.length){ [data.sections[i],data.sections[j]]=[data.sections[j],data.sections[i]]; }
  } else if(act==='add-item'){ recordHistory('action'); sec.items.push(blankItem(sec.type)); }
  else if(act==='del-item'){ recordHistory('action'); sec.items.splice(+b.dataset.iidx,1); }
  else if(act==='move-item'){ recordHistory('action'); const i=+b.dataset.iidx; const j=i+(b.dataset.dir==='up'?-1:1); if(j>=0&&j<sec.items.length){ [sec.items[i],sec.items[j]]=[sec.items[j],sec.items[i]]; } }
  else if(act==='add-group'){ recordHistory('action'); sec.groups.push({name:'',items:[],spacing:{mt:0,mb:0},nameSpacing:{mt:0,mb:0}}); }
  else if(act==='del-group'){ recordHistory('action'); sec.groups.splice(+b.dataset.gidx,1); }
  else if(act==='move-group'){ recordHistory('action'); const g=+b.dataset.gidx; const j=g+(b.dataset.dir==='up'?-1:1); if(j>=0&&j<sec.groups.length){ [sec.groups[g],sec.groups[j]]=[sec.groups[j],sec.groups[g]]; } }
  else if(act==='add-proj'){ recordHistory('action'); const job=sec.items[+b.dataset.iidx]; if(job){ job.projects=job.projects||[]; job.projects.push(blankProject()); } }
  else if(act==='del-proj'){ recordHistory('action'); const job=sec.items[+b.dataset.iidx]; if(job&&job.projects) job.projects.splice(+b.dataset.pidx,1); }
  else if(act==='move-proj'){
    recordHistory('action');
    const job=sec.items[+b.dataset.iidx]; const p=+b.dataset.pidx; const j=p+(b.dataset.dir==='up'?-1:1);
    if(job&&job.projects&&j>=0&&j<job.projects.length){ [job.projects[p],job.projects[j]]=[job.projects[j],job.projects[p]]; }
  }
  else if(act==='add-phase'){ recordHistory('action'); sec.phases=sec.phases||[]; sec.phases.push(blankPhase()); }
  else if(act==='del-phase'){ if(!sec.phases||sec.phases.length<=1){ alert('至少保留一个阶段，无法删除。'); return; } recordHistory('action'); sec.phases.splice(+b.dataset.pidx,1); }
  else if(act==='move-phase'){ recordHistory('action'); const i=+b.dataset.pidx; const j=i+(b.dataset.dir==='up'?-1:1); if(sec.phases&&j>=0&&j<sec.phases.length){ [sec.phases[i],sec.phases[j]]=[sec.phases[j],sec.phases[i]]; } }
  else if(act==='add-card'){ recordHistory('action'); sec.cards=sec.cards||[]; sec.cards.push({text:''}); }
  else if(act==='del-card'){ recordHistory('action'); sec.cards=sec.cards||[]; if(sec.cards.length<=1){ alert('至少保留一张高亮卡。'); return; } sec.cards.splice(+b.dataset.cidx,1); }
  else if(act==='move-card'){ recordHistory('action'); sec.cards=sec.cards||[]; const i=+b.dataset.cidx; const j=i+(b.dataset.dir==='up'?-1:1); if(j>=0&&j<sec.cards.length){ [sec.cards[i],sec.cards[j]]=[sec.cards[j],sec.cards[i]]; } }
  else if(act==='add-tag'){ recordHistory('action'); sec.tags=sec.tags||[]; sec.tags.push(''); }
  else if(act==='del-tag'){ recordHistory('action'); sec.tags=sec.tags||[]; sec.tags.splice(+b.dataset.tidx,1); }
  renderEditor(); renderPreview();
});

/* ============ 撤销 / 重做（全量状态快照栈） ============ */
const hist = { undo: [], redo: [], last: { kind:'', t:0 } };
const HIST_MAX = 100;
/* 取当前完整状态的可序列化快照 */
function snapshot(){ return JSON.stringify({ data, fonts: currentFonts, spacing: currentSpacing }); }
/* 从快照恢复并把所有面板重渲染 */
function restoreSnapshot(s){
  try{
    const o = JSON.parse(s);
    data = o.data; currentFonts = o.fonts; currentSpacing = o.spacing;
  }catch(e){ return; }
  renderSettings(); renderMarginSettings(); renderSpacingSettings(); renderEditor(); renderPreview(); applyPanelState();
}
/* 记录一次变更。kind 相同且时间相近的连续「编辑/设置」会合并为一个撤销步（避免逐字符/逐格历史爆炸）；
   'action' 类（增删/移动/拖拽/导入/重置）每次都是独立可撤销步，不合并 */
function recordHistory(kind){
  const now = Date.now();
  if((kind==='edit' || kind==='setting') && hist.last.kind===kind && (now - hist.last.t) < 700){ hist.last.t = now; return; }
  hist.undo.push(snapshot());
  if(hist.undo.length > HIST_MAX) hist.undo.shift();
  hist.redo.length = 0;
  hist.last = { kind, t: now };
  updateUndoButtons();
}
function undo(){
  if(!hist.undo.length){ return; }
  hist.redo.push(snapshot());
  restoreSnapshot(hist.undo.pop());
  hist.last = { kind:'', t:0 };
  updateUndoButtons();
}
function redo(){
  if(!hist.redo.length){ return; }
  hist.undo.push(snapshot());
  restoreSnapshot(hist.redo.pop());
  hist.last = { kind:'', t:0 };
  updateUndoButtons();
}
function updateUndoButtons(){
  const u=document.getElementById('undoBtn'), r=document.getElementById('redoBtn');
  if(u) u.disabled = hist.undo.length===0;
  if(r) r.disabled = hist.redo.length===0;
}

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
      recordHistory('setting');
      v=Math.max(currentFonts[k].min, Math.min(currentFonts[k].max, v));
      currentFonts[k].val=v; renderPreview();
    });
  });
}
function resetFonts(){ recordHistory('action'); currentFonts=JSON.parse(JSON.stringify(defaultFonts)); renderSettings(); renderPreview(); }
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
      recordHistory('setting');
      v=Math.max(-40, Math.min(80, v));
      currentSpacing[k][pos] = v; renderPreview();
    });
  });
}
function resetSpacing(){ recordHistory('action'); currentSpacing=JSON.parse(JSON.stringify(defaultSpacing)); renderSpacingSettings(); renderPreview(); }
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
      recordHistory('setting');
      v = Math.max(0, Math.min(60, v));
      data.pageMargins = data.pageMargins || {top:14, right:14, bottom:14, left:14};
      data.pageMargins[key] = v;
      renderPreview();
    });
  });
}
function resetMargins(){ recordHistory('action'); data.pageMargins = JSON.parse(JSON.stringify(defaultPageMargins)); renderMarginSettings(); renderPreview(); }

/* ============ 右侧面板折叠 / 展开（状态持久化到 localStorage） ============ */
const PANEL_STATE_KEY = 'resume_collapsed_panels_v1';
function loadPanelState(){
  try{ const raw = localStorage.getItem(PANEL_STATE_KEY); return raw ? JSON.parse(raw) : {}; }catch(e){ return {}; }
}
function savePanelState(state){
  try{ localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(state)); }catch(e){}
}
let panelCollapsed = loadPanelState();
function applyPanelState(){
  ['panel-fonts','panel-margins','panel-spacing','panel-editor'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    if(panelCollapsed[id]) el.classList.add('collapsed'); else el.classList.remove('collapsed');
  });
}
function togglePanel(id){
  panelCollapsed[id] = !panelCollapsed[id];
  const el = document.getElementById(id);
  if(el) el.classList.toggle('collapsed', panelCollapsed[id]);
  savePanelState(panelCollapsed);
}
// 点击面板标题（含 chevron）切换；点击“恢复默认”按钮不触发
const editorPane = document.querySelector('.editor-pane');
if(editorPane){
  editorPane.addEventListener('click', e=>{
    const header = e.target.closest('.panel-header.collapsible');
    if(!header) return;
    if(e.target.closest('button')) return;   // 让恢复默认按钮正常工作
    togglePanel(header.dataset.panel);
  });
}

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

/* ============ 主题（日间 / 夜间）============
   具体逻辑在 js/theme.js（与本文件解耦）；这里只做三件事：
     1) 把工具栏 / 菜单的点击转发过去
     2) 导出时「临时把纸张拉回白纸」，确保夜间模式不会污染产物
     3) theme.js 缺席时全部静默降级，不影响编辑器本身 */
function themeApi(){
  try{ return (global.ResumeTheme && typeof global.ResumeTheme.setMode === 'function') ? global.ResumeTheme : null; }
  catch(e){ return null; }
}
function beginPaperGuard(){ const t = themeApi(); if(t) t.beginExport(); }
function endPaperGuard(){ const t = themeApi(); if(t) t.endExport(); }
function toggleTheme(){ const t = themeApi(); if(t) t.toggleTheme(); }
function setThemeMode(mode){ const t = themeApi(); if(t) t.setMode(mode); }
function togglePaperTheme(){ const t = themeApi(); if(t) t.togglePaperFollows(); }

/* ============ 导出 PDF：按实时预览的分页逐页截图，再拼成 PDF ============ */
let currentPdfBlobUrl = null;
// 把实时预览里的 .resume 克隆到屏幕外容器中（固定 A4 宽度并按页边距留白），用于 html2canvas 整页截图
function makeCaptureClone(live){
  const margins = getPageMargins();
  const pt = mmToPx(margins.top), pr = mmToPx(margins.right), pb = mmToPx(margins.bottom), pl = mmToPx(margins.left);
  const totalW = live.offsetWidth;         // 与预览同宽（A4 实际像素宽度）
  const totalH = live.offsetHeight;        // 与预览同高（已含 padding）
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:'+totalW+'px;height:'+totalH+'px;overflow:hidden;z-index:-1;background:#fff;';
  const clone = live.cloneNode(true);
  clone.style.boxSizing = 'border-box';
  clone.style.width = totalW + 'px';
  clone.style.maxWidth = 'none';
  clone.style.margin = '0';
  clone.style.padding = pt + 'px ' + pr + 'px ' + pb + 'px ' + pl + 'px';
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  clone.style.background = '#fff';
  clone.style.transform = 'none';
  clone.querySelectorAll('[data-drag]').forEach(n=>n.removeAttribute('data-drag'));
  clone.querySelectorAll('[draggable]').forEach(n=>n.removeAttribute('draggable'));
  clone.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(n=>n.classList.remove('dragging','drop-before','drop-after'));
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  return { wrapper, clone, totalW, totalH, pt, pr, pb, pl };
}
async function buildImagePdf(){
  const live = preview.querySelector('.resume');
  if(!live) throw new Error('预览未渲染');
  if(typeof html2canvas === 'undefined') throw new Error('截图库(html2canvas)未加载，请检查网络');
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
  if(!jsPDFCtor) throw new Error('PDF 库(jsPDF)未加载，请检查网络');

  const margins = getPageMargins();
  const cap = makeCaptureClone(live);
  try{
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await html2canvas(cap.clone, {
      scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff',
      width: cap.totalW, height: cap.totalH, windowWidth: cap.totalW, windowHeight: cap.totalH, x: 0, y: 0
    });
    const srcScale = canvas.width / cap.totalW;      // 截图实际像素 / CSS 宽度
    const breaks = computePageBreaks();              // 真实分页位置（已含强制换页，相对内容区域顶部）
    const pages = Math.max(1, breaks.length - 1);
    const pdf = new jsPDFCtor('p','mm','a4');
    const PW = 210, PH = 297;
    const contentW = PW - margins.left - margins.right;
    const contentH = PH - margins.top - margins.bottom;
    const contentWpx = cap.totalW - cap.pl - cap.pr; // 截图内容区域宽度（px）
    const pageHpx = contentWpx * 297 / 210;          // A4 内容区域高度（px）
    for(let i=0; i<pages; i++){
      const y = breaks[i];
      const h = breaks[i+1] - y;
      // 截取内容区域（去掉左右边距 + 上边距 + 已分页的内容偏移）
      const sx = Math.floor(cap.pl * srcScale);
      const sy = Math.floor((cap.pt + y) * srcScale);
      const sW = Math.floor(contentWpx * srcScale);
      const sH = Math.floor(h * srcScale);
      const pc = document.createElement('canvas');
      pc.width = sW; pc.height = sH;
      pc.getContext('2d').drawImage(canvas, sx, sy, sW, sH, 0, 0, sW, sH);
      const img = pc.toDataURL('image/jpeg', 0.98);
      if(i>0) pdf.addPage();
      // 把内容区域图片放到 A4 的内容区域内（四边留出页边距，短页不拉伸）
      const imgH = (h / pageHpx) * contentH;
      pdf.addImage(img, 'JPEG', margins.left, margins.top, contentW, imgH);
    }
    return { blob: pdf.output('blob'), pages };
  } finally {
    document.body.removeChild(cap.wrapper);
  }
}
function exportPDF(){
  const btn = document.querySelector('.toolbar button[onclick="ResumeEditor.exportPDF()"]');
  if(btn){ btn.disabled = true; btn.textContent = '生成中…'; }
  if(!preview.querySelector('.resume')){
    alert('预览未渲染，请稍候重试。');
    if(btn){ btn.disabled = false; btn.textContent = 'PDF 预览'; }
    return;
  }
  /* 截图期间纸张强制白纸：夜间模式下导出的 PDF / 长图仍是白底黑字 */
  beginPaperGuard();
  buildImagePdf().then(({blob, pages})=>{
    if(currentPdfBlobUrl) URL.revokeObjectURL(currentPdfBlobUrl);
    currentPdfBlobUrl = URL.createObjectURL(blob);
    document.getElementById('pdfFrame').src = currentPdfBlobUrl;
    document.getElementById('pdfPageInfo').textContent = '共 ' + pages + ' 页';
    document.getElementById('pdfModal').style.display = 'flex';
  }).catch(err=>{
    alert('PDF 生成失败：' + (err && err.message ? err.message : err));
  }).finally(()=>{
    endPaperGuard();
    if(btn){ btn.disabled = false; btn.textContent = 'PDF 预览'; }
  });
}
function downloadPDFNow(){
  if(!currentPdfBlobUrl){ exportPDF(); return; }
  const a = document.createElement('a');
  a.href = currentPdfBlobUrl; a.download = getFileName('', 'pdf');
  document.body.appendChild(a); a.click(); a.remove();
}
function closePdfModal(){
  document.getElementById('pdfModal').style.display = 'none';
  document.getElementById('pdfFrame').src = 'about:blank';
}

/* ============ 通用导出预览弹层（图片版 / 单文件 HTML 共用） ============ */
/* 先看预览，弹层内再点「下载」真正落盘；关闭时自动回收 blob URL。 */
let currentExportBlobUrl = null;
let currentExportName = '';
function showExportModal(kind, blobUrl, downloadName, title){
  const img = document.getElementById('exportModalImg');
  const frame = document.getElementById('exportModalFrame');
  document.getElementById('exportModalTitle').textContent = title;
  currentExportBlobUrl = blobUrl;
  currentExportName = downloadName;
  if(kind === 'image'){
    img.src = blobUrl; img.style.display = 'block'; frame.style.display = 'none';
  } else {
    frame.src = blobUrl; frame.style.display = 'block'; img.style.display = 'none';
  }
  document.getElementById('exportModal').style.display = 'flex';
}
function closeExportModal(){
  document.getElementById('exportModal').style.display = 'none';
  const img = document.getElementById('exportModalImg');
  const frame = document.getElementById('exportModalFrame');
  img.style.display = 'none'; img.removeAttribute('src');
  frame.style.display = 'none'; frame.src = 'about:blank';
  if(currentExportBlobUrl){ URL.revokeObjectURL(currentExportBlobUrl); currentExportBlobUrl = null; }
}
function doExportDownload(){
  if(!currentExportBlobUrl) return;
  const a = document.createElement('a');
  a.href = currentExportBlobUrl; a.download = currentExportName;
  document.body.appendChild(a); a.click(); a.remove();
}

/* ============ 导出长图：把 .resume 整页截为一张 PNG，先预览再下载 ============ */
async function exportLongImage(){
  const live = preview.querySelector('.resume');
  if(!live){ alert('预览未渲染，请稍候重试。'); return; }
  if(typeof html2canvas === 'undefined'){ alert('截图库(html2canvas)未加载，请检查网络'); return; }
  const btn = document.querySelector('.toolbar button[onclick="ResumeEditor.exportLongImage()"]');
  if(btn){ btn.disabled = true; btn.textContent = '生成中…'; }
  /* 同上：长图导出也走白纸，避免「纸张跟随夜间」被截进图片里 */
  beginPaperGuard();
  const cap = makeCaptureClone(live);
  try{
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await html2canvas(cap.clone, {
      scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff',
      width: cap.totalW, height: cap.totalH, windowWidth: cap.totalW, windowHeight: cap.totalH, x: 0, y: 0
    });
    const blob = await new Promise(res=>canvas.toBlob(res, 'image/png'));
    const url = URL.createObjectURL(blob);
    showExportModal('image', url, getFileName('_长图', 'png'), '图片版预览（长图）');
  }catch(err){
    alert('长图导出失败：' + (err && err.message ? err.message : err));
  }finally{
    document.body.removeChild(cap.wrapper);
    endPaperGuard();
    if(btn){ btn.disabled = false; btn.textContent = '导出（图片版）'; }
  }
}

/* ============ 导出单文件 HTML：仅含简历本身，内联样式，先预览再下载 ============ */
function exportSingleFileHTML(){
  const live = preview.querySelector('.resume');
  if(!live){ alert('预览未渲染，请稍候重试。'); return; }
  const clone = live.cloneNode(true);
  clone.querySelectorAll('[data-drag]').forEach(n=>n.removeAttribute('data-drag'));
  clone.querySelectorAll('[draggable]').forEach(n=>n.removeAttribute('draggable'));
  clone.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(n=>n.classList.remove('dragging','drop-before','drop-after'));
  const styleEl = document.querySelector('style');
  const css = styleEl ? styleEl.textContent : '';
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(data.name || '简历')}</title>
<style>
${css}
.resume{max-width:1000px;margin:0 auto;background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.10);border-radius:4px;}
@media print{
  @page{ size:A4; margin:14mm 14mm; }
  html,body{height:auto;overflow:visible;background:#fff;}
  .resume{max-width:100% !important;width:100% !important;margin:0 !important;padding:0 !important;box-shadow:none !important;border-radius:0 !important;}
  *{ -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  .resume .job,.resume .project,.resume .skill-group,.resume .adv li{ break-inside:avoid; }
  .resume .section-title,.resume .job-title,.resume .job-role,.resume .project-title{ break-after:avoid; }
  .page-break-before{ break-before:page; }
}
</style>
</head>
<body style="margin:0;padding:18px;background:#f0f0f0;">
${clone.outerHTML}
</body>
</html>`;
  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  showExportModal('html', url, getFileName('', 'html'), '单文件 HTML 预览');
}

document.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){
    const m=document.getElementById('pdfModal'); if(m && m.style.display==='flex') closePdfModal();
    const em=document.getElementById('exportModal'); if(em && em.style.display==='flex') closeExportModal();
  }
  // 撤销 / 重做（应用级；会覆盖输入框的原生撤销，换取整段内容的撤销能力）
  const mod = e.ctrlKey || e.metaKey;
  if(mod && (e.key==='z' || e.key==='Z')){ e.preventDefault(); if(e.shiftKey) redo(); else undo(); }
  else if(mod && (e.key==='y' || e.key==='Y')){ e.preventDefault(); redo(); }
  else if(mod && (e.key==='b' || e.key==='B')){ e.preventDefault(); toggleEditorPane(); }
});

/* ============ 自动保存（编辑即存入浏览器 localStorage，重新打开本文件时恢复） ============ */
const SAVE_KEY = 'resume_builder_data_v1';
const SAVE_KEY_LEGACY = 'resume_chenpeisheng_v1';
const SAVE_VERSION = 8;
const FILENAME_BASE_KEY = 'resume_filename_base_v1';
let fileNameBase = '';
let bootDone = false;

/* ============ 导出文件名管理 ============ */
function getDefaultFileNameBase(){ return (data.name || '简历').replace(/\s+/g,'_').replace(/[\\/:*?"<>|]/g,'_'); }
function loadFileNameBase(){ try{ fileNameBase = localStorage.getItem(FILENAME_BASE_KEY) || ''; }catch(e){ fileNameBase = ''; } }
function saveFileNameBase(){ try{ localStorage.setItem(FILENAME_BASE_KEY, fileNameBase); }catch(e){} }
function setFileNameBase(v){ fileNameBase = String(v==null?'':v).trim(); saveFileNameBase(); updateFileNameInput(); }
function updateFileNameInput(){ const el=document.getElementById('filenameBase'); if(!el) return; el.placeholder = getDefaultFileNameBase(); el.value = fileNameBase; }
function getFileName(suffix, ext){ const base = fileNameBase || getDefaultFileNameBase(); return base + (suffix||'') + '.' + ext; }

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
function saveState(){
  try{
    localStorage.setItem(SAVE_KEY, JSON.stringify({data, fonts: currentFonts, spacing: currentSpacing, v: SAVE_VERSION}));
    if(bootDone) showAutosave();
  }catch(e){
    const el=document.getElementById('autosave');
    if(el) el.textContent = '⚠ 自动保存不可用（浏览器禁用了本地存储）';
  }
  // 实时写回仓库 data/resume.json（需经本地写服务 npm start 打开）；file:// 或只读服务器会静默失败、回退 localStorage
  pushRepoDebounced();
}
/* 实时写回：经 ResumeStore 数据门面持久化（LocalStore/BrowserStore），不再直接 fetch 本地写服务 */
let _repoPushTimer = null;
function pushRepo(){
  const p = {data, fonts: currentFonts, spacing: currentSpacing, v: SAVE_VERSION};
  ResumeStore.save(p);   // fire-and-forget；store 内部吞掉持久化错误，绝不让异常冒泡
}
function pushRepoDebounced(){
  if(_repoPushTimer) clearTimeout(_repoPushTimer);
  _repoPushTimer = setTimeout(pushRepo, 800);
}
function loadState(){
  try{
    let raw = localStorage.getItem(SAVE_KEY);
    // 兼容旧版个人化 key：首次启动把旧数据迁移到通用 key，避免内容丢失
    if(!raw && SAVE_KEY_LEGACY){
      raw = localStorage.getItem(SAVE_KEY_LEGACY);
      if(raw){
        try{ localStorage.setItem(SAVE_KEY, raw); localStorage.removeItem(SAVE_KEY_LEGACY); }catch(_){}
      }
    }
    if(!raw) return false;
    const obj = JSON.parse(raw);
    if(obj && obj.data) data = obj.data;
    if(obj && obj.fonts) currentFonts = obj.fonts;
    if(obj && obj.spacing) currentSpacing = obj.spacing;
    if((obj.v || 0) < SAVE_VERSION){
      migrateQuoteColors(data);
      migrateSpacing(data);
      migratePageBreaks(data);
      migrateSpacingDefaults();
      data.pageMargins = data.pageMargins || JSON.parse(JSON.stringify(defaultPageMargins));
      try{ localStorage.setItem(SAVE_KEY, JSON.stringify({data, fonts: currentFonts, spacing: currentSpacing, v: SAVE_VERSION})); }catch(_){}
    }
    return true;
  }catch(e){ return false; }
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
function clearSaved(){
  if(!confirm('确定清空本地保存的修改，恢复到文件内置的初始数据吗？')) return;
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
  location.reload();
}
function showAutosave(){
  const el=document.getElementById('autosave');
  if(!el) return;
  const t=new Date(); const p=n=>String(n).padStart(2,'0');
  el.textContent = '✓ 已自动保存 · ' + p(t.getHours())+':'+p(t.getMinutes())+':'+p(t.getSeconds());
}

/* ============ 数据导入 / 导出（JSON，脱离浏览器存储的可移植备份） ============ */
/* 导出当前全部数据为 JSON 文件，可在任意设备/浏览器导入恢复 */
function exportJSON(){
  const payload = {data, fonts: currentFonts, spacing: currentSpacing, v: SAVE_VERSION};
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = getFileName('_数据', 'json');
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
/* 由隐藏 file input 触发：读取并校验 JSON，覆盖式导入 */
function importJSON(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const obj = JSON.parse(e.target.result);
      applyImported(obj);
    }catch(err){
      alert('导入失败：文件不是有效的 JSON\n' + (err && err.message ? err.message : err));
    }
    input.value = '';
  };
  reader.onerror = ()=>{ alert('导入失败：文件读取错误'); input.value = ''; };
  reader.readAsText(file);
}
/* 把一份 {data,fonts,spacing} 形态的载荷应用为当前内容（导入 / 加载仓库 data/resume.json 共用） */
function applyDataPayload(obj){
  data = obj.data;
  if(obj.fonts && typeof obj.fonts==='object') currentFonts = obj.fonts;
  if(obj.spacing && typeof obj.spacing==='object') currentSpacing = obj.spacing;
  data.pageMargins = data.pageMargins || JSON.parse(JSON.stringify(defaultPageMargins));
  migrateQuoteColors(data);
  migrateSpacing(data);
  if(!data.sections) data.sections = [];
  // 兼容旧数据：section 级别 pageBreak 字段缺失时补 false
  data.sections.forEach(sec=>{ if(typeof sec.pageBreak !== 'boolean') sec.pageBreak = false; });
  saveState();
  renderSettings(); renderMarginSettings(); renderSpacingSettings(); renderEditor(); renderPreview(); applyPanelState();
  updateFileNameInput();
  try{ document.title = (data.name||'简历') + ' · 简历编辑器'; }catch(_){}
  showAutosave();
}
function applyImported(obj){
  if(!obj || typeof obj!=='object' || !obj.data || !Array.isArray(obj.data.sections)){
    alert('导入失败：文件格式不正确（缺少 data.sections）');
    return;
  }
  if(!confirm('导入将用文件内容覆盖当前编辑器中的全部内容，确定继续？')) return;
  recordHistory('action');   // 导入前记录，导入结果可撤销
  applyDataPayload(obj);
  alert('✓ 已导入数据');
}
/* 从仓库根目录 data/resume.json 加载（版本化数据源）。
   仅当通过 http(s) 打开且文件存在时生效；本地 file:// 或单文件版无法读取外部文件，会静默跳过、回退到内置默认数据。 */
async function loadRepoData(opts){
  opts = opts || {};
  if(typeof fetch !== 'function') return false;
  let res;
  try{ res = await fetch('./data/resume.json', {cache:'no-store'}); }
  catch(e){ if(!opts.silent) alert('未找到仓库 data/resume.json（需通过本地服务器打开，且文件存在）'); return false; }
  if(!res || !res.ok){ if(!opts.silent) alert('未找到仓库 data/resume.json（HTTP ' + (res?res.status:'?') + '）'); return false; }
  let obj;
  try{ obj = await res.json(); }
  catch(e){ if(!opts.silent) alert('data/resume.json 不是有效的 JSON'); return false; }
  if(!obj || !obj.data || !Array.isArray(obj.data.sections)){ if(!opts.silent) alert('data/resume.json 格式不正确（缺少 data.sections）'); return false; }
  if(!opts.silent && !confirm('将从仓库 data/resume.json 重新加载全部内容，覆盖当前编辑器数据，确定继续？')) return false;
  applyDataPayload(obj);
  if(!opts.silent) alert('✓ 已从仓库 data/resume.json 加载');
  return true;
}

/* 从仓库根目录 template.json 加载「示范数据」（公开模板的演示内容）。
   仅在 data/resume.json 不存在时作为兜底演示；经本地服务器（npm start）打开时生效，
   file:// 或单文件版无法读取外部文件，会静默跳过、回退到内置默认数据（js/data.js）。 */
async function loadTemplateData(opts){
  opts = opts || {};
  if(typeof fetch !== 'function') return false;
  let res;
  try{ res = await fetch('./template.json', {cache:'no-store'}); }
  catch(e){ return false; }
  if(!res || !res.ok) return false;
  let obj;
  try{ obj = await res.json(); }
  catch(e){ return false; }
  if(!obj || !obj.data || !Array.isArray(obj.data.sections)) return false;
  applyDataPayload(obj);
  return true;
}

/* ============ 飞书同步：上报 / 从飞书恢复版本 ============ */
function showFeishuStatus(msg){
  const el = document.getElementById('feishuStatus');
  if (el) el.textContent = msg;
  const m = document.getElementById('feishuStatusMobile');
  if (m) m.textContent = msg;
}
/* 手动上报：把当前 {data,fonts,spacing,v} 推送到飞书（文档 docx + 云盘文件 resume.json，双写） */
async function reportToFeishu(){
  const btn = document.getElementById('feishuReportBtn');
  if (btn){ btn.disabled = true; btn.textContent = '上报中…'; }
  showFeishuStatus('正在上报到飞书…');
  try {
    const payload = { data, fonts: currentFonts, spacing: currentSpacing, v: SAVE_VERSION };
    const j = await ResumeStore.push(payload);
    const when = new Date().toLocaleTimeString();
    const tail = j.dryRun ? '（dry-run，未真实写入）' : (j.docUrl ? (' · ' + j.docUrl) : '');
    showFeishuStatus('✓ 已上报到飞书 · ' + when + tail);
  } catch (e) {
    showFeishuStatus('✗ 上报失败：' + e.message);
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = '上报到飞书'; }
  }
}
/* 打开「从飞书恢复」面板：列出云盘文件 resume.json 的历史版本 */
async function openFeishuRestore(){
  showFeishuStatus('正在拉取飞书版本…');
  try {
    const versions = await ResumeStore.listVersions();
    const list = document.getElementById('feishuVersions');
    if (!versions || !versions.length){
      showFeishuStatus('飞书中暂无版本');
      list.innerHTML = '<div style="color:var(--ui-muted);font-size:13px;">飞书中还没有任何版本，请先「上报到飞书」。</div>';
    } else {
      showFeishuStatus('共 ' + versions.length + ' 个飞书版本');
      list.innerHTML = versions.map(v => {
        const t = v.create_time ? new Date((v.create_time) * 1000).toLocaleString() : '';
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--ui-border);border-radius:4px;padding:8px 10px;">'
          + '<div><div style="font-weight:700;">版本 ' + esc(v.version_id || '') + '</div>'
          + '<div style="font-size:12px;color:var(--ui-muted);">' + esc(t) + ' · ' + esc(String(v.size || '')) + ' 字节</div></div>'
          + '<button style="height:30px;padding:0 14px;font-size:12.5px;font-weight:600;background:var(--ui-solid-bg);color:var(--ui-solid-text);border:none;border-radius:4px;cursor:pointer;" onclick="ResumeEditor.restoreFromFeishu(\'' + esc(v.version_id || '') + '\')">恢复此版本</button>'
          + '</div>';
      }).join('');
    }
    document.getElementById('feishuRestoreModal').style.display = 'flex';
  } catch (e) {
    showFeishuStatus('✗ 拉取版本失败：' + e.message);
  }
}
function closeFeishuRestore(){
  const m = document.getElementById('feishuRestoreModal');
  if (m) m.style.display = 'none';
}
/* 恢复指定飞书版本：下载该版本 JSON 并覆盖式应用（可撤销） */
async function restoreFromFeishu(versionId){
  if (!confirm('将从飞书恢复该版本，覆盖当前编辑器内容（可用撤销 Ctrl/Cmd+Z 回退），确定继续？')) return;
  showFeishuStatus('正在从飞书恢复…');
  try {
    const obj = await ResumeStore.restore(versionId);
    recordHistory('action');
    applyDataPayload(obj);
    closeFeishuRestore();
    showFeishuStatus('✓ 已从飞书恢复该版本');
  } catch (e) {
    showFeishuStatus('✗ 恢复失败：' + e.message);
  }
}

/* ============ 工具栏菜单 / 飞书配置表单 ============ */
/* 菜单按钮：悬停即展开（CSS :hover）；点击可固定展开，点其他区域收起 */
function toggleMenu(btn){
  const m = btn.closest('.menu');
  const wasOpen = m.classList.contains('open');
  document.querySelectorAll('.toolbar .menu.open').forEach(x => x.classList.remove('open'));
  if (!wasOpen) m.classList.add('open');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.toolbar .menu')) {
    document.querySelectorAll('.toolbar .menu.open').forEach(x => x.classList.remove('open'));
  }
});

/* 打开飞书配置表单：回填现有配置（Secret 永不回传，只提示「已设置」） */
async function openFeishuConfig(){
  try {
    const cfg = await ResumeStore.loadConfig();
    const c = cfg || {};
    document.getElementById('cfgAppId').value = c.app_id || '';
    const secretInput = document.getElementById('cfgAppSecret');
    secretInput.value = '';
    secretInput.placeholder = c.hasSecret ? '已设置，留空表示不修改' : '首次配置必填';
    document.getElementById('cfgDomain').value = c.domain || '';
    document.getElementById('cfgFolder').value = c.folder_token || '';
    document.getElementById('cfgDocTitle').value = c.doc_title || '';
    document.getElementById('cfgFileName').value = c.file_name || '';
    document.getElementById('cfgDryRun').checked = !!c.dryRun;
  } catch (e) { /* 非本地服务打开（file:// 等）或原生桥异常，表单留空即可 */ }
  document.getElementById('feishuConfigModal').style.display = 'flex';
}
function closeFeishuConfig(){
  const m = document.getElementById('feishuConfigModal');
  if (m) m.style.display = 'none';
}
/* 保存配置：经本地服务写入 sync.config.json（凭证不进 localStorage / 简历数据） */
async function saveFeishuConfig(){
  const btn = document.getElementById('cfgSaveBtn');
  if (btn){ btn.disabled = true; btn.textContent = '保存中…'; }
  try {
    const body = {
      app_id: document.getElementById('cfgAppId').value,
      app_secret: document.getElementById('cfgAppSecret').value,
      domain: document.getElementById('cfgDomain').value,
      folder_token: document.getElementById('cfgFolder').value,
      doc_title: document.getElementById('cfgDocTitle').value,
      file_name: document.getElementById('cfgFileName').value,
      dryRun: document.getElementById('cfgDryRun').checked
    };
    const j = await ResumeStore.saveConfig(body);
    closeFeishuConfig();
    showFeishuStatus(j.configured ? '✓ 飞书配置已保存，可以「上报到飞书」了' : '✓ 配置已保存（未完整配置，仅 dry-run 可用）');
  } catch (e) {
    showFeishuStatus('✗ 配置保存失败：' + e.message);
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = '保存配置'; }
  }
}

/* ============ 右侧编辑面板 收起/展开（收起后简历预览占满居中） ============ */
const PANE_COLLAPSED_KEY = 'resume_editor_pane_collapsed_v1';
function setPaneCollapsed(collapsed, persist){
  const app = document.querySelector('.app');
  if (!app) return;
  app.classList.toggle('pane-collapsed', collapsed);
  const tab = document.getElementById('paneTab');
  const arrow = document.getElementById('paneTabArrow');
  const menuBtn = document.getElementById('paneToggleBtn');
  if (tab) tab.title = (collapsed ? '展开' : '收起') + '编辑面板 (Ctrl/Cmd+B)';
  if (arrow) arrow.textContent = collapsed ? '‹' : '›';
  if (menuBtn) menuBtn.textContent = collapsed ? '展开编辑面板' : '收起编辑面板';
  if (persist !== false) { try{ localStorage.setItem(PANE_COLLAPSED_KEY, collapsed ? '1' : ''); }catch(e){} }
}
function toggleEditorPane(){
  const app = document.querySelector('.app');
  setPaneCollapsed(!(app && app.classList.contains('pane-collapsed')));
}

/* ============ 右缘侧边标签 + 浮动面板（可扩展多个；同一时间只展开一个） ============
   规划：每个 .pane-tab[data-panel] 配一个 .side-panel#<data-panel>；
   rail 自上而下堆叠、面板一律从右缘向左浮出，互不遮挡；
   展开状态记 localStorage（键 SIDE_PANEL_KEY，值为面板 id 或空）。 */
const SIDE_PANEL_KEY = 'resume_side_panel_open_v1';
function syncSideRail(){
  document.querySelectorAll('.side-rail .pane-tab[data-panel]').forEach(btn => {
    const p = document.getElementById(btn.getAttribute('data-panel'));
    if (!p) return;
    const open = p.classList.contains('open');
    btn.classList.toggle('active', open);
    const arrow = btn.querySelector('.pane-tab-arrow');
    if (arrow) arrow.textContent = open ? '\u203a' : '\u2039'; // › 展开中(点收起) / ‹ 已收起(点展开)
    const label = btn.querySelector('.pane-tab-label');
    btn.title = (open ? '收起' : '展开') + (label ? label.textContent : '');
  });
}
function setSidePanelOpen(panelId, open, persist){
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (open) {
    document.querySelectorAll('.side-panel.open').forEach(p => { if (p.id !== panelId) p.classList.remove('open'); });
  }
  panel.classList.toggle('open', open);
  syncSideRail();
  if (persist !== false) { try{ localStorage.setItem(SIDE_PANEL_KEY, open ? panelId : ''); }catch(e){} }
}
function toggleSidePanel(panelId){
  const panel = document.getElementById(panelId);
  setSidePanelOpen(panelId, !(panel && panel.classList.contains('open')));
}
/* 点击面板与标签栏以外的空白处收起（点面板内按钮不受影响） */
document.addEventListener('click', (e) => {
  if (e.target.closest('.side-panel') || e.target.closest('.side-rail')) return;
  document.querySelectorAll('.side-panel.open').forEach(p => setSidePanelOpen(p.id, false));
});
/* 手机视图切换：preview / edit / sync（仅新增，不影响桌面布局与渲染逻辑） */
function setMobileView(view){
  const app = document.querySelector('.app');
  if (!app) return;
  const prevView = currentMobileView();
  app.classList.remove('mv-preview','mv-edit','mv-sync');
  app.classList.add('mv-' + view);
  document.querySelectorAll('.mobile-tabbar button').forEach(b=>{
    b.classList.toggle('active', b.getAttribute('data-mv') === view);
  });
  applyPreviewScale();   // 预览页从隐藏变为可见后重新等比缩放
  /* P3 返回键钩子：只在 preview ↔ 非 preview 之间切换时动 history，避免连点堆积 */
  try{
    if(mvHistoryLocked) return;
    if(view !== 'preview' && prevView === 'preview') pushMobileHistory(view);
    else if(view === 'preview' && prevView !== 'preview') consumeMobileHistory();
  }catch(e){}
}

/* ============ P3 返回键语义（移动端加固） ============
   手机按系统返回键 / 浏览器后退时的优先级：
     1) 有可见弹层 → 只关弹层，不改变视图；
     2) 当前不是预览视图 → 回到预览视图；
     3) 已在预览视图且无弹层 → 允许真正后退（不把用户困住，也不无故拦截离开页面）。
   实现：History API（浏览器可实测）+ Tauri 原生返回事件（能力探测，不可用则静默跳过）。
   约束：只在 setMobileView 内挂钩子，不触碰渲染 / recordHistory / undo / redo；全程 try/catch。 */
let mvHistoryLocked = false;   // popstate 处理期间锁住 history 钩子，避免递归
function currentMobileView(){
  try{
    const app = document.querySelector('.app');
    if(!app) return 'preview';
    if(app.classList.contains('mv-edit')) return 'edit';
    if(app.classList.contains('mv-sync')) return 'sync';
  }catch(e){}
  return 'preview';
}
/* 弹层靠 inline display:flex 显示（见 exportPDF / showExportModal），这里按「当前可见」判定 */
function visibleModal(){
  try{
    const list = document.querySelectorAll('.pdf-modal');
    let found = null;
    for(let i=0;i<list.length;i++){
      const el = list[i];
      const cs = (typeof global.getComputedStyle === 'function') ? global.getComputedStyle(el) : null;
      if(el.style.display === 'flex' || (cs && cs.display !== 'none')) found = el;
    }
    return found;
  }catch(e){ return null; }
}
function closeVisibleModal(){
  try{
    const m = visibleModal();
    if(!m) return false;
    if(m.id === 'pdfModal'){ closePdfModal(); return true; }
    if(m.id === 'exportModal'){ closeExportModal(); return true; }
    if(m.id === 'feishuRestoreModal'){ closeFeishuRestore(); return true; }
    if(m.id === 'feishuConfigModal'){ closeFeishuConfig(); return true; }
    m.style.display = 'none';
    return true;
  }catch(e){ return false; }
}
function pushMobileHistory(view){
  try{
    if(!global.history || typeof global.history.pushState !== 'function') return;
    global.history.pushState({ mv: view }, '');
  }catch(e){}
}
/* 回到预览视图时消费掉之前压入的那条历史，保持 history 与视图状态一致 */
function consumeMobileHistory(){
  try{
    const h = global.history;
    if(!h || !h.state || !h.state.mv || typeof h.back !== 'function') return;
    h.back();
  }catch(e){}
}
function onMobilePopState(){
  if(mvHistoryLocked) return;
  mvHistoryLocked = true;
  try{
    if(closeVisibleModal()){
      /* 这次后退已被浏览器消费（用来关弹层），补回一条状态，避免下一次后退直接离页 */
      pushMobileHistory(currentMobileView());
      return;
    }
    if(currentMobileView() !== 'preview') setMobileView('preview');
  }catch(e){
  }finally{ mvHistoryLocked = false; }
}
/* 返回动作的统一入口：返回 true 表示已被应用消费（原生壳 / 测试可直接调它） */
function handleMobileBack(){
  try{
    if(closeVisibleModal()) return true;
    if(currentMobileView() !== 'preview'){ setMobileView('preview'); return true; }
  }catch(e){}
  return false;
}
/* 原生壳返回事件：Tauri 2 未内置统一的 back 事件，故做能力探测——命中 API 才监听，
   拿不到就静默跳过、绝不报错。Android WebView 的系统返回键本身会触发 history.back()，
   所以上面那条浏览器路径已覆盖绝大多数场景。 */
function setupNativeBack(){
  try{
    const T = global.__TAURI__;
    if(!T) return false;
    const evt = T.event || (T.core && T.core.event);
    if(!evt || typeof evt.listen !== 'function') return false;
    ['tauri://back-button','back-button','android-back','onBackPressed'].forEach(name=>{
      try{
        const p = evt.listen(name, ()=>{ handleMobileBack(); });
        if(p && typeof p.then === 'function') p.catch(()=>{});
      }catch(e){}
    });
    return true;
  }catch(e){ return false; }
}
function setupMobileBackGesture(){
  try{
    if(global.history && typeof global.addEventListener === 'function'){
      global.addEventListener('popstate', onMobilePopState);
    }
  }catch(e){}
  setupNativeBack();
}

/* ============ P3 软键盘可视区（移动端加固） ============
   把 visualViewport 的可视高度 / 键盘高度写进 CSS 变量 --vvh / --kb；
   只有 css/style.css 里 ≤640px 的媒体查询消费它们，桌面 / 平板零变化。
   没有 visualViewport 时退化为 window.innerHeight（键盘高度按 0），再不行就完全不动
   （CSS 侧有 var(--vvh,100vh) / var(--kb,0px) 兜底）。 */
function setupVisualViewport(){
  try{
    const root = document.documentElement;
    if(!root || !root.style || typeof root.style.setProperty !== 'function') return;
    const vv = global.visualViewport;
    if(!vv || typeof vv.addEventListener !== 'function'){
      const fallback = ()=>{
        try{
          root.style.setProperty('--vvh', global.innerHeight + 'px');
          root.style.setProperty('--kb', '0px');
        }catch(e){}
      };
      fallback();
      global.addEventListener('resize', fallback);
      return;
    }
    const update = ()=>{
      try{
        const h = vv.height || global.innerHeight;
        // Android：软键盘弹出时 innerHeight 同步变矮 → kb≈0（Tab 自然贴住键盘上沿）
        // iOS：innerHeight 不变而 vv.height 变矮 → kb>0，把 Tab 顶到键盘之上
        const kb = Math.max(0, (global.innerHeight || h) - h - (vv.offsetTop || 0));
        root.style.setProperty('--vvh', h + 'px');
        root.style.setProperty('--kb', kb + 'px');
      }catch(e){}
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    global.addEventListener('resize', update);
  }catch(e){}
}
/* 移动端聚焦输入框后把它滚进可视区，避免被软键盘遮挡（只在小屏 / 触控设备生效） */
function setupKeyboardFocusGuard(){
  try{
    if(typeof global.matchMedia !== 'function') return;
    const mq = global.matchMedia('(max-width:640px), (pointer:coarse)');
    document.addEventListener('focusin', e=>{
      try{
        if(!mq.matches) return;
        const el = e.target;
        if(!el || !el.tagName) return;
        const tag = String(el.tagName).toLowerCase();
        if(tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
        setTimeout(()=>{   // 等软键盘动画结束再滚，否则仍会被键盘盖住
          try{
            if(el && el.isConnected && typeof el.scrollIntoView === 'function'){
              el.scrollIntoView({block:'center', inline:'nearest'});
            }
          }catch(e){}
        }, 300);
      }catch(e){}
    }, true);
  }catch(e){}
}
/* 启动时恢复上次的面板状态（不回写存储） */
try{ setPaneCollapsed(localStorage.getItem(PANE_COLLAPSED_KEY) === '1', false); }catch(e){}
try{ setSidePanelOpen('toolsPanel', localStorage.getItem(SIDE_PANEL_KEY) === 'toolsPanel', false); }catch(e){}

/* ============ 初始化 ============ */
/* 主题：js/theme.js 加载时已自行初始化并写好 <html> 属性；
   这里再刷一次按钮文案（防御性：若将来调整脚本加载顺序也不会漏渲） */
try{ if(themeApi()) themeApi().init(); }catch(e){}
loadFileNameBase();
const restored = loadState();
renderSettings();
renderMarginSettings();
renderSpacingSettings();
renderEditor();
renderPreview();
applyPanelState();
updateFileNameInput();
try{ document.title = (data.name||'简历') + ' · 简历编辑器'; }catch(_){}
updateUndoButtons();
if(restored){ const el=document.getElementById('autosave'); if(el) el.textContent='✓ 已恢复上次保存的内容'; }
bootDone = true;
/* P3 移动端加固：软键盘可视区变量 + 返回键语义（任一步失败都静默，桌面 / 浏览器零影响） */
setupVisualViewport();
setupKeyboardFocusGuard();
setupMobileBackGesture();
// 初始化数据源优先级：
//   1) 仓库 data/resume.json（用户私有实时数据，最高优先）
//   2) 否则 template.json（公开示范数据）
//   3) 都没有（如 file:// / 单文件版）→ 回退 js/data.js 内置默认数据
// 需经本地写服务（npm start）打开才能读到；file:// 或只读服务器读取失败时静默回退
loadRepoData({silent:true}).then(applied=>{
  if(applied){
    const el=document.getElementById('autosave');
    if(el) el.textContent = '✓ 已从仓库 data/resume.json 加载';
    return;
  }
  return loadTemplateData({silent:true}).then(tApplied=>{
    const el=document.getElementById('autosave');
    if(el) el.textContent = tApplied
      ? '✓ 已加载示范数据（template.json，可编辑后导出 / 实时保存）'
      : '✓ 已加载（未连接本地写服务，编辑仅存本浏览器，请改用 npm start 启动）';
  });
}).catch(()=>{});

/* ============ 对外命名空间（集中挂载，避免污染全局 window） ============ */
/* 仅 index.html 内联事件所需的函数，以及测试 / 调试用内部函数，暴露在此对象上；
   其余所有辅助函数 / 变量均为 IIFE 私有，不再泄漏到全局作用域。 */
global.ResumeEditor = {
  // —— 供 index.html 内联 onclick / onchange 调用 ——
  toggleGuides: toggleGuides,
  exportPDF: exportPDF,
  exportJSON: exportJSON,
  exportLongImage: exportLongImage,
  exportSingleFileHTML: exportSingleFileHTML,
  closeExportModal: closeExportModal,
  doExportDownload: doExportDownload,
  setFileNameBase: setFileNameBase,
  importJSON: importJSON,
  loadRepoData: loadRepoData,
  clearSaved: clearSaved,
  reportToFeishu: reportToFeishu,
  openFeishuRestore: openFeishuRestore,
  restoreFromFeishu: restoreFromFeishu,
  closeFeishuRestore: closeFeishuRestore,
  toggleMenu: toggleMenu,
  openFeishuConfig: openFeishuConfig,
  closeFeishuConfig: closeFeishuConfig,
  saveFeishuConfig: saveFeishuConfig,
  toggleEditorPane: toggleEditorPane,
  toggleSidePanel: toggleSidePanel,
  setSidePanelOpen: setSidePanelOpen,
  toggleTheme: toggleTheme,
  setThemeMode: setThemeMode,
  togglePaperTheme: togglePaperTheme,
  setMobileView: setMobileView,
  handleMobileBack: handleMobileBack,
  currentMobileView: currentMobileView,
  closeVisibleModal: closeVisibleModal,
  undo: undo,
  redo: redo,
  resetSpacing: resetSpacing,
  resetMargins: resetMargins,
  closePdfModal: closePdfModal,
  downloadPDFNow: downloadPDFNow,
  // —— 供平行模块（js/audit.js 体检、js/export-extra.js 导出）只读取当前数据 ——
  // 只读用途：体检 / 导出；外部需要改数据请走 applyImported，勿直接改返回的 data
  getData: function(){ return { data: data, fonts: currentFonts, spacing: currentSpacing }; },
  // —— 供单元测试 / 调试复用（非公开 API） ——
  blankSection: blankSection,
  blankItem: blankItem,
  recordHistory: recordHistory,
  hist: hist,
  loadState: loadState,
  applyImported: applyImported,
  renderResumeInner: renderResumeInner,
  migrateSpacing: migrateSpacing,
  migratePageBreaks: migratePageBreaks,
  getFileName: getFileName,
  SAVE_KEY: SAVE_KEY,
  SAVE_KEY_LEGACY: SAVE_KEY_LEGACY
};
}) (typeof window !== 'undefined' ? window : globalThis);
