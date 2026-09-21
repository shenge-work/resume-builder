/* =============================================================
 * N9 个人求职官网导出：脱敏 / 单文件官网渲染 / 两种官网板块类型
 * -----------------------------------------------------------------------------
 * 覆盖四类失效面：
 *   1) 脱敏失灵 —— 手机号 / 身份证 / 住址 / 期望薪资默认必须**不上官网**，
 *      且脱敏不得就地改动用户数据（改的是副本）。
 *   2) 导出的官网忘了带内容 —— kpi-band / project-cards 必须真的渲染出来。
 *   3) 预览与导出漂移 —— 应用内 renderSections() 的产物必须**原样**出现在导出 HTML 里。
 *   4) 板块内容在其它导出通道（Word / 纯文本 / 体检）里静默丢失。
 * ============================================================= */
'use strict';

/* 一份覆盖六类联系人 + 两种新板块的测试数据（全虚构，不含任何真实个人信息） */
function sampleData() {
  return {
    name: '林一帆',
    subtitle: '全栈工程师 · 前端架构',
    meta: '28岁 | 4年经验',
    contact: [
      '138-0000-0000',
      'demo@example.com',
      '广东省深圳市南山区科技园某路 88 号 3 号楼',
      '110101199001011234',
      '期望薪资 25K-35K',
      'https://github.com/example',
      '某某大学 · 2020 统招全日制本科'
    ],
    sections: [
      {
        id: 's_kpi', type: 'kpi-band', title: '关键数据',
        items: [
          { value: '1200+', label: 'GitHub Stars' },
          { value: '4', label: '完整上线项目' },
          { value: '', label: '只有说明也应在' }
        ]
      },
      {
        id: 's_cards', type: 'project-cards', title: '项目作品',
        cards: [
          {
            name: '拾光 LIGHTDECK',
            desc: '面向内容团队的一体化工作台',
            cover: 'data/uploads/lightdeck.png',
            stack: 'React · Node.js · Redis',
            metrics: ['留存 +21%', 'PV 82万'],
            before: '首屏加载 4.2s', after: '首屏加载 1.1s', approach: '图片分片 + 接口预取'
          },
          { name: '空卡片', desc: '', cover: '', stack: '', metrics: [], before: '', after: '', approach: '' }
        ]
      },
      {
        id: 's_adv', type: 'advantages', title: '个人优势',
        items: [{ label: '工程化', text: '把重复的事交给工具' }]
      }
    ]
  };
}

