/* =============================================================
 * N4 F1 暗色模式：js/theme.js 纯逻辑用例
 * -------------------------------------------------------------
 * 在 test/run.js 自建的隔离 vm 沙箱里加载 theme.js（浏览器 IIFE，
 * 自带 document/localStorage/matchMedia 桩），验证「界面主题三态 +
 * 纸张跟随夜间 + 持久化 + 系统跟随 + 导出白纸守卫」这套核心逻辑。
 *
 * 失效面（为什么必须测）：theme.js 此前零自动化覆盖，任何一次重构
 * 把「auto 解析」「纸张跟随例外」「导出强制白纸」改坏，界面上完全看不出，
 * 直到用户导出 PDF 才发现纸张发黑。
 * ============================================================= */
module.exports = [
  {
    name: '默认模式为 auto（跟随系统）',
    fn(ctx) {
      ctx.store.clear();
      if (ctx.ResumeTheme.setMode) ctx.ResumeTheme.setMode('auto');
      ctx.assert(ctx.ResumeTheme.getMode() === 'auto', 'getMode() === "auto"');
      ctx.assert(ctx.ResumeTheme.paperFollows() === true, '纸张跟随夜间默认开启');
    }
  },
  {
    name: 'setMode("dark") 落地为夜间',
    fn(ctx) {
      ctx.store.clear();
      ctx.ResumeTheme.setMode('dark');
      ctx.assert(ctx.ResumeTheme.getMode() === 'dark', 'getMode() === "dark"');
      ctx.assert(ctx.ResumeTheme.isDark() === true, 'isDark() === true');
      ctx.assert(ctx.ResumeTheme.resolvedTheme() === 'dark', 'resolvedTheme() === "dark"');
    }
  },
  {
    name: 'setMode("light") 落地为日间',
    fn(ctx) {
      ctx.store.clear();
      ctx.ResumeTheme.setMode('light');
      ctx.assert(ctx.ResumeTheme.isDark() === false, 'isDark() === false');
    }
  },
  {
    name: '跟随系统：auto + 系统深色 → 夜间，系统浅色 → 日间',
    fn(ctx) {
      ctx.store.clear();
      ctx.ResumeTheme.setMode('auto');
      ctx.mq.setDark(true);
      ctx.assert(ctx.ResumeTheme.resolvedTheme() === 'dark', '系统深色时 resolvedTheme === "dark"');
      ctx.mq.setDark(false);
      ctx.assert(ctx.ResumeTheme.resolvedTheme() === 'light', '系统浅色时 resolvedTheme === "light"');
    }
  },
  {
    name: '非法模式被归一为 auto',
    fn(ctx) {
      ctx.store.clear();
      ctx.ResumeTheme.setMode('not-a-mode');
      ctx.assert(ctx.ResumeTheme.getMode() === 'auto', 'getMode() === "auto"');
    }
  },
  {
    name: '模式持久化到 localStorage',
    fn(ctx) {
      ctx.store.clear();
      ctx.ResumeTheme.setMode('dark');
      ctx.assert(ctx.store.get('resume-theme-mode') === 'dark', 'resume-theme-mode === "dark"');
    }
  },
  {
    name: '纸张跟随夜间可关闭并持久化',
    fn(ctx) {
      ctx.store.clear();
      ctx.ResumeTheme.setMode('dark');
      ctx.ResumeTheme.setPaperFollows(false);
      ctx.assert(ctx.ResumeTheme.paperFollows() === false, 'paperFollows() === false');
      ctx.assert(ctx.store.get('resume-theme-paper') === '0', 'resume-theme-paper === "0"');
      ctx.ResumeTheme.setPaperFollows(true);
      ctx.assert(ctx.ResumeTheme.paperFollows() === true, '重新开启后 paperFollows() === true');
    }
  },
  {
    name: 'effectivePaper：夜间+跟随 → dark；夜间+关闭 → light；日间+跟随 → light',
    fn(ctx) {
      ctx.store.clear();
      ctx.mq.setDark(false);
      ctx.ResumeTheme.setMode('dark');
      ctx.ResumeTheme.setPaperFollows(true);
      ctx.assert(ctx.ResumeTheme.effectivePaper() === 'dark', '夜间+跟随 → "dark"');
      ctx.ResumeTheme.setPaperFollows(false);
      ctx.assert(ctx.ResumeTheme.effectivePaper() === 'light', '夜间+关闭 → "light"');
      ctx.ResumeTheme.setMode('light');
      ctx.ResumeTheme.setPaperFollows(true);
      ctx.assert(ctx.ResumeTheme.effectivePaper() === 'light', '日间+跟随 → "light"');
    }
  },
  {
    name: '导出守卫：beginExport 强制白纸，endExport 恢复',
    fn(ctx) {
      ctx.store.clear();
      ctx.mq.setDark(false);
      ctx.ResumeTheme.setMode('dark');
      ctx.ResumeTheme.setPaperFollows(true);
      ctx.ResumeTheme.beginExport();
      ctx.assert(ctx.ResumeTheme.effectivePaper() === 'light', '导出期间纸张强制白纸');
      ctx.ResumeTheme.endExport();
      ctx.assert(ctx.ResumeTheme.effectivePaper() === 'dark', '导出结束后恢复夜间纸张');
    }
  },
  {
    name: 'toggleTheme：在 light/dark 之间翻转',
    fn(ctx) {
      ctx.store.clear();
      ctx.ResumeTheme.setMode('light');
      ctx.ResumeTheme.toggleTheme();
      ctx.assert(ctx.ResumeTheme.isDark() === true, '从 light 翻转后为 dark');
      ctx.ResumeTheme.toggleTheme();
      ctx.assert(ctx.ResumeTheme.isDark() === false, '再次翻转为 light');
    }
  },
  {
    name: 'DOM 落地：data-theme 随模式增删',
    fn(ctx) {
      ctx.store.clear();
      ctx.ResumeTheme.setMode('dark');
      ctx.assert(ctx.attrs.get('data-theme') === 'dark', 'setMode(dark) 后 <html data-theme="dark">');
      ctx.ResumeTheme.setMode('light');
      ctx.assert(ctx.attrs.has('data-theme') === false, 'setMode(light) 后移除 data-theme');
    }
  },
  {
    name: 'DOM 落地：data-paper 随纸张跟随增删',
    fn(ctx) {
      ctx.store.clear();
      ctx.mq.setDark(false);
      ctx.ResumeTheme.setMode('dark');
      ctx.ResumeTheme.setPaperFollows(true);
      ctx.assert(ctx.attrs.get('data-paper') === 'dark', '跟随开启时 <html data-paper="dark">');
      ctx.ResumeTheme.setPaperFollows(false);
      ctx.assert(ctx.attrs.has('data-paper') === false, '关闭跟随后移除 data-paper');
    }
  }
];
