/* 投递链路导出（js/export-extra.js）测试。
   与 test/cases-audit.js 同构：CommonJS，由运行器在 Node 侧 require 后逐条执行，
   断言走 ctx.assert，模块经 ctx.ResumeExport 访问。

   覆盖三个层次：
   1. 字节层 —— crc32 标准向量、zip store 布局、EOCD / 中央目录自洽（自己解析一遍，不靠外部命令）；
   2. 文档层 —— 解出 word/document.xml 后断言内容、转义、加粗、样式引用、A4 纸张；
   3. 契约层 —— 线性区块映射、纯文本 / Markdown 形态、只读性（不得改原数据）、无 fetch 时降级。

   为什么不只测字节长度：DOCX 是「格式对了才打得开」的产物，
   长度对、内容错（比如残留 ** 或引用了 styles.xml 里不存在的样式）在浏览器里完全看不出来。 */

'use strict';

/* ===== zip 解析小工具（只在测试侧使用，独立于被测实现，避免「自己验自己」） ===== */
const TD = new TextDecoder('utf-8');
function dec(bytes) { return TD.decode(bytes); }
function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

/* 按 EOCD → 中央目录 → 本地头 的顺序解出所有条目（store 模式，数据未压缩，直接切片） */
function unzip(bytes) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('未找到 EOCD 结束记录');
  const count = u16(bytes, eocd + 10);
  const cdOff = u32(bytes, eocd + 16);
  const out = {};
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (u32(bytes, p) !== 0x02014b50) throw new Error('中央目录签名异常 @' + p);
    const method = u16(bytes, p + 10);
    const crc = u32(bytes, p + 16);
    const size = u32(bytes, p + 24);
    const nLen = u16(bytes, p + 28);
    const eLen = u16(bytes, p + 30);
    const cLen = u16(bytes, p + 32);
    const name = dec(bytes.subarray(p + 46, p + 46 + nLen));
    const lho = u32(bytes, p + 42);
    if (u32(bytes, lho) !== 0x04034b50) throw new Error('本地文件头签名异常: ' + name);
    const lCrc = u32(bytes, lho + 14);
    const lSize = u32(bytes, lho + 18);
    const lnLen = u16(bytes, lho + 26);
    const leLen = u16(bytes, lho + 28);
    const start = lho + 30 + lnLen + leLen;
    out[name] = {
      method: method, size: size, crc: crc, flags: u16(bytes, p + 8),
      localCrc: lCrc, localSize: lSize,
      // 本地头独立于中央目录：流式解压器只读本地头，两处不一致就会解析失败
      localMethod: u16(bytes, lho + 8), localFlags: u16(bytes, lho + 6),
      data: bytes.subarray(start, start + size),
      text: dec(bytes.subarray(start, start + size)),
    };
    p += 46 + nLen + eLen + cLen;
  }
  return { entries: out, count: count, cdOff: cdOff, eocdOffset: eocd };
}

