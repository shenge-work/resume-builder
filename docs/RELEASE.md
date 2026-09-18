# 发版说明（Release）

本文说明如何把一个版本发出去：**自动构建三平台桌面包 + Android 包 → 聚合成一个 GitHub Release
→ 附带版本号与更新说明**。全流程由 `.github/workflows/release.yml` 完成，不需要手工上传任何文件。

---

## 1. 一句话版本

```bash
# ① 改版本号（两处必须一致）
#    src-tauri/tauri.conf.json 的 version
#    package.json 的 version
# ② 写 CHANGELOG：把 [Unreleased] 改名成 [x.y.z] - 日期
# ③ 打标签推上去
git tag v1.1.0 && git push origin v1.1.0
```

推完标签就可以关掉终端了 —— 大约 20~30 分钟后，仓库的 **Releases** 页面会出现一版新的发布，
里面是可直接下载的安装包。

---

## 2. 版本号的唯一权威

**`src-tauri/tauri.conf.json` 的 `version` 是唯一权威。** 理由：它是 Tauri 打包时真正写进产物
（并体现在安装包文件名、macOS `Info.plist`、Android `versionName`）的值。`package.json` 的
`version` 必须与之一致，**发版流水线会校验，不一致直接失败**。

> 为什么不做「workflow 自动改版本号」：那样仓库里记录的版本号会与已发布的产物脱节，
> 下一次构建又回到旧版本，越滚越乱。**版本号必须是一次真实提交**，这样
> 「tag ↔ 仓库内容 ↔ 产物」三者永远可对应。发版失败时的报错会直接告诉你该改哪两个文件。

---

## 3. 两种触发方式

### 方式 A：推标签（推荐，最标准）

```bash
git tag v1.1.0
git push origin v1.1.0
```

标签名必须以 `v` 开头，其后是 `x.y.z`（可带 `-beta.1` 这类预发布后缀）。
`v` 会被自动去掉。

### 方式 B：Actions 页面一键发（不必打标签）

仓库 → **Actions** → 左侧选 **Release** → **Run workflow**，填：

| 输入 | 说明 |
|---|---|
| `version` | 要发布的版本号（不带 `v`），例如 `1.1.0`。**必须与仓库里两个文件的 version 一致** |
| `prerelease` | 勾上则标记为 Pre-release（不会成为「Latest」） |
| `draft` | 勾上则先建为草稿，确认无误后再手动公开 |

这种方式下标签由 `gh` 基于当前 commit 自动创建。

> 两种方式跑的是**同一条流水线**，产物与说明完全一致。

---

## 4. 完整的标准发版流程

```bash
# 0) 确认工作区干净、测试通过
npm test

# 1) 改版本号（两处）
#    src-tauri/tauri.conf.json → "version": "1.1.0"
#    package.json             → "version": "1.1.0"

# 2) 整理 CHANGELOG：把 [Unreleased] 改成 [1.1.0] - YYYY-MM-DD，
#    并在文件顶部新开一个空的 [Unreleased]（内容写「暂无。」即可）

# 3) 提交并推送
git add -A && git commit -m "chore(release): v1.1.0"
git push origin main

# 4) 打标签（标签必须在版本号提交之后打，否则发布出去的 tag 指向旧代码）
git tag v1.1.0 && git push origin v1.1.0
```

> ⚠️ **顺序很重要**：先提交版本号，再打标签。反过来会导致标签指向的 commit 里
> version 还是旧值，流水线的「版本号一致性校验」会直接失败（这是设计如此）。

---

## 5. 流水线做了什么

```
prepare（解析版本 / 校验一致性 / 跑测试 / 抽取 CHANGELOG 更新说明）
   ├── desktop  → 复用 build-desktop.yml：macos-latest / windows-latest / ubuntu-latest 三端矩阵
   └── android  → 复用 build-android.yml：APK + AAB（signing secrets 经 secrets: inherit 传入）
        ↓
publish（下载全部 artifact → 归一化文件名 → 生成 SHA256SUMS.txt → gh release create）
```

三个设计要点：

1. **复用而不是复制构建逻辑**。`build-desktop.yml` / `build-android.yml` 同时声明了
   `workflow_call`，发版时被调用。这样「平时 push 到 main 的冒烟构建」与「发版构建」
   **是同一条代码路径**，不会出现「CI 绿的、发版挂的」。
