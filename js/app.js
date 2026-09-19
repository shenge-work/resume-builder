/* =============================================================
 * 简历编辑器 - 业务逻辑
 * -------------------------------------------------------------
 * 渲染、拖拽排序、字号/间距配置、分页参考线、PDF 导出、自动保存。
 * 数据与默认值来自 js/data.js（需先加载）
 * ============================================================= */
(function(global){
'use strict';
/* 从 js/render/resume-render.js 解构纯渲染函数（物理拆分，不改变行为） */
const { esc, boldText, getSection, getVarStr, spacingStyle, z, getPageMargins, mmToPx, pxToMm, T, S, renderResumeInner, blankItem, blankProject, blankSection, blankPhase, objify, itemHead, safeMm, syncPrintPageMargin, renderPreview, renderEditor, parseSpacingTarget, renderSettings, resetFonts, renderSpacingSettings, resetSpacing, renderMarginSettings, resetMargins, getPageMetrics, computePageBreaks, drawPageGuides, toggleGuides, applyPreviewScale, migrateQuoteColors, migrateSpacing, migrateSpacingDefaults, migratePageBreaks } = global.ResumeRender;
/* 从 js/feishu/feishu-sync.js 解构飞书 / 导入函数（物理拆分，不改变行为） */
const { showFeishuStatus, reportToFeishu, pullFromFeishu, restoreFromFeishu, toggleMenu, openFeishuConfig, closeFeishuConfig, saveFeishuConfig, probeFeishuConfig, localApi, checkFeishuOauthStatus, startFeishuOauth, refreshFeishuOauth, revokeFeishuOauth, startFeishuRegister, cancelFeishuRegister, importResumeFile, importResumePayload, startAutoSync } = global.ResumeFeishu;
/* 从 js/export/export-pdf.js 解构导出函数（物理拆分，不改变行为） */
const { exportPDF, downloadPDFNow, closePdfModal, showExportModal, closeExportModal, doExportDownload, exportLongImage, exportSingleFileHTML } = global.ResumeExport;
/* 从 js/ui/pane-mobile.js 解构面板 / 移动端 UI 函数（物理拆分，不改变行为） */
const { setPaneCollapsed, toggleEditorPane, syncSideRail, setSidePanelOpen, toggleSidePanel, setMobileView, currentMobileView, visibleModal, closeVisibleModal, handleMobileBack, setupNativeBack, setupMobileBackGesture, setupVisualViewport, setupKeyboardFocusGuard } = global.ResumeUI;

const hist = { undo: [], redo: [], last: { kind:'', t:0 } };
const HIST_MAX = 100;
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
  markDirty(activeResumeId);
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

/* ============ 多简历（M1/M2）：左抽屉 + 顶部标签页 ============
   状态：
   - activeResumeId：当前正在编辑的简历 id（null = 尚未接入多简历，走旧单份逻辑）
   - openTabs：已打开的工作区标签 id 列表（桌面多开）
   - dirty：每份简历是否有未同步修改（用 Set 记 id，保存即清）
   与现有单份逻辑的关系：data/fonts/spacing 仍是「当前编辑的那份」；
   saveState() 时额外把 payload 写进 ResumeLibrary.save(activeResumeId, …)。
   首份简历由「继承现有单份数据」创建，保证老用户升级不丢内容。 */
let activeResumeId = null;       // 当前激活简历 id
let openTabs = [];               // 已打开标签 id 列表（顺序）
let dirtySet = new Set();        // 未保存的简历 id 集合
let _libraryReady = false;       // ResumeLibrary 是否已初始化
let lastSavedAt = 0;             // 当前内存数据的来源时间戳（0=未知/旧数据无时间戳）

function currentPayload(){ return { data, fonts: currentFonts, spacing: currentSpacing, v: SAVE_VERSION, savedAt: Date.now() }; }
function markDirty(id){ if(id){ dirtySet.add(id); renderResumeDrawer(); } }
function clearDirty(id){ if(id){ dirtySet.delete(id); renderResumeDrawer(); } }
function isDirty(id){ return !!id && dirtySet.has(id); }

/* 仲裁：库文档与当前内存基底（磁盘 resume.json / localStorage）谁新用谁。
   返回 'library'=库文档较新（浏览器里有未落盘的更新修改）；'repo'=基底较新或同级。
   旧数据双方都无 savedAt（都为 0）→ 'repo'（磁盘是恢复脚本/手工编辑的意图载体，磁盘优先）。 */
function pickResumeSource(doc, memSavedAt){
  return ((Number(doc && doc.savedAt) || 0) > (Number(memSavedAt) || 0)) ? 'library' : 'repo';
}

/* 初始化多简历：读索引；空库则继承现有单份数据建首份。
   ⚠️ 必须在基底数据链（loadRepoData → loadTemplateData）完成之后再调用：
   本函数会用 savedAt 仲裁「库文档 vs 基底」谁新，若在基底加载完成前调用，
   IndexedDB 旧文档会覆盖基底并写回磁盘（数据污染事故的根因）。 */
async function initResumeLibrary(){
  if(typeof global.ResumeLibrary !== 'object' || !global.ResumeLibrary) return;
  try{
    await global.ResumeLibrary.init();
    _libraryReady = true;
    let idx = await global.ResumeLibrary.list();
    if(!idx.length){
      // 空库：继承当前已加载的单份数据（localStorage / 种子）建首份
      const payload = currentPayload();
      const meta = await global.ResumeLibrary.create({ title: (data.name||'简历') || '未命名简历', payload: payload });
      activeResumeId = meta.id;
      openTabs = [meta.id];
    } else {
      const act = await global.ResumeLibrary.getActive();
      if(act && idx.some(m=>m.id===act)) activeResumeId = act;
      else { activeResumeId = idx[0].id; await global.ResumeLibrary.setActive(activeResumeId); }
      openTabs = [activeResumeId];
      // 载入激活简历——先仲裁，不再无条件覆盖：
      const doc = await global.ResumeLibrary.load(activeResumeId);
      if(doc && doc.data && pickResumeSource(doc, lastSavedAt) === 'library'){
        // 库文档较新（浏览器里有比磁盘/localStorage 更新的修改）→ 用库文档
        applyPayloadWithoutSave(doc);
      } else {
        // 基底较新（或双方都无时间戳 → 磁盘优先）：把基底回写库，保证库与基底一致
        try{ await global.ResumeLibrary.save(activeResumeId, currentPayload()); }catch(e){}
      }
    }
    renderResumeTabs();
    renderResumeDrawer();
    // 恢复抽屉展开/收起状态（默认展开；只有明确存过 '0' 才收起）
    try{
      const d = document.getElementById('resumeDrawer');
      if(d && localStorage.getItem(RESUME_DRAWER_KEY) === '0') d.classList.remove('open');
    }catch(e){}
  }catch(e){ /* 多简历初始化失败静默，退回旧单份逻辑 */ }
}

/* 切换激活简历：保存当前份 → 载入目标份 → 更新抽屉/标签/激活态 */
async function switchResume(id){
  if(!_libraryReady || !id || id === activeResumeId){ renderResumeTabs(); return; }
  // 保存当前份
  if(activeResumeId){ try{ await global.ResumeLibrary.save(activeResumeId, currentPayload()); clearDirty(activeResumeId); }catch(e){} }
  // 载入目标份
  try{
    const doc = await global.ResumeLibrary.load(id);
    /* ⚠️ activeResumeId 必须在 applyPayloadWithoutSave 之前切换：
       applyPayloadWithoutSave → renderPreview → saveState → ResumeLibrary.save(activeResumeId, …)，
       若顺序反了，「载入新份」触发的保存会把新份数据写进旧份文档（数据覆盖事故） */
    activeResumeId = id;
    await global.ResumeLibrary.setActive(id);
    if(doc && doc.data){
      applyPayloadWithoutSave(doc);
    } else {
      // 目标份无文档（理论不会发生），给空骨架
      data = { name:'', contact:[], sections:[] }; currentFonts = JSON.parse(JSON.stringify(defaultFonts)); currentSpacing = JSON.parse(JSON.stringify(defaultSpacing));
    }
    if(!openTabs.includes(id)) openTabs.push(id);
    renderResumeTabs(); renderResumeDrawer();
  }catch(e){ /* 静默 */ }
}

/* 打开某份（抽屉点击）：若未打开则加入标签并激活，已打开则切到该标签 */
async function openResume(id){
  await switchResume(id);
}

/* 新建简历 */
async function resumeNew(){
  if(!_libraryReady) return;
  try{
    const title = (prompt('新简历名称', '未命名简历') || '').trim() || '未命名简历';
    const meta = await global.ResumeLibrary.create({ title: title, payload: { data:{name:'',contact:[],sections:[]}, fonts: JSON.parse(JSON.stringify(defaultFonts)), spacing: JSON.parse(JSON.stringify(defaultSpacing)), v: SAVE_VERSION } });
    activeResumeId = meta.id;
    openTabs.push(meta.id);
    applyPayloadWithoutSave({ data:{name:'',contact:[],sections:[]}, fonts: JSON.parse(JSON.stringify(defaultFonts)), spacing: JSON.parse(JSON.stringify(defaultSpacing)), v: SAVE_VERSION });
    await global.ResumeLibrary.setActive(meta.id);
    renderResumeTabs(); renderResumeDrawer();
    return meta;
  }catch(e){ alert('新建失败：' + (e && e.message ? e.message : e)); return null; }
}

/* 复制当前简历 */
async function resumeDuplicate(id){
  if(!_libraryReady || !id) return;
  try{
    const meta = await global.ResumeLibrary.duplicate(id);
    activeResumeId = meta.id;
    openTabs.push(meta.id);
    const doc = await global.ResumeLibrary.load(meta.id);
    if(doc && doc.data) applyPayloadWithoutSave(doc);
    await global.ResumeLibrary.setActive(meta.id);
    renderResumeTabs(); renderResumeDrawer();
    return meta;
  }catch(e){ alert('复制失败：' + (e && e.message ? e.message : e)); return null; }
}

/* 删除简历 */
async function resumeRemove(id){
  if(!_libraryReady || !id) return;
  const idx = await global.ResumeLibrary.list();
  const m = idx.filter(x=>x.id===id)[0];
  if(!confirm('确定删除「' + (m ? m.title : '') + '」吗？此操作不可恢复。')) return;
  try{
    await global.ResumeLibrary.remove(id);
    openTabs = openTabs.filter(t=>t!==id);
    dirtySet.delete(id);
    if(activeResumeId === id){
      const rest = await global.ResumeLibrary.list();
      if(rest.length){
        activeResumeId = rest[0].id;
        const doc = await global.ResumeLibrary.load(activeResumeId);
        if(doc && doc.data) applyPayloadWithoutSave(doc);
        await global.ResumeLibrary.setActive(activeResumeId);
      } else {
        activeResumeId = null;
      }
    }
    renderResumeTabs(); renderResumeDrawer();
  }catch(e){ alert('删除失败：' + (e && e.message ? e.message : e)); }
}

/* 重命名 */
async function resumeRename(id){
  if(!_libraryReady || !id) return;
  const idx = await global.ResumeLibrary.list();
  const m = idx.filter(x=>x.id===id)[0];
  const title = (prompt('重命名', m ? m.title : '') || '').trim();
  if(!title) return;
  try{ await global.ResumeLibrary.rename(id, title); renderResumeDrawer(); renderResumeTabs(); }catch(e){}
}

/* 设置标签：逗号分隔输入 */
async function resumeSetTags(id){
  if(!_libraryReady || !id) return;
  const idx = await global.ResumeLibrary.list();
  const m = idx.filter(x=>x.id===id)[0];
  const cur = (m && Array.isArray(m.tags)) ? m.tags.join(', ') : '';
  const input = prompt('标签（逗号分隔，如：校招, AI方向, 后端）', cur);
  if(input === null) return;
  const tags = input.split(/[,，]/).map(function(t){return t.trim();}).filter(Boolean);
  try{ await global.ResumeLibrary.setTags(id, tags); renderResumeDrawer(); renderResumeTabs(); }catch(e){}
}

/* 关闭标签（不删简历，只是关掉工作区标签） */
async function resumeCloseTab(id){
  if(!_libraryReady) return;
  if(isDirty(id) && !confirm('该简历有未保存修改，关闭将保存。确定关闭？')) return;
  if(activeResumeId === id){
    try{ await global.ResumeLibrary.save(id, currentPayload()); clearDirty(id); }catch(e){}
  }
  openTabs = openTabs.filter(t=>t!==id);
  if(activeResumeId === id){
    // 激活下一个标签（最后一个），没有则激活列表首份
    if(openTabs.length){ await switchResume(openTabs[openTabs.length-1]); }
    else {
      const rest = await global.ResumeLibrary.list();
      if(rest.length){ activeResumeId = rest[0].id; const doc = await global.ResumeLibrary.load(activeResumeId); if(doc&&doc.data) applyPayloadWithoutSave(doc); openTabs=[activeResumeId]; }
    }
  }
  renderResumeTabs(); renderResumeDrawer();
}

/* 开关抽屉（桌面：常驻左列，切换宽度收缩/展开；手机：全屏滑出） */
const RESUME_DRAWER_KEY = 'resume_drawer_open_v1';
function toggleResumeDrawer(){
  const d = document.getElementById('resumeDrawer');
  if(!d) return;
  const open = !d.classList.contains('open');
  d.classList.toggle('open', open);
  if(open) renderResumeDrawer();
  try{ localStorage.setItem(RESUME_DRAWER_KEY, open ? '1' : '0'); }catch(e){}
}

/* 渲染顶部标签页 —— 已移除：顶部标签栏删除后，多简历切换统一走左侧常驻抽屉。
   保留函数名为空实现，兼容历史调用点；「未保存」状态改由抽屉列表体现。 */
function renderResumeTabs(){
  /* 顶部标签栏已删除，无需渲染 */
}

/* ===== 卡片「⋯」操作菜单（重命名 / 复制 / 删除） =====
   三个操作不再平铺在卡片上（鼠标扫过卡片时容易误点），改为点「⋯」弹出。
   菜单位于 body 下的固定层：抽屉 .resume-drawer-list 是 overflow:auto，
   绝对定位的子元素会被裁切，固定层不受影响。 */
let _resumeMenuId = null;
function resumeMenuEl(){
  let el = document.getElementById('resumeItemMenu');
  if(el) return el;
  el = document.createElement('div');
  el.id = 'resumeItemMenu';
  el.className = 'resume-item-menu';
  el.setAttribute('role','menu');
  // 菜单自身点击不冒泡：既不触发「点空白关闭」，也不会穿透到卡片
  el.addEventListener('click', function(ev){ ev.stopPropagation(); });
  document.body.appendChild(el);
  // 点空白处关闭（⋯ 按钮自身的点击被它 stopPropagation 拦下，走 toggle 分支）
  document.addEventListener('click', function(ev){
    if(!el.classList.contains('show')) return;
    if(el.contains(ev.target)) return;
    if(ev.target && ev.target.closest && ev.target.closest('.resume-item-more')) return;
    closeResumeItemMenu();
  });
  document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape') closeResumeItemMenu(); });
  // 捕获阶段监听滚动：抽屉列表内部滚动也能关掉菜单（否则菜单会留在原地错位）
  document.addEventListener('scroll', function(){ closeResumeItemMenu(); }, true);
  window.addEventListener('resize', closeResumeItemMenu);
  return el;
}
function closeResumeItemMenu(){
  const el = document.getElementById('resumeItemMenu');
  if(el) el.classList.remove('show');
  const on = document.querySelector('.resume-item-more.on');
  if(on) on.classList.remove('on');
  _resumeMenuId = null;
}
function toggleResumeItemMenu(id, btn){
  if(!id) return;
  const el = resumeMenuEl();
  if(_resumeMenuId === id && el.classList.contains('show')){ closeResumeItemMenu(); return; }
  closeResumeItemMenu();
  _resumeMenuId = id;
  const safeId = esc(id);
  const call = function(fn){ return 'ResumeEditor.closeResumeItemMenu();ResumeEditor.'+fn+'(\''+safeId+'\')'; };
  el.innerHTML = '<button type="button" role="menuitem" onclick="'+call('resumeRename')+'">重命名</button>'
    + '<button type="button" role="menuitem" onclick="'+call('resumeDuplicate')+'">复制</button>'
    + '<span class="menu-sep"></span>'
    + '<button type="button" role="menuitem" onclick="'+call('resumeRemove')+'">删除</button>';
  el.classList.add('show');
  if(btn) btn.classList.add('on');
  /* 定位：贴「⋯」右下角展开；下方放不下就翻到上方，左右收进视口内 */
  const r = btn ? btn.getBoundingClientRect() : {left:0,right:0,top:0,bottom:0};
  const w = el.offsetWidth, h = el.offsetHeight;
  let top = r.bottom + 4;
  if(top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
  const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
  el.style.left = Math.round(left) + 'px';
  el.style.top = Math.round(top) + 'px';
}

/* 渲染左抽屉简历列表 */
function renderResumeDrawer(){
  const list = document.getElementById('resumeList');
  if(!list || !_libraryReady) return;
  global.ResumeLibrary.list().then(idx=>{
    if(!idx.length){
      list.innerHTML = '<div class="resume-drawer-empty">还没有简历，点右上角「新建」创建第一份。</div>';
      return;
    }
    list.innerHTML = idx.map(m=>{
      const active = m.id===activeResumeId;
      const dirty = isDirty(m.id);
      const t = m.updatedAt ? new Date(m.updatedAt).toLocaleString() : '';
      /* ⚠️ 外层不能用 <button>：HTML 禁止 button 嵌套 button，浏览器解析时会把内层
         操作按钮整体提到外层，破坏布局（白色大块）。外层用 div + role="button"。
         ⚠️「⋯」按钮的 keydown 必须 stopPropagation：焦点在它上面按回车时，
         事件会冒泡到外层卡片，否则会顺带打开这份简历。 */
      return '<div class="resume-item'+(active?' active':'')+'" role="button" tabindex="0" data-id="'+esc(m.id)+'" onclick="ResumeEditor.openResume(\''+esc(m.id)+'\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();ResumeEditor.openResume(\''+esc(m.id)+'\')}">'
        + '<span class="resume-item-title">'+(dirty?'● ':'')+esc(m.title)+'</span>'
        + '<span class="resume-item-meta">'+esc(m.source==='local'?'本地':'云端')+' · '+esc(t)+'</span>'
        + '<button type="button" class="resume-item-more" data-more="'+esc(m.id)+'" title="更多操作（重命名 / 复制 / 删除）" aria-haspopup="menu"'
        +   ' onclick="event.stopPropagation();ResumeEditor.toggleResumeItemMenu(\''+esc(m.id)+'\',this)"'
        +   ' onkeydown="event.stopPropagation()">···</button>'
        + '</div>';
    }).join('');
  });
}

/* ============ 导出文件名管理 ============ */
function getDefaultFileNameBase(){ return (data.name || '简历').replace(/\s+/g,'_').replace(/[\\/:*?"<>|]/g,'_'); }
function loadFileNameBase(){ try{ fileNameBase = localStorage.getItem(FILENAME_BASE_KEY) || ''; }catch(e){ fileNameBase = ''; } }
function saveFileNameBase(){ try{ localStorage.setItem(FILENAME_BASE_KEY, fileNameBase); }catch(e){} }
function setFileNameBase(v){ fileNameBase = String(v==null?'':v).trim(); saveFileNameBase(); updateFileNameInput(); }
function updateFileNameInput(){ const el=document.getElementById('filenameBase'); if(!el) return; el.placeholder = getDefaultFileNameBase(); el.value = fileNameBase; }
function getFileName(suffix, ext){ const base = fileNameBase || getDefaultFileNameBase(); return base + (suffix||'') + '.' + ext; }

function saveState(){
  try{
    localStorage.setItem(SAVE_KEY, JSON.stringify(currentPayload()));
    if(bootDone) showAutosave();
  }catch(e){
    const el=document.getElementById('autosave');
    if(el) el.textContent = '⚠ 自动保存不可用（浏览器禁用了本地存储）';
  }
  // 实时写回仓库 data/resume.json（需经本地写服务 npm start 打开）；file:// 或只读服务器会静默失败、回退 localStorage
  pushRepoDebounced();
  // 多简历：同步写入当前激活简历文档
  if(_libraryReady && activeResumeId && typeof global.ResumeLibrary === 'object' && global.ResumeLibrary){
    try{ global.ResumeLibrary.save(activeResumeId, currentPayload()); clearDirty(activeResumeId); }catch(e){}
  }
}
/* 实时写回：经 ResumeStore 数据门面持久化（LocalStore/BrowserStore），不再直接 fetch 本地写服务 */
let _repoPushTimer = null;
function pushRepo(){
  ResumeStore.save(currentPayload());   // fire-and-forget；store 内部吞掉持久化错误，绝不让异常冒泡
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
    lastSavedAt = Number(obj && obj.savedAt) || 0;
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
  lastSavedAt = Number(obj && obj.savedAt) || 0;
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
/* 与 applyDataPayload 相同，但**不触发 saveState**（用于多简历切换时载入目标份，
   避免「切换即写回」污染刚载入的文档 / 造成误 dirty） */
function applyPayloadWithoutSave(obj){
  if(!obj || !obj.data) return;
  data = obj.data;
  if(obj.fonts && typeof obj.fonts==='object') currentFonts = obj.fonts;
  if(obj.spacing && typeof obj.spacing==='object') currentSpacing = obj.spacing;
  lastSavedAt = Number(obj && obj.savedAt) || 0;
  data.pageMargins = data.pageMargins || JSON.parse(JSON.stringify(defaultPageMargins));
  migrateQuoteColors(data);
  migrateSpacing(data);
  if(!data.sections) data.sections = [];
  data.sections.forEach(sec=>{ if(typeof sec.pageBreak !== 'boolean') sec.pageBreak = false; });
  renderSettings(); renderMarginSettings(); renderSpacingSettings(); renderEditor(); renderPreview(); applyPanelState();
  updateFileNameInput();
  try{ document.title = (data.name||'简历') + ' · 简历编辑器'; }catch(_){}
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

/* ============ 右侧编辑面板 收起/展开（收起后简历预览占满居中） ============ */
/* 启动时恢复上次的面板状态（不回写存储） */
try{ setPaneCollapsed(localStorage.getItem(PANE_COLLAPSED_KEY) === '1', false); }catch(e){}
try{ setSidePanelOpen('toolsPanel', localStorage.getItem(SIDE_PANEL_KEY) === 'toolsPanel', false); }catch(e){}
/* 简历抽屉：桌面默认常驻展开；手机（≤640px）抽屉是全屏滑出层，启动时一律收起，
   避免把桌面遗留的 open class 带进手机首屏盖住预览（点「我的简历」再滑出） */
try{
  if(global.matchMedia && global.matchMedia('(max-width:640px)').matches){
    const md = document.getElementById('resumeDrawer');
    if(md) md.classList.remove('open');
  }
}catch(e){}

/* ============ RB 桥接：供拆出的 render/export/feishu 模块回调 app.js 内部函数与状态 ============ */
global.RB = global.RB || {};
RB.currentPayload = currentPayload;
RB.recordHistory = recordHistory;
RB.applyDataPayload = applyDataPayload;
RB.applyPayloadWithoutSave = applyPayloadWithoutSave;
RB.renderResumeTabs = renderResumeTabs;
RB.renderResumeDrawer = renderResumeDrawer;
RB.getSaveVersion = function(){ return SAVE_VERSION; };
RB.getLibraryReady = function(){ return _libraryReady; };
RB.setActiveResumeId = function(v){ activeResumeId = v; };
RB.setOpenTabs = function(v){ openTabs = v; };
RB.computePageBreaks = computePageBreaks;
RB.beginPaperGuard = beginPaperGuard;
RB.endPaperGuard = endPaperGuard;
RB.getFileName = getFileName;
RB.saveState = saveState;
RB.drawPageGuides = drawPageGuides;

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
/* M1/M2 多简历：初始化简历仓库。
   ⚠️ 已移到下方数据链末尾（loadRepoData/template 之后）串行执行——
   若与数据加载并发，IndexedDB 旧文档会覆盖基底数据并写回磁盘（污染事故根因）。 */
// 初始化数据源优先级：
//   1) 仓库 data/resume.json（用户私有实时数据，最高优先）
//   2) 否则 template.json（公开示范数据）
//   3) 都没有（如 file:// / 单文件版）→ 回退 js/data.js 内置默认数据
// 需经本地写服务（npm start）打开才能读到；file:// 或只读服务器读取失败时静默回退
loadRepoData({silent:true}).catch(()=>false).then(applied=>{
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
  }).catch(()=>{});
}).then(()=>{
  // 基底数据已定（磁盘 > template > 内置），此时多简历初始化才能正确仲裁新旧
  return initResumeLibrary();
}).then(()=>{
  // 绑定飞书后开机即自动双向同步（未绑定时 tick 内部自检绑定态、静默空转）
  try{ startAutoSync(); }catch(e){}
}).catch(()=>{});

/* 排版预设：一键缩放字号 / 间距。compact 收紧、relaxed 放宽、normal 重置为默认。
   供 TemplatesView（#/templates）点击卡片调用。 */
async function applyLayoutPreset(mode){
  if(mode === 'normal'){
    resetFonts();
    resetSpacing();
  } else {
    var fontScale = (mode === 'relaxed') ? 1.08 : 0.92;   // 其余档按 compact 收紧
    var spacingScale = (mode === 'relaxed') ? 1.2 : 0.8;
    recordHistory('action');
    Object.keys(currentFonts).forEach(function(k){
      var s = currentFonts[k];
      if(!s || typeof s.val !== 'number') return;
      var v = s.val * fontScale;
      v = Math.round(v * 10) / 10;
      if(typeof s.min === 'number') v = Math.max(s.min, v);
      if(typeof s.max === 'number') v = Math.min(s.max, v);
      s.val = v;
    });
    Object.keys(currentSpacing).forEach(function(k){
      var s = currentSpacing[k];
      if(!s) return;
      s.mt = Math.round((s.mt || 0) * spacingScale);
      s.mb = Math.round((s.mb || 0) * spacingScale);
    });
    renderSettings();
    renderSpacingSettings();
    renderPreview();
  }
  saveState();
  if(global.ResumeRouter) ResumeRouter.navigate('/editor');
}

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
  pullFromFeishu: pullFromFeishu,
  restoreFromFeishu: restoreFromFeishu,
  toggleMenu: toggleMenu,
  openFeishuConfig: openFeishuConfig,
  closeFeishuConfig: closeFeishuConfig,
  saveFeishuConfig: saveFeishuConfig,
  probeFeishuConfig: probeFeishuConfig,
  startFeishuOauth: startFeishuOauth,
  refreshFeishuOauth: refreshFeishuOauth,
  revokeFeishuOauth: revokeFeishuOauth,
  checkFeishuOauthStatus: checkFeishuOauthStatus,
  startFeishuRegister: startFeishuRegister,
  cancelFeishuRegister: cancelFeishuRegister,
  importResumeFile: importResumeFile,
  importResumePayload: importResumePayload,
  pickResumeSource: pickResumeSource,
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
  applyLayoutPreset: applyLayoutPreset,
  resetMargins: resetMargins,
  closePdfModal: closePdfModal,
  downloadPDFNow: downloadPDFNow,
  // —— 多简历（M1/M2）——
  toggleResumeDrawer: toggleResumeDrawer,
  openResume: openResume,
  switchResume: switchResume,
  /* P0 路由层用：取当前激活简历 id（闭包变量，只读） */
  getActiveResumeId: function () { return activeResumeId; },
  resumeNew: resumeNew,
  resumeDuplicate: resumeDuplicate,
  resumeRemove: resumeRemove,
  resumeRename: resumeRename,
  resumeSetTags: resumeSetTags,
  resumeCloseTab: resumeCloseTab,
  renderResumeDrawer: renderResumeDrawer,
  toggleResumeItemMenu: toggleResumeItemMenu,
  closeResumeItemMenu: closeResumeItemMenu,
  // —— 供平行模块（js/audit.js 体检、js/export-extra.js 导出）只读取当前数据 ——
  // 只读用途：体检 / 导出；外部需要改数据请走 applyImported，勿直接改返回的 data
  getData: function(){ return { data: data, fonts: currentFonts, spacing: currentSpacing }; },
  getActiveResumeId: function(){ return activeResumeId || 'default'; },
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
