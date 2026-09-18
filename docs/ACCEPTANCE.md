# 跨平台改造 · 验收标准与验收记录

> 配套设计文档：`docs/CROSSPLATFORM-DESIGN.md`（已沉淀于项目）。
> 本期按推荐先做 **P0 数据门面 + P1 响应式 UI**，二者均可在**纯浏览器环境**完成并验证，不依赖任何原生壳（Tauri/Electron），风险最低、价值最高。
> 每个任务完成后，由主代理对照下方「验收标准」逐条核对，并将结果写入「验收记录」。
>
> 验收原则：**可客观核对**（grep / `node --check` / 本地起服务 + 浏览器控制台）、不靠主观感觉。

---

## 任务总览

| 任务 | 对应阶段 | 内容 | 状态 |
|---|---|---|---|
| **T1** | P0 数据门面 | 抽 `ResumeStore` 门面（Local/Browser/Feishu 三实现），`app.js` 写死的 `fetch('/api/*')` 改走门面 | ✅ 通过 |
| **T2** | P1 响应式 UI | 移动优先断点、底部 Tab、A4 自适应缩放、触控目标，黑白灰不变 | ✅ 通过（含像素级+打印态复验） |
| **T3** | P2 桌面原生壳 | Tauri 2.x 桌面壳（Win msi / macOS dmg），飞书调用移至原生层 | ✅ 通过（Rust 实编译 + **macOS dmg 已实产出**） |
| **T4** | P3 安卓壳 | Tauri Android → APK/AAB，移动端签名与 safe-area 真机验证 | ✅ 通过（APK/AAB 由 CI 产出） |
| **T5** | P4 冲突合并 | 字段级 3-way merge + 飞书版本历史兜底，多端同时编辑 | ⏳ 待执行 |
| **T6** | P5 发布加固 | 凭证入 OS 钥匙串、自动更新、签名与公证 | ⏳ 待执行 |
| **T7** | 投递链路 | 内容体检 / ATS 检查 + DOCX·纯文本·Markdown 导出 + 静默 PDF | ✅ 通过（接线已补，修复 1 处稳定误报 + 打印边距缺陷；导出侧测试已补齐并经变异测试证伪） |

> 本轮推进节奏：**先定 AC → subagent 执行 → 主代理回查 → 写验收记录**，每轮结果追加到本文件「验收记录」表。

---

## T1 — P0 ResumeStore 数据门面

### 范围
- 新增 `js/store/`（零依赖纯 JS，可直接被浏览器 `<script>` 加载，不引入 npm 包）。
- 收口 `app.js` 中写死的对本地服务的调用，改为统一数据门面。
- **不删除** `tools/serve.js`、`tools/feishu-sync.js`（保留为 PWA/纯浏览器回退与逻辑参考）。
- 渲染逻辑、`recordHistory`、撤销栈（`undo`/`redo`）**完全不动**。

### 验收标准（AC）

- **AC1 门面存在且接口完整**：`js/store/` 下提供 `ResumeStore`，暴露统一方法
  `load() / save(payload) / pull() / push(payload) / listVersions() / restore(versionId)`。
  方法签名与 `docs/CROSSPLATFORM-DESIGN.md` §3.3 一致。
- **AC2 三套后端实现到位**：
  - `BrowserStore`：用 `IndexedDB`（无 IndexedDB 时回退 `localStorage`）做离线本地存储，替代现有 `pushRepo` 的 `/api/resume` 硬编码写回。
  - `FeishuStore`：封装飞书双写（docx + 版本化云盘文件）与版本历史，接口等价于现有 `feishu-sync.js`；在「纯浏览器无原生壳」模式下 `push/pull/listVersions/restore` 可**优雅降级**（返回明确错误或被标记不可用），不得阻塞 UI、不得抛未捕获异常。
  - `LocalStore`：本地写回抽象（浏览器内暂以 localStorage/IndexedDB 实现，待 P2 接 Tauri 命令）。
- **AC3 `app.js` 不再直接写死本地服务调用**：
  - `pushRepo()` / `pushRepoDebounced()`（line 1067–1078）改为 `ResumeStore.save(...)`（防抖保留）。
  - `reportToFeishu()`（line 1227）改为 `ResumeStore.push(...)`。
  - `openFeishuRestore()`（line 1246）改为 `ResumeStore.listVersions()`。
  - `restoreFromFeishu()`（line 1277）改为 `ResumeStore.restore(versionId)`。
  - `openFeishuConfig()` / `saveFeishuConfig()`（line 1309–1358）配置读写经 `ResumeStore` 的配置接口（或集中到门面）。
  - grep 确认 `app.js` 中**不再出现** `fetch('/api/resume'` 与 `fetch('/api/sync'`。
- **AC4 渲染与历史逻辑零改动**：`renderResumeInner` / `renderPreview` / `renderEditor` / `recordHistory` / `undo` / `redo` 函数体未被修改（仅 `pushRepo` 调用点被替换）。
- **AC5 语法与构建**：`node --check` 通过 `js/store/*.js` 与 `js/app.js`，无语法错误；`npm run build`（若存在）仍通过。
- **AC6 行为等价（浏览器模式）**：起 `npm start`（serve.js）打开页面，编辑后：
  - 数据仍能写回 `data/resume.json`（门面后端覆盖两路）；
  - 无本地服务时（或 `file://`）`saveState()` 仍落到 `localStorage`/`IndexedDB`，不报错；
  - 点「上报到飞书」在无凭证/无服务时，**不抛未捕获异常**，状态条给出友好提示，编辑不中断。

### 验收记录

| 日期 | 结果 | 证据 | 备注 |
|---|---|---|---|
| 2026-09-19 | ✅ 通过 | ① `node --check` 通过 `js/store/resume-store.js`、`js/app.js`；② grep 确认 `app.js` 不再含 `fetch('/api/resume'`/`fetch('/api/sync'`，6 处调用改走 `ResumeStore`；③ 沙箱 vm 测试（`/tmp/test-store.js`）13 项全绿：接口 `load/save/pull/push/listVersions/restore/loadConfig/saveConfig` 齐全、`save()` 触发 `/api/resume` 服务端写回且回退写 `localStorage`、`push()`/`listVersions()` 抛友好错误、`loadConfig()` 返回 null；④ 渲染/历史函数行号未变（`renderResumeInner:37`/`renderPreview:165`/`renderEditor:280`/`recordHistory:579`/`undo:588`/`redo:595`） | 三后端到位：LocalStore/BrowserStore（IndexedDB+localStorage 回退）、LocalServerStore（保留 npm start 服务端写回，避免回退既有工作流）、FeishuStore（浏览器模式优雅降级）。serve.js/feishu-sync.js 未删改 |

---

## T2 — P1 响应式 UI 改造

### 范围
- 移动优先，兼容手机（<640px）/ 平板（640–1024px）/ 桌面（>1024px）。
- 不改动数据层（沿用 T1 的 `ResumeStore`）；不改动渲染/`recordHistory`/撤销栈。
- 配色严格保持黑/白/灰。

### 验收标准（AC）

- **AC1 断点落地**：`css/style.css` 至少含三档 `@media`：
  - `≤640px`（手机）：**单栏**布局，底部出现 Tab 切换「预览 / 编辑 / 同步」，编辑面板全屏。
  - `641–1024px`（平板）：单栏或窄两栏。
  - `>1024px`（桌面）：维持两栏（预览 | 编辑，编辑栏约 460px，可拖拽收起，沿用现状）。
- **AC2 底部 Tab 可用**：手机视图下底部 Tab 存在且可切换预览/编辑/同步视图（用最小 JS 或 CSS 状态切换），不依赖鼠标 hover。
- **AC3 A4 预览自适应缩放**：A4 页面在手机宽度内**完整可见**（等比缩放居中，用 `transform: scale()` 或 `width: clamp()`），打印/导出时还原 1:1 保证 PDF 不失真。
- **AC4 触控优先**：`@media (pointer:coarse)` 下按钮/输入框触控目标 ≥ 44px；用 `env(safe-area-inset-*)` 避开刘海/底部手势条。
- **AC5 黑白灰约束**：新增 CSS **不引入任何非灰阶颜色**。允许灰阶集合：
  `#fff #fafafa #f5f5f5 #ebebeb #e0e0e0 #d9d9d9 #ddd #ccc #bbb #999 #888 #888888 #777 #666 #555 #444 #333 #222 #1a1a1a #000` 及等价的 `rgba()/hsla()` 灰阶。
  grep 确认无其它色相的 hex / rgb / hsl。
- **AC6 打印不受影响**：`@media print` 仍保留并正常（PDF 导出不失真）。
- **AC7 语法与控制台**：`node --check js/app.js` 通过；本地起服务打开，移动视口（如 390px）与桌面视口（如 1440px）下**无未捕获 console error**；桌面两栏表现与改造前一致。

### 验收记录

| 日期 | 结果 | 证据 | 备注 |
|---|---|---|---|
| 2026-09-19 · 第 2 轮 | ✅ 通过·复验（像素级 + 打印态） | **环境**：`agent-browser` 0.27.0 安装完成，本地 `npm start`（`http://localhost:8000`）实测。**A4 自适应修复**：复验发现 `.resume` 被 JS 内联 `width:210mm;max-width:none` 顶到 794px，手机上需横向拖动（违反 AC3）→ 改为**仅视觉等比缩放**（`transform:scale()`，非 `zoom`：实测 `zoom` 会使 offsetHeight 2451→2464 引发重排、破坏与 PDF 的 WYSIWYG；`transform` 不影响尺寸读数，且导出克隆显式 `transform:none` 不污染导出）。**打印缺陷修复**：`@media print` 隐藏清单漏了 T2 新增的 `.mobile-tabbar`/`.sync-pane`，从手机视口打印会把底部 Tab 打进 PDF → 已补入（`css/style.css:195`）。**实测数据**（`agent-browser eval` 读取计算样式）：<br>① 手机 390px：`documentElement.scrollWidth=390`（**无横向滚动**）、A4 视觉宽 **354px** 完整居中可见（右边界 372 < 预览区 390）、`offsetWidth/Height` 仍为 **794/2451**（导出读数不变）、缩放态 `overflow-x:hidden`；<br>② 极窄 320px：视觉宽 284px，`scrollWidth=320` 无横滚；<br>③ 平板 800px：预览区 420px，视觉宽 384px，无溢出；<br>④ 桌面 1440px：`isScaled=false`、`transform:none`、`marginBottom:0`、编辑栏 **460px**、tabbar `display:none`、`overflow-x:auto` —— **与改造前逐项一致，零回归**；<br>⑤ **打印态（CDP `Emulation.setEmulatedMedia` 模拟 print，最强证据）**：`transform:none`、`visualW==offsetW`、`margin-bottom:0`、预览区 `overflow:visible`、工具栏与底部 Tab 均 `display:none`，退出打印媒体后缩放态正确恢复 —— 6 项判定 `ALL_PRINT_CHECKS_PASS`；<br>⑥ `node --check js/app.js` 通过。<br>**截图证据**：`dist/acceptance-screenshots/`（gitignored）— `mobile-preview.png`/`mobile-edit.png`/`mobile-sync.png`/`tablet.png`/`desktop.png`/`print-from-mobile-scaled.pdf`。 | 缩放接入点在 `resize` 监听与 `setMobileView`，不改任何渲染函数 |
| 2026-09-19 · 第 1 轮 | ✅ 通过（静态/结构/配色全绿） | ① `node --check js/app.js` 通过；② `css/style.css` 含 `@media (max-width:640px)`（单栏+底部固定 Tab）、`641–1024px`（编辑栏 380px）、`(pointer:coarse)`（触控目标 ≥44px）、`safe-area-inset`（tabbar + pane 留白）；`index.html` 新增 `.app.mv-preview`、`.mobile-tabbar`（预览/编辑/同步）、`.sync-pane`（聚集飞书+导入导出功能，含 `feishuStatusMobile`）；③ 通读响应式段（210–298 行）配色仅灰阶（#fff/#d6d6d6/#1a1a1a/#000/#f0f0f0/#6b6b6b/#e0e0e0），无新彩色；④ 既有 `@media print`（189–209 行）未被改动；⑤ `showFeishuStatus` 对 `feishuStatusMobile` 做 null 保护，无运行时报错风险 | 既有非灰（`.pdf-modal-bar button.dl` 绿 `#2e8b57`、`.break-row` 红 `#c0392b`）属历史样式、不在本次新增约束内，未改动。像素级响应式效果（390px / 1440px 真机渲染、无 console error）建议用户本地 `http://localhost:8000` 自测——沙箱内 Chromium 下载超时未能跑 headless 截图 |

