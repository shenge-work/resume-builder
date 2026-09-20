/* =============================================================
 * 导出 PDF / 长图 / 单文件 HTML（截图导出管线）
 * -------------------------------------------------------------
 * 从 js/app.js 物理拆分。经 window.RB 桥接回 app.js；
 * 从 window.ResumeRender 取纯渲染工具函数。
 * 挂 window.ResumeExport 供 app.js 解构复用。
 * ============================================================= */
(function(global){
"use strict";
const { getPageMargins, mmToPx, esc } = global.ResumeRender;
const preview = document.getElementById('preview');

/* ============ 通用下载分流：原生壳走 save_file 落盘，浏览器走 <a download> ============
   背景：打包成 App 后，Blob + <a download> 不落盘（macOS WKWebView 不支持 blob: 下载，
   WebKit bug 216918），必须改走 Rust 的 save_file（弹系统保存对话框写盘）。
   浏览器（npm start / 单文件 HTML）保持原样，零回归。 */
async function downloadBlob(blob, filename){
  const N = (typeof window !== 'undefined') ? window.__RESUME_NATIVE__ : null;
  if(N && typeof N.saveFile === 'function'){
    try{
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const saved = await N.saveFile(filename, bytes);
      if(saved){ RB.notify && RB.notify('已保存到 ' + saved); }
      return;   // 原生路径到此结束（用户取消 saved 为 null，静默不报错）
    }catch(e){
      // 原生保存失败（如 Android content://）→ 明确提示，不静默吞掉、也不回退到无效的 <a download>
      alert('保存失败：' + (e && e.message ? e.message : e));
      return;
    }
  }
  /* 浏览器路径：原样不动 */
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ============ 导出 PDF：按实时预览的分页逐页截图，再拼成 PDF ============ */
let currentPdfBlobUrl = null;
let currentPdfBlob = null;   // 原生壳落盘需要 Blob 对象（blob: URL 在 WKWebView 下不能 download）
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
  clone.querySelectorAll('.reorder-btns').forEach(n=>n.remove());
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
    const breaks = RB.computePageBreaks();              // 真实分页位置（已含强制换页，相对内容区域顶部）
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
  RB.beginPaperGuard();
  buildImagePdf().then(({blob, pages})=>{
    if(currentPdfBlobUrl) URL.revokeObjectURL(currentPdfBlobUrl);
    currentPdfBlob = blob;                       // 原生壳落盘用
    currentPdfBlobUrl = URL.createObjectURL(blob);
    document.getElementById('pdfFrame').src = currentPdfBlobUrl;
    document.getElementById('pdfPageInfo').textContent = '共 ' + pages + ' 页';
    document.getElementById('pdfModal').style.display = 'flex';
  }).catch(err=>{
    alert('PDF 生成失败：' + (err && err.message ? err.message : err));
  }).finally(()=>{
    RB.endPaperGuard();
    if(btn){ btn.disabled = false; btn.textContent = 'PDF 预览'; }
  });
}
function downloadPDFNow(){
  if(!currentPdfBlob && !currentPdfBlobUrl){ exportPDF(); return; }
  if(currentPdfBlob){ downloadBlob(currentPdfBlob, RB.getFileName('', 'pdf')); return; }
  const a = document.createElement('a');
  a.href = currentPdfBlobUrl; a.download = RB.getFileName('', 'pdf');
  document.body.appendChild(a); a.click(); a.remove();
}
function closePdfModal(){
  document.getElementById('pdfModal').style.display = 'none';
  document.getElementById('pdfFrame').src = 'about:blank';
}

/* ============ 通用导出预览弹层（图片版 / 单文件 HTML 共用） ============ */
/* 先看预览，弹层内再点「下载」真正落盘；关闭时自动回收 blob URL。 */
let currentExportBlobUrl = null;
let currentExportBlob = null;   // 原生壳落盘需要 Blob 对象
let currentExportName = '';
function showExportModal(kind, blob, blobUrl, downloadName, title){
  const img = document.getElementById('exportModalImg');
  const frame = document.getElementById('exportModalFrame');
  document.getElementById('exportModalTitle').textContent = title;
  currentExportBlob = blob || null;
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
  currentExportBlob = null;
}
function doExportDownload(){
  if(currentExportBlob){ downloadBlob(currentExportBlob, currentExportName); return; }
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
  RB.beginPaperGuard();
  const cap = makeCaptureClone(live);
  try{
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await html2canvas(cap.clone, {
      scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff',
      width: cap.totalW, height: cap.totalH, windowWidth: cap.totalW, windowHeight: cap.totalH, x: 0, y: 0
    });
    const blob = await new Promise(res=>canvas.toBlob(res, 'image/png'));
    const url = URL.createObjectURL(blob);
    showExportModal('image', blob, url, RB.getFileName('_长图', 'png'), '图片版预览（长图）');
  }catch(err){
    alert('长图导出失败：' + (err && err.message ? err.message : err));
  }finally{
    document.body.removeChild(cap.wrapper);
    RB.endPaperGuard();
    if(btn){ btn.disabled = false; btn.textContent = '导出（图片版）'; }
  }
}

/* ============ 导出单文件 HTML：仅含简历本身，内联样式，先预览再下载 ============ */
/* 收集页面全部生效样式：
   1) 文档内所有 <style>（含运行期注入的打印页边距规则；单文件版的全部样式也在其中）
   2) 所有 <link rel="stylesheet">（多文件版的 css/style.css 等）——经 fetch 拉文本内联
   ⚠️ 不能只用 document.querySelector('style')：多文件版 index.html 的样式全在 <link> 里，
   页面上第一个 <style> 是运行期注入的打印规则，拿到它导出的 HTML 会完全没有视觉样式。 */
async function collectCssText(){
  const parts = [];
  try{
    document.querySelectorAll('style').forEach(n=>{ parts.push(n.textContent || ''); });
  }catch(e){}
  try{
    const links = Array.prototype.slice.call(document.querySelectorAll('link[rel="stylesheet"]'));
    const fetched = await Promise.all(links.map(function(l){
      const href = l.getAttribute('href') || '';
      return fetch(href, { cache: 'no-store' })
        .then(function(r){ return r.ok ? r.text() : ''; })
        .catch(function(){ return ''; });   // file:// 等取不到时跳过（页面本身也没加载出该样式）
    }));
    fetched.forEach(function(cssText){
      if(cssText) parts.push('/* ' + 'inlined stylesheet' + ' */\n' + cssText);
    });
  }catch(e){}
  return parts.filter(Boolean).join('\n');
}
async function exportSingleFileHTML(){
  const live = preview.querySelector('.resume');
  if(!live){ alert('预览未渲染，请稍候重试。'); return; }
  const clone = live.cloneNode(true);
  clone.querySelectorAll('[data-drag]').forEach(n=>n.removeAttribute('data-drag'));
  clone.querySelectorAll('[draggable]').forEach(n=>n.removeAttribute('draggable'));
  clone.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(n=>n.classList.remove('dragging','drop-before','drop-after'));
  clone.querySelectorAll('.reorder-btns').forEach(n=>n.remove());
  const css = await collectCssText();
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
  showExportModal('html', blob, url, RB.getFileName('', 'html'), '单文件 HTML 预览');
}

/* ============ 导出分享页：只读展示用，带「仅查看」斜置水印 ============ */
/* 与单文件 HTML 同源（都是 .resume 克隆 + 内联样式），差异仅在：
   1) 叠加一层半透明斜置「仅查看」水印（pointer-events:none，不挡文本选中/复制）；
   2) 文件名 / 标题语义为「分享」，区别于「留档」。 */

/* 纯函数：拼「仅查看」水印的 CSS + DOM。不依赖 document，可独立测试。
   watermarkText 会先 HTML 转义（防注入），再塞进重复水印节点。 */
function buildWatermark(watermarkText){
  const t = esc(watermarkText || '仅供查看');
  const css =
    '.resume-share-wrap{position:relative;}\n' +
    '.resume-share-wm{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:10;}\n' +
    '.resume-share-wm span{position:absolute;left:-20%;top:30%;width:140%;font-size:34px;color:rgba(120,120,120,.16);' +
      'transform:rotate(-24deg);white-space:nowrap;text-align:center;user-select:none;}\n' +
    '.resume-share-wm span:nth-child(2){top:62%;}\n' +
    '.resume-share-wm span:nth-child(3){top:94%;}\n' +
    '@media print{.resume-share-wm{display:none;}}';
  const dom = '<div class="resume-share-wm"><span>' + t + '</span><span>' + t + '</span><span>' + t + '</span></div>';
  return { css: css, dom: dom };
}

/* 纯函数：把「简历 HTML + 样式 + 姓名 + 水印」拼成完整只读分享页文档。
   返回完整 HTML 字符串；标题与水印文本均经 esc 转义。 */
function buildSharePageHtml(opts){
  const resumeHtml = opts && opts.resumeHtml ? opts.resumeHtml : '';
  const cssText = opts && opts.cssText ? opts.cssText : '';
  const name = esc((opts && opts.name) || '简历');
  const wm = buildWatermark((opts && opts.watermarkText) || '仅供查看');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>${name} · 简历（仅供查看）</title>
<style>
${cssText}
.resume{max-width:1000px;margin:0 auto;background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.10);border-radius:4px;}
${wm.css}
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
<div class="resume-share-wrap">
${resumeHtml}
${wm.dom}
</div>
</body>
</html>`;
}

async function exportSharePage(){
  const live = preview.querySelector('.resume');
  if(!live){ alert('预览未渲染，请稍候重试。'); return; }
  const clone = live.cloneNode(true);
  clone.querySelectorAll('[data-drag]').forEach(n=>n.removeAttribute('data-drag'));
  clone.querySelectorAll('[draggable]').forEach(n=>n.removeAttribute('draggable'));
  clone.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(n=>n.classList.remove('dragging','drop-before','drop-after'));
  clone.querySelectorAll('.reorder-btns').forEach(n=>n.remove());
  const css = await collectCssText();
  const html = buildSharePageHtml({ resumeHtml: clone.outerHTML, cssText: css, name: data.name, watermarkText: '仅供查看' });
  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  showExportModal('html', blob, url, RB.getFileName('_分享页', 'html'), '分享页预览（只读 · 带水印）');
}

global.ResumeExport = Object.assign(global.ResumeExport || {}, {
  exportPDF: exportPDF,
  downloadPDFNow: downloadPDFNow,
  closePdfModal: closePdfModal,
  showExportModal: showExportModal,
  closeExportModal: closeExportModal,
  doExportDownload: doExportDownload,
  exportLongImage: exportLongImage,
  exportSingleFileHTML: exportSingleFileHTML,
  exportSharePage: exportSharePage,
  buildSharePageHtml: buildSharePageHtml,
  buildWatermark: buildWatermark,
  downloadBlob: downloadBlob
});
})(typeof window !== "undefined" ? window : globalThis);
