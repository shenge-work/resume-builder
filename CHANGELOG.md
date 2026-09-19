# Changelog

本项目所有重要变更记录于此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

> **发版规则（与 CI 联动，改动前请先读 `docs/发版说明.md`）**
>
> 1. 版本号以 `src-tauri/tauri.conf.json` 的 `version` 为**唯一权威**，`package.json` 必须与之一致
>    （发版流水线会校验，不一致直接失败）。
> 2. 发版时把下面 `## [Unreleased]` 整段改成 `## [x.y.z] - YYYY-MM-DD`，
>    并新开一个空的 `## [Unreleased]`。
> 3. GitHub Release 的**更新说明由流水线从本文件对应版本章节自动抽取**；
>    若找不到对应章节会退回 `[Unreleased]`，两者都没有则**发版失败** —— 即「必须有版本更新描述」。

---

## [Unreleased]

### 新增

- **上传 PDF / JSON 简历到简历库**：左抽屉新增「上传」按钮（`.pdf` / `.json`）。
  JSON 直接导入为一份新简历；PDF 经本地服务用 vendored pdf.js（`vendor/pdf.min.js`，Apache 2.0，
  仅服务端使用、不进前端产物）提取文本，尽力识别姓名 / 邮箱 / 手机号 / 学历线索，
  正文整篇保留进「导入原文（请校对整理）」板块供继续编辑 —— 解析只做「识别 + 保留原文」，不臆造结构。
- **飞书扫码授权（OAuth 授权码模式）**：「飞书同步 → 同步配置」新增「扫码授权」——
  后端预配置应用身份，前端无需填写 App ID，一键打开飞书授权页，手机扫码授权后服务端以授权码换取
  user_access_token（含 `drive:drive` / `docx:document` scope），凭证存本机
  gitignored 的 `sync.oauth.json`，绝不进浏览器；支持过期自动用 refresh_token 刷新、
  一键解除授权。
- **飞书「扫码注册个人应用」（Device Flow，拿到 App ID / App Secret）**：新增「方式二 · 扫码注册个人应用」——
  借鉴 channel-hub 的 `LarkPersonalQrcodeService`，复刻飞书官方 SDK 的 RegisterApp 设备流（RFC 8628）。
  点「扫码注册个人应用」→ 后端向 `accounts.feishu.cn/oauth/v1/app/registration` 发起 `begin` 拿到设备码与二维码 URL
  → 浏览器用 vendored `qrcode-generator.js` 渲染二维码 → 手机飞书扫码确认 → 飞书后台自动创建一个 PersonalAgent（个人应用）
  并以 `poll` 轮询（尊重飞书返回的 `interval` 节流、`slow_down` / 过期 / 域名切换均处理）；
  成功即拿到 `client_id` / `client_secret`，后端自动写入 `sync.config.json` 并探测绑定云盘文件夹，**无需在开放平台手动抄写凭证**。
  至此「应用身份」也由扫码获取，与「用户身份」扫码授权形成两种方式并存。
- 测试从 311 条增至 **329 条**（新增飞书设备流注册用例 11 条：addons 编码往返 + poll 各状态映射；配置弹窗 UI / 路由冒烟断言若干）。当前以 `npm test` 实测为准。
- **同步链路优先使用扫码身份**：「上报到飞书 / 从飞书恢复」现在优先以**扫码授权的用户身份**
  读写你自己的云盘/文档（未扫码时自动回退应用身份）；上报结果会标注所用身份。
  两套身份的云盘文件/文档 token 在本地 state 中分键隔离，互不串写。

### 变更

- **简历卡片操作收进「⋯」菜单**：重命名 / 复制 / 删除不再平铺在卡片上（鼠标扫过卡片时极易误点，
  尤其「删除」），改为点卡片右上角的「⋯」弹出菜单。菜单挂在 `body` 上的固定层
  （抽屉列表是 `overflow:auto`，绝对定位子元素会被裁切），自动避开视口越界；
  点空白 / Esc / 滚动 / 改窗口大小都会关闭；触屏设备（无 hover）「⋯」常显。
  点「⋯」不会顺带打开或切换该份简历（点击与回车均 `stopPropagation`）。
- **移除右缘重复的「简历」把手**：`railResumeTab` 与抽屉自身的折叠按钮 / 左缘展开把手功能重复，
  已删除；抽屉仍保留自身两个收展入口，手机上仍可从「同步 → 我的简历」打开。
- 测试从 267 条增至 **295 条**（新增 PDF 解析纯函数 16 条 + 扫码授权 URL 6 条 + 认证分键 3 条等）。
- 测试从 295 条增至 **308 条**（本次新增：卡片操作菜单 7 条 + 右缘把手移除 2 条；其余为同批扫码授权预配置用例）。
- **右缘标签改为与编辑面板同款推展、且多选一**：「工具菜单」不再是垂直居中的浮动小卡片，
  改为 `.app` 的 flex 兄弟列（通栏到底、宽 460，平板 380），展开时把预览推窄、纸张自动重新居中缩放，
  位置与编辑面板完全一致；面板之间、面板与编辑面板之间互斥（展开任一方即收起另一方）。
  涉及 `index.html`、`css/style.css`、`js/app.js`。
