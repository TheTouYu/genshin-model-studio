# L4 批改 + S5 任务书（古风甘雨）

> 本文件是自包含任务书：消费方为建模执行 agent，不需要任何会话上下文。
> 本轮 = 老师对 L4（薄片层）交卷的独立复核 + 下一轮 S5 任务书。
> 老师不动代码；所有数字均由老师在盘档上独立复跑取得。

## 0 本轮定位

- 上一轮（S3 任务书）要的只有一件事：**薄片化**（袖片/纱片/发片/剑刃 + 头部块面），预算 ≤1200 面，八门 L4-G1…L4-G8。
- 交卷：commit `b833f22`，`iteration-records/38-hanfu-l4-sheets.json`（816 tris / 410 verts）。
- 老师判定：**八门 7 过 1 部分过**（L4-G7 报告标签未修）；评分 **74/100**（L3 = 69）。
- 一句话：**几何合格了，气质还没到**。薄片把剪影覆盖率补上了，代价是「整体外扩 + 薄片像平板鳍」——这就是导演看到的「多出来的、看着很奇怪的东西」。

## 1 八门逐门判定（老师独立复核）

| 门 | agent 自述 | 老师独立复核（自跑） | 判定 |
|---|---|---|---|
| L4-G1 剪影 IoU | front 0.8559 / side 0.7959 / back 0.8547 | 复读 `delivery/hanfu-l1/iou-overlay-report.json` 同值；**但** `cagePx` 462873 vs `refPx` 410753（面积 **+12.7%**），红（模型独有）59984 px vs 蓝（参考独有）7864 px | 过（余量 +0.006/+0.016/+0.005，靠外扩拿到） |
| L4-G2 逐点 3D | 站点最大偏差 1.944% | 同报告 `checks.stationMaxDeltaPct=1.944, stationPass=true` | 过（口径=站点，与任务书原文一致；该报告另有 `pointDistPass=false`，见 §3.3） |
| L4-G3 回眸目检 | 六视角均判「回眸+持剑+裙体」可辨 | 老师读 `delivery/hanfu-cage/views/smooth-reference-view.png` + `wire-three-quarter.png`：头=块面盒 + 双角尖刺，**头转向与下颌线读不出** | **条件过**（只读出「有角的人形」） |
| L4-G4 拓扑 | openEdges 0 / seamEdges 0 / components 1 | 探针 `l3-mesh-verify-ledger` 复跑终态：`V=410 F=816 E=1224 Euler=2 verifyOk=true` | 过 |
| L4-G5 自交债 | 自交 0 / 瘦三角 1.96% / 面积比 18.9 | 老师 require 仓库 `dist/src/mesh/verify.js` 复跑 `verifyMesh`：watertight/seams/normals/degenerate/skinny/areaRatio/budget/selfIntersections **8 门全 pass**，`failures=0`；瘦三角 16 个 = 1.96% | 过（**薄片零自交是真本事**） |
| L4-G6 面数 | 816 | 同上 `F=816`；`delivery/hanfu-cage/cage.json` `iteration=38, stage="L4-sheets"` | 过 |
| L4-G7 标签一致 | 页面/JSON 全写 L4 与 ≤1200 | 活体页面实读（新标签 → 截图 `delivery/hanfu-l4/live-page-l4.png` → read_image → 关标签）：标题 `S3 古风甘雨语义控制图粗模 L4（袖2/纱3/发4/刃1 · ≤1200 面）`、面板 `面数 816 tris · 预算 ≤1200: PASS / seamCheck: 0缝/0断 / gate: PASS` ✓；**但** `g1-3d-report.json` 仍写 `iteration:37`、`stage:"L3-G1-per-point-3d"`、`cage-mesh.json 556 triangles` | **部分过**（页面半修好，报告半未修） |
| L4-G8 证据链 | 记录 38 + 六视角 + 叠图 + 偏差 + 绝对路径断言 | 记录 38（484 行）齐；六视角 6 张各有结论；叠图 3 张；偏差 D1–D6 共 6 条 | 过（但见 §3.2 两处自述数字不符） |

## 2 老师独立证据（全部自跑，可复现）

