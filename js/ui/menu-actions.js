/* =============================================================
 * 统一入口清单（ResumeMenu）
 * -------------------------------------------------------------
 * 为什么需要它：此前「桌面工具菜单」与「手机 sync-pane」是**两份各自手写的静态按钮列表**，
 * 于是两边都只写了一半 —— 桌面没有飞书同步与页面导航，手机没有打印 / 撤销 / 重做 / 文件名。
 * 这种「两端各写一份」的结构注定会漂移：加功能时改了一处、忘了另一处，且没有任何东西会报错。
 *
 * 本模块把入口收敛为**一份声明式清单**，两个端都从它渲染：
 *   · 加功能只改这一处，两端同时生效；
 *   · 两端不可能再出现「一边有、一边没有」；
 *   · 清单本身可被测试直接读取断言（id 唯一、分组一致、关键功能两端齐备）。
 *
 * 只负责「按钮清单的渲染」，不含任何业务逻辑：run 是点击时执行的表达式字符串，
 * 与原先写在 index.html 里的 onclick 完全等价 —— 因此点击时全局对象一定已就绪。
 *
 * 接口：
 *   ResumeMenu.ACTIONS          → 清单（每项含 id / label / run / d / m）
 *   ResumeMenu.htmlFor(surface) → 'desktop' | 'mobile' 的 HTML（纯函数，可单测）
 *   ResumeMenu.render()         → 渲染进 #toolsMenuBody / #syncMenuBody
 * ============================================================= */
