/* 统一入口清单（js/ui/menu-actions.js）测试。
   与其它 cases-*.js 同构（CommonJS + ctx.assert + 可返回 Promise）。

   这一组要防的是**结构性漂移** —— 不是逻辑写错，而是「两端各写一份清单、只改了一边」。
   这类缺陷此前真实存在且完全无声：
     · 桌面没有飞书同步（上报 / 拉取 / 历史版本 / 消息通知）与页面导航（简历库 / 追踪 / 设置）；
     · 手机没有「打印 / 另存为 PDF」、撤销 / 重做 / 文件名 / 分页线。
   断言因此分成三类：清单自身自洽（无重复、无孤儿）、两端齐备（关键功能谁都不少）、
   index.html 里不再残留第二份手写清单。 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* 关键功能：两端都必须能点到（缺任何一端都算入口断裂） */
const MUST_BE_BOTH = [
  { label: '投递体检', run: 'ResumeAudit.toggle()' },
  { label: 'JD 匹配分析', run: 'ResumeJd.toggle()' },
  { label: '撤销', run: 'ResumeEditor.undo()' },
  { label: '重做', run: 'ResumeEditor.redo()' },
  { label: '打印 / 另存为 PDF', run: 'window.print()' },
  { label: '导出 Word（.docx）', run: 'ResumeExport.exportDocx()' },
  { label: '导出 JSON Resume', run: 'ResumeEditor.exportJSONResume()' },
  { label: '上报到飞书', run: 'ResumeEditor.reportToFeishu()' },
  { label: '拉取最新', run: 'ResumeEditor.pullFromFeishu()' },
  { label: '历史版本', run: "ResumeRouter.navigate('/history')" },
  { label: '设置（飞书 / 外观 / 数据备份）', run: "ResumeRouter.navigate('/settings')" },
  { label: '投递追踪', run: "ResumeRouter.navigate('/tracker')" }
];

