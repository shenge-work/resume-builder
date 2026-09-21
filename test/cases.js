/* 简历编辑器核心逻辑测试（在 vm 上下文内执行，与 data.js / app.js 共享同一作用域）。
   断言通过全局 __ok(name, cond) 上报；环境桩由 test/run.js 提供。
   覆盖：P0（存储通用化 / JSON 导入导出 / projects 预览）+ P1（板块增删 / 撤销重做栈）。 */

function E(name, cond){ __ok(name, !!cond); }
function clearLS(){ localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_KEY_LEGACY); }

/* ===== P0：存储通用化（去硬编码身份）===== */
E('SAVE_KEY 通用化（不含硬编码姓名）',
  SAVE_KEY === 'resume_builder_data_v1' && SAVE_KEY.indexOf('chenpeisheng') === -1);

/* exportJSON 在桩环境下不抛错（Blob/URL/createElement 均被桩接管） */
let exportThrew = false;
try { exportJSON(); } catch(e){ exportThrew = true; console.log('exportJSON threw:', e && e.message); }
E('exportJSON 调用不抛错', !exportThrew);

/* applyImported 拒绝非法格式（缺 data.sections），且弹错不改动数据 */
confirmReturn = true;
alertCalls.length = 0;
const nameBeforeBad = data.name;
applyImported({ foo: 1 });
E('applyImported 拒绝非法格式', alertCalls.length > 0);
E('applyImported 拒绝后不改数据', data.name === nameBeforeBad);

/* applyImported 接受合法数据并规范化（projects 缺 spacing 被补全） */
alertCalls.length = 0;
const payload = {
  data: {
    name: '导入名', subtitle: '', meta: '', contact: [],
    sections: [ { id: 'x', type: 'projects', title: '项目经历',
      items: [ { name: 'P1', stack: '', desc: '', results: [], pageBreak: false } ] } ]
  },
  fonts: {}, spacing: {}
};
applyImported(JSON.parse(JSON.stringify(payload)));
E('applyImported 导入后 name 生效', data.name === '导入名');
const projSec = data.sections.find(s => s.type === 'projects');
E('applyImported 规范化补 spacing',
  projSec && projSec.items[0].spacing && typeof projSec.items[0].spacing === 'object');

/* P0 存储统一：localStorage 不再承载简历数据（打包安装包无浏览器环境）。
   自动保存改走本地文件系统（Tauri 命令 / serve.js /api/library/*）；
   旧 SAVE_KEY* 仅保留常量定义用于清理残留，loadState 已移除。 */
clearLS();
localStorage.setItem(SAVE_KEY, 'LEGACY_RESIDUE');
saveState();
E('saveState 不再写 localStorage 简历数据', localStorage.getItem(SAVE_KEY) === 'LEGACY_RESIDUE');
E('SAVE_KEY 常量仍保留（用于清理残留）', SAVE_KEY === 'resume_builder_data_v1');

/* ===== P0：projects 板块预览分支（之前是静默空白 bug）===== */
data = { subtitleBold: false, metaBold: false, name: '预览测试', subtitle: '', meta: '', contact: [],
         sections: [ blankSection('projects') ] };
data.sections[0].items[0].name = '项目X';
let previewHtml = '', previewThrew = false;
try { previewHtml = renderResumeInner(); } catch(e){ previewThrew = true; console.log('renderResumeInner threw:', e && e.message); }
E('renderResumeInner(projects) 不抛错', !previewThrew);
E('renderResumeInner(projects) 含项目名', previewHtml.indexOf('项目X') !== -1);

/* ===== 专业技能矩阵式渲染（2026-09-20 新增 keywords / detail）
   失效面（任一断掉都要红）：
   · 渲染分支漏掉 → 新格式整块不渲染（只留一个「专业技能」标题）；
   · kwText 漏掉 → **重点** 以字面量星号显示；分隔符不统一 → 行内粘成一坨；
   · 旧版兜底被覆盖 → 没填 keywords 的老分组直接消失。 */