/* ===== 假数据：一份结构最全的简历（六种板块类型都覆盖） ===== */
function fullData() {
  return {
    name: '陈测试',
    subtitle: 'Agent 应用工程师 · 5 年经验',
    meta: '本科 · 深圳',
    contact: ['13800138000', 'test@example.com'],
    pageMargins: { top: 14, right: 14, bottom: 14, left: 14 },
    sections: [
      { id: 's1', type: 'advantages', title: '个人优势', items: [
        { label: '工程能力', text: '主导 LLM 应用落地，把首字延迟从 2.4s 压到 620ms，**关键路径**全部改为流式。' },
        { label: '协作', text: '带 3 人小组交付 5 个大版本。' }
      ]},
      { id: 's2', type: 'career', title: '职业履历', items: [
        { company: '示例科技', role: '高级工程师', date: '2021.03 - 至今', summary: '负责对话中台的检索与编排。',
          projects: [
            { name: '知识问答', stack: 'Python / LangGraph',
              desc: '重构检索链路，召回率从 71% 提升到 89%。',
              results: ['首字延迟下降 74%', '召回率提升 18 个百分点'] }
          ]}
      ]},
      { id: 's3', type: 'skills', title: 'Core Skills', groups: [
        { name: '语言', items: ['Python', 'TypeScript', 'Go'] },
        /* 两条整句是刻意的：只有一条时 join 的分隔符不可观测，
           「整句用『；』」这条规则就永远测不出来（变异测试发现的测试盲区）。 */
        { name: '方向', items: [
          '主导 RAG 检索链路的召回优化与评测体系建设，覆盖 12 个业务场景',
          '推动 Agent 工具调用协议统一，接入 9 个内部系统并沉淀 4 篇规范'
        ] }
      ]},
      { id: 's4', type: 'projects', title: '重点项目', items: [
        { name: 'Agent 编排平台', stack: 'Node / Redis', desc: '支撑日均 40 万次工具调用。', results: ['可用性 99.95%'] }
      ]},
      { id: 's5', type: 'highlights', title: '亮点', cards: ['开源项目 1.2k star'], tags: ['RAG', 'Agent', '评测'] },
      { id: 's6', type: 'growth', title: '成长路径', phases: [
        { label: '起步', date: '2019', title: '后端工程师', desc: '打基础。' }
      ]},
      { id: 's7', type: 'custom-unknown', title: '其它', items: ['兜底内容不应丢失'] }
    ]
  };
}
function payload() { return { data: fullData(), fonts: {}, spacing: {} }; }

