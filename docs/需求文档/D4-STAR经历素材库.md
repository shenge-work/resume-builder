# D4 STAR 经历素材库

> 编号：D4　借鉴来源：Resume Matcher（master resume 思想）　状态：✅ 已完成（2026-09-21）

> ⚠️ 本文为**需求基线**，供新团队对齐；非待开发需求。

---

## 一、背景

Resume Matcher 的核心思想是「一份 master resume 打底，针对不同岗位抽取重组」，而非每份简历从零写。本项目原先无素材库概念，每份简历独立维护，重复经历要在多份简历里重复写。

---

## 二、已落地的需求与实现

**实现**（`js/store/snippet-library.js`）：

- localStorage 门面 `ResumeSnippets`；
- 纯函数 `normalizeTags` / `matchSnippets` / `makeSnippet`；
- STAR（情境-任务-行动-结果）片段 CRUD；
- `matchSnippets` 按 JD 缺失关键词命中数降序推荐。

**与 A4 结合**：JD 匹配命中「缺失技能」时，推荐库里含该技能的 STAR 片段。

---

## 三、验收标准（既定，已达成）

1. 一条经历存入素材库 → 在另一份简历中一键导入。
2. JD 匹配时能推荐相关素材片段。

---

## 四、工程护栏（不可违背）

1. 复用 store 门面持久化，禁止自拼对象。
2. 双环境模块挂载目标统一 `globalThis`。
3. 遵守「四处接线」铁律 + 变异测试。

---

## 五、后续可优化（如需）

- 与 N2 AI 润色闭环结合：JD 匹配命中缺失技能时，AI 基于素材库片段生成强化句。
