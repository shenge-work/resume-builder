/* =============================================================
 * 简历编辑器 - 投递体检查询（页数 / 完整性 / 量化 / ATS）
 * -------------------------------------------------------------
 * 纯规则、纯前端、零依赖、不联网（AI 方案已暂停，这里用规则顶上）。
 * 只暴露 window.ResumeAudit；数据只读：经 window.ResumeEditor.getData()
 * 取当前数据，绝不修改数据、不触发保存、不进撤销栈。
 *
 * 接口：
 *   ResumeAudit.run(payload?)  → {checks:[{id,level,title,detail,hint,anchor}], stats:{...}}
 *   ResumeAudit.render(el?)    → 把最近一次结果画进容器（默认 #auditBody）
 *   ResumeAudit.toggle()       → 展开/收起体检面板（展开时自动重新体检）
 * ============================================================= */
(function (global) {
  'use strict';

  const A4_H_PX = 297 * 3.7795275591;   // A4 高（96dpi）
  const MM_PX = 3.7795275591;
  const LEVELS = ['error', 'warn', 'info'];
  const LEVEL_LABEL = { error: '必须处理', warn: '建议修改', info: '可以更好' };

  /* ---------- 取值兼容：纯字符串 / {text} 对象 ---------- */
  function T(x) {
    if (x && typeof x === 'object' && 'text' in x) return x.text == null ? '' : String(x.text);
    return x == null ? '' : String(x);
  }
  function trim(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function num(v, d) { const n = Number(v); return isNaN(n) ? d : n; }
  function plain(s) { return trim(String(s == null ? '' : s).replace(/\*\*/g, '')); }

  /* ---------- 收集全部文本条目（供统计与多项检查复用） ---------- */
  function collectTexts(data) {
    const out = [];
    const push = (text, sec, kind, field) => {
      const t = plain(text);
      if (t) out.push({ text: t, raw: String(text == null ? '' : text), sec: sec || '', kind: kind || '', field: field || '' });
    };
    (data && data.sections || []).forEach(sec => {
      if (!sec) return;
      const st = trim(sec.title);
      const type = sec.type;
      if (type === 'advantages') {
        (sec.items || []).forEach(it => {
          if (!it) return;
          push(it.label, st, 'advantages', 'label');
          push(T(it.text), st, 'advantages', 'text');
        });
      } else if (type === 'career') {
        (sec.items || []).forEach(job => {
          if (!job) return;
          push(T(job.company), st, 'career', 'company');
          push(T(job.role), st, 'career', 'role');
          push(T(job.summary), st, 'career', 'summary');
          (job.projects || []).forEach(pr => {
            if (!pr) return;
            push(T(pr.name), st, 'project', 'name');
            push(T(pr.stack), st, 'project', 'stack');
            push(T(pr.desc), st, 'project', 'desc');
            (pr.results || []).forEach(r => push(T(r), st, 'project', 'results'));
          });
        });
      } else if (type === 'skills') {
        (sec.groups || []).forEach(g => {
          if (!g) return;
          push(T(g.name), st, 'skills', 'name');
          (g.items || []).forEach(x => push(T(x), st, 'skills', 'items'));
        });
      } else if (type === 'projects') {
        (sec.items || []).forEach(pr => {
          if (!pr) return;
          push(T(pr.name), st, 'projects', 'name');
          push(T(pr.stack), st, 'projects', 'stack');
          push(T(pr.desc), st, 'projects', 'desc');
          (pr.results || []).forEach(r => push(T(r), st, 'projects', 'results'));
        });
      } else if (type === 'highlights') {
        (sec.cards || []).forEach(c => push(T(c), st, 'highlights', 'cards'));
        (sec.tags || []).forEach(x => push(T(x), st, 'highlights', 'tags'));
      } else if (type === 'growth') {
        (sec.phases || []).forEach(ph => {
          if (!ph) return;
          push(ph.label, st, 'growth', 'label');
          push(T(ph.date), st, 'growth', 'date');
          push(T(ph.title), st, 'growth', 'title');
          push(T(ph.desc), st, 'growth', 'desc');
        });
      }
    });
    return out;
  }

  /* ---------- 页数：优先用真实 DOM 高度，退化为按字数粗估 ---------- */
  function estimatePages(data) {
    const m = (data && data.pageMargins) || { top: 14, bottom: 14 };
    const usable = Math.max(200, A4_H_PX - (num(m.top, 14) + num(m.bottom, 14)) * MM_PX);
    try {
      if (typeof document !== 'undefined' && document.querySelector) {
        const el = document.querySelector('#preview .resume');
        if (el && el.offsetHeight > 0) return { pages: Math.max(1, Math.ceil((el.offsetHeight - 2) / usable)), by: 'dom' };
      }
    } catch (e) { /* 无 DOM 时走估算 */ }
    const chars = collectTexts(data).reduce((n, x) => n + x.text.length, 0);
    return { pages: Math.max(1, Math.ceil(chars / 900)), by: 'estimate' };
  }

  /* ---------- 各检查项 ---------- */
  function checkRequired(data, add) {
    if (!trim(data.name)) {
      add('required-name', 'error', '姓名未填写', '简历抬头为空，投递时无法识别是谁的简历。', '在右侧「基础信息 → 姓名」填写姓名。', '');
    }
    const contacts = (data.contact || []).map(c => plain(T(c))).filter(Boolean);
    if (!contacts.length) {
      add('required-contact', 'error', '联系方式为空', '没有任何电话 / 邮箱等联系方式，HR 无法联系你。', '在「基础信息 → 联系方式」至少填手机号与邮箱。', '');
    } else {
      const joined = contacts.join(' ');
      const hasPhone = /(?:1[3-9]\d{9})|(?:\+?\d[\d\s-]{7,})/.test(joined);
      const hasMail = /[\w.+-]+@[\w-]+\.[\w.]+/.test(joined);
      if (!hasPhone || !hasMail) {
        add('required-contact-type', 'warn', '联系方式可能不完整',
          '当前联系方式：' + contacts.join(' / ') + '。', '建议同时给出手机号与邮箱，并确认格式可被识别。', contacts[0].slice(0, 12));
      }
    }
    const emptySec = [];
    (data.sections || []).forEach(sec => {
      if (!sec) return;
      const title = trim(sec.title);
      const hasContent = collectSectionContent(sec);
      if (!title && hasContent) emptySec.push('（未命名板块）');
      else if (title && !hasContent) emptySec.push('「' + title + '」');
    });
    if (emptySec.length) {
      add('required-empty-section', 'warn', '存在空板块',
        emptySec.join('、') + ' 没有实际内容（或标题为空）。', '补内容或删除该板块：空板块会占掉版面并显得准备不足。', '');
    }
  }

  function collectSectionContent(sec) {
    if (!sec) return '';
    const type = sec.type;
    if (type === 'advantages') return (sec.items || []).map(i => i && (trim(i.label) + trim(T(i.text)))).join('');
    if (type === 'career') return (sec.items || []).map(j => j && [trim(T(j.company)), trim(T(j.role)), trim(T(j.date)), trim(T(j.summary))].join('')).join('');
    if (type === 'skills') return (sec.groups || []).map(g => g && (trim(T(g.name)) + (g.items || []).map(x => trim(T(x))).join(''))).join('');
    if (type === 'projects') return (sec.items || []).map(p => p && [trim(T(p.name)), trim(T(p.stack)), trim(T(p.desc)), (p.results || []).map(r => trim(T(r))).join('')].join('')).join('');
    if (type === 'highlights') return (sec.cards || []).map(c => trim(T(c))).join('') + (sec.tags || []).map(t => trim(T(t))).join('');
    if (type === 'growth') return (sec.phases || []).map(p => p && [trim(p.label), trim(T(p.date)), trim(T(p.title)), trim(T(p.desc))].join('')).join('');
    return (sec.items || []).map(i => trim(T(i))).join('');
  }

  function checkPageCount(data, add) {
    const est = estimatePages(data);
    if (est.pages > 2) {
      add('pages-over', 'warn', '预计 ' + est.pages + ' 页，超过 2 页',
        '当前内容按 A4 排下来约 ' + est.pages + ' 页' + (est.by === 'estimate' ? '（按字数粗估）' : '') + '，绝大多数岗位 1–2 页最合适。',
        '优先压缩职责罗列、合并早期经历、删掉与目标岗位无关的内容，而不是靠调小字号。', '');
    } else if (est.pages === 1) {
      add('pages-thin', 'info', '预计 1 页',
        '内容刚好一页，如果投递的是 5 年经验以上的岗位，可以补充量化成果让内容更饱满。',
        '考虑给重点项目补充「做法 + 结果（数字）」的细节。', '');
    }
  }

  function firstYear(s) {
    const m = String(s || '').match(/(19|20)\d{2}/);
    return m ? parseInt(m[0], 10) : null;
  }

  function checkDateOrder(data, add) {
    (data.sections || []).forEach(sec => {
      if (!sec || sec.type !== 'career') return;
      const years = (sec.items || []).map(j => (j ? firstYear(T(j.date)) : null));
      for (let i = 1; i < years.length; i++) {
        const prev = years[i - 1], cur = years[i];
        if (prev == null || cur == null) continue;
        if (cur > prev) {
          const pj = sec.items[i - 1], cj = sec.items[i];
          add('date-order-' + i, 'warn', '经历顺序可能没有倒序',
            '「' + plain(T(cj.date)) + ' · ' + (trim(T(cj.company)) || '未填公司') + '」排在「' +
            plain(T(pj.date)) + ' · ' + (trim(T(pj.company)) || '未填公司') + '」后面，但起始时间更晚。',
            '招聘方习惯看倒序，建议把最近的一段放到最前面（可直接拖拽排序）。', trim(T(cj.company)).slice(0, 10));
        }
      }
    });
  }

  function checkQuantifyAndLength(data, add) {
    const texts = collectTexts(data);
    const longKinds = { summary: 1, desc: 1, results: 1, text: 1 };
    const shortWarn = [];
    const longWarn = [];
    const noNumber = [];
    texts.forEach(t => {
      const isBody = longKinds[t.field] === 1;
      if (!isBody) return;
      if (t.text.length >= 20 && !/[0-9]/.test(t.text)) {
        noNumber.push('「' + t.sec + '」' + t.text.slice(0, 18) + '…');
      }
      if (t.text.length < 15) shortWarn.push('「' + t.sec + '」' + t.text);
      else if (t.text.length > 300) longWarn.push('「' + t.sec + '」' + t.text.slice(0, 20) + '…（' + t.text.length + ' 字）');
    });
    if (noNumber.length) {
      add('quantify-missing', 'info', '有 ' + noNumber.length + ' 处描述缺少量化结果',
        noNumber.slice(0, 4).join('；') + (noNumber.length > 4 ? ' 等' : ''),
        '加入规模 / 提升幅度 / 耗时等数字（如「响应耗时降低 40%」「服务 200 万用户」）会明显更有说服力。', '');
    }
    if (shortWarn.length) {
      add('length-short', 'info', '有 ' + shortWarn.length + ' 条描述过于单薄',
        shortWarn.slice(0, 3).join('；') + (shortWarn.length > 3 ? ' 等' : ''),
        '建议写成「做了什么 + 怎么做的 + 结果如何」，至少 20 字以上。', '');
    }
    if (longWarn.length) {
      add('length-long', 'warn', '有 ' + longWarn.length + ' 条描述过长',
        longWarn.slice(0, 3).join('；') + (longWarn.length > 3 ? ' 等' : ''),
        '单条超过 300 字会拉低可读性，也容易被 ATS 截断，建议拆成 2–3 条或精简为要点。', '');
    }
  }

  function checkPlaceholders(data, add) {
    const hit = [];
    collectTexts(data).forEach(t => {
      if (/待补充|待完善|待填|TODO|XXX|xxx|某某|示例文本/.test(t.text)) hit.push('「' + t.sec + '」' + t.text.slice(0, 18));
    });
    if (hit.length) {
      add('placeholder', 'warn', '发现 ' + hit.length + ' 处占位文案',
        hit.slice(0, 4).join('；') + (hit.length > 4 ? ' 等' : ''),
        '投递前务必替换成真实内容，占位文案被看到会直接扣分。', '');
    }
  }

  function checkPii(data, add) {
    const all = collectTexts(data);
    const idcard = all.filter(t => /\b\d{17}[\dXx]\b/.test(t.text));
    const sensitive = all.filter(t => /身份证号|身份证|出生日期|生日|民族|政治面貌|婚姻状况|户籍/.test(t.text));
    if (idcard.length) {
      add('pii-idcard', 'info', '疑似出现身份证号',
        '「' + idcard[0].sec + '」' + idcard[0].text.slice(0, 24),
        '国内简历通常不需要身份证号，且属于敏感信息，建议删除。', '');
    }
    if (sensitive.length) {
      add('pii-sensitive', 'info', '出现通常不必写的敏感信息',
        '命中：' + sensitive.slice(0, 3).map(t => '「' + t.sec + '」' + t.text.slice(0, 14)).join('；'),
        '民族 / 政治面貌 / 婚姻状况等在国内技术岗简历中通常不必写，删掉可省版面。', '');
    }
  }

  function checkAts(data, add) {
    try {
      if (typeof document !== 'undefined' && document.querySelectorAll) {
        const imgs = document.querySelectorAll('#preview .resume img');
        if (imgs && imgs.length) {
          add('ats-image', 'info', '简历中含 ' + imgs.length + ' 张图片（如公司 Logo）',
            '部分 ATS 系统不解析图片内容，图片过多也可能影响解析与体积。',
            'Logo 仅作装饰，可保留；但关键信息（公司名、职位、时间）务必用文字写出。', '');
        }
      }
    } catch (e) { /* DOM 不可用时跳过 */ }
    const tabbed = collectTexts(data).filter(t => /\t/.test(t.raw) || /\s\|\s/.test(t.text));
    if (tabbed.length) {
      add('ats-table', 'info', '有 ' + tabbed.length + ' 处内容像是用竖线 / 制表符拼的表格',
        '命中：「' + tabbed[0].sec + '」' + tabbed[0].text.slice(0, 24),
        'ATS 对伪表格解析不稳，建议改成「标签：内容」的普通文本。', '');
    }
  }

  function checkSectionTitles(data, add) {
    const secs = (data.sections || []).filter(Boolean);
    if (secs.length > 6) {
      add('too-many-sections', 'info', '板块数量偏多（' + secs.length + ' 个）',
        '板块过多会让简历显得零散，也容易撑到第 3 页。',
        '考虑合并同类板块（如把「项目经历」并入职业履历下的项目）。', '');
    }
    secs.forEach((sec, i) => {
      const t = trim(sec.title);
      if (t && t.length > 12) {
        add('title-long-' + i, 'info', '板块标题偏长',
          '「' + t + '」共 ' + t.length + ' 字。', '板块标题建议 4–6 字（如「职业履历」「核心技能」）。', t.slice(0, 8));
      }
    });
  }

  /* ---------- 运行体检 ---------- */
  function run(payload) {
    let p = payload;
    if (!p) {
      const re = global.ResumeEditor;
      if (re && typeof re.getData === 'function') { try { p = re.getData(); } catch (e) { p = null; } }
    }
    const data = (p && p.data) || p || {};
    const checks = [];
    const add = (id, level, title, detail, hint, anchor) => {
      checks.push({ id: id, level: level, title: title, detail: detail, hint: hint, anchor: anchor || '' });
    };
    checkRequired(data, add);
    checkPageCount(data, add);
    checkDateOrder(data, add);
    checkQuantifyAndLength(data, add);
    checkPlaceholders(data, add);
    checkSectionTitles(data, add);
    checkAts(data, add);
    checkPii(data, add);

    const texts = collectTexts(data);
    const stats = {
      pages: estimatePages(data).pages,
      chars: texts.reduce((n, x) => n + x.text.length, 0),
      sections: (data.sections || []).filter(Boolean).length,
      items: texts.length,
      errors: checks.filter(c => c.level === 'error').length,
      warns: checks.filter(c => c.level === 'warn').length,
      infos: checks.filter(c => c.level === 'info').length
    };
    lastResult = { checks: checks, stats: stats };
    return lastResult;
  }

  let lastResult = { checks: [], stats: { pages: 0, chars: 0, sections: 0, items: 0, errors: 0, warns: 0, infos: 0 } };

  /* ---------- 渲染 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function render(el) {
    if (typeof document === 'undefined') return;
    const box = el || document.getElementById('auditBody');
    if (!box) return;
    const r = lastResult;
    const s = r.stats;
    let h = '';
    h += '<div class="audit-stats">'
      + '<span><b>' + s.pages + '</b> 页</span>'
      + '<span><b>' + s.chars + '</b> 字</span>'
      + '<span><b>' + s.sections + '</b> 板块</span>'
      + '<span class="audit-sum">' + (r.checks.length === 0
        ? '未发现问题'
        : (s.errors ? '<b>' + s.errors + '</b> 必须处理 · ' : '') + (s.warns ? '<b>' + s.warns + '</b> 建议修改 · ' : '') + (s.infos ? '<b>' + s.infos + '</b> 可以更好' : '')) + '</span>'
      + '</div>';

    if (!r.checks.length) {
      h += '<div class="audit-empty">没发现明显问题。投递前建议再自行核对：岗位关键词是否命中、时间是否有断档。</div>';
    } else {
      LEVELS.forEach(level => {
        const list = r.checks.filter(c => c.level === level);
        if (!list.length) return;
        h += '<div class="audit-group"><div class="audit-group-title ' + level + '">' + LEVEL_LABEL[level] + '（' + list.length + '）</div>';
        list.forEach((c, idx) => {
          const anchorAttr = c.anchor ? ' data-anchor="' + esc(c.anchor) + '"' : '';
          h += '<div class="audit-item ' + level + '"' + anchorAttr + '>'
            + '<div class="audit-item-title">' + esc(c.title) + '</div>'
            + '<div class="audit-item-detail">' + esc(c.detail) + '</div>'
            + '<div class="audit-item-hint">建议：' + esc(c.hint) + '</div>'
            + '</div>';
        });
        h += '</div>';
      });
    }
    h += '<div class="audit-foot"><button class="mini-btn" onclick="ResumeAudit.toggle()">收起</button>'
      + '<button class="mini-btn" onclick="ResumeAudit.refresh()">重新检查</button></div>';
    box.innerHTML = h;
    bindLocate(box);
  }

  /* 点击问题 → 尽力在编辑器里定位到对应输入框 */
  function bindLocate(box) {
    if (!box || !box.querySelectorAll) return;
    const items = box.querySelectorAll('.audit-item[data-anchor]');
    for (let i = 0; i < items.length; i++) {
      (function (el) {
        el.addEventListener('click', function () {
          const anchor = el.getAttribute('data-anchor');
          if (!anchor) return;
          try {
            const editor = document.getElementById('editor');
            if (!editor || !editor.querySelectorAll) return;
            const fields = editor.querySelectorAll('input, textarea');
            for (let j = 0; j < fields.length; j++) {
              const v = fields[j].value || '';
              if (v && v.indexOf(anchor) >= 0) {
                if (fields[j].scrollIntoView) fields[j].scrollIntoView({ block: 'center', behavior: 'smooth' });
                if (fields[j].focus) fields[j].focus();
                return;
              }
            }
          } catch (e) { /* 定位失败不影响体检结果 */ }
        });
      })(items[i]);
    }
  }

  /* 面板展开时，数据一变就静默复检（在预览区上挂 MutationObserver，节流 600ms） */
  let observer = null, pending = null;
  function watchPreview() {
    if (observer || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    try {
      const preview = document.getElementById('preview');
      if (!preview) return;
      observer = new MutationObserver(function () {
        if (pending) return;
        pending = setTimeout(function () {
          pending = null;
          if (isOpen()) { run(); render(); }
        }, 600);
      });
      observer.observe(preview, { childList: true, subtree: true, characterData: true });
    } catch (e) { /* 观察失败时退化为手动「重新检查」 */ }
  }

  function panelEl() { return typeof document === 'undefined' ? null : document.getElementById('panel-audit'); }
  function isOpen() { const p = panelEl(); return !!(p && !p.classList.contains('collapsed')); }

  function refresh() { run(); render(); }

  function toggle() {
    if (typeof document === 'undefined') return null;
    const panel = panelEl();
    if (!panel) { // 面板不存在时的降级：给出可读结果，别静默失败
      const r = run();
      const lines = r.checks.length ? r.checks.map(c => '· [' + LEVEL_LABEL[c.level] + '] ' + c.title).join('\n') : '未发现问题。';
      if (typeof global.alert === 'function') global.alert('投递体检（' + r.stats.pages + ' 页 / ' + r.stats.chars + ' 字）\n\n' + lines);
      return r;
    }
    if (isOpen()) { panel.classList.add('collapsed'); return null; }
    try {
      const re = global.ResumeEditor;
      const small = global.matchMedia && global.matchMedia('(max-width:640px)').matches;
      if (small && re && typeof re.setMobileView === 'function') re.setMobileView('edit');
    } catch (e) { }
    panel.classList.remove('collapsed');
    refresh();
    watchPreview();
    try { if (panel.scrollIntoView) panel.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { }
    return null;
  }

  global.ResumeAudit = {
    run: run,
    render: render,
    toggle: toggle,
    refresh: refresh,
    // 供测试 / 调试
    collectTexts: collectTexts,
    estimatePages: estimatePages,
    firstYear: firstYear
  };
})(typeof window !== 'undefined' ? window : globalThis);
