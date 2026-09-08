# 网格-面片体系设计（路线 B 确认版）

> 状态：v1 设计稿（2026-09-07）
> 前提（用户确认）：**GIA / GIL 容器不含自定义网格**，输出只能引用官方基础元件；因此一切网格几何 = 「最小面 + 仿射变换」组合，再由算法拼出「顶点/面」乃至「环放样」的 3D 形态。
> 目标：让模型**像画画一样**生成自定义多边形点——例如用 **200 个点定义一个脚截面环**，叠加高度环后呈现有深度的 3D 表面（逼近用户提供的 Blender 有机角色网格观感）。
> 关联文档：[blender-skill-study-report.md](blender-skill-study-report.md)（决策门 #1 已由本条确认：走路线 B）、[method-2026-09-06-surface-mesh-framework.md](game-engine-knowledge/method-2026-09-06-surface-mesh-framework.md)、[model-build-test SKILL.md](/home/h/.pi/agent/skills/model-build-test/SKILL.md)。

---

## 1. 三层架构（用户定义 → 仓库映射）

| 层 | 用户定义 | 实现含义 | 仓库现状 | 结论 |
|---|---|---|---|---|
| **L0 最小面** | 缩放最小面 → 长方体/正方形/三角形面；三角形缩放+旋转 → 任意三角形；长方形同理 | 有限的几种「面片基元」+ 仿射变换，得到任意多边形面片（**平面放置**） | 已有：`quad`（10009003 平面，`w/h` 缩放）、`quadB`（显式局部基 u/v/n 消除滚转歧义）、`tri`（10009006 三棱锥压扁三角）、表面网格 1339 面实证 | **已有，但未校准**（10009003/10009006 在 input-format 标「未校准」） |
| **L1 顶点/面网格** | 拿到多边形后，对多边形做位置/旋转更改，组成相应**顶点**（算法层面） | 多边形集合共享顶点坐标 → 面板网格（顶点表 + 面表 + 颜色分区）+ 焊接/无缝 | 已有：`loftMesh`/`profileLoft` 输出 `{vertices, faces, colors}`；`mergeData`/`mirrorMeshData`；`meshCheck`（面数/瘦长三角/退化面/面积比）；`polyDomePatch`（中心顶点+径向环+三角扇）；`polyGrid` | **已有网格数据结构**，但在 `scripts/parts/lib/ganyu-lib.js` 里，未通用化、未入 gms、未单测 |
| **L2 环放样** | 像画画一样生成自定义多边形点（如 200 点脚环），叠环出 3D 深度 | 截面环（任意闭合轮廓，N 点）沿路径/高度序列 → 蒙皮成 L1 网格 | 已有：`surface(rings…)`（椭圆环→四边面板）、`loft`（沿路径的椭圆毂放样）、`profileLoft`（**不对称截面 + Catmull-Rom 路径 + 密集采样 + 脚趾瓣/趾鼓包/皱褶/微噪声 + cap**） | **引擎已有**，输入还是「椭圆截面 {rx,ry,cx,cy} ± 径向调制」；缺「任意手绘/图像轮廓环」直接输入 |

**一句话结论：三层能力大部分已存在（甘雨 v18 的 1339 面 + profileLoft 趾部变体就是证据），本轮真正要补的是「输入层（任意轮廓环）、通用化与工具化、网格验证门禁、基元校准」四件事。**

---

## 2. L0：最小面基元（先校准，再扩）

### 2.1 面片基元池

| 基元 | 资源 | 用途 | 现状 |
|---|---|---|---|
| 四边形面片 | 10009003 平面（1×1，未校准） | 任意四边形/方格网（主体表面） | 已大量使用（甘雨 1313 块） |
| 三角形面片 | 10009006 三棱锥（压扁，未校准） | 任意三角形（补片/楔/收口/趾缝） | 已使用（鞋楔、polyDomePatch 扇） |
| 正方形/矩形面片 | 10009003 缩放（平面） | 规则面板 | 已使用 |
| 体块（非面） | 10009001 盒 / 10009008 柱 / 10009002 球 / 10009009 锥 | 贴附层、装饰层 | 已使用 |

> 说明：stroke 层「矩形→10009001 长方体、三角→10009006」由 `src/draw/generate.ts` 处理；**网格体系使用「面片」语义**（quad→10009003、tri→10009006），两者可在 L0 基元表统一登记。

### 2.2 仿射变换规则（必须显式）

