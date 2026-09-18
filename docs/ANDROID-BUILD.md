# Android 版构建说明（Tauri 2.x Mobile）

本项目的 Android 版把现有「零构建」Web 前端（`index.html` + `css/` + `js/`）套进 Tauri 2.x 的
**移动端（Android）** 壳，一份代码产出 **APK**（真机安装 / 自测）与 **AAB**（上架 Google Play）。

- 前端仍**没有打包器**：`<script>` 顺序直加载，Tauri 侧开启 `withGlobalTauri`，
  JS 只用 `window.__TAURI__.core.invoke` 就能调 Rust 命令，**不需要任何 npm 前端依赖**。
- 与桌面壳**共用同一份前端产物**（`dist-desktop/`）与同一个 `frontendDist`
  （见 `src-tauri/tauri.conf.json` 的 `build.frontendDist = ../dist-desktop`）。
- **本机（macOS，无 JDK / Android SDK / NDK）无法构建 APK**，只能走 CI —— 详见第 2 节与第 4 节。

---

## 1. 目录与文件

| 路径 | 作用 |
|---|---|
| `src-tauri/` | Tauri 工程（Rust）：`Cargo.toml`、`build.rs`、`tauri.conf.json`、`src/*.rs`、`icons/` |
| `src-tauri/gen/android/` | **生成物**：`tauri android init` 现场生成的 Gradle / Kotlin / Manifest 工程，**不入库** |
| `js/store/native-bridge.js` | 前端桥：检测到 `window.__TAURI__` 才注入 `window.__RESUME_NATIVE__` |
| `tools/build-desktop-frontend.js` | 把前端资源白名单复制到 `dist-desktop/`（桌面与 Android 共用） |
| `.github/workflows/build-android.yml` | Android 出包 CI（JDK 17 + SDK + NDK + 4 个 rust target） |
| `.github/workflows/build-desktop.yml` | 桌面三平台出包 CI（互不影响） |

要点：

- **不要手写 `src-tauri/gen/` 下的任何文件**。它由 CLI 生成，手写模板无法跟随 CLI 版本升级，
  极易产出坏工程；本地与 CI 都执行 `tauri android init` 重新生成。
- 根 `.gitignore` 已忽略 `src-tauri/gen/`；`src-tauri/.gitignore` 另有 `/target` 与 `/gen/schemas`。
- `dist-desktop/` 同样不入库。

---

## 2. 前置依赖

| 依赖 | 版本 / 说明 | 本机状态 |
|---|---|---|
| **JDK 17** | 必须 17（Gradle 8 / AGP 要求）；`brew install temurin@17` 或用 Android Studio 自带 JBR | ❌ 未安装（`Unable to locate a Java Runtime`） |
| **Android SDK** | 设 `ANDROID_HOME`（macOS 默认 `~/Library/Android/sdk`），需含 platform / platform-tools / build-tools / cmdline-tools | ❌ 未安装，`ANDROID_HOME` 未设置 |
| **Android NDK** | 侧-by-side 安装，设 `NDK_HOME=$ANDROID_HOME/ndk/<版本>`；CI 用 `27.0.12077973` | ❌ 未安装 |
| **Rust 目标** | `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android` | 本机无 Rust 工具链 |
| **Node ≥ 16.7** | 仓库脚本用 `fs.cpSync`；CI 用 Node 22 | ✅ |
| `@tauri-apps/cli` | 唯一 devDependency，`npm install` 安装 | ✅（需先 `npm install`） |

环境变量（写入 `~/.zshrc`）：

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)      # macOS
export ANDROID_HOME=$HOME/Library/Android/sdk
export NDK_HOME=$ANDROID_HOME/ndk/27.0.12077973
```

> ### ⚠️ 本机若无 JDK / SDK / NDK，无法本地构建
> 三个依赖缺一不可：`tauri android init` 需要 Java + SDK，`tauri android build` 还需要 NDK 与 4 个 rust target。
> **缺任一都无法产出 APK/AAB** —— 此时**只能走 CI**（第 4 节），把代码推到 GitHub 触发
> `.github/workflows/build-android.yml`，从 Actions 下载产物。

---

## 3. 本地构建步骤（依赖齐全的机器上）

```bash
npm install                       # 装 @tauri-apps/cli