data = { subtitleBold: false, metaBold: false, name: '技能测试', subtitle: '', meta: '', contact: [],
         sections: [ { id: 's_sk', type: 'skills', title: '专业技能', pageBreak: false,
           groups: [
             { name: 'AI / Agent', keywords: '**Multi-Agent 协作编排** · **JVM 调优 · 并发编程** · RAG 增强检索',
               detail: 'LangChain / LangGraph · Few-Shot 自学习框架', items: [] },
             { name: '语言', items: ['Python', 'Go'] }
           ], spacing: {mt:0, mb:0} } ] };
let skHtml = '', skThrew = false;
try { skHtml = renderResumeInner(); } catch(e){ skThrew = true; console.log('renderResumeInner(skills) threw:', e && e.message); }
E('renderResumeInner(skills 矩阵) 不抛错', !skThrew);
E('技能矩阵：左列分组名', skHtml.indexOf('class="skill-name"') !== -1 && skHtml.indexOf('AI / Agent') !== -1);
E('技能矩阵：关键词行与高亮', skHtml.indexOf('class="skill-kw"') !== -1
  && skHtml.indexOf('<strong>Multi-Agent 协作编排</strong>') !== -1
  && skHtml.indexOf('**Multi-Agent') === -1);
E('技能矩阵：补充说明行', skHtml.indexOf('class="skill-detail"') !== -1 && skHtml.indexOf('Few-Shot 自学习框架') !== -1);
E('技能矩阵：分隔符渲染为统一圆点', skHtml.indexOf('<span class="skill-sep">·</span>') !== -1);
/* 每个专业名词包一层 skill-seg（inline-block）：换行时整段挪走，不把词从中间截断。
   断言落在结构上——分隔圆点必须在段外，否则换行点又跑回段中间。 */
E('技能矩阵：专业名词整段换行（段外是唯一换行点）',
  skHtml.indexOf('<span class="skill-seg">') !== -1
  && skHtml.indexOf('</span><span class="skill-sep">·</span><span class="skill-seg">') !== -1);
E('技能矩阵：跨分隔符的加粗整段高亮（不被 · 切开）',
  skHtml.indexOf('<strong>JVM 调优 · 并发编程</strong>') !== -1);
E('技能矩阵：页面上不残留字面量星号', skHtml.indexOf('**') === -1);
E('技能矩阵：无 keywords 的分组走旧版列表', skHtml.indexOf('<h4') !== -1 && skHtml.indexOf('<li') !== -1
  && skHtml.indexOf('Python') !== -1);
E('技能矩阵：矩阵行单独用 skillMatrix 间距（不与 skillGroup 叠加）',
  skHtml.indexOf('margin-top:0px;margin-bottom:0px;') !== -1);
/* 编辑器面板：新增字段必须真的渲染出输入框，否则「能存不能填」——
   数据模型改了、渲染改了，但右侧面板里没有 keywords / detail 两个框，用户永远填不进去。 */
let edHtml = '', edThrew = false;
try { edHtml = ResumeEditorSchema.renderEditorHTML(data); } catch (e) { edThrew = true; console.log('renderEditorHTML threw:', e && e.message); }
E('技能矩阵：编辑器不抛错', !edThrew);
E('技能矩阵：编辑器渲染出关键词行 / 说明行输入框',
  edHtml.indexOf('data-path="sections.0.groups.0" data-field="keywords"') !== -1
  && edHtml.indexOf('data-path="sections.0.groups.0" data-field="detail"') !== -1);
E('技能矩阵：编辑器留出旧版逐条技能点入口（可回退）',
  edHtml.indexOf('data-field="name"') !== -1 && edHtml.indexOf('sections.0.groups.0.items') !== -1);

/* ===== P1：板块工厂 ===== */
const adv = blankSection('advantages');
E('blankSection(advantages) 结构',
  adv.type === 'advantages' && Array.isArray(adv.items) && adv.items.length === 1
  && typeof adv.id === 'string' && adv.id.length > 0);
