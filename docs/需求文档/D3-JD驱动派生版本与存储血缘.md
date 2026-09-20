# D3 JD 驱动派生版本与存储血缘

> 编号：D3　借鉴来源：Resume Matcher（master resume + parent_id 版本树 + JD 独立持久化）　状态：✅ 已完成（2026-09-21）

> ⚠️ 本文为**需求基线**，供新团队对齐；非待开发需求。

---

## 一、背景

Resume Matcher 从「ATS 打分」转型「AI harness」，核心是**一份母简历（master）打底，针对不同岗位（JD）生成定制版（tailored）**，并用 `parent_id` 建显式血缘。这印证了本项目「JD 驱动一岗一简历」是行业共识方向。

---

## 二、已落地的需求与实现

**存储血缘**（`js/store/resume-library.js`）：

- `meta` 新增 `parentId` / `kind`（`master`|`derived`，缺省 master）/ `jobId` / `jdText`；
- 新增 `derive({parentId,title,payload?,jobId?,jdText?})`（缺 parentId 抛错）+ `children(parentId)` 反向查询；
- `create`/`save`/`patchMeta` 三处白名单透传。

**JD 派生版本**（`js/jd-derive.js`）：

- 纯函数 `buildDerivedPayload`（深拷贝 + 插「JD 定制待补」分组，不改入参）/ `fillGroupFor` / `suggestSentence` / `deriveTitle`；
- `app.js` 的 `resumeDeriveFromJd` 走 `derive` 生成派生版，记 parentId/kind/jobId/jdText，激活新简历。

**JD 持久化**：JD 原文从「只存 localStorage（换设备即丢）」升级为「随简历库持久化」——存 meta 而非 doc 顶层（`currentPayload()` 只返回 `{data,fonts,spacing,v,savedAt}`，存 doc 顶层会被下次 save 覆盖丢）。

**UI**：抽屉 `renderResumeDrawer` 对 `kind=derived` 显示「定制版」徽标。

---

## 三、验收标准（既定，已达成）

1. 粘贴 JD → 生成派生简历（不覆盖主简历），缺失/弱覆盖关键词已补位。
2. 派生版可回溯到母简历（血缘关系）。
3. JD 持久化，刷新不丢。

---

## 四、工程护栏（不可违背）

1. `meta` 加字段是**白名单式透传**，每个字段显式加一行 + 补测试。
2. JD 不能放 doc 顶层（会被 `currentPayload()` 覆盖），必须走 meta。
3. 切换铁律：先 `activeResumeId = id` 再 `applyPayloadWithoutSave(doc)`。
4. 数据写盘走 `currentPayload()` + savedAt，禁止自拼对象。

---

## 五、后续可优化（如需）

- 借鉴 Resume Matcher 的 **Improvement Record 三方关联**（母简历 + 定制版 + JD），建立「哪种写法拿到面试」的反馈回路——当前已具备 parentId/kind/jobId 字段基础，可在此之上扩展。