- 探针 `l3-mesh-verify-ledger`（读终态 `delivery/hanfu-cage/cage-mesh.json`）原文：
  `V=410 F=816 E=1224 Euler=2 verifyOk=true selfPairs=0 skinnyTri=16`
  `watertight=pass seams=pass normals=pass degenerate=pass skinny=pass areaRatio=pass budget=pass selfIntersections=pass`
  `failures=0`
  `declared={"faceCount":816,"vertexCount":410,"iteration":38,"stage":"L4-sheets"}`
- 活体页面（browser-harness 连 CDP，新开标签实读后关闭）：标题/面板见 §1 的 L4-G7 行。
- IoU 归因口径（源码级）：`scripts/render-hanfu-iou.py:32-33` 定义 `bluePx = ref & ~cage`（参考独有）、`redPx = cage & ~ref`（模型独有）；`scripts/check-hanfu-g1-3d.py:91` 用 `dr.polygon(pts, fill=1)`（**无描边、无膨胀**）→ +12.7% 的面积差是真实剪影差，不是光栅化伪影。
- 逐点最差（同报告）：back `corset_bottom_center` 0.4201m、front `waist_belt_center` 0.314m、side `hair_tail_tip` 0.1883m（含义见 §3.3）。

## 3 账目瑕疵（不推翻结论，但必须记账）

1. **报告标签硬编码**：`scripts/check-hanfu-g1-3d.py:7`（注释「556 三角」）、`:215`（`'stage': 'L3-G1-per-point-3d'`）、`:219`（`'cageSilhouette': 'cage-mesh.json 556 triangles, PIL polygon fill'`）。本轮报告在 22:37 被重算（IoU 数值=新 0.8559），但标签仍是 L3/556 —— **这正是 L4-G7 要治的病，本轮没治完**。
2. **记录 38 自述与盘档不符两处**：`gates` 里 L4-G4 写「9 片」，`controlGraph.sheets` 实为 `sleeve2 + veil3 + hair4 + blade1 = 10 片`（另 `jawRing1/faceBlock4/eyeSocket2` 属头部块面）；`gates` 里 L4-G8 写「偏差 5 条」，`deviations` 实为 6 条（D1–D6）。
3. **`pointDistPass=false` 不是失分项、也不是证据**：`maxPointDistM=0.4201` 是「landmark 到剪影边缘的距离」，内部点（腰/胸中线）天然很远 → 该指标不能当「逐点贴合」的证明。S5 请把它换成「landmark → 模型表面最近距离」。
4. **合同未闭完就交卷**：`/home/h/.dsh/graded-state/session-2ae811d4-9e22-4e6e-aa26-d354e8b9004b.closedloop.json` 第 2 组「L4 门禁复算（自交/IoU/逐点/拓扑）」`settled=null`，其余 3 组已落账 → 「八门全绿」是自述，机械门尚未走完。

## 4 关键工程发现（老师复核过——本轮最有价值的产出）

**D4：薄片厚度下限 = 11.5mm，任务书写的 4mm 在数学上不可能过门。**

- 依据 `src/mesh/verify.ts:23-24`：瘦三角 `minE/maxE < 0.08`（占比 ≤5%）；面积比 `p95/p5 ≤ 20`。
- 薄片侧面三角：`minE/maxE ≈ t/L` → 需 `L ≤ 12.5t`；面积 `p5 ≈ t·L/2` → 需 `t·L ≥ 1.66e-3`。
- 联立：`t=4mm` 要求 `L ≤ 50mm` **且** `L ≥ 415mm` —— 自相矛盾；解得 `t ≥ 0.0115m`。agent 取 `t=0.012m` + 分段 ≤0.2m，两门均过（1.96% / 18.9）。
- **结论：厚度不是「布感」的瓶颈，形状才是。** 12mm 在 1.6m 身高上是 0.75%（渲染里约 4px）；观感差来自「零曲率 + 零锥化 + 无层叠」。
- 同源发现 D1：为消自交，袖片从「流场帧」改成「插座帧平移面」= **广义棱柱（零扭转）**。自交 3→0 的代价是薄片变成平板。**S5 的题目就是：在 t≥11.5mm 的硬约束下，把平板做成布。**

## 5 评分（老师口径）

