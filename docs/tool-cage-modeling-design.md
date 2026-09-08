# 控制笼建模工具设计（control-cage modeling）

> 日期：2026-09-06 ｜ 目的：补齐“人类建模师式”点驱动编辑——加一颗控制点/拖动一颗点，周边曲面自动重构，
> 剩余的面分配交给算法（与 AGENTS.md 铁律 8 方法论对齐）。
> 现状差距（用户点名）：现有 `profileLoft` 是“环驱动”（指定环→放样），**不能点选顶点拖动**。

## 1. 目标（一句话）

给定一个粗控制笼（少量控制点环），编辑任意控制点后，算法**自动重建光滑连续曲面网格**——
控制点数量与输出面数解耦（比如 5环×8控制点 → 只需改 dense/angularStops 就能输出 200~3000 面），
全程无手工逐面。

## 2. 数据模型

```
ctrlRings: [ [ 环0: [ (x,y,z), ...(N点) ], 环1: [...], ... ] ]
```
- 每环等点数 N（首点与末点闭合沿用周期插值；首环=起点、末环=终点）。
- 控制点即“关键点”（关节/宽窄/鼓包/凹陷），像人类的框格顶点。
- 轴语义：**竖直件**按 opts.up=[0,0,1]（环平面 = x∈宽, z∈深）；与 profileLoft 新增的 opts.up 一致。

## 3. 曲面生成（算法部分，全部确定性、无随机）

- **u 向（沿环顺序）**：每环间用 Catmull-Rom（周期封闭时最后一环连回首环），环采样数由 `dense[]`/`segs` 决定；
- **θ 向（环内）**：控制点到采样点用周期 Catmull-Rom 或类 B 样条平滑；采样列数由 `angularStops`/`colStops` 决定；
- 输出数据结构与 `profileLoft` 一致：`{vertices, faces, colors, props}`（dataOnly），可直接 `meshCheck`、
  可被 `panelize` 消费、可 `gms.part('mesh')` 提交网页预览。

## 4. API 草案（ganyu-lib.js 新增）

```js
function cageLoft(ctrlRings, opts) // opts: {up, segs, sides, dense, angularStops, colorFn, faceProps, cap, dataOnly}
function cageMove(cage, ringIdx, ptIdx, delta /*或绝对 pos*/) // 更新控制点 → 重算网格（顶点顺序稳定）
function cagePoint(cage, ringIdx, ptIdx) // 取控制点（页面上可高亮/选择）
```
- `cageLoft` 返回 `{mesh, ctrl: ctrlRings, ...}`（mesh 含顶点/面/颜色；ctrl 为控制点引用）。
- 编辑节奏：`cageMove` 增量重算 → 直接 `gms.part('mesh', {mesh})` 更新预览（等待自动取景后设相机再截图）。

## 5. 验收标准（给实现/给核验者的 check 清单）

1. **点驱动**：加一个控制点（环内增加）或拖动现有点，mesh 自动重建，周边面跟随（可观察）。
2. **连续无断裂**：任意拖动后曲面连续——无裂缝/断层/自交；`meshCheck` 判据 deg=0、skinnyPct<3、areaRatio<20。
3. **面数解耦**：同一控制笼，`segs/sides`(或 dense/angularStops) 改变 → 面数显著变化，轮廓一致。
4. **确定性**：相同控制笼+相同 opts → 相同字节/顶点（无随机）。
5. **与现有件可合并**：cage 输出与 profileLoft 输出直接 merge（顶点偏移+面索引偏移，首版沿用手写 merge 或提供 `mergeMeshes`）。
6. **页面交互演示**：浏览器中拖一个控制点 → 预览实时更新（browser-harness 注入 + gms.part 流程）。
7. **回归**：profileLoft / js 现有工具行为不变（跑既有 foot-sock 摘要对比 meshCheck 参数）。

## 6. 已知坑（必须避开，来自 AGENTS.md 铁律 1-9）

- 轴互换：竖直件必须 `up=[0,0,1]`（rx=宽、ry=深）；否则躯干/脚错轴（2026-09-06 实证）。
- 连续性：禁止顶点/旋转随机扰动（v3 断层教训）；“不规则”只来自细分（angularStops/dense）。
- 页面预览：提交后自动 fitCamera 会覆盖手动相机 → sleep 后 setCamera 再截图。
- WebGL：多画布验证台用单渲染器+2D 拷贝。
- `mesh` part 持久化已修（applyWork v3.6 保留 mesh/material/10009019）。
- 正式 GIA 导出必须走 `export-mesh`（panelize：rotationMode:'normal'、normalTolerance:0.2、ROOT 双补偿）。

