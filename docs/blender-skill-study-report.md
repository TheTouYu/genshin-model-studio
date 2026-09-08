# Blender 建模 Skill 体系研究与 Genshin Model Studio 优化报告

> 状态：v1 草案（2026-09-07）
> 目标：学习外部高质量 Blender 专业建模技能（以 `dsh-blender` 为主，`cc-blender-skill`、`blender-production-skills`、`blender-skills`、`blender-LPM-skill` 等为辅），挖掘本仓库在**生成建模设计、工具、AI 使用技能、产出模型质量**四个层面的不足，并给出分步优化路线图。
> 输入口径（用户已确认）：交付物 = 研究报告 + 差距清单 + 优化路线图；参考范围 = dsh-blender 为主 + 2-3 个其他高质量技能；缺陷口径 = AI 代理使用缺陷 + 生成模型使用缺陷（两者都覆盖）。

---

## 0. TL;DR（结论先行）

1. **外部技能的真正价值不只是「技能文本」，而是其背后依赖的软件高阶能力。** `cc-blender-skill`（**30 个链式 Skill**，v1.3.0，已 clone 源码核对）、`blender-skills`（94 个专业 Skill）、`dsh-blender`（**30 Skill = 1 编排 + 29 领域，13 个运行时工具，26 个确定性 Helper**，已 clone 源码核对，且为 cc-blender-skill 的 DSH 适配版）都建立在一个共同前提上：底层软件（Blender）提供**顶点/边/面级网格编辑、细分/平滑、布尔/镜像/倒角、拓扑与场景验证、材质/相机/渲染、引擎就绪导出**。技能只是把这些能力组织成可复用的流程剧本。
2. **本仓库当前的最大设计缺口：没有「网格阶段」。** 我们从「画线/命令 → 官方基础元件 items」一步到位，连续曲面只能靠离散段/面板拼装（`docs/phase4-3d-prd.md` 明示：无任意三角面片/布尔 → 离散段组合；`method-2026-09-05` 明示：硬约束，连续曲面靠离散段组合）。用户提供的 Blender 有机角色截图（脚部：连续四边形拓扑、密集环线、脚趾独立几何、平滑着色）是**顶点级有机网格**，现有工具无法直接支持。
3. **可行路径（先决策、后投入）：**
   - 路线 A：**先在游戏/编辑器受控实验中验证 `.gil/.gia` 能否承载自定义网格元件**（自定义 root 4 定义 + 非官方 resID 的网格能力）。若支持 → 直接建设网格 IR + 导出器，这是真正的「补齐高阶能力」。
   - 路线 B：若官方格式只支持基础元件引用 → 建设**内部网格 IR + 网格建模原语（细分/镜像/布尔/放样/挤出）+ 自动面板化 rasterizer**，把 Blender 级建模体验建在我们自己的工具里，输出仍归一到官方元件集；同时把「有机细节可表达上限」显式建模（脚趾 = 高密度面板 + 环线切割 + 平滑法线近似），避免口头承诺做不到的精度。
4. **技能层同样要重构。** 当前 `model-build-test/SKILL.md` 已 577 行、单文件承载全部规则，外部一流技能全部是「按专业阶段拆分的链式小技能 + 确定性 Helper + 执行契约」；我们应拆分为 chain-loadable 子技能（preflight / 参考测量 / blockout / 细节 / 验证 / 导出），并把画法铁律转成**可执行断言**，而不是留给模型「自觉」。
5. **已有家底值得保留。** 我们的 `gms.verify()/link/floating/collides`、`connectivity-check.py`、`inspect-draw-model.sh`、视觉模型核验闭环、`parts-tool.py` 分部件流水线，已经覆盖了外部技能里的「验证/生产门禁」思想；缺的是**网格表达能力 + 参考图→网格的工业级管线 + 技能结构**。

---

## 1. 研究范围与方法

### 1.1 本轮解决的问题

用户提出的三件事（按权重）：

| # | 诉求 | 落点 |
|---|---|---|
| 1 | 学习别人写好的高质量 Blender 专业建模软件技能 | 外部技能体系拆解（§3） |
| 2 | 优化我们仓库「生成建模」的设计和流程 | 设计层差距 + 路线图（§6、§8） |
| 3 | 补充工具层面不足 + 模型在使用上的缺陷 | 工具层 + AI 使用层 + 产出层差距（§6） |

用户还补充了一个关键观察：**专业建模软件除了技能本身，还依赖软件提供的高阶能力**；这正好暴露我们项目在这一块的缺失。用户提供的截图（Blender 有机角色网格：脚部连续四边形拓扑、密集环线、五趾独立几何、平滑着色）即「我们需要能支持的形态」。因此本报告把「高阶能力」拆为独立的**能力矩阵**（§4、§5），并据此给出缺口清单。

### 1.2 证据等级说明

本报告分两级证据：

- **L1（聚合/README 级）**：外部技能的能力描述来自 GitHub README、awesome 列表、行业文章、Skill 聚合站（skill4agent / skillsmp / awesomeskills / DeepWiki）。用于模式提炼与差距方向，**不声称逐文件读过源码**。
- **L2（仓库内源码/文档级）**：本仓库现状全部来自仓库文件（见 §11 索引）。

> 后续深挖（clone 外部仓库逐文件核对 30 Skill / 13 工具 / 26 Helper 的具体名称与实现）列在路线图 Phase 0 的可选动作中；本报告结论不依赖这些名称细节。

---

## 2. 外部研究对象清单

