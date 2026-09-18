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

流程：`checkout@v7` → `setup-java@v6`（JDK 17 / temurin）→ `android-actions/setup-android@v4` →
`sdkmanager` 安装 `ndk;27.0.12077973` 并导出 `NDK_HOME` → `setup-node@v7`（22）→
`dtolnay/rust-toolchain@stable` → `rustup target add` 4 个 Android 目标 → `swatinem/rust-cache@v2` →
`npm install` → **`npm run mobile:android:init`（现场生成 Android 工程）** →
`配置 Android 签名`（见第 5 节）→ **`tauri android build --apk --aab`（一步同时出两种包）** →
`actions/upload-artifact@v7`（`if-no-files-found: error`）。

> APK 与 AAB 用**同一条命令**产出：`--apk --aab` 在同一个进程内做两次打包、共享 Rust 产物。
> 拆成两条命令会让 4 个 ABI 的 Rust 编译被完整跑两遍（首轮构建多花十几分钟）。
>
> action 主版本一律取**当前最新稳定**（checkout / setup-node 已到 v7，setup-java 到 v6）。
> v4 系列运行在 Node 20 上，GitHub 已弃用并会在日志里刷 deprecation 警告。

| artifact 名 | 内容 |
|---|---|
| `resume-studio-android-apk` | `src-tauri/gen/android/app/build/outputs/apk/**/*.apk` |
| `resume-studio-android-aab` | `src-tauri/gen/android/app/build/outputs/bundle/**/*.aab` |

**下载方式**：GitHub 仓库页 → **Actions** → 选中对应 workflow run → 页面底部 **Artifacts** 区下载 zip。
产物默认保留 14 天。

签名行为（见第 5 节）：4 个 secrets 齐全 → release 签名；缺任一 → **走 debug 签名并输出一条
`::notice::` 提示，workflow 不会失败**。

---

## 5. 签名配置（**密钥库绝不入库**）

> 本项目已生成好一套可用凭据，放在 `android-signing/`（该目录被双保险忽略，见 5.6）。
> 你只需把其中 4 个值填进 GitHub Secrets（见 5.3）。

### 5.1 生成上传密钥（需要 JDK 的 `keytool`）

```bash
JDK="$HOME/.workbuddy/binaries/java/temurin-17"   # 本机已装，见文末
"$JDK/bin/keytool" -genkeypair \
  -keystore android-signing/resume-studio-upload.keystore \
  -storetype PKCS12 \
  -alias resume-studio \
  -keyalg RSA -keysize 4096 -sigalg SHA256withRSA \
  -validity 10000 \
  -dname "CN=Resume Studio, OU=Release, O=Resume Studio, L=Shenzhen, ST=Guangdong, C=CN" \
  -storepass "$PW" -keypass "$PW"
```

这些参数别乱改，各自的理由：

| 参数 | 为什么这样取值 |
|---|---|
| `-storetype PKCS12` | JDK 9 起 `keytool` 的默认格式，也是 AGP 未指定 `storeType` 时的默认。**PKCS12 下 `keypass` 必须等于 `storepass`**（JKS 才允许两者不同） |
| `-alias resume-studio` | 与 CI 写入的 `keystore.properties` 里 `keyAlias` 一致；改名要同步改 secret |
| `-keysize 4096` + `SHA256withRSA` | Play 接受，比 2048 更耐时间 |
| `-validity 10000` | ≈27 年。Play 要求上传密钥有效期至少覆盖到 **2033-10-22**，而 `keytool` 默认只有 90 天 |
| `-dname` | **不要写真名 / 真公司**——这段会随 APK 公开可见（本项目用中性占位） |

### 5.2 编码为 base64（必须单行）

```bash
openssl base64 -A -in android-signing/resume-studio-upload.keystore \
  -out android-signing/resume-studio-upload.keystore.base64
```

> 用 `openssl base64 -A`（`-A` = 不折行）。macOS 自带的 `base64 -i file` 会按 76 列折行；
> CI 侧虽然用 `base64 -d` 能容忍换行，但统一单行最不容易踩坑。

**用之前先自检一遍**（解码回文件 → 字节比对 → 让 `keytool` 真打开一次）：