2. **测试是硬门槛**。`npm test` 不过就不出包、不发版。
3. **发版幂等**。同一个版本重复跑，会走「更新说明 + `--clobber` 覆盖资产」而不是报错，
   方便修完问题重发。

---

## 6. Release 里会有什么

| 资产名 | 平台 / 用途 |
|---|---|
| `Resume-Studio-<版本>-windows-x64.msi` | Windows · MSI 安装包（适合批量/域部署） |
| `Resume-Studio-<版本>-windows-x64-setup.exe` | Windows · NSIS 安装程序（适合个人安装） |
| `Resume-Studio-<版本>-macos-arm64.dmg` | macOS · 拖动到「应用程序」即可 |
| `Resume-Studio-<版本>-linux-x86_64.AppImage` | Linux · 免安装，`chmod +x` 后运行 |
| `Resume-Studio-<版本>-linux-amd64.deb` | Linux · Debian / Ubuntu 包 |
| `Resume-Studio-<版本>-android.apk` | **Android · 直接装到手机** |
| `Resume-Studio-<版本>-android.aab` | Android · Google Play 上架用 |
| `Resume-Studio-<版本>-单文件版.html` | 任意浏览器 · 离线单文件版，双击即用 |
| `SHA256SUMS.txt` | 全部文件的 SHA-256，`sha256sum -c SHA256SUMS.txt` 校验 |

**当前已知限制**（会写进 Release 说明里，避免用户困惑）：

- **macOS 包未做代码签名与公证**（Apple 开发者账号未接入）→ 首次打开需**右键 → 打开**。
- **Windows 包未做代码签名** → SmartScreen 可能提示「未知发布者」。
- **Android APK 是通用包**（4 个 ABI 的 Rust 产物打在一起，约 140 MB+），尚未做 ABI 拆分。

---

## 7. 更新说明（Release Notes）从哪来

**从 `CHANGELOG.md` 自动抽取，不允许为空。** 抽取规则：

1. 找 `## [<本次版本号>]` 章节 → 用它；
2. 找不到 → 退回 `## [Unreleased]`，并在说明顶部加一条「取自 Unreleased」的告警；
3. 两者都没有，或内容只有「暂无。」这类占位 → **发版失败**，并提示去补 CHANGELOG。

> 这条门槛是刻意的：一个没有更新说明的 Release，等于逼使用者自己去 diff 代码。
> 详见 `CHANGELOG.md` 顶部的「发版规则」。

抽取后流水线会在说明里自动追加两段：**「本次发布的安装包」表格**（含各文件体积）
与**「首次打开可能被系统拦下」的注意事项**。

---

## 8. 为什么 GitHub 的「Packages」区是空的

仓库首页右侧有两个区块，容易混淆：

| 区块 | 放什么 | 本项目 |
|---|---|---|
| **Releases** | 面向使用者的**发行包**（安装包、压缩包、校验和） | ✅ **用这个**，见上文 |
| **Packages** | 面向开发者的**包管理器产物**（npm / Docker / Maven / NuGet / RubyGems） | ❌ 不适用 |

本项目交付的是**桌面/安卓安装包**，不是能给 `npm install` 装的库，所以正确的归属是 **Releases**。
`Packages` 区会一直保持为空，**这不是配置遗漏**。

> 若将来真的要往 `Packages` 发东西（例如把某个工具发布成 npm CLI），
> 再单独加一个 `npm publish` 的工作流即可，与本文的发版流水线互不影响。

---

## 9. 常见报错