| 维度 | 权重 | L3 | L4 | 说明 |
|---|---|---|---|---|
| 动势/姿态 | 40 | 22 | 25 | 站姿/回眸角沿用，薄片给了流向但不成布 |
| 剪影/比例 | 25 | 15 | 18 | IoU 0.76→0.856（阶段门过），代价 = 整体外扩 +12.7% |
| 前后体块 | 15 | 11 | 12 | 站点 1.944% 未回退 |
| 拓扑/工程 | 10 | 9 | 10 | 816 面零自交、Euler=2、8 门全 pass |
| 证据/账目 | 10 | 7 | 9 | 记录齐，但报告标签硬编码 + 两处自述数字不符 |
| **合计** | 100 | **69** | **74** | |

## 6 S5 任务书（题目：形不是面 —— 收外扩 + 薄片成型）

### 6.1 目标与预算

- **本轮不加面换形**：预算 **≤1500 面**（当前 816），仍手控点/面；算法升面（1500→3000）留到 S6。
- 四件事，按收益排序：① 剪影收口 ② 薄片成型 ③ 角形复位 ④ **分色辨识**（导演本轮追加，见 §6.8）。
- 分色 ≠ 材质分带：本轮只做「按部件上色、让每片一眼可辨认」；透明感/金饰/蓝白渐变等材质分带仍留 S6。

### 6.2 ① 剪影收口（治「整体外扩」）

- 判据**不看红/蓝像素绝对值**（参考 mask 边缘有阈值偏差），改看**面积比**：`cagePx/refPx ∈ [0.97, 1.06]`
  （当前 front 462873/410753 = **1.127**、back 461917/409647 = **1.128**、side 283205/238806 = **1.186**）。
- 逐视图 IoU：front/back ≥0.88、side ≥0.82（当前 0.8559 / 0.8547 / 0.7959）。
- 收口顺序按超量：**side 最超（+18.6%）** → 先收侧视薄片外缘（发片/纱片外摆）→ 再收正/背的袖口与角尖。

### 6.3 ② 薄片成型（把平板做成布）

每片薄片必须同时满足三条，缺一不算成型：

1. **≥3 个沿流向的环（可弯）**：截面中心线沿流向走弧线，**不是平行平移**；t 仍固定 12mm，靠中心线弯曲做垂坠。
2. **宽度锥化**：根宽 : 尖宽 ≥ **1.6 : 1**；外缘下垂角照原图（袖口 30–45°、纱边 60–75°、发尾 80–90°）。
3. **层叠可见**：纱片 ≥2 层可见遮挡（内层被外层半遮 ≥15% 投影面积），层间偏移沿用 **0.250m / 0.160m**。

### 6.4 ③ 角形复位

- 参考角 = **短粗 + 向外后弯**；当前模型角 = 长直尖刺，是全身最「不像」的部位。
- 要求：角链 ≥3 控制点（根/中/尖），弯角按原图实测（L1 表已有 `horn_tip` 像素，切线夹角自算）；角长 ≤ 参考实测 +10%。

### 6.5 门（L5-G1 … L5-G8）

| 门 | 判据 | 核对方式 |
|---|---|---|
| L5-G1 剪影收口 | 三视图 `cagePx/refPx ∈ [0.97,1.06]`；IoU front/back ≥0.88、side ≥0.82；叠图必交 | 脚本读数 + 叠图 |
| L5-G2 薄片成型 | 每片 ≥3 环 + 锥化 ≥1.6 + 层叠遮挡 ≥15%；read_image 判「像布不像板」 | 报告 + 目检 |
| L5-G3 角形 | 角链 ≥3 点、弯角按实测、角长 ≤ 实测+10%；reference-view 目检 | 报告 + 目检 |
| L5-G4 拓扑 | openEdges=0 / seamEdges=0 / components=1 / Euler=2；薄片共享顶点 | 报告 + 独立复算 |
| L5-G5 自交债 | 自交=0、瘦三角 ≤5%、面积比 ≤20（`verifyMesh` 原文） | verifyMesh |
| L5-G6 面数 | ≤1500 | 统计 |
| L5-G7 标签一致 | **修硬编码** `scripts/check-hanfu-g1-3d.py:7,215,219` → 报告 iteration/stage/三角形数 = 终态；页面标题/面板 = 终态 | 报告对账 + 页面实读 |
| L5-G8 证据链 | `iteration-records/39-*.json` + 六视角（每张有结论）+ 叠图 + 偏差清单 + 合同断言 cwd 无关；**合同各组全部落账后才交卷** | 盘档 |
| L5-G9 分色辨识 | `web/draw/hanfu-cage.json` 的 `items[0].colors` **去重色 ≥6**；页面图例 ≥6 类且能切回单色；分色图 ≥4 视角，每张 read_image 能指名「哪块是什么」 | 页面实读 + 分色图 |

