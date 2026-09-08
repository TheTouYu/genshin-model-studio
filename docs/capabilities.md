# 能力编目（genshin-model-studio）

> 自动生成于 `scripts/list-capabilities.mjs`（scripts/list-capabilities.mjs）。单一来源：CLI 参数/输出以各 CLI --help 与源码为准；网格阈值直接读源码 `const DEFAULT_*` 常量，保证与实现逐字一致。

## CLI 命令

| 命令 | 命令名 | 参数 | 输出 | 源码 |
|---|---|---|---|---|
| `gen-model` | `npm run gen-model` | `<input.json> (structure.json 超集)` · `--out-dir <dir>` · `--force` · `--format text|json` · `--list-resources` · `-h/--help` | `<name>.gil` · `<name>.summary.json` | `src/cli/gen-model.ts` |
| `export-mesh` | `npm run export-mesh` | `<input.json> (mesh JSON 或 structure 超集)` · `--out-dir <dir>` · `--format gil|gia|both` · `--budget <N>` · `--no-gate` · `--force` · `--format-txt text|json` · `-h/--help` | `<name>.gil` · `<name>.gia` · `<name>.structure.json` · `<name>.summary.json` | `src/cli/export-mesh.ts` |
| `contour-model` | `npm run contour-model` | `<input.json> (topOutline+sideProfile 或 rings)` · `--out-dir <dir>` · `--name <name>` · `--format gil|gia|both` · `--budget <N>` · `--points <N>` · `--views` · `--no-gate` · `--force` · `--format-txt text|json` · `-h/--help` | `<name>.mesh.json` · `<name>.structure.json` · `<name>.gil` · `<name>.gia` · `<name>.summary.json` · `view-{iso,front,side,top,back}.svg` | `src/cli/contour-model.ts` |
| `gen-gia` | `npm run gen-gia` | `<structure.json>` · `<output.gia>` | `<output.gia>` | `src/gia/gia-encoder.ts` |
| `gen-resource-table` | `npm run gen-resource-table` | `--write` | `docs/input-format.md` · `README.md` | `scripts/gen-resource-table.mjs` |
| `gen-calibration` | `npm run gen-calibration` | `（无命令行参数；确定性生成校准包，可重跑）` | `delivery/calibration-mesh/*/` · `delivery/calibration-mesh/MANIFEST.json` | `scripts/gen-calibration-package.mjs` |

## gms 命令组

> 浏览器内 `window.gms`：几何 / 组件 / 物理声明 / 工具。

| 组 | 命令 |
|---|---|
| geometry | `clear`, `circle`, `rect`, `line`, `curve`, `polyline`, `loop`, `undo`, `import`, `export` |
| component | `part`, `group`, `ungroup`, `props`, `rotate`, `rotatem`, `delete` |
| physicsDeclaration | `point`, `touches`, `link`, `floating`, `collides`, `verify`, `parts` |
| tool | `summary`, `px2m`, `m2px`, `mode`, `list` |

## gms.part 类型

`ring` · `rod` · `poly` · `sphere` · `cone` · `tri` · `quad` · `disc` · `el-disc` · `arc` · `plate` · `mesh`


## 网格验证阈值（verify.ts / panelize.ts / contour-loft.ts 默认值）

| 项 | 默认值 |
|---|---|
| watertight | `openEdges=0 且 nonManifold=0（每条边引用次数：2=闭合、1=开边、>2=非流形）` |
| weldTolerance | `2e-4` |
| minArea | `1e-9` |
| skinnyEdgeRatio | `0.08` |
| maxSkinnyPct | `5%` |
| maxAreaRatio | `20` |
| quadThickness | `0.005` |
| triThickness | `0.002` |
| boxThickness | `0.0015` |
| normalTolerance | `0.999` |
| resamplePoints | `200` |
| degenerateMode | `'box'（默认；或 'skip' 只计数）` |

## 官方基础元件资源表

| 资源 ID | 名称 | 状态 | scale 语义 |
|---|---|---|---|
| 10005018 | 空模型 | 已闭合 | 无可见几何 |
| 10009001 | 长方体 | 已闭合 | `1×1×1`（边长 1 米，半尺寸 0.5） |
| 10009002 | 球体 | 已闭合* | 直径 1（统一设计语言） |
| 10009003 | 平面 | 未校准 | `1×1` |
| 10009004 | 三棱柱 | 已闭合 | 高 1，底面正三角形**外接圆直径 1**（外接半径 0.5，边长 0.866） |
| 10009005 | 五棱柱 | 已闭合 | 高 1，底面正五边形**外接圆直径 1**（外接半径 0.5，边长 0.588，顶点到对边距离 0.905） |
| 10009006 | 三棱锥 | 未校准 | — |
| 10009008 | 圆柱 | 已闭合 | 截面直径 1 |
| 10009009 | 圆锥 | 未校准 | — |
| 10009010 | 线框长方体 | 未校准 | — |
| 10009011 | 线框圆柱 | 未校准 | — |
| 10009012 | 开口薄壁圆柱 | 未校准 | 截面直径 1；轴向长 = `scale.y`（空心，无顶盖/底盖 openEnded） |
| 10009019 | 网格 | 未校准 | 几何由 `vertices/faces/colors` 承载（世界坐标）；`scale` 无尺寸语义 |

## 其他 scripts

`build` · `gen-model` · `export-mesh` · `contour-model` · `gen-gia` · `gen-resource-table` · `gen-calibration` · `capabilities` · `test` · `benchmark` · `web`