npm run mobile:android:init       # 生成 Android 工程 → src-tauri/gen/android
npm run mobile:android:dev        # 连真机/模拟器开发调试（需 adb 可见设备，或已启动 AVD）
npm run mobile:android:build      # 构建（等价 tauri android build）
```

三个脚本都**先跑 `npm run desktop:assets`**，把前端资源复制到 `dist-desktop/`（Android 与桌面共用）。

指定产物类型（脚本后追加的参数会透传给 `tauri android build`）：

```bash
npm run mobile:android:build -- --apk            # APK（release）
npm run mobile:android:build -- --aab            # AAB（release，上架用）
npm run mobile:android:build -- --apk --debug    # debug APK（自测用，无需签名）
npm run mobile:android:build -- --apk --target aarch64   # 只编 arm64
```

产物位置：

```
src-tauri/gen/android/app/build/outputs/
├── apk/universal/release/app-universal-release.apk    # 通用 APK（含全部 ABI）
├── apk/universal/debug/app-universal-debug.apk        # debug APK
├── apk/{arm64,arm,x86,x86_64}/release/...             # --split-per-abi 时按 ABI 分包
└── bundle/universalRelease/app-universal-release.aab  # AAB
```

`tauri android dev` 常用开关：`--host`（指定设备 IP）、`-d`（模拟器）。

---

## 4. CI 出包与 artifact 下载

`.github/workflows/build-android.yml` 在 `push`（main 分支且前端/Rust/配置/workflow 有变动）、
`pull_request` 与手动 `workflow_dispatch` 时运行，`runs-on: ubuntu-latest`。

流程：`checkout@v4` → `setup-java@v4`（JDK 17 / temurin）→ `android-actions/setup-android@v3` →
`sdkmanager` 安装 `ndk;27.0.12077973` 并导出 `NDK_HOME` → `setup-node@v4`（22）→
`dtolnay/rust-toolchain@stable` → `rustup target add` 4 个 Android 目标 → `swatinem/rust-cache@v2` →
`npm install` → **`npm run mobile:android:init`（现场生成 Android 工程）** →
`tauri android build --apk` / `--aab` → `actions/upload-artifact@v4`（`if-no-files-found: error`）。

| artifact 名 | 内容 |
|---|---|
| `resume-studio-android-apk` | `src-tauri/gen/android/app/build/outputs/apk/**/*.apk` |
| `resume-studio-android-aab` | `src-tauri/gen/android/app/build/outputs/bundle/**/*.aab` |

**下载方式**：GitHub 仓库页 → **Actions** → 选中对应 workflow run → 页面底部 **Artifacts** 区下载 zip。
产物默认保留 14 天。

签名行为（见第 5 节）：4 个 secrets 齐全 → release 签名；缺任一 → **走 debug 签名并输出一条
`::notice::` 提示，workflow 不会失败**。

---

## 5. keystore 生成与保管（**绝不入库**）

### 5.1 生成上传密钥

```bash
keytool -genkeypair -v \
  -keystore ~/upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias upload
# 记牢：store 密码、key 密码、alias（上面的 upload）
```

> 一个 keystore 一旦上传 Play，**丢失即无法更新应用**（只能换包名重新上架）。
> 请离线备份到密码管理器 / 公司密钥托管处。

### 5.2 编码为 base64 并配置 CI secrets

```bash
base64 -i ~/upload-keystore.jks | pbcopy        # macOS：复制到剪贴板
# Linux：base64 -w 0 ~/upload-keystore.jks
```

GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**，建 4 个：

| secret | 值 |
|---|---|
| `ANDROID_KEY_BASE64` | keystore 文件的 base64（单行） |
| `ANDROID_KEY_ALIAS` | `upload`（或你的 alias） |
| `ANDROID_KEY_PASSWORD` | key 密码 |
| `ANDROID_STORE_PASSWORD` | keystore 密码（建议与 key 密码一致） |

CI 会把它解码到 `$RUNNER_TEMP/upload-keystore.jks`，并写入生成目录下的
`src-tauri/gen/android/keystore.properties`（`storeFile` / `storePassword` / `keyAlias` /
`keyPassword` / `password`）。`app/build.gradle.kts` 默认没有 release 签名配置，
CI 仅在尚未配置时追加一段 `signingConfigs { create("release") { ... } }`（幂等，已存在则跳过）。

### 5.3 本地签名

把 `keystore.properties` 放到 `src-tauri/gen/android/`（该文件是生成目录下的，**不会入库**）：

```properties
storeFile=/absolute/path/to/upload-keystore.jks
storePassword=********
keyAlias=upload
keyPassword=********
```

并按 Tauri 官方文档在 `src-tauri/gen/android/app/build.gradle.kts` 里补上 release 签名配置
（与 CI 追加的那段相同）。

> **绝不要把 keystore / 密码提交进仓库**：`.jks`、`.keystore`、`keystore.properties`
> 都应在 `.gitignore` 覆盖范围内；本项目还会忽略整个 `src-tauri/gen/`。

---

## 6. 真机安装与调试

```bash
adb devices                                      # 确认设备已连接（并已授权 USB 调试）
adb install -r app-universal-debug.apk           # 安装 / 覆盖安装（debug 包最省事）
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
adb logcat | grep -i tauri                       # 看运行时日志
adb uninstall com.resumestudio.app               # 卸载（identifier 见 tauri.conf.json）
```

> Android 11+ 若提示签名不一致，先卸载旧包再装；release 包必须用同一 keystore 签名才能覆盖升级。

---

## 7. 移动端 UI 行为（本期加固）

| 主题 | 实现 | 降级 |
|---|---|---|
| 视口 | `index.html` 的 viewport 带 `viewport-fit=cover`，否则 `env(safe-area-inset-*)` 恒为 0 | — |
| 软键盘 | `js/app.js` 监听 `window.visualViewport` 的 `resize`/`scroll`，把可视高度/键盘高度写入 CSS 变量 `--vvh` / `--kb`；`.app{height:var(--vvh)}`、`.mobile-tabbar{bottom:var(--kb)}` | 无 `visualViewport` 时退化为 `window.innerHeight`（`--kb=0`）；再不行 CSS 有 `100vh` / `0px` 兜底 |
| 聚焦防遮挡 | 小屏/触控设备下，`focusin` 后延迟 300ms 把输入框 `scrollIntoView({block:'center'})` | 非小屏不触发 |
| 返回键 | History API：进入编辑/同步视图时 `pushState({mv:view})`；`popstate` 时先关可见弹层，再回预览视图，已在预览页且无弹层才真正后退 | 原生壳做能力探测监听 Tauri 事件，拿不到则静默跳过；Android WebView 的系统返回键本身触发 `history.back()`，浏览器路径已覆盖 |
| 手感 | `overscroll-behavior`、`-webkit-tap-highlight-color:transparent`、长按选中抑制（正文与 `#editor` 仍可选中）、输入框字号 ≥16px | 全部只在 `≤640px` / `(pointer:coarse)` 内生效，桌面零变化 |

