# 路线图（Roadmap）

记录 resume-builder 后续优化方向。已上线内容见 [CHANGELOG.md](./CHANGELOG.md)；
跨平台改造的**逐任务验收标准与验收记录**见 [docs/ACCEPTANCE.md](./docs/ACCEPTANCE.md)。

状态图例：📋 规划中 · 🚧 进行中 · ✅ 已完成 · ⏸ 暂不实施

---

## 未来演进（⏸ 暂不实施）

> 这一节是**已经完成设计、但当前明确不实施**的方向。设计文档已沉淀在仓库里，
> 将来要做时可直接照着执行，不必重新调研。**当前代码库不含这些能力。**

- ⏸ **AI 辅助写简历（含项目改名 Resume Studio）**
  完整技术设计方案见 [docs/DESIGN.md](./docs/DESIGN.md) —— 含技术选型、功能清单（JD 诊断 / 划词润色 / 全文体检等）、
  UI 线框、目录结构与分阶段路线。要点摘录：
  - **关键选型结论**：主流模型厂商（DeepSeek / 智谱 GLM / OpenAI / Anthropic）**全部禁止浏览器直连**，
    纯前端 BYOK 行不通，AI 请求必须经本地 Node 转发层（扩展现有 `tools/serve.js`，新增 SSE 透传）。
  - **交互原则**：AI 永不直接落笔，必经 Diff 审阅；作用范围显式化；应用进撤销栈可 Ctrl+Z；
    事实性护栏拦截编造的数字/时间/公司名；可脱敏再发送。
  - **改造策略**：小步快跑 —— 不转 ES Module、不拆 `js/app.js`，AI 以新增 `js/ai/` 平行接入。
  - 默认模型 DeepSeek（`deepseek-v4-flash` / `deepseek-v4-pro`）。

- ⏸ **配套：项目改名为 Resume Studio（简历工坊）**
  与 AI 改造一并考虑，同样暂不实施。届时需同步更新 `package.json`、`README.md` 与仓库名。

---

## 已完成（近期）

- ✅ **本地服务只监听回环地址** —— `tools/serve.js` 改为 `listen(PORT, '127.0.0.1')`，同网段他人无法再读取 `data/resume.json`。
- ✅ **一键静默下载「可选中文字」PDF** —— `tools/serve.js` 新增 `POST /api/pdf`（复刻页面打印样式 + 本机浏览器
  headless 渲染），前端 `ResumeExport.exportPdfSilent()` 直接下载矢量文字 PDF，不弹打印对话框（失败自动回退系统打印）。
- ✅ **跨平台桌面 / 安卓应用** —— 引入 Tauri 2 原生壳，一份前端产物产出 Windows / macOS / Linux 安装包与 Android APK；
  原生层负责凭证保管与网络传输。方案见 [docs/CROSSPLATFORM-DESIGN.md](./docs/CROSSPLATFORM-DESIGN.md)，
  构建见 [docs/DESKTOP-BUILD.md](./docs/DESKTOP-BUILD.md) / [docs/ANDROID-BUILD.md](./docs/ANDROID-BUILD.md)。
- ✅ **投递链路三件套** —— 内容体检（`js/audit.js`）、多格式导出（Word / 纯文本 / Markdown）、静默 PDF。
- ✅ **前端资源完整性门禁** —— `npm run verify:assets`，已接入 CI，专防「新增模块漏接线 / 漏打包」这类静默失效。

---

## 高优先级（直接影响「敢放心用 / 真开源可用」）

- 📋 **跨端编辑冲突合并**
  现状：手机与电脑可同时编辑同一份简历（经飞书或 `data/resume.json` 交换），但后写入者会**整体覆盖**先写入者。
  目标：字段级 3-way merge —— 记录 `baseVersion`，冲突时保留双方内容并按字段提示选择；飞书的版本历史作最终兜底。
  出处：跨平台设计的 P4 阶段，见 [docs/CROSSPLATFORM-DESIGN.md](./docs/CROSSPLATFORM-DESIGN.md)。**尚未实施。**

- 📋 **凭证存入系统钥匙串**
  现状：桌面 / 安卓版的飞书 `app_secret` 保存在应用数据目录的 `sync.config.json`（已在 `.gitignore` 内，但仍是明文）。
  目标：改用系统钥匙串（macOS Keychain / Windows Credential Manager / Android Keystore）。
  出处：跨平台设计的 P5 阶段。**尚未实施。**

- 📋 **撤销范围细化**
  现状：应用级撤销会覆盖输入框原生逐字符撤销（`Ctrl/Cmd+Z` 在输入框内也是整段撤销）。
  目标：输入框内保留原生撤销，仅在结构性操作（增删/移动/拖拽/导入/重置）上做应用级撤销。

- 📋 **`js/data.js` 模块封装**
  现状：`data` / `currentFonts` / `currentSpacing` 为全局变量（IIFE 闭包可读写）。
  目标：改为显式模块导出，彻底消除全局命名空间残留，提升可测试性与可维护性。

---

## 中优先级（通用化 / 体验）

- 📋 **多模板 / 主题**
  新增 1–2 套排版模板（如单栏紧凑、双栏侧边），主题切换（配色 / 字体集），与现有「字号/间距」配置解耦。

- 📋 **转 ES Module**
  现状：`index.html` 以全局脚本顺序加载 `data.js` → `app.js`（IIFE）。
  目标：改为 `import/export` 模块；需解决 `file://` 下模块脚本的 CORS（建议本地服务器或构建期打包）以及单文件版构建的相应适配。

- 📋 **更多板块类型与字段**
  如「教育背景」「证书/语言」「自我评价（独立长文）」「作品集链接」等；配合板块增删能力形成完整简历结构。

- 📋 **模板即 JSON（可分享模板）**
  在现有「数据 JSON 导入/导出」基础上，拆分出「版式模板 JSON」与「内容 JSON」，便于复用他人排版。

---

## 低优先级 / 探索

- 📋 **国际化（i18n）**：界面中英双语切换。
- 📋 **图片型 PDF 体积优化**：当前 `scale:3` 对超长简历 + 移动端有内存上限风险，可改为按页分片渲染。
- 📋 **多份简历管理**：localStorage 支持切换/管理多份简历。
- 📋 **截图/预览分享**：生成简历图片用于社交分享。

---

## 已否决 / 暂不做

- ❌ **服务端账号体系**：定位为纯前端、零后端工具，不做注册/登录/云同步（数据可移植性由 JSON 导入导出覆盖）。
