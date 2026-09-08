# 人物/角色建模路线图（能力矩阵 · 阶段验收）

> 盘点+门槛；**不改代码**。验证四轴独立：**源码存在 / 自动回归(以 `tests/*.test.ts` 为准) / 浏览器视觉(截图+`read_image`) / 游戏用户验收**。API 契约与外观缺口见 docs（下），**不复述大段**。

## 参考物
- 终稿 `reference/ganyu-3view.png`（足球服 GANYU #10）；四视图 `reference/body-wire-{front,side,quarter,back}.png`（**含衣发鞋，非裸体**）；外观缺口逐项见 `docs/ganyu-appearance-gap-review.md`。
- 像素近似测量 `reference/ganyu-landmarks.json`（uncertaintyPx + pending overlay_review，排除呆毛/角）——**定标前须 overlay 复核**。
- 正交预览：`gmsPreview.setCamera({projection:'orthographic'|'perspective',yaw,pitch,radius})`/`getCamera()`（见 `docs/preview-camera-api.md`）；**reference overlay 用 `orthographic`（不用透视量比例）**；正交截图已验证 `delivery/r0-toes/body-r2-ortho-front.png`（:8787）。
- 人体 `referenceFit` 已回填但 landmark 拟合/衣壳间隙未验证；四肢镜像相位精确(~1e-16，**非实时编辑 GUI**)。

## 能力矩阵（四轴；契约见对应 docs）
| 能力 | 文件 | 源码 | 自动回归(test) | 浏览器视觉 | 游戏验收 | 契约/说明 |
|---|---|---|---|---|---|---|
| profileLoft(环驱动) | scripts/parts/lib/ganyu-lib.js | ✓ | profile-section.test | — | — | body 骨架用 |
| subdivSurface | scripts/parts/lib/ganyu-lib.js | ✓ | cage-sampling.test | — | — | docs/cage-sampling-api.md（**已修几何坍缩**） |
| cageLoft / cageMove / cagePoint | scripts/parts/lib/ganyu-lib.js | ✓ | cage-sampling.test | — | — | docs/cage-sampling-api.md（**已修**角纵插值+颜色 count；**不能代替共享边界挤出**——body 用 profileLoft+extrudePatch） |
| semantic anatomy cage | scripts/parts/lib/ganyu-anatomy-cage.js | ✓ | anatomy-cage.test | pending | — | semantic control graph + wireframe + anatomyStructureReport；preview layer only, production body still requires shared branch topology |
| extrudePatch / extrudeRing / extrudeFace / recoverBoundary | scripts/parts/lib/ganyu-cage-branch.js | ✓ | body-cage.test | — | — | 一体分支 |
| **body-cage 一体(躯干+头+臂+腿)** | scripts/parts/ganyu-body-cage.js | ✓ | body-cage.test + body-checkpoint.test | — | — | **gate ok=true、selfIntersections 0、areaRatio 18.2、570v/1124t、水密一体、镜像 1.19e-16**（证据 `iteration-records/26-r1-shoulder-hip-connection-fix.json`；根因=extrudePatch 逐环局部 frame+radial 角向投影）——但**手掌未恢复**（armRings 止于腕 y0.69，pending）、referenceFit 未拟合、升面/外观未做 |
| asymLoft | scripts/parts/lib/ganyu-asym-loft.js | ✓ | — | — | — | 前后不对称 |
| seamCheck / connectedComponents | scripts/parts/lib/ganyu-seam-check.js | ✓ | seam-check.test | — | — | 一体/断缝 |
| **verify 门禁** | src/mesh/verify.ts | ✓ | verify.test | — | — | selfIntersections；法线=有向边一致性+逐分量有符号体积（凹体不误报）；凹体非缺陷 |
| **characterProportionReport** | scripts/parts/lib/proportion-check.js | ✓ | character-proportion.test | — | — | docs/character-proportion-api.md（独立具名，不覆盖 generic；定标 pending overlay） |
| **preview 相机(正交/透视)** | web/draw/preview.js | ✓ | preview-camera.test | ✓(body-r2-ortho-front) | — | docs/preview-camera-api.md；ortho 用于 reference overlay |
| 画线部件 face/hair/horns/jersey/shorts/gloves/sock/shoe/number | scripts/parts/ganyu-*.js | ✓ | — | 部分(会话 AUDIT) | — | docs/ganyu-appearance-gap-review.md；`rod` 手指不满足一体；**脸皮归头主网格，仅眼睫等外附细节独立** |