| 仓库/技能 | 形态 | 亮点（L1 证据） | 与本仓库的相关性 |
|---|---|---|---|
| [CheshireJCat/blender](https://github.com/CheshireJCat/blender)（npm `dsh-blender`） | DeepSeek Harness 插件（Skill + 运行时工具 + Helper） | 30 个建模/重建 Skill = `create-3d-model` 总编排 + 29 个领域模块（`blender-modeling`/`reference-to-3d`/`wireframe-to-3d`/`blender-animation`…）；13 个工具（status/scene_info/object_info/import/python/preview/render/render_frames/export/validate_scene/validate_export/helper_catalog/helper_run）；26 个确定性 Helper（`lib/helper-catalog.js`：mask-to-mesh-recipe、silhouette-validator、landmark-fit-report、multiview-fit-report、look-fit-report 等） | **主参考**：同为 DSH 技能体系；上游即 `cc-blender-skill` v1.3.0（MIT，见 upstream.md）；三层结构（Skill=流程/Tool=执行/Helper=确定性）正是我们缺的工程化分法 |
| [RobLe3/cc-blender-skill](https://github.com/RobLe3/cc-blender-skill) | Claude Code Skill 插件（**dsh-blender 的上游**） | **30 个 chain-loadable 技能**（`text-to-blender` 编排 + 29 领域：modeling/materials/lighting/cameras/rendering/animation/export/wireframe-to-3d/pro-workflow/reference-to-3d/uv-texturing/validation/fit-repair/look-calibration…）；在 **6 类场景**（sword/bottle/chair/aviator/desk lamp/broadcaster avatar）Blender 5.1.1 端到端验证；诚实声明「人类脸/有机细节从基础件拼不出，需要雕刻/导入/委托」 | 链式技能拆分 + 「诚实的能力边界」清单是范本；reference-to-3d / reference-look-calibration 与我们读图测量工作流直接对应 |
| [XliuXjianX/blender-production-skills](https://github.com/XliuXjianX/blender-production-skills) | 面向 Codex 的生产级技能套件 | 原生建模、几何节点、模拟、材质、**拓扑与场景验证**、参考图重建工作流 | 「拓扑/场景验证」正是我们 `gms.verify()` 想扩到的下一层（网格级验证） |
| [arjun988/blender-skills](https://github.com/arjun988/blender-skills) | 94 个专业 Skill + MCP 流水线 | 从 **blockout 到 engine export** 的全流水线（[DeepWiki 架构页](https://deepwiki.com/arjun988/blender-skills/2-core-architecture:-the-skill-system)、[总览](https://deepwiki.com/arjun988/blender-skills/1-overview)） | 流水线阶段划分（blockout→detail→validate→export）可映射我们的「轮廓→贴附→装饰」+ 导出 QA |
| [ozanzeng/blender-LPM-skill](https://github.com/ozanzeng/blender-LPM-skill) | Claude Code Skill | 一行简报 → 预算化（budgeted）平面色调低多边游戏资产 → Unity-ready FBX | **预算优先**（面数/材质预算）+ 引擎就绪导出，与我们的「300 面预算」完全同构，可把预算变成强制门禁 |
| [jangtrinh/design-os-3d-blender](https://github.com/jangtrinh/design-os-3d-blender) | Blender AI Agent OS | skills + **verified bpy 知识库** + **AGENT_OK/AGENT_FAIL 执行契约** + 可打印件生产门禁 | 执行契约 + verified 知识库 = 我们「只信实测语义、fail-closed」的正式化；生产门禁 = verify 的强化版 |
| [sandraschi/blender-mcp](https://github.com/sandraschi/blender-mcp) | FastMCP 服务器 | 41 个 portmanteau 工具（150+ ops）：批量网格/VSE/Grease Pencil/VRM/Gaussian splats；[autonomous-modeling 技能](https://skillsmp.com/zh/creators/sandraschi/blender-mcp/skills-autonomous-modeling) | 工具粒度设计参考：把底层 150+ 操作收敛成 41 个「建模者语义」工具，避免模型面对过细 API |
| [kevinbadi/blender-skills](https://github.com/kevinbadi/blender-skills) | Claude Code 技能 | 3D 产品生成 + 相机动画（crane-shot / turntable / perfect-loop） | 视角/演示工作流：我们已有 `capture-views.sh` 五视角，可吸收 turntable/perfect-loop 作为验收补充 |
| [NVIDIA omniverse 参考图重建示例](https://skillsmp.com/zh/creators/nvidia-omniverse/omniverse-labs/projects-ov-blender-example-skills-reference-to-3d-reconstruction) | 示例技能集 | reference-to-3d-reconstruction | 参考图 → 3D 重建的工业级示例，对标我们的测量驱动建模 |
| [ra100/blender-claude-plugin](https://github.com/ra100/blender-claude-plugin) | Blender 插件（给代理用） | 面向 claude/opencode/kilocode 等编码代理 | 插件作为「运行时工具层」的形态参考 |
| [Snyk: Top 8 Claude Skills for 3D Modeling](https://snyk.io/de/articles/top-claude-skills-3d-modeling-game-dev-shader-programming/) | 行业综述 | 覆盖界面导航、建模工具与修改器、雕刻/重拓扑、骨骼等 | 横向视野，确认主流技能都依赖 Blender 网格管线 |

---

## 3. 外部技能体系的通用设计模式（可借鉴的 9 条）

以下是跨仓库反复出现的模式，每条都给出「我们现状 → 差距」：

### P1 技能按专业阶段拆分，链式加载
- 外部：`cc-blender-skill` = modeling/materials/lighting/cameras/rendering/animation/export/… 每块独立 SKILL.md，按需要链式加载；`arjun988` 拆到 94 个专业 Skill。
- 我们：`model-build-test/SKILL.md` 577 行单文件（环境、CDP 协议、命令表、坑、剧本、方法论全在一处）。
- 差距：上下文重、规则易被模型漏读（基线已见「认真但缺经验」损耗）；应拆子技能 + 索引入口。

### P2 Skill = 流程剧本 / Tool = 运行时执行 / Helper = 确定性纯函数
- 外部：`dsh-blender` 明确「30 Skill / 13 运行时工具 / 26 确定性 Helper」三层；`sandraschi` 把 150+ 底层 op 收敛成 41 个语义工具。
- 我们：Skill 有了（SKILL.md），运行时工具基本有了（gms 命令层 + scripts/），但 **Helper 层缺失**：曲面生成、offsetRings、法线公式、部件拆分等全是**页面内/脚本内临时 JS 函数**，不可单测、不可复用、无版本。
- 差距：抽 `src/` 或 `scripts/helpers/` 的确定性函数库 + 单元测试。

### P3 参考图/测量驱动（reference-to-3d 管线）
- 外部：`reference-to-3d`、`reference-look-calibration`、NVIDIA 参考图重建、`dsh-blender` 参考图拟合。
- 我们：已有 `scripts/extract-ganyu-profile.py`（原图归一化 → 测量环）与 v8/v9 密集测量（21 环/12 环/8 行 + 色带边界 marks），但它是**人物专属脚本**，不是通用管线（任意参考图 → 轮廓/环/色带数据）。
- 差距：泛化为「reference-fit」通用能力：图 → 轮廓 → 测量环 / 色带 → 网格环数据;并配 IoU 基线评估。

### P4 预算优先（budget first）
- 外部：`blender-LPM-skill` 一行简报 → **预算化**低多边资产；`arjun988` 流水线 blockout 阶段先定规模。
- 我们：方法论 300 面档已写「先定预算再分配面数」，但预算只是文档建议，**没有硬门禁**（超预算不报错）。
- 差距：预算进 `verify()`：面/元件/笔画预算、预算分配（最高段数给最值得细分的环）。

### P5 执行契约 + 生产门禁（execution contract / production gate）
- 外部：`design-os-3d-blender`：**AGENT_OK/AGENT_FAIL** 执行契约 + 可打印件生产门禁；`XliuXjianX` 拓扑与场景验证。
- 我们：`gms.verify()`（link 全接触 + 无悬空 + 无重叠）、`connectivity-check.py`、`inspect-draw-model.sh` 已有雏形；但门禁是「结构正确」，**没有网格级门禁**（流形/法线/退化面/面数/边界）。
- 差距：verify 扩展为 production gate（结构 + 拓扑 + 预算 + 资源覆盖 + 引擎就绪）。

### P6 验证闭环内建于工具（而非只靠人眼/文档）
- 外部：渲染 → 验证 → 导出三段式；验证器挂在流水线里确定性可重跑。
- 我们：已有 summary → inspect → capture-views → 视觉模型核验 → 数据断言闭环（很强），但「画法铁律」中大量规则（G1-G17）仍是**文档约束**，模型会漏执行（基线实证「断言外不主动」）。
- 差距：把可机械化的铁律转成断言/命令（如 `gms.rules-check()` 输出未满足项），文档只保留不可机械化的部分。

### P7 可移植/引擎就绪导出规范化
- 外部：`blender-LPM` Unity-ready FBX；`dsh-blender` 可移植格式导出；`arjun988` engine export。
- 我们：目标是 `.gil/.gia`（游戏格式），且有 golden 测试与回读；但缺少「导出前 QA」清单（单位/朝向/缩放/资源覆盖/ID 冲突/预览可加载）。
- 差距：导出流水线加 game-usable 校验（已有部分在 encoder 拒绝路径，可扩展为清单）。

### P8 verified 知识库，只信实测语义
- 外部：`design-os-3d-blender` 标榜 verified bpy 知识库；`cc-blender-skill` 在 6 类场景验证过。
- 我们：`docs/input-format.md` 已分「已闭合/未校准」；`drawing-rules.md` 全来自实测；坑清单每条都是真实事故 —— 这正是 verified 知识库的形态，且比多数外部技能更严格（fail-closed）。
- 差距：未校准资源（10009003 平面、10009006 三棱锥、10009009 圆锥、10009010/11 线框）在有机建模中大量使用（quad/tri/cone），**应优先校准并登记**，否则细节建模会踩未验证语义。

### P9 渐进式扩充工具池（capability grows on demand）
- 外部：`sandraschi` 41 工具是 150+ ops 的收敛；`cc-blender-skill` chain-loadable 随时加入新技能。
- 我们：PRD phase5 已明确「命令库渐进式扩充」；`open-items.md` 已登记：多边形棱柱、叶片尖度、扫掠管道、lathe Z 语义、gms 缩放单笔/图层显隐/颜色渐层、选中笔画整体移动/旋转 UI。
- 差距：**执行节奏**：把「缺口 → 用户口头」升级为「缺口 → 评估 → 入池 → 实现 → 验证 → 沉淀」的固定循环（复盘铁律已要求，可以在工具/流程上固定下来）。

---

## 4. 外部技能依赖的 Blender 高阶能力（能力矩阵）

这是用户点出的关键：**技能 ≠ 能力，技能依赖底层能力**。下表左列是 Blender 提供的高阶能力，中间是哪些外部技能依赖它，右列是我们现状。

| # | Blender 高阶能力 | 依赖它的外部技能 | 我们现状 | 差距等级 |
|---|---|---|---|---|
| C1 | **顶点/边/面级网格数据模型**（verts/edges/faces/loops/boundary/manifold/normals/UV/权重） | 几乎所有（cc-blender-skill modeling、arjun988、dsh-blender、design-os） | 无网格层：只有「笔画 → 官方元件 items」；quad/tri 面板只是平面元件 | **致命**（本报告的 1 号缺口） |
| C2 | **网格编辑操作**：移动/缩放/旋转顶点、挤出、内插、倒角、环切、刀切、合并、溶解、填充、solidify | cc-blender-skill modeling、arjun988 blockout/detail | 只有 2D 笔画编辑（选/删/设参/旋转复制）；无顶点级编辑 | **高** |
| C3 | **布尔/镜像/阵列**：union/diff、mirror、array | cc-blender-skill、XliuXjianX 原生建模 | 无布尔（硬约束明说）；镜像无；旋转复制算半个阵列 | **高** |
| C4 | **细分/平滑**：subdivision surface、multi-res、smooth/relax、shade smooth、crease | cc-blender-skill、arjun988、dsh-blender | 只有 `count`/`segments` 增加离散段数；无真实细分曲面、无平滑法线（每个面板是平的） | **高**（截图需求直接命中） |
| C5 | **曲线→网格 / 放样 / 车削 / 蒙皮**：bezier/nurbs、loft、spin、skin/armature | cc-blender-skill、dsh-blender 重建 | 有 lathe（母线→开口薄壁 10009012）与 poly/curve，但无通用放样/蒙皮；lathe 目前按最宽半径出直筒（PRD 明示局限） | **中高** |
| C6 | **雕刻/重拓扑**：sculpt brushes、retopo | cc-blender-skill（Snyk 综述提到雕刻/重拓扑） | 无；有机细节只能靠面板拼 | **高**（脚趾/手指级细节） |
| C7 | **几何节点/参数化生成**（程序化建模） | XliuXjianX、arjun988 | 半有：参数化生成器（房子/螺旋/足球）+ gms.part；但粒度是「元件」不是「几何节点」 | 中 |
| C8 | **参考图拟合**：image plane、相机校准、轮廓提取 | dsh-blender 参考图拟合、NVIDIA reference-to-3d、cc reference-to-3d | 半有：`extract-ganyu-profile.py` + 三视图局部对照 + IoU 量化；专用脚本，未通用化 | 中高 |
| C9 | **材质/灯光/相机/渲染** | cc-blender-skill materials/lighting/cameras/rendering、kevinbadi turntable | 只有颜色（rgb/opacity/overlay）+ Three.js 预览 + 五视角截图；无灯光/材质曲线/渲染器 QA | 中（当前产品不需要真实渲染，但验收需要） |
| C10 | **网格/场景验证**：流形、退化面、法线、脏数据、场景报告 | XliuXjianX 拓扑验证、design-os 生产门禁、arjun988 | 有结构验证（link/floating/collides/connectivity），无网格验证 | **高** |
| C11 | **引擎就绪导出**：glTF/FBX/USD、单位/朝向、LOD、贴图打包 | blender-LPM Unity FBX、arjun988 engine export、dsh-blender 可移植导出 | 目标格式固定 `.gil/.gia`；已有 golden + 回读 + ID 规则，但无导出 QA 清单 | 中 |
| C12 | **确定性脚本/底层 API**（bpy / MCP / add-on） | ra100 插件、sandraschi MCP、dsh-blender 工具 | 有 gms 命令层（确定性，中文报错）与 scripts/；缺 mesh 层 API | **高**（决定前 5 项能否落地） |

> 结论：我们缺的不是「技能写法」，而是 **C1/C2/C4/C6/C10 这组「网格级能力」**；技能重构只是把它们组织好。

---

## 5. 本仓库生成建模体系现状

### 5.1 链路

```
输入（JSON / 画线 / AI 自然语言 / 参考图测量脚本）
   │
   ▼
生成器（参数化生成器 / draw 拟合管线 / gms 命令层）
   │   window.gms: circle/rect/line/curve/polyline/loop/props/rotate/delete/mode/summary/px2m/m2px/export/import
   │              part(disc|el-disc|ring|rod|plate|sphere|poly|cone|quad|tri) / link / touches / floating / collides / verify / parts / point / list
   ▼
structure.json 超集（items[]：官方基础元件 + Transform + 颜色）
   │
   ▼
编码器（src/core/encoder.ts → .gil 候选；src/gia/gia-encoder.ts → .gia）
   │   确定性字节输出 + golden 回读
   ▼
产物（.gil/.gia/structure.json/summary.json）→ genshin-ts 适配器写回（本仓库不写回）
```

### 5.2 能力盘点（对照 §4 矩阵）

| 能力 | 现状 | 代表性实现/文档 |
|---|---|---|
| 网格数据模型 | **无**（只有笔画 → items） | — |
| 网格编辑 | 无（2D 笔画编辑：选/删/设参/旋转复制） | `web/index.html` gms IIFE、`docs/phase5-collab-modeling-prd.md` |
| 拟合 | 强：RDP 抽稀 / Chaikin 平滑 / Catmull-Rom / 弧长重采样 / 封闭检测 | `src/draw/fitting.ts`、`src/draw/generate.ts` |
| 车削 lathe | 有（母线 → 10009012 开口薄壁；`segments` 控圆滑） | `docs/phase5-collab-modeling-prd.md §2.4` |
| 面板化曲面 | 有（quad 10009003 / tri 10009006 表面网格 + 法线公式 + 无缝满格共边） | `docs/game-engine-knowledge/method-2026-09-06-surface-mesh-framework.md` |
| 结构验证 | 强：link/touches/floating/collides/verify + connectivity-check.py | `model-build-test/SKILL.md §8`、`benchmark/connectivity-check.py` |
| 视觉验证 | 强：五视角截图 + 视觉模型双角度核验 + 数据核验硬门禁 | `SKILL.md §3`、`scripts/capture-views.sh`、`scripts/inspect-draw-model.sh` |
| 参考测量 | 半有：人物专用 `extract-ganyu-profile.py`、密集测量 v9、局部对照 | `scripts/`、`REPORT-ganyu-v9.md` |
| 预算 | 文档级：300 面档先定预算再分配；无硬门禁 | `method-2026-09-05-high-precision-modeling.md` |
| 高度技能化 | 单一大技能 577 行；子技能不独立 | `/home/h/.pi/agent/skills/model-build-test/SKILL.md` |
| 确定性 Helper 库 | **无**：sweep/offset/rings/surface/ribbon 等都是脚本内临时函数 | `scripts/draw-ganyu*.js` 等 |
| 资源表 | **不一致风险**：`src/core/official-resources.ts`、`docs/input-format.md`、README 三处各有一份，且都缺 10009012；10009003/10009006/10009009 未校准却已在有机建模中大量使用 | 见 §11 索引 |

### 5.3 现有已登记缺口（open-items.md，全部未排期）

多边形棱柱、叶片尖度、扫掠管道、lathe Z 轴语义、gms 命令扩充（缩放单笔/图层显隐/颜色渐层）、选中笔画整体移动/旋转（UI 操作入口）、配色层次（风扇单色粘连）。

---

## 6. 差距清单（GapMap）

### A. 设计层缺口（决定天花板）

| # | 缺口 | 现象/证据 | 影响 | 建议 |
|---|---|---|---|---|
| D1 | **无网格中间表示（Mesh IR）** | 链路直接「笔画/命令 → 官方元件 items」；外部全有 blockout mesh 阶段 | 有机角色（脚/手/发）无法表达；精细化只能靠面板密度堆 | 引入 `Mesh{verts,edges,faces,UV,法线}` IR；生成器先出网格再 rasterize 到官方元件 |
| D2 | **无网格建模原语** | 无挤出/环切/倒角/镜像/布尔/细分/平滑 | 无「环线切割」「倒角」「对称」这类建模者心智操作 | 在 IR 上实现 ops（先取镜像/细分/放样/挤出/平滑）；布尔用面板级共享边/重叠近似（路线 B 无真布尔） |
| D3 | **平滑表达 = 离散 + 平面板** | quad/tri 每面独立法线；无 shade smooth/细分 | 截图中「连续平滑曲面 + 密集环线」不可达，只能低多边形观感 | 细分曲面 + 密度上限 + （若格式允许）平滑法线；否则明示精度边界 |
| D4 | **参考图管线人物专用** | `extract-ganyu-profile.py` 硬编码人物部位 | 换对象（脚/手/鞋/道具）要重写脚本 | 通用 reference-fit：图 → 轮廓/环/色带 → IR 数据 + IoU 评估 |
| D5 | **预算/门禁是文档不是契约** | 300 面预算无硬检查；「断言外不主动」是基线错误模式 | 模型和人类都无法低成本发现超预算/漏断言 | verify 扩为 production gate（面数/元件/资源覆盖/拓扑/贴地） |

### B. 工具层缺口（把设计落地成能力）

| # | 缺口 | 现状 | 建议优先级 |
|---|---|---|---|
| T1 | 网格数据结构 + 导入/导出 API（`.mesh.json` 或 gms.mesh 命令） | 无 | P0（D1 的载体） |
| T2 | 建模 ops：mirror / loop-cut / extrude / bevel / solid / subdivide / smooth | 无 | P0-P1 |
| T3 | 布尔 union/diff（格式不支持真布尔） | 格式层硬约束（无自定义网格）；IR 内部可做面板级合并近似 | P1（路线 B 定案：先做共享边/重叠代替布尔） |
| T4 | 面板化 rasterizer（mesh → 官方元件集，确定性、无缝、密度可控） | 半有（surface/quad/tri 手工拼） | P1 |
| T5 | 确定性 Helper 库（几何/测量/色彩/预算/校验） | 无（脚本内临时函数） | P1 |
| T6 | 参考图拟合通用工具（轮廓/环提取 → 数据） | 半有（专用脚本） | P1 |
| T7 | per-stroke count / 渐变 / 图层显隐 / 缩放单笔（open-items） | 无 | P2 |
| T8 | 网格级验证：流形/法线/退化面/边界/密度统计 | 无 | P2 |
| T9 | 导出 QA 清单（单位/朝向/资源覆盖/ID/可加载） | 半有（encoder 校验 + 回读） | P2 |
| T10 | 资源表单一来源（修 10009012 缺失 + 未校准登记） | 三处不一致 | P0（小但真实） |
| T11 | 视角/演示工具（turntable/perfect-loop 式） | 有五视角截图 | P3（增强） |

### C. 技能层缺口（AI 代理使用缺陷 —— 基线/复盘实证）

| # | 缺陷 | 实证 | 修复 |
|---|---|---|---|
| S1 | **单一大技能 → 规则过载** | 577 行；基线「认真但缺经验」损耗、长任务上下文压缩后细节丢失 | 拆 chain-loadable 子技能：preflight / reference-fit / blockout / detail / verify / export / review；入口索引页 |
| S2 | **知识前置不足 → 探针轮高** | postmortem：ds ~14/32 轮、gpt ~22/42 轮花在探针服务端语义；drawing-rules v1 已记录但基线任务没给文档 | 任务模板强制引用/内嵌规则；「前置知识」成为模板字段 |
| S3 | **断言外不主动** | 基线 0/2 模型主动做桨距角/间隙/层次 | 把铁律转成可执行断言（rules-check），模板强制调用 |
| S4 | **索引漂移 / 手算端点 / 考古源码 / 自写校验** | 6 辐条+1 叶全量重画；r2/r3 手算差 0.04；r3/r4 考古 24 次零产出；自写 sweep.py 21 次零产出 | 稳定 id API（已有 gms.delete(id)/rotatem）+ 锚点 API（已强制）+ 文件白名单（已写）+「先跑管道」铁律（已写）→ 把已写的硬约束搬进子技能开头 |
| S5 | **命令/语义记忆负担** | 至少 40+ 命令/参数；opts 陷阱（rod 的 height=抬升、axis、render 无 line） | 命令表按「建模意图」分组；子技能只暴露当前阶段需要的子集 |
| S6 | **缺模型「技能自检」入口** | 无「我是否漏了规则」自测 | 建模脚本内置 `gms.rules-check()` + 视觉核验模板带「必查清单」 |

### D. 产出模型使用缺陷（生成模型在游戏/视觉使用中的问题）

| # | 缺陷 | 已有防线 | 未闭合项 |
|---|---|---|---|
| M1 | 悬空/穿模/缝隙 | link/floating/collides/verify + 视觉核验 | 视觉核验偶发截断；「数据核验未完成」不得判过（已硬门禁） |
| M2 | 多边形观感（环/柱棱面） | 48 段环 / count=60 / 10009012 单 mesh | 无 per-stroke count（外环 488 元件偏多） |
| M3 | 面板化不平滑（有机曲面） | 表面网格 + 满格共边 + 密度 D1→2 | 无细分/平滑法线；脚趾级细节无法表达（本轮用户截图） |
| M4 | 细节可读性差（细节叠细节） | 三层组织 + 「答不出就删」 | 无自动对比/近景评审模板 |
| M5 | 色彩层次粘连 | 分部件配色 | 单色机型（风扇）粘连；渐层不支持 |
| M6 | 参考还原度 | IoU 0.6366–0.6536（低模方格网上界≈0.65） | 无轮廓级拟合，精度上界已知；需「接受或升级」决策 |
| M7 | 未校准资源卷入 | input-format 标「未校准」 | 10009003/10009006/10009009 已用于 quad/tri/cone，应补校准板 |
| M8 | 资源表分散/缺项 | — | 10009012 未在三处资源表登记（文档漂移） |
| M9 | 持久化漂移（刷新解散） | 坑 #17 已修复 +「刷新+独立预览」剧本 | 仍靠人工执行；可做成自动化 |

---

## 7. 关键未知与决策门（必须先验证再投入）

1. **`.gil/.gia` 能否承载自定义网格？ —— 已确认（2026-09-07）：不能，走路线 B。**
   - 用户确认：容器只放官方基础元件；网格表达 = 最小面（10009003 平面 / 10009006 三棱锥压扁）+ 缩放/旋转组合 → 任意多边形面片 → 算法合成「顶点/面」→ 环放样（如 200 点脚环）出 3D 深度。
   - 据此已产出 [`docs/mesh-panel-system-design.md`](mesh-panel-system-design.md)：定义 L0 最小面 → L1 面板网格（顶点/面）→ L2 任意轮廓环放样三层；盘点发现 `scripts/parts/lib/ganyu-lib.js` 已有 `profileLoft`（含 toe/toes 趾瓣、趾鼓包、皱褶、微噪声、cap 封口）、`meshCheck`、`polyDomePatch` 等大部分能力 —— 需补的是**任意轮廓环输入、通用化与工具化、网格验证门禁、基元校准**。
2. **有机细节的目标量级**：脚趾/手指需要多少面？（Blender 截图是生产级网格，可能数万面；我们的 30000 笔画预算对应面板约 5k-10k 面）—— 需要用户给出目标模型的预算/精度档位。
3. **未校准资源语义**：quad/tri/cone 的「压缩」语义（三棱锥压扁=三角面）是实测推断还是已闭合？关系到有机网格是否敢用。
4. **优先级确认**：先补「结构技能化」（低成本、立即收益：技能拆分 + 铁律断言化 + 资源表统一），还是先攻「网格能力」（高成本、决定天花板）？本报告建议先做 Phase 0（基元校准）+ Phase 1 前半（面板网格 IR 最小集），两者并行。

---

## 8. 优化路线图（分阶段）

### Phase 0 —— 决策调查（1-2 轮，低成本高杠杆）
- [x] ~~格式可行性实验~~：用户 2026-09-07 确认 GIA/GIL **无自定义网格**（路线 B 定案），改由 [`docs/mesh-panel-system-design.md`](mesh-panel-system-design.md) 承接；剩余实验 = 10009003/10009006 校准板 + 三处资源表闭合（含 10009012）。
- [ ] 校准三件套：10009003 平面 / 10009006 三棱锥（压扁）/ 10009009 圆锥的最小校准板，写入 input-format 资源表。
- [ ] 资源表单一来源：以 `src/core/official-resources.ts` 为准，docs/README 引用生成；补 10009012。
- [ ] （可选）clone `CheshireJCat/blender` 等外部仓库，核对 30 Skill / 13 工具 / 26 Helper 清单，补充 L1 证据到本报告附录。

### Phase 1 —— 网格 IR + 最小建模原语（P0，决定天花板）
- [ ] `src/mesh/`：`Mesh { vertices, faces(quads/tris), loops?, normals, uv?, colorRegion? }` + 读写（`.mesh.json`）+ 确定性序列化。
- [ ] 首批 ops：`mirror`（左右对称）、`subdivide`（1→2 密度，面板化前用）、`loft/sweep`（环截面放样/扫掠管道——正好补 open-items 扫掠管道）、`extrude/lathe`（现有 lathe 思想迁移到 IR）。
- [ ] rasterizer：`mesh → items[]`（复用 quad/tri 法线公式、满格共边、密度/预算控制）；保持 `npm test` 全绿、黄金测试不回归。
- [ ] `gms.mesh(...)` 命令层 + `gms.meshSummary()`（面数/流形/密度/预算占用），中文错误。
- [ ] 技能抽 Helper：把 surface/offsetRings/ringsBetween/ribbon 等移入 `scripts/helpers/` + 单测。

### Phase 2 —— 高阶能力 + 生产门禁（P1）
- [ ] ops：loop-cut / bevel / solidify / smooth（法线平均）/ boolean（若 Phase 0 支持真网格则直接映射 Blender；否则仅 IR 内部布尔供面板化）。
- [ ] `verify()` 扩展为 production gate：结构（现有）+ 拓扑（流形/退化/法线）+ 预算（面/元件/笔画）+ 资源覆盖 + 贴地/单位/朝向。
- [ ] per-stroke count、颜色渐层、图层显隐、缩放单笔、多边形棱柱（open-items 全量清账）。
- [ ] 参考图管线通用化：`scripts/reference-fit.py <img> → rings/color-bands.json` + IoU 评估；替代人物专用脚本。
- [ ] 导出 QA 清单（`.gil/.gia` 前检查：ID 规则、resourceId 白名单、可回读、预览组装）。

### Phase 3 —— 技能重构（P1，与 1/2 并行推进，收益立现）
- [ ] 拆 `model-build-test/SKILL.md` 为链式子技能：`preflight`（环境/标定/持久化）/ `reference-fit` / `blockout` / `detail` / `verify`（数据+视觉）/ `export` / `review`；母技能只做路由。
- [ ] 画法铁律 G1-G17 逐条评估：可机械化 → `gms.rules-check()`；不可机械化 → 保留为文档并挂到对应子技能。
- [ ] 任务模板字段化：前置知识、文件白名单、断言模板、硬门禁（「数据核验未完成不得判过」）、预算。
- [ ] 模型自检：子技能内置「建模脚本骨架含 verify + rules-check + refresh/独立预览」模板。

### Phase 4 —— 有机角色专项（P2，用户截图目标）
- [ ] 用 IR + 面板化验证「脚部」：连续环线、五趾独立几何、足弓曲率、踝部过渡；对照用户截图生成目标参数表（趾数/趾长/拇趾/趾缝/足弓高/踝线）。
- [ ] 指标：mesh 面数/流形/接缝数 + 剪影 IoU + 五视角视觉核验 + 近景「无看不懂的凸起/线头」。
- [ ] 沉淀为仓库「有机部位建模模板」文档 + 子技能（脚/手/发/脸）。

### Phase 5 —— 对外技能化（P3，可选）
- [ ] `skills/` 目录内发布脱敏 SKILL.md（benchmark/METHODOLOGY 已铺垫）；对标 `dsh-blender` 提供「Skill + 工具 + Helper」三层分发形态。

---

## 9. 建议的下一步（本轮之后即可启动）

1. **我（主会话）先做 Phase 0-1 的骨架落地**：`src/mesh/` + 最小 ops + 单测 + 资源表统一修正（确定性、可回滚）。
2. **同时产出「技能拆分草案」**：把 577 行 Skill 的章节映射到子技能路由表（不删旧内容，新增索引）。
3. **等用户两件事**：① 基元校准（10009003/10009006 最小校准板，需游戏环境对照/截图）；② 目标模型预算档位（面数/精度档，如脚部 64 点×12 环 ≈1400 面 vs 200 点×12 环 ≈4400 面），用于设置 densify 默认值。

---

## 10. 证据与参考链接

外部技能（L1）：

- dsh-blender（主参考）：<https://github.com/CheshireJCat/blender>；入册：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/HEAD/README.zh.md>；设计文章：<https://blog.yeyupiaoling.cn/article/1787736835930>、<https://blog.yeyupiaoling.cn/article/1786977720000?lang=en>
- cc-blender-skill：<https://github.com/RobLe3/cc-blender-skill>；单技能页：<https://skill4agent.com/en/skill/roble3-cc-blender-skill/blender-pro-workflow>、<https://skill4agent.com/zh/skill/roble3-cc-blender-skill/blender-modeling>、<https://skill4agent.com/en/skill/roble3-cc-blender-skill/reference-to-3d>、<https://skill4agent.com/zh/skill/roble3-cc-blender-skill/reference-look-calibration>、<https://skill4agent.com/zh/skill/roble3-cc-blender-skill/blender-skill-harmonizer>；聚合：<https://www.awesomeskills.dev/en/skill/roble3-cc-blender-skill>
- blender-production-skills：<https://github.com/XliuXjianX/blender-production-skills>
- blender-skills（94 专业技能 + MCP）：<https://github.com/arjun988/blender-skills>；架构速览：<https://deepwiki.com/arjun988/blender-skills/2-core-architecture:-the-skill-system>
- blender-LPM-skill：<https://github.com/ozanzeng/blender-LPM-skill>
- design-os-3d-blender：<https://github.com/jangtrinh/design-os-3d-blender>
- blender-mcp：<https://github.com/sandraschi/blender-mcp>；autonomous-modeling：<https://skillsmp.com/zh/creators/sandraschi/blender-mcp/skills-autonomous-modeling>
- kevinbadi/blender-skills：<https://github.com/kevinbadi/blender-skills>
- NVIDIA 参考图重建示例：<https://skillsmp.com/zh/creators/nvidia-omniverse/omniverse-labs/projects-ov-blender-example-skills-reference-to-3d-reconstruction>
- ra100/blender-claude-plugin：<https://github.com/ra100/blender-claude-plugin>
- 行业综述：<https://snyk.io/de/articles/top-claude-skills-3d-modeling-game-dev-shader-programming/>

本仓库证据（L2）：

- 现状与边界：`README.md`、`PRD.md`、`docs/input-format.md`、`src/core/official-resources.ts`
- 生成建模：`docs/phase2-drawing-prd.md`、`docs/phase4-3d-prd.md`、`docs/phase5-collab-modeling-prd.md`
- 画法/方法：`docs/drawing-rules.md`、`docs/game-engine-knowledge/method-2026-09-05-high-precision-modeling.md`、`docs/game-engine-knowledge/method-2026-09-06-surface-mesh-framework.md`
- 技能：`/home/h/.pi/agent/skills/model-build-test/SKILL.md`（577 行）
- 缺口：`docs/open-items.md`（工具/流程缺口、工作协议、基线评估）
- 复盘/基线：`docs/agent-postmortem-2026-08-14-baseline-process.md`、`docs/agent-postmortem-2026-08.md`、`docs/baseline-models-2026-08-14.md`

## 11. 本仓库相关文件索引

| 文件 | 角色 |
|---|---|
| `web/index.html`（gms IIFE）、`web/draw/preview.js` | 画线建模 + 程序化命令层 + 3D 预览 |
| `src/draw/fitting.ts` / `generate.ts` / `types.ts` | 拟合管线 / 元件生成 / 数据模型 |
| `src/core/encoder.ts`、`src/core/official-resources.ts` | .gil 编码与资源表 |
| `src/gia/gia-encoder.ts`、`docs/gia-format.md` | .gia 编码与格式 |
| `scripts/extract-ganyu-profile.py`、`scripts/parts-tool.py`、`scripts/audit-model.py` | 测量/分部件/审计 |
| `scripts/inspect-draw-model.sh`、`scripts/capture-views.sh`、`scripts/run-gms-model.sh`、`scripts/run-gms-parts.sh` | 验证/截图/建模流水线 |
| `benchmark/connectivity-check.py`、`benchmark/METHODOLOGY.md`、`benchmark/protocols/` | 离线核验与方法/协议 |
| `/home/h/.pi/agent/skills/model-build-test/SKILL.md` | 建模主技能（需拆分） |

---

## 附录 A：clone 源码验证记录（2026-09-07，L2 证据）

> 验证方式：`git clone --depth 1` 主参考仓（`CheshireJCat/blender`）与上游仓（`RobLe3/cc-blender-skill`）到临时目录 `.research/`，逐文件核对后本轮已删除，不进入仓库。以下事实均直接读自克隆源码。

### A.1 dsh-blender 核对结果

- **30 个 Skill**：`skills/create-3d-model/SKILL.md`（总编排，`name: create-3d-model`）+ `skills/create-3d-model/references/modules/` 下 **29 个领域模块**，每个模块一个 `SKILL.md`（kebab-case，可由 DSH `skill` 工具按名加载，如 `blender-modeling`、`reference-to-3d`、`wireframe-to-3d`）+ 各自 `references/` 与 `scripts/`。
- **13 个工具**：`blender_status`、`blender_scene_info`、`blender_object_info`、`blender_import`、`blender_python`、`blender_preview`、`blender_render`、`blender_render_frames`、`blender_export`、`blender_validate_scene`、`blender_validate_export`、`blender_helper_catalog`、`blender_helper_run`（README 能力列表逐条核对）。
- **26 个 Helper**（`lib/helper-catalog.js`）：animation-contact-sheet、atlas-region-detector、atlas-region-mapper、skill-graph-audit、surface-texture-coverage-audit、mask-to-mesh-recipe、source-locked-skin-recipe、fit-repair-queue、landmark-fit-report、view-constraint-report、multiview-fit-report、orbit-layout-manifest、register-orthographic-views、quality-refinement-plan、release-readiness-check、sanitize-skill-contributions、reference-manifest-compiler、render-overlay-validator、look-fit-report、silhouette-validator、template-analyzer、seeded-part-masks、segment-source-parts、contour-correspondence-report、texture-transition-plan、wireframe-analyzer（按模块分组、带参数 schema、workspace 路径白名单、可单独开关 `enableHelpers`/`enableMaintenanceHelpers`）。
- **编排 6 阶段**（`create-3d-model/SKILL.md`）：Establish target → Inspect before mutating → Route and plan → Build from blockout to detail → Validate structure and appearance → Save and hand off。关键规则：先 `blender_status` 探底；只按需加载领域技能（"Do not read every module preemptively"）；保存版本化 checkpoint；输出以「可移植模型为交付物、`.blend` 为工程源」；结尾必须有 Artifacts 段。
- **`blender-modeling/SKILL.md` 关键内容**（与我们最相关的建模语义）：
  - 决策树：硬表面 → cube + Bevel + SubSurf；有机（角色/生物）→ Ico Sphere + **sculpt/voxel remesh**（雕刻是手势型，文本驱动不推荐）；建筑重复件 → Array；管道 → Curve + bevel_object；开孔 → Boolean DIFFERENCE；快速 blockout → 基础件堆叠。
  - **长/宽/细三轴**约定（剑/刀/板/瓶）；拼接去缝：接合处重叠 **5–15mm** + 圆润件 `shade_smooth()` + 同材质时可 Boolean Union 彻底去缝；收尖 = 顶端顶点捏合到单点 merge（不是简单缩放）。
- **`visual-validation.md` 门禁**：至少 blockout + final 两个视觉检查点；渲染后必须 `read_image` 实际看图（命令成功/文件非空 ≠ 视觉通过）；无图可查时结论只能是 `structurally verified, visually unverified`；纠错循环 = 一句话点名最大失配 → 分类 → 只改最小变量 → 同视角复现 → 前后对比；**禁止用相机/灯光掩盖几何/着色错误**；完成报告列出证据与「诚实」的剩余限制（"organic-detail limits" 等）。
- **安全/工程**：输入输出默认限制在会话 workspace、拒绝覆盖已有文件、每次调用独立 Blender 后台进程、临时脚本即用即清；`enablePython`/`registerSkill`/`registerModuleSkills` 可关闭；`blender_python` 具备本机 Python 权限（风险最高，默认开但文档警告只处理可信代码）。
- **上游关系**（`references/upstream.md`）：dsh-blender 以 RobLe3 `cc-blender-skill` v1.3.0（commit `11016c9a…`，2026-05-01，MIT）为蓝本，经中间 Codex 适配（产出导向的 `create-3d-model` 编排），再注册为 DSH 可加载技能 + 13 工具 + 26 Helper；未复制验证资产/evals/开发日志（非运行时能力）。

### A.2 cc-blender-skill 核对结果

- `plugin/skills/` 共 **30 个技能目录**（含 `text-to-blender` 编排）；`knowledge/` 按 **01-modeling / 02-curves-surfaces / 03-sculpting-retopo / 04-geometry-nodes / 05-materials-shading / 06-uv-texturing / 07-lighting / 08-cameras-composition / 09-animation / 10-rigging** 分域组织研究知识；`docs/` 含 BLENDER_BEST_PRACTICES、SKILL_FOUNDATION、SKILL_RESEARCH_SUMMARY、集成与 MCP 对齐指南。
- **诚实边界**（README "What doesn't work yet"）：① 设计质量 ≠ 构建正确性（审美是人驱动的）；② **人类脸/有机细节从基础件拼不出**，真实人脸需减法雕刻，逃生路径 = 导入外部资产 / 雕刻模式 / 委托艺术家；③ 数值验证通过 ≠ 渲染好看，用户是最终裁决者。`visual-validation` 里同样要报 "organic-detail limits"。
- 每个技能带 `evals/evals.json`（trigger-eval：声称 100% TP / 4% FP @ 200 条起始查询），并有失败态渲染样本（"no cherry-picking"）。

### A.3 验证后对报告结论的修正/强化

1. **P1 实证得到最高级确认**：30 个技能按域拆分、按需加载、母技能只做路由；这就是我们 577 行单 SKILL.md 的对标形态。
2. **P2 实证**：26 个 Helper 全部是「确定性脚本 + 参数 schema + 路径白名单」，通过 catalog/run 两个工具发现并执行；我们缺的正是这层「可发现、可验证、可单测的确定性函数库」。
3. **P3 实证**：reference-locked 栈 13 个模块（orthographic-registration → multiview-constraint-solver → contour-to-mesh → texture-driven-mesh-fitting → landmark-fit-repair → multiview-fit-loop → fit-repair-optimizer → reference-look-calibration）就是对我们「测量→建模→核验」的工业级扩充，且全部 fail-gated（须有 IoU/SSIM/bbox/landmark 数字才放行导出）。
4. **P5 实证**：`validate_scene`（导出前）+ `validate_export`（导出后干净进程回读）+ 双视觉检查点 + read_image 硬门禁 —— 我们目前有结构验证 + 视觉模型核验，但没有「导出后回读」的自动化门禁（.gil 有 golden 回读测试，属同类思想，可对齐成流水线步骤）。
5. **新关键证据（对用户截图问题的直接回答）**：连最成熟的 Blender 技能栈都明确声明「**人类脸/脚等有机细节不能用基础件拼装**，需要雕刻模式 / 导入外部 base mesh / 委托专门网格」。因此我们的路线决策必须二选一：**要么新增「导入外部网格 + 受控 base mesh」能力**（把 Blender 型网格作为输入或中间件），**要么明示本工具有机细节上限**（面板化近似 + 诚实边界），不能假装基础件能拼出截图里的脚部拓扑。
