# 07 — 导出 QA 清单与多视角演示

**What to build:** 每次导出自动过 QA 清单（ID 规则 / 资源覆盖 / 单元数预算 / 可回读），并为每个模型自动生成六视角序列合成 contact sheet；任一 FAIL 给出明确原因；模型演示与验收画面不再依赖手工截图。

**Blocked by:** 02（网格到最小单元导出器）+ 03（网格验证门禁）

**Status:** done（2026-09-06 完成；环境自带 .venv + tools/gia 解析器，.gia 回读可用，非「未覆盖」）

- [x] 一个模型跑完导出报告 + contact sheet 全绿，报告机器可读
- [x] 人为制造超预算 / 资源缺覆盖 → FAIL 且原因可读、有定位
- [x] 六视角序列与接触表在模型变更后可一键重跑

---

## 完成情况（交付证据）

### 1. 导出 QA 审计 `scripts/export-qa.mjs`（核心 `src/qa/export-qa.ts`，`npm run export-qa`）
- 输入：导出目录（含 `.structure.json/.summary.json/.gil/.gia`）或其中任一文件；输出 `<base>.qa.json`（机器可读）+ `<base>.qa.md`（人读，无时间戳）。
- 五项检查：
  - **ID 规则**：prefabId ≥ 1077936129；prefabId 命中骨架占位 ID（`1077936129` 为定义骨架自然 ID，恒等替换不判失败，其余命中判失败）；aux ID（definition+instance）唯一 / 不等于 prefabId / 不命中骨架占位。
  - **资源覆盖**：每个 item.resourceId ∈ 官方资源表；`status='未校准'` 单独列出（候选/待校准，不判失败）；未知基元判失败。
  - **单元预算**：summary.budget{requested/used/exceeded} 自洽 + 与 gate.state 一致性（超限且 gate=passed 判失败）。
  - **可回读**：.gil 走 `src/core/readback`（readBackAssemblies/closuresummary）；.gia 走 `tools/gia/gia_parser.py`（本环境可用 → readback=pass；不可用 → 标「未覆盖」）。
  - **产物**：存在性/非空/一致性（structure.items 数 = summary.budget.used；mesh 面数 = summary.model.mesh.faces）。
- 结果形状 `{ok, checks:{id,resources,budget,readback,artifacts}, failures[], notes[]}`；任一 FAIL ⇒ `ok=false`、退出码 1（**产物保留**）。

### 2. 多视角 contact sheet `scripts/render-contact-sheet.py`（PIL + numpy，确定性）
- 输入 mesh.json（或读 structure.json 的 10009019 mesh item / 导出目录的 `.mesh.json`）。
- 正交投影：iso/front/side/top/back + iso-45-a/b/c（3 个 45° 补充）共 **8 格**；flat 按面填色（颜色带或默认灰）+ painter's algorithm 深度排序；无时间戳、无随机。
- 与既有 `--views` 的 view-*.svg 共存（SVG 保留细节证据；contact sheet 供快速验收）。

### 3. CLI 接入
- `export-mesh` / `contour-model` 增加 `--qa`（默认开启）、`--no-qa`（关闭）；导出成功后自动写 qa.json/qa.md；QA FAIL 时打印「产物已保留」+ 非零退出码。`--no-gate` 语义不变（QA 独立於 gate）。
- `package.json` 新增 `export-qa`、`render-contact-sheet`。

### 4. 测试 `tests/export-qa.test.ts`（node:test，6 条）
- 好样例（水密圆柱 → panelize → encode → 写导出目录）→ QA ok、字段齐全、readback=pass。
- 人为制造：prefabId 低于区间、prefabId 命中骨架占位 → ID FAIL（中文含字段值）。
- 预算超限 + gate.state=passed 不一致 → 单元预算 FAIL（含 requested/used/超出数/状态不一致）。
- 资源缺覆盖（resourceId=10009099）→ 资源覆盖 FAIL。
- contact sheet：合成 fixture → PNG 非空、尺寸/格数确定（4×2=8 格）、两次运行 sha256 一致。
- 全量 `npm test`：**157 通过 / 157 总（既有 151 + 新增 6）**，全绿；既有用例未改动。

### 5. 演示 `delivery/export-qa-demo/`
- 重新生成 64 点脚型：`contour-model examples/contour-foot.json --out-dir delivery/export-qa-demo --name contour-foot --views`。
- 机器摘要：`ok=true`；id=pass、resources=pass（1 类未校准：平面(10009003)×576）、budget=pass（requested=null/used=576/exceeded=false/gate=passed）、readback=pass（.gil 576 items prefabId=1077936129 closureComplete=true；.gia 576 items idRange=[1073741825,1073742400] resources=[10009003] structureId=1077936129）、artifacts=pass（items=576 units=576 meshFaces=1152），failures=[ ]。
- 产物：`contour-foot.qa.json`（2429 bytes）+ `contour-foot.qa.md` + `contour-foot.contact.png`（1248×710，8 views，107472 bytes）+ 既有 view-*.svg 五张。

### 6. 如实说明
- 本环境 `.venv`（PIL 12.3.0/numpy 2.5.2）+ `tools/gia/gia_parser.py`（仅 stdlib）均可用，故 `.gia` 回读为 **pass（非「未覆盖」）**；报告 headless 无 time-step 依赖。
- 未改 `ganyu-materials-redux` 系列文件与无关 docs；未提交 git；产物 UTF-8、无时间戳。
