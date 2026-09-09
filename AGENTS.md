# AGENTS.md — genshin-model-studio 建模智能体规则（2026-09-06 复盘固化）

## 项目领地
甘雨建模（画线/网格 route）+ 本地服务 http://localhost:8787（`scripts/web-server.js`，改 `web/index.html` 需 cache-bust）+ 游戏导出目录 `Beyond_Local_Export`。

## 技能路由
| 场景 | 技能 |
|---|---|
| 画线建模/测试（浏览器 CDP 实操） | `model-build-test` |
| 网格-面片建模链路（轮廓→环→面板化→导出） | `gms-modeling-preflight` → `reference-fit` → `blockout` → `detail` → `verify` → `export` |
| **人物/角色建模（全链路精细解）** | 先 `gms-character-modeling`（关键点表/拓扑环/多角度）再走链路 |
| 浏览器自动化/截图复核 | `browser-harness` |
| 复杂 bug 定位 | `diagnosing-bugs` |
| 一轮任务闭环沉淀 | `task-retrospective`（复用 `dsh-session-history` 检索） |

## 铁律（实测通过，违反必返工）
1. **GIA 根缩放**：真实尺寸 = root × 数据（root 同时乘位置与缩放）。root=0.1 → 空模型 0.1；
   改 root 必须“位置与缩放同乘 1/root”双向补偿（`export-mesh` 默认 `ROOT_SCALE=0.1` 已内置）。
   **两个参数（2026-09-09 用户需求，网页画线导出区 `#drawRootScale`/`#drawOverallScale`）**：
   ① 主模型缩放 S（默认 0.1，字段 `rootScale`）——只改主模型与装饰物的比例，不影响整体尺寸；
   ② 整体缩放率 K（默认 1，字段 `overallScale`）——只改实际主模型缩放、不动装饰物 → 整体尺寸 ×K。
   公式：`rootTransform.scale = S×K`、item `position`/`scale` 均 ÷S、游戏内真实尺寸 = 建模尺寸 ×K。
   实现 `src/cli/gia-common.ts`（`resolveGiaScale`/`makeGiaInput`，CLI `--root-scale`/`--overall-scale`）+
   `src/web-shared.ts` `toGiaInput`（网页 `/api/export` 同语义；两参数都不传时保持历史行为 root=[1,1,1]）。
2. **表面模型用 10009003 平面**，不要 10009001 盒（游戏表现为饼环堆叠）；旋转用
   `rotFromNormal`（网页 part('quad') 同款）；曲面项目 `panelize` 用
   `{ rotationMode:'normal', normalTolerance:0.2 }`（默认 0.999 会把凸包/趾区拆成三角尖刺）。
3. **网页预览 = 游戏 gate**：先网页 1:1 预览（state.items 与 GIA 同源）→ 再 GIA → 再游戏实测；
   用户签字前不宣称完成。进游戏前看 summary 的 `quads/tris` 分布（期望 tris=0 或按设计）。
4. **不规则来自细分，不来自扰动**：顶点/旋转随机扰动必断连（v3 断层教训）；
   用 `adaptiveAngularStops`（曲率驱动、全环共享停靠点）保证曲面连续、每格不同。
5. **先工具后算法**：新形态先补工具原语（polyGrid/polyDomePatch/reliefYTube/dense/faceProps），
   验证后再生算法。
6. **10009019 直出 .gia 不带几何**：正式导出必须走 panelize（contour-model / export-mesh CLI）。
7. **每次小迭代留证据**：`iteration-records/NN-*.json` + `delivery/r0-toes/*.png` + read_image 复核；
   回归立即回退（用户“这是一个 bug”= 回退信号）。
8. **建模顺序仿人类建模师（2026-09-06 用户授法）**：粗骨架（低 segs/sides 切分面，几十面）
   → 少量点/面微调（60–70% 精确，先立框架）→ **算法自动拟合升面**（Catmull-Rom 重采样 +
   dense/adaptiveAngularStops，300→3000 面，相似度 80–90%）→ 最后加生理特征。
   禁止“从高密度网格局部微雕”逆序施工；每次改动=最小单位（点/面），分配交由算法。
