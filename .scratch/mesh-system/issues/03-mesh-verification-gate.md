# 03 — 网格验证门禁

**What to build:** 导出前强制门禁：水密性、法线朝外、接缝/顶点焊接、退化面、瘦长三角、面积比、面数与单元预算；任何一项失败给出中文原因（含定位：环/段/面区）并拒绝导出。当前「报告型」拓扑检查升级为「门禁型」，并与导出流水线串成一条默认路径——做好检查才允许进入导出。

**Blocked by:** 02（网格到最小单元导出器）

**Status:** done

- [x] 三个故意损坏样例（裂缝 / 反向法线 / 退化面）能被分别抓到，通过样例可完整走完导出
- [x] 门禁输出结构化（数量 + 定位 + 阈值），报错为可读中文
- [x] 预算超限时在导出前拦截，并在摘要中给出消耗明细

**实现记录（2026-09-07）：**
- `src/mesh/verify.ts` 落地纯 TS 门禁：`verifyMesh(mesh, opts)`（单网格）+ `verifyMeshExport(meshes, units, requested)`（批量合并 + 全局 budget）；确定性、可单测、不改输入。
- 规则与阈值：watertight（按索引逐边统计，恰 2 次=闭合，1 次=开边，>2 次=非流形）；seams/weld（weldTolerance 默认 2e-4 近邻聚类）；normals outward（闭网格「面法线·(面心−质心)<0」，仅闭网格强制）；degenerate（minArea 默认 1e-9）；skinny（minE/maxE<0.08，占比 ≤5% 可配）；areaRatio（p95/p5 ≤20 可配）；budget（单元数 vs `--budget`，超限即 exceeded）。
- 对接 02 seam：门禁先跑 panelize 拿 `stats`，`budget.used` 即面板化单元数；`verifyMeshExport` 以逐网格 `stats.budget.used` 合计与 `--budget` 比较，超限在导出前拦截。
- 接入导出流水线：`src/cli/export-mesh.ts` 默认开启门禁（`--no-gate` 跳过并注明 SKIPPED_GATE）；失败拒绝产出 .gil/.gia/.structure.json，仍写 .summary.json 诊断并报中文错误（含定位：顶点坐标/面索引）。
- 单测 `tests/verify.test.ts`（+12 用例，全套 125 全绿）；CLI smoke 覆盖坏网格拒绝 / 好网格导出 / 预算超限拦截 / --no-gate 跳过四路径。
