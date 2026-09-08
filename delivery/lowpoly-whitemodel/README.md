# 低面数完整白模 —— 人物 + 手持武器 + 衣物 + 道具 + 场景

## 预览入口
- 完整布景（框线/平滑可切换）：http://localhost:8787/draw/lowpoly-viewer.html
- 仅人物聚焦：http://localhost:8787/draw/lowpoly-viewer.html?focus=character
- 仅场景：http://localhost:8787/draw/lowpoly-viewer.html?focus=scene

网页由 `web/draw/lowpoly-viewer.html` + `web/draw/lowpoly-model.json` + `web/draw/preview.js` 提供；
同一套 10009019 网格几何，`setWireframe(true/false)` 切换框线/平滑，五视角按钮（前/侧/顶/后/等距）。

## 面数摘要（人物 ≤200 quads）
- 人物：**196 quads · 4 tris 单位（合计 396 tris）** ≤ 200 ✓
- 场景/道具：848 quads · 0 tris 单位（不占人物预算）
- 人物面板化：`delivery/lowpoly-whitemodel/gate/lowpoly-ganyu-whitemodel-character.summary.json`

## Gate 状态
- 人物 `verifyMeshExport`：**PASS**（watertight/seams/normals/degenerate/skinny/areaRatio/selfIntersections 全绿，160 units，qa ok）
- 场景 `verifyMeshExport`：**PASS**（848 units，selfIntersections 0，qa ok）
- 人体主网格 `seamCheck`：onePiece=true / watertight=true / openEdges=0 / nonManifold=0 / seamEdges=0
- 语义控制点核验：`anatomyStructureReport` pass（肩峰/锁骨/腋窝/上臂根/髋/膝/踝 进骨架）
- 导出产物：`delivery/lowpoly-whitemodel/gate/lowpoly-ganyu-whitemodel-character.{gia,gil,structure.json,summary.json}`
  与 `delivery/lowpoly-whitemodel/gate/lowpoly-ganyu-whitemodel-scene.{gia,gil,structure.json,summary.json}`（root=0.1 双补偿，走 panelize 出口）

## 截图（框线/平滑各一套 + 人物聚焦一套）
- 完整布景五视角：`delivery/lowpoly-whitemodel/views/{wire,smooth}-{front,side,top,back,iso}.png`
- 人物聚焦五视角：`delivery/lowpoly-whitemodel/views/char-{wire,smooth}-{front,side,top,back,iso}.png`
- 复核：read_image 已查看（wire-iso、smooth-iso、smooth-front、char-smooth-*、char-wire-iso 等）。

## 参考图说明
参考图以会话内附件为准（sha256:5249385b…, 1066×600）。本次无法从 DSH GUI DOM 提取像素副本
（img 标签数为 0），建模按参考图内容与构图进行；如需像素级对照，可把图存为
`reference/user-upload-5249385.png` 后重跑视觉比对。
