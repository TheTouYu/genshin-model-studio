# 古风甘雨 · 下一步迭代执行提示词（L1 → L2）

> 本文件是自包含任务书：消费方为建模执行 agent，**不需要任何会话上下文**。
> 本轮只做两件事：L1 关键点表（测量）→ L2 ≤300 面语义控制图粗模。不追求细节、不升面、不做场景与材质。

---

## 0. 任务边界与总原则

**目标**：把古风甘雨从"零件拼接式粗模"推进到"语义控制图粗模"。

**本轮不做**：细节雕刻、算法升面（300→3000）、场景、材质色带、正式导出。

**五条总原则**：
1. 先量后建——所有比例来自 L1 实测数字，禁止凭印象。
2. 动势优先——姿态真值来自原图（回眸、反弓、持剑臂、裙流向），禁止建成 A-pose 站桩。
3. 前后体块——rx + ryF/cyF + ryB/cyB 必须编码，禁止平板躯干。
4. 连接=共享顶点/主干挤出——禁止独立放样后拼接（贴小件）。
5. 每步留证——iteration-records/36-*.json + 五视角截图 + read_image 复核。

---

## 1. 输入资产（权限从高到低；冲突时高权限胜出）

reference/hanfu/甘雨.png —— **特征真值**：动势、角形、裙摆层叠与流向、肩饰、眼色。
reference/hanfu/古风甘雨三视图.png —— **测量真值**：体量与比例。实测三面板全高 1168/1158/1166 px，spread 0.86%；图像 2184×1230，面板 x 区间 [144,766] / [982,1316] / [1438,2046]。
reference/hanfu/古风甘雨三视图-线框图.png —— **结构提示**：环线位置、体块分组、密度策略。实测 908/902/908 px，spread 0.67%，三面板基线 botFrac 0.978；图像 1661×957，面板 x 区间 [110,584] / [738,1020] / [1112,1586]。
reference/hanfu/甘雨-白膜线框图.png —— **动势体块提示**：只取体块切分与动势分组；其均匀网纹不采纳。

**原图优先清单**（提示图不得覆盖）：
- 角形：粗、向外后弯 —— 白模为外卷上翘，不采纳。
- 裙摆：层叠飘带 + 单向狂流 —— 白模为对称 A 字裙，只取其体积包络。
- 肩饰：宝石挂带 —— 白模的羽片不采纳。
- 眼色：红粉调 —— 白模紫蓝不采纳。
- 正面设计：三视图正面系生成推测，一律标低置信度。

---

## 2. L1 任务：关键点表 + 动势表

**输出**：`reference/ganyu-hanfu-landmarks.json`（沿用 schema v1）

**字段**：schemaVersion / reference / imageSize / method / status / coordinateConvention / scale{heightMeters, topPixel, bottomPixel, excludes:"horns and ahoge"} / front|side|back{centerX, landmarks:[{name, pixel:[x,y], uncertaintyPx}]} / pose{...}

**每视图 ≥20 点**：
- 正视：hair_crown、chin、neck_base、shoulder_L/R、chest_center（低置信）、waist_L/R、pelvis_L/R、skirt_hem_L/C/R、wrist_L/R、horn_root_L/R、horn_tip_L/R
- 侧视：hair_crown、chin、C7、spine_mid、lumbar、abdomen_max、glute_max、skirt_hem_front/back、horn_root/mid/tip、wrist
- 背视：hair_crown、chin、shoulder_L/R、backless_top、back_waist_ornament、tassel_tip_L/R、spine_line×3、waist_L/R、pelvis_L/R、skirt_hem_L/C/R

**低置信规则**：正面服饰点 uncertaintyPx 取实测值 ×2，并在条目内加 `"confidence":"low"`。

**动势表（来源=原图，逐项标实测像素或角度）**：head_yaw_over_shoulder、spine_arc_direction + amplitude、sword_arm_shoulder_angle、sword_arm_elbow_angle、weight_leg、skirt_flow_direction、hair_flow_direction。

**存档测量元数据**：上述三视图与白模线框的图幅、面板区间、全高、spread、基线，供复算。

---

## 3. L2 任务：控制图粗模 ≤300 面

**模块消费方式（实测事实，勿猜）**：`scripts/parts/lib/ganyu-anatomy-cage.js` 是 IIFE 挂载到 `globalThis`（本项目 package.json 为 `"type":"module"`，故其 `module.exports` 分支不生效，`require()` 得到 **0 个导出**）。

正确用法：
```
await import('file:///绝对路径/scripts/parts/lib/ganyu-anatomy-cage.js');
// 然后取全局名：
globalThis.createAnatomyControlGraph / moveAnatomyControlPoint / anatomyControlPoint /
buildAnatomyCage / cageWireframe / anatomyStructureReport
```
动手前先用 node 探针确认这些全局名存在；导入失败不要改库文件。

**步骤**：
1. 控制图：`createAnatomyControlGraph` → 先立肩峰/锁骨/腋窝/上臂根/髋根。
2. 按 pose 表摆点：`moveAnatomyControlPoint`（脊柱 C 弧、回眸、持剑臂、承重腿）。
3. 建 cage：`buildAnatomyCage`，角色+衣物 ≤300 面。
4. 前后剖面：用 `scripts/parts/lib/ganyu-asym-loft.js` 的 ryF/cyF vs ryB/cyB 驱动躯干。
5. 连接：用 `scripts/parts/lib/ganyu-cage-branch.js` 的 extrudeRing/branch —— 裙从腰环长出、臂从肩环挤出。
6. 采纳清单：对两张白模线框图各列出采纳项（环线位置 / 分组边界 / 密度策略）及在模型中的落地位置；禁止像素描摹。
7. 自检：`anatomyStructureReport`（断件=0）+ `cageWireframe` 五视角截图（正/侧/背/3-4/原图同机位）。

---

## 4. 验收门（五条，逐条给核对方式）

G1 — landmark 误差 <2% 身高。核对：三视图叠图实测（uv+pillow 量像素，报告数字）。
G2 — 五视角剪影可辨认为"回眸的甘雨"。核对：截图 + read_image 人工复核一句话结论。
G3 — anatomyStructureReport 断件=0，且连接为共享顶点。核对：报告输出原文。
G4 — ≤300 面，且躯干侧轮廓前后不对称（ryF ≠ ryB）。核对：面数统计 + 剖面数值。
G5 — 证据链齐全。核对：iteration-records/36-hanfu-cage-rebuild.json + 五视角截图 + read_image 复核结论。

---

## 5. 交卷格式

1. `iteration-records/36-hanfu-cage-rebuild.json`，字段：iteration / stage / inputs（四条素材路径）/ landmarks{count, lowConfidence} / pose / controlGraph{points, faces} / seam / anatomyReport / verify / gate{ok, checks} / visualAcceptance:"pending"。
2. 五视角截图目录，每张附 read_image 复核一句话。
3. 采纳清单（两张提示图各一份）。
4. 未达标项与回退记录。

---

## 6. 失败处理

- 任一门不过：**先修结构**（控制点 / 剖面 / 连接），禁止加细节或升面。
- 用户说"这是一个 bug"= 回退信号，立即回退上一版并留证。
- 面数超预算：先砍裙摆分段与发块分段，不砍躯干结构。
- 模块导入失败：先用 node 探针确认全局名与 ESM 形态，不要改库文件。
- 比例对不上：回 L1 重测关键点，不要用"看起来差不多"过关。
