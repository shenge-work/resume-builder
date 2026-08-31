# 简历编辑器（Resume Builder）

一个**纯前端、零后端依赖**的简历排版工具：左侧实时预览，右侧纯文本编辑，拖拽调序，支持板块增删、撤销/重做，并能导出「可选中文字」的 PDF。

> 本项目最初是一份单文件 HTML，后拆分为多文件便于 Git 协作；同时仓库根目录提供预构建的单文件版，可直接下载、双击打开、断网可用。

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
| 自动保存 | 编辑即存入浏览器 localStorage，刷新不丢 |
| 面板折叠 | 字号 / 间距 / 内容编辑三块可展开收起 |

---

## 🚀 快速开始

**方式一：直接用仓库里的单文件版（推荐快速使用）**

根目录已提供预构建好的 `简历编辑器-单文件.html`，**无需任何构建、双击即开、断网可用**，适合直接下载使用或分享。

**方式二：本地服务器预览（多文件版，开发用）**

```bash
cd resume-builder
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000
```

> 直接双击 `index.html`（`file://`）大多也能正常工作；若遇到 PDF 导出异常，改用本地服务器即可。

**方式三：自行构建单文件版**

```bash
npm run build
# 产物：dist/简历编辑器-单文件.html  → 与根目录单文件版同源、字节一致
```

---

## 📁 目录结构

```
resume-builder/
├── index.html                # 页面骨架（多文件版入口；内联事件统一走 ResumeEditor.xxx）
├── 简历编辑器-单文件.html     # ★ 预构建单文件版：双击即开、断网可用（纳入版本控制）
├── css/
│   └── style.css            # 全部样式（含 @media print 打印样式）
├── js/
│   ├── data.js              # ★ 简历数据 + 默认字号/间距（唯一数据源）
│   └── app.js              # 业务逻辑，封装为 IIFE，仅暴露 window.ResumeEditor
├── vendor/                  # 第三方库（本地存放，离线可用）
│   ├── html2canvas.min.js   #   把简历渲染成图片（图片型 PDF 兼容导出用）
│   └── jspdf.umd.min.js     #   把图片拼成 PDF
├── tools/
│   └── build-single.js      # 打包脚本：多文件 → 单文件 HTML（自动同步 dist/ 与根目录）
├── test/                    # 纯 Node、零依赖测试
│   ├── run.js               #   运行器（DOM/浏览器桩，vm 加载 data+app）
│   └── cases.js             #   用例（38 条断言）
├── .github/workflows/ci.yml # CI：push/PR 自动跑 npm test + npm run build
├── dist/                    # 构建产物缓存（已被 .gitignore 忽略；根目录单文件版与之同源）
├── README.md
├── CHANGELOG.md             # 版本迭代记录（本次上线 / 历史）
├── ROADMAP.md               # 后续优化规划
├── CONTRIBUTING.md          # 贡献指南
├── LICENSE                  # MIT
└── package.json
```

**加载顺序**：`data.js` 必须先于 `app.js`（`app.js` 依赖 `data.js` 里的 `data`、`defaultSpacing` 等）。

---

## 💾 数据与存储

- 简历内容以 JS 对象形式放在 `js/data.js`，是**唯一数据源**。
- 页面上的所有编辑都自动存入浏览器 **localStorage**（键：`resume_builder_data_v1`），**刷新不丢**。
  - 首次启动会自动把旧版 `resume_chenpeisheng_v1` 的数据迁移到新键，旧内容不丢。
  - 换浏览器 / 清缓存会丢失本地内容——此时请用「导出数据」备份 JSON，或导出 PDF。
  - 想恢复内置初始数据：点工具栏「重置为初始数据」（需确认）。
- 想跨设备/长期保存：**导出数据（JSON）** → 换环境后 **导入数据**。

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
npm run build     # 重建单文件版，同时写 dist/ 与根目录副本，并做 md5 一致性校验
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
