# Changelog

本项目所有重要变更记录于此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

后续规划见 [ROADMAP.md](./ROADMAP.md)。

---

## [1.0.0] - 2026-08-31

首个可公开发布版本。相对最初的个人单文件原型，补齐了「通用性 / 数据可移植性 / 工程化」三块，
使项目从「个人可用小工具」达到「可分享、可协作的开源项目」成熟度。

### 新增
- **数据可移植性**：新增「导出数据 / 导入数据」按钮，全量内容可导出为 JSON 文件备份、换设备/换浏览器后导入恢复（`exportJSON` / `importJSON` / `applyImported`，导入含基础校验与旧格式规范化）。
- **板块增删**：编辑器底部「添加板块」卡片，支持新增「个人优势 / 职业履历 / 核心技能 / 项目经历」；每个板块头部支持「删除板块」（至少保留 1 个，仅剩 1 个时拦截）。
- **撤销 / 重做**：全量状态快照栈（上限 100 步）。文字输入、字号/间距微调、增删/移动板块与条目、拖拽重排、重置、导入全部可撤销；连续打字/调参 700ms 内合并为一步；工具栏按钮 + `Ctrl/Cmd+Z`、`Ctrl/Cmd+Shift+Z`、`Ctrl+Y` 快捷键。
- **原生打印导出（推荐）**：新增「打印 / 另存为 PDF」按钮，走浏览器原生打印管线，产出矢量文字 PDF（文字可选中、体积小）；完善了 `@media print`（A4 纸张、隐藏全部 UI、条目分页保护、精确打印底色）。
- **工程化**：新增 `test/`（纯 Node、零依赖、38 条断言）、`package.json`（`npm test` / `npm run build`）、`.github/workflows/ci.yml`（push/PR 自动跑测试与构建）、`js/app.js` 整体封装为 IIFE 并暴露 `window.ResumeEditor` 命名空间。

### 修复
- **`projects` 板块静默 bug**：编辑/输入/点击/迁移都支持 `sec.type==='projects'`，但预览渲染 `renderResumeInner` 此前无该分支——数据里一旦出现 projects 板块，编辑器能改、预览却空白。已补全预览分支与 `blankItem('projects')` 默认结构。
- **历史栈合并缺陷**：首版仅合并 `edit` 输入，`setting`（字号/间距）每键独立入栈导致历史爆炸；已统一为 `edit/setting` 合并、`action` 不合并。

### 变更
- **去硬编码身份**：`SAVE_KEY` 由 `resume_chenpeisheng_v1` 改为通用 `resume_builder_data_v1`，并保留旧 key 迁移逻辑（首次启动自动迁移，旧内容不丢）；PDF 文件名与页面标题改为基于 `data.name` 动态生成。
- **构建产物自动同步**：`tools/build-single.js` 改为一次命令同时写 `dist/` 与根目录单文件版（同一 Buffer + md5 一致性校验），消除此前手动 `cp` 易不同步的隐患。
- **删除死代码**：移除从未调用的 `spacingClass`、`renderSpacingInputs`、`labelWithSpacing`。

### 已知限制（非阻塞）
- 旧版「图片型 PDF」（`exportPDF()`）保留为兼容项：文字不可选、体积较大，适合对版式像素级一致有要求的场景。
- `js/data.js` 的 `data` / `currentFonts` / `currentSpacing` 仍为全局变量（数据模块，IIFE 闭包可读写），为有意保留的低风险残留。

### 安全
- 仓库含示例个人简历数据（`js/data.js`），公开仓库前请替换为占位内容或确认无隐私风险。