module.exports = [

  /* ================= 一、联系方式分类 ================= */
  { name: 'classifyContact：六类联系方式与兜底', fn(ctx) {
    const C = ctx.ResumePortfolio.classifyContact;
    ctx.assert(C('demo@example.com') === 'email', '邮箱 → email');
    ctx.assert(C('138-0000-0000') === 'phone', '手机号（带连字符）→ phone');
    ctx.assert(C('13800000000') === 'phone', '手机号（纯数字）→ phone');
    ctx.assert(C('110101199001011234') === 'id', '18 位身份证 → id');
    ctx.assert(C('广东省深圳市南山区科技园某路 88 号 3 号楼') === 'address', '带门牌的地址 → address');
    ctx.assert(C('期望薪资 25K-35K') === 'salary', '期望薪资 → salary');
    ctx.assert(C('https://github.com/example') === 'link', '主页链接 → link');
    ctx.assert(C('某某大学 · 2020 统招全日制本科') === 'education', '教育信息 → education');
    ctx.assert(C('') === 'other', '空行 → other');
    /* 顺序陷阱：邮箱里含数字、身份证含 11 位子串，都不能被判成手机号 */
    ctx.assert(C('a1b2c3@example.com') === 'email', '邮箱优先于手机号判定');
    ctx.assert(C('110101199001011234') !== 'phone', '身份证不得被判成手机号');
  }},

  /* ================= 二、脱敏 ================= */
  { name: 'redact：默认隐藏手机号 / 身份证 / 住址 / 期望薪资，保留邮箱与链接', fn(ctx) {
    const P = ctx.ResumePortfolio;
    const r = P.redact(sampleData(), {});
    const kept = r.data.contact.join(' | ');
    ctx.assert(kept.indexOf('138-0000-0000') === -1, '手机号不上官网');
    ctx.assert(kept.indexOf('110101199001011234') === -1, '身份证号不上官网');
    ctx.assert(kept.indexOf('科技园某路') === -1, '详细住址不上官网');
    ctx.assert(kept.indexOf('期望薪资') === -1, '期望薪资不上官网');
    ctx.assert(kept.indexOf('demo@example.com') !== -1, '邮箱默认保留（HR 要联系得到人）');
    ctx.assert(kept.indexOf('github.com/example') !== -1, '主页链接默认保留');
    ctx.assert(r.hidden.length === 4, '恰好隐藏 4 行（实际 ' + r.hidden.length + '）');
    ctx.assert(r.published.length === 3, '恰好公开 3 行（实际 ' + r.published.length + '）');
  }},

  { name: 'redact：关掉 hideSensitive 时全部原样保留（用户显式选择才公开）', fn(ctx) {
    const P = ctx.ResumePortfolio;
    const r = P.redact(sampleData(), { hideSensitive: false });
    const kept = r.data.contact.join(' | ');
    ctx.assert(kept.indexOf('138-0000-0000') !== -1, '取消隐藏后手机号会公开');
    ctx.assert(r.hidden.length === 0, '没有任何一行被隐藏');
  }},

  { name: 'redact：不就地修改原始数据（改的是副本）', fn(ctx) {
    const P = ctx.ResumePortfolio;
    const src = sampleData();
    const before = src.contact.length;
    P.redact(src, {});
    ctx.assert(src.contact.length === before, '原始 contact 长度不变（实际 ' + src.contact.length + '）');
    ctx.assert(src.contact.join('|').indexOf('138-0000-0000') !== -1, '原始数据里的手机号仍在（未被就地抹掉）');
  }},

  { name: 'redact：maskEmail 把邮箱换成 example.com 占位并记账', fn(ctx) {
    const P = ctx.ResumePortfolio;
    const r = P.redact(sampleData(), { maskEmail: true });
    ctx.assert(r.data.contact.indexOf(P.PLACEHOLDER_EMAIL) !== -1, '占位邮箱写进了公开数据');
    ctx.assert(r.data.contact.join('|').indexOf('demo@example.com') === -1, '真实邮箱不再出现在公开数据里');
    ctx.assert(r.masked.length === 1, '占位替换记录了 1 条（实际 ' + r.masked.length + '）');
  }},

  { name: 'normalizePrivacy：默认值 = 隐藏敏感信息 + 不占位 + 不内嵌完整简历', fn(ctx) {
    const n = ctx.ResumePortfolio.normalizePrivacy();
    ctx.assert(n.hideSensitive === true, 'hideSensitive 默认 true');
    ctx.assert(n.maskEmail === false, 'maskEmail 默认 false');
    ctx.assert(n.embedFullResume === false, 'embedFullResume 默认 false（不在源码里泄露完整联系方式）');
  }},

  /* ================= 三、单文件官网 HTML ================= */
  { name: 'buildPortfolioHtml：自包含（无外链样式 / 无外链脚本）且标题含姓名与头衔', fn(ctx) {
    const html = ctx.ResumePortfolio.buildPortfolioHtml({ data: sampleData(), privacy: {} });
    ctx.assert(!/<link[^>]+rel="stylesheet"/i.test(html), '不含外链样式表（单文件自包含）');
    ctx.assert(!/<script[^>]+src=/i.test(html), '不含外链脚本（单文件自包含）');
    ctx.assert(/<style>[\s\S]{200,}<\/style>/.test(html), '样式是内联的');
    ctx.assert(html.indexOf('<title>林一帆 · 全栈工程师 · 前端架构</title>') !== -1, 'title = 姓名 · 头衔（便于搜索引擎收录）');
  }},

  { name: 'buildPortfolioHtml：kpi-band 渲染成「大数字 + 小标签」', fn(ctx) {
    const html = ctx.ResumePortfolio.buildPortfolioHtml({ data: sampleData(), privacy: {} });
    ctx.assert(html.indexOf('class="pf-kpi"') !== -1, '出现数字带容器 .pf-kpi');
    ctx.assert(/<span class="pf-kpi-value">1200\+<\/span>/.test(html), '数字 1200+ 渲染为 kpi-value');
    ctx.assert(/<span class="pf-kpi-label">GitHub Stars<\/span>/.test(html), '说明 GitHub Stars 渲染为 kpi-label');
    ctx.assert(html.indexOf('只有说明也应在') !== -1, '只有说明、没有数字的项也渲染（不静默丢内容）');
  }},

  { name: 'buildPortfolioHtml：project-cards 渲染成卡片墙（封面 / 指标 / 技术栈 / 证据链）', fn(ctx) {
    const html = ctx.ResumePortfolio.buildPortfolioHtml({ data: sampleData(), privacy: {} });
    ctx.assert(html.indexOf('class="pf-cards"') !== -1, '出现卡片墙容器 .pf-cards');
    ctx.assert(/<h3 class="pf-proj-name">拾光 LIGHTDECK<\/h3>/.test(html), '项目名渲染');
    /* 技术栈按 · 切分后逐项变芯片 */
    ctx.assert(/<span>React<\/span><span>Node\.js<\/span><span>Redis<\/span>/.test(html), '技术栈按 · 切成芯片');
    ctx.assert(/<span class="pf-proj-metric">留存 \+21%<\/span>/.test(html), '指标渲染为芯片');
    ctx.assert(html.indexOf('"pf-proj-cover"') !== -1 && html.indexOf('lightdeck.png') !== -1, '封面图渲染');
    const ev = html.slice(html.indexOf('class="pf-evidence"'));
    ctx.assert(ev.indexOf('优化前：首屏加载 4.2s') !== -1 && ev.indexOf('优化后：首屏加载 1.1s') !== -1
      && ev.indexOf('手段：图片分片 + 接口预取') !== -1, '证据链三元组合成一行小字');
  }},

  { name: 'buildPortfolioHtml：官网里手机号不可见，邮箱可见（脱敏真的落到产物上）', fn(ctx) {
    const html = ctx.ResumePortfolio.buildPortfolioHtml({ data: sampleData(), privacy: {} });
    /* 只检查页面正文区（打印块按 embedFullResume 策略单独测） */
    const site = html.slice(html.indexOf('<div class="pf-site">'));
    ctx.assert(site.indexOf('138-0000-0000') === -1, '正文区不含手机号');
    ctx.assert(site.indexOf('科技园某路') === -1, '正文区不含详细住址');
    ctx.assert(site.indexOf('demo@example.com') !== -1, '正文区含邮箱');
    /* 整份文件兜底：默认策略下手机号不应出现在任何角落（打印块 / 注释 / 元信息都算）——
       这条比上面两条更狠，能拦住「从别的通道漏出去」的新写法。 */
    ctx.assert(html.indexOf('138-0000-0000') === -1, '整份导出文件都不含手机号（默认策略）');
    ctx.assert(html.indexOf('110101199001011234') === -1, '整份导出文件都不含身份证号（默认策略）');
  }},

  { name: 'buildPortfolioHtml：打印块默认与官网页同源（不含未脱敏信息）', fn(ctx) {
    const html = ctx.ResumePortfolio.buildPortfolioHtml({ data: sampleData(), privacy: {} });
    const print = html.slice(html.indexOf('<article class="pf-print">'), html.indexOf('<div class="pf-site">'));
    ctx.assert(print.length > 10, '打印块存在');
    ctx.assert(print.indexOf('138-0000-0000') === -1, '默认打印块不含手机号（不通过「下载 PDF」泄露）');
    ctx.assert(print.indexOf('1200+') !== -1, '默认打印块仍含 KPI 数字');
  }},

  { name: 'buildPortfolioHtml：显式内嵌完整简历时，打印块才含未脱敏联系方式', fn(ctx) {
    const html = ctx.ResumePortfolio.buildPortfolioHtml({
      data: sampleData(), privacy: { embedFullResume: true }
    });
    const print = html.slice(html.indexOf('<article class="pf-print">'), html.indexOf('<div class="pf-site">'));
    ctx.assert(print.indexOf('138-0000-0000') !== -1, '开启后打印块含完整手机号（用户显式选择）');
    /* 但正文区仍然脱敏 —— 访客一眼看到的还是脱敏版 */
    const site = html.slice(html.indexOf('<div class="pf-site">'));
    ctx.assert(site.indexOf('138-0000-0000') === -1, '正文区依旧脱敏');
  }},

  { name: 'buildPortfolioHtml：导航锚点与板块 id 对应得上', fn(ctx) {
    const html = ctx.ResumePortfolio.buildPortfolioHtml({ data: sampleData(), privacy: {} });
    ctx.assert(/href="#pf-sec-0"/.test(html), '导航含第一个板块的锚点');
    ctx.assert(/id="pf-sec-0"/.test(html), '第一个板块带对应 id');
    ctx.assert(/id="pf-sec-1"/.test(html), '第二个板块带对应 id');
  }},

  { name: 'buildPortfolioHtml：页头有「下载 PDF 简历」按钮（走浏览器打印 / 另存为 PDF）', fn(ctx) {
    const html = ctx.ResumePortfolio.buildPortfolioHtml({ data: sampleData(), privacy: {} });
    ctx.assert(html.indexOf('下载 PDF 简历') !== -1, '按钮文案存在');
    ctx.assert(/onclick="window\.print\(\)"/.test(html), '点击走 window.print()（静态站无后端）');
    ctx.assert(/@media print\{/.test(html), '带打印样式（只打印简历块）');
    ctx.assert(/\.pf-nav,\.pf-site\{display:none/.test(html), '打印时隐藏官网外壳');
    /* 给了真文件时改用真下载链接 */
    const withPdf = ctx.ResumePortfolio.buildPortfolioHtml({ data: sampleData(), privacy: {}, pdfHref: 'data:application/pdf;base64,AAA' });
    ctx.assert(/<a class="pf-btn" download href="data:application\/pdf;base64,AAA">下载 PDF 简历<\/a>/.test(withPdf), 'pdfHref 存在时用真下载链接');
  }},

  { name: 'buildPortfolioHtml：HTML 转义（姓名 / 项目名里的标签不得逃逸出来）', fn(ctx) {
    const d = sampleData();
    d.name = '<img src=x onerror=alert(1)>';
    d.sections[1].cards[0].name = '<script>bad()</script>';
    const html = ctx.ResumePortfolio.buildPortfolioHtml({ data: d, privacy: {} });
    ctx.assert(html.indexOf('<img src=x onerror=') === -1, '姓名里的 img 标签被转义');
    ctx.assert(html.indexOf('&lt;img src=x onerror=alert(1)&gt;') !== -1, '姓名以实体形式出现');
    ctx.assert(html.indexOf('<script>bad()</script>') === -1, '项目名里的 script 未逃逸');
  }},

  { name: 'buildPortfolioHtml：窄屏不横向溢出（长联系方式可折行 / 卡片单列）', fn(ctx) {
    const html = ctx.ResumePortfolio.buildPortfolioHtml({ data: sampleData(), privacy: {} });
    ctx.assert(/@media \(max-width:720px\)\{/.test(html), '有窄屏断点');
    ctx.assert(/\.pf-site\{overflow-wrap:break-word;\}/.test(html), '版心允许长串换行（长 URL 不撑破）');
    /* 失效面：长芯片（如「某某大学 · 2020 统招全日制本科」）在 390px 下会把整页顶出横向滚动条 */
    ctx.assert(/\.pf-chip\{white-space:normal;overflow-wrap:anywhere;\}/.test(html), '窄屏下长芯片允许折行');
    ctx.assert(/\.pf-cards\{grid-template-columns:1fr;\}/.test(html), '窄屏下卡片墙单列');
  }},

  { name: 'buildPortfolioHtml：headingVisible=false 的板块只隐藏标题，内容仍在', fn(ctx) {
    const d = sampleData();
    d.sections[0].headingVisible = false;
    const html = ctx.ResumePortfolio.buildPortfolioHtml({ data: d, privacy: {} });
    ctx.assert(html.indexOf('关键数据') === -1, '标题被隐藏');
    ctx.assert(html.indexOf('1200+') !== -1, '内容仍在');
  }},

  /* ================= 四、预览与导出不得漂移 ================= */
  { name: '一致性：导出 HTML 原样包含应用内 renderSections() 的板块 HTML', fn(ctx) {
    const d = sampleData();
    /* 导出时额外带锚点前缀（顶栏导航要用），所以预览侧也用同一组参数才可比 */
    const preview = ctx.PortfolioView.renderSections(d, { anchorPrefix: 'pf-sec-' });
    const html = ctx.ResumePortfolio.buildPortfolioHtml({ data: d, privacy: {} });
    ctx.assert(html.indexOf(preview) !== -1, '导出产物里能找到应用内预览的板块 HTML（同一份渲染实现）');
    ctx.assert(preview.indexOf('pf-kpi-value') !== -1 && preview.indexOf('pf-proj-name') !== -1,
      'renderSections 确实渲染了两种新板块');
  }},

  /* ================= 五、板块类型注册与 A4 降级渲染 ================= */
  { name: 'schema：kpi-band / project-cards 已注册，工厂造得出结构', fn(ctx) {
    const S = ctx.ResumeEditorSchema;
    ctx.assert(!!S.getType('kpi-band'), 'kpi-band 已注册');
    ctx.assert(!!S.getType('project-cards'), 'project-cards 已注册');
    ctx.assert(S.createSection('kpi-band').items.length === 3, 'kpi-band 默认给 3 个数据项');
    ctx.assert(S.createSection('project-cards').cards.length === 1, 'project-cards 默认给 1 张卡');
    ctx.assert(!!S.getList('kpi-band.items'), 'kpi-band.items 列表已索引（增删移才有规则）');
    ctx.assert(!!S.getList('project-cards.cards'), 'project-cards.cards 列表已索引');
    ctx.assert(!!S.getList('project-cards.cards.metrics'), '卡片内嵌的 metrics 列表已索引');
    ctx.assert(S.blankProjectCard().metrics.length === 0, '新建卡片 metrics 为空数组（不是 undefined）');
  }},

  { name: 'schema：编辑区出现两个新板块的「添加板块」按钮与字段', fn(ctx) {
    const S = ctx.ResumeEditorSchema;
    const html = S.renderEditorHTML({
      name: '', contact: [],
      sections: [S.createSection('kpi-band'), S.createSection('project-cards')]
    });
    ctx.assert(html.indexOf('＋ 关键数据带（官网首屏）') !== -1, '有关键数据带的添加按钮');
    ctx.assert(html.indexOf('＋ 项目卡片墙（官网）') !== -1, '有项目卡片墙的添加按钮');
    ctx.assert(html.indexOf('data-field="value"') !== -1, 'KPI 数字字段可编辑');
    ctx.assert(html.indexOf('data-field="label"') !== -1, 'KPI 说明字段可编辑');
    ctx.assert(html.indexOf('data-field="cover"') !== -1, '卡片封面字段可编辑');
    ctx.assert(html.indexOf('data-field="before"') !== -1, '证据链「优化前」字段可编辑');
    ctx.assert(html.indexOf('data-field="approach"') !== -1, '证据链「手段」字段可编辑');
    ctx.assert(html.indexOf('＋ 添加指标') !== -1, '卡片内的指标列表可增行');
    ctx.assert(html.indexOf('＋ 添加项目卡') !== -1, '可继续加卡片');
  }},

  { name: 'A4 降级渲染：kpi-band 输出一行数字带，不丢数据', fn(ctx) {
    const html = ctx.ResumeRender.buildResumeHtml({ data: sampleData(), fonts: {}, spacing: {} });
    ctx.assert(html.indexOf('class="kpi-band"') !== -1, '出现 .kpi-band（PDF 版式用）');
    ctx.assert(/<span class="kpi-value">1200\+<\/span>/.test(html), '数字渲染');
    ctx.assert(html.indexOf('class="pf-kpi"') === -1, '不含官网专属容器（PDF 不被官网版式带偏）');
  }},

  { name: 'A4 降级渲染：project-cards 输出时间线 + 指标 + 证据链', fn(ctx) {
    const html = ctx.ResumeRender.buildResumeHtml({ data: sampleData(), fonts: {}, spacing: {} });
    ctx.assert(html.indexOf('class="project nested"') !== -1, '卡片降级为既有 .project 时间线样式');
    ctx.assert(html.indexOf('class="card-metrics"') !== -1, '指标渲染为列表');
    ctx.assert(html.indexOf('class="evidence"') !== -1, '证据链渲染为一行小字');
    ctx.assert(html.indexOf('优化前：首屏加载 4.2s') !== -1, '证据链内容在');
    ctx.assert(html.indexOf('class="pf-proj"') === -1, '不含官网卡片墙容器');
  }},

  { name: 'A4 降级渲染：卡片重排用专用 kind=card（不误改 items）', fn(ctx) {
    const RE = ctx.ResumeEditor, R = ctx.ResumeRender;
    const payload = RE.getData();
    const savedSections = payload.data.sections;
    try {
      payload.data.sections = [{
        id: 'sc1', type: 'project-cards', title: '项目作品',
        cards: [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
      }];
      ctx.assert(R.reorderWithin('card', 'sc1', 0, undefined, 1) === true, '下移返回 true');
      ctx.assert(payload.data.sections[0].cards.map(c => c.name).join('') === 'BAC', '卡片顺序变为 B A C');
      ctx.assert(R.reorderWithin('card', 'sc1', 2, undefined, 1) === false, '末位下移越界返回 false');
    } finally {
      payload.data.sections = savedSections;
    }
  }},

  /* ================= 六、其它导出通道不得丢内容 ================= */
  { name: '一致性：Word/文本导出的区块里也含 KPI 与项目卡内容', fn(ctx) {
    const blocks = ctx.ResumeExport.buildBlocks(sampleData());
    const txt = blocks.map(b => b.kind + ':' + b.text).join('\n');
    ctx.assert(txt.indexOf('1200+') !== -1, 'KPI 数字进了导出区块');
    ctx.assert(txt.indexOf('GitHub Stars') !== -1, 'KPI 说明进了导出区块');
    ctx.assert(txt.indexOf('拾光 LIGHTDECK') !== -1, '项目卡名进了导出区块');
    ctx.assert(txt.indexOf('留存 +21%') !== -1, '卡片指标进了导出区块');
    ctx.assert(txt.indexOf('优化前 首屏加载 4.2s') !== -1, '证据链进了导出区块');
  }},

  { name: '一致性：官网打印块与 Word 区块覆盖同一批内容（防两处漂移）', fn(ctx) {
    const d = sampleData();
    const printBlocks = ctx.ResumePortfolio.blocksFor(d);
    const printTxt = printBlocks.map(b => b.kind + ':' + b.text).join('\n');
    const exportTxt = ctx.ResumeExport.buildBlocks(d).map(b => b.kind + ':' + b.text).join('\n');
    ctx.assert(printTxt.indexOf('1200+') !== -1 && exportTxt.indexOf('1200+') !== -1, '两处都有 KPI 数字');
    ctx.assert(printTxt.indexOf('拾光 LIGHTDECK') !== -1 && exportTxt.indexOf('拾光 LIGHTDECK') !== -1, '两处都有项目卡名');
    ctx.assert(printTxt.indexOf('留存 +21%') !== -1 && exportTxt.indexOf('留存 +21%') !== -1, '两处都有卡片指标');
  }},

  /* ================= 七、附言 / 部署指引 / 封面路径提醒 ================= */
  { name: 'buildPitch：附言带链接占位符，给了 url 就用真链接', fn(ctx) {
    const P = ctx.ResumePortfolio;
    const a = P.buildPitch('林一帆', '');
    ctx.assert(a.indexOf('个人网站') !== -1, '附言提到个人网站');
    ctx.assert(a.indexOf('【这里粘贴你的官网链接】') !== -1, '没给链接时留占位符（不让用户以为已经填好了）');
    const b = P.buildPitch('林一帆', 'https://linyifan.netlify.app');
    ctx.assert(b.indexOf('https://linyifan.netlify.app') !== -1, '给了链接就用真链接');
  }},

  { name: 'buildDeployNotes：含三个托管平台、主动递链接的实话、以及「官网不替代 PDF」', fn(ctx) {
    const t = ctx.ResumePortfolio.buildDeployNotes('林一帆-个人官网.html');
    ctx.assert(t.indexOf('林一帆-个人官网.html') !== -1, '带上真实文件名');
    ctx.assert(t.indexOf('Netlify') !== -1 && t.indexOf('Vercel') !== -1 && t.indexOf('GitHub Pages') !== -1,
      '三个免费托管平台都在');
    ctx.assert(t.indexOf('主动递链接') !== -1, '如实说明「平台不会自动导流」');
    ctx.assert(t.indexOf('不替代') !== -1, '如实说明「官网不替代 PDF 简历」');
  }},

  { name: 'relativeCoverCount：数出相对路径封面（部署时会 404）', fn(ctx) {
    const P = ctx.ResumePortfolio;
    ctx.assert(P.relativeCoverCount(sampleData()) === 1, '相对路径封面计 1 张（实际 ' + P.relativeCoverCount(sampleData()) + '）');
    const d = sampleData();
    d.sections[1].cards[0].cover = 'https://cdn.example.com/a.png';
    ctx.assert(P.relativeCoverCount(d) === 0, '外链封面不计入');
  }},

  /* ================= 八、入口接线 ================= */
  { name: '入口：工具菜单桌面端与手机端都有「导出为个人官网」', fn(ctx) {
    const d = ctx.ResumeMenu.htmlFor('desktop'), m = ctx.ResumeMenu.htmlFor('mobile');
    ctx.assert(/ResumeEditor\.exportPortfolioSite\(\)/.test(d), '桌面端有入口');
    ctx.assert(/ResumeEditor\.exportPortfolioSite\(\)/.test(m), '手机端有入口');
    ctx.assert(d.indexOf('默认隐藏手机号') !== -1, '入口说明行写清默认脱敏');
  }},

  { name: '入口：ResumeEditor 暴露官网导出的一整套函数', fn(ctx) {
    const RE = ctx.ResumeEditor;
    ['exportPortfolioSite', 'runPortfolioExport', 'closePortfolioModal',
      'refreshPortfolioPublicList', 'previewPortfolio', 'downloadPortfolio', 'copyPortfolioPitch']
      .forEach(function (k) {
        ctx.assert(typeof RE[k] === 'function', '暴露了 ' + k);
      });
  }},

  { name: '入口：无数据时不抛错，走通知而非常规流程', fn(ctx) {
    const RE = ctx.ResumeEditor;
    /* 只断言「调用不抛错」：exportPortfolioSite 内部对 data 为空有分支，不依赖 DOM 同一性 */
    let threw = false;
    try { RE.exportPortfolioSite(); } catch (e) { threw = true; }
    ctx.assert(!threw, 'exportPortfolioSite 在测试桩环境下不抛错');
    let threw2 = false;
    try { RE.runPortfolioExport(); } catch (e) { threw2 = true; }
    ctx.assert(!threw2, 'runPortfolioExport 在测试桩环境下不抛错');
    let threw3 = false;
    try { RE.refreshPortfolioPublicList(); } catch (e) { threw3 = true; }
    ctx.assert(!threw3, 'refreshPortfolioPublicList 在测试桩环境下不抛错');
  }}

];