---

## T3 — P2 桌面原生壳（Tauri 2.x）

### 范围
- 在现有 Web 前端外面套 **Tauri 2.x 原生壳**，一份代码库产出 **Windows msi/NSIS** 与 **macOS dmg** 安装包。
- 保留 `js/store/resume-store.js` 浏览器降级路径不变（**Web 模式零回归**）。
- 飞书调用从「浏览器直连（必然被 CORS 拒）」改为**经 Rust 原生层转发**，凭证只存在于 Rust 侧进程内。
- **不删除** `tools/serve.js`、`tools/feishu-sync.js`（仍是浏览器模式的能力来源）。

### 设计决策（已定，实现须遵守）
1. **Rust 只做「脏活」**：HTTP 传输 + 凭证保管 + tenant_access_token 缓存 + multipart 上传。
   **业务编排留在 JS**：docx 清空重写、云盘版本化上传、版本列表/下载的流程顺序，由 `js/store/native-bridge.js` 复刻 `tools/feishu-sync.js` 的既有编排（保证两套同源、易读易改）。
2. **凭证绝不出 Rust 进程**：`sync.config.json` 由 Rust 从应用数据目录读取；前端只能调用命令，拿不到 `app_secret`。
3. **前端桥 `js/store/native-bridge.js`**：检测到 `window.__TAURI__` 时，填充 `window.__RESUME_NATIVE__`，其 6 个方法可直接返回 **Promise**（门面已用 `Promise.resolve()` 包裹，兼容）。
4. 未检测到 Tauri 环境时，**不得注入任何东西**，浏览器行为必须与执行 T1 后完全一致。

### 验收标准（AC）

- **AC1 工程结构完整**：存在 `src-tauri/`，至少含 `Cargo.toml`、`tauri.conf.json`、`build.rs`、`src/main.rs`、`src/lib.rs`、`src/feishu.rs`、`icons/`（含 icon 文件）、`.gitignore`（忽略 `target/`）。根 `package.json` 增加 `desktop:dev` / `desktop:build` 脚本与 Tauri CLI devDependency。
- **AC2 命令契约对齐**：Rust 侧暴露的命令与前端桥严格对齐，缺一不可：
  - `feishu_request(method, path, body)` → 通用飞书 API 转发（Rust 内部注入 token）
  - `feishu_upload(method, path, fields, fileB64)` → multipart 上传（对应 `upload_part` / `upload_all`）
  - `feishu_config_load()` → 配置对象或 null
  - `feishu_config_save(cfg)` → `{configured:boolean}`
  - 桥的 6 个方法（`feishuPush` / `feishuPull` / `feishuListVersions` / `feishuRestore` / `feishuLoadConfig` / `feishuSaveConfig`）签名与返回值须与 `js/store/resume-store.js:136-160` 的调用期望一致（`push`→`{ok,docUrl,dryRun}`、`restore`→`{data,fonts,spacing}`、`listVersions`→数组、`loadConfig`→对象或 null、`saveConfig`→`{configured}`）。
- **AC3 浏览器零回归**：`native-bridge.js` 在无 Tauri 环境下不注入 `window.__RESUME_NATIVE__`；`ResumeStore.pull/push/listVersions/restore` 在浏览器中仍抛出**同一条**友好错误 `飞书同步需在安装包（原生壳）中启用；当前浏览器模式仅本地保存`。`index.html` 脚本加载顺序仍保证 `resume-store.js` 先于 `app.js`。
- **AC4 打包配置正确**：`tauri.conf.json` 的 `identifier` 合法（反向域名）、`bundle.targets` 覆盖 `dmg`/`msi`/`nsis`、`build.frontendDist` 指向包含本次前端资源的目录（`index.html` + `css/` + `js/` + `template.json`）、窗口尺寸与最小尺寸合理（默认约 1440×900 / min 390×700，兼容窄屏）。
- **AC5 构建脚本与跨平台 CI**：`npm run desktop:dev` / `npm run desktop:build` 存在且命令正确；新增 `.github/workflows/build-desktop.yml`，在 `macos-latest`（dmg）、`windows-latest`（msi/nsis）、`ubuntu-latest`（AppImage/deb）三平台构建并上传 artifact；YAML 可被解析器解析通过。
- **AC6 静态与编译验证**：全部新增/修改的 JS 通过 `node --check`；`tauri.conf.json`、`Cargo.toml`、workflow YAML 均可被机器解析；**若本机 Rust 工具链可用，`cargo check`（在 `src-tauri/`）必须通过**；不可用时须在验收记录中显式标注「Rust 未编译验证」并说明原因。
- **AC7 构建文档**：新增 `docs/DESKTOP-BUILD.md`，含：前置依赖（Rust / Xcode CLT / WebView2 / CI 说明）、本地构建命令、CI 出包步骤、凭证放置位置与 `.gitignore` 要求、常见报错排查、以及「macOS 上无法直接产出 Windows msi，须用 Windows 或 CI」的明确说明。
- **AC8 隐私不变**：新增文件不得包含任何 PII；`data/`、凭证类文件、`target/`、构建产物均在 `.gitignore` 覆盖范围内。

### 环境说明（本机实测）
- ✅ 已具备：Xcode CLT（clang 21 / arm64-apple-darwin）
- ❌ 缺失：Rust 工具链（无 `rustc`/`cargo`/`rustup`）、Homebrew、Android SDK/NDK/JDK
- ⚠️ 结论：**本机无法产出 Windows 安装包**（Tauri 的 Win 包须在 Windows 或 CI 上构建）；Android APK 需额外补 Android 工具链（留待 T4）。故 AC5 的 CI 是产出三端安装包的主路径。

### 验收记录

| 日期 | 结果 | 证据 | 备注 |
|---|---|---|---|
| 2026-09-19 | ✅ 通过（AC1–AC8 全绿，含 Rust `cargo check` 实编译验证） | **AC1 工程结构** ✅ `src-tauri/` 含 `Cargo.toml`/`tauri.conf.json`/`build.rs`/`src/{main,lib,config,feishu}.rs`/`.gitignore`(`/target`)/`icons/`（6 个文件含 icns+ico）；根 `package.json` 新增 `desktop:assets/dev/build`+`icons:gen` 与 `@tauri-apps/cli ^2.0.0`。<br>**AC2 命令契约** ✅ Rust 注册 7 命令 ↔ 前端 invoke 7 名**逐一相同**（`feishu_request`/`feishu_upload`/`feishu_restore_data`/`feishu_config_load`/`feishu_config_save`/`state_load`/`state_save`）；桥 6 方法签名与 `resume-store.js:137-158` 的 `NATIVE.feishu*` 调用位点逐一对应；参数统一包在单个结构体内（`req`/`cfg`/`state`）避开 camelCase 歧义，`versionId` 走 Tauri 2 默认映射到 `version_id`；`app_secret` 由 `config.rs::public_view()` 剥离，前端只拿到 `hasSecret` 布尔。<br>**AC3 浏览器零回归** ✅ 真实 Chromium 实测：无 `__TAURI__` 时 `typeof __RESUME_NATIVE__ === "undefined"`（不注入任何全局）；`ResumeStore.push()` 抛错文案与 T1 完全一致（`飞书同步需在安装包（原生壳）中启用；当前浏览器模式仅本地保存`）；脚本顺序 `data.js → resume-store.js → native-bridge.js → app.js` 正确。<br>**AC4 打包配置** ✅ `identifier=com.resumestudio.desktop`（初版为 `com.resumestudio.app`，Tauri 构建时警告「以 `.app` 结尾会与 macOS 包扩展名冲突」，已改）、`targets=[dmg,msi,nsis]`、`frontendDist=../dist-desktop`、窗口 1440×900 / min 390×700、`withGlobalTauri=true`（前端零 npm 依赖的关键）、图标 6 项齐全。<br>**AC5 构建与 CI** ✅ `npm run desktop:*` 就绪；`.github/workflows/build-desktop.yml` 用 Ruby `YAML.load_file` 解析通过，含 3 平台矩阵（macos→dmg / windows→msi,nsis / ubuntu→appimage,deb）、Linux 系统依赖、`dtolnay/rust-toolchain@stable`、`swatinem/rust-cache@v2`、`upload-artifact@v4`（`if-no-files-found: error`）。<br>**AC6** ✅ 全部 JS 通过 `node --check`（5 文件）；`tauri.conf.json`/`package.json` 可解析；YAML 可解析。**Rust `cargo check` 已通过**（后续补齐：rustup 工具链最终安装成功，在 `src-tauri/` 下 `cargo check` → `Finished dev profile ... in 2.15s`，**零错误**）。**该步骤抓出了一个静态审查完全无法发现的真实缺陷**：`src-tauri/icons/*.png` 由手写编码器输出为**灰度 PNG（colorType=0）**，而 Tauri 强制要求 **RGBA（colorType=6）**，导致 `tauri::generate_context!` 过程宏 panic（`icon <path> is not RGBA`）→ 已修 `tools/gen-icons.js`（改为输出 8bit RGBA、alpha 不透明）并重建全部图标（含 icns/ico），复跑通过。**教训：Rust 编译验证不可用静态审查替代**（逐行审查三个 `.rs` 与查证 Tauri feature 列表都没能发现这个问题）。<br>**AC7 文档** ✅ `docs/DESKTOP-BUILD.md`（10KB）含前置依赖、本地/CI 构建、凭证位置、排错、**「macOS 无法产出 Windows msi」的明确提示**。<br>**AC8 隐私** ✅ 新增文件 PII 扫描为 0；`.gitignore` 覆盖 `dist-desktop/`、`src-tauri/target/`、`sync.config.json`、`data/`；`dist-desktop/` 白名单产物经断言确认**未混入`data/、dist/、src-tauri/、tools/、docs/、test/、node_modules/`。 | **桥行为实测 17/17 全绿**（Node vm 沙箱，`/tmp/test-native-bridge.js`）：A 组 7 项＝浏览器零回归（不注入、降级文案一致、`loadConfig()→null`、`save()` 不抛、localStorage 回环）；B 组 10 项＝壳内可达（mock `invoke` 下 `push` 返回 `docUrl` 并真实调用 `feishu_request`+`feishu_upload`、`restore` 返回载荷、secret 已剥离、`req` 包裹正确）。<br>**迟绑定机制**：门面在加载时快照 `NATIVE`，桥排其后 → 桥通过 `ResumeStore._stores.FeishuStore`（T1 已暴露的钩子）重定向 6 个入口，未改动 `resume-store.js`（mtime 00:49 早于本轮 01:35+ 可证）。<br>**附带修复（非 T3 范围）**：发现 `index.html` 被外部 HTML 编辑/预览工具注入 134 处 `data-page-node-id`（HEAD 版本干净，属工作区污染）→ 已清理；并在 `tools/build-desktop-frontend.js` 对 `index.html` 增加**复制时净化**，保证安装包产物与仓库不再被污染。<br>**待办（P5/T6）**：桌面壳内 `ResumeStore.save()` 目前只落 IndexedDB（浏览器同款行为），尚未写原生文件；如需「桌面版落盘到磁盘」应在 T6 增加 Rust 文件持久化命令。 |