- 测试从 308 条增至 **311 条**（新增：面板↔编辑面板互斥 2 条 + 推展布局结构 3 条）。
- **飞书扫码授权：应用身份改为后端预配置**，前端无需填写 App ID / App Secret，直接点「扫码授权」即可；管理员仍可通过「方式二 · 自动探测并绑定」首次配置应用身份。调整 `tools/feishu-oauth.js`、`tools/serve.js`、`js/app.js`、`index.html`、`test/cases-oauth.js`。

---

## [1.1.0] - 2026-09-19

**首个跨平台（桌面 + Android）发布。** 在 1.0.0 的浏览器版之上，引入 Tauri 2 原生壳：
同一份前端产物现在能打包成 Windows / macOS / Linux 安装包与 Android APK / AAB，
并新增 GitHub Release 自动发版流水线（三平台 + 安卓一键出包并附带本文件作为更新说明）。

### 新增

- **跨平台（桌面 / 安卓）**：引入 Tauri 2 原生壳（`src-tauri/`），同一份前端产物可打包为
  Windows `.msi`/`.exe`、macOS `.app`/`.dmg`、Linux `.deb`/`.AppImage`，以及 Android `APK`/`AAB`。
  通过 `withGlobalTauri` 保持**零前端依赖、无打包器**的既有风格。
- **自动发版流水线（`.github/workflows/release.yml`）**：推 `v*` 标签或手动一键触发，
  自动构建三平台桌面包与 Android 包，聚合成一个 GitHub Release，附 `SHA256SUMS.txt` 校验文件；
  版本号与更新说明分别取自 `tauri.conf.json` 与 CHANGELOG，无需手工编辑 Release 页面。
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
- **Android 构建四连坑（均在 CI 实测定位并修复）**：
  ① `android-actions/setup-android@v3` 的默认包列表含已被 Google 下线的 `tools` → 20 秒即失败，升 `@v4`；
  ② `package.json` 缺 `"tauri": "tauri"` script，而 `tauri android init` 会把
  `npm run -- tauri android android-studio-script` **烘焙进生成的 Gradle 工程** → `:app:rustBuildArm64Debug`
  必失败；
  ③ release 签名补丁里写了 `java.util.Properties` 全限定名，被 Gradle Kotlin DSL 的 `java` 扩展
  **遮蔽** → `Unresolved reference: util`；正确修法是改用顶层 `import` + **简单名**，
  而不是「去补 import」；
  ④ 顺着 ③ 的错误修法无条件插了一整块 import，而模板**第一行本来就是** `import java.util.Properties`
  → 重复 import → `Conflicting import, imported name 'Properties' is ambiguous`。
  现在补丁改为**逐条「先查再插」**，并按官方文档把 `signingConfigs` 插进 `android{}` 内
  （`buildTypes` 之前）而非末尾追加第二个 `android{}`。详见 `docs/Android版构建说明.md` 第 5.4 / 8 节。

### 变更

- **`tools/serve.js` 仅监听回环地址**：`listen(PORT, '127.0.0.1')`，同网段他人无法再读取本地简历数据。
- **`index.html` viewport 补 `viewport-fit=cover`**：此前 `env(safe-area-inset-*)` 恒为 0，安全区适配实际是死代码。
- **`@media print` 补隐藏清单**：`.mobile-tabbar` / `.sync-pane` 此前未隐藏，手机打印会把底部 Tab 打进 PDF。
- **测试运行器修复**：`test/run.js` 原先硬编码只读 `test/cases.js`，导致 `test/cases-audit.js`（294 行）
  **从未被执行过**；且沙箱缺 `clearTimeout` 会让套件提前终止。两者均已修复，断言总数 49 → **117**。
- **CI 环境加固**：所有用到的 action 升到当前最新稳定
  （`actions/checkout@v7`、`actions/setup-node@v7`、`actions/setup-java@v6`、`actions/upload-artifact@v7`、
  `android-actions/setup-android@v4`），消除 Node 20 弃用警告。

### 安全

- 新增前端资源完整性门禁（`npm run verify:assets`）与注入属性清理（`npm run clean:html`），并接入 CI。
- **Android 上传密钥库绝不入库**：仓库根 `.gitignore` 与 `android-signing/.gitignore` 双层忽略；
  密钥库只以 base64 存于 GitHub Secrets，CI 时解码到 `$RUNNER_TEMP` 并随 runner 销毁。
- **新增 APK 签名证书自动断言**：签名配置失败是静默的（Gradle 不报错、只悄悄出 debug 包），
  现由 CI 读取产物证书 SHA-256 与期望值硬比对，不符即让构建失败。

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
