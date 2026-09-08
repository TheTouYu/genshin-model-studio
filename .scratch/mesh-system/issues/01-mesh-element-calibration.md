# 01 — 网格元件语义校准与资源表闭合

**What to build:** 让网格体系建立在可信语义上：确认网格元件（10009019）在游戏侧的几何承载能力与挂接方式，并校准最小面基元（10009003 平面、10009006 三棱锥压扁三角）的朝向、双面性与尺寸映射；用最小校准板产出可直接导入游戏验证的样例与对照记录；把散落的多处资源表收敛为单一来源（补齐 10009012 与 10009019），使后续一切网格化导出都以这份校准为信任前提。

**Blocked by:** None — can start immediately.

**Status:** in-progress（自动化部分完成；游戏内对照截图待用户回传）

- [ ] 校准板样例（最小面/三角面/网格元件各若干）可打包导入游戏，并回传至少一组游戏内对照截图
  > 自动化部分已完成：`npm run gen-calibration` 已在 `delivery/calibration-mesh/` 生成最小面/三角面/网格元件/面板化最小单元样例包（input + structure.json + .gil/.gia 候选 + summary + MANIFEST）。
  > 待用户：导入游戏/编辑器（或交给 genshin-ts 适配器）并回传至少一组游戏内对照截图，按 `docs/calibration-mesh-elements.md` §4 模板记录。
- [x] 网格元件的语义结论（几何是否由数据承载、如何挂接、单位与旋转约定）以「已闭合 / 未校准」明确登记
  > 已登记：10009019「网格」在 `src/core/resource-meta.ts` 与 `docs/input-format.md` 标为「未校准」（几何由 vertices/faces/colors 承载、position/rotation 忽略、游戏侧是否呈现几何需确认）；10009012「开口薄壁圆柱」同为「未校准」。未校准项未写入主干文档当作已闭合。
- [x] 资源表改为单一来源生成：10009003 / 10009006 / 10009012 / 10009019 在文档与代码中的登记不再手抄冲突
  > 已收敛：权威 = `src/core/official-resources.ts`（名称）+ `src/core/resource-meta.ts`（语义/状态）；`scripts/gen-resource-table.mjs` 校验/同步 `docs/input-format.md` 与 `README.md`；`src/cli/gen-model.ts --list-resources` 也改为从权威取；`tests/resource-table.test.ts` 守住一致性（防再漂移）。