| 现象 | 原因与处理 |
|---|---|
| `版本号不一致：src-tauri/tauri.conf.json 是「1.0.0」，而要发布的是「1.1.0」` | 忘了改版本号，或**先打标签后改版本**。改完两个文件、提交、再重新打标签 |
| `缺少版本更新说明` | `CHANGELOG.md` 里既没有 `[x.y.z]` 章节也没有可用的 `[Unreleased]`。补上再发 |
| `版本号格式不合法` | 标签不是 `v1.1.0` 这种形式（例如 `v1.1`、`release-1.1.0`）。重打标签 |
| Release 里少了某个平台的包 | 上游 job 失败会直接阻止 publish（`needs` 未满足）。去 Actions 看是哪个矩阵项红了 |
| Android 包是 debug 签名的 | 见 `docs/ANDROID-BUILD.md` 第 5 节。`release.yml` 已用 `secrets: inherit` 传递签名凭据，若仍异常，注意被调用 workflow 是否漏了 `secrets: inherit` |
| 重复发同一版本报错 | 正常路径是幂等的（会覆盖）。若报标签冲突，说明该标签已指向别的 commit |
| 想撤销一版发布 | Actions 页面里删掉 Release（GitHub UI），或 `gh release delete v1.1.0 --yes`；标签需另删 `git push --delete origin v1.1.0` |

---

## 10. 本机自检（推送前跑一次，省一轮 CI）

本机没有 Android SDK / Gradle，**跑不了真实构建**，但可以跑**结构级验证**，抓住语法错误、
路径写错、逻辑分支写反这类问题。下面这套检查在 `release.yml` 首次落地前就跑过，
并当场抓出两个真实缺陷（`[Unreleased]` 里的「暂无。」后面跟着 `---` 导致空说明检查失效；
`$VAR` 紧跟全角字符在 UTF-8 locale 下被当成变量名而报 unbound variable）。

```bash
# ① 所有 workflow 的 YAML 解析 + 全部 run 块 bash -n
python3 - <<'PY'
import io, os, re, subprocess, yaml
WF = '.github/workflows'
for f in sorted(os.listdir(WF)):
    if not f.endswith('.yml'): continue
    d = yaml.safe_load(io.open(f, encoding='utf-8'))
    print('YAML OK', f)
    for job in d['jobs'].values():
        for s in job.get('steps', []):
            if 'run' not in s: continue
            body = re.sub(r'\$\{\{[^}]*\}\}', 'PH', s['run'])
            r = subprocess.run(['bash','-n'], input=body, text=True, capture_output=True)
            if r.returncode: print('  bash -n FAIL', s.get('name'), r.stderr[:200])
PY

# ② 检查「$VAR 后紧跟非 ASCII 字符」—— UTF-8 locale 下会解析失败，必须写成 ${VAR}
#    （CI 的 ubuntu-latest 默认就是 C.UTF-8；本地 LC_ALL=C 反而看不出问题）
python3 - <<'PY'
import io, os, re, yaml
PAT = re.compile(r'\$([A-Za-z_][A-Za-z0-9_]*)')
bad = 0
for f in sorted(os.listdir('.github/workflows')):
    if not f.endswith('.yml'): continue
    d = yaml.safe_load(io.open(os.path.join('.github/workflows', f), encoding='utf-8'))
    for job in d['jobs'].values():
        for s in job.get('steps', []):
            for i, line in enumerate((s.get('run') or '').splitlines(), 1):
                if line.lstrip().startswith('#'): continue
                masked = re.sub(r'\$\{\{[^}]*\}\}', '', line)
                for m in PAT.finditer(masked):
                    c = masked[m.end():m.end()+1]
                    if c and ord(c) > 127:
                        print(f'{f} {s.get("name")}:{i}  ${m.group(1)}{c}'); bad += 1
print('未发现风险写法' if not bad else f'{bad} 处需改成 ${{VAR}}')
PY
```

> ③ 想更彻底一些，还可以把关键 `run` 块的 Python heredoc 抽出来、在临时目录用
> mock 文件实跑（`release.yml` 的「改名 / 校验和 / 生成说明」与 `build-android.yml` 的
> Gradle 补丁都可以这样测）。**但记住结构级自检抓不出类型错误**，
> Kotlin / Rust / Gradle 的问题只能靠真 CI。

---

## 11. 相关文档

- [`docs/ANDROID-BUILD.md`](./ANDROID-BUILD.md) —— Android 构建与签名（含 4 个 secrets 的准备与排错）
- [`docs/DESKTOP-BUILD.md`](./DESKTOP-BUILD.md) —— 桌面三端构建
- [`CHANGELOG.md`](../CHANGELOG.md) —— 版本变更记录（Release 说明的来源）
- [`docs/ACCEPTANCE.md`](./ACCEPTANCE.md) —— 逐任务的验收标准与实测记录
