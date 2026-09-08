# 主技能追加补丁（06 · 待应用于 /home/h/.pi/agent/skills/model-build-test/SKILL.md）

> 说明：主技能文件位于会话沙箱之外（`/home/h/.pi/agent/skills/…`），本会话（workspace-write 且禁用审批升级）
> 无权限写入，故把**只追加、不改既有章节**的两段内容放在此处，由具备该路径写权限的代理按下面位置应用。

## 【位置 A】在起始段落之后、「## 1. 环境准备（每次开始）」之前插入：

````markdown
## 0. 链式路由（先选路线，再按需加载子技能）

建模前先看本节省上下文：决定走哪条路线，再**按需加载对应子技能**（不要通读全文）。子技能注册于 `.dsh/skills/gms-modeling-<stage>/SKILL.md`（front-matter 仅 name/description，可被模型直接调用），每阶段一份，链式推进，可单独加载。

| 路线 | 适用 | 阶段链 |
|---|---|---|
| **网格-面片 route**（Mesh） | 有机曲面 / 自定义多边形（脚、杯、曲面板）——能用「顶视轮廓 + 侧视高度剖面」或「顶点+面」表达 | preflight → reference-fit → blockout → detail → verify → export |
| **经典画线 route**（Stroke） | 常规刚体（杯 / 风扇 / 手机）——用 gms 笔画 + 弹层参数 | 本技能 §1–§10 直接建模 |

**选路规则**：物体能切成「一叠截面环」→ Mesh route（更贴合曲面）；只能靠基本几何拼装 → Stroke route。不确定 → 先加载 `gms-modeling-preflight` 自检环境、读标定、定档位（budget / points / cap）。

**每阶段加载**：
- `gms-modeling-preflight`：环境自检 + 路线/档位决策。
- `gms-modeling-reference-fit`：参考 → `contour-model` 输入 JSON（topOutline + sideProfile 或 rings）。
- `gms-modeling-blockout`：低分辨率剪影（`contour-model --points 64`，`--views` 五视角）。
- `gms-modeling-detail`：颜色带 / 分辨率 / 封盖 / 退化 / 多 mesh 拼接。
- `gms-modeling-verify`：门禁（watertight / seams / normals / degenerate / skinny / areaRatio / budget）与修复。
- `gms-modeling-export`：面板化 → `.structure/.gil/.gia` + 摘要（`--format` / `--budget` / `--views`）。

> 关键命令与参数以子技能正文为准；本技能 §11 是网格-面片体系的规则与阈值速查。
````

## 【位置 B】在文件末尾追加：

````markdown
## 11. 网格-面片体系（2026-09-07）

> 适用于「自定义多边形 / 有机曲面」物体（脚、杯、曲面板）。与 §1–§10 的经典画线 route 并存；`gms.part('mesh', …)` 与面板化、门禁、放样全部来自 `src/mesh/`。

### 11.1 网格元件声明（gms.part('mesh')）
`gms.part('mesh', { mesh: { vertices, faces, colors? }, material? })` → resourceId **10009019**。
- `vertices` 为世界坐标（米）；`faces` 每 3 个下标 = 1 三角；`colors` 逐面 `0xRRGGBB`。
- **警告**：10009019 直出的 `.gia/.gil` **只携 resourceId + 变换，不携几何**（GIA/GIL 容器不含自定义网格；实测 c-mesh-direct 817B）。要产出真实几何必须**面板化**（见 §11.3 / export-mesh / contour-model）。

### 11.2 面板化规则（src/mesh/panelize.ts，确定性）
- 配对（共享边 + 法线 cos ≥ 0.999）→ 10009003 平面（显式局部基旋转，Y 向厚 0.005）。
- 未配对三角 → 10009006 三棱锥压扁（厚 0.002）。
- 退化面（面积 < 1e-9）→ 10009001 盒兜底（1.5mm）或 `{degenerate:'skip'}` 只计数。
- 颜色逐面透传；旋转 = 显式局部基 → YXZ 欧拉。

### 11.3 面板化出口 / CLI
```bash
npm run build --silent && node dist/src/cli/export-mesh.js <mesh.json> --out-dir <dir> --format both --budget <N>
npm run build --silent && node dist/src/cli/contour-model.js <input.json> --out-dir <dir> --points 64 --cap both --views
```
- `export-mesh`：吃 structure 超集或独立 mesh JSON（vertices/faces/colors），面板化 → `.structure/.gil/.gia/.summary`。
- `contour-model`：吃 `{topOutline+sideProfile}` 或 `{rings}` → 蒙皮成 mesh → 面板化 → 门禁 → 导出（同上）；`--views` 额外生成五视角 SVG。
- 两者都默认开启验证门禁；`--no-gate` 跳过（summary 记 `SKIPPED_GATE`）。

### 11.4 门禁阈值表（verify.ts 默认值）
| 检查 | 判据 | 默认阈值 |
|---|---|---|
| watertight | 每条边引用次数：2=闭合、1=开边、>2=非流形 | 开边/nonManifold=0 |
| seams | `weldTolerance` 近邻聚类 | 2e-4 m |
| normals | 面法线·(面心−质心)<0（仅闭网格强制） | 0 个朝内 |
| degenerate | 面积 < minArea | 1e-9 m² |
| skinny | minE/maxE < ratio 且占比 ≤ pct | 0.08 / 5% |
| areaRatio | p95/p5 ≤ maxRatio | 20 |
| budget | 单元数 vs `--budget` | requested=N，used=单元数 |

### 11.5 放样分辨率与瘦三角
- contour-loft 默认重采样 **200 点**（高保真）；**设计预算档 points=64**（cap 盖扇干净过门禁）。
- cap both 时盖扇三角 `minE/maxE ≈ 2π/points`：200 点 ≈ 3.1% < 8% → 门禁报「瘦长三角」；64 点 ≈ 9.8% > 8% → 通过。
- 高保真要 200 点 → `--no-gate` 并在摘要/交付说明标注 `SKIPPED_GATE`（仅演示，不作正式凭证）。

### 11.6 校准状态（docs/calibration-mesh-elements.md）
相关基元**均未校准**：10009003（朝向/双面/尺寸）、10009006（压扁/任意三角）、10009012（轴向/空心）、10009019（游戏侧是否按 vertices/faces 渲染几何）。未校准=游戏语义未验证，面板化产物按「候选」对待，**不写为已闭合**；用户把 `delivery/calibration-mesh/` 对照后果回传后才可闭合。

### 11.7 推荐链路（先轮廓→环→面板化→门禁→导出）
`reference-fit`（topOutline+sideProfile → rings）→ `contour-model`（loft → mesh.json）→ panelize（→ 单元序列）→ verify（门禁，默认开）→ export（.structure/.gil/.gia + 摘要）。每步用 `--format-txt text` 看 `mesh=`（faces/quads/tris/degenerate/units）与 `gate=`（passed/failed/skipped）。
````
