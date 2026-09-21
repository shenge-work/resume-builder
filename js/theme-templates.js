/* =============================================================
 * 主题模板系统（N1）—— 简历视觉主题 Schema + 内置主题库
 * -------------------------------------------------------------
 * 职责边界（与 js/theme.js 的「日间/夜间」外壳主题严格区分）：
 *   · js/theme.js  管的是「编辑器外壳」明暗（--ui-* + 纸张是否跟随夜间）；
 *   · 本文件管的是「简历纸张的视觉风格」——配色 / 字体 / 间距 / 纸张 / 板块，
 *     即 Reactive Resume 的 Structured Style Rules 等价物。
 *
 * 设计要点（守住工程护栏）：
 *   · 默认主题（classic）的值 = 当前 app 出厂默认（defaultFonts / defaultSpacing /
 *     样式表里 --paper-* 的浅色值），所以从「无主题」切到 classic 必须像素级一致；
 *   · 渲染层本就读取 currentFonts / currentSpacing / data.pageMargins 等全局态，
 *     因此「应用主题」= 把主题的 fonts/spacing/paper 物化进这些既有全局态，
 *     不重写渲染层的数据读取（避免破坏性改动，天然保证默认主题一致）；
 *   · 颜色是渲染层尚未持久化的维度：主题颜色通过把 --paper-* 写到 .resume 元素
 *     的内联 style 实现；classic 且无颜色微调时不写，交给样式表 / 夜间纸张。
 *   · 用户微调（overrides）随简历持久化：字体/间距微调直接落在 currentFonts/
 *     currentSpacing（已随 payload 落盘）；颜色/纸张微调落在 data.theme.overrides。
 *
 * 纯逻辑、零 DOM 依赖（DOM 应用发生在 renderPreview，已做缺省降级）。
 * 挂在 window.ResumeThemeTemplates。必须在 js/data.js 之后、js/app.js 之前加载。
 * ============================================================= */
