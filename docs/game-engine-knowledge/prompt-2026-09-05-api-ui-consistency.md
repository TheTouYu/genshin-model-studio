# 提示词：修复「gms API ↔ 网页真人操作」不一致（API-UI 一致性）

> 用途：交付给下一个会话 / 子代理直接执行的修复任务提示词。
> 生成日期：2026-09-05（足球运动员模型波次复盘后登记）
> 项目：`/home/h/genshin-model-studio`；加载技能：`model-build-test`（浏览器实操建模 + 验证）。

---

## 提示词正文（复制以下内容）

```text
# 任务：修复 gms 程序化 API 与网页端真人操作的不一致

## 背景
上一轮用画线建模 API（`window.gms.*`）拼了一个足球运动员模型（脚本：
`scripts/draw-soccer-player.js`，已交付）。用户指出：**API 里能做的一部分操作，
网页端真人用户（鼠标/键盘，不写任何 JS）用不出来、画不出来**。目标是把「本波
实际用到的 API 能力」全部补齐为网页可见可操作的功能，保持 API 与 UI 双向一致：
真人能画出的东西 = 脚本 API 能产出的东西；脚本 API 产出的作品，真人也能逐步复现。

## 现状（已审计：API 有、UI 无的清单）
请以 `web/index.html` 为准复核（不要只信本提示词），至少覆盖：

1. **基础元件覆盖 `resourceId`**（球体 10009002）
   - API：`gms.part('sphere', {x,y,z,r,color})` 或 `opts.resourceId=10009002`
   - UI：笔画弹层 `#colorPopover` 只有 渲染/高度/方向/颜色，**没有元件类型选择**，
     真人只能画圆柱/长方体，无法拼球体（头/足球）。
2. **笔画级粗细 `size`**（米，覆盖全局 options.size）
   - API：`opts.size`（如足球环线 0.006 vs 全局 0.03）
   - UI：弹层无 size 输入，真人只能吃全局杆径。
3. **抬升 `lift`**（solid 离地抬升，米）
   - API：`opts.lift` / `gms.props(i,{lift})`
   - UI：弹层的“高度”只映射 `stroke.height`（柱体厚度），没有 lift。
4. **整体变换 `transform`**（z 前后偏移 + 最终欧拉 rotation）
   - API：`opts.transform = {position:[0,0,z], rotation:[α,β,γ]}`（靴子旋转 -8°、
     球贴片面 z=0.088、环线 z 偏移等）
   - UI：没有 z 偏移、没有 rotation 输入。
5. **命名组件 + 受力连接 + 一键总检**（方法论 API）
   - API：`gms.part(..., {name})`、`gms.link(a,b,{support})`、`gms.verify()`、
     `gms.touches/point/floating/collides/parts`
   - UI：没有任何“命名/连接/总检”入口；真人画完只能看“物理冲突”提示，不能像
     脚本一样声明受力链并看到 `{ok, floating, collides}`。

## 目标（本波足球运动员用到的能力，全部要有 UI 入口）
在 `web/index.html` 增加/扩展（保持现有 API 行为不变）：

1. **弹层（colorPopover）增加**：
   - 元件类型/资源 ID 下拉：`默认自动（圆柱/长方体）` / `球体 10009002`。
     选球体：渲染强制/建议 `solid`，轮廓必须为圆（椭圆/矩形给中文提示），
     保存 `stroke.resourceId = 10009002`；预览仍走 10009002 球体几何。
   - 笔画级粗细 `size`（米，>0）：写 `stroke.size`。
   - 抬升 `lift`（米，≥0，仅 solid）：写 `stroke.lift`。
   - 变换块：`z 偏移（米）` + `旋转 α/β/γ（度）` → 写
     `stroke.transform = { position: [0,0,z], rotation: [α,β,γ] }`；
     与现有 `gms.rotate` 副本逻辑兼容，避免双重生效。
