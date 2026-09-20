# D2 JSON Resume 互通

> 编号：D2　借鉴来源：Reactive Resume + jsonresume（事实标准）　状态：✅ 已完成（2026-09-21）

> ⚠️ 本文为**需求基线**，供新团队对齐；非待开发需求。

---

## 一、背景

Reactive Resume 以 JSON Resume（`basics/work/education/skills/...`）为数据底座，导入导出无缝；jsonresume/resume-cli 是事实标准。本项目数据模型是自有 `template.json` 结构，与 JSON Resume 不互通，换工具/接第三方有迁移成本。

---

## 二、已落地的需求与实现

**实现**：`js/io/jsonresume-adapter.js`（双环境模块，IIFE + CommonJS），提供 `fromJsonResume` / `toJsonResume` 双向映射：

- `basics` → 基本信息；`work` → career；`education` → 教育；`skills` → 技能矩阵；`projects` → 项目；
- `highlights`/`growth` 并入 summary 兜底不丢。

**入口**：菜单「导出」组加「导出 JSON Resume」；`ResumeEditor.importJSONResume` 识别 jsonresume 结构自动转换。

---

## 三、验收标准（既定，已达成）

1. 一份 JSON Resume 样例导入 → 预览字段完整。
2. 本项目简历导出 JSON Resume → 用 `resume-cli` 能正常渲染。

---

## 四、工程护栏（不可违背）

1. 双环境模块挂载目标统一 `(window || globalThis)`，CommonJS 导出读 `globalThis.ResumeXxx`（`(window||this)` 在 Node 下会挂空）。
2. 不改变内部模型，只在边界做适配。
3. 遵守「四处接线」铁律。

---

## 五、后续可优化（如需）

- 未来可对接 JSON Resume 生态的开源模板渲染、第三方 ATS。
