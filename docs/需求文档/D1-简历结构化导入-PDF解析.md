# D1 简历结构化导入（PDF 解析）

> 编号：D1　借鉴来源：OpenResume（Resume Parser）　状态：✅ 已完成（2026-09-21）

> ⚠️ 本文为**需求基线**，记录该功能的既定需求与实现约束，供新团队对齐；非待开发需求。

---

## 一、背景

OpenResume 的核心竞争力之一是用 PDF.js 解析已有简历 PDF，**识别出结构化字段**（姓名、联系方式、各段经历、技能、教育），实现「把已有简历一键变可编辑」。本项目原先只做「识别姓名+联系方式 + 原文全保留」，缺结构化解析。

---

## 二、已落地的需求与实现

**核心原则（铁律）**：**「不臆造结构」**——低置信度字段标注待确认，绝不静默填错；原文永远全保留兜底。

**实现**：`tools/pdf-parse.js` 新增 `extractCareer` / `extractEducation` / `extractSkills` / `extractDateRange` / `classifySectionLine` 五个纯函数；`buildResumeData` 把工作经历落到 career、教育落到 advantages、技能落到 skills 矩阵，缺字段标 `__lowConfidence`，原文兜底 section 仍在。

**交互**：前端导入流程「解析预览 + 一键套用/逐项确认」，存疑项标黄。

---

## 三、验收标准（既定，已达成）

1. 真实简历 PDF 导入 → 工作经历/教育/技能自动预填 ≥70% 字段。
2. 存疑项被标记而非静默填入。
3. 原文仍完整可查。

---

## 四、工程护栏（不可违背）

1. PDF 解析仅服务端 require（pdfjs-dist legacy），不进前端。
2. pdf.js 拒绝 Buffer，必须真 Uint8Array；worker 与主文件同名配对。
3. 测试数据用虚构名，不写真数据。
4. 结构化字段新增必同步 `export-extra.js` / `audit.js` / `views/portfolio-view.js`。

---

## 五、后续可优化（如需）

- 借鉴 OpenResume 的「特征评分解析器」（对候选字段打特征分取最高分）进一步提准，当前 A3 已借鉴其「低置信度标注」思想。
