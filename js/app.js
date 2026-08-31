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
    h+=`<section class="section" data-drag="section:${sec.id}" draggable="true" style="${spacingStyle('section', sec.spacing)}">`;
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
          const qStyle = quote ? `padding:6px 0 6px 10px;border-left:2px solid ${color};background:#fafafa;` : '';
          h+=`<div class="job-summary" style="${spacingStyle('summary', job.summarySpacing)}${qStyle}">${esc(T(job.summary)).replace(/\n/g,'<br>')}</div>`;
        }
        (job.projects||[]).forEach((p,pi)=>{
          const projBreak = p.pageBreak ? ' page-break-before' : '';
          h+=`<div class="project nested${projBreak}" data-drag="proj:${sec.id}:${i}:${pi}" draggable="true" style="${spacingStyle('project', p.spacing)}">`;
          h+=`<p class="project-title" style="${spacingStyle('pTitle', p.nameSpacing)}">${esc(T(p.name))}</p>`
            +`<span class="stack" style="${spacingStyle('pStack', p.stackSpacing)}">${esc(T(p.stack))}</span>`;
          const pQuote = p.descQuote !== false;
          const pColor = esc(p.descColor || '#888888');
          const pQStyle = pQuote ? `padding:6px 0 6px 10px;border-left:2px solid ${pColor};background:#fafafa;` : '';
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
        const pQStyle = pQuote ? `padding:6px 0 6px 10px;border-left:2px solid ${pColor};background:#fafafa;` : '';
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
    }
    h+='</section>';
  });
  return h;
}