module.exports = [
  /* ---------- 一、清单自洽 ---------- */
  {
    name: '同一功能在清单里只定义一次',
    fn: (ctx) => {
      const A = ctx.ResumeMenu.ACTIONS;
      const byRun = {};
      A.forEach((a) => { byRun[a.run] = (byRun[a.run] || 0) + 1; });
      const dup = Object.keys(byRun).filter((k) => byRun[k] > 1);
      ctx.assert(dup.length === 0, '没有重复入口（重复：' + dup.join(' / ') + '）');

      const ids = A.map((a) => a.id).filter(Boolean).concat(A.map((a) => a.mid).filter(Boolean));
      const byId = {};
      ids.forEach((id) => { byId[id] = (byId[id] || 0) + 1; });
      ctx.assert(Object.keys(byId).filter((k) => byId[k] > 1).length === 0,
        '元素 id 不重复（重复 id 会让 getElementById 只命中第一个，另一端状态更新不到）');
    }
  },
  {
    name: '没有孤儿项（每项至少出现在一端）',
    fn: (ctx) => {
      const A = ctx.ResumeMenu.ACTIONS;
      const orphan = A.filter((a) => !a.d && !a.m);
      ctx.assert(orphan.length === 0, '每项至少归属一端（孤儿：' + orphan.length + '）');
      ctx.assert(A.length >= 18, '清单规模合理（当前 ' + A.length + ' 项）');
      /* 渲染必须真的尊重 d / m 的归属：为 null 的那一端绝不能出现（否则清单形同虚设） */
      const dh = ctx.ResumeMenu.htmlFor('desktop');
      const mh = ctx.ResumeMenu.htmlFor('mobile');
      A.forEach((a) => {
        if (!a.d) ctx.assert(dh.indexOf(a.run) === -1, '桌面不渲染「' + a.label + '」');
        if (!a.m) ctx.assert(mh.indexOf(a.run) === -1, '手机不渲染「' + a.label + '」');
      });
    }
  },
  {
    name: '分组顺序固定且两端共用同一份分组',
    fn: (ctx) => {
      const M = ctx.ResumeMenu;
      ctx.assert(M.GROUPS.indexOf('导出') !== -1 && M.GROUPS.indexOf('飞书同步') !== -1,
        '含导出与飞书同步分组');
      M.ACTIONS.forEach((a) => {
        if (a.d) ctx.assert(M.GROUPS.indexOf(a.d) !== -1, '桌面分组「' + a.d + '」在 GROUPS 里登记过');
        if (a.m) ctx.assert(M.GROUPS.indexOf(a.m) !== -1, '手机分组「' + a.m + '」在 GROUPS 里登记过');
      });
      ['desktop', 'mobile'].forEach((s) => {
        const h = M.htmlFor(s);
        const order = M.GROUPS.map((g) => h.indexOf('>' + g + '<')).filter((i) => i !== -1);
        const sorted = order.slice().sort((a, b) => a - b);
        ctx.assert(JSON.stringify(order) === JSON.stringify(sorted),
          s + ' 端分组按 GROUPS 顺序渲染');
      });
    }
  },

  /* ---------- 二、两端齐备（本次要修的核心缺口）---------- */
  {
    name: '关键功能在桌面与手机都能点到',
    fn: (ctx) => {
      const M = ctx.ResumeMenu;
      MUST_BE_BOTH.forEach((need) => {
        const hit = M.ACTIONS.filter((a) => a.run === need.run);
        ctx.assert(hit.length === 1, '「' + need.label + '」只定义一次（实际 ' + hit.length + '）');
        ctx.assert(hit[0] && hit[0].d && hit[0].m, '「' + need.label + '」桌面与手机都出现');
      });
    }
  },
  {
    name: '桌面补齐了此前够不着的飞书同步与页面导航',
    fn: (ctx) => {
      const M = ctx.ResumeMenu;
      const dh = M.htmlFor('desktop');
      ['上报到飞书', '拉取最新', '历史版本', '消息通知', '投递追踪', '设置（飞书 / 外观 / 数据备份）']
        .forEach((label) => ctx.assert(dh.indexOf(label) !== -1, '桌面清单含「' + label + '」'));
    }
  },
  {
    name: '手机补齐了此前缺失的打印 / 撤销 / 重做 / 文件名 / 分页线',
    fn: (ctx) => {
      const M = ctx.ResumeMenu;
      const mh = M.htmlFor('mobile');
      ['打印 / 另存为 PDF', '撤销', '重做', '显示分页线', 'filenameBaseMobile']
        .forEach((label) => ctx.assert(mh.indexOf(label) !== -1, '手机清单含「' + label + '」'));
    }
  },
  {
    name: '导出项两端一致（这项最容易只改一边）',
    fn: (ctx) => {
      const M = ctx.ResumeMenu;
      const runsIn = (surface) => M.ACTIONS
        .filter((a) => (surface === 'mobile' ? a.m : a.d) === '导出')
        .map((a) => a.run)
        .sort();
      const d = runsIn('desktop'), m = runsIn('mobile');
      ctx.assert(JSON.stringify(d) === JSON.stringify(m),
        '导出组两端条目完全相同（桌面 ' + d.length + ' / 手机 ' + m.length + '）');
      ctx.assert(d.length >= 8, '导出组条目数合理（' + d.length + '）');
    }
  },
  {
    name: '两端渲染出的按钮 id 互不重复，且动态更新项两端各有一个',
    fn: (ctx) => {
      const M = ctx.ResumeMenu;
      const mh = M.htmlFor('mobile');
      const dh = M.htmlFor('desktop');
      /* theme.js 按 id 写「日间模式 / 夜间模式」，两端各有一个 label 节点 */
      ctx.assert(dh.indexOf('id="themeBtnLabel"') !== -1, '桌面含 themeBtnLabel');
      ctx.assert(mh.indexOf('id="themeBtnLabelMobile"') !== -1, '手机含 themeBtnLabelMobile');
      /* feishu-sync.js 的忙碌态按钮组里含 feishuPullBtn / feishuPullBtnMobile */
      ctx.assert(dh.indexOf('id="feishuPullBtn"') !== -1, '桌面含 feishuPullBtn（飞书忙碌态能置灰）');
      ctx.assert(mh.indexOf('id="feishuPullBtnMobile"') !== -1, '手机含 feishuPullBtnMobile');
      /* 手机端不该出现桌面专属的「收起编辑面板」：按 run 表达式断言，不能只查 id ——
         手机端渲染时本来就不带 id，只查 id 的话「误把它放进手机清单」这种改动会漏网。 */
      ctx.assert(mh.indexOf('ResumeEditor.toggleEditorPane()') === -1,
        '手机不渲染「收起编辑面板」（手机没有右侧编辑面板这套布局）');
      ctx.assert(mh.indexOf('收起编辑面板') === -1, '手机清单里没有该文案');
      ctx.assert(dh.indexOf('id="paneToggleBtn"') !== -1, '桌面含 paneToggleBtn');
    }
  },
  {
    name: 'title 提示只给桌面（手机没有 hover）',
    fn: (ctx) => {
      const M = ctx.ResumeMenu;
      ctx.assert(M.htmlFor('desktop').indexOf('title=') !== -1, '桌面按钮带 title 提示');
      /* 只针对 <button>：文件名输入框那个 <span> 上的 title 不算（它是给输入框的说明） */
      ctx.assert(!/<button[^>]*\stitle=/.test(M.htmlFor('mobile')),
        '手机按钮不带 title（没有 hover，长按还会被读出来）');
    }
  },

  /* ---------- 三、index.html 里不再有第二份手写清单 ---------- */
  {
    name: 'index.html 不再手写这些按钮（否则又变回两份清单）',
    fn: (ctx) => {
      const html = read('index.html');
      [
        'ResumeExport.exportDocx()', 'ResumeExport.exportTxt()', 'ResumeExport.exportMarkdown()',
        'ResumeExport.exportPdfSilent()', 'ResumeEditor.exportPDF()', 'ResumeEditor.exportLongImage()',
        'ResumeEditor.exportSingleFileHTML()', 'ResumeEditor.undo()', 'ResumeEditor.redo()',
        'ResumeEditor.reportToFeishu()', 'ResumeEditor.pullFromFeishu()',
        'ResumeEditor.toggleGuides()', 'ResumeEditor.toggleTheme()',
        "ResumeRouter.navigate('/tracker')", "ResumeRouter.navigate('/settings')"
      ].forEach((run) => {
        ctx.assert(html.indexOf('onclick="' + run + '"') === -1,
          'index.html 不再手写 onclick="' + run + '"（定义已收敛到 ACTIONS）');
      });
    }
  },
  {
    name: 'index.html 含两个渲染容器且脚本在 pane-mobile / app.js 之前',
    fn: (ctx) => {
      const html = read('index.html');
      ctx.assert(/id="toolsMenuBody"/.test(html), '含桌面容器 #toolsMenuBody');
      ctx.assert(/id="syncMenuBody"/.test(html), '含手机容器 #syncMenuBody');
      ctx.assert(/<script src="js\/ui\/menu-actions\.js"><\/script>/.test(html), '引入 js/ui/menu-actions.js');
      const tag = (f) => html.indexOf('<script src="' + f + '"></script>');
      ctx.assert(tag('js/ui/menu-actions.js') !== -1, 'menu-actions.js 以 script 标签引入');
      ctx.assert(tag('js/ui/menu-actions.js') < tag('js/ui/pane-mobile.js'),
        'menu-actions.js 在 pane-mobile.js 之前（后者初始化时按 id 找按钮）');
      ctx.assert(tag('js/ui/menu-actions.js') < tag('js/app.js'),
        'menu-actions.js 在 app.js 之前（后者初始化时按 id 找按钮）');
    }
  },
  {
    name: '按 id 更新状态的四处代码都覆盖了两端',
    fn: (ctx) => {
      const app = read('js/app.js');
      ctx.assert(/undoBtnMobile/.test(app) && /redoBtnMobile/.test(app), '撤销/重做禁用态覆盖手机端按钮');
      ctx.assert(/filenameBaseMobile/.test(app), '文件名回填覆盖手机端输入框');
      const rr = read('js/render/resume-render.js');
      ctx.assert(/guideBtnMobile/.test(rr), '分页线按钮文案覆盖手机端');
      const ee = read('js/export-extra.js');
      ctx.assert(/pdfSilentBtnMobile/.test(ee), '静默 PDF 忙碌态覆盖手机端按钮');
    }
  },
  {
    name: 'build-single.js 白名单已登记（否则单文件版静默缺菜单）',
    fn: (ctx) => {
      const build = read('tools/build-single.js');
      ctx.assert(/js\/ui\/menu-actions\.js/.test(build), '白名单含 js/ui/menu-actions.js');
    }
  },
  {
    name: '模块暴露的 API 完整',
    fn: (ctx) => {
      const M = ctx.ResumeMenu;
      ctx.assert(Array.isArray(M.ACTIONS) && M.ACTIONS.length > 0, '暴露 ACTIONS 清单');
      ctx.assert(Array.isArray(M.GROUPS) && M.GROUPS.length > 0, '暴露 GROUPS');
      ['htmlFor', 'itemHtml', 'render'].forEach((k) =>
        ctx.assert(typeof M[k] === 'function', '暴露 ' + k + '()'));
    }
  }
];