```bash
base64 -d < android-signing/resume-studio-upload.keystore.base64 > /tmp/rt.keystore
cmp android-signing/resume-studio-upload.keystore /tmp/rt.keystore && echo "字节一致"
"$JDK/bin/keytool" -list -keystore /tmp/rt.keystore -storepass "$PW"
```

### 5.3 配置 4 个 GitHub Secrets

仓库页 → **Settings → Secrets and variables → Actions → Secrets → New repository secret**：

| secret | 取值 |
|---|---|
| `ANDROID_KEY_BASE64` | `android-signing/resume-studio-upload.keystore.base64` 的**全部内容**（单行，约 5.8 KB） |
| `ANDROID_KEY_ALIAS` | `resume-studio` |
| `ANDROID_KEY_PASSWORD` | keystore 口令（PKCS12 下与下面同一个值） |
| `ANDROID_STORE_PASSWORD` | keystore 口令（同上） |

> 4 个都填了才走 release 签名；**缺任一个会自动回退 debug 签名**并输出一条 `::notice::`，
> workflow 不会失败——能装真机验证，但不能上架。

### 5.4 CI 里实际做了什么

`.github/workflows/build-android.yml` 的「配置 Android 签名」步骤：

1. 先判断 4 个 secret 是否齐全，不齐则 `signed=false` 并跳过整步；
2. `base64 -d` 解码到 `$RUNNER_TEMP/upload-keystore.jks`——**临时目录，构建结束随 runner 销毁**；
3. 在生成的工程里写 `src-tauri/gen/android/keystore.properties`：

   ```properties
   storeFile=$RUNNER_TEMP/upload-keystore.jks
   storeType=PKCS12
   storePassword=***
   keyAlias=resume-studio
   keyPassword=***
   password=***
   ```

4. 官方模板的 `app/build.gradle.kts` **不含 release 签名配置**，CI 在文件末尾追加
   `signingConfigs { create("release") { ... } }` 与 `buildTypes.release.signingConfig`。
   补丁是幂等的（已含 `keystore.properties` 引用就跳过）——因为 `gen/android` 每次 CI 都重新生成。

### 5.5 本地签名（想在本机出 release 包时）

把 `keystore.properties` 放到 `src-tauri/gen/android/`（生成目录，不入库），
并把 5.4 的 Gradle 补丁手动加到 `app/build.gradle.kts`：

```properties
storeFile=/绝对路径/android-signing/resume-studio-upload.keystore
storeType=PKCS12
storePassword=***
keyAlias=resume-studio
keyPassword=***
```

### 5.6 凭据隔离与运维

- **忽略规则**：仓库根 `.gitignore` 覆盖整个 `android-signing/`、`*.jks`、`*.keystore`、
  `keystore.properties`；`android-signing/` 内**另有一层 `.gitignore`（内容为 `*`）**做双保险，
  防误用 `git add -f`。提交前用 `git status --short` 确认该目录不出现。
- **务必离线备份**：keystore 一旦用于 Play 上架，**丢失就再也无法更新同一个应用**
  （只能换包名重新上架）。请连同口令一起存进密码管理器。
  本项目把口令放在 `android-signing/ANDROID-SIGNING-CREDENTIALS.txt`（同样不入库，仅供自取）。
- **核对指纹**：`keytool -list -v` 会打印 SHA-256。Android 与 Play 后台都按指纹校验，
  轮换密钥时用它确认换对了。
- **轮换**：重新生成 → 重算 base64 → 更新 4 个 secret 即可，代码与 workflow 都不用动。

<details>
<summary>本机 JDK 是怎么装上的（如需重装）</summary>

本机原本没有 JDK（`/usr/bin/keytool` 是 macOS 的空壳，直接调用会报
"Unable to locate a Java Runtime"），而生成密钥库必须用 `keytool`。安装方式：

```bash
# GitHub Release 直连在本机被代理拦截（502），改用清华镜像
curl -L -o jdk17.tar.gz \
  https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jdk/aarch64/mac/OpenJDK17U-jdk_aarch64_mac_hotspot_17.0.20.1_1.tar.gz
tar -xzf jdk17.tar.gz
# macOS 的 tar 包是 bundle 结构（jdk-*/Contents/Home/...），要把 Contents/Home 上提一层
mv jdk-17*+1/Contents/Home "$HOME/.workbuddy/binaries/java/temurin-17"
# 压缩包 177 MB，解压后约 309 MB；只用来生成密钥库的话，装完即可整个删除
```