const preview = document.getElementById('preview');
function renderPreview(){ preview.innerHTML = `<div class="resume" style="${getVarStr()}">${renderResumeInner()}</div>`; drawPageGuides(); saveState(); }

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
  if(type==='advantages') return {id, type:'advantages', title:'个人优势', items:[ blankItem('advantages') ]};
  if(type==='career')     return {id, type:'career', title:'职业履历', items:[ blankItem('career') ]};
  if(type==='skills')     return {id, type:'skills', title:'核心技能', groups:[ {name:'', items:[], spacing:{mt:0,mb:0}, nameSpacing:{mt:0,mb:0}} ]};
  if(type==='projects')   return {id, type:'projects', title:'项目经历', items:[ blankProject() ]};
  return {id, type:'advantages', title:'个人优势', items:[ blankItem('advantages') ]};
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
      +'<div class="card-body">'+ fl('板块标题', '<input data-sec="'+sec.id+'" data-field="title" value="'+esc(sec.title)+'">', 's:'+sec.id, sec.spacing);
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
    }
    h+='</div></div>';
  });
  // 添加板块
  h+='<div class="card add-section-card"><div class="card-head">添加板块</div><div class="card-body add-section-body">'
    +'<button class="add-btn" data-action="add-section" data-type="advantages">＋ 个人优势</button>'
    +'<button class="add-btn" data-action="add-section" data-type="career">＋ 职业履历</button>'
    +'<button class="add-btn" data-action="add-section" data-type="skills">＋ 核心技能</button>'
    +'<button class="add-btn" data-action="add-section" data-type="projects">＋ 项目经历</button>'
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
  renderSettings(); renderSpacingSettings(); renderEditor(); renderPreview(); applyPanelState();
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
      +`<small style="color:#999;">上</small><input type="number" min="-40" max="80" step="1" value="${s.mt}" data-k="${k}" data-pos="mt" title="上间距" style="width:46px;">`
      +`<small style="color:#999;">下</small><input type="number" min="-40" max="80" step="1" value="${s.mb}" data-k="${k}" data-pos="mb" title="下间距" style="width:46px;">`
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
  ['panel-fonts','panel-spacing','panel-editor'].forEach(id=>{
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
// 计算每一页的高度（像素）：按 A4 的 210:297 比例，以简历真实宽度为基准
function getPageMetrics(){
  const resume = preview.querySelector('.resume');
  if(!resume) return null;
  const w = resume.offsetWidth;
  const pageH = w * 297 / 210;     // 单页高度（px）
  const totalH = resume.offsetHeight;
  return { resume, w, pageH, totalH };
}
// 计算真实分页位置：先收集右侧勾选的「强制换页」元素 offsetTop，再与自然 A4 高度取并集
function computePageBreaks(){
  const m = getPageMetrics();
  if(!m) return [];
  const { resume, pageH, totalH } = m;
  const forced = Array.from(resume.querySelectorAll('.page-break-before'))
    .map(el => el.offsetTop - resume.offsetTop)
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
  const left = rect.left - prect.left;
  const frag = document.createDocumentFragment();
  for(let n = 1; n < breaks.length; n++){
    const y = breaks[n];
    const d = document.createElement('div'); d.className = 'page-guide';
    d.style.top = (rect.top - prect.top + y) + 'px';
    d.style.left = left + 'px';
    d.style.right = 'auto';
    d.style.width = m.w + 'px';
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

/* ============ 导出 PDF：按实时预览的分页逐页截图，再拼成 PDF ============ */
let currentPdfBlobUrl = null;
// 把实时预览里的 .resume 克隆到屏幕外容器中（固定真实宽度），用于 html2canvas 整页截图
function makeCaptureClone(live){
  const w = live.offsetWidth;
  const totalH = live.offsetHeight;
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:'+w+'px;height:'+totalH+'px;overflow:hidden;z-index:-1;background:#fff;';
  const clone = live.cloneNode(true);
  clone.style.boxSizing = 'border-box';
  clone.style.width = w + 'px';
  clone.style.maxWidth = 'none';
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  clone.style.background = '#fff';
  clone.style.transform = 'none';
  clone.querySelectorAll('[data-drag]').forEach(n=>n.removeAttribute('data-drag'));
  clone.querySelectorAll('[draggable]').forEach(n=>n.removeAttribute('draggable'));
  clone.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(n=>n.classList.remove('dragging','drop-before','drop-after'));
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  return { wrapper, clone, w, totalH };
}
async function buildImagePdf(){
  const live = preview.querySelector('.resume');
  if(!live) throw new Error('预览未渲染');
  if(typeof html2canvas === 'undefined') throw new Error('截图库(html2canvas)未加载，请检查网络');
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
  if(!jsPDFCtor) throw new Error('PDF 库(jsPDF)未加载，请检查网络');

  const m = { w: live.offsetWidth, pageH: live.offsetWidth * 297 / 210, totalH: live.offsetHeight };
  // 整页截图（屏幕外克隆，避免滚动影响）
  const cap = makeCaptureClone(live);
  try{
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await html2canvas(cap.clone, {
      scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff',
      width: cap.w, height: cap.totalH, windowWidth: cap.w, windowHeight: cap.totalH, x: 0, y: 0
    });
    const srcScale = canvas.width / cap.w;           // 截图实际像素 / CSS 宽度
    const breaks = computePageBreaks();              // 真实分页位置（已含强制换页）
    const pages = Math.max(1, breaks.length - 1);
    const pdf = new jsPDFCtor('p','mm','a4');
    const PW = 210, PH = 297;
    for(let i=0; i<pages; i++){
      const y = breaks[i];
      const h = breaks[i+1] - y;
      const sx = 0, sy = Math.floor(y * srcScale);
      const sW = canvas.width, sH = Math.floor(h * srcScale);
      const pc = document.createElement('canvas');
      pc.width = sW; pc.height = sH;
      pc.getContext('2d').drawImage(canvas, sx, sy, sW, sH, 0, 0, sW, sH);
      const img = pc.toDataURL('image/jpeg', 0.98);
      if(i>0) pdf.addPage();
      // 宽度铺满 A4，高度按真实比例（短页不拉伸，底部留白）
      const imgH = (h / m.pageH) * PH;
      pdf.addImage(img, 'JPEG', 0, 0, PW, imgH);
    }
    return { blob: pdf.output('blob'), pages };
  } finally {
    document.body.removeChild(cap.wrapper);
  }
}
function exportPDF(){
  const btn = document.querySelector('.toolbar button[onclick="exportPDF()"]');
  if(btn){ btn.disabled = true; btn.textContent = '生成中…'; }
  if(!preview.querySelector('.resume')){
    alert('预览未渲染，请稍候重试。');
    if(btn){ btn.disabled = false; btn.textContent = 'PDF 预览 / 导出'; }
    return;
  }
  buildImagePdf().then(({blob, pages})=>{
    if(currentPdfBlobUrl) URL.revokeObjectURL(currentPdfBlobUrl);
    currentPdfBlobUrl = URL.createObjectURL(blob);
    document.getElementById('pdfFrame').src = currentPdfBlobUrl;
    document.getElementById('pdfPageInfo').textContent = '共 ' + pages + ' 页';
    document.getElementById('pdfModal').style.display = 'flex';
  }).catch(err=>{
    alert('PDF 生成失败：' + (err && err.message ? err.message : err));
  }).finally(()=>{
    if(btn){ btn.disabled = false; btn.textContent = 'PDF 预览 / 导出'; }
  });
}
function downloadPDFNow(){
  if(!currentPdfBlobUrl){ exportPDF(); return; }
  const a = document.createElement('a');
  a.href = currentPdfBlobUrl; a.download = ((data.name||'简历').replace(/\s+/g,'_')) + '_简历.pdf';
  document.body.appendChild(a); a.click(); a.remove();
}
function closePdfModal(){
  document.getElementById('pdfModal').style.display = 'none';
  document.getElementById('pdfFrame').src = 'about:blank';
}
document.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){ const m=document.getElementById('pdfModal'); if(m && m.style.display==='flex') closePdfModal(); }
  // 撤销 / 重做（应用级；会覆盖输入框的原生撤销，换取整段内容的撤销能力）
  const mod = e.ctrlKey || e.metaKey;
  if(mod && (e.key==='z' || e.key==='Z')){ e.preventDefault(); if(e.shiftKey) redo(); else undo(); }
  else if(mod && (e.key==='y' || e.key==='Y')){ e.preventDefault(); redo(); }
});

/* ============ 自动保存（编辑即存入浏览器 localStorage，重新打开本文件时恢复） ============ */
const SAVE_KEY = 'resume_builder_data_v1';
const SAVE_KEY_LEGACY = 'resume_chenpeisheng_v1';
const SAVE_VERSION = 6;
let bootDone = false;
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
      try{ localStorage.setItem(SAVE_KEY, JSON.stringify({data, fonts: currentFonts, spacing: currentSpacing, v: SAVE_VERSION})); }catch(_){}
    }
    return true;
  }catch(e){ return false; }
}
// 将「指数引力」公司设为强制从新一页开始（其后紧跟的「周生生」会随之进入第二页）
function migratePageBreaks(d){
  (d.sections||[]).forEach(sec=>{
    if(sec.type==='career'){
      (sec.items||[]).forEach(job=>{
        if(/指数引力/.test(job.company||'')) job.pageBreak = true;
      });
    }
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
  a.href = url; a.download = ((data.name||'resume').replace(/\s+/g,'_')) + '_简历数据.json';
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
function applyImported(obj){
  if(!obj || typeof obj!=='object' || !obj.data || !Array.isArray(obj.data.sections)){
    alert('导入失败：文件格式不正确（缺少 data.sections）');
    return;
  }
  if(!confirm('导入将用文件内容覆盖当前编辑器中的全部内容，确定继续？')) return;
  recordHistory('action');   // 导入前记录，导入结果可撤销
  // 规范化数据形态（兼容旧版纯字符串 / 分页符残留）
  data = obj.data;
  if(obj.fonts && typeof obj.fonts==='object') currentFonts = obj.fonts;
  if(obj.spacing && typeof obj.spacing==='object') currentSpacing = obj.spacing;
  migrateQuoteColors(data);
  migrateSpacing(data);
  if(!data.sections) data.sections = [];
  saveState();
  renderSettings(); renderSpacingSettings(); renderEditor(); renderPreview(); applyPanelState();
  try{ document.title = (data.name||'简历') + ' · 简历编辑器'; }catch(_){}
  showAutosave();
  alert('✓ 已导入数据');
}

/* ============ 初始化 ============ */
const restored = loadState();
renderSettings();
renderSpacingSettings();
renderEditor();
renderPreview();
applyPanelState();
try{ document.title = (data.name||'简历') + ' · 简历编辑器'; }catch(_){}
updateUndoButtons();
if(restored){ const el=document.getElementById('autosave'); if(el) el.textContent='✓ 已恢复上次保存的内容'; }
bootDone = true;

/* ============ 对外命名空间（集中挂载，避免污染全局 window） ============ */
/* 仅 index.html 内联事件所需的函数，以及测试 / 调试用内部函数，暴露在此对象上；
   其余所有辅助函数 / 变量均为 IIFE 私有，不再泄漏到全局作用域。 */
global.ResumeEditor = {
  // —— 供 index.html 内联 onclick / onchange 调用 ——
  toggleGuides: toggleGuides,
  exportPDF: exportPDF,
  exportJSON: exportJSON,
  importJSON: importJSON,
  clearSaved: clearSaved,
  undo: undo,
  redo: redo,
  resetSpacing: resetSpacing,
  closePdfModal: closePdfModal,
  downloadPDFNow: downloadPDFNow,
  // —— 供单元测试 / 调试复用（非公开 API） ——
  blankSection: blankSection,
  blankItem: blankItem,
  recordHistory: recordHistory,
  hist: hist,
  loadState: loadState,
  applyImported: applyImported,
  renderResumeInner: renderResumeInner,
  migrateSpacing: migrateSpacing,
  SAVE_KEY: SAVE_KEY,
  SAVE_KEY_LEGACY: SAVE_KEY_LEGACY
};
}) (typeof window !== 'undefined' ? window : globalThis);
