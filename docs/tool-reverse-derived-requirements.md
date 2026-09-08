# 工具反推需求（2026-09-06，用户“从问题反推设计”产出）

> 来源：人物建模对照参考图发现的系统缺口（关节拼接、前后区分、比例）；不急着修代码，先记录设计。
> 状态：C/D 代理已派发（各自新文件），A/B 完成后对接。

## R1 一体连接（branch）
- 需求：`extrudeRing`（从主干控制环挤出肢干/颈/指，同顶点分叉）+ 与 cageLoft 对齐的 branch 语义。
- 验收：挤出的肩/颈与躯干**共享边界顶点**（seamCheck 0 断缝）；meshCheck 健康；浏览器 before/after。
- 归属：C（scripts/parts/lib/ganyu-cage-branch.js，独立新文件）。

## R2 前后不对称截面（asym loft）
- 需求：截面支持 `{rx, ryF, cyF, ryB, cyB}`（前/后独立半径与前后偏移）；胸/背/臀 landmark 可表达。
- 验收：胸前凸/背平、臀后凸的截面渲染前后可辨；与 profileLoft 输出兼容（同 {vertices,faces,colors}）。
- 备注：实现为独立新文件（ganyu-asym-loft.js），不改 profileLoft（避免与 A/B 冲突）；后续可回灌进 lib。

## R3 断缝/连续性检测（seamCheck）
- 需求：给定 {vertices,faces}，检测“拼接缝”：①边界边（非 watertight）；②重合坐标但不同索引的边（merge 型断缝）。
- 验收：对“独立放样后 merge”的人体骨架报断缝数；对 extrudeRing 分支件报 0。
- 归属：D（scripts/parts/lib/ganyu-seam-check.js）。

## R4 多角度比例断言（proportionInspector）
- 需求：按部位 bbox/轮廓自动算 掌:指、掌宽:深、肩:腰、前后深度比等，与模板比，超差标红。
- 归属：D 的 demo 中最小实现（seam-check.js 内或独立函数）；完整版排队。

## R5 部件参数模板（partTemplate）
- 需求：手/胸/臀/肩由 2–3 个参数（腕径/掌长/指长组…）自动生成全部关键点（掌指关节线、指根参数化、
  拇指桡侧、胸背 landmark）。已有人手模板雏形（hand()），待泛化。
- 归属：D 完成后由主代理泛化；与 asymLoft/比例器共用。

## 状态更新（2026-09-06 四代理完成）
| 需求 | 工具 | 状态 | 证据 |
|---|---|---|---|
| R1 一体分支 | `scripts/parts/lib/ganyu-cage-branch.js` extrudeRing | ✅ 交付+浏览器核验 | 756面/deg0；边界 0 vs 拼接 84 |
| R2 前后不对称 | `scripts/parts/lib/ganyu-asym-loft.js` asymLoft | ✅ 交付（视觉经 v4 集成侧视核验） | 胸+0.210/−0.110、臀−0.140 |
| R3 断缝检测 | `scripts/parts/lib/ganyu-seam-check.js` seamCheck | ✅ 交付 | 拼接 5/8 vs 一体 0/0 |
| R4 比例断言 | `proportion-check.js` characterProportionReport | 自动回归通过；角色拟合未验收 | 显式 chinY、实际网格高度、缺测返回 null；旧固定头身6.75不能作证据，见 `docs/character-proportion-api.md` |
| R5 部件模板 | hand() 雏形；泛化待做 | 🔧 下一步 | 掌指0.9 |

- 当前增量：profileLoft 已输出 ringIdx；cageLoft 已修正角纵插值与逐面颜色，subdivSurface 已修边点坍缩，见 `tests/cage-sampling.test.ts`。上述旧小样记录不代表当前人体通过：R2 仍有67对自交，需共享边界过渡修复与独立视觉复核。
- 参考：`docs/game-engine-knowledge/retrospective-2026-09-06-ganyu-ankle-gia-export.md`、AGENTS.md 铁律 1-9。
