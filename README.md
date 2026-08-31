# 简历编辑器（Resume Builder）

一个**纯前端、零后端依赖**的简历排版工具：左侧实时预览，右侧纯文本编辑，拖拽调序，支持板块增删、撤销/重做，并能导出「可选中文字」的 PDF。

> 本项目最初是一份单文件 HTML，后拆分为多文件便于 Git 协作；单文件版由 `npm run build` 自动生成到 `dist/`（`git` 忽略，断网可用）。

[![CI](https://github.com/your-org/resume-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/resume-builder/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D16-brightgreen.svg)](./package.json)

---

## ✨ 功能

| 功能 | 说明 |
|---|---|
| 实时预览 | 右侧改字，左侧立即刷新 |
| 拖拽排序 | 直接拖动板块 / 公司 / 项目 / 条目调整顺序 |
| 板块增删 | 一键新增「个人优势 / 职业履历 / 核心技能 / 项目经历」，可删除（至少保留 1 个） |
| 撤销 / 重做 | 文字、字号/间距、增删/移动、拖拽、重置、导入均可撤销（100 步）；`Ctrl/Cmd+Z`、`Ctrl+Y` |
| 字号配置 | 按元素类别（姓名、章节标题、正文…）分别设置 |
| 间距配置 | 全局默认值 + **每行**独立上下间距微调（仅叠加，不影响其他行） |
| 公司 Logo | 每家公司可配 Logo 及高度 / 宽度 / 与名称间距 |
| 引用样式 | 公司概述、项目描述可单独开关左侧引用线并选颜色 |
| 强制换页 | 可让指定公司从新一页开始 |
| 分页参考线 | 按 A4 比例显示分页位置，与导出结果一致 |
| PDF 导出 | **推荐**：浏览器原生打印 → 矢量文字 PDF（可选中、体积小）；兼容：图片型截图导出 |
| 数据导入 / 导出 | 全量内容导出为 JSON 备份，换设备/浏览器后导入恢复 |
| 自动保存 | 编辑即存浏览器 localStorage（离线兜底）；经 `npm start` 打开时还**实时写回 `data/resume.json`**（刷新不丢、可 git 管理） |
| 面板折叠 | 字号 / 间距 / 内容编辑三块可展开收起 |

---

## 🚀 快速开始

**方式一：用构建好的单文件版（推荐快速使用）**

运行 `npm run build` 后，`dist/` 下会生成 `简历编辑器-单文件.html`，**无需服务器、双击即开、断网可用**，适合直接下载使用或分享。

**方式二：本地写服务预览（多文件版，推荐——支持「编辑实时写回」）**

```bash
cd resume-builder
npm start                 # = node tools/serve.js，默认端口 8000（可用 PORT 覆盖）
# 浏览器访问 http://localhost:8000
```

> 若你的终端报 `npm: command not found`（WorkBuddy 管理的 Node 运行时未挂到交互式 shell 的 PATH），npm 其实已安装，只是没暴露。两种等价替代：
> - 直接用完整路径的 node 跑（**推荐，无需 npm install**，serve.js 只用内置模块）：
>   `~/.workbuddy/binaries/node/versions/22.22.2/bin/node tools/serve.js`
> - 或先临时把 Node 加入当前会话 PATH，再用 `npm start`：
>   `export PATH="$HOME/.workbuddy/binaries/node/versions/22.22.2/bin:$PATH"`

> 用本项目自带的服务（`npm start`）而不是 `python3 -m http.server`，原因是：浏览器**无法向磁盘写文件**，只有经这个服务打开，编辑器里的每次修改才会**实时写回 `data/resume.json`**（刷新不丢、可直接 git 管理）。
> 若改用 `python3 -m http.server` 或直接双击 `index.html`（`file://`），浏览器读不到/写不回 `data/resume.json`，编辑只存本浏览器 `localStorage`（工具栏会提示「未连接本地写服务」）。

**方式三：自行构建单文件版**

```bash
npm run build
# 产物：dist/简历编辑器-单文件.html  （离线可用、双击即开；git 忽略）
```

---

## 📁 目录结构

```
resume-builder/
├── index.html                # 页面骨架（多文件版入口；内联事件统一走 ResumeEditor.xxx）
├── css/
│   └── style.css            # 全部样式（含 @media print 打印样式）
├── js/
│   ├── data.js              # 默认/种子数据（构建时内联进单文件版）
│   └── app.js              # 业务逻辑，封装为 IIFE，仅暴露 window.ResumeEditor
├── vendor/                  # 第三方库（本地存放，离线可用）
│   ├── html2canvas.min.js   #   把简历渲染成图片（图片型 PDF 兼容导出用）
│   └── jspdf.umd.min.js     #   把图片拼成 PDF
├── tools/
│   ├── serve.js            # 本地写服务（零依赖）：托管静态文件 + POST /api/resume 实时写回 data/resume.json
│   ├── build-single.js      # 打包脚本：多文件 → 单文件 HTML（输出到 dist/）
│   ├── migrate-legacy.js    # 旧版单文件简历 HTML → 可导入 JSON（输出到 dist/）
│   ├── save-data.js        # 把浏览器导出的 JSON 落盘为 data/resume.json（备用回写方式）
│   └── render-resume.js     # JSON → 独立 A4 简历 HTML（用项目真实渲染管线，输出到 dist/）
├── test/                    # 纯 Node、零依赖测试
│   ├── run.js               #   运行器（DOM/浏览器桩，vm 加载 data+app）
│   └── cases.js             #   用例（38 条断言）
├── .github/workflows/ci.yml # CI：push/PR 自动跑 npm test + npm run build
├── data/                   # ★ 个人简历数据（已被 .gitignore 隔离，不进公开仓库）
│   └── resume.json         #   版本化数据源（多文件版启动时自动读取 ./data/resume.json）
├── dist/                    # 构建产物缓存（已被 .gitignore 忽略；含单文件版与迁移产物）
├── README.md
├── CHANGELOG.md             # 版本迭代记录（本次上线 / 历史）
├── ROADMAP.md               # 后续优化规划
├── CONTRIBUTING.md          # 贡献指南
├── LICENSE                  # MIT
└── package.json
```

**加载顺序**：`data.js` 必须先于 `app.js`（`app.js` 依赖 `data.js` 里的 `data`、`defaultSpacing` 等）。

---

## 💾 数据存储位置

本项目**纯前端、无任何后端/数据库**，简历数据落在三个层面：

### 1. 默认 / 种子数据 —— `js/data.js`（源码）
- 第 9 行 `let data = {...}`，是打开编辑器时 **localStorage 为空**所用的初始内容（模板）。
- 单文件版 `dist/简历编辑器-单文件.html` 在构建时会把这段数据**内联**进去，所以单文件版不依赖 `js/data.js` 也能独立运行。

### 2. 运行时数据 —— 浏览器 `localStorage`（即时缓存 / 离线兜底）
编辑即存，关键代码见 `js/app.js`：
- 当前键：`resume_builder_data_v1`（line 747）→ 存 `{data, fonts, spacing, v}`。
- 旧键：`resume_chenpeisheng_v1`（line 748）→ 首次打开时自动迁移到当前键并删除，旧内容不丢。
- 右侧面板折叠状态单独存在另一个键 `PANEL_STATE_KEY`（line 549）。

> ⚠️ **隔离注意**：localStorage 按「浏览器 + 来源(origin)」隔离；`file://` 下部分浏览器有限制、换设备 / 清缓存会丢。
> 它现在主要作为**离线 / 无写服务时的兜底缓存**；在有写服务（`npm start`）时，真正落盘的是 `data/resume.json`（见下一节）。

### 3. 实时数据源 —— `data/resume.json`（推荐，需 `npm start`）
- 与「导出数据」同格式的 `{data, fonts, spacing, v}` 文件，**已被 `.gitignore` 隔离、不进公开仓库**（防个人数据外泄）。
- **每次打开**：编辑器都 `fetch('./data/resume.json')`，用其内容**覆盖** localStorage —— 实现「以仓库文件为准、刷新不丢」。
- **每次修改**：防抖 800ms 后 `POST /api/resume` 把当前数据**写回** `data/resume.json` —— 但浏览器**无法直写磁盘**，必须经由本项目自带服务 `npm start`（`tools/serve.js`）打开才能实现。
  - 用 `python3 -m http.server` 或 `file://` 打开时，写入静默失败、仅存 localStorage，工具栏会提示「未连接本地写服务」。
- 手动同步：工具栏「**从仓库 data/resume.json 重载**」可随时重新拉取覆盖。

### 4. 可移植数据 —— 导出的 JSON 文件
- 「导出数据」按钮下载的 JSON，格式即 `{data, fonts, spacing, v}`，与 `resume.json` / localStorage 一致。
- 这是**唯一能跨设备 / 跨来源迁移**的载体：换环境后点「导入数据」即可恢复。
- 例：本次把旧简历迁移出的 `dist/示例_简历数据_迁移版.json`，或直接在任何编辑器里导出的备份。
- 备用回写：若不想用 `npm start`，也可在编辑器导出 JSON 后，用 `node tools/save-data.js <导出JSON>` 落盘到 `data/resume.json`（注意该文件被 `.gitignore` 隔离，请勿 `git add`）。

**一句话总结**：默认模板在 `js/data.js`；运行时真实内容在 **`data/resume.json`（实时读写，需 `npm start`）** 与浏览器 **localStorage（离线兜底）**；`dist/` 是构建 / 迁移产物、不是数据源。

## 📥 从旧版单文件简历迁移数据

如果你有一份**旧版**简历编辑器生成的单文件 HTML（简历内容内嵌在 `let data = {...}` 中），可用两个零依赖脚本把内容无损迁移进来：

```bash
node tools/migrate-legacy.js <旧版HTML路径>          # 提取内嵌数据 → dist/示例_简历数据_迁移版.json
node tools/render-resume.js                          # 用项目真实渲染管线 → dist/示例_简历_迁移版.html
```

- 生成的 JSON 与编辑器「导入数据」按钮完全兼容，可在 `index.html` 中一键导入继续编辑（含字体 / 间距配置）。
- 生成的 HTML 是独立 A4 简历（文字可选中），浏览器打开后 `Ctrl/Cmd+P` 即可「另存为 PDF」。
- 产物默认落在 `dist/`（git 忽略）；`migrate-legacy.js` 第 2 个参数、`render-resume.js` 第 2~3 个参数可自定义路径。

---

## 🖨️ 关于 PDF 导出

| 方式 | 入口 | 特点 |
|---|---|---|
| **原生打印（推荐）** | 「打印 / 另存为 PDF」 | 浏览器打印管线，矢量文字 PDF：**文字可选中、可搜索、体积小**；会弹出系统打印对话框 |
| 图片型（兼容） | 「PDF 预览 / 导出（图片版）」 | html2canvas 截图拼合，**版式 100% 与屏幕一致**，但文字不可选、体积较大 |

> 纯客户端无法在不依赖打印对话框的前提下用现有库直接产出「可选中文字」的 `.pdf` blob（html2canvas 本质是截图；jsPDF 的 `.text()` 需手写整套排版）。若需要「一键静默下载可选中 PDF」，见 [ROADMAP.md](./ROADMAP.md)。

---

## 🧪 测试与构建

```bash
npm test          # 纯 Node 零依赖，38 条断言（逻辑 + 打印样式 + 封装 + 入口接线）
npm run build     # 重建单文件版，输出到 dist/简历编辑器-单文件.html（已做写入校验）
```

CI（`.github/workflows/ci.yml`）在每次 push / PR 自动运行上述两项。

---

## 🗺️ 版本与规划

- 本次上线内容（P0/P1/P2 全量）：见 [CHANGELOG.md](./CHANGELOG.md)。
- 后续优化方向：见 [ROADMAP.md](./ROADMAP.md)。

---

## 🤝 贡献

欢迎 Issue 与 PR，详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 📄 许可

[MIT](./LICENSE)。

---

## ⚠️ 隐私提醒

`js/data.js` 内置示例个人简历信息。若将本仓库设为公开，请替换为占位内容或确认无隐私风险。
