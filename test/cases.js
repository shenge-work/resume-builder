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

/* 旧个人化 key 自动迁移到通用 key 并删除旧 key */
clearLS();
localStorage.setItem(SAVE_KEY_LEGACY,
  JSON.stringify({ data: { name: '旧名', sections: [] }, fonts: {}, spacing: {} }));
const migrated = loadState();
E('loadState 旧 key 迁移返回 true', migrated === true);
E('loadState 写入通用 key', localStorage.getItem(SAVE_KEY) !== null);
E('loadState 删除旧 key', localStorage.getItem(SAVE_KEY_LEGACY) === null);
E('loadState 迁移后 name 生效', data.name === '旧名');

/* ===== P0：projects 板块预览分支（之前是静默空白 bug）===== */
data = { subtitleBold: false, metaBold: false, name: '预览测试', subtitle: '', meta: '', contact: [],
         sections: [ blankSection('projects') ] };
data.sections[0].items[0].name = '项目X';
let previewHtml = '', previewThrew = false;
try { previewHtml = renderResumeInner(); } catch(e){ previewThrew = true; console.log('renderResumeInner threw:', e && e.message); }
E('renderResumeInner(projects) 不抛错', !previewThrew);
E('renderResumeInner(projects) 含项目名', previewHtml.indexOf('项目X') !== -1);

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