2. **新建“组件/连接”面板**（或右侧栏）：
   - 选中笔画 → 命名（复用 `gmsPartRegister` 语义：按轮廓识别 kind
     circle→disc、ellipse→el-disc、rect→plate、line/curve→rod/arc，圆+球体→sphere；
     spec 按画布像素 + 米制标定反推）。
   - 两个命名组件 → 声明连接（`gms.link`，可选 support: a/b），显示 contact/gap。
   - 一键总检按钮 → 显示 `gms.verify()` 结果（links contact 数、floating 清单、
     collides 清单、badLinks 间隙值）。
   - 高级锚点查询（`gms.point/touches`）如有余力同步加入口；至少 link/verify 必须有。
3. **真人可复现性**：不写一行 JS，按照下列动作能拼出与 `scripts/draw-soccer-player.js`
   等价的作品（结构/颜色/尺寸允许以 UI 数值方式一致）：
   ① 矩形 solid → 草皮；② 自由笔椭圆 solid axis=up + rotation → 球鞋；
   ③ 直线 + 粗细/颜色 → 小腿/大腿/手臂；④ 圆 solid → 短裤/躯干/球衣徽/五官；
   ⑤ 圆 → 元件类型“球体” → 头/头发/足球；⑥ 圆（默认杆）+ size=0.006 → 足球环线；
   ⑦ 圆 solid axis=front + z 偏移 → 五边形块；⑧ 命名 + 连接 + 总检。

## 验收标准（可测量）
1. 上述 8 类动作全部可由真人操作完成（浏览器 CDP 只发鼠标/键盘事件，**不调用
   `window.gms.*`**，验证脚本里不许出现 `gms.part/gms.link/…` 命令）。
2. 真人操作产出的 `localStorage gms.draw.work.v1` 与脚本 `scripts/draw-soccer-player.js`
   产出的 `work.json` 的 strokes 参数语义一致（render/height/axis/size/lift/
   transform/resourceId 都能相等/可换算），生成 items 数量与位置可对照。
3. 刷新主页面 + 独立预览 preview-demo.html 均保持组装（不再解散，
   相关坑：`canvasWidthPx` 固定原点必须保留——任何新增 options 重建路径都要带上）。
4. `npm run build --silent` exit 0；`node --test dist/tests/*.test.js` 94/94；
   `web/index.html` 内联 JS `node --check` 全 OK；`public/index.html` 同步哈希一致。
5. 浏览器截图（主页面 + 独立预览 + 至少 iso/front 两视角）用 read_image 逐张复核：
   球员完整、球体贴合、徽章/五官可见；无悬空/穿模/解散。
6. 更新 `/home/h/.agents/skills/model-build-test/SKILL.md`：
   §4 速查表 + §5 坑清单 + §7/§8 命令表注明“UI 等价入口”；
   记录新控件与“真人操作验证清单”（本次新增）。

## 约束
- **不改 API 行为/签名**：`window.gms.*` 现有脚本（风扇/水杯/摩天轮/足球运动员）必须继续可用；
  只允许新增 UI 控件、把 UI 动作映射到既有内部函数（`addStrokeWithOpts`/`gmsPartRegister`/`gmsLink` 等）。
- 作品 JSON 兼容 v3：新增字段必须是可选字段；旧作品载入不报错、缺省不写。
- 不要引入新依赖；不要改 `src/web-shared.ts` 现有校验白名单（如需放行新资源 ID，先讨论）。
- 完成后按主题提交；提交前 `git diff --check`；交付 `REPORT` 附录说明 UI 新增能力与真人操作验证证据。
```

---

## 附：给修复执行者的定位线索（不在提示词内，供主会话参考）
- 弹层代码：`web/index.html` `openPopover` / `colorPopover`（`#popRender/#popHeight/#popAxis/#popCustom`…，
  约 L1245-1340）。
- 笔画写入：`addStrokeWithOpts`（约 L1893）——UI 新控件应走同一入口并回写 `stroke.*`。
- 命名/连接：`gmsPartRegister/gmsLink/gmsVerify`（约 L2316-2560）——已是纯 JS 函数，UI 按钮可直接调用。
- 标定铁律：`canvasWidthPx/canvasHeightPx` 固定原点（2026-09-05 刷新解散坑 #17），
  新增 options 重建路径必须保留。