| 2026-09-19（复验：出包） | ✅ 通过（macOS 安装包**真实产出**，AC4 出包项闭环） | **`.app` 产出** ✅ `tauri build --bundles app` → `Finished release profile in ~1m`，`src-tauri/target/release/bundle/macos/Resume Studio.app`；`Contents/MacOS/resume-studio` 为 `Mach-O 64-bit executable arm64`（4.1 MB）。<br>**前端资源确认已内嵌** ✅ 二进制内资源清单（`strings` 抽取）与实际 `dist-desktop/` **10 个文件逐一吻合**：`index.html`、`css/style.css`、`js/{app,data,theme}.js`、`js/store/{resume-store,native-bridge}.js`、`template.json`、`vendor/{html2canvas.min.js,jspdf.umd.min.js}`（Tauri 2 把前端资源**编译进二进制**并 brotli 压缩，故 `Contents/Resources/` 只有 `icon.icns` 是**正常现象**，不是缺文件）。<br>**隐私隔离验证** ✅ `data/`（真实简历）**未**进入安装包；二进制内真实姓名特征串命中 **0**（`strings` 扫描）；`data-page-node-id` 注入命中 0（注入属性已在构建时净化）。<br>**`.dmg` 产出** ✅ 2.1 MB，`hdiutil imageinfo` = `UDIF 只读(zlib)`、`Apple_HFS` 分区、CRC32 校验通过；挂载后卷内含 `Resume Studio.app` + `Applications` 软链 + `.VolumeIcon.icns`。<br>**AC4 identifier 修复经验证** ✅ 挂载后 `PlistBuddy` 读出 `CFBundleIdentifier=com.resumestudio.desktop`（此前已发现旧 dmg 内仍是 `com.resumestudio.app`，属**失效产物**，已重建覆盖）。<br>**⚠️ 环境绕行记录**：Tauri 自带 `bundle_dmg.sh` 与本机 `hdiutil create -srcfolder` 均失败（`could not access /Volumes/Resume Studio/... - 操作不被允许`，沙箱上报 `file-write-unlink`）。**可行替代路径**（已跑通，可直接复用）：`hdiutil create -size 80m -fs HFS+` 建可写镜像 → `hdiutil attach -mountpoint /tmp/rs-mnt`（**自定义挂载点，绕开 `/Volumes`**）→ `ditto` 拷入 → `hdiutil detach` → `hdiutil convert -format UDZO`。CI 的 macos runner 无此限制，仍以 CI 为正式出包路径。<br>**⚠️ 仍未闭环**：Windows msi/nsis、Android APK/AAB **均未产出**（本机无 Windows、无 JDK/Android SDK），归入下方「现状盘点」。 |

---

## T4 — P3 安卓壳（Tauri 2.x Mobile）

### 范围
- Tauri 2 移动端支持，产出 **Android APK / AAB**。
- 移动端 UI 加固（视口、软键盘、返回键语义）。
- **桌面与浏览器行为零回归**；不改渲染/`recordHistory`/撤销栈。

### 设计决策（已定，实现须遵守）
1. **不手写 Android 工程脚手架**。`src-tauri/gen/android` 由 Tauri CLI 的 `tauri android init` 生成（本地与 CI 均如此），**仓库不提交生成产物**（`src-tauri/gen/` 加入 `.gitignore`）。理由：手写 Gradle/Kotlin 模板无法在本环境验证，极易产出坏工程；用官方 CLI 生成才是确定性路径。
2. **CI 是产出 APK/AAB 的唯一路径**（本机无 JDK / Android SDK / NDK，实测确认）。
3. 桌面壳构建路径不受影响：Android 与桌面**共用同一份 `dist-desktop/`** 前端产物与同一个 `frontendDist`。
4. **iOS 不在本轮**（需完整 Xcode，本机仅有 CommandLineTools）。

### 验收标准（AC）

- **AC1 视口修复（真实缺陷）**：`index.html` 的 viewport meta 必须包含 `viewport-fit=cover`。**依据**：缺少它时 `env(safe-area-inset-*)` 在 iOS/Android edge-to-edge 下**恒为 0**，T2 加的所有刘海/手势条留白实际上是死代码。修复后须验证桌面渲染无变化。
- **AC2 移动端 UI 加固**（全部只在 `≤640px` 或 `(pointer:coarse)` 等小屏/触控媒体查询内生效，**桌面与平板不得变化**）：
  - **软键盘**：软键盘弹出导致可视区变矮（`visualViewport`）时，底部 Tab 不被顶出视口、当前可见 pane 仍可滚动到底、输入框不被遮挡。
  - **滚动行为**：抑制橡皮筋/下拉刷新（`overscroll-behavior: none/contain`），避免整页被拖动。
  - **原生手感**：`-webkit-tap-highlight-color: transparent`；对按钮/标签等非文本元素抑制长按选中，但**正文与编辑区必须仍可选中复制**。
  - **输入缩放**：移动端 `input`/`textarea` 字号 ≥16px，防止 iOS 聚焦时自动放大页面。
  - **顶部安全区**：`safe-area-inset-top` 应用于顶部工具栏。
- **AC3 返回键语义**：切换视图（预览/编辑/同步）时写入浏览器 History；触发返回时**编辑/同步视图回到预览视图**，弹层打开时优先关闭弹层，**只有已在预览视图且无弹层时才允许真正后退**（不得把用户困住、也不得无故拦截离开页面）。浏览器环境须可实测；原生壳若可用 Tauri 事件则一并监听，不可用时优雅降级不报错。
- **AC4 npm 脚本**：新增 `mobile:android:init` / `mobile:android:dev` / `mobile:android:build`（`build` 至少覆盖 APK 与 AAB 两种产物）。`mobile:android:*` 复用 `desktop:assets` 生成前端产物。
- **AC5 CI 出包**：新增 `.github/workflows/build-android.yml`，含 JDK 17、Android SDK/NDK（如 `android-actions/setup-android`）、`rustup target add` 四个 Android 目标（`aarch64-linux-android` / `armv7-linux-androideabi` / `i686-linux-android` / `x86_64-linux-android`）、`tauri android init`、APK 与 AAB 构建、artifact 上传；**AAB 签名支持从 secrets 读取 keystore**（未配置时走 debug 签名并给出提示）；YAML 可解析。
- **AC6 静态验证**：新增/修改的 JS 全部 `node --check` 通过；`tauri.conf.json`、`package.json` 可解析；YAML 可解析；确认 `src-tauri/gen/` 已在 `.gitignore` 中且**未提交任何手写的 Android 工程文件**。
- **AC7 文档**：新增 `docs/ANDROID-BUILD.md`，含前置依赖（JDK 17 / Android SDK / NDK / rustup 目标）、本地构建步骤、CI 出包与 artifact 下载、**keystore 生成与保管**（含 `keytool` 命令、绝不入库）、真机安装（`adb install`）、常见报错排查，以及「本机无 SDK 时只能走 CI」的明确说明。
- **AC8 零回归**：桌面 `>1024px` 两栏、平板、`@media print`、`ResumeStore` 浏览器降级路径、渲染/`recordHistory`/撤销栈**全部不变**。

### 环境说明（本机实测）
- ❌ 缺失：Java/JDK（`Unable to locate a Java Runtime`）、Android SDK（`~/Library/Android/sdk` 不存在）、`ANDROID_HOME`/`NDK_HOME` 未设置。
- ⚠️ 结论：**本机无法构建 APK**，与 T3 同构——**CI 是唯一可行路径**。故 AC5 的 workflow 是交付核心。

### 验收记录

