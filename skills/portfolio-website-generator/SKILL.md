---
name: portfolio-website-generator
description: Generate a neo-brutalism × trendy-magazine × talent-archive style personal job portfolio website from a resume. Use when the user provides a resume (or personal background) and asks for a 求职作品集网站, 个人作品集, portfolio website, 求职网站, or mentions wanting a website like the reference portfolio (米白背景/黑色粗线框/亮橙蓝强调色/档案卡/故障动画姓名). Input is a resume file or text; output is a complete runnable static website (HTML/CSS/JS + AI-generated images).
name_cn: 求职网站生成器
description_cn: 提供个人简历，一键生成新粗野主义风格的求职作品集网站（超大姓名排版、立体档案卡、项目黑边卡片、故障动画等全套视觉）。
create_source: super-agent-skill-creator
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'aa9ae756-e0b4-473d-8468-2b7411a18167'
  PropagateID: 'aa9ae756-e0b4-473d-8468-2b7411a18167'
  ReservedCode1: '7a7dcf06-1f37-4421-a8b4-a458bc5b5b0c'
  ReservedCode2: '7a7dcf06-1f37-4421-a8b4-a458bc5b5b0c'
---

# 求职作品集网站生成器

从用户简历生成「新粗野主义 × 潮流杂志 × 人才档案系统」风格的单页求职作品集网站。产出为纯静态 HTML/CSS/JS + AI 生成图片，双击 index.html 即可运行。

## 资产总览

- `assets/template/` — 完整参考实现（含虚构人物"江屿"的全部示例数据与 4 文件代码）。**始终以复制模板为起点，禁止从零重写**
- `references/design-spec.md` — 设计令牌/字体体系/签名元素清单。修改样式前必读
- `references/data-mapping.md` — 简历字段→网站板块映射表、派生字段规则、数据补全原则
- `references/image-prompts.md` — 8~10 张图的统一风格提示词、并行生成防错流程、水印处理
- `scripts/make_favicon.py` — 从形象照生成站点图标（像素字母徽章）

## 工作流程

### Step 1 · 解析简历

读取用户提供的简历（文件或文字）。对照 `references/data-mapping.md` 第 1 节映射表盘点字段齐缺情况。

- 简历信息完整 → 直接进入 Step 2
- 缺失关键字段（求职意向/项目/技能）→ 按 data-mapping.md 第 3 节原则生成补全数据，**并在最终交付说明中列出所有生成项**；若用户提供的是真实简历，只排版不编造，缺失板块删除或留白

### Step 2 · 生成图片

按 `references/image-prompts.md` 执行，共 8~10 张：形象照 ×1、项目封面 ×N（N=项目数）、证书 ×M（M=证书数，上限 3 张配图）。

关键纪律：
1. 全部 prompt 共用逐字一致的风格前缀，仅换主体
2. **并行生成返回的文件顺序与请求顺序不保证对应**，必须拼网格逐张视觉验证后再重命名映射（曾发生 4 图错位事故）
3. 检查角落水印，纯背景区用 OpenCV inpaint 修复固定矩形，压主体则重生成
4. 缩放压缩至参考表尺寸，单图 ≤350KB

### Step 3 · 组装网站

1. 复制 `assets/template/` 全部内容到工作目录（保持 css/ js/ images/ 结构）
2. 生成的图片按 `portrait.jpg / project-N.jpg / cert-N.jpg` 命名放入 `images/`
3. 运行 `python3 scripts/make_favicon.py <形象照> <网站根目录> --letters <姓名缩写>`，生成 favicon 并确认 `<head>` 已引用（模板已带引用，替换字母后需检查徽章字形）
4. 按 `references/data-mapping.md` 替换全部人物数据：index.html（10 板块）、js/main.js（PROJECTS 数组与 data-count）、resume.html
5. 派生字段（档案编号/坐标/区块注释/marquee）按 data-mapping.md 第 2 节规则生成
6. 全文搜索旧人物关键词（`江屿|JIANG YU|临江理工|JY-2026` 及模板中其他人名机构）确认零残留

### Step 4 · 验证

无头浏览器（Playwright + 系统 Chrome）执行：

1. 控制台零报错；全部 `.reveal` 元素滚动后进入 `.in` 状态
2. 390px 与 360px 宽度 `scrollWidth <= clientWidth`（无横向滚动）
3. 模态框可滚动、ESC 可关闭
4. 等数字滚动动画（1.1s）结束后核对统计终值
5. 截图首屏与全页，视觉自查：姓名无叠压、档案卡完整、风格统一

### Step 5 · 交付

- 告知运行方式：双击 index.html
- 说明字体来自 Google Fonts 在线加载，断网打开时字体回退
- 列出所有生成的虚构数据项（如有）
- 如用户要分享链接：建议 Netlify Drop（拖文件夹）或 Cloudflare Pages，需用户自有账号