- **法线 + 滚转歧义**：只有法线的面片在弯曲环面上会「滚转/翻面」——`ganyu-lib.js` 已用 `quadB`（显式局部基 `(u,v,n)` → 旋转矩阵 → YXZ 欧拉）解决；**新体系强制面片带显式局部基**，不再用「法线 + 猜测上向量」。
- 任意三角形：10009006 三棱锥压扁 → 按 2D 顶点形状缩放/旋转；**编目一个确定性三角面片函数 `tri(center, v0, v1, normal, color)`**（由三角形两边向量直接算基）。
- 任意四边形：`quad(c, u, v, n, color)` 或 `quadB`。
- 无缝与接缝：现有实现用 **满格共边（相邻面坐标精确共享）** 或 **w×1.03/h×1.03 小重叠（3%）** 藏缝；统一规则要写入 L0：优先共享边；共享边不可达时使用 1%–4% 重叠（与 Blender 技能「接合处重叠 5–15mm」同思想，量级按模型尺寸缩放）。
- **GIA 根缩放（铁律 #1）**：输出 `.gia` 时 root 同时乘到「位置与缩放」——真实尺寸 = `rootTransform.scale` × 数据。root=0.1 → 空模型 0.1×0.1×0.1；改动 root 必须「位置与缩放同乘 1/root」双向补偿，否则出现大板压小管/缝隙。`src/cli/gia-common.ts` 的 `makeGiaInput` 统一 `rootTransform.scale=[0.1,0.1,0.1]` 且 item `position/scale` 均 ÷0.1；`export-mesh` 与 `contour-model` 共用，保证两条 CLI 输出同一 root 语义。

### 2.3 Phase 0 校准任务（先做，最小必要）

1. **10009003 平面**：零旋转朝向（法线 = +Y？）、是否双面显示、scale 与 w/h 的映射（1×1 语义）、颜色/透明度渲染（与 input-format「未校准」对齐）。
2. **10009006 三棱锥**：压扁语义的精确比例（三角面 = 高→0 的极限？还是固定棱锥底面？）、三角形状是否随 `scale.x/z` 精确可控（任意三角形）。
3. 用最小校准板（3-5 个面片，不同形状/朝向）在游戏/编辑器里对照，把三处资源表（`src/core/official-resources.ts`、`docs/input-format.md`、README）一起闭合，并补 **10009012** 登记。

---

## 3. L1：面板网格（顶点/面层）

### 3.1 数据结构（已有雏形，正式化）

```ts
type Vec3 = [number, number, number]
interface PanelMesh {
  vertices: Vec3[]          // 顶点表（世界/模型空间，米）
  faces: number[]           // 每 3 个 = 1 三角；或成对 index = 1 四边（与 gms.part 保持一致）
  colorsPerFace: string[]   // 每面颜色
  // 建议新增：group?: string（部件分组，对接 parts-tool tickets）；normals?（缓存）
}
```

- 现有实现：`profileLoft(...)` 返回 `{vertices, faces, colors}`（见 `scripts/parts/lib/ganyu-lib.js`），`mergeData(a,b)` 合并、`mirrorMeshData(d)` 镜像（反转面序）、`meshCheck(d)` 诊断。
- **待补**：`faceWinding` 一致性检查（法线朝外）、顶点焊接 `weld(vertices, epsilon)`（重复点合并，容差 0.0002）、`triangulateMesh` 确定性三角化、`toPanelParts(d)`（面板 → gms.part 调用，内部复用 quadB/tri）。

### 3.2 面板化（mesh → items）—— 本体系唯一出口

```
PanelMesh → 面片序列（三角/四边 + 局部基 + 颜色 + 分组）
         → gms.part('quad'|'tri', …)（每个面 = 1 个官方元件）
         → structure.json items[] → .gil/.gia
```

- 保证**确定性**（相同 mesh ⇒ 相同元件序列）；当前 `surface` 的 `u` 绕周方向、`profileLoft` 的 `sides` 即是确定性参数。
- **预算控制**：`faceBudget`（如 300–3000 面）→ 自动定 sides/dense；面数 = 元件数上限的硬约束（当前 30000 笔画预算按网格面重算）。

### 3.3 网格验证（升级为生产门禁）

- 现有：`meshCheck`（退化面/瘦长三角/面积比）。
- 待补并接入 `gms.verify()`：非流形/裂缝检测（相邻面共享顶点坐标误差 > 容差）、法线指向（朝外：**有向边一致性 + 逐连通分量有符号体积**，替代旧「面法线·(面心−质心)」全局质心点积——凹体不误报）、局部自交检测（一般位置 Möller–Trumbore 边穿三角 + 共面 2D 重叠；排除相邻/退化/共面；与绕序**相互独立**，一致绕序≠无自交）、预算超限。
- 输出：`{faces, deg, skinnyPct, areaRatio, seams, invertedNormals, budgetUsed}`。

