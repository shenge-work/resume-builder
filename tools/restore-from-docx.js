#!/usr/bin/env node
/* 从 docx 导出产物重建 data/resume.json（数据恢复脚本，一次性）
 * 来源：dist/示例_简历.docx（2026-09-19 03:23 从真实数据导出，污染发生前）
 * 映射：Heading1=姓名 / Normal(1,2)=头衔+联系方式 / Heading2=板块 / ListParagraph=条目
 *       项目名=「（技术栈）」结尾且后跟 Normal 描述的 ListParagraph
 */
'use strict';
const fs = require('fs');

const xml = fs.readFileSync('/tmp/docx-extract/word/document.xml', 'utf8');
const paras = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
const P = paras.map(p => {
  const m = p.match(/w:pStyle w:val="([^"]+)"/);
  const texts = p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
  const text = texts.map(t => t.replace(/<[^>]+>/g, '')).join('')
    .replace(/^•\s*/, '');
  return { style: m ? m[1] : 'Normal', text };
});

/* ---------- 解析 ---------- */
const data = {
  name: P[0].text,
  subtitle: P[1].text,
  subtitleBold: false,
  meta: '',
  metaBold: false,
  contact: P[2].text.split(/｜|\s\|\s/).map(s => s.trim()).filter(Boolean),
  pageMargins: { top: 14, right: 14, bottom: 14, left: 14 },
  sections: []
};

let i = 3;
/* 个人优势（两条，无 label） */
const adv = { id: 's_adv', type: 'advantages', title: P[i].text, pageBreak: false, items: [] };
i++;
while (i < P.length && P[i].style === 'ListParagraph') {
  adv.items.push({ text: P[i].text, labelBold: false, spacing: { mt: 0, mb: 4 } });
  i++;
}
data.sections.push(adv);

/* tags 行 → highlights 板块 */
if (i < P.length && P[i].style === 'Normal' && P[i].text.indexOf(' · ') > 0 && P[i+1] && P[i+1].style === 'Heading2') {
  data.sections.push({
    id: 's_highlights', type: 'highlights', title: '关键印记', pageBreak: false,
    cards: [],
    tags: P[i].text.split(' · ').map(s => s.trim()).filter(Boolean)
  });
  i++;
}

/* 技术成长路径（growth）：Heading3=label+title / Normal=date / Normal=desc */
while (i < P.length && P[i].style === 'Heading2' && P[i].text.indexOf('成长路径') >= 0) {
  const growth = { id: 's_growth', type: 'growth', title: P[i].text, pageBreak: false, phases: [] };
  i++;
  while (i < P.length && P[i].style === 'Heading3' && P[i].text.indexOf('阶段') === 0) {
    const head = P[i].text;
    const sep = head.indexOf(' · ');
    const label = head.substring(0, sep);
    const title = head.substring(sep + 3);
    i++;
    const date = P[i].text; i++;
    const desc = P[i].text; i++;
    growth.phases.push({ label, date, title, desc, spacing: { mt: 0, mb: 8 } });
  }
  data.sections.push(growth);
  break;
}

/* 专业技能（skills）：ListParagraph「组名：内容」→ 每组一条 item */
while (i < P.length && P[i].style === 'Heading2' && P[i].text.indexOf('技能') >= 0) {
  const skills = { id: 's_skills', type: 'skills', title: P[i].text, pageBreak: false, groups: [] };
  i++;
  while (i < P.length && P[i].style === 'ListParagraph') {
    const t = P[i].text;
    const c = t.indexOf('：');
    const name = t.substring(0, c);
    const item = t.substring(c + 1);
    skills.groups.push({ name, items: [item], spacing: { mt: 4, mb: 6 } });
    i++;
  }
  data.sections.push(skills);
  break;
}

/* 职业履历（career） */
while (i < P.length && P[i].style === 'Heading2' && P[i].text.indexOf('履历') >= 0) {
  const career = { id: 's_career', type: 'career', title: P[i].text, pageBreak: false, items: [] };
  i++;
  /* 项目名判定：ListParagraph 且以「技术栈括号」结尾。兼容中文全角（）/ 英文半角()，
     多层括号只取最后一个作为 stack。 */
  const projNameRe = /[（(][^（）()]*[）)]\s*$/;
  const isProjName = (p) => p.style === 'ListParagraph' && projNameRe.test(p.text);
  /* 剥离最后一个括号为 stack，其余（含描述括号）保留在 name */
  const splitStack = (t) => {
    const m = t.match(projNameRe);
    if (!m) return { name: t, stack: '' };
    return { name: t.substring(0, m.index).trim(), stack: m[0].slice(1, -1).trim() };
  };

  while (i < P.length && P[i].style === 'Heading3') {
    const company = P[i].text; i++;
    const rd = P[i].text.split('|').map(s => s.trim());
    const role = rd[0], date = rd[1] || '';
    i++;
    /* summary：紧随 role|date 的 Normal 段；若下一段是 ListParagraph 项目名则无 summary */
    let summary = '';
    if (i < P.length && P[i].style === 'Normal') {
      summary = P[i].text; i++;
    }
    const job = { company, role, date, summary, pageBreak: false, projects: [], spacing: { mt: 0, mb: 8 } };
    if (summary === '') { delete job.summary; }
    /* 项目循环：ListParagraph 项目名 → 可选 Normal 描述 → 若干 ListParagraph 结果 */
    while (i < P.length && P[i].style === 'ListParagraph' && isProjName(P[i])) {
      const { name, stack } = splitStack(P[i].text);
      i++;
      let desc = '';
      if (i < P.length && P[i].style === 'Normal') { desc = P[i].text; i++; }
      const proj = { name, stack, desc, results: [], spacing: { mt: 6, mb: 8 } };
      if (!desc) delete proj.desc;
      while (i < P.length && P[i].style === 'ListParagraph' && !isProjName(P[i])) {
        proj.results.push({ text: P[i].text, spacing: { mt: 0, mb: 3 } });
        i++;
      }
      job.projects.push(proj);
    }
    career.items.push(job);
  }
  data.sections.push(career);
  break;
}

const payload = { data, v: 8 };
/* 字体 / 间距：使用出厂默认（原微调不可恢复，渲染基本一致） */
const dataSrc = fs.readFileSync('js/data.js', 'utf8');

/* 简单提取 defaultFonts / defaultSpacing 字面量：直接在 Node 里跑 data.js 拿常量 */
const sandbox = {};
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(dataSrc + '\nthis.__f = defaultFonts; this.__s = defaultSpacing;', sandbox);
payload.fonts = JSON.parse(JSON.stringify(sandbox.__f));
payload.spacing = JSON.parse(JSON.stringify(sandbox.__s));
/* savedAt：外部写盘视为「最新修改」，浏览器 boot 仲裁（pickResumeSource）时磁盘优先，
   避免浏览器 IndexedDB 旧数据再把刚恢复的内容覆盖掉 */
payload.savedAt = Date.now();

fs.writeFileSync('data/resume.json', JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log('✓ 已重建 data/resume.json');
console.log('  姓名:', data.name, '| 板块:', data.sections.length, '| 履历:', data.sections.find(s=>s.type==='career').items.length, '家公司');
data.sections.forEach(s => {
  const n = s.type === 'career' ? s.items.length + ' 家公司'
    : s.type === 'growth' ? s.phases.length + ' 阶段'
    : s.type === 'skills' ? s.groups.length + ' 组'
    : s.type === 'advantages' ? s.items.length + ' 条'
    : s.tags ? s.tags.length + ' 标签' : '';
  console.log('  -', s.title, '(' + s.type + '):', n);
});
