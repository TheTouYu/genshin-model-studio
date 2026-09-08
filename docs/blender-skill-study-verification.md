# 外部 Blender 技能源码核对记录（dsh-blender 深读）

> 验证时间：2026-09-07（本会话）
> 方法：`git clone --depth 1` 到临时目录 `.research/`，逐文件核对，验证后删除临时克隆。
> 目的：把研究报告（`docs/blender-skill-study-report.md`）的外部技能描述从「README/聚合级」提升到「源码级」证据。

## 1. 核对对象与提交

| 仓库 | URL | 核对内容 |
|---|---|---|
| dsh-blender | https://github.com/CheshireJCat/blender | `README.zh-CN.md`、`skills/create-3d-model/`（SKILL + 29 模块）、`lib/helper-catalog.js`、`scripts/` |
| cc-blender-skill（上游） | https://github.com/RobLe3/cc-blender-skill | `README.md`、`plugin/skills/`（30 技能目录）、`knowledge/`（10 分域）、`docs/` |

## 2. 核对结论（与报告 §2/附录 A 一致）

### dsh-blender
- **30 Skill** = `skills/create-3d-model/SKILL.md`（总编排）+ `references/modules/` 下 **29 个领域模块**（每个模块 1 个 kebab-case `SKILL.md` + `references/` + `scripts/`）。领域模块目录数：29（`find .../modules -maxdepth 1 -type d | wc -l` = 29）。
- **13 个工具**：`blender_status`、`blender_scene_info`、`blender_object_info`、`blender_import`、`blender_python`、`blender_preview`、`blender_render`、`blender_render_frames`、`blender_export`、`blender_validate_scene`、`blender_validate_export`、`blender_helper_catalog`、`blender_helper_run`（README 能力列表逐条核对）。
- **26 个 Helper**（`lib/helper-catalog.js`，按模块分组、带参数 schema、workspace 路径白名单）：
  animation-contact-sheet、atlas-region-detector、atlas-region-mapper、skill-graph-audit、surface-texture-coverage-audit、mask-to-mesh-recipe、source-locked-skin-recipe、fit-repair-queue、landmark-fit-report、view-constraint-report、multiview-fit-report、orbit-layout-manifest、register-orthographic-views、quality-refinement-plan、release-readiness-check、sanitize-skill-contributions、reference-manifest-compiler、render-overlay-validator、look-fit-report、silhouette-validator、template-analyzer、seeded-part-masks、segment-source-parts、contour-correspondence-report、texture-transition-plan、wireframe-analyzer。
- **编排 6 阶段**（create-3d-model/SKILL.md）：Establish target → Inspect before mutating → Route and plan → Build from blockout to detail → Validate structure and appearance → Save and hand off。
- **blender-modeling 关键语义**：决策树（硬表面 cube+Bevel+SubSurf；有机 Ico Sphere+sculpt/voxel remesh；建筑 Array；管道 Curve+bevel_object；开孔 Boolean DIFFERENCE）；长/宽/细三轴；接缝去缝 = 5–15mm 重叠 + `shade_smooth()` + 同材质 Boolean Union；收尖 = 顶点捏合 merge。
- **视觉验证门禁**（visual-validation.md）：blockout + final 双检查点；渲染后必须 `read_image`；无图可查 → `structurally verified, visually unverified`；纠错循环（最大失配 → 最小变量 → 同视角 → 对比）；禁止用相机/灯光掩盖几何错误；完成报告列出 honest 限制（含 organic-detail limits）。
- **上游关系**（upstream.md）：dsh-blender 以 RobLe3 `cc-blender-skill` v1.3.0（commit `11016c9a…`，2026-05-01，MIT）为蓝本，经 Codex 中间适配后注册为 DSH 插件；未复制验证资产/evals/开发日志。

### cc-blender-skill（上游）
- `plugin/skills/` 共 **30 个技能目录**（含 `text-to-blender` 编排）；`knowledge/` 按 01-modeling … 10-rigging 分域；README 声明 6 类场景端到端验证（sword/bottle/chair/aviator/desk lamp/broadcaster avatar，Blender 5.1.1）。
- **诚实边界**：设计质量 ≠ 构建正确性；人类脸/有机细节从基础件拼不出（需雕刻/导入/委托）；数值验证通过 ≠ 渲染好看；用户是最终裁决者。

## 3. 清理确认

- 临时克隆目录 `.research/dsh-blender`、`.research/cc-blender-skill` 已删除（`rm -rf .research` 后 `git status` 无 `.research` 条目）。

## 4. 对报告的影响

报告 §2 表格、§3 模式提炼、附录 A 均已按源码事实更新；并据此新增关键结论：
**连最成熟的 Blender 技能栈都声明「人类脚/脸等有机细节不能用基础件拼装，需要雕刻/导入/专门网格」** —— 对应路线图 Phase 0 决策门：要么新增导入/受控 base mesh 能力，要么明示本工具有机细节上限。