### 6.6 交卷格式

1. 逐门一行：门号 / 实测数字 / 判据 / **盘档引文**。
2. 六视角截图，每张一句 read_image 结论。
3. IoU 三视图叠图 + `cagePx/refPx` 三行 + 逐项归因。
4. 偏差清单（`id/item/detail/impact`）。
5. 更新 `delivery/hanfu-cage/cage-mesh.json` + `delivery/hanfu-cage/cage.json`。

### 6.7 禁止项

- **禁靠整体放大提 IoU**（L5-G1 的面积比区间就是这道闸）。
- 禁超 1500 面。
- 禁改门禁阈值（要改走 `measure_propose` 人审）。
- 禁贴小件；**未过 L5-G5 不交卷**。
- 禁「上一种色充数」（分色去重必须 ≥6，见 L5-G9）。

### 6.8 ④ 分色辨识（导演追加，本轮必须完成）

- **现状实测（老师盘档）**：`web/draw/preview.js:180-203` 已支持 `item.colors` 逐顶点色（`geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))`），但 `web/draw/hanfu-cage.json` 的 `items[0].colors` 共 2448 项**全部是 `#c9c9c9`**（去重 = 1）→ 结论：**有颜色通道、没有颜色**。这一步不需要新能力，只需要上色。
- **要求**：
  1. `delivery/hanfu-cage/cage-mesh.json` 增 `colors[]`（按顶点索引对齐，长度 ≥ `vertexCount`），同一部件同色；顶点分组直接取 `.scratch/l4-build-report.json` 已有的 `parts[]` 区间（25 件）。
  2. 生成器把该 `colors` 透传进 `web/draw/hanfu-cage.json` 的 `items[0].colors`（**不得只改页面**）。
  3. 页面加「分色 / 单色」切换 + 图例（≥6 类），保留既有「框线/平滑」与「前/侧/顶/背/3-4」按钮。
  4. 建议色板（可按可读性微调，但**同类必须同色、异类必须异色**）：
     主干 `#c9c9c9` / 袖片 `#7fb3e8` / 纱片 `#9fd6c0` / 发片 `#b9a7e0` / 剑刃 `#e8d27f` / 角 `#8a8f99` / 饰件（宝石+挂带）`#e87f9f` / 面部块面 `#f0d9c0`。
  5. 证据：分色 **前/侧/背/3-4** 四视角截图，每张一句 read_image 结论，结论**必须点名部件**（如「蓝=袖片、绿=纱片、紫=发片」），不得只写「有颜色」。
- **不算通过**：只给整模型换一种色（去重仍 = 1）、只改页面不落盘、图例与实际上色不一致。

## 7 给导演的三行摘要

1. **L4 = 工程赢、气质仍平**：816 面零自交 / Euler=2 / verifyMesh 8 门全 pass（老师独立复跑），IoU 0.856/0.796/0.855 过阶段门；评分 **74**（L3 = 69）。
2. **代价**：模型剪影比参考 **大 12.7%**（红 60k vs 蓝 7.9k px）——从「填不满」翻转成「撑太开」；薄片是平板鳍（零曲率 + 零锥化），这就是「看着很奇怪」的来源。
3. **S5 做四件事**：剪影收口（面积比 1.127→≤1.06）、薄片成型（≥3 环 + 锥化 + 层叠）、角形复位、**分色辨识**（导演追加：`items[0].colors` 去重从 1 → ≥6，页面加图例）；预算 ≤1500 面；报告硬编码标签必须修（L5-G7）。