module.exports = [

  /* ================= A. 接口契约 ================= */
  { name: '接口', fn: function (ctx) {
    const X = ctx.ResumeExport;
    ctx.assert(!!X, 'window.ResumeExport 已暴露');
    const apis = ['exportDocx', 'exportTxt', 'exportMarkdown', 'exportPdfSilent',
      'buildDocx', 'buildPlain', 'buildBlocks', 'zipStore', 'crc32'];
    const bad = apis.filter(function (k) { return typeof X[k] !== 'function'; });
    ctx.assert(bad.length === 0, '九个公开 API 均为函数' + (bad.length ? '（缺: ' + bad.join(',') + '）' : ''));
  }},
  { name: '封装', fn: function (ctx) {
    const g = ctx.global || {};
    ctx.assert(typeof g.buildBlocks === 'undefined' && typeof g.zipStore === 'undefined',
      '内部函数未泄漏到全局（只暴露 ResumeExport）');
  }},

  /* ================= B. 字节层：crc32 / zip ================= */
  { name: 'crc32', fn: function (ctx) {
    const X = ctx.ResumeExport;
    const enc = new TextEncoder();
    ctx.assert(X.crc32(enc.encode('123456789')) === 0xCBF43926, 'crc32("123456789") 命中标准向量 0xCBF43926');
    ctx.assert(X.crc32(new Uint8Array(0)) === 0, 'crc32(空) === 0');
  }},
  { name: 'zipStore', fn: function (ctx) {
    const X = ctx.ResumeExport;
    const empty = X.zipStore([]);
    ctx.assert(empty.length === 22, 'zipStore([]) 仅含 22 字节 EOCD');
    ctx.assert(u32(empty, 0) === 0x06054b50, 'zipStore([]) 以 EOCD 签名 PK\\x05\\x06 开头');

    const zip = X.zipStore([
      { name: 'a.txt', data: new TextEncoder().encode('hello') },
      { name: 'dir/b.txt', data: new TextEncoder().encode('中文内容') },
      { name: '中文目录/简历.txt', data: new TextEncoder().encode('带中文名的条目') }
    ]);
    ctx.assert(u32(zip, 0) === 0x04034b50, 'zipStore 以本地文件头签名 PK\\x03\\x04 开头');
    const z = unzip(zip);
    ctx.assert(z.count === 3, 'EOCD 记录的条目数为 3');
    ctx.assert(!!z.entries['a.txt'] && !!z.entries['dir/b.txt'], '两个条目名均可从中央目录还原');
    ctx.assert(!!z.entries['中文目录/简历.txt'] && z.entries['中文目录/简历.txt'].text === '带中文名的条目',
      '中文条目名与内容均 round-trip 一致（UTF-8 标志位真正生效）');
    ctx.assert(z.entries['a.txt'].text === 'hello', 'ASCII 数据 round-trip 一致');
    ctx.assert(z.entries['dir/b.txt'].text === '中文内容', 'UTF-8 中文数据 round-trip 一致（0x0800 标志位生效）');
    ctx.assert(z.entries['dir/b.txt'].method === 0, '条目为 store 模式（method=0，不压缩）');
    const e = z.entries['dir/b.txt'];
    ctx.assert(e.localCrc === e.crc && e.localSize === e.size, '本地头与中央目录的 CRC / 长度一致');
    /* 本地头是独立副本：流式解压器（含多数 JS 库）只读本地头。
       两处不一致时，中央目录看起来没问题，但解压时二进制被当成未压缩数据 → 文件损坏。 */
    const badLocal = Object.keys(z.entries).filter(function (n) { return z.entries[n].localMethod !== 0; });
    ctx.assert(badLocal.length === 0, '本地头压缩标记同为 0' + (badLocal.length ? '（异常: ' + badLocal.join(',') + '）' : ''));
    const badFlag = Object.keys(z.entries).filter(function (n) {
      return z.entries[n].flags !== 0x0800 || z.entries[n].localFlags !== 0x0800;
    });
    ctx.assert(badFlag.length === 0, '两处均置 UTF-8 文件名标志 0x0800（否则中文条目名按 CP437 误读）');
  }},

  /* ================= C. 文档层：DOCX 结构与样式 ================= */
  { name: 'docx 结构', fn: function (ctx) {
    const r = ctx.ResumeExport.buildDocx(payload());
    ctx.assert(r && r.bytes && r.bytes.length > 0, 'buildDocx 返回非空字节');
    ctx.assert(/\.docx$/.test(r.filename), '文件名为 .docx 后缀（实际: ' + r.filename + '）');
    ctx.assert(u32(r.bytes, 0) === 0x04034b50, 'DOCX 字节以 PK\\x03\\x04 开头');

    const z = unzip(r.bytes);
    const need = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml',
      'word/_rels/document.xml.rels', 'word/styles.xml'];
    const miss = need.filter(function (n) { return !z.entries[n]; });
    ctx.assert(miss.length === 0, 'OOXML 五个必需部件齐全' + (miss.length ? '（缺: ' + miss.join(',') + '）' : ''));
    const notStore = need.filter(function (n) { return z.entries[n] && z.entries[n].method !== 0; });
    ctx.assert(notStore.length === 0, '全部部件为 store 模式（无需解压器即可读）');
  }},
  { name: 'docx 内容', fn: function (ctx) {
    const z = unzip(ctx.ResumeExport.buildDocx(payload()).bytes);
    const doc = z.entries['word/document.xml'].text;
    ctx.assert(doc.indexOf('<?xml') === 0, 'document.xml 以 XML 声明开头');
    ctx.assert(/<w:document[\s\S]*<\/w:document>$/.test(doc), 'w:document 根节点正确闭合');
    ctx.assert(doc.indexOf('陈测试') >= 0, 'document.xml 含姓名');
    ctx.assert(doc.indexOf('个人优势') >= 0, '含中文板块标题「个人优势」');
    ctx.assert(doc.indexOf('CORE SKILLS') < 0 && doc.indexOf('Core Skills') >= 0,
      'DOCX 保留原始板块标题大小写（大写化只属于纯文本形态）');
    ctx.assert(doc.indexOf('<w:pgSz w:w="11906" w:h="16838"/>') >= 0, '纸张为 A4（11906×16838 twips）');
    ctx.assert(/<w:pgMar[^>]*w:top="1134"/.test(doc), '页边距写入 sectPr');
  }},
  { name: 'docx 样式引用', fn: function (ctx) {
    /* 强断言：document.xml 里引用的每个 pStyle 都必须在 styles.xml 里有定义。
       否则 Word 会静默降级成无格式正文 —— 打开后「看起来不对」但没有任何报错。 */
    const z = unzip(ctx.ResumeExport.buildDocx(payload()).bytes);
    const doc = z.entries['word/document.xml'].text;
    const styles = z.entries['word/styles.xml'].text;
    const used = [];
    const re = /<w:pStyle w:val="([^"]+)"\/>/g;
    let m;
    while ((m = re.exec(doc)) !== null) { if (used.indexOf(m[1]) < 0) used.push(m[1]); }
    ctx.assert(used.length >= 4, '正文用到多种段落样式（实际 ' + used.length + ' 种）');
    const undef = used.filter(function (s) { return styles.indexOf('w:styleId="' + s + '"') < 0; });
    ctx.assert(undef.length === 0, '所有被引用的样式都在 styles.xml 中有定义' + (undef.length ? '（未定义: ' + undef.join(',') + '）' : ''));
    ctx.assert(styles.indexOf('heading 1') >= 0 && styles.indexOf('List Paragraph') >= 0, 'styles.xml 含 Heading / List Paragraph 定义');
  }},
  { name: 'docx 加粗与清洁', fn: function (ctx) {
    const z = unzip(ctx.ResumeExport.buildDocx(payload()).bytes);
    const doc = z.entries['word/document.xml'].text;
    ctx.assert(doc.indexOf('**') < 0, 'document.xml 中无残留 ** 标记');
    ctx.assert(doc.indexOf('<w:b/>') >= 0 && doc.indexOf('<w:bCs/>') >= 0, '加粗转为 <w:b/> + <w:bCs/>（中英文都加粗）');
    ctx.assert(doc.indexOf('知识问答') >= 0 && /<w:bCs\/><\/w:rPr><w:t[^>]*>知识问答</.test(doc), '项目名以加粗 run 输出');
    ctx.assert(doc.indexOf('<w:tbl>') < 0 && doc.indexOf('<w:drawing>') < 0,
      '不含表格 / 图片（ATS 友好，与体检的 ats-table / ats-image 口径一致）');
    ctx.assert(doc.indexOf('• ') >= 0, '列表项带项目符号');
  }},
  { name: 'docx 转义', fn: function (ctx) {
    const d = fullData();
    d.name = 'A&B<C>"D\'E';
    d.subtitle = '含控制字符\u0001与\u000B竖线';
    const doc = unzip(ctx.ResumeExport.buildDocx({ data: d }).bytes).entries['word/document.xml'].text;
    ctx.assert(doc.indexOf('A&amp;B&lt;C&gt;&quot;D&apos;E') >= 0, 'XML 五类特殊字符（& < > 双引号 单引号）全部转义');
    ctx.assert(doc.indexOf('\u0001') < 0 && doc.indexOf('\u000B') < 0, '非法控制字符被剔除（否则 Word 判定文档损坏）');
  }},

  /* ================= D. 线性区块映射 ================= */
  { name: 'buildBlocks', fn: function (ctx) {
    const b = ctx.ResumeExport.buildBlocks(fullData());
    const kinds = b.map(function (x) { return x.kind; }).join(',');
    ctx.assert(b[0].kind === 'h1' && b[0].text === '陈测试', '首块为 h1 姓名');
    ctx.assert(b.some(function (x) { return x.text === '个人优势' && x.kind === 'h2'; }), 'advantages → h2 板块标题');
    ctx.assert(b.some(function (x) { return x.kind === 'li' && x.text === '工程能力：主导 LLM 应用落地，把首字延迟从 2.4s 压到 620ms，**关键路径**全部改为流式。'; }),
      'advantages 条目合成「标签：正文」并保留加粗标记');
    ctx.assert(b.some(function (x) { return x.kind === 'h3' && x.text === '示例科技'; }), 'career → h3 公司名');
    ctx.assert(b.some(function (x) { return x.kind === 'p' && x.text === '高级工程师 | 2021.03 - 至今'; }), 'career → p「职位 | 时间」');
    ctx.assert(b.some(function (x) { return x.kind === 'li' && x.text === '**知识问答**（Python / LangGraph）'; }),
      'career 项目名加粗并附技术栈');
    ctx.assert(b.some(function (x) { return x.kind === 'li' && x.text === '首字延迟下降 74%'; }), 'career 项目成果逐条成 li');
    ctx.assert(b.some(function (x) { return x.kind === 'li' && x.text === '**语言**：Python、TypeScript、Go'; }),
      'skills 短词用「、」连接');
    ctx.assert(b.some(function (x) {
      return x.kind === 'li' && x.text.indexOf('**方向**：主导 RAG') === 0
        && x.text.indexOf('；') > 0 && x.text.indexOf('、') < 0;
    }), 'skills 整句（平均 > 10 字）用「；」连接，且不混入「、」');
    ctx.assert(b.some(function (x) { return x.kind === 'p' && x.text === 'RAG · Agent · 评测'; }), 'highlights 标签以 · 连接');
    ctx.assert(b.some(function (x) { return x.kind === 'h3' && x.text === '起步 · 后端工程师'; }), 'growth → h3「阶段 · 标题」');
    ctx.assert(b.some(function (x) { return x.kind === 'li' && x.text === '兜底内容不应丢失'; }),
      '未知板块类型兜底输出条目（不丢内容）');
    ctx.assert(kinds.indexOf('h1') === 0, '块序列以 h1 起始');
  }},
  { name: 'buildBlocks 边界', fn: function (ctx) {
    const X = ctx.ResumeExport;
    ctx.assert(Array.isArray(X.buildBlocks(null)) && X.buildBlocks(null).length === 0, 'buildBlocks(null) 返回空数组');
    ctx.assert(X.buildBlocks({ sections: [null, {}] }).length === 0, '空板块 / null 板块被跳过');
    ctx.assert(X.buildBlocks({ sections: [{ type: 'advantages', title: '' }] }).length === 0, '无标题板块整体跳过');
    const withSkips = X.buildBlocks({ name: '甲', sections: [{ type: 'advantages', title: '优势', items: [null, { label: '', text: '' }, { label: 'A', text: 'B' }] }] });
    ctx.assert(withSkips.length === 3, '条目级空值被过滤（只留 h1 + h2 + 1 条有效条目）');
  }},

  /* ================= E. 纯文本 / Markdown ================= */
  { name: '纯文本', fn: function (ctx) {
    const r = ctx.ResumeExport.buildPlain(payload(), 'txt');
    const t = r.text;
    ctx.assert(/\.txt$/.test(r.filename), '文件名为 .txt（实际: ' + r.filename + '）');
    ctx.assert(t.indexOf('【个人优势】') >= 0, '中文板块标题用【】框出');
    ctx.assert(t.indexOf('CORE SKILLS') >= 0, '纯 ASCII 板块标题转大写');
    ctx.assert(t.indexOf('**') < 0, '纯文本无 ** 残留');
    ctx.assert(t.indexOf('\n\n\n') < 0, '连续空行已压缩（ATS 不读空段落）');
    ctx.assert(/\n$/.test(t) && !/\n\n$/.test(t), '以单个换行结尾');
    ctx.assert(t.indexOf('- 工程能力：') >= 0, '列表项以「- 」开头');
    ctx.assert(t.indexOf('\n- 首字延迟下降 74%\n') >= 0, '成果点独立成行');
  }},
  { name: 'Markdown', fn: function (ctx) {
    const r = ctx.ResumeExport.buildPlain(payload(), 'md');
    const t = r.text;
    ctx.assert(/\.md$/.test(r.filename), '文件名为 .md（实际: ' + r.filename + '）');
    ctx.assert(t.indexOf('# 陈测试') >= 0, '姓名输出为一级标题');
    ctx.assert(t.indexOf('## 核心') < 0 && t.indexOf('## 个人优势') >= 0, '板块输出为二级标题');
    ctx.assert(t.indexOf('### 示例科技') >= 0, '公司输出为三级标题');
    ctx.assert(t.indexOf('- **语言**：Python、TypeScript、Go') >= 0, 'Markdown 保留 ** 加粗标记');
    ctx.assert(t.indexOf('【') < 0, 'Markdown 形态不使用【】（那是纯文本的约定）');
  }},
  { name: '生成器只读', fn: function (ctx) {
    /* 导出必须只读：一旦就地改动数据，预览会被悄悄改写并触发一次自动保存。 */
    const p = payload();
    const before = JSON.stringify(p);
    ctx.ResumeExport.buildDocx(p);
    ctx.ResumeExport.buildPlain(p, 'txt');
    ctx.ResumeExport.buildPlain(p, 'md');
    ctx.ResumeExport.buildBlocks(p.data);
    ctx.assert(JSON.stringify(p) === before, '四种生成器运行后原始数据逐字节未变（只读性）');
    const d = fullData();
    ctx.assert(JSON.stringify(d) === JSON.stringify(fullData()), '传入的 data 对象本身未被篡改');
  }},

  /* ================= F. 无浏览器环境的降级 ================= */
  { name: '降级', fn: function (ctx) {
    /* vm 桩里没有 fetch：静默导出应判定「不支持」并回退到打印，而不是抛错或静默失败。 */
    let threw = null, ret;
    try { ret = ctx.ResumeExport.exportPdfSilent(); } catch (e) { threw = e; }
    ctx.assert(!threw, '无 fetch 环境下 exportPdfSilent 不抛错' + (threw ? '（' + threw.message + '）' : ''));
    ctx.assert(ret === null, '无 fetch 时返回 null（表示未产出文件）');
    ctx.assert(ctx.printCalls === 1, '回退到 window.print() 恰好一次');
  }},
  { name: '导出不抛错', fn: function (ctx) {
    /* vm 里的 document / Blob 全是桩，下载链路走不通也必须安全返回结果。 */
    let threw = null, r;
    try { r = ctx.ResumeExport.exportDocx(); } catch (e) { threw = e; }
    ctx.assert(!threw, 'exportDocx 在桩环境下不抛错' + (threw ? '（' + threw.message + '）' : ''));
    ctx.assert(r && r.bytes && r.bytes.length > 0, 'exportDocx 仍返回构建结果（便于上层提示文件名）');
    try { r = ctx.ResumeExport.exportTxt(); } catch (e) { threw = e; }
    ctx.assert(!threw && r && r.text, 'exportTxt 在桩环境下不抛错并返回文本');
  }},

  /* ================= G. 矩阵式技能行（keywords / detail） =================
     失效面：导出层没跟上新字段 → 技能板块在 Word / Markdown 里整块变空，
     只有一个光秃秃的「专业技能」标题（内容丢失比排版错更难发现）。 */
  { name: '技能矩阵导出', fn: function (ctx) {
    const data = {
      name: 'X', subtitle: '', meta: '', contact: [],
      sections: [{ id: 's', type: 'skills', title: '专业技能', groups: [
        { name: 'AI / Agent', keywords: '**Multi-Agent 协作编排** · RAG 增强检索',
          detail: 'LangChain / LangGraph · Few-Shot 自学习框架', items: [] },
        /* 同一板块里混排：有 keywords 的走矩阵，没有的仍走旧的逐条列表 */
        { name: '语言', items: ['Python', 'Go'] }
      ]}]
    };
    const b = ctx.ResumeExport.buildBlocks(data);
    ctx.assert(b.some(function (x) { return x.kind === 'h2' && x.text === '专业技能'; }), 'skills → h2 板块标题');
    ctx.assert(b.some(function (x) {
      return x.kind === 'li' && x.text === '**AI / Agent**：**Multi-Agent 协作编排** · RAG 增强检索';
    }), '矩阵行合成「分组名：关键词行」且保留 **加粗** 高亮标记');
    ctx.assert(b.some(function (x) { return x.kind === 'p' && x.text === 'LangChain / LangGraph · Few-Shot 自学习框架'; }),
      '补充说明行单独成段（含掌握程度 / 成果）');
    ctx.assert(b.some(function (x) { return x.kind === 'li' && x.text === '**语言**：Python、Go'; }),
      '同板块内无 keywords 的分组仍走旧版「、」连接');
    const doc = ctx.ResumeExport.buildDocx({ data: data, fonts: {}, spacing: {} });
    ctx.assert(doc && doc.bytes && doc.bytes.length > 0, '含矩阵技能行的 DOCX 能正常构建');
  }},

  /* ================= H. 分享页（只读 + 水印，A6） =================
     失效面：① 水印缺失 → 分享页与单文件 HTML 无差别，用户误把含编辑控件的版本发出去；
     ② 标题/水印未转义 → 简历姓名含 <script> 时被注入执行；
     ③ 无 noindex → 静态托管后被搜索引擎收录隐私信息。 */
  { name: '分享页：含水印 + 转义 + 只读语义', fn: function (ctx) {
    const E = ctx.ResumeExport;
    ctx.assert(typeof E.buildSharePageHtml === 'function', 'buildSharePageHtml 已暴露');
    ctx.assert(typeof E.buildWatermark === 'function', 'buildWatermark 已暴露');

    const html = E.buildSharePageHtml({
      resumeHtml: '<div class="resume">内容</div>',
      cssText: '.resume{color:#000;}',
      name: '张三',
      watermarkText: '仅供查看'
    });
    ctx.assert(/仅供查看/.test(html), '标题或正文含「仅供查看」语义');
    ctx.assert(/<div class="resume-share-wm"><span>/.test(html), '含水印 DOM 节点（而非仅样式）');
    ctx.assert(/pointer-events\s*:\s*none/.test(html), '水印不拦截鼠标（不挡文本选中/复制）');
    ctx.assert(/noindex,nofollow/.test(html), '带 noindex 元标签（防搜索引擎收录）');
    ctx.assert(/张三/.test(html), '姓名出现在标题');
  }},

  { name: '分享页：姓名/水印 HTML 转义（防注入）', fn: function (ctx) {
    const E = ctx.ResumeExport;
    const html = E.buildSharePageHtml({
      resumeHtml: '<div class="resume">x</div>',
      cssText: '',
      name: '<script>alert(1)</script>',
      watermarkText: '<img src=x onerror=alert(2)>'
    });
    ctx.assert(html.indexOf('<script>alert(1)</script>') === -1, '姓名中的 <script> 被转义');
    ctx.assert(html.indexOf('&lt;script&gt;') >= 0, '转义后仍保留可读文本');
    ctx.assert(html.indexOf('<img src=x') === -1, '水印中的 <img> 被转义');
  }},

  { name: '分享页：水印 CSS 打印时隐藏', fn: function (ctx) {
    const wm = ctx.ResumeExport.buildWatermark('仅供查看');
    ctx.assert(/@media print\{\.resume-share-wm\{display:none;\}\}/.test(wm.css), '打印时水印隐藏（@media print）');
    ctx.assert(/pointer-events\s*:\s*none/.test(wm.css), '水印不拦截鼠标事件');
  }},

];
