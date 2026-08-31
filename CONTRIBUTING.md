# 贡献指南（Contributing）

感谢你关注 resume-builder！这是一个纯前端、零后端的简历排版工具，欢迎 Issue 与 PR。

## 开发环境

仅需 Node.js（>= 16，CI 用 20）。无需安装第三方依赖。

```bash
# 本地预览（多文件版）
python3 -m http.server 8000
# 打开 http://localhost:8000

# 运行测试（纯 Node，零依赖）
npm test

# 重新构建单文件版（同时产出 dist/ 与根目录副本，字节一致）
npm run build
```

## 目录约定

| 路径 | 说明 |
|---|---|
| `index.html` | 多文件版页面入口（内联事件统一走 `ResumeEditor.xxx`） |
| `css/style.css` | 全部样式（含 `@media print` 打印样式） |
| `js/data.js` | 简历数据 + 默认字号/间距（唯一数据源） |
| `js/app.js` | 业务逻辑，封装为 IIFE，仅暴露 `window.ResumeEditor` |
| `vendor/` | 本地化的第三方库（html2canvas / jsPDF），离线可用 |
| `tools/build-single.js` | 打包脚本：多文件 → 单文件 HTML |
| `test/` | 纯 Node 零依赖测试（`run.js` 运行器 + `cases.js` 用例） |
| `简历编辑器-单文件.html` | 预构建单文件版（纳入版本控制，双击即开） |
| `dist/` | 构建产物缓存（已被 `.gitignore` 忽略） |

## 提交规范

- 功能/修复请在独立分支开发，PR 目标 `main`。
- **改完务必跑 `npm test` 与 `npm run build`**，CI 也会自动跑这两项。
- 提交信息建议语义化：`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`。
- 涉及用户可见变更，请同步更新 [CHANGELOG.md](./CHANGELOG.md) 与 [README.md](./README.md)。
- 不要手改 `dist/` 产物；不要直接提交 `.workbuddy/` 等本地 Agent 状态目录（已在 `.gitignore` 中忽略）。

## 数据隐私

`js/data.js` 内置示例个人简历信息。公开仓库前请替换为占位内容或确认无隐私风险，避免泄露真实个人信息。

## 行为准则

请友好、就事论事地交流。我们采用常见的开源协作礼仪，暂不单独维护 CODE_OF_CONDUCT。