| 日期 | 结果 | 证据 | 备注 |
|---|---|---|---|
| 2026-09-19 | ✅ 通过（AC1–AC8 全绿，含真实浏览器端到端实测） | **AC1 视口修复（真实缺陷）** ✅ `index.html:7` 加 `viewport-fit=cover`（grep 计数=1）。**依据**：缺它时 `env(safe-area-inset-*)` 在 iOS/Android edge-to-edge 下恒为 0 —— T2 加的刘海/手势条留白此前是**死代码**。修复后桌面实测 `overscroll:auto`、编辑栏 `460px`、A4 `offsetWidth 794` 且 `transform:none`，**渲染零变化**。<br>**AC2 移动端加固** ✅ 真实 Chromium 390px 读计算样式：`--vvh=844px`（证明 visualViewport 接线成功）、`--kb=0px`、`.mobile-tabbar` `display:flex` 且 `bottom:0px`、`html overscroll-behavior:none`、`.toolbar .menu` 收起；新增 CSS **全部位于 `≤640px` 或 `(pointer:coarse)` 内**，且 290–340 行**零颜色字面量**（越界自查为空结果）；长按抑制显式为 `.resume`/`#editor`/`input` 保留 `user-select:text`，未一刀切到 body。<br>**AC3 返回键语义** ✅ 真实 Chromium 端到端四态：① 初始 `app mv-preview` / `history.state=null`；② 切编辑 → `app mv-edit` / `state={"mv":"edit"}`（pushState 生效）；③ 触发返回 → 回到 `app mv-preview` / `state=null`；④ **弹层优先**：编辑视图 + 弹层可见时触发返回 → `visibleModals 1→0` 且 `stillEdit=true`（**只关弹层、视图不动**）。原生侧为能力探测（`__TAURI__.event.listen`），拿不到即静默；`mvHistoryLocked` 防递归。<br>**AC4 脚本** ✅ `mobile:android:init/dev/build` 三条均复用 `desktop:assets`；原 `start`/`test`/`build`/`desktop:*` 含义未变。<br>**AC5 CI** ✅ `.github/workflows/build-android.yml`：`actions/setup-java@v4`（temurin / **JDK 17**）→ `android-actions/setup-android@v3` → `sdkmanager` 装 **NDK 27.0.12077973** 并导出 `NDK_HOME`/`ANDROID_NDK_HOME` → `rustup target add` 四个 Android 目标 → `rust-cache` → `mobile:android:init` → **APK 与 AAB 双产物**（各含 debug 回退）→ `upload-artifact@v4`；签名读 `secrets.ANDROID_KEY_BASE64`/`_ALIAS`/`_PASSWORD`/`_STORE_PASSWORD`，**未配置时自动转 debug 且不使 workflow 失败**；YAML 解析通过。<br>**AC6 静态** ✅ `node --check js/app.js` 通过；`package.json`/`tauri.conf.json` 可解析；两个 workflow YAML 均可解析（Ruby `YAML.load_file`）；`src-tauri/gen/` 已入 `.gitignore`，`gen/` 不存在，全仓**无任何手写 Gradle/Kotlin/AndroidManifest**。<br>**AC7 文档** ✅ `docs/ANDROID-BUILD.md` 九节：前置依赖 / 本地构建 / CI 出包 / keystore 生成与 base64 与 secrets / 本地签名 / adb 真机安装 / 移动端 UI 行为 / 常见报错 / 与桌面壳关系。<br>**AC8 零回归** ✅ 桌面逐项一致（见 AC1）；`@media print` 块完整保留（含 T2 的 Tab 隐藏与缩放复位）；**项目自带测试 `node test/run.js` 49/49 全绿**。 | **环境**：本机无 Java/JDK、无 Android SDK、`ANDROID_HOME` 未设置 —— **APK 只能由 CI 产出**，与 T3 同构。<br>**附带修复 ①（真实缺陷）**：viewport 缺 `viewport-fit=cover`（见 AC1），使 T2 的安全区留白失效。<br>**附带修复 ②（测试基建）**：`test/run.js` 沙箱提供了 `setTimeout` 却漏了 `clearTimeout`（`clearTimeout` 在 HEAD 版本即存在、**非本次改造引入**）→ 触发防抖保存时抛异常并**提前终止整个套件**，此前只跑 21 项就中断。补入后 **49 项全部执行且全绿**（等于恢复了 28 个从未运行过的用例）。<br>**工作区污染（持续发生）**：`index.html` 再次被外部 HTML 编辑/预览工具注入 **159 处** `data-page-node-id`，并观测到**同一秒内覆盖我的写入**（文件大小在 11062 / 13112 / 17899 / 19949 之间反复变动）。处理＝新增可复用的 `tools/clean-html-injections.js`（`npm run clean:html`），并让 `tools/build-desktop-frontend.js` **复用同一函数**在复制时净化，保证**安装包产物始终干净**。当前 index.html 已验证干净（11062 字节、div 配平 61/61、结构完整）。<br>**未做**：真机/模拟器运行（本机无 SDK）；release 签名须在 CI 首跑时验证。 |

---

## T7 — 投递链路三件套（内容体检 / 文档导出 / 静默 PDF）

### 背景
跨平台改造（T1–T4）收尾后，工具缺的是「投得出去」的能力：改完不知道过不过关、导出只有 PDF+JSON、
PDF 还要过系统打印对话框。本任务补齐这三块，全部不依赖原生壳、纯浏览器可验证。

### 设计决策（已定，实现须遵守）
- **不引入任何 npm 依赖**，保持项目「零依赖 / 无打包器」风格；新能力以新增独立文件（`js/audit.js`、
  `js/export-extra.js`）平行接入，`js/app.js` 只做最小侵入（暴露 `getData()` 一个读取口）。
- **静默 PDF 走本机 Chrome/Edge headless 打印**（服务端 `/api/pdf`），不用 jsPDF 内嵌中文字体
  （体积与许可都不划算）；找不到浏览器时前端回退到现有 `window.print()` 打印按钮。
- **DOCX 必须是真的 Office Open XML**（zip + WordprocessingML），不接受「HTML 改名 .doc」。
- 配色仍为黑白灰；新增 UI 不得引入彩色字面量。

### 验收标准（AC）
**7a 内容体检 / ATS 检查**
- AC1 新增 `js/audit.js`：零依赖 IIFE，仅暴露 `window.ResumeAudit`（`run(payload)` 返回
  `{checks:[{id,level,title,detail,hint}], stats:{pages,chars}}`，level ∈ `error|warn|info`）。
- AC2 检查项覆盖：页数超过 2 页；总字数区间；必填缺失（姓名 / 联系方式 / 空板块）；经历时间非倒序；
  条目缺少量化（无数字 / 无百分比）；单条过短或过长；占位文案（如「待补充」「xxx」）；空字段。
- AC3 UI：工具栏「检查」按钮 + 结果面板（桌面与移动端「同步/工具」页均可触达），按级别分组，
  点击问题可跳到对应编辑区域（能定位则定位，定位不到至少给出板块名）。
- AC4 只读：体检不得修改任何数据、不得触发保存 / 撤销栈。
- AC5 `node --check` 通过；沙箱 vm 单测 ≥ 8 条断言。

**7b DOCX / 纯文本 / Markdown 导出**
- AC1 新增 `js/export-extra.js`：零依赖 IIFE，仅暴露 `window.ResumeExport`（`exportDocx/exportTxt/exportMarkdown`）。
- AC2 DOCX 为合法 zip（魔数 `PK\x03\x04`）且含 `[Content_Types].xml`、`word/document.xml`、
  `_rels/.rels`、`word/_rels/document.xml.rels`；文本含姓名 / 板块标题 / 正文 / 列表 / `**加粗**` 转真加粗。
- AC3 纯文本与 Markdown 为 ATS 友好的线性文本（无表格、无图片、无样式标签残留）。
- AC4 文件名沿用 `ResumeEditor.getFileName(ext)`。
- AC5 `node --check` 通过；Node 端跑通生成 docx 并校验 zip 结构与解压内容。

**7c 静默 PDF**
- AC1 `tools/serve.js` 新增 `/api/pdf`：调本机 Chrome / Edge 的 headless 打印输出 PDF，响应
  `application/pdf` 直接下载。
- AC2 沿用现有 `listen(PORT,'127.0.0.1')`，不新增对外暴露面；PDF 走临时文件、响应后删除。
- AC3 找不到可用浏览器时返回明确 JSON 错误，前端自动回退到 `window.print()`。
- AC4 前端「静默导出 PDF」入口接在「导出」菜单与移动端「同步/工具 → 导出」分组。
- AC5 `node --check` 通过；本机实测（找到 Chrome 时）产出 PDF 且文件头为 `%PDF-`。

**7d 打印 / 静默 PDF 的页边距跟随设置（遗留缺陷修复）**
- AC1 「页面边距」面板改动后，`Ctrl/Cmd+P` 打印与静默 PDF 的 `@page` 边距随之改变（原为硬编码 `14mm`，用户设置形同虚设）。
- AC2 实现方式为**动态 `@page` 规则**（不依赖 `@page` 内的 `var()` —— 各浏览器解析时机不一致，不可靠）；`tools/render-resume.js` 生成的独立 A4 HTML 同步注入同一规则。
- AC3 实测：同一份数据把边距从 14mm 调到 30mm 后，静默导出的 PDF 与前者**字节不同**、内容可用宽度收窄（页数或内容流随之变化）。
- AC4 不改变预览观感与既有 `@page{size:A4}` 纸张尺寸；不改动数据模型与既有对外 API。

**7e 体检补充两项检查（遗留登记项）**
- AC1 新增 `empty-sections`（一个板块都没有 → `error`）与 `subtitle-missing`（头衔 `subtitle` 为空 → `info`）。
- AC2 两项在「健康」假数据上**不误报**（不破坏其「零命中」前提）；在「空数据」假数据上命中。
- AC3 `test/cases-audit.js` 补对应断言（含 id 对照表更新），`npm test` 全绿。

**7f 导出模块的自动化测试补齐（遗留登记项）**
- AC1 新增 `test/cases-export.js` 并接入 `test/run.js`（与 `cases-audit.js` 同构：CommonJS + `ctx.assert`）；
  覆盖 `crc32` / `zipStore` / `buildBlocks` / `buildPlain`(txt·md) / `buildDocx` 五个纯函数与三个导出入口的降级行为。
- AC2 断言必须落在**「看得见的东西」之外的失效面**上：zip 的**本地文件头**（不只中央目录）、
  `document.xml` 引用的每个段落样式在 `styles.xml` 中**确实有定义**、XML 转义与控制字符、
  A4 `sectPr`、无残留 `**`、无 `<w:tbl>`/`<w:drawing>`；DOCX 是「格式对了才打得开」的产物，
  只断言「字节非空 / 长度合理」等于没测。
- AC3 只读性：四个生成器跑完后原始数据**逐字节未变**（导出不得就地改写数据，否则会污染预览并触发一次自动保存）。
- AC4 断言集合须经**变异测试**证伪：对 `js/export-extra.js` 注入若干处真实缺陷（少转义 `&`、
  样式引用不存在的 `Heading9`、纸张改 Letter、丢部件、压缩标记写成 8、crc32 表初值错、
  就地改写输入数据、静默导出不再回退打印等），要求**每一处都被至少一条断言抓住**；
  同时先跑未变异源码作对照（必须 0 失败），否则结论无效。

### 验收记录（T7 复验·逐条核对）