---

## 8. 常见报错排查

| 现象 | 原因与处理 |
|---|---|
| `Unable to locate a Java Runtime` / `JAVA_HOME is not set` | 未装 JDK 17。装 Temurin 17 并导出 `JAVA_HOME`；CI 由 `setup-java@v4` 处理 |
| `ANDROID_HOME not set` / `SDK location not found` | 未设 `ANDROID_HOME`（CI 由 `android-actions/setup-android@v3` 设置；本地写入 shell 配置） |
| `NDK not configured` / `NDK_HOME` 未生效 / `No toolchains found` | 用 `sdkmanager --install "ndk;27.0.12077973"` 安装并导出 `NDK_HOME=$ANDROID_HOME/ndk/27.0.12077973`（同时设 `ANDROID_NDK_HOME` 兼容旧脚本） |
| `error: target ... may not be enabled` / 链接器报 `arm-linux-androideabi` 缺失 | rust target 未装全：`rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android` |
| Gradle 下载超时 / `Could not resolve com.android.tools.build:gradle` | 网络问题或代理未配；重跑一次；自建环境可配 `~/.gradle/gradle.properties` 的代理；CI 上通常是偶发，重试 workflow |
| `Could not resolve all files` / 依赖下载卡在 `services.gradle.org` | 同上；也可在公司网络下改用内网 Gradle 镜像 |
| 安装时 `INSTALL_FAILED_UPDATE_INCOMPATIBLE` / 签名不匹配 | 旧包是另一 keystore 签的。先 `adb uninstall com.resumestudio.app` 再装 |
| release 包未签名（`app-universal-release-unsigned.apk`） | `keystore.properties` 缺失或 `build.gradle.kts` 没有 release signingConfig。检查第 5 节；CI 未配 secrets 时会有 `::notice::` 提示并自动改走 debug 签名 |
| `tauri android init` 报 identifier 不合法 / 改过 identifier | `tauri.conf.json` 的 `identifier` 改动后要 **重新 init**（删掉 `src-tauri/gen/android` 再生成），否则包名与配置不一致 |
| 打出来的包白屏 / 资源 404 | `dist-desktop/` 是旧的或缺失。`mobile:android:*` 脚本会先跑 `npm run desktop:assets`；手动跑 `tauri` 命令前请补跑一次 |
| `frontendDist ../dist-desktop not found` | 同上，先 `npm run desktop:assets` |

---

## 9. 与桌面壳的关系（零回归）

- **同一份前端产物**：Android 与桌面都吃 `dist-desktop/`，`tauri.conf.json` 里只有一个
  `frontendDist`，平台差异只用 `tauri.<platform>.conf.json` 覆盖（目前未用到）。
- 桌面脚本 `desktop:dev` / `desktop:build` 与移动端 `mobile:android:*` **互不干扰**，
  两个 CI workflow 也各自独立触发。
- 移动端加固的 CSS 全部写在 `@media (max-width:640px)` / `@media (pointer:coarse)` 内，
  `@media print` 与桌面样式未改动；`js/app.js` 只新增函数（返回键、软键盘），
  渲染 / `recordHistory` / `undo` / `redo` 未改动。
- `js/store/native-bridge.js` 在浏览器中仍不注入任何全局，`ResumeStore` 的浏览器降级路径不变；
  `npm start` 的本地服务工作流不受影响。
- **iOS 不在本轮**：需要完整 Xcode（本机只有 Command Line Tools）。