const sk = blankSection('skills');
E('blankSection(skills) 含 groups',
  sk.type === 'skills' && Array.isArray(sk.groups) && sk.groups.length === 1 && Array.isArray(sk.groups[0].items));
const pr = blankSection('projects');
E('blankSection(projects) 含 items+results',
  pr.type === 'projects' && Array.isArray(pr.items) && Array.isArray(pr.items[0].results) && typeof pr.items[0].name === 'string');
const ca = blankSection('career');
E('blankSection(career) 含 projects 数组',
  ca.type === 'career' && Array.isArray(ca.items) && Array.isArray(ca.items[0].projects));
E('blankSection id 唯一', blankSection('advantages').id !== blankSection('advantages').id);

/* ===== P1：添加板块 + 撤销/重做 ===== */
const before = data.sections.length;            // 当前为 projects-only（1 个）
recordHistory('action');
data.sections.push(blankSection('skills'));
E('添加板块后 +1', data.sections.length === before + 1);
undo();
E('撤销恢复板块数', data.sections.length === before);
redo();
E('重做 +1', data.sections.length === before + 1);
undo();                                         // 回到 before

/* ===== P1：单板块删除守卫（click 处理器内的守卫前提条件）===== */
data.sections = [ blankSection('advantages') ];
E('仅 1 个板块时 del-section 守卫成立', data.sections.length <= 1);

/* ===== P1：多步历史栈 ===== */
hist.undo.length = 0; hist.redo.length = 0; hist.last = { kind: '', t: 0 };
const base = data.sections.length;             // 1
recordHistory('action'); data.sections.push(blankSection('skills'));   // +1
recordHistory('action'); data.sections.push(blankSection('career'));  // +1
E('两步添加共 +2', data.sections.length === base + 2);
undo(); E('撤销一步', data.sections.length === base + 1);
undo(); E('再撤销一步', data.sections.length === base);
redo(); E('重做一步', data.sections.length === base + 1);

/* ===== P1：输入合并策略（避免逐字符/逐格历史爆炸）===== */
hist.undo.length = 0; hist.redo.length = 0; hist.last = { kind: '', t: 0 };
recordHistory('edit'); recordHistory('edit'); recordHistory('edit');
E('连续 edit 合并为 1 个历史项', hist.undo.length === 1);
recordHistory('setting'); recordHistory('setting');
E('连续 setting 合并为 1 个历史项（独立 kind）', hist.undo.length === 2);

/* ===== P1：板块级 pageBreak（强制板块从新一页开始）===== */
hist.undo.length = 0; hist.redo.length = 0; hist.last = { kind:'', t:0 };
data.sections = [];
const adv0 = blankSection('advantages');
const car0 = blankSection('career');
data.sections.push(adv0, car0);
E('blankSection("advantages").pageBreak 默认 false', adv0.pageBreak === false);
E('blankSection("career").pageBreak 默认 false', car0.pageBreak === false);

/* section.pageBreak 缺字段时 migratePageBreaks 补 false */
data.sections[0].pageBreak = undefined;
migratePageBreaks(data);
E('migratePageBreaks 把缺失的 section.pageBreak 补为 false', data.sections[0].pageBreak === false);

/* 显式 true 不会被迁移改写 */
data.sections[1].pageBreak = true;
migratePageBreaks(data);
E('migratePageBreaks 保留显式 pageBreak=true', data.sections[1].pageBreak === true);

/* 板块级 pageBreak 影响渲染：在 .section 元素上挂 page-break-before */
const secHtml = `<section class="section${car0.pageBreak ? ' page-break-before' : ''}">…</section>`;
E('career 渲染时挂上 page-break-before class', secHtml.includes('page-break-before'));
const advHtml = `<section class="section${adv0.pageBreak ? ' page-break-before' : ''}">…</section>`;
E('advantages 默认不带 page-break-before', !advHtml.includes('page-break-before'));

