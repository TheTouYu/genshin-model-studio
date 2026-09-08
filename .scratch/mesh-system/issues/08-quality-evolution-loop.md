# 08 — 自进化闭环（缺陷分层 + 场景验证集）

**What to build:** 把失败产物自动分类到缺陷维度（比例 / 结构 / 拓扑 / 材质分层，吸收既有排查分层），输出依赖感知的修复队列与沉淀建议；同时维护场景验证集（水杯 / 风扇 / 足球 / 角色 / 脚等基准例 + 断言），后续任何改动跑回归，把「人工复盘」升级为「机制化闭环」。

**Blocked by:** 03（网格验证门禁）

**Status:** done（2026-09-06 完成）

- [x] 用一份历史失败报告跑出修复队列：按缺陷分层排序、给出最小修复变量集
- [x] 场景验证集至少 2 例可自动运行并输出 PASS/FAIL 与指标
- [x] 沉淀（新规则 / 新坑）有记录且可回溯到具体失败产物

---

## 完成情况（交付证据）

### 1. 缺陷分层分类器 `scripts/quality-plan.mjs`（核心 `src/qa/quality-plan.ts`，npm `quality-plan`）
- 输入：`--artifact <dir|file>`（导出目录或单个 qa.json/summary.json/mesh.json）+ `--id <id>`（可重复，每个 id 生成一份计划）+ `--map key=dimension`（人工覆盖分类）。
- 分类默认映射（注释 + 文档）：
  - gate/verify 失败（watertight/seams/normals/degenerate/skinny/areaRatio/网格几何）→ **L3 拓扑/曲率**；
  - budget/ID/resources/readback/artifacts（qa.* / summary.budget / gate.budget）→ **L2 结构关系/规格**；
  - colorBands/材质/色带相关 → **L4 材质**；
  - 剪影/bbox/IoU/比例/宽高比（silhouette/bounds 等）→ **L1 比例/轮廓**；
  - 无法映射 → **unclassified**（不硬猜，输出原样 + 建议人工）。
- 输出 `<id>.quality-plan.json`：`artifact{path+checksum+sources}`、`dimensions{L1..L4,unclassified}`、
  `repairQueue[{order,dimension,evidence(来源检查+数值),minimalFix(一句话+可调参数),verifyHint(重跑/断言)}]`、
  `sedimentation{suggestedRules[],trace{artifactHash,sources[]}}`；修复队列按 **L1→L2→L3→L4** 排序（依赖感知，先比例后拓扑后材质）。
- 沉淀：追加 `.scratch/mesh-system/log/evolution-log.md`（日期/来源 artifact/维度/建议规则/校验和）——可回溯到具体失败产物。

### 2. 场景验证集 `benchmark/scenarios/scenarios.json` + `scripts/run-scenarios.mjs`（npm `run-scenarios`）
- 声明 5 例：`contour-foot`（auto，`examples/contour-foot.json`）、`basic-cylinder`（auto，`inputs/cylinder.json`）、
  `cup`（manual，mesh 等价圆柱+盖或经典 stroke）、`fan`（pending，多 mesh 拼装）、`football`（pending，球体拼接）。
- 运行器：对 auto 例执行 contour-model，收集 `{status: pass|fail, metrics:{units,gate,qa,bytes,sha256}}`，
  断言不满足 → `fail` + 原因；manual/pending 如实标注（不与经典 stroke 冲突、不重复实现浏览器链路）。
- 结果写 `delivery/scenario-results/results.json + results.md`。

### 3. 演示 `delivery/quality-demo/`
- A) `fail-200points`（04 的 200 点 gate 失败：瘦长三角 675 / 18.75%）→ `qp-fail-200points.quality-plan.json`：
  L3=1（gate.skinny，minimalFix=提升 points/改进盖扇剖分），队列 [L3]。
- B) `fail-budget`（07 的 `--budget 10 --no-gate` QA 预算超限：需 576 单元/预算 10/超 566）→ `qp-fail-budget.quality-plan.json`：
  L2=1（summary.budget，minimalFix=降预算/简化形体），队列 [L2]。
- evolution-log 两条记录（A/B 各一条，含日期与 artifact 校验和）。

### 4. 测试 `tests/quality-plan.test.ts`（node:test，8 条）
- 合成 gate 失败 bundle（水密+瘦三角+预算超限+色带异常）→ L3/L3/L2/L4 正确、队列 L2→L3→L4（无 L1）、minimalFix 非空、trace 齐全；unclassified 不硬猜。
- 场景集：清单解析（5 例、字段齐全）、run-scenarios 对 auto 例可跑（最小 fixture，快速）、断言不满足输出 fail+原因、两次运行 sha256 一致。
- 全量 `npm test`：165 通过 / 165 总（既有 157 + 新增 8），全绿；既有用例未改动。

### 5. 如实说明
- 场景集 `cup/fan/football` 依赖经典画线 stroke 或浏览器链路，如实标 `manual`/`pending`，未冒充自动。
- evolution-log 条目含日期是产品要求；`<id>.quality-plan.json` 与场景结果 JSON 本身无时间戳/随机数（确定性）。
- 未改 `ganyu-materials-redux` 系列文件与无关 docs；未提交 git；临时产物已清理。
