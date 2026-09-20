# AI 助手 · 配置与使用

> 阶段 1 基建已就绪（转发层 + 面板壳）。润色 / 改写 / 诊断等核心能力在阶段 2 接入。

## 快速开始（3 步）

### 1. 复制配置样板

```bash
cp ai.config.example.json ai.config.json
```

### 2. 填入 API Key

编辑 `ai.config.json`：

```json
{
  "provider": "deepseek",
  "baseURL": "https://api.deepseek.com",
  "apiKey": "sk-你的 Key",
  "models": { "fast": "deepseek-v4-flash", "strong": "deepseek-v4-pro" },
  "temperature": 0.4,
  "timeoutMs": 60000
}
```

DeepSeek Key 在 <https://platform.deepseek.com/api_keys> 申请。

### 3. 启动本地服务

```bash
npm start
```

打开 <http://localhost:8000>，点左侧 rail 的「✦ AI」或按 `⌘K`，面板应显示厂商 / 端点 / 模型，点「测试连接」看到 `✓ xxms` 即连通。

## 支持的厂商

| 厂商 | baseURL | 备注 |
|---|---|---|
| DeepSeek | `https://api.deepseek.com` | 默认，中文强、便宜 |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | 改 `models.fast/strong` 为 `glm-4-flash` / `glm-4-plus` |
| Moonshot | `https://api.moonshot.cn/v1` | 改模型名为 `moonshot-v1-8k` / `moonshot-v1-32k` |
| OpenAI | `https://api.openai.com/v1` | 改模型名为 `gpt-4o-mini` / `gpt-4o` |
| 自建网关 | 任意 OpenAI 兼容端点 | baseURL 指到网关根路径即可 |

只要后端兼容 OpenAI Chat Completions 协议，本转发层就能用。

## 隐私与安全

- **Key 只存本机**：`ai.config.json` 已在 `.gitignore` 中，不会进仓库、不会进浏览器。
- **请求只过本地**：浏览器 → `127.0.0.1:8000/api/ai/chat` → 你的模型厂商，不经过任何第三方服务器。
- **服务只监听本机**：`serve.js` 绑定 `127.0.0.1`，同网段他人访问不到。
- **单文件版（file://）**：AI 面板会提示「需要本地服务」，不工作。这是有意为之——Key 不能塞进 HTML 里。

## 接口（给开发者看）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/ai/status` | 返回 `{configured, provider, baseURL, model, nodeVersion}` |
| POST | `/api/ai/test` | 发一条 ping，返回 `{ok, latencyMs, model, error?}` |
| POST | `/api/ai/chat` | SSE 流式转发 OpenAI 协议，body `{messages, model, temperature, stream:true}` |

## 已知限制（阶段 1）

- 面板只有壳和状态显示，润色 / 改写 / 诊断按钮在阶段 2。
- 用量统计只记请求次数（`data/ai-usage.json`），不解析 token 数。
- 未做流式中断 UI（底层 `AbortController` 已就绪）。
