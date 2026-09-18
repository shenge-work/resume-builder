# 简历编辑器（Resume Builder）

一个**数据可自持、可跨端使用**的简历排版工具：左侧实时预览，右侧纯文本编辑，拖拽调序，支持板块增删、撤销/重做，可做投递前体检，并导出「可选中文字」的 PDF / Word。

三种使用形态（同一份代码库）：

| 形态 | 打开方式 | 适合场景 |
|---|---|---|
| **浏览器版** | `npm start` → `http://127.0.0.1:8000` | 日常编辑；每次改动**实时写回** `data/resume.json` |
| **单文件版** | `npm run build` → `dist/简历编辑器-单文件.html`，双击即开 | 离线使用、分享给他人 |
| **桌面 / 安卓 App** | 见 [docs/DESKTOP-BUILD.md](./docs/DESKTOP-BUILD.md)、[docs/ANDROID-BUILD.md](./docs/ANDROID-BUILD.md) | 免装 Node；飞书凭证由原生层保管，不经浏览器 |

> 本项目最初是一份单文件 HTML，后拆分为多文件便于 Git 协作；单文件版由 `npm run build` 自动生成到 `dist/`（`git` 忽略，断网可用）。

[![CI](https://github.com/shenge-work/resume-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/shenge-work/resume-builder/actions/workflows/ci.yml)
[![Build Desktop](https://github.com/shenge-work/resume-builder/actions/workflows/build-desktop.yml/badge.svg)](https://github.com/shenge-work/resume-builder/actions/workflows/build-desktop.yml)
[![Build Android](https://github.com/shenge-work/resume-builder/actions/workflows/build-android.yml/badge.svg)](https://github.com/shenge-work/resume-builder/actions/workflows/build-android.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

---

## ✨ 功能

**编辑**

| 功能 | 说明 |
|---|---|
| 实时预览 | 右侧改字，左侧立即刷新 |
| 拖拽排序 | 直接拖动板块 / 公司 / 项目 / 条目调整顺序 |
| 板块增删 | 一键新增「个人优势 / 职业履历 / 核心技能 / 项目经历」，可删除（至少保留 1 个） |
| 撤销 / 重做 | 文字、字号/间距、增删/移动、拖拽、重置、导入均可撤销（100 步）；`Ctrl/Cmd+Z`、`Ctrl+Y` |
| 字号 / 间距 | 按元素类别（姓名、章节标题、正文…）配置字号；全局默认间距 + **每行**独立微调（仅叠加，不影响其他行） |
| 公司 Logo / 引用线 | 每家公司可配 Logo 与尺寸；公司概述、项目描述可单独开关左侧引用线 |
| 强制换页 / 分页参考线 | 指定公司从新一页开始；按 A4 比例显示分页位置，与导出结果一致 |

**导出与投递**

| 功能 | 说明 |
|---|---|
| 投递体检 | 规则化检查**页数 / 内容完整性 / 量化结果 / ATS 友好度 / 敏感信息**，分「必须处理 · 建议修改 · 可以更好」三级，点击条目可定位到对应板块 |
| PDF（静默） | 经本地服务调用本机浏览器 headless 打印，产出**文字可选中**的矢量 PDF，**不弹**打印对话框（需 `npm start`；失败自动回退到系统打印） |
| Word / 纯文本 / Markdown | `.docx`（真 OOXML，含真加粗，HR 与 ATS 通用）、`.txt`（投递表单粘贴用）、`.md`（放 GitHub / 在线简历） |
| 图片版 PDF / 长图 / 单文件 HTML | html2canvas 截图拼合，版式与屏幕 100% 一致（代价：文字不可选、体积较大） |

**数据**

| 功能 | 说明 |
|---|---|
| 数据导入 / 导出 | 全量内容导出为 JSON 备份，换设备 / 浏览器后导入恢复 |
| 自动保存 | 编辑即存浏览器 localStorage（离线兜底）；经 `npm start` 打开时还**实时写回 `data/resume.json`**（刷新不丢、可 git 管理） |
| 飞书同步（可选） | 手动「上报到飞书」/「从飞书恢复」，借飞书文档与云盘文件的版本历史留存每次更改；应用凭证只存本机，**绝不进浏览器** |
| 数据门面 | 存储实现可替换（本地服务 / 浏览器 / 原生层），业务代码不感知 —— 见 `js/store/resume-store.js` |

**界面**

| 功能 | 说明 |
|---|---|
| 响应式 | 手机 / 平板 / 桌面自适应：移动端底部 Tab、A4 等比缩放、安全区与软键盘适配、返回键优先级 |
| 日间 / 夜间主题 | 严格黑白灰三色体系，一键切换 |
| 面板折叠 | 字号 / 间距 / 投递体检 / 内容编辑可展开收起 |

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

**方式四：桌面 / 安卓 App（可选）**

```bash
npm run desktop:assets   # 前端产物复制并净化到 dist-desktop/（自动剥离注入属性、隔离隐私目录）
npm run desktop:build    # 产出本机平台安装包：macOS .app/.dmg、Windows .msi/.exe、Linux .deb/.AppImage
npm run mobile:android:build   # 产出 APK / AAB（需 JDK 17 + Android SDK/NDK）
```

依赖：Rust 工具链 + Node；安卓另需 JDK 17 与 Android SDK/NDK。

> **不想装 Rust / SDK？直接用 CI 出包。** push 到 GitHub 后，`Build Desktop` 与 `Build Android`
> 会在三平台矩阵上产出安装包，到 Actions 页对应 run 的 **Artifacts** 下载即可。
> 细节与排错见 [docs/DESKTOP-BUILD.md](./docs/DESKTOP-BUILD.md)、[docs/ANDROID-BUILD.md](./docs/ANDROID-BUILD.md)。

---

## 📁 目录结构

```
resume-builder/
├── index.html                # 页面骨架（多文件版入口；内联事件统一走 ResumeXxx 命名空间）
├── css/
│   └── style.css            # 全部样式（响应式断点 + @media print 打印样式）
├── js/
│   ├── data.js              # 默认/种子数据（构建时内联进单文件版）
│   ├── app.js              # 业务逻辑，封装为 IIFE，仅暴露 window.ResumeEditor
│   ├── theme.js             # 日间 / 夜间主题（黑白灰）
│   ├── audit.js             # 投递体检（纯规则、只读，暴露 window.ResumeAudit）
│   ├── export-extra.js      # Word / 纯文本 / Markdown / 静默 PDF（暴露 window.ResumeExport）
│   └── store/
│       ├── resume-store.js  # 数据门面：Local / Browser / Feishu 三种实现
│       └── native-bridge.js # 原生桥：仅在 Tauri 壳内注入 window.__RESUME_NATIVE__
├── src-tauri/               # 桌面 / 移动原生壳（Rust）：7 个命令 + 凭证保管（app_secret 只在原生进程）
├── vendor/                  # 第三方库（本地存放，离线可用）
│   ├── html2canvas.min.js   #   把简历渲染成图片（图片型 PDF 兼容导出用）
│   └── jspdf.umd.min.js     #   把图片拼成 PDF
├── tools/
│   ├── serve.js            # 本地写服务（零依赖）：静态托管 + /api/resume 写回 + /api/pdf 静默打印
│   ├── build-single.js      # 打包脚本：多文件 → 单文件 HTML（输出到 dist/）
│   ├── build-desktop-frontend.js # 前端 → dist-desktop/（白名单复制 + 净化注入属性）
│   ├── verify-frontend-assets.js # 资源完整性门禁：引用缺失 / 漏打包 / 隐私目录泄漏
│   ├── gen-icons.js         # 生成安装包图标（RGBA PNG / icns / ico）
│   ├── clean-html-injections.js # 剥离外部编辑器注入的 data-page-node-id
│   ├── migrate-legacy.js    # 旧版单文件简历 HTML → 可导入 JSON（输出到 dist/）
│   ├── save-data.js        # 把浏览器导出的 JSON 落盘为 data/resume.json（备用回写方式）
│   └── render-resume.js     # JSON → 独立 A4 简历 HTML（用项目真实渲染管线，输出到 dist/）
├── test/                    # 纯 Node、零依赖测试
│   ├── run.js               #   运行器（DOM/浏览器桩，vm 加载 data + store + app + audit + export-extra）
│   ├── cases.js             #   核心逻辑用例
│   ├── cases-audit.js       #   投递体检用例（CommonJS，经 ctx.assert 上报）
│   └── cases-export.js      #   多格式导出用例（自带独立 zip 解析器，逐字节校验 OOXML）
├── docs/
│   ├── CROSSPLATFORM-DESIGN.md  # 跨平台改造方案
│   ├── DESKTOP-BUILD.md         # 桌面端构建与排错
│   ├── ANDROID-BUILD.md         # 安卓端构建与排错
│   ├── ACCEPTANCE.md            # 逐任务验收标准与验收记录
│   └── DESIGN.md                # AI 辅助写简历（⏸ 暂不实施）
├── .github/workflows/
│   ├── ci.yml               # push/PR：测试 + 构建 + 资源完整性门禁
│   ├── build-desktop.yml    # 三平台矩阵出包（dmg / msi+nsis / deb+AppImage）
│   └── build-android.yml    # APK + AAB
├── template.json            # ★ 公开示范数据（占位演示，随仓库分发）
├── data/                   # ★ 个人简历数据（已被 .gitignore 隔离，不进公开仓库）
│   └── resume.json         #   版本化数据源（多文件版启动时自动读取 ./data/resume.json）
├── dist/                    # 构建产物（.gitignore 忽略；含单文件版、安装包与迁移产物）
├── README.md / CHANGELOG.md / ROADMAP.md / CONTRIBUTING.md / LICENSE
└── package.json
```

**加载顺序**：`data.js` → `store/resume-store.js` → `store/native-bridge.js` → `app.js` → `export-extra.js` → `audit.js`。
`app.js` 依赖前三个；`export-extra.js` / `audit.js` 依赖 `app.js` 暴露的 `ResumeEditor.getData()`，必须排在最后。
（`npm run verify:assets` 会校验这个顺序与引用完整性。）

---

## 💾 数据存储位置

本项目**纯前端、无任何后端/数据库**，简历数据落在三个层面：

### 1. 初始化数据源（按优先级）

打开编辑器时按顺序尝试，先成功者为准：

1. **`data/resume.json`** —— 你的**私有实时数据**（被 `.gitignore` 隔离，不入库）；
2. 否则 **`template.json`**（仓库根目录）—— **公开示范数据**，随仓库分发，供他人 clone 后直接体验；
3. 都没有（`file://` 打开、或单文件版 fetch 失败）→ 回退 `js/data.js` 中的**极简空骨架**。

单文件版在构建时会把 `template.json` 注入进内联的 `data.js`，因此双击打开依然是完整示范内容。

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

## 🖨️ 关于导出

| 方式 | 入口 | 特点 |
|---|---|---|
| **PDF（静默）** | 「PDF（文字可选中 · 静默）」 | 经本地服务调本机 Chrome/Edge 的 headless 打印，**不弹对话框**直出矢量文字 PDF；需用 `npm start` 打开，失败自动回退到系统打印 |
| Word（`.docx`） | 「导出 Word（.docx）」 | 真 Office Open XML（`[Content_Types].xml` 等必需部件齐全），粗体是**真加粗**非伪样式，HR 与 ATS 通用 |
| 纯文本 / Markdown | 「导出纯文本 / 导出 Markdown」 | `.txt` 用于投递表单粘贴；`.md` 用于 GitHub / 博客 / 在线简历 |
| **原生打印** | 「打印 / 另存为 PDF」 | 浏览器打印管线，矢量文字 PDF：文字可选中、可搜索；会弹出系统打印对话框 |
| 图片型（兼容） | 「PDF 预览 / 下载（图片版）」 | html2canvas 截图拼合，**版式 100% 与屏幕一致**，但文字不可选、体积较大 |

> **「静默 PDF」为什么需要本地服务**：浏览器既无法直写磁盘，也无法在不弹打印对话框的前提下调用打印管线。
> 因此由 `tools/serve.js` 的 `POST /api/pdf` 复刻页面打印样式、用本机浏览器 headless 渲染，再把 PDF 流回前端下载。
> 这是本项目唯一依赖本地服务的导出方式，其余导出均在纯前端完成。

---

## 🧪 测试与构建

```bash
npm test               # 纯 Node、零依赖：203 条断言
npm run build          # 重建单文件版 → dist/简历编辑器-单文件.html
npm run verify:assets  # 资源完整性门禁：引用缺失 / 漏打包 / 模块未接线 / 隐私目录泄漏
npm run clean:html     # 剥离 index.html 中被外部编辑器注入的 data-page-node-id（提交前跑）
```

`npm test` 覆盖五类：核心逻辑与入口接线、打印样式、IIFE 封装边界，以及两个 T7 模块
——**投递体检**（`test/cases-audit.js`：三份假数据 × 全部检查项 + 接口契约 + 只读性）与
**多格式导出**（`test/cases-export.js`：自带一个独立于被测实现的 zip 解析器，逐字节校验本地头 / 中央目录 /
CRC / 标志位，并把 `document.xml` 引用的每个段落样式回溯到 `styles.xml` 的定义）。

> 导出模块的断言用**变异测试**反向验证过有效性：往 `js/export-extra.js` 注入 15 处真实缺陷
> （少转义 `&`、引用不存在的样式、纸张改 Letter、丢部件、压缩标记写成 deflate 等），
> 14 处被断言抓住，唯一漏网的是语义中性的等价变异。这轮验证当场揪出两个测试盲区，均已修复。

CI（`.github/workflows/ci.yml`）在每次 push / PR 自动运行前两项与资源门禁。

> **为什么需要 `verify:assets`**：本项目**没有打包器**，新增一个 js 模块要同时做两件事 ——
> 在 `index.html` 里加 `<script>`、在 `tools/build-single.js` 的白名单里登记。
> 漏掉任何一件都不会报错，只会**静默缺功能**（要么模块跑不起来，要么单文件版里没有它）。该脚本把这类问题变成 CI 失败。

---

## 🗺️ 版本与规划

- 各版本变更记录：见 [CHANGELOG.md](./CHANGELOG.md)。
- 后续优化方向：见 [ROADMAP.md](./ROADMAP.md)。
- 跨平台改造的**逐任务验收标准与验收记录**：见 [docs/ACCEPTANCE.md](./docs/ACCEPTANCE.md)。

> ⏸ **关于「AI 辅助写简历」**：仓库内 [docs/DESIGN.md](./docs/DESIGN.md) 存有一份完整的技术设计方案
> （选型调研、功能设计、UI 设计、目录结构），但**那只是未来演进方向，当前尚未实施** ——
> 本工具目前不含 AI 能力，请以本文描述的功能为准。

---

## 🤝 贡献

欢迎 Issue 与 PR，详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 📄 许可

[MIT](./LICENSE)。

---

## ⚠️ 隐私提醒

- `template.json`（仓库根目录）是**公开示范数据**，随仓库分发、用于无 `data/resume.json` 时的演示；`js/data.js` 只保留极简空骨架。
- **真实简历内容**存放在 `data/resume.json`，已被 `.gitignore` **整体忽略**，不会进入公开仓库。
- 飞书应用凭证存放在 `sync.config.json`（gitignored），由本地服务 / 原生层读取，**绝不下发到浏览器**；桌面与安卓版中它只存在于 Rust 进程内存与系统文件。
- 安装包构建时只把 `index.html` / `css` / `js` / `vendor` / `template.json` 复制进 `dist-desktop/`，**不含 `data/`**；可用 `strings <二进制> | grep <姓名>` 复核。
- 提交前建议自查：`npm run clean:html` 后再 `git add`，并用 `git grep` 扫描真实姓名 / 公司名等 PII。