---

## 4. L2：任意轮廓环放样（200 点脚环）

### 4.1 现有引擎 vs 目标

| 现有 | 局限 | 目标 |
|---|---|---|
| `ring = {y, cx, cz, rx, ry}`（椭圆/偏心椭圆） | 无法表达脚掌轮廓（趾缝、足弓、宽窄变化） | `ring = Vec3[200]` 任意闭合轮廓点（+ 可选法线/轴向） |
| `profileLoft(path, sections, segs, sides, …)` | 截面是「径向调制椭圆」（`toe/toes/bumps/micro/creases` 都是叠加变形） | 直接吃「轮廓环序列」：`loftContour(rings: Vec3[][], opts)` |
| `surface(rings, u)` | 只支持椭圆环 → 方格网 | 泛化为 `surfaces(contours)`：相邻任意环 → 四边带（点对齐策略：按弧长参数对齐，200 点环 = 环内 200 跨度） |

### 4.2 输入层（「像画画一样」的入口）

1. **画线输入**（现有画线建模的延伸）：用户在前视/侧视/顶视画 2D 轮廓 → 算法合并成 3D 轮廓环（复用 ADR-0002 的 2D 画布 + 视图反投影）。
2. **图像输入**（参考图管线，对标 dsh-blender reference-to-3d）：顶视脚底轮廓 + 侧视高度剖面 → `reference-fit` 输出 N 个截面环（每环 200 点）。
3. **测量输入**（现有 `extract-ganyu-profile.py`）：宽度/深度剖面 → 改造为「任意轮廓」生成器（保留椭圆退化兼容路径）。

### 4.3 脚部放样规格（首目标，对标用户截图）

| 项 | 规格 |
|---|---|
| 环数 | 脚底→脚背→踝：**8–16 个截面环**（脚掌前 4 个加密：趾区、趾根、足弓、脚跟） |
| 每环点数 | **32–200 点**（默认 200 精度档；密度由曲率自适应，预算允许就全 200） |
| 环来源 | 顶视轮廓（脚型）+ 侧视剖面（趾尖/足弓/跟高）+ 参考图色带 |
| 趾部 | `opts.toe`（脚背瓣）+ `opts.toes`（逐趾 angular list：位置/长度/抬升/侧偏，已有参数）+ `toeBumps`（趾鼓包，已有）+ 趾间三角补片（`tri`/`polyDomePatch`，已有） |
| 封口 | `profileLoft` 的 `cap: 'bottom'|'top'|'both'` 已有 → 脚底板用 bottom cap + `quad` 三片；袜口/脚踝口 top cap 或开放 + 环边 |
| 法线 | 现有 `cross(dU,dV)` + 朝外校验（`surface` 已做径向点积）→ 泛化到任意轮廓；带 `quadB` 局部基 |
| 预测面数 | 200 点 × 12 环 ≈ **2 × 200 × 11 ≈ 4400 面**（预算高）；默认档 64 点 × 12 环 ≈ **1408 面**（对标甘雨 1339 面，可接受） |
| 验收 | `meshCheck`（deg=0、skinny≤5%、areaRatio≤20）+ 剪影 IoU（目标 ≥0.65→0.70）+ 五视角 + 近景「趾缝可读、无看不懂的凸起」+ `gms.verify()` 结构门禁 + 预算 |

### 4.4 关键算法清单（新增/泛化）

| # | 算法 | 现状 | 动作 |
|---|---|---|---|
| A1 | 任意闭合轮廓 → 三角化/四边形化 | 只有 polyDomePatch（凸包扇） | 新增确定性 ear-clipping（凹多边形）+ 退化处理；凹多边形先切凸块再扇 |
| A2 | 轮廓环间四边带（loft strips） | surface 只支持椭圆环 | 泛化 `loftContour(contours, opts)`：按弧长参数对齐（同点数环 1:1；异点数先重采样到 N） |
| A3 | 顶点焊接（weld/merge by distance） | 无（隐式共边） | 新增 `weld(d, eps=2e-4)`；报告焊点数 |
| A4 | 轮廓→环生成（画线/图像/测量） | 测量脚本人物专用 | 新增 `reference-fit` 通用管线（轮廓提取 + 环采样 + 色带） |
| A5 | 面板化 + 局部基 | quadB 已有 | `toPanelParts(d)` 统一出口（含 tri/quad/cap/重叠规则） |
| A6 | 网格诊断门禁 | meshCheck 已有 | 扩为 §3.3 清单并接入 verify/rules-check |
| A7 | 细节变形（趾/褶/噪音） | profileLoft 已有（toe/toes/bumps/creases/micro/rings） | 保留并文档化参数语义（现仅在脚本注释里） |