</details>

---

## 6. 真机安装与调试

```bash
adb devices                                      # 确认设备已连接（并已授权 USB 调试）
adb install -r app-universal-debug.apk           # 安装 / 覆盖安装（debug 包最省事）
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
adb logcat | grep -i tauri                       # 看运行时日志
adb uninstall com.resumestudio.desktop            # 卸载（包名 = tauri.conf.json 的 identifier）
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
| `Unable to locate a Java Runtime` / `JAVA_HOME is not set` | 未装 JDK 17。装 Temurin 17 并导出 `JAVA_HOME`（装法见第 5 节文末）；CI 由 `setup-java@v6` 处理 |
| `ANDROID_HOME not set` / `SDK location not found` | 未设 `ANDROID_HOME`（CI 由 `android-actions/setup-android@v4` 设置；本地写入 shell 配置） |
| `设置 Android SDK` 步骤 **20 秒即失败**、日志里出现 `Failed to find package 'tools'` | `android-actions/setup-android` 用了 **v3**。v3.2.2 的默认 `packages` 含 `tools`，而 **Google 已把 `tools` 包从 `repository2-3.xml` 移除** → `sdkmanager tools` 报错并把整个 action 拖垮。**升到 `@v4`**（v4.0.2 起只装 `platform-tools`）。这是本项目实测踩到的坑，见 `docs/ACCEPTANCE.md` |
| `NDK not configured` / `NDK_HOME` 未生效 / `No toolchains found` | 用 `sdkmanager --install "ndk;27.0.12077973"` 安装并导出 `NDK_HOME=$ANDROID_HOME/ndk/27.0.12077973`（同时设 `ANDROID_NDK_HOME` 兼容旧脚本） |
| `error: target ... may not be enabled` / 链接器报 `arm-linux-androideabi` 缺失 | rust target 未装全：`rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android` |
| Gradle 下载超时 / `Could not resolve com.android.tools.build:gradle` | 网络问题或代理未配；重跑一次；自建环境可配 `~/.gradle/gradle.properties` 的代理；CI 上通常是偶发，重试 workflow |
| `Could not resolve all files` / 依赖下载卡在 `services.gradle.org` | 同上；也可在公司网络下改用内网 Gradle 镜像 |
| 安装时 `INSTALL_FAILED_UPDATE_INCOMPATIBLE` / 签名不匹配 | 旧包是另一 keystore 签的。先 `adb uninstall com.resumestudio.desktop` 再装 |
| release 包未签名（`app-universal-release-unsigned.apk`） | `keystore.properties` 缺失或 `build.gradle.kts` 没有 release signingConfig。检查第 5 节；CI 未配 secrets 时会有 `::notice::` 提示并自动改走 debug 签名 |
| `Keystore was tampered with, or password was incorrect` | 口令不对。**注意 PKCS12 下 `keyPassword` 必须与 `storePassword` 相同**（JKS 才允许不同）；也可能是 secret 里复制进了多余空格/换行 |
| `Invalid keystore format` / `toDerInputStream rejects tag type` / `Unsupported keystore format` | `storeType` 与文件实际格式不匹配（JKS ↔ PKCS12 混淆）。本项目统一用 PKCS12，并已在 CI 显式写入 `storeType=PKCS12`；若你换成 JKS，务必同步改 `keystore.properties` 与 Gradle 里的 `storeType` |
| `Key with alias '...' was not found` / `Cannot recover key` | `ANDROID_KEY_ALIAS` 写错。用 `keytool -list -keystore <file> -storepass <pw>` 打出真实别名核对 |
| `storeFile ... does not exist` / `base64: invalid input` | `ANDROID_KEY_BASE64` 为空或不是完整单行。用第 5.2 的「自检」命令先本地验一遍再贴 |
| 构建日志显示 `未配置 ... 走 debug 签名` 而你以为配了 | 4 个 secret **缺任一个**都会整体回退 debug。检查名称拼写（含大小写）与是否建在 **Secrets** 而非 **Variables** |
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
