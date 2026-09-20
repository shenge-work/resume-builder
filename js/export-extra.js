/* =============================================================
 * 简历编辑器 - 投递链路导出扩展（DOCX / 纯文本 / Markdown）
 * -------------------------------------------------------------
 * 纯前端、零依赖、classic script（与本项目其余脚本一致，无打包器）。
 * 只暴露 window.ResumeExport 一个全局，读写当前数据一律经
 * window.ResumeEditor.getData()（只读）与 getFileName()。
 *
 * 为什么自己写 DOCX：HR / 猎头 / ATS 常要 Word 版；而「HTML 改名 .doc」
 * 是假 Word 文件，部分解析器读不了。这里手写最小 Office Open XML
 * （zip store 模式 + WordprocessingML），Word / WPS / Pages / Google Docs 均可打开。
 * 浏览器里触发下载；Node（测试）里不下载，只返回字节 / 文本。
 * ============================================================= */
(function (global) {
  'use strict';

  /* ---------- 取文本：兼容「纯字符串」与「{text} 对象」两种历史形态 ---------- */
  function T(x) {
    if (x && typeof x === 'object' && 'text' in x) return x.text == null ? '' : String(x.text);
    return x == null ? '' : String(x);
  }
  function trim(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  /* ---------- XML 转义（& < > " ' 都要处理，否则 Word 打不开） ---------- */
  function xmlEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      // XML 1.0 不允许的控制字符（简历里偶尔会粘进来），直接剔除
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  /* ---------- **加粗** 标记：拆成 runs；去掉标记后是纯文本 ---------- */
  function parseRuns(s) {
    const t = String(s == null ? '' : s);
    const out = [];
    const re = /\*\*([^*]+)\*\*/g;
    let last = 0, m;
    while ((m = re.exec(t)) !== null) {
      if (m.index > last) out.push({ text: t.slice(last, m.index), bold: false });
      out.push({ text: m[1], bold: true });
      last = m.index + m[0].length;
    }
    if (last < t.length) out.push({ text: t.slice(last), bold: false });
    return out.length ? out : [{ text: '', bold: false }];
  }
  function stripBold(s) { return String(s == null ? '' : s).replace(/\*\*([^*]+)\*\*/g, '$1'); }

  /* =============================================================
   * 数据 → 线性区块模型（三种导出共用，保证内容一致）
   * block = { kind:'h1'|'h2'|'h3'|'p'|'li', text }
   * text 里可能含 **加粗** 标记，由各导出器自行处置
   * ============================================================= */
  function buildBlocks(data) {
    const B = [];
    const h = (k, t) => { const v = trim(stripBold(t)); if (v) B.push({ kind: k, text: v }); };
    const li = t => { const v = trim(t); if (v) B.push({ kind: 'li', text: v }); };
    const p = t => { const v = trim(t); if (v) B.push({ kind: 'p', text: v }); };
    if (!data) return B;

    h('h1', data.name);
    h('p', data.subtitle);
    h('p', data.meta);
    const contact = (data.contact || []).map(c => trim(stripBold(T(c)))).filter(Boolean);
    if (contact.length) p(contact.join(' | '));

    (data.sections || []).forEach(sec => {
      if (!sec) return;
      const st = trim(sec.title);
      const type = sec.type;
      if (type === 'advantages') {
        if (!st) return;
        h('h2', st);
        (sec.items || []).forEach(it => {
          if (!it) return;
          const label = trim(it.label);
          const text = trim(T(it.text));
          if (!label && !text) return;
          li(label ? label + '：' + text : text);
        });
      } else if (type === 'career') {
        if (!st) return;
        h('h2', st);
        (sec.items || []).forEach(job => {
          if (!job) return;
          const company = trim(T(job.company));
          const role = trim(T(job.role));
          const date = trim(T(job.date));
          if (!company && !role && !date && !trim(T(job.summary))) return;
          h('h3', company);
          const sub = [role, date].filter(Boolean).join(' | ');
          if (sub) p(sub);
          p(T(job.summary));
          (job.projects || []).forEach(pr => {
            if (!pr) return;
            const pn = trim(T(pr.name));
            const stack = trim(T(pr.stack));
            const desc = trim(T(pr.desc));
            if (!pn && !stack && !desc && !(pr.results || []).length) return;
            if (pn) li('**' + pn + '**' + (stack ? '（' + stack + '）' : ''));
            else if (stack) li('**' + stack + '**');
            if (desc) p(desc);
            (pr.results || []).forEach(r => li(T(r)));
          });
        });
      } else if (type === 'skills') {
        if (!st) return;
        h('h2', st);
        (sec.groups || []).forEach(g => {
          if (!g) return;
          const name = trim(T(g.name));
          const kw = trim(T(g.keywords));
          const dt = trim(T(g.detail));
          /* 矩阵式技能行（2026-09-20 新增）：关键词行 + 补充说明行。
             **加粗** 原样保留——DOCX 走 parseRuns 变粗体，Markdown 直接渲染，
             HR / ATS 抓取时专业名词全在。 */
          if (kw || dt) {
            if (kw) li(name ? '**' + name + '**：' + kw : kw);
            if (dt) p(dt);
            return;
          }
          // 技能点多为整句，各自结尾常带句号；连接前去掉尾部标点，避免出现「。。、」这类粘连
          const items = (g.items || []).map(x => trim(stripBold(T(x))).replace(/[。．.；;，,、\s]+$/, '')).filter(Boolean);
          if (!name && !items.length) return;
          // 短词用「、」，整句用「；」，读起来更像人写的
          const avg = items.length ? items.reduce((n, s) => n + s.length, 0) / items.length : 0;
          const joined = items.join(avg > 10 ? '；' : '、');
          li(name ? '**' + name + '**：' + joined : joined);
        });
      } else if (type === 'projects') {
        if (!st) return;
        h('h2', st);
        (sec.items || []).forEach(pr => {
          if (!pr) return;
          const pn = trim(T(pr.name));
          const stack = trim(T(pr.stack));
          const desc = trim(T(pr.desc));
          if (!pn && !stack && !desc && !(pr.results || []).length) return;
          h('h3', pn);
          if (stack) p(stack);
          p(desc);
          (pr.results || []).forEach(r => li(T(r)));
        });
      } else if (type === 'highlights') {
        if (!st) return;
        h('h2', st);
        (sec.cards || []).forEach(c => li(T(c)));
        const tags = (sec.tags || []).map(x => trim(stripBold(T(x)))).filter(Boolean);
        if (tags.length) p(tags.join(' · '));
      } else if (type === 'growth') {
        if (!st) return;
        h('h2', st);
        (sec.phases || []).forEach(ph => {
          if (!ph) return;
          const label = trim(ph.label), date = trim(T(ph.date)), title = trim(T(ph.title)), desc = trim(T(ph.desc));
          if (!label && !date && !title && !desc) return;
          h('h3', [label, title].filter(Boolean).join(' · '));
          if (date) p(date);
          p(desc);
        });
      } else {
        // 未知板块类型：尽力输出标题与可枚举的文本，别丢内容
        if (!st) return;
        h('h2', st);
        (sec.items || []).forEach(it => li(T(it)));
      }
    });
    return B;
  }

  /* =============================================================
   * 纯文本 / Markdown
   * ============================================================= */
  function buildPlain(payload, kind) {
    const data = (payload && payload.data) || payload || {};
    const blocks = buildBlocks(data);
    const md = kind === 'md';
    const lines = [];
    blocks.forEach(b => {
      if (b.kind === 'h1') lines.push(md ? '# ' + b.text : b.text);
      else if (b.kind === 'h2') {
        lines.push('');
        // 纯文本里用「【】」把板块标题框出来（纯英文标题则转大写），便于 ATS 与人眼切分段落
        const isAscii = /^[\x20-\x7E]+$/.test(b.text);
        lines.push(md ? '## ' + b.text : (isAscii ? b.text.toUpperCase() : '【' + b.text + '】'));
      }
      else if (b.kind === 'h3') { lines.push(''); lines.push(md ? '### ' + b.text : b.text); }
      else if (b.kind === 'li') lines.push(md ? '- ' + b.text : '- ' + stripBold(b.text));
      else lines.push(md ? b.text : stripBold(b.text));
    });
    // 压缩连续空行，避免 ATS 读到一堆空段落
    const out = [];
    lines.forEach(l => { if (l !== '' || (out.length && out[out.length - 1] !== '')) out.push(l); });
    const text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    return { text: text, filename: fileNameFor('', md ? 'md' : 'txt') };
  }

  /* =============================================================
   * ZIP（store 模式，不压缩）—— 只够用来装 docx 的固定几个条目
   * ============================================================= */
  const CRC_TABLE = (function () {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0 ^ (-1);
    for (let i = 0; i < bytes.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ bytes[i]) & 0xFF];
    return (c ^ (-1)) >>> 0;
  }
  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    // 兜底（极老环境）：按 UTF-8 手写编码
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }
  function zipStore(entries) {
    const chunks = [];
    const central = [];
    let offset = 0;
    const u16 = v => [v & 0xFF, (v >>> 8) & 0xFF];
    const u32 = v => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
    entries.forEach(e => {
      const nameBytes = utf8(e.name);
      const data = e.data;
      const crc = crc32(data);
      const local = [].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0),   // 0x0800 = UTF-8 文件名标志
        u16(0), u16(0),                                   // 时间 / 日期（固定 0 也合法）
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0)
      );
      chunks.push(new Uint8Array(local), nameBytes, data);
      central.push([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
        u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)
      ), nameBytes);
      offset += local.length + nameBytes.length + data.length;
    });
    const cdStart = offset;
    let cdSize = 0;
    central.forEach(c => { cdSize += (c.length !== undefined ? c.length : 0); });
    const end = [].concat(
      u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
      u32(cdSize), u32(cdStart), u16(0)
    );
    let total = 0;
    chunks.forEach(c => { total += c.length; });
    total += cdSize + end.length;
    const out = new Uint8Array(total);
    let pos = 0;
    chunks.forEach(c => { out.set(c, pos); pos += c.length; });
    central.forEach(c => { out.set(c, pos); pos += c.length; });
    out.set(new Uint8Array(end), pos);
    return out;
  }

  /* =============================================================
   * WordprocessingML
   * ============================================================= */
  function runsXml(text) {
    return parseRuns(text).map(r => {
      if (!r.text) return '';
      const pr = r.bold ? '<w:rPr><w:b/><w:bCs/></w:rPr>' : '';
      return '<w:r>' + pr + '<w:t xml:space="preserve">' + xmlEsc(r.text) + '</w:t></w:r>';
    }).join('');
  }
  function paraXml(block) {
    const kind = block.kind;
    let style = '', ind = '', extra = '';
    if (kind === 'h1') { style = 'Heading1'; }
    else if (kind === 'h2') { style = 'Heading2'; extra = '<w:spacing w:before="180" w:after="60"/>'; }
    else if (kind === 'h3') { style = 'Heading3'; extra = '<w:spacing w:before="120" w:after="40"/>'; }
    else if (kind === 'li') { style = 'ListParagraph'; ind = '<w:ind w:left="360" w:hanging="180"/>'; }
    else { style = 'Normal'; }
    const pPr = '<w:pPr><w:pStyle w:val="' + style + '"/>' + ind + extra + '</w:pPr>';
    const body = kind === 'li' ? '<w:r><w:t xml:space="preserve">• </w:t></w:r>' + runsXml(block.text) : runsXml(block.text);
    return '<w:p>' + pPr + body + '</w:p>';
  }
  const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:docDefaults><w:rPrDefault><w:rPr>'
    + '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="\u5FAE\u8F6F\u96C5\u9ED1" w:cs="Calibri"/>'
    + '<w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>'
    + '<w:pPr><w:spacing w:before="0" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr>'
    + '<w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>'
    + '<w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr>'
    + '<w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>'
    + '<w:pPr><w:keepNext/><w:outlineLvl w:val="2"/></w:pPr>'
    + '<w:rPr><w:b/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>'
    + '</w:styles>';

  function buildDocx(payload) {
    const data = (payload && payload.data) || payload || {};
    const blocks = buildBlocks(data);
    const paras = blocks.map(paraXml).join('');
    const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
      + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="851" w:footer="992" w:gutter="0"/>'
      + '</w:sectPr>';
    const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:body>' + paras + sect + '</w:body></w:document>';
    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
      + '</Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '</Relationships>';
    const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>';
    const bytes = zipStore([
      { name: '[Content_Types].xml', data: utf8(contentTypes) },
      { name: '_rels/.rels', data: utf8(rels) },
      { name: 'word/document.xml', data: utf8(docXml) },
      { name: 'word/_rels/document.xml.rels', data: utf8(docRels) },
      { name: 'word/styles.xml', data: utf8(STYLES_XML) }
    ]);
    return { bytes: bytes, filename: fileNameFor('', 'docx') };
  }

  /* =============================================================
   * 取数据 / 文件名 / 触发下载
   * ============================================================= */
  function currentPayload() {
    const re = global.ResumeEditor;
    if (re && typeof re.getData === 'function') { try { return re.getData(); } catch (e) { } }
    return null;
  }
  function fileNameFor(suffix, ext) {
    const re = global.ResumeEditor;
    if (re && typeof re.getFileName === 'function') { try { return re.getFileName(suffix || '', ext); } catch (e) { } }
    return '简历.' + ext;
  }
  /* 统一落盘：优先复用 export-pdf.js 的 downloadBlob（原生壳走 save_file，浏览器走 <a download>）。
     返回 true 表示已接手（含异步原生路径）；拿不到 downloadBlob 时退回旧的同步 <a download>。 */
  function saveBytes(bytes, filename) {
    if (typeof Blob === 'undefined') return false;
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    if (global.ResumeExport && typeof global.ResumeExport.downloadBlob === 'function') {
      global.ResumeExport.downloadBlob(blob, filename);
      return true;
    }
    if (typeof document === 'undefined' || !document.createElement) return false;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    if (document.body && document.body.appendChild) document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch (e) { }
      if (a.remove) { try { a.remove(); } catch (e) { } }
    }, 0);
    return true;
  }
  function saveText(text, filename, mime) {
    if (typeof Blob === 'undefined') return false;
    const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    if (global.ResumeExport && typeof global.ResumeExport.downloadBlob === 'function') {
      global.ResumeExport.downloadBlob(blob, filename);
      return true;
    }
    if (typeof document === 'undefined' || !document.createElement) return false;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    if (document.body && document.body.appendChild) document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch (e) { }
      if (a.remove) { try { a.remove(); } catch (e) { } }
    }, 0);
    return true;
  }

  function exportDocx() {
    const payload = currentPayload();
    if (!payload) { notify('读取简历数据失败，无法导出'); return null; }
    const r = buildDocx(payload);
    saveBytes(r.bytes, r.filename);
    notify('已导出 Word（.docx）：' + r.filename);
    return r;
  }
  function exportTxt() {
    const payload = currentPayload();
    if (!payload) { notify('读取简历数据失败，无法导出'); return null; }
    const r = buildPlain(payload, 'txt');
    saveText(r.text, r.filename, 'text/plain');
    notify('已导出纯文本：' + r.filename);
    return r;
  }
  function exportMarkdown() {
    const payload = currentPayload();
    if (!payload) { notify('读取简历数据失败，无法导出'); return null; }
    const r = buildPlain(payload, 'md');
    saveText(r.text, r.filename, 'text/markdown');
    notify('已导出 Markdown：' + r.filename);
    return r;
  }
  /* =============================================================
   * 静默 PDF：交给本地服务（tools/serve.js 的 /api/pdf）调本机浏览器
   * headless 打印，产出「可选中文字」的矢量 PDF，全程不弹打印对话框。
   * 失败（未用 npm start 打开 / 本机无 Chrome）自动回退到 window.print()。
   * ============================================================= */
  function errorFromResponse(res) {
    return res.text().then(function (txt) {
      let msg = 'HTTP ' + res.status;
      try {
        const j = JSON.parse(txt);
        if (j && j.error) msg = j.error + (j.hint ? '（' + j.hint + '）' : '');
      } catch (e) { /* 非 JSON 响应，保留 HTTP 状态码 */ }
      throw new Error(msg);
    });
  }
  function exportPdfSilent() {
    const payload = currentPayload();
    if (!payload) { notify('读取简历数据失败，无法导出'); return null; }
    /* 两端各一个「静默 PDF」按钮（同一份入口清单），都要进入忙碌态 */
    const btns = typeof document === 'undefined' ? []
      : ['pdfSilentBtn', 'pdfSilentBtnMobile']
        .map(id => document.getElementById(id))
        .filter(Boolean);
    const idle = btns.map(b => b.textContent);
    const setBusy = function (busy) {
      btns.forEach((b, i) => {
        b.disabled = busy;
        b.textContent = busy ? 'PDF 生成中…' : idle[i];
      });
    };
    if (btns.length) setBusy(true);
    const finish = function () { setBusy(false); };
    const fallback = function (msg) {
      notify(msg + '，已回退到打印对话框');
      const N = (typeof window !== 'undefined') ? window.__RESUME_NATIVE__ : null;
      if (N && typeof N.printPage === 'function') { N.printPage(); return; }   // 原生壳：window.print() 是空操作
      try { if (global.print) global.print(); } catch (e) { }                     // 浏览器
    };
    if (typeof fetch !== 'function') { finish(); fallback('当前环境不支持静默导出'); return null; }
    const name = fileNameFor('', 'pdf');
    fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) return errorFromResponse(res);
      return res.blob();
    }).then(function (blob) {
      if (!blob || !blob.size) throw new Error('服务端返回了空文件');
      if (blob.type && blob.type.indexOf('pdf') < 0) throw new Error('服务端未返回 PDF');
      saveBytes(blob, name);
      notify('已导出 PDF（文字可选中）：' + name);
    }).catch(function (err) {
      fallback('静默导出失败：' + ((err && err.message) || err));
    }).then(finish, finish);
    return { filename: name };
  }

  /* 轻提示：复用页面右上角的自动保存提示位；拿不到就静默 */
  function notify(msg) {
    try {
      const el = document.getElementById('autosave');
      if (!el) return;
      el.textContent = '✓ ' + msg;
      setTimeout(() => { if (el.textContent === '✓ ' + msg) el.textContent = ''; }, 4000);
    } catch (e) { }
  }

  global.ResumeExport = Object.assign(global.ResumeExport || {}, {
    exportDocx: exportDocx,
    exportTxt: exportTxt,
    exportMarkdown: exportMarkdown,
    exportPdfSilent: exportPdfSilent,
    // —— 供测试 / 其它模块复用 ——
    buildDocx: buildDocx,
    buildPlain: buildPlain,
    buildBlocks: buildBlocks,
    zipStore: zipStore,
    crc32: crc32
  });
})(typeof window !== 'undefined' ? window : globalThis);