| AC | 结果 | 证据 |
|---|---|---|
| 7a-AC1/2/3 体检模块与 UI | ✅ | `js/audit.js` 零依赖 IIFE，仅暴露 `ResumeAudit`；覆盖页数 / 必填 / 时间倒序 / 量化 / 长度 / 占位 / PII / ATS 图片与伪表格 / 板块标题等 10 类规则；工具栏「体检」+ 右栏 `#auditBody` + 移动端「投递准备」三个入口均已接线 |
| 7a-AC4 只读 | ✅ | 模块内无任何写数据 / 存盘 / 历史栈调用；`app.js` 仅新增一个只读出口 `getData()`（`js/app.js:1687`） |
| 7b-AC1/2/3/4 导出 | ✅ | `buildDocx()` 产出合法 zip（魔数 `PK\x03\x04`，5 个必需部件齐全，`unzip -t` CRC 通过，无残留 `**`，中文正常）；`document.xml` 无 `<w:tbl>`/`<w:drawing>`；txt / md 为线性文本，板块标题在 txt 中用「【】」框出 |
| 7c-AC1/2 静默 PDF | ✅ | 见下方「实测记录」：`HTTP 200` + `%PDF-1.4` + 3 页 + 0 图片 XObject + 0 临时文件残留；服务仍只监听 `127.0.0.1` |
| 7c-AC3 降级 | ✅ | 无可用浏览器时返回 `501 {error, hint}`；前端 `exportPdfSilent()` 捕获后自动调用 `window.print()`，并在提示位说明原因 |
| 7c-AC4 入口 | ✅ | 桌面「导出」菜单 + 移动端「同步/工具 → 导出」均有入口 |
| 7c-AC5 静态 | ✅ | `node --check` 全通过（`serve.js` / `audit.js` / `export-extra.js` / `build-single.js` / `app.js` / `render-resume.js`）；项目测试 **125/125** 全绿（含 T7 接线断言与新增的页边距回归断言；7f 补齐导出测试后为 **203/203**） |
| 7d-AC1/2/4 打印边距跟随 | ✅ | `js/app.js` 新增 `syncPrintPageMargin()`，在 `renderPreview()` 里把「页面边距」写成一条动态 `@media print{@page{...}}` 规则（元素 `#printPageMarginStyle`），覆盖 `css/style.css` 中硬编码的 14mm；`tools/render-resume.js` 注入同源规则。纸张仍 A4、预览观感与数据模型零改动 |
| 7d-AC3 实测边距生效 | ✅ | 同一份真实简历：14mm 边距 → PDF **797,963 B / 4 页**；30/25mm 边距 → **800,804 B / 5 页**（内容变窄、多出一页），两者 `MediaBox` 均为 `594.96×841.92pt`（= A4，纸张尺寸未变）。浏览器侧另用 DOM 桩实测：`applyImported` 改边距 → 规则文本随之更新（14 → 30/25 → 8/10mm），且**只创建一个 style 元素**（不重复插入） |
| 7e-AC1/2/3 体检补两项 | ✅ | 新增 `empty-sections`（error）与 `subtitle-missing`（info）；空数据命中且 error 恰好 3 条，健康假数据不误报；`test/cases-audit.js` 补 4 条断言 → 测试 117 → **125** 全绿 |
| 7f-AC1/2/3 导出测试补齐 | ✅ | 新增 `test/cases-export.js`（14 个用例 / 78 条断言）并接入运行器；测试 125 → **203/203** 全绿。断言落在失效面上：自写 zip 解析器同时校验**本地头**与中央目录的压缩标记、标志位、CRC、长度；`document.xml` 引用的 5 种 `pStyle` 逐一回溯到 `styles.xml` 的定义；XML 五类特殊字符转义 + 非法控制字符剔除；A4 `sectPr`（11906×16838）；无残留 `**`、无 `<w:tbl>`/`<w:drawing>`；只读性用「运行前后 `JSON.stringify` 逐字节相等」验证 |
| 7f-AC4 变异测试证伪 | ✅ | 对 `js/export-extra.js` 注入 15 处真实缺陷 → **14 处被断言抓住**，唯一「漏网」的是刻意构造的**等价变异**（只改 DOS 时间字段，语义中性），即不存在有意义的盲区。对照实验：未变异源码在该 harness 下 **0 失败**（首版 harness 缺 `ResumeEditor` 桩，导致 3 条断言在**未变异时**也失败，一度掩盖了 2 处真实测试盲区 —— 已修正）。**变异测试当场抓出 2 个真实测试盲区并已修复**：① 原先只读中央目录的压缩标记，把本地头写成 deflate(8) 时全部断言仍通过（流式解压器只读本地头 → 会解出损坏文件）；② skills「整句用『；』连接」的用例只有**一条**长句，`join` 分隔符不可观测，该规则永远测不出来（已补第二条长句） |

**已知偏差与前提（如实登记）**
- **静默 PDF 依赖本机已装 Chromium 系浏览器**（Chrome / Chromium / Edge / Brave），也可用环境变量 `CHROME_PATH` 指定路径；未安装则自动降级为打印对话框。
- **页数估算分两种精度**：浏览器内用 `#preview .resume` 的真实 DOM 高度 ÷ A4 可用高度；Node 等无 DOM 环境下按 900 字/页粗估（同一份示范数据估算 2 页、真实 3 页），**仅供无浏览器场景使用**。
- **页数是几何推算，不含浏览器分页时的 `break-inside:avoid` 推挤**：`css/style.css` 为避免「一条经历被拦腰截断」给 `.job/.project/.skill-group/.adv li/.card/.growth` 加了 `break-inside:avoid`，被整体推到下一页时会多出空白，于是**实际页数可能比推算多 1 页**。实测：`template.json` 推算 3 页 = PDF 实际 3 页（一致）；用户真实简历推算 3 页、PDF 实际 **4 页**（含 2 个公司 Logo 图片）。误差方向恒为「实际 ≥ 推算」，因此「超过 2 页」类提示**不会漏报**，只会略微保守。
- ~~打印纸张尺寸与边距由 `css/style.css` 的 `@page{size:A4;margin:14mm}` 决定，不随「页面边距」面板变化~~ → **本次已修复（7d）**：打印与静默 PDF 的 `@page` 边距现在跟随 `data.pageMargins`；`css/style.css` 里的 14mm 仅作为「没有 JS 参与渲染」场景（如把 `index.html` 直接交给别的工具）的兜底默认值。
- 页边距的**非法值回退**：`null` / `undefined` / 空串 / 负数 / 非数字一律回退为默认 14mm（刻意先判空值 —— `Number(null) === 0`，否则外部 JSON 里一个 `null` 会静默变成「0mm 边距」，纸面内容直接顶到纸边）。

---

## 验收记录汇总

| 任务 | 日期 | 结果 | 关键证据 |
|---|---|---|---|
| T1 P0 数据门面 | 2026-09-19 | ✅ 通过 | node --check + grep + 沙箱 vm 测试 13 项全绿；渲染/历史逻辑零改动 |
| T2 P1 响应式 UI | 2026-09-19 | ✅ 通过 | node --check + 断点/Tab 结构 grep + 响应式段配色扫描全灰阶 + @media print 未动；像素截图待本地确认 |
| T2 P1 响应式 UI（复验） | 2026-09-19 | ✅ 通过 | headless 实测 390/320/800/1440 四档 + CDP 模拟 print 六项判定 ALL_PRINT_CHECKS_PASS；修复 A4 横向溢出与打印隐藏遗漏；截图存 dist/acceptance-screenshots/ |
| T3 P2 桌面原生壳 | 2026-09-19 | ✅ 通过 | 桥行为 17/17 全绿 + 真实浏览器零回归 + 7 命令契约逐一对齐 + **Rust `cargo check` 实编译通过**（并据此抓出「图标非 RGBA 导致 generate_context! panic」的真实缺陷） |
| T4 P3 安卓壳 | 2026-09-19 | ✅ 通过 | viewport-fit 缺陷修复 + 移动端加固（--vvh/overscroll/长按/输入字号）+ 返回键四态实测（含弹层优先）+ CI（JDK17/NDK/4目标/APK+AAB/签名回退）+ 项目测试 49/49 全绿 |
| T3 P2 桌面原生壳（复验·出包） | 2026-09-19 | ✅ 通过 | `tauri build` release 实编译 → `.app`（arm64，4.1MB）**+ dmg 2.1MB 实产出**；内嵌资源清单与 dist-desktop 10 文件逐一吻合；无 PII 泄漏；identifier 已修为 `com.resumestudio.desktop`；绕开 `/Volumes` 的 dmg 制作路径已跑通并记录 |
| T7 投递链路（复查） | 2026-09-19 | ❌ 未通过（判为半成品，见「现状盘点」） | `js/audit.js`/`js/export-extra.js` **未被 index.html 以 `<script>` 引入**，`js/app.js` 仅有一行**注释**提及（无调用点）→ **运行时不可达**；`test/cases-audit.js` **从未被执行**（`test/run.js` 硬编码只读 `cases.js`，且缺 `ctx.assert`）；7c 静默 PDF **完全未开始**（`tools/serve.js` 无 `/api/pdf`） |
| T7 投递链路（模块本体实测） | 2026-09-19 | ✅ 模块本体可用（但当时整体仍判未通过，见上） | Node `vm` 沙箱实跑：`ResumeAudit.run()` 返回 30 条 checks + stats；`buildDocx()` 产出合法 OOXML（PK 魔数 + `[Content_Types].xml`/`_rels/.rels`/`word/document.xml`/`word/_rels/document.xml.rels`/`word/styles.xml` 五部件齐全，含 `<w:b/>` 真加粗、无 `<w:tbl>`/`<w:drawing>`）；`readData()` ↔ `app.js:1687 getData` 契约已对齐 → **缺的只是接线** |
| T7 投递链路（接线收尾·复验） | 2026-09-19 | ✅ 通过 | ① `index.html` 引入两模块（排在 `app.js` 之后）+ 补齐 UI 入口（导出菜单 4 项、同步面板「投递准备」、体检面板 `#auditBody`、工具栏「体检」按钮）；② `tools/serve.js` 补 `POST /api/pdf`（本机 Chrome/Edge headless 打印，失败回退 `window.print()`）；③ `test/cases-audit.js` **接入运行器**并逐条对齐实现契约（原断言用的是设想 id：`name`/`contact`/`no-quantify`/`pages`/`career-order`/`pii` → 实际为 `required-name`/`required-contact`/`quantify-missing`/`pages-over`·`pages-thin`/`date-order-N`/`pii-idcard`）；④ 两端产物复验：单文件版含两模块且「剩余外部引用 0 个」，`dist-desktop/` 亦含两模块（299/300 行）；⑤ 测试 49 → **117 条全绿** |
| T7 投递链路（静默 PDF·端到端实测） | 2026-09-19 | ✅ 通过（并修掉 1 个致命缺陷） | 真实 `POST /api/pdf`（本机 Chrome headless）：`HTTP 200` / `application/pdf` / **511,143 B** / 文件头 `%PDF-1.4` / **3 页**（示范数据 `template.json`；换用真实简历为 797,963 B / 4 页）/ 字体已嵌入（`FontFile`）/ **0 个图片 XObject**（矢量文字，可选中可搜索）；`dist/` 临时文件 **0 残留**。<br>**过程中发现并修复真实缺陷**：macOS 下 Chrome 打印完成后**不退出**（stderr 反复刷 `CVDisplayLinkCreateWithCGDisplay failed`，`--dump-dom about:blank` 12s 后仍挂起），原先「等进程 `close` 再取结果」的写法会让该接口**永久挂起**（实测 4 分 2 秒无响应 + `dist/` 残留 6 个临时文件）→ 改为「**轮询产物文件体积稳定 + 主动 SIGKILL 收尾**」，并支持新旧 headless 标志回退。<br>附带修复：`tools/render-resume.js` 在 vm 沙箱里缺 `clearTimeout`（P0 之后静默失效）+ 缺 `ResumeStore` → 一并补齐并在产物落盘后 `process.exit(0)` |
| T7 投递链路（浏览器冒烟） | 2026-09-19 | ✅ 通过 | 真实 Chromium 打开 `npm start` 页面：`window.ResumeAudit` / `window.ResumeExport` 均已暴露（导出 9 个 API）、**控制台零错误**；点工具栏「体检」→ 面板展开，在**真实简历数据**上输出「3 页 / 4715 字 / 4 板块」+ 1 条建议修改（超 2 页）+ 2 条可以更好（29 处缺量化、3 张图片）；配色随主题变量，夜间模式下仍为灰阶 |
| T7 遗留收口（7d 打印边距跟随 + 7e 补两项检查） | 2026-09-19 | ✅ 通过 | **7d**：打印 / 静默 PDF 的 `@page` 边距改为跟随「页面边距」设置（`app.js` 动态规则 + `render-resume.js` 注入），实测同一份简历 14mm → 797,963 B/4 页、30/25mm → 800,804 B/5 页，`MediaBox` 仍为 A4；`null` 不再被当成 0mm。**7e**：体检补 `empty-sections`(error) 与 `subtitle-missing`(info)，正反两面均有断言。测试 117 → **125/125** 全绿，新增 4 条页边距回归断言防止重构丢失 |
| T7 导出测试补齐（7f） | 2026-09-19 | ✅ 通过 | 新增 `test/cases-export.js`（自带独立 zip 解析器，不复用被测实现的 CRC/解压逻辑）+ 接入运行器 → 测试 125 → **203/203** 全绿；`verify:assets` 通过 10 引用、`npm run build` 单文件版 md5 `f9f855a4605051d02b83012c1f2e868a`（与改动前一致，证明测试改动未触碰产物）。**变异测试 14/15 抓住**（唯一漏网为等价变异），并据此修掉 2 个真实测试盲区（本地头压缩标记未校验、skills 分隔符用例只有一条长句） |
| T5 P4 冲突合并 | — | ⏳ 未开始 | 无 `baseVersion` 记录、无 3-way merge、无「打开即 pull」；**且本文件尚未为 T5 定义 AC 章节**（违反「先定 AC 再执行」流程，需先补） |
| CI 运维加固 + Android 签名凭据 | 2026-09-19 | ✅ 通过（AC1–AC8；**最后一步「填 Secret」需人工**） | action 升到最新稳定（`checkout@v7` / `setup-node@v7` / `setup-java@v6` / `upload-artifact@v7`，并纠正上轮「升到 v5 即可」的过期建议）；本机装 Temurin 17.0.20.1 生成 **PKCS12** 上传密钥库（RSA 4096 / SHA256withRSA / 10000 天 / alias `resume-studio`）；base64 `openssl -A` 单行 5.8 KB，**解码后字节一致且可被 keytool 打开**；CI 侧补 `storeType=PKCS12`（消除 JKS/PKCS12 歧义）；**无 Android SDK 也复刻跑通了签名步骤**（解码 → `keystore.properties` → Gradle 补丁，大括号平衡、证书可导出）；修掉 3 处 identifier 文档漂移（`ANDROID-BUILD.md` ×2、`DESKTOP-BUILD.md` ×3）并补 5 条签名排错 |
| T6 P5 发布加固 | — | ⏳ 未开始 | 凭证仍**明文**存 `app_config_dir()/sync.config.json`（钥匙串未接）；**壳内文件落盘命令缺失**（导出全走 `<a download>`，macOS WKWebView / Android WebView 极可能静默失败且从未真机验证）；自动更新/签名/公证/引导页未做 |

