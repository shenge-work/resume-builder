# Changelog

本项目所有重要变更记录于此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### 新增

- **跨平台（桌面 / 安卓）**：引入 Tauri 2 原生壳（`src-tauri/`），同一份前端产物可打包为
  Windows `.msi`/`.exe`、macOS `.app`/`.dmg`、Linux `.deb`/`.AppImage`，以及 Android `APK`/`AAB`。
  通过 `withGlobalTauri` 保持**零前端依赖、无打包器**的既有风格。
- **原生层只做脏活**：飞书 HTTP 传输、凭证保管（`app_secret` 只存在于 Rust 进程）、token 缓存、
  multipart 上传、二进制流下载下沉到 Rust；业务编排仍留在 JS（`js/store/native-bridge.js` 复刻 `tools/feishu-sync.js` 的语义）。
- **数据门面（`js/store/resume-store.js`）**：把原先散落的 `fetch('/api/*')` 收敛为
  Local / Browser / Feishu 三种可替换实现，业务代码不再感知存储方式。
- **投递体检（`js/audit.js`）**：纯规则、只读的数据检查 —— 页数、内容完整性（含「一个板块都没有」「缺少一句话头衔」）、
  量化结果、ATS 友好度、时间倒序、敏感信息（身份证号等），分「必须处理 / 建议修改 / 可以更好」三级，点击条目可定位到对应板块。
- **多格式导出（`js/export-extra.js`）**：Word（`.docx`，真 OOXML、真加粗）、纯文本（`.txt`）、
  Markdown（`.md`），以及**静默 PDF**（经本地服务调用本机浏览器 headless 打印，产出文字可选的矢量 PDF，不弹打印对话框）。
- **响应式布局**：移动优先断点、移动端底部 Tab、A4 等比缩放（`transform: scale`，避免 `zoom` 引发的重排）、
  安全区与软键盘适配（`--vvh` / `--kb`）、返回键优先级语义（弹层 > 视图 > 真后退）。
- **主题（`js/theme.js`）**：日间 / 夜间切换，仍严格限定黑白灰。
- **飞书同步**：手动「上报到飞书」/「从飞书恢复」，数据双写飞书文档与云盘文件，借其版本历史留存每次更改。
- **CI 出包**：`.github/workflows/build-desktop.yml`（三平台矩阵）、`build-android.yml`（APK + AAB）。

### 修复

- **投递体检对「成果点」稳定误报（产品缺陷）**：项目成果点（`results`，如「QPS 提升 40%」）本就是 8–12 字短句，
  却被套用「描述过短（< 15 字）」的下限，导致**任何写得正常的简历都会被报「N 条描述过于单薄」**。
  现让 `results` 只参与「缺量化」与「超长」检查。
- **`tools/render-resume.js` 静默失效**：vm 沙箱未提供 `clearTimeout`，而 `app.js` 的数据写回防抖依赖它，
  缺失后脚本直接抛错（表现为「渲染失败」，但根因不在渲染）。已补齐定时器，并在产物落盘后显式退出。
- **单文件版「剩余外部引用」长期误报**：统计正则把 jsPDF 内部的拼接字符串算成了残留引用，于是恒定显示 1 个。
  现只统计真实引用，并打印出具体路径。
- **打印 / 静默导出的页边距不跟随设置（真实缺陷）**：`css/style.css` 里 `@page{size:A4;margin:14mm}` 是硬编码值，
  于是「页面边距」面板无论怎么调，`Ctrl/Cmd+P` 打印与静默导出的 PDF 边距都恒定 14mm —— **用户的设置形同虚设**。
  现由 `js/app.js` 动态维护 `@media print{@page{...}}`（随 `renderPreview()` 同步），`tools/render-resume.js` 注入同源规则；
  实测同一份简历 14mm → 4 页、30/25mm → 5 页，纸张仍为 A4。顺带修掉边界：`pageMargins` 里的 `null`
  不再被 `Number(null) === 0` 悄悄变成「0mm 边距」。
- **页边距回归防护**：新增 4 条断言钉住「动态 `@page` 接线 + 空值回退 + 默认值兜底」——
  这类失效在界面上完全看不出来，只能在测试里拦（断言总数 117 → **125**）。
- **导出模块的测试盲区（由变异测试发现）**：`js/export-extra.js` 此前只有临时脚本验证过、
  没有进入回归测试。补齐 `test/cases-export.js`（14 用例 / 78 断言）时用变异测试反向校验断言有效性，
  当场抓出两个真实盲区并修掉：① 原先只校验 zip **中央目录**的压缩标记，把**本地文件头**写成 deflate(8)
  时全部断言仍通过 —— 但流式解压器只读本地头，会解出损坏文件（现两处都校验，含 UTF-8 文件名标志 `0x0800`）；
  ② 「技能整句用『；』连接」的用例只有一条长句，`join` 的分隔符根本不可观测，该规则永远测不出来（已补第二条）。
  断言总数 125 → **203**。

### 变更

- **`tools/serve.js` 仅监听回环地址**：`listen(PORT, '127.0.0.1')`，同网段他人无法再读取本地简历数据。
- **`index.html` viewport 补 `viewport-fit=cover`**：此前 `env(safe-area-inset-*)` 恒为 0，安全区适配实际是死代码。
- **`@media print` 补隐藏清单**：`.mobile-tabbar` / `.sync-pane` 此前未隐藏，手机打印会把底部 Tab 打进 PDF。
- **测试运行器修复**：`test/run.js` 原先硬编码只读 `test/cases.js`，导致 `test/cases-audit.js`（294 行）
  **从未被执行过**；且沙箱缺 `clearTimeout` 会让套件提前终止。两者均已修复，断言总数 49 → **117**。

### 安全

- 新增前端资源完整性门禁（`npm run verify:assets`）与注入属性清理（`npm run clean:html`），并接入 CI。

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