9. **细节=关键点+算法连线，禁止“贴小件”（2026-09-06 用户纠偏）**：先算好关键位置（如手指根点在掌沿的参数化位置→自动连接），
   再让算法长成同一连续框架；“柱子”式部件要在**关节处增加控制点**（肘/腕/膝/踝/肌肉点）交给细分出细节；
   另贴小方块/小柱件（尺寸冲突、无框架）判定为**错误**。分支类结构（五指从手掌长出）需要 branch 拓扑，属 cage 工具的下一步。
   **连接=主干挤出/共享顶点，多件拼接=评审不合格（2026-09-06 二轮纠偏）**：颈/肩/髋/指等肢端必须从主干同一网格
   “长”出来（extrudeRing/branch），不允许独立放样后 index 合并；评审时 seamCheck 断缝检测。
   **粗模必须有前后区分**：前视宽剖面（rx）+ 侧视深剖面（ryF/cyF + ryB/cyB）共同驱动截面，
   躯干前后体块 landmark（锁骨/胸骨/肩胛/脊柱沟/骨盆/臀/鞋前）进骨架——面数低不等于没有前后。
10. **设计保真门（2026-09-09 笔记本 v1/v2 审美失败复盘固化）**：**规格数值是实现约束，不是设计目标**。
   建模前必须建真机参考档案 `reference/<产品>/design-reference.md`（尺寸/键盘/接口/底盖/材质 + 官方图 + 来源 URL）
   并写下**设计语言清单**（连续曲率、缝隙均匀、结构隐藏、栅格对齐）；交付前必须做**同角度 A/B 并排比对**
   （渲染图 vs 真机图），逐项打勾才可宣称完成。**门禁全绿 ≠ 像**：`gms.verify`/独立 AABB/独立视觉复核
   只覆盖结构合法性；交付文档里的 `pass` 必须紧邻一行「未覆盖维度：设计保真（无参考图对照）」。
   实测高频设计破绽：方角穿出圆角包络（每角 4.14mm）、板角穿出圆角管（2.14mm）、圆角管平头接缝（0.32mm）、
   轴端与侧壁齐平（Ø4mm 外露）、盖板高出台面（0.6mm）、上盖后缘穿入机身（6.60mm）、键位语义错误（空格键 x=+0.0950）。
   复盘权威文档：`docs/game-engine-knowledge/retrospective-2026-09-09-laptop-macbook-design-fidelity.md`。

## 常用命令
- 构建/测试：`npm run build --silent`、`npm test`。
- 面板化导出：`node dist/src/cli/export-mesh.js <mesh.json> --out-dir <dir> --format gia --force`
- 网页导出落盘：`scripts/web-server.js` `/api/export` 同步写 `GMS_EXPORT_DIR`（默认游戏目录）。
- 新工具文件（并行代理各建各的）：`scripts/parts/lib/ganyu-cage-branch.js`(C)、`ganyu-seam-check.js`/`ganyu-asym-loft.js`(D)，lib 主文件由 A/B 分工追加；
- 角色粗模入口：`scripts/parts/lib/ganyu-anatomy-cage.js` 提供 `createAnatomyControlGraph` / `moveAnatomyControlPoint` / `buildAnatomyCage` / `cageWireframe` / `anatomyStructureReport`；先用语义控制点图与 <=300 面 cage 验证肩峰/锁骨/腋窝/上臂根，再进入共享顶点生产拓扑。
- 相机：提交→等自动取景→`gmsPreview.setCamera({yaw,pitch,radius})`→截图；
  多视图验证台用单 WebGL 渲染器 + 2D 拷贝（>16 上下文会被回收）。

## 历史基线
- 用户最终验收：`ankle-bump-v12.gia`（728 平面/0 三角，root=0.1+双补偿，≈1.0m，灰袜+肉色凸包）。
- 复盘权威文档：`docs/game-engine-knowledge/retrospective-2026-09-06-ganyu-ankle-gia-export.md`。
- 未闭合：游戏“初始尺寸=500×root”公式的格式文档闭合项；趾部算法（下一任务）。
- 工具补缺队列（人物建模反推）：🔧 cageLoft/cageMove/cagePoint（A 实现中）→ 🔧 subdivSurface（B 实现中）→
  🔧 extrudeRing/branch 分支挤出（C：新文件 ganyu-cage-branch.js）→ 🔧 seamCheck 断缝检测 + asymLoft 前后不对称截面
  （D：新文件 ganyu-seam-check.js / ganyu-asym-loft.js）→ live-mirror（镜像联动）→ proportionInspector（多角度比例断言）
  → partTemplate（人体部位参数模板：手/胸/臀/肩）。