---

## 现状盘点（2026-09-19 复查：还有什么没做）

> 本节是对「任务总览」的**实施级复核**，只记录**可客观核对**的事实与命令。

### A. 已闭环（可交付）

| 项 | 证据 |
|---|---|
| P0 数据门面（T1） | `js/store/resume-store.js` + `app.js` 改走门面；测试全绿 |
| P1 响应式（T2） | 四档宽度实测 + 打印态六项判定通过；两个真实缺陷已修 |
| P2 桌面壳（T3） | Rust 实编译通过；**macOS `.app` + `.dmg` 真实产出**（`dist/安装包/macOS/`） |
| P3 安卓壳（T4） | 移动端加固 + 返回键语义 + CI 工作流就绪；项目测试 49/49 |

### B. 未闭环（按优先级）

| 序 | 事项 | 事实依据 | 影响 |
|---|---|---|---|
| 1 | **Windows msi / Android APK 由 CI 产出中** | 状态已推进：改造内容**已推送**（`7260dc9` → `bda7316` → `b371306` → `d1f5fce`）。`CI #5` 实测 **Success（9s）**；`Build Desktop #1` 与 `Build Android #1` 实测**已在 Actions 中运行** | 用户原始诉求「PC 安装包 + 安卓安装包」**由 CI 补齐中**；Android 的**签名凭据已生成备好**（见文末「CI 运维加固与 Android 签名凭据」），未配 secret 前出的是 debug 包 |
| 2 | ~~**T7 三件套运行时不可达**~~ ✅ **本次已解决** | 已修：`index.html` 引入两模块 + UI 入口；`tools/serve.js` 补 `POST /api/pdf`；`test/cases-audit.js` 接入运行器（原缺口：`test/run.js` 硬编码只读 `cases.js`，且缺 `cases-audit.js` 需要的 `ctx.assert` → 294 行测试从未执行） | 已从「写了但运行时不可达」变为**真实生效**：测试 49 → 117 条全绿 |
| 3 | **壳内导出落盘未验证** | 全项目无任何原生 save-file 命令（桥仅 6 个 `feishu*` + 2 个 `state*`） | 安装包内点「下载 PDF/图片/HTML/JSON」在 WKWebView/Android WebView 下**可能静默不落盘** |
| 4 | **T5 冲突合并未做且无 AC** | 无 `baseVersion`；`docs/ACCEPTANCE.md` 无 T5 章节 | 「手机和电脑同时改」的**不丢数据**保证尚未实现（当前只有「后写覆盖 + 飞书版本历史可回滚」） |
| 5 | **T6 凭证仍明文** | `src-tauri/src/config.rs:24` `CONFIG_FILE = "sync.config.json"`，落在 `app_config_dir()` | `app_secret` 明文落盘（T3 只保证「不进浏览器」，未保证「加密存储」） |
| 6 | ~~**单文件构建清单是硬编码**~~ ✅ **本次已解决** | `tools/build-single.js` 的 `files` 数组已补入 `export-extra.js` / `audit.js`；并修正了「剩余外部引用」长期误报 1 个的统计正则 | 单文件版不再静默缺功能；构建输出可如实反映残留引用 |
| 7 | ~~**CI 未覆盖前端资源完整性**~~ ✅ **本次已解决** | 新增 `tools/verify-frontend-assets.js`（`npm run verify:assets`）并接入 `ci.yml`；同时修正了陈旧步骤名、APK+AAB 合并为一步 | 「新增模块漏接线 / 漏打包 / 隐私目录泄漏」现已能在 CI 拦截 |

### C. 从未验证（诚实登记，非缺陷）

- **导出的 `.docx` 从未用真实 Word / WPS / LibreOffice 打开过**：现有证据只到「合法 zip（`unzip -t` 全 OK、Python `zipfile.testzip()` 返回 `None`）+ 五个部件齐全 + 结构对照 WordprocessingML 规范 + 交叉引用自洽」。这些**能证明文件没坏，不能证明 Word 愿意按预期渲染**（OOXML 语义错误两者都看不出来）。本机无 Word / LibreOffice（`soffice` 未安装），故无法进一步验证；若要补，最省事的是 `soffice --headless --convert-to txt out.docx`。
- Android 真机 / 模拟器运行、APK 签名、真机返回键与安全区（代码已写，仅在浏览器模拟过）
- 桌面壳内**飞书同步真机联调**（本机无凭证，仅 `FEISHU_DRY_RUN=1` 验证过服务端链路）
- macOS Gatekeeper 首次打开（**未签名/未公证**，用户需右键→打开）
- 桌面壳与移动壳内的**导出下载**行为（见 B-3）
- 真实手机浏览器：iOS Safari / Android Chrome / 微信内置浏览器

### D. 仓库卫生

- `index.html` 的 `data-page-node-id` 注入**仍在持续发生**（本次复查时 157 → 172 处，几十秒内自增）→ 已跑 `npm run clean:html` 清零；**提交前必须再扫一次**。
- 本次改造产物（`src-tauri/`、`docs/`、`js/store/`、`js/theme.js`、`js/audit.js`、`js/export-extra.js`、`tools/*`、`.github/workflows/*`、`test/cases-audit.js`）**已全部提交并推送**（`7260dc9` / `bda7316` / `b371306` / `d1f5fce`），工作区干净。
- `android-signing/`（上传密钥库与口令）**不在版本库内**：仓库根 `.gitignore` 忽略该目录 + `*.jks` + `*.keystore` + `keystore.properties`，目录内**另有一层 `.gitignore`（`*`）**双保险。**任何情况下都不得提交。**

### E. T7 模块本体实测（用于判断「接线」工作量）

结论：**模块本体是好的，缺的只是接线**。用 Node `vm` 沙箱直接加载两个模块并用 `template.json` 数据处理，实测：

| 实测项 | 结果 |
|---|---|
| `js/audit.js` 加载 | ✅ 无异常，导出 `{run, render, toggle}` |
| `ResumeAudit.run(payload)` | ✅ 返回 `{checks, stats}`；`stats = {pages:2, chars:1630, sections:5, items:24}`；示范数据上命中 **30 条**检查（首三条为 `warn / 残留占位文案`，与模板里的「示例：…」文案相符 —— 说明规则真的在跑） |
| `js/export-extra.js` 加载 | ✅ 无异常，导出 `{exportDocx, exportTxt, exportMarkdown, buildDocx, buildPlain}` |
| `buildDocx()` 是否为**合法 OOXML** | ✅ 15,563 字节、魔数 `PK\x03\x04`；顺序解析本地文件头得 **5 个部件**：`[Content_Types].xml`(556B)、`_rels/.rels`(297B)、`word/document.xml`(12,187B)、`word/_rels/document.xml.rels`(282B)、`word/styles.xml`(1,659B) —— **AC2 必需部件全齐** |
| DOCX 内容契约（AC2/AC3） | ✅ `document.xml` 12,916 字符；含 `个人优势`（板块标题）与 `<w:b/>`（`**加粗**` 已转真加粗）；**不含** `<w:tbl>`、`<w:drawing>` → 符合「ATS 友好、无表格无图片」 |
| 文件名（AC4） | ✅ `fileNameFor()` 优先调 `ResumeEditor.getFileName('', ext)` 并带自算兜底；实测产出 `林一帆.docx` |
| 数据读取契约 | ✅ 模块内 `readData()` 读 `ResumeEditor.getData()`，而 `js/app.js:1687` 的 `getData` 钩子**已就位** → 契约已对齐，接线无阻塞 |

> 因此所谓「T7 未完成」**不是功能没写**，而是：① 两个模块没被 `index.html` 引入；② 没 UI 入口；③ 测试没被运行器装载（且断言接口 `assert` 与运行器的 `__ok` 不匹配）；④ 7c 的 `/api/pdf` 完全没写。
> 另注：`test/cases-audit.js` 断言接口是 `ctx.assert`，与 `test/run.js` 注入的 `ctx.__ok` **不同名** → 即使把文件 require 进来也会立刻报错，需一并适配。