/* ===== N1 主题模板系统（F1/F2/F3/F5/F6）===== */
E('ResumeThemeTemplates 已加载', !!ResumeThemeTemplates);
E('内置主题数量 = 5', ResumeThemeTemplates.allThemes().length === 5);
E('默认主题为 classic', ResumeThemeTemplates.defaultThemeId() === 'classic');

/* 应用 modern 主题：字号 / 间距 / 纸张随之变化，且经 API 可读 */
data = { name:'主题测试', subtitle:'', subtitleBold:false, meta:'', metaBold:false, contact:[], sections:[], theme:{ id:'classic', overrides:{} } };
applyTheme('modern');
E('applyTheme 后当前主题 = modern', getActiveThemeId() === 'modern');
E('applyTheme(moden) 改姓名字号', currentFonts.name.val === 32);
E('applyTheme(moden) 改页面边距', JSON.stringify(data.pageMargins) === JSON.stringify({ top:16, right:16, bottom:16, left:16 }));

/* 颜色微调写进 overrides，且当前调色板包含该色 */
customizeThemeColor('rule', '#ff0000');
E('customizeThemeColor 写 overrides.color.rule', getCurrentPalette().rule === '#ff0000');

/* 重置微调回到主题出厂外观 */
resetThemeOverrides();
E('resetThemeOverrides 清除颜色微调', getCurrentPalette().rule !== '#ff0000');

/* 默认主题（classic）无颜色微调时调色板为 null（交给样式表 / 夜间纸张，保证默认一致） */
data.theme = { id:'classic', overrides:{} };
E('classic 无微调时 resolvePalette 为 null', ResumeThemeTemplates.resolvePalette(data) === null);

/* 逐节标题显隐（F6）：headingVisible=false 时渲染省略 section-title，true 时正常渲染 */
const hv = blankSection('advantages'); hv.headingVisible = false; hv.title = 'HDR_X';
data.sections = [hv];
E('headingVisible=false 省略标题渲染', ResumeRender.renderResumeInner().indexOf('HDR_X') === -1);
hv.headingVisible = true;
E('headingVisible=true 渲染标题', ResumeRender.renderResumeInner().indexOf('HDR_X') !== -1);

/* 自定义板块（F5）：渲染出 custom-body 且内容可见 */
const cs = ResumeEditorSchema.createSection('custom');
cs.title = '自定'; cs.html = '自定义内容 **加粗**';
data.sections = [cs];
const csHtml = ResumeRender.renderResumeInner();
E('custom 板块渲染出 custom-body', csHtml.indexOf('custom-body') !== -1);
E('custom 板块内容含文本', csHtml.indexOf('自定义内容') !== -1);

/* 恢复默认主题与数据，避免污染后续用例 */
applyTheme('classic');
data = { name:'', subtitle:'', subtitleBold:false, meta:'', metaBold:false, contact:[], sections:[] };

/* N5：缩略图渲染（buildResumeHtml）按 payload 渲染，不改写全局、空简历返回空串 */
(function () {
  const sample = {
    data: { name:'缩略图测试', subtitle:'S', contact:[],
      sections: [{ id:'s1', type:'advantages', title:'优势', items:[{ label:'L', text:'内容' }] }] },
    fonts: {}, spacing: {}
  };
  const html = ResumeRender.buildResumeHtml(sample);
  E('buildResumeHtml 返回 .resume 包裹', /class="resume"/.test(html));
  E('buildResumeHtml 含姓名', html.indexOf('缩略图测试') !== -1);
  E('buildResumeHtml 含板块标题', html.indexOf('优势') !== -1);
  E('buildResumeHtml 空 sections 返回空串', ResumeRender.buildResumeHtml({ data:{ name:'x', sections:[] }, fonts:{}, spacing:{} }) === '');
  /* 临时交换全局 data 后必须恢复：调用前 data 是上面的空对象，调用后仍是它 */
  E('buildResumeHtml 不改写全局 data', data && data.sections && data.sections.length === 0);
})();