---

## 5. 与现有系统的衔接（不破坏现状）

1. **代码位置**：把 ganyu-lib 的通用部分迁入 `scripts/lib/mesh/`（或后续 `src/draw/mesh/`），带单测（golden：固定 mesh → 固定 items）。
2. **命令层**：`gms.mesh(data)`、`gms.loft(contours, opts)`、`gms.meshSummary()`（face/deg/skinny/areaRatio/budget），中文报错；旧命令（stroke/part/link）全部保留。
3. **持久化**：work.json 增加 `meshLayer`（版本化扩展），`canvasWidthPx/canvasHeightPx` 标定铁律沿用（坑 #17）。
4. **流水线**：`scripts/run-gms-parts.sh` + `parts-tool.py` 复用（局部生成/组合/缓存），mesh 部分作为新 ticket 类型。
5. **技能**：model-build-test 增加「网格-面片体系」章节；拆分子技能时把 L0/L1/L2 作为 `blockout→detail` 的教材单元。
6. **边界声明（不改）**：无布尔、无真平滑着色（面片近似）、无自定义网格资源；接缝靠共享边/小重叠；曲面观感靠密度 + 颜色分区，不是 smooth shading。

---

## 6. 实施顺序

| Phase | 内容 | 出口 |
|---|---|---|
| **P0 校准与编目**（1 轮） | 10009003/10009006 校准板 + 三处资源表闭合 + 补 10009012 | 校准记录写入 input-format；最小校准板截图 |
| **P1 通用化**（2-3 轮） | `scripts/lib/mesh/`：PanelMesh IR + weld + triangulate + loftContour + toPanelParts + 单测；`gms.mesh/loft/meshSummary` | 甘雨 surface 等价复现（golden）；npm test 全绿 |
| **P2 输入与门禁**（2 轮） | reference-fit 通用管线；meshCheck→verify 门禁；预算参数化 | 200 点任意环示例（画线/图像）跑通 |
| **P3 脚部专项**（2-4 轮） | 按 §4.3 规格做脚/袜（用户截图目标）；局部 ticket 拆分；近景/五视角 + IoU 验收 | 脚部模型达标（meshCheck 干净 + IoU + 视觉核验通过） |
| **P4 技能沉淀**（1-2 轮） | drawing-rules 增补；model-build-test 子技能；helper 清单入文档 | 可复用的「有机部位建模模板」 |

---

## 7. 待用户拍板（影响实现）

1. **预算档**：默认脚部是否按 ~1400 面（64 点×12 环）还是 ~4400 面（200 点×12 环）？截图所示是生产级数万面网格，超出基础件面板化合理上限——面板化能做到「细节可读、无裂缝、近景不穿帮」，做不到「真平滑拓扑」。
2. **输入方式优先级**：先做「画线轮廓」（用户手画顶视/侧视）还是「图像 reference-fit」（参考图自动提轮廓）？建议先画线（复用现有画线建模），图像管线随后。
3. **校准实验安排**：10009003/10009006 需要游戏/编辑器对照（需要你操作或提供截图），是否本轮就排 P0？

---

## 8. 相关代码索引（证据）

| 文件 | 内容 |
|---|---|
| `scripts/parts/lib/ganyu-lib.js` | `quad`/`quadB`/`surface`/`loft`/`loftMesh`/`profileLoft`（含 toe/toes/bumps/rings/creases/micro/dense/cap）/`polyGrid`/`polyDomePatch`/`toeBumps`/`mirrorMeshData`/`mergeData`/`meshCheck` |
| `scripts/parts/tool-ankle-bump.js` | profileLoft + polyDomePatch 组合实例（A/B/C 变体 + 上下文列 + meshCheck 数值） |
| `scripts/draw-ganyu-soccer-v15.js` | `surface(rings,u,colorFn,thick)` + `quad(normal 版)` + ribbon 实例（1339 面） |
| `scripts/extract-ganyu-profile.py` | 前/侧测量 → 椭圆环（rx/ry）→ 稠密环（GANYU_DENSE） |
| `src/draw/generate.ts` | 已识别 triangle→10009006、rectangle→10009001（stroke 层） |
| `docs/game-engine-knowledge/method-2026-09-06-surface-mesh-framework.md` | 曲面网格方法论（曲线→面、quad 法线公式、分隔文件、密度验证） |
