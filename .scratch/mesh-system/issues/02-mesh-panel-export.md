# 02 — 网格到最小单元导出器（.gil / .gia 通用化）

**What to build:** 任意「顶点 + 面索引 + 逐面颜色」网格可一键导出为游戏可加载的 .gil 与 .gia：确定性面板化（四边形→缩放面片、三角→三角面片、退化→盒体兜底，沿用已校准的旋转约定）、附带可读摘要（单元数 / 字节 / 预算），并替换当前一次性兜底导出。对圆柱等标准形状，导出结果与几何预期一致并可由单测锁定。

**Blocked by:** 01（网格元件语义校准与资源表闭合）

**Status:** done

**实现记录（2026-09-07）：**
- 新「确定性面板化 + 双出口」导出器落地：`src/mesh/panelize.ts`（纯 TS、可单测）+ `src/cli/export-mesh.ts`（CLI，风格对齐 gen-model）+ package.json `export-mesh` 脚本。
- 面板化规则（确定性，固定顺序遍历）：三角两两配对（共享边 + 法线一致（容差可配）+ 索引序优先）→ 10009003 平面（局部基旋转）；未配对三角 → 10009006 三棱锥压扁；退化面（面积 < 阈值）→ 10009001 盒（默认厚 1.5mm）或跳过+记录；颜色逐面透传。
- 旋转用显式局部基（widthDir × 法线补全右手基 → YXZ 欧拉），消除「法线+猜测上向量」的滚转歧义（quadB 参考实现）。
- 双出口：`.gil`（encodeStructure）+ `.gia`（encodeGia）均覆盖；输出 machine-readable summary（单元数 / 字节 / 预算）。
- 校准包生成器 `scripts/gen-calibration-package.mjs` 的 d1/d2 改走新面板化模块（与 CLI 同源）；重新生成 `delivery/calibration-mesh/`，保持 8 样例与 MANIFEST 兼容。
- 一次性兜底 `scripts/export-mesh-gia.js` 头部加「已弃用」注释，不再被新流程引用（未删除）。
- 单测 `tests/panelize.test.ts`（+11 用例，总计 113 全绿）；golden 快照 `tests/golden/cylinder-panelized.structure.json`。

- [x] 同一网格两次导出字节一致（确定性）；标准测试网格（如圆柱）的单元数 / 资源分布符合预期
- [x] .gil 与 .gia 两个出口均覆盖，输出附带机器可读摘要（单元数 / 字节 / 预算）
- [x] 摘要与面板化结果可通过验证门禁（与 03 对接）；已有的一次性兜底不再被使用
      → 兜底已弃用（export-mesh-gia.js 标注、不再被引用）；**与 03 门禁的对接已完成**：03 已消费 panelize 的
        `gateCheck`/`stats`（budget.used=面板化单元数；verify.ts 在 CLI 默认路径调用），CLI 默认为门禁开启、
        失败拒绝导出并写中文诊断，`--no-gate` 跳过并注明 SKIPPED_GATE，其全部验收项已达成。