## 7. 验证工具与产物

- 本仓验证：`node --check scripts/parts/lib/ganyu-lib.js`；小节点脚本 eval lib → `cageLoft/meshCheck` 打印 check；
- 浏览器验证：`browser-harness`（read lib → 注入 → 构建 cage → part('mesh') → sleep → setCamera → capture → read_image）；
- 产物：`ganyu-lib.js` 新增 3 函数 + `scripts/parts/tool-cage-demo.js`（可复现演示：粗笼→拖点→实时网格）+ 三视角截图
  （`delivery/` 下）+ 本设计文档的“实现记录”小节更新 + AGENTS.md 工具表更新。

## 8. subdivSurface 实现记录（subagent B）

- 签名：`subdivSurface(mesh, levels, opts)`；输入输出均为 `{vertices, faces, colors}`，每级三角面 1→4，颜色按父三角继承。
- 顶点顺序：每轮先按 faces 首次遇边顺序写入边点，再写入旧顶点；边点共享且无随机扰动，保证确定性。
- 边点规则：光滑内部边使用两端点与两侧对角点均值，边界边使用端点均值；`creases` 支持 edgeKey 映射或函数，0 光滑、1 保持端点中点锐边。



## Semantic Anatomy Cage (2026-09)

The semantic cage is the low-effort authoring layer for character blockout. It is deliberately separate from the final one-piece body mesh.

```js
const graph = createAnatomyControlGraph();
moveAnatomyControlPoint(graph, 'acromionL', [-0.01, 0, 0]);
const cage = buildAnatomyCage(graph, { sides: 6, targetFaces: 300 });
const wire = cageWireframe(cage);
const structure = anatomyStructureReport(graph);
```

The graph stores named landmarks including `clavicle`, `acromion`, `axillaFront`, `axillaBack`, and `upperArmRoot`. These names do not establish correct shoulder geometry. The current prototype concatenates five capped tubes, omits the head and palms, and is not a shared-topology body. The six-side structural preset has 264 triangles; the default eight-side preset exceeds 300. `targetFaces` reports a budget result rather than enforcing it. `cageWireframe` returns metadata, not a rendered overlay. `anatomyStructureReport` checks landmark relationships, not surface connectivity, self-intersection, or reference fit. The experimental landmark preset is not a validated complete low-point blockout.

This layer is not a substitute for `extrudePatch`, `extrudeRing`, `seamCheck(onePiece)`, or `verifyMeshExport`. It describes and previews the intended structure; the production body must still be generated from shared-topology branches. Elevation is a later operation and must preserve the graph as provenance rather than hiding a bad cage under more triangles.

## 9. cageLoft 实现记录

- 2026-09-06：新增 `cageLoft(ctrlRings, opts)`、`cageMove(cage, ringIdx, ptIdx, deltaOrPos)`、`cagePoint(cage, ringIdx, ptIdx)` 与 `mergeMeshes(parts)`。
- 算法：环间与环内均使用确定性 Catmull-Rom，`segs`/`dense` 与 `sides`/`angularStops` 独立控制输出密度，顶点顺序稳定；`up=[0,0,1]` 将控制坐标映射为世界 `[x,z,y]`，保持 rx 为 X 宽度、ry 为 Z 深度。
- Node 自验：粗笼 `faces=32, deg=0, skinnyPct=0, areaRatio=2.1`；三次移动后分别 `2.1/2.1/2.3`；高密度 `8×16` 为 `256` faces。竖直 bounds 为 `{x:0.44,y:1.6,z:0.286}`，移动后轴向保持。
- 浏览器截图目标：`delivery/cage-tool/coarse.png`、`delivery/cage-tool/moved.png`；本次浏览器注入表达式语法失败，截图待父代理复核。
- 开口语义：边界不填补；边界段会随 1→4 细分从 16 增至 64，但边界环仍保持开放。
- 数字证据：粗柱 42 顶点/80 面；L1=320、L2=1280、L3=5120，分别等于 `80×4^L`；meshCheck 分别为 `deg=0, skinnyPct=0, areaRatio=2.4`、`deg=0, skinnyPct=0, areaRatio=2.5`、`deg=0, skinnyPct=0, areaRatio=2.8`。
- 褶皱证据：同一输入全网格最大相邻面法线夹角 smooth=111.933°、crease=1 sharp=90.618°；该数字来自 `scripts/parts/tool-subdiv-demo.js`，用于回归观测锐边差异。
- 截图证据预留：`delivery/subdiv-tool/coarse.png`、`delivery/subdiv-tool/smooth.png`（需 browser-harness 运行后补齐）。