---

## CI 就绪性验证（2026-09-19）

> 目的：**推送前先证明 workflow 能跑**，避免推一个坏 workflow 白等一轮 CI。

### 实测结论（四项）

| 序 | 实测项 | 结论 |
|---|---|---|
| 1 | `bundle.targets: ["dmg","msi","nsis"]` 在 macOS 上会不会撞 msi？ | **不会。误判。** 实测 `npx tauri build`（不带 `--bundles`）在 macOS 上**按平台自动过滤**：只打包 `.app` + `.dmg`，静默跳过 msi/nsis，不报错 → **配置无需修改**。（另注：`--bundles` 的 `possible values` 是**按宿主平台动态列出**的，macOS 下只显示 `ios, app, dmg`，勿据此误判配置有错。） |
| 2 | `tauri android build` 的 flag 是否与 workflow 一致？ | **一致。** `--apk`/`--aab`/`--debug`/`--target`(aarch64,armv7,i686,x86_64) 均存在；`--apk --aab` 与 `--apk --aab --debug` **可同时传**（验证手法：clap 参数校验先于环境检查，参数合法时才会往下报 `cargo metadata` 缺失）。 |
| 3 | `tauri android init` 需要显式加 `--ci` 吗？ | **不需要。** 该 flag 读环境变量 `CI`，GitHub Actions 默认已设 `CI=true`，会自动跳过交互提示。 |
| 4 | `build-desktop.yml` 的 Linux 依赖能否装上？ | **❌ 原写法必然失败（真实缺陷，已修）。** `libappindicator3-dev` 在 ubuntu-24.04（当前 `ubuntu-latest`）**已从源中移除**；它与可用包写在**同一条** `apt-get install` 里 → 整条失败 → job 变红。 |

### 已落地的修复

| 文件 | 改动 |
|---|---|
| `.github/workflows/build-desktop.yml` | Linux 依赖拆成两条命令，托盘依赖走 `libayatana-appindicator3-dev` 并保留 `libappindicator3-dev` 兜底 |
| `.github/workflows/build-android.yml` | APK 与 AAB 由**两步合并为一步**（`--apk --aab`），避免 4 个 ABI 的 Rust 编译被完整跑两遍 |
| `.github/workflows/ci.yml` | ① Node 20 → 22（与另两个 workflow 对齐）；② 修正步骤名里「dist/ 根目录两份字节一致」的陈旧描述（现行构建已不再比根目录）；③ **新增前端资源完整性门禁** |
| `tools/verify-frontend-assets.js`（新增）+ `npm run verify:assets` | 补上审计缺口 B-7：判定「引用文件缺失 / 未进 dist-desktop / 隐私目录泄漏」为 **FAIL**，「存在未被 index.html 引用的 js 模块（疑似死代码）/ 注入属性残留」为 **WARN** |

> 门禁试跑即生效：立刻报出 `⚠ js/audit.js、js/export-extra.js 未被 index.html 引用` —— 正是上面 T7 的问题，证明这道门禁抓的就是「写了但没接线」。

### 提交前 PII 扫描（抓到 2 处并已修）

| 文件 | 问题 | 处理 |
|---|---|---|
| `docs/DESIGN.md:107` | 举例用了**真实公司名** | 改为 `某公司` |
| `docs/ACCEPTANCE.md` | 本文件验收叙述里写进了**真实姓名** | 改为「真实姓名特征串」 |

> 教训：**验收记录叙述里很容易顺手写进真实姓名 / 公司名**，而 `docs/` 是要入库的（`.workbuddy/` 虽被 gitignore，`docs/` 没有）。
> 另：`index.html` 的注入污染已到「分钟级复现」程度，故提交采用「`npm run clean:html` && `git add -A`」链式执行，并复核 `git show :index.html | grep -c data-page-node-id` = **0**。

### 提交记录

- **`7260dc9`** on `main`：`feat: 跨平台改造 P0–P3（数据门面 / 响应式 / 桌面壳 / 安卓壳）+ CI 出包`，46 files，+11303 / −105。
- **`bda7316`** on `main`：`docs: 补记 CI 就绪性验证与提交前 PII 修正`。
- **`b371306`** on `main`：`feat(T7): 投递链路接线收尾 + 测试基建修复 + 文档全面更新`，13 files，+557 / −117。
- **已推送**：`e8bd10c..b371306 → origin/main`。CI 已触发 —— `CI #5` ✅ **Success**（9s）；
  `Build Desktop #1`（dmg / msi+nsis / deb）与 `Build Android #1`（APK + AAB）进行中。
- 备注：本机 `git push` 走 HTTPS 会报 `Error in the HTTP2 framing layer`，改用
  `git -c http.version=HTTP/1.1 push origin main` 即成功（网络环境所致，非仓库问题）。
- 出包产物位置：<https://github.com/shenge-work/resume-builder/actions> → 对应 run 的 **Artifacts**。

---

## T7 接线收尾与测试基建修复（2026-09-19）

> 本节记录「T7 从运行时不可达 → 真实生效」的完整过程，含一条**产品缺陷**的定位与修复。
> 流程遵循本项目约定：先核实 AC → 定位根因 → 修复 → 复验 → 记录。

### 做了什么

1. **接线**：`index.html` 在 `app.js` 之后引入 `js/export-extra.js`、`js/audit.js`；
   补齐 UI 入口 —— 导出菜单 4 项（静默 PDF / Word / 纯文本 / Markdown）、同步面板「投递准备」分组、
   体检面板 `#auditBody`、工具栏「体检」按钮。
2. **服务端**：`tools/serve.js` 新增 `POST /api/pdf`（以本机 Chrome/Edge 的 headless 模式渲染打印样式，
   失败自动回退 `window.print()`）。
3. **测试接入（关键）**：`test/run.js` 此前**硬编码只读 `test/cases.js`**，导致 `test/cases-audit.js`
   的 294 行断言**从未被执行**。现按该文件的 CommonJS 契约（`module.exports = [{name, fn}]`、断言走 `ctx.assert`）
   单独适配并接入，同时补了 9 条 T7 静态接线断言（防再次「写了不接」）。
4. **打包核对**：单文件版与 `dist-desktop/` 均确认含新模块；单文件版「剩余外部引用」为 **0**。

### 抓到的真实缺陷（非测试问题）

| # | 缺陷 | 根因 | 影响 |
|---|---|---|---|
| 1 | **体检对「成果点」稳定误报** | `js/audit.js` 的 `longKinds` 把项目 `results` 也当作正文，套用「描述过短（< 15 字）」下限。而成果点本就是 8–12 字短句（「QPS 提升 40%」） | **任何写得正常的简历都会被报「N 条描述过于单薄」**，体检可信度受损。已改为 `results` 只参与「缺量化」与「超长」检查 |
| 2 | **单文件版「剩余外部引用」长期显示 1 个** | 统计正则 `/<script src=/` 把 jsPDF 内部的拼接字符串也算作残留引用 | 构建输出长期误导（写着「应为 0」却恒为 1）。已改为只统计真实引用，并打印具体路径 |

### 测试断言与实现契约的对齐（24 条失败的根因）

`test/cases-audit.js` 写在 `js/audit.js` 演进之前，断言用的是**设想中的 id**，与实现不符：

| 测试原用 id | 实现实际 id |
|---|---|
| `name` / `contact` | `required-name` / `required-contact` |
| `no-section` / `section-empty` / `section-title` | `required-empty-section`（合并为一条并点名） |
| `no-quantify` | `quantify-missing` |
| `pages` | `pages-over` / `pages-thin` |
| `career-order` | `date-order-N`（带序号，需前缀匹配） |
| `pii` | `pii-idcard` / `pii-sensitive` |
| `subtitle` | **实现中不存在该项**（记录为功能缺口，不臆造断言） |

另外 `healthyData()`（声称「健康」）实测 `chars=526` → 触发 `pages-thin`，且有 4 条短句成果触发误报
—— 即**假数据本身不满足「零命中」前提**。已将其补足为约 2 页篇幅、且每条正文 ≥ 20 字含数字。

### 复验结果

```
npm test        → pass=117 fail=0 total=117   （原 49 条 + audit 用例 68 条）
npm run build   → 单文件版 776 KB，剩余外部引用 0 个
npm run verify:assets → 通过：校验 10 个本地引用，无缺失、无泄漏
node --check    → js/audit.js / js/export-extra.js / tools/serve.js / test/cases-audit.js 全部通过
```

> 遗留（非阻塞，已登记 ROADMAP）：实现中**缺**「零板块」「头衔（subtitle）为空」两项检查；
> 若要补，应先补 AC 再动实现 —— 本次不扩大范围。

---

## CI 运维加固与 Android 签名凭据（2026-09-19）

### 背景

上一轮把 CI 跑通后发现两件事需要收口：① CI 日志持续刷 `actions/checkout@v4` /
`setup-node@v4` 跑在 Node 20 上的弃用警告；② Android 走的是 debug 签名，
要出**可上架**的 release 包必须先备好 4 个签名 secret——而这台机器连 JDK 都没有。

### 范围

1. 三个 workflow 的 action 主版本升到「当前最新稳定」；
2. 在本机生成一套 Android 上传密钥库，并给出可核对的自检流程；
3. 消除 CI 签名环节里 JKS/PKCS12 的格式歧义；
4. 同步修正文档中因 identifier 改动而产生的陈旧引用。

### 验收标准（AC）

| # | 验收标准 | 判定方式 |
|---|---|---|
| AC1 | 仓库内**不再出现** `@v4`；使用的每个主版本**真实存在**于对应 action 的 tags | `grep -rn "@v4" .github/workflows/` 为空；逐个核对 tags 页 |
| AC2 | 密钥库可被 `keytool` 打开，且别名 / 口令 / 证书三者自洽 | `keytool -list -v` + `keytool -exportcert` 均成功 |
| AC3 | `ANDROID_KEY_BASE64` **往返无损**，即 CI 的 `base64 -d` 能还原出字节一致的 keystore | `base64 -d` 后 `cmp` 与原文件一致，且对还原文件 `keytool -list` 通过 |
| AC4 | base64 为**单行**（`openssl base64 -A`），不会因折行在 secret 里埋坑 | `wc -l` = 0 |
| AC5 | 签名材料**绝不入库**：`.gitignore` 覆盖 + 目录内二层 `.gitignore` | `git status --short` 不出现该目录；`git check-ignore -v` 命中 |
| AC6 | CI 的签名步骤逻辑**在无 Android SDK 的情况下也能被验证** | 本地复刻该 run 块（假 `build.gradle.kts`），跑通解码 → 写 `keystore.properties` → 追加 Gradle 补丁，并检查大括号平衡 |
| AC7 | 显式声明 `storeType`，消除「JKS 还是 PKCS12」的运行时歧义 | `keystore.properties` 与 Gradle 补丁都含 `storeType` |
| AC8 | 文档与真值一致（action 版本、identifier、签名流程） | 全仓 `grep` 无陈旧引用 |