(function (global) {
  'use strict';

  /* 分组顺序：两端共用，避免「桌面和手机顺序不一样」带来的认知成本 */
  var GROUPS = ['投递准备', '编辑', '导出', '飞书同步', '页面', '视图'];

  /* 每项字段：
       id    —— 桌面端元素 id（可选；有代码按 id 更新文案 / 禁用态时才需要）
       mid   —— 手机端元素 id（可选；同一段代码若只认一个 id，就让它认桌面那个）
       label —— 按钮文案（两端统一）
       title —— 桌面端 title 提示（手机没有 hover，不渲染）
       run   —— 点击执行的表达式
       d / m —— 该端所属分组；null 表示该端不展示（如「收起编辑面板」只属于桌面布局）
       kind  —— 'field' 表示不是一个按钮（文件名输入框）
       innerD / innerM —— 按钮内部 HTML 覆盖（夜间模式两端需要不同的 label id） */
  var ACTIONS = [
    /* 投递准备 */
    {
      id: 'auditBtn', label: '投递体检',
      title: '投递体检：页数 / 完整性 / 量化 / ATS 检查',
      run: 'ResumeAudit.toggle()', d: '投递准备', m: '投递准备'
    },
    {
      id: 'jdBtn', label: 'JD 匹配分析',
      title: 'JD 匹配分析：粘贴岗位 JD，列出已覆盖 / 弱覆盖 / 缺失关键词',
      run: 'ResumeJd.toggle()', d: '投递准备', m: '投递准备'
    },

    /* 编辑 */
    {
      id: 'undoBtn', mid: 'undoBtnMobile', label: '撤销', title: '撤销 (Ctrl/Cmd+Z)',
      run: 'ResumeEditor.undo()', d: '编辑', m: '编辑'
    },
    {
      id: 'redoBtn', mid: 'redoBtnMobile', label: '重做', title: '重做 (Ctrl/Cmd+Shift+Z / Ctrl+Y)',
      run: 'ResumeEditor.redo()', d: '编辑', m: '编辑'
    },

    /* 导出 */
    {
      kind: 'field', id: 'filenameBase', mid: 'filenameBaseMobile',
      d: '导出', m: '导出',
      innerD: '<span class="filename-wrap" title="导出文件的默认文件名前缀">'
        + '<label for="filenameBase">文件名</label>'
        + '<input type="text" id="filenameBase" placeholder="姓名_简历" onchange="ResumeEditor.setFileNameBase(this.value)">'
        + '</span>',
      innerM: '<span class="filename-wrap" title="导出文件的默认文件名前缀">'
        + '<label for="filenameBaseMobile">文件名</label>'
        + '<input type="text" id="filenameBaseMobile" placeholder="姓名_简历" onchange="ResumeEditor.setFileNameBase(this.value)">'
        + '</span>'
    },
    {
      id: 'pdfSilentBtn', mid: 'pdfSilentBtnMobile', label: 'PDF（文字可选中 · 静默）',
      title: '经本地服务调用本机浏览器静默生成「可选中文字」的 PDF，不弹打印对话框（需 npm start 打开）',
      run: 'ResumeExport.exportPdfSilent()', d: '导出', m: '导出'
    },
    {
      label: '打印 / 另存为 PDF', title: '走浏览器原生打印 / 另存为 PDF（快捷键 Ctrl/Cmd+P）',
      run: 'window.print()', d: '导出', m: '导出'
    },
    {
      label: '导出 Word（.docx）', title: '导出真正的 Word 文档（.docx），HR 与 ATS 通用',
      run: 'ResumeExport.exportDocx()', d: '导出', m: '导出'
    },
    {
      label: '导出纯文本（.txt）', title: '导出纯文本，投递表单 / ATS 粘贴用',
      run: 'ResumeExport.exportTxt()', d: '导出', m: '导出'
    },
    {
      label: '导出 Markdown（.md）', title: '导出 Markdown，便于放到 GitHub / 博客 / 在线简历',
      run: 'ResumeExport.exportMarkdown()', d: '导出', m: '导出'
    },
    {
      label: 'PDF 预览 / 下载（图片版）', title: 'html2canvas 截图拼合，生成图片版 PDF 预览',
      run: 'ResumeEditor.exportPDF()', d: '导出', m: '导出'
    },
    {
      label: '导出（图片版）', title: '导出页面完整长图，与预览完全一致',
      run: 'ResumeEditor.exportLongImage()', d: '导出', m: '导出'
    },
    {
      label: '导出单文件 HTML', title: '导出仅含简历本身的独立 HTML 文件，可直接双击打开',
      run: 'ResumeEditor.exportSingleFileHTML()', d: '导出', m: '导出'
    },
    {
      label: '导出 JSON Resume', title: '导出为 JSON Resume 标准格式，可被 resume-cli / Reactive Resume 等生态工具消费',
      run: 'ResumeEditor.exportJSONResume()', d: '导出', m: '导出'
    },

    /* 飞书同步（此前只有手机有，桌面完全够不着） */
    {
      id: 'feishuReportBtn', mid: 'feishuReportBtnMobile', label: '上报到飞书',
      title: '把当前简历推送到飞书（文档 + 云盘双写）',
      run: 'ResumeEditor.reportToFeishu()', d: '飞书同步', m: '飞书同步'
    },
    {
      id: 'feishuPullBtn', mid: 'feishuPullBtnMobile', label: '拉取最新',
      title: '从飞书拉回最新简历数据',
      run: 'ResumeEditor.pullFromFeishu()', d: '飞书同步', m: '飞书同步'
    },
    {
      label: '历史版本', title: '查看飞书上的历史版本并可恢复',
      run: "ResumeRouter.navigate('/history')", d: '飞书同步', m: '飞书同步'
    },
    {
      label: '消息通知', title: '自动同步告警等消息',
      run: 'ResumeNotifier.togglePanel()', d: '飞书同步', m: '飞书同步'
    },

    /* 页面（此前只有手机有，桌面只能靠改 hash 进） */
    {
      label: '简历库（多份管理）', title: '多份简历的管理页',
      run: "ResumeRouter.navigate('/library')", d: '页面', m: '页面'
    },
    {
      label: '投递追踪', title: '记录投递岗位与进展',
      run: "ResumeRouter.navigate('/tracker')", d: '页面', m: '页面'
    },
    {
      label: '设置（飞书 / 外观 / 数据备份）', title: '飞书配置、外观与数据',
      run: "ResumeRouter.navigate('/settings')", d: '页面', m: '页面'
    },

    /* 视图 */
    {
      id: 'guideBtn', mid: 'guideBtnMobile', label: '显示分页线', title: '显示 / 隐藏 A4 分页参考线',
      run: 'ResumeEditor.toggleGuides()', d: '视图', m: '视图'
    },
    {
      /* 手机没有「右侧编辑面板」这套布局（走底部 Tab 切换），只在桌面出现 */
      id: 'paneToggleBtn', label: '收起编辑面板',
      title: '收起/展开右侧编辑面板 (Ctrl/Cmd+B)',
      run: 'ResumeEditor.toggleEditorPane()', d: '视图', m: null
    },
    {
      id: 'themeBtn', label: '夜间模式', title: '切换夜间模式',
      run: 'ResumeEditor.toggleTheme()', d: '视图', m: '视图',
      /* 两端各有一个 label 节点：theme.js 会分别写入「日间模式 / 夜间模式」 */
      innerD: '<span id="themeBtnLabel">夜间模式</span>',
      innerM: '<span id="themeBtnLabelMobile">夜间模式</span>'
    }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function groupOf(a, surface) { return surface === 'mobile' ? a.m : a.d; }
  function idOf(a, surface) { return surface === 'mobile' ? (a.mid || '') : (a.id || ''); }

  function itemHtml(a, surface) {
    if (a.kind === 'field') {
      return surface === 'mobile' ? (a.innerM || a.innerD || '') : (a.innerD || '');
    }
    var id = idOf(a, surface);
    var inner = (surface === 'mobile' ? (a.innerM || '') : (a.innerD || '')) || esc(a.label);
    return '<button'
      + (id ? ' id="' + esc(id) + '"' : '')
      + ' onclick="' + esc(a.run) + '"'
      /* title 只在桌面渲染：手机没有 hover，加了也看不见，还会在长按时被读出来 */
      + (surface === 'desktop' && a.title ? ' title="' + esc(a.title) + '"' : '')
      + '>' + inner + '</button>';
  }

  /* 纯函数：算出某一端的完整 HTML（分组标题 + 按钮） */
  function htmlFor(surface) {
    var cls = surface === 'mobile' ? 'sync-group' : 'side-group';
    var out = '';
    GROUPS.forEach(function (g) {
      var items = ACTIONS.filter(function (a) { return groupOf(a, surface) === g; });
      if (!items.length) return;
      out += '<div class="' + cls + '">' + esc(g) + '</div>';
      items.forEach(function (a) { out += itemHtml(a, surface); });
    });
    return out;
  }

  function render() {
    if (typeof document === 'undefined') return false;
    var d = document.getElementById('toolsMenuBody');
    var m = document.getElementById('syncMenuBody');
    if (d) d.innerHTML = htmlFor('desktop');
    if (m) m.innerHTML = htmlFor('mobile');
    return true;
  }

  global.ResumeMenu = {
    ACTIONS: ACTIONS,
    GROUPS: GROUPS,
    htmlFor: htmlFor,
    itemHtml: itemHtml,
    render: render
  };

  /* 脚本位于 body 末尾，两个容器此时都已存在 —— 立即渲染一次，
     让后续模块（theme.js 的 refreshUI、pane-mobile 的 setPaneCollapsed 等）
     按 id 找按钮时一定能找到。 */
  try { render(); } catch (e) { /* 渲染失败也不该阻断后续脚本 */ }
})(typeof window !== 'undefined' ? window : this);