> 测试以实际 grep 为准；未命中 test 的项仅**不列**该证据（轴留空），**不写“未测试/无效”**。当前全量 `npm test` 绿（最新 216/216，主线程持续加测递增）。

## 阶段验收（P0–P9）
| 阶段 | 范围 | 验收 |
|---|---|---|
| P0 参考定标 | body-wire→rings；关键点 | 能生成 topOutline+sideProfile/rings；`characterProportionReport` + `ganyu-landmarks.json`，overlay 复核通过后锁阈值 |
| P1 一体骨架 | 躯干+头+臂+腿 | `meshCheck` deg=0/skinny<5%；人体件 `seamCheck onePiece`；**`selfIntersections` pass=0（已修，gate ok）** |
| P2 点编辑 | 控制点 | cage 已修复+测试覆盖；拖点重建无裂缝；面数由细分控制 |
| P2a 语义粗模 cage | 解剖控制点/控制边/线框 | `ganyu-anatomy-cage.js`；肩峰、锁骨、腋窝、上臂根具名；默认 <=300 面；结构报告通过后才允许升面；demo `delivery/anatomy-cage/` |
| P3 升面 | 躯干/四肢 | 同轮廓、面数×5~×10、瘦长不劣化；禁 jitterMesh；subdiv 已修几何坍缩 |
| P4 特征 | 胸/臀/小腿肚/踝 | **共享表面控制点变形**（非附加 polyDomePatch）；保持一体 |
| P5–P8 外观部件 | 脸(皮归头主网格)/发/角/球衣/短裤/手套/袜/鞋/号码 | **细项与缺口见 docs/ganyu-appearance-gap-review.md**；衣发鞋独立件；眼睫等外附；不做整角色一 component |
| P9 验证+导出+游戏 | 全部 | `meshCheck`+`seamCheck(onePiece)`+`verify`(selfIntersections) passed；`export-mesh` 默认门禁(禁 --no-gate)；GIA `root=0.1` 双补偿；10009019 禁直出；网页 1:1 预览(ortho overlay+截图+read_image)→游戏用户验收签字 |

> 比例阈值（头身 6.5–7.0 / 肩:腰 1.35–1.5 / 髋:腰 1.15–1.3 等）与**人体基线身高 1.60m 均为【暂定】**（`ganyu-landmarks.json` scale.status:provisional，非实测），landmarks overlay 复核后更新；**不承诺相似度百分比**（算法未定义）。

## 缺口与原则
- **优先复用**现有；分支相交（肢体自交）**已修**（selfIntersections 0）——**当前缺口= 手掌未恢复（armRings 止于腕 y0.69）/ 升面未做 / 外观未做 / referenceFit 未拟合**，并非“工具齐全”。
- 禁 `jitterMesh` 造细节；禁 `mergeMeshes` 人物四肢；禁 `polyDomePatch` 作人体附加细节；`surface` 不保证水密。
- **一体**=人体四肢/躯干/头/**脸皮**；**分件**=衣/发/鞋/**眼睫等外附细节**（各自贴合；水密需显式闭合）；不做整角色一个 component。

## 参考文档
- `docs/cage-sampling-api.md`（cageLoft/cageMove/cagePoint/subdivSurface：采样契约、颜色、已知限制——不可代替共享边界挤出）
- `docs/preview-camera-api.md`（setCamera/getCamera：projection/yaw/pitch/radius/target/aspect；ortho 用于 overlay；`pitch=π/2` 为平视）
- `docs/character-proportion-api.md`（characterProportionReport：输入/输出/缺失/目标；`referenceFit` 恒 false）
- `docs/ganyu-appearance-gap-review.md`（最终图外观缺口逐项：体/掌指/脸/发角/球衣短裤/手套袜/靴/号码/金饰 + 工具缺口）
- `docs/game-engine-knowledge/retrospective-2026-09-06-ganyu-ankle-gia-export.md`；`docs/blender-skill-study-report.md`