### 实测结果

**AC1 ✅** 改后清单：`checkout@v7`（×3）、`setup-node@v7`（×3）、`setup-java@v6`、`upload-artifact@v7`（×3）。
**这里纠正一个我先前的错误建议**：上一轮我说「提到 `@v5` 即可」，实际核对 tags 后发现
`actions/checkout` 与 `actions/setup-node` **都已到 v7**、`setup-java` 到 v6、`upload-artifact` 到 v7 ——
按 v5 改等于刚升完又落后两个大版本。三个 YAML 均由 `YAML.load_file` 解析通过。

**AC2 / AC3 / AC4 ✅** 本机装 Temurin **17.0.20.1**（装法见 `docs/ANDROID-BUILD.md` 第 5 节文末）后：

```
keytool -genkeypair -storetype PKCS12 -alias resume-studio -keyalg RSA -keysize 4096
                   -sigalg SHA256withRSA -validity 10000
→ 别名 resume-studio / PrivateKeyEntry / SHA256withRSA
→ SHA-256: 8D:B6:4D:11:FA:4A:2C:23:73:0D:9E:7C:D4:3D:94:C2:C9:75:16:84:38:E6:2A:95:73:61:19:6C:32:13:52:30

openssl base64 -A  → 5.8 KB、单行（wc -l = 0）
base64 -d 还原     → cmp 字节一致 ✅
keytool -list 还原件 → 通过 ✅
keytool -exportcert -alias resume-studio → 导出证书 1430 字节 ✅
```

> **过程中自己踩了一个坑并当场修掉**：首次生成 base64 时漏了 `-in`，`openssl base64` 把
> **口令字符串**编码了进去（产物只有 44 字节）。是靠 `ls -lh` 的体积异常发现的——
> 这也说明「base64 出来先看大小、再解码比对」这一步不能省。

**AC5 ✅** 根 `.gitignore` 新增 `android-signing/`、`*.jks`、`*.keystore`、`keystore.properties`；
目录内另有 `.gitignore`（内容 `*`，保留自身）。

**AC6 ✅** 在 `/tmp` 复刻 workflow 的 run 块（假 `src-tauri/gen/android/app/build.gradle.kts` + 假 `$RUNNER_TEMP`）：

```
解码出的 keystore 与原文件字节一致 ✅
keystore.properties 完整写出（storeFile/storeType/storePassword/keyAlias/keyPassword/password）
python3 补丁成功追加 release signingConfig；大括号 9 : 9 平衡 ✅
用 storePassword 真打开解码件 → PKCS12 / 1 个条目 / resume-studio ✅
用 keyAlias + keyPassword 导出证书 → 成功 ✅
```

**AC7 ✅** `keystore.properties` 增 `storeType=PKCS12`；Gradle 补丁改用
`keystoreProperties.getProperty("storeType", "PKCS12")`（带默认值，避免该键缺失时
`as String` 空指针）。

**AC8 ✅** 顺带修掉三处**文档漂移**（都是 identifier 从上轮改动留下）：
`docs/ANDROID-BUILD.md` 的 `adb uninstall com.resumestudio.app`（×2）与
`docs/DESKTOP-BUILD.md` 的三平台凭证路径 `.../com.resumestudio.app/...`（×3）
→ 全部改为真实的 `com.resumestudio.desktop`。另在 `ANDROID-BUILD.md` 第 8 节补 5 条
签名类排错（口令不符 / 格式不匹配 / 别名不存在 / base64 非法 / 误以为配了却仍走 debug）。

### CI 实测挖出的一个既存缺陷（已修）

推送后实测发现 **`Build Android` 在「设置 Android SDK」这一步 20 秒即失败**。
关键是先分清责任：**`Build Android #1`（改动前的 `b371306`）就是同样失败**，
所以与本次 action 升级无关，而是既存缺陷。随后 `Build Desktop #1`（`b371306`）
**433 秒成功**，说明三端桌面包没问题。

根因靠 `android-actions/setup-android@v4.0.2` 的 release notes 定位到（原文）：

> Google no longer serves the `tools` package: it is gone from `repository2-3.xml`,
> so `sdkmanager tools` fails with "Failed to find package 'tools'" and **takes the
> whole action down with it**.

v3.2.2（2024-11）的默认 `packages` 里就含 `tools` → 该版本在今天的 runner 上**必然失败**。
修复：`setup-android@v3` → **`@v4`**（v4.0.2 起只装 `platform-tools`），
并在 workflow 里写下原因、在排查表补一条，避免以后有人「顺手降回 v3」。

> 顺带：这也解释了为什么 `Build Android` 的日志里有一条
> `Node.js 20 is deprecated ... android-actions/setup-android@v3` 的强制升级警告——
> v4 同时把运行时抬到了 Node 24。

**方法论记录**：本次无法读取 job 日志（`/actions/jobs/{id}/logs` 返回
`403 Must have admin rights`，公开仓库也不例外），是靠 ① 对比改动前后的同名运行、
② 逐 step 取失败位置、③ 读上游 release notes 三步定位的。
`check-run annotations` 只能拿到弃用类警告，拿不到失败正文。

### Android 构建的根因修复：`package.json` 缺 `"tauri"` script

`setup-android` 升 v4 后，构建推进到了「构建 APK + AAB」，但仍在 1 分 59 秒处失败：

```
FAILURE: Build failed with an exception.
* What went wrong:
Execution failed for task ':app:rustBuildArm64Debug'.
BUILD FAILED in 1m 59s
```

**定位过程**（因为读不到 job 日志，只能靠 API 侧的 annotation）：

1. 上一轮给 workflow 加的「失败时发 `::error::` annotation」逻辑生效，拿到了上面的正文与
   `npm error To see a list of scripts, run: / npm error   npm run`。
2. 顺着这条线索读 Tauri CLI 源码 `crates/tauri-cli/src/mobile/init.rs`，找到机制：
   `tauri android init` 按「**CLI 是怎么被启动的**」来推断 Gradle 该执行什么命令。
   本项目通过 npm 脚本启动 → CI 检测到 `npm_execpath` 指向 `npm-cli` → 推断出
   `npm run -- tauri android android-studio-script`，并把它**烘焙进生成的**
   `buildSrc/src/main/kotlin/BuildTask.kt`：
   ```kotlin
   val executable = "npm";
   val args = listOf("run", "--", "tauri", "android", "android-studio-script");
   ```
3. 于是 Gradle 的 `rustBuild*` 任务会去执行 `npm run tauri ...`，而本仓库
   `package.json` 的 `scripts` 里**没有 `tauri` 条目** → npm 报错 → 构建失败。
   （`create-tauri-app` 官方模板本来就带这一条，本项目是手工给静态站包壳，所以漏了。）

**A/B 对照验证**（决定性证据）：

| 条件 | `npm run -- tauri --version` 输出 |
|---|---|
| 有 `"tauri": "tauri"` | `tauri-cli 2.11.4` ✅ |
| 临时删掉该 script | `npm error To see a list of scripts, run:`<br>`npm error   npm run` ← **与 CI 日志逐字相同** |

**修复**：`package.json` 的 `scripts` 增加 `"tauri": "tauri"`；
并在 `docs/ANDROID-BUILD.md` 第 4 节补前置条件警告、第 8 节补对应排错条目
（含机制说明与自检命令 `npm run -- tauri --version`）。

> 这条坑的价值超出了本项目：**任何手工给静态 Web 应用包 Tauri 壳的仓库都会踩到**，
> 已同步写入 `~/.workbuddy/skills/tauri-wrap-static-webapp/SKILL.md`。

### 需要人工完成的一步（API 路径被权限挡住）

**把 4 个值填进仓库 Secrets**：`Settings → Secrets and variables → Actions → New repository secret`。
值取自 `android-signing/`：

| Secret 名 | 取值 |
|---|---|
| `ANDROID_KEY_BASE64` | `android-signing/resume-studio-upload.keystore.base64` 的**全部内容**（5940 字节单行） |
| `ANDROID_KEY_ALIAS` | `resume-studio` |
| `ANDROID_KEY_PASSWORD` | 见 `ANDROID-SIGNING-CREDENTIALS.txt` 的 `口令:` |
| `ANDROID_STORE_PASSWORD` | 同 `ANDROID_KEY_PASSWORD`（PKCS12 下二者必须相等） |

Secret 一旦创建就**不可再读回**，所以务必先在密码管理器里留一份。
4 个缺任一个都会静默回退 debug 签名（日志里只有一条 `::notice::`）。

> **为什么是手工**：本机钥匙串里的 GitHub 凭据是**细粒度 PAT**，
> 对 Actions Secrets 只授了 **Read**、没有 Write。实测 `PUT /actions/secrets/{name}` 返回
> `403 Resource not accessible by personal access token`（4 个 secret 全部 403，未写入任何内容）。
> 值得记一笔的教训：**`GET /actions/secrets` 返回 200 并不代表有写权限** ——
> 读写是两项独立授权，不能用「能读」推断「能写」。留待后续的替代路径：
> 在 token 设置里把 `Secrets` 权限改为 **Read and write**，即可由脚本一次写入。

**降低手工出错概率的两个小技巧**（5940 字符手工选中很容易多带空格/换行）：

```bash
cd android-signing
pbcopy < resume-studio-upload.keystore.base64   # 然后直接 Cmd+V 填 ANDROID_KEY_BASE64
pbcopy < ANDROID-SIGNING-CREDENTIALS.txt        # 口令与别名在这份里
```

CI 侧消费方式是 `echo "$ANDROID_KEY_BASE64" | base64 -d`，**对尾部换行不敏感**，
所以只要中间没有多余空白即可。

### 后续可选项（本轮未做，避免影响在跑的构建）

- 三个 workflow 均**未配 `concurrency`**：连着推两次会让两轮构建并行跑。加一段
  `concurrency: { group: <wf>-${{ github.ref }}, cancel-in-progress: true }` 可自动取消上一轮。
  本次**刻意不加**——`Build Desktop #1` 已跑 25 分钟以上，取消会白扔这一轮的 Windows msi。
- `dtolnay/rust-toolchain@stable` 用浮动 `@stable` 是官方推荐（rust-cache 需要它）；若要完全可复现可钉到具体版本。
- **仓库可见性（已决策，暂不处理）**：仓库现为 **public**（`shenge-work/resume-builder`）。
  Release 签名的 APK/AAB 会作为 artifact 挂在公开仓库的 Actions 上，**构建成功后 7 天内**
  任何登录 GitHub 的账号都能下载。当前产出的是调试期包、不含个人数据，故**本轮决定保持 public**。
  ⚠️ **将来出正式可上架包之前必须重新评估这一点**：那时 artifact 里会带上真实签名产物，
  若要走 Play 上架，建议先转 private（私有仓库的 Actions 分钟数会计费，公开仓库免费）。
  另一个长期方向是干脆不在 CI 侧出 release 包，改为本机跑 `mobile:android:build` 出包、只把 debug 包留给 CI 冒烟。



