# 完整复盘：足球运动员模型 — 刷新后身体解散 bug（2026-09-05）

> 范围：本波任务 = 「/model-build-test 拼一个精美的足球运动员模型」+ 用户反馈的「刷新后身体解散」bug 修复。
> 视角：画线建模（genshin-model-studio web/gms API）的持久化标定与基础元件拼装。
> 证据：本会话工具调用链（run-gms-model.sh / inspect-draw-model.sh / browser-harness / read_image）、
> `delivery/soccer-player/`（work.json、items.json、api-inspect.json、view-*.png、page-smoke.png、
> after-refresh-fixed-demo.png）、REPORT.md；当前 HEAD=`4741129`（本波工作尚未提交，见产出清单）。
> 状态：已修复并验证（主页面刷新 + 独立预览 preview-demo.html 均不再解散）；单测 94/94、delivery_check PASS。

---

## 一、错误谱系总览

| # | 日期 | 根因层 | 具体错误 | 修复 | 提交 |
|---|---|---|---|---|---|
| 1 | 2026-09-05 | 标定/选项持久化 | `onOptionChange` 重建 `state.options` 时丢失 `canvasWidthPx` → `gms.part` 以漂移 bbox 为原点写笔画；保存的 work 缺标定字段；刷新后 `applyWork` 补 `canvasWidthPx`，服务端改按固定原点解释同一批像素 → 身体解散 | `web/index.html`：选项变更保留 `canvasWidthPx`（`drawCanvas.clientWidth || 640`） | 待提交 |
| 2 | 2026-09-05 | API 能力边界 | 画线管线无球体基础元件（头/足球只能圆柱近似），"精美"受限 | 按用户提示补充基础元件覆盖：`gms.part('sphere')` + `Stroke.resourceId=10009002`（types/generate/web-shared/index.html + 单测） | 待提交 |
| 3 | 2026-09-05 | 验证链盲区 | 首轮验收只验证"正在展示的页面"，没有刷新/独立预览二次加载验证 → 解散 bug 由用户发现 | 复盘固化：交付前必须做作品 JSON 回灌/刷新/独立预览验证 | 本复盘 |

---

## 二、最近一次错误的完整调查链（现象 → 差分 → 根因 → 修复 → 验证）

### 现象
- 主页面运行 `run-gms-model.sh` 后：状态栏 `✓ 23 笔 · 15 笔封闭 · 54 个元件`，截图正常（球员完整）。
- 刷新主页面 / 打开独立预览 `preview-demo.html`：头/躯干/手臂悬浮，腿/靴/球被留在下方地面 → **身体解散**。

### 差分（关键证据）
1. `scripts/run-gms-model.sh` 落盘的 `work.json.options`：
   `{"mode":"extrude","shape":"cylinder","size":0.03,"count":10,"heightMeters":1,"canvasHeightPx":460}` —— **缺 `canvasWidthPx`**。
2. 刷新后 `localStorage` 的 `work.options`：多出 `"canvasWidthPx":575`（`applyWork` 补的）。
3. 同一份 strokes 分别用两种 options 打 `/api/draw-model`，items 完全不同：
   - pitch：无 canvasWidthPx → `x=-0.0`（bbox 原点）；有 canvasWidthPx → `x=0.18`（固定画布中心原点，设计值）
   - 左小腿：无 → `y=0.165`；有 → `y=-0.151`（**低于地面**！）
   - 结论：像素坐标是按「无 canvasWidthPx 原点」写的，但刷新后被按「固定原点」解释 → 散架。

### 根因
- 模型脚本开头为了把杆形状切成 `cylinder`，用 DOM 事件改 `#shape` → 触发 `onOptionChange`，
  它重建 `state.options` 时**只保留 mode/shape/size/count/heightMeters/canvasHeightPx，丢掉了 canvasWidthPx**。
- `gms.part` 在 `canvasWidthPx` 缺失时退回「当前笔画 bbox 中心/底」作为原点（且随时累积漂移），
  与服务器端「固定画布中心/底」的生成语义不一致 → 写入的像素坐标对固定原点无效。
- 保存时 work 缺字段不报错；刷新后 `applyWork` 又把缺的字段补成当前画布宽 → 同一批像素被错误解释。

### 修复
`web/index.html` `onOptionChange`（同步 `public/index.html`）：
```js
state.options = {
  mode, shape, size, count, heightMeters,
  canvasHeightPx: drawCanvas.clientHeight || 462,
  canvasWidthPx: drawCanvas.clientWidth || 640   // ← 关键：任何选项变更必须保留固定原点标定
}
```
**同族加固（一次修一组）**：`gms.part` 开头增加标定自愈——`canvasWidthPx/canvasHeightPx` 缺失时先补当前
画布尺寸再写笔画，**不再允许退回漂移 bbox 原点**。同时排查全仓 `state.options =` 赋值点：仅
`onOptionChange`（已修）与 `applyWork`（自带画布宽+回退）两处，`gmsMode` 只改 mode 不重建，无同类遗漏。

### 验证
- 重新运行 `run-gms-model.sh`：`work.json.options` 含 `canvasWidthPx=575`，items 位置全部回到设计值
  （pitch x=0.18、头 y=1.045、球 x=0.27）。
- 刷新主页面：`localStorage` work == 交付 `work.json`（`WORK_EQUAL=true`）；
  用 localStorage work 调 `/api/draw-model` 的 54 项与交付 `items.json` **逐位相等**（`ITEMS_EQUAL=true`）。
- `read_image` 复核：主页面刷新截图 `page-smoke.png`（球员完整）、独立预览截图
  `after-refresh-fixed-demo.png`（不再解散，头/躯干/四肢/球全部连接）。