(function (global) {
  'use strict';

  /* --paper-* 变量名（与 css/style.css 浅色 :root 定义一一对应）。
     主题只对其中一部分给值（accent 类），其余继承样式表默认。 */
  var PAPER_KEYS = [
    'bg', 'text', 'strong', 'sub', 'meta', 'mid', 'weak', 'rule', 'ruleSoft',
    'chipBg', 'chipText', 'cardBg', 'panel', 'panelBar', 'labelBg',
    'tagBg', 'tagBorder', 'tagText', 'arrow', 'kwBg', 'kwText'
  ];

  /* 主题可着色的「强调色」键（其余 --paper-* 维持样式表默认，避免主题过冲） */
  var TINT_KEYS = ['rule', 'strong', 'kwText', 'panelBar', 'chipText', 'tagText', 'arrow'];

  /* 把 defaultFonts 的某一项（含 label/desc/min/max）与一个可选 override.val 合并 */
  function fontObj(def, val) {
    return {
      label: def.label, desc: def.desc, min: def.min, max: def.max,
      val: (val == null ? def.val : val)
    };
  }

  /* 由主题的 fonts 片段（可缺省）生成完整字体集合（缺失项回退 defaultFonts） */
  function resolveFonts(themeFonts) {
    var out = {};
    Object.keys(defaultFonts).forEach(function (k) {
      var def = defaultFonts[k];
      var t = (themeFonts && themeFonts[k]) || {};
      out[k] = fontObj(def, t.val);
    });
    return out;
  }

  /* 由主题的 spacing 片段生成完整间距集合（缺失回退 defaultSpacing） */
  function resolveSpacing(themeSpacing) {
    var out = {};
    Object.keys(defaultSpacing).forEach(function (k) {
      var def = defaultSpacing[k];
      var t = (themeSpacing && themeSpacing[k]) || {};
      out[k] = { label: def.label, mt: (t.mt != null ? t.mt : def.mt), mb: (t.mb != null ? t.mb : def.mb) };
    });
    return out;
  }

  var DEFAULT_MARGIN = { top: 14, right: 14, bottom: 14, left: 14 };

  /* ============ 内置主题库（F1：3–5 套）============
     覆盖 Resume Matcher 的四种模板形态 + 极简；默认 classic 必须 = 当前出厂外观。
     color 仅给「强调色」子集；paper/margin 给尺寸；fonts/spacing 给差异值。
     layout 字段预留双栏（双栏布局为后续增强，v1 仍单栏渲染，schema 已就绪）。 */
  var THEMES = [
    {
      id: 'classic', name: '经典', desc: '中性单栏，出厂默认外观', layout: 'single',
      fonts: {}, spacing: {},
      paper: { size: 'A4', margin: { top: 14, right: 14, bottom: 14, left: 14 } },
      color: {}
    },
    {
      id: 'modern', name: '现代蓝', desc: '蓝色主调，姓名更大、间距更紧凑', layout: 'single',
      fonts: { name: { val: 32 }, base: { val: 12 }, section: { val: 15 }, job: { val: 14 } },
      spacing: { section: { mt: 8, mb: 5 }, job: { mt: 0, mb: 7 }, project: { mt: 6, mb: 7 } },
      paper: { size: 'A4', margin: { top: 16, right: 16, bottom: 16, left: 16 } },
      color: { rule: '#2563eb', strong: '#1d4ed8', kwText: '#2563eb', panelBar: '#2563eb', chipText: '#2563eb', tagText: '#1d4ed8', arrow: '#2563eb' }
    },
    {
      id: 'elegant', name: '雅致墨绿', desc: '墨绿主调，沉稳优雅', layout: 'single',
      fonts: { name: { val: 30 }, base: { val: 11.5 } },
      spacing: { section: { mt: 12, mb: 7 }, job: { mt: 0, mb: 9 } },
      paper: { size: 'A4', margin: { top: 15, right: 15, bottom: 15, left: 15 } },
      color: { rule: '#0f766e', strong: '#115e59', kwText: '#0f766e', panelBar: '#0f766e', chipText: '#0f766e', tagText: '#115e59', arrow: '#0f766e' }
    },
    {
      id: 'warm', name: '暖橙', desc: '暖橙主调，亲和明快', layout: 'single',
      fonts: { name: { val: 30 }, base: { val: 12 } },
      spacing: { section: { mt: 10, mb: 6 }, job: { mt: 0, mb: 8 } },
      paper: { size: 'A4', margin: { top: 14, right: 14, bottom: 14, left: 14 } },
      color: { rule: '#c2410c', strong: '#9a3412', kwText: '#c2410c', panelBar: '#c2410c', chipText: '#9a3412', tagText: '#9a3412', arrow: '#c2410c' }
    },
    {
      id: 'minimal', name: '极简', desc: '大留白，灰阶克制', layout: 'single',
      fonts: { name: { val: 26 }, base: { val: 11 }, section: { val: 14 } },
      spacing: { section: { mt: 16, mb: 10 }, job: { mt: 0, mb: 10 }, project: { mt: 8, mb: 10 } },
      paper: { size: 'A4', margin: { top: 18, right: 18, bottom: 18, left: 18 } },
      color: { rule: '#9aa0a6', strong: '#333333', kwText: '#555555', panelBar: '#888888', chipText: '#666666', tagText: '#555555', arrow: '#aaaaaa' }
    }
  ];

  var BY_ID = {};
  THEMES.forEach(function (t) { BY_ID[t.id] = t; });

  function getTheme(id) { return BY_ID[id] || BY_ID.classic; }
  function allThemes() { return THEMES.slice(); }
  function defaultThemeId() { return 'classic'; }

  /* 规范化 data.theme：缺省 / 非法时回退 classic + 空 overrides（不抛错、不污染） */
  function ensureTheme(data) {
    if (!data || typeof data !== 'object') return null;
    if (!data.theme || typeof data.theme !== 'object') data.theme = { id: 'classic', overrides: {} };
    if (!data.theme.id || !BY_ID[data.theme.id]) data.theme.id = 'classic';
    if (!data.theme.overrides || typeof data.theme.overrides !== 'object') data.theme.overrides = {};
    return data.theme;
  }

  /* 解析生效调色板（主题 color + overrides.color 合并）；
     当 classic 且无任何颜色微调时返回 null —— 交给样式表 / 夜间纸张，保证默认一致。 */
  function resolvePalette(data) {
    var th = ensureTheme(data);
    if (!th) return null;
    var base = getTheme(th.id).color || {};
    var ov = th.overrides.color || {};
    var anyOv = Object.keys(ov).length > 0;
    if (th.id === 'classic' && !anyOv) return null;   // 经典 + 无微调 → 不写内联变量
    var merged = {};
    PAPER_KEYS.forEach(function (k) {
      if (ov[k] != null) merged[k] = ov[k];
      else if (base[k] != null) merged[k] = base[k];
    });
    return merged;
  }

  /* 把生效调色板写到 DOM 元素（.resume）的内联 style；palette 为 null 时清除，
     让夜间纸张 / 样式表默认生效。缺 document / style 时静默跳过（测试桩安全）。 */
  function applyPaletteToEl(el, data) {
    if (!el || !el.style || typeof el.style.setProperty !== 'function') return;
    var pal = resolvePalette(data);
    if (!pal) {
      PAPER_KEYS.forEach(function (k) { try { el.style.removeProperty('--paper-' + k); } catch (e) {} });
      return;
    }
    PAPER_KEYS.forEach(function (k) {
      if (pal[k] != null) { try { el.style.setProperty('--paper-' + k, pal[k]); } catch (e) {} }
    });
  }

  /* 纸张尺寸：A4 / Letter（仅返回尺寸提示，实际渲染仍按 A4 像素；Letter 后续增强） */
  function paperSize(data) {
    var th = ensureTheme(data);
    var p = getTheme(th.id).paper || {};
    return p.size || 'A4';
  }

  global.ResumeThemeTemplates = {
    PAPER_KEYS: PAPER_KEYS,
    TINT_KEYS: TINT_KEYS,
    DEFAULT_MARGIN: DEFAULT_MARGIN,
    getTheme: getTheme,
    allThemes: allThemes,
    defaultThemeId: defaultThemeId,
    ensureTheme: ensureTheme,
    resolveFonts: resolveFonts,
    resolveSpacing: resolveSpacing,
    resolvePalette: resolvePalette,
    applyPaletteToEl: applyPaletteToEl,
    paperSize: paperSize
  };
})(typeof window !== 'undefined' ? window : globalThis);