- 单测 94/94、`npm run build` exit 0、`git diff --check` OK、`delivery_check` PASS。

---

## 三、为什么反复出问题——系统性根因

1. **标定元数据是"隐形毒药"**：`canvasWidthPx/canvasHeightPx` 不是渲染字段，不影响单页面的一次性生成；
   但它是「像素坐标 ↔ 世界坐标」的唯一基准。缺它时前端与服务器各自用不同原点，不报错、只有
   **重新加载消费者**（刷新/独立预览/历史回灌）才暴露。所有写 options 的地方必须整对象重建或显式保留全字段。
2. **gms 坐标 API 存在"静默降级"**：`gms.part` 在 `canvasWidthPx` 缺失时退化为 bbox 原点（漂移），
   失败模式是"看起来能画、保存才坏"。对这类 API 应设防御：缺标定即报错或自愈，不许静默降级。
3. **验证链只覆盖"生产者"页面**：本波首轮验收（状态栏/API/截图）都在同一个未刷新页面；
   「持久化 → 二次加载」链路完全没测。凡作品可保存/回灌，必须把刷新/独立预览作为标准验证步骤。

---

## 四、流程与方法论教训（含用户纠正原话）

### 用户纠偏原话（逐字记录，不转译）
1. `提示，工具/api不足/不够好用的地图，你可以自己补充。底层都是操控几个基础元件来拼装组合`
2. `有 bug，你现在重新看一下你那个页面展示出来的和我刷新之后展示出来的嗯是有区别的。刷新之后呢发生了这个发发生了这个身体解散的这个 bug，你自己看一下图片然后修复这个 bug。`

### 教训
- **工具/API 不够用 → 优先扩展底层，不要绕道**：用户明确"底层都是操控几个基础元件来拼装",
  于是新增 `10009002` 球体走同一笔画管线，头/足球质量显著提升且不破坏原有验证协议。
- **"刷新后的页面"也是交付物**：作品 JSON 持久化后，刷新 / 独立预览 / 历史回灌都是同一工件，
  必须一遍过；用户用"重新看一下图片"提醒了"先看图再动手"，我们随后把对照截图纳入定位证据。
- 排查时**先找"两个页面差异"对应的数据层证据**（work.json vs localStorage options），
  再改代码——本次差分一次锁定根因，没有瞎改。

---

## 五、风险探索与未闭合项

| 风险/未闭合 | 说明 | 状态 |
|---|---|---|
| 命名组件/link 不随 work 持久化 | 刷新后 `gms.verify()` 的 `links=[]`（仅几何 ok）；如要"刷新后仍可 verify"，需把 `state.gmsNamed/gmsLinks` 序列化进 work v4 | 未做，登记 |
| preview-demo 直接依赖 work.options | 这是"安全假设"：只要其他路径不再产出缺字段的 work 就不会再现；已在技能坑清单登记防回归 | 已登记 |
| 其他 options 重建路径 | 已排查：`state.options =` 仅 2 处（onOptionChange 已修、applyWork 自带画布宽+回退）；`gmsMode` 只改 mode 不重建 | 已闭环 |
| 基础元件覆盖面 | 目前 `resourceId` 只放行 `10009002`（球体）；后续加锥/棱柱等只需扩展白名单与预览映射 | 待扩展 |
| **API ↔ UI 一致性**（用户 2026-09-05 提出） | `gms.part('sphere')`/`opts.size`/`lift`/`transform`/命名组件+`link`+`verify` 等 API 能力网页真人操作无入口，真人画不出球体/粗细/变换/受力链 | 已产出修复提示词：`docs/game-engine-knowledge/prompt-2026-09-05-api-ui-consistency.md`，待下轮执行 | 未做 |

---

## 六、产出清单

**修复 / 功能**
- `web/index.html`：`onOptionChange` 保留 `canvasWidthPx`（修复刷新解散）；`gms.part` 标定自愈（防同族遗漏）；`gms.part('sphere')`、`opts.resourceId`、applyWork v3.5 持久化
- `public/index.html`：同步副本
- `src/draw/types.ts` / `src/draw/generate.ts` / `src/web-shared.ts`：球体 `10009002` 基础元件管线
- `tests/draw.test.ts`：球体生成/解析测试（94/94）
- `scripts/draw-soccer-player.js`：足球运动员组件脚本（21 命名组件 + 23 link + verify 硬门禁）

**文档 / 证据**
- `REPORT.md`：交付报告（含 §8 刷新解散修复）
- `docs/game-engine-knowledge/retrospective-2026-09-05-soccer-player-refresh-disassembly.md`：本复盘
- `docs/game-engine-knowledge/prompt-2026-09-05-api-ui-consistency.md`：API↔UI 一致性修复提示词（用户 2026-09-05 提出的下轮任务）
- `delivery/soccer-player/`：work.json / items.json / api-inspect.json / view-*.png / page-smoke.png / after-refresh-fixed-demo.png
- 历史版本：`vmtoke3crhpnh`（v1）、`vmtokolfnrr0r`（v2 修复刷新解散）

**技能（已检查并按需迭代）**
- `model-build-test` SKILL.md：坑清单新增「canvasWidthPx 固定原点」；§8 组件类型补 `sphere`；记录"基础元件拼装 + 工具不足可扩展"方法论教训

**初始文件同步**
- 本项目根目录无 `AGENTS.md` / `CLAUDE.md`（glob 确认），本波无初始文件同步项；该结论已在本复盘登记。

**知识库 / PKC**
- 本项目未发现 PKC 配置；可复用经验以技能更新承载（下次同类任务自动加载），不依赖文档索引。
