# 09 — AGENTS.md 铁律对齐（导出根缩放与面板化约定统一）

**What to build:** 让 mesh-system 全部出口与 AGENTS.md 铁律一致：① GIA 根缩放统一为 `ROOT_SCALE=0.1` + 「位置与缩放同乘 1/root」双向补偿（`contour-model` 目前残留旧约定 0.0002 且无补偿，比 `export-mesh` 小 500 倍，必须改为共享同一实现）；② 曲面面板化统一 `rotationMode:'normal', normalTolerance:0.2`（`export-mesh` 已合规，检查 `contour-model` 与文档/技能一致性）；③ 旧导出器 `scripts/export-mesh-gia.js` 清理（AGENTS.md 未闭合项，现行管线的重复实现）；④ 相关技能/文档补齐铁律速览（GB 顺序、网页预览=游戏 gate、quads/tris 检查）。

**Blocked by:** 02（网格到最小单元导出器）+ 04（任意轮廓环放样）+ 07（导出 QA）

**Status:** done

- [x] `.gia` 双出口（export-mesh 与 contour-model）共用同一 GIA 构造实现：rootTransform.scale=0.1、item position/scale 均 ÷0.1 补偿；同网格经两 CLI 输出 .gia 的 root 语义与补偿因子一致（字节级一致或字段级等价）
- [x] 曲面面板化在两条 CLI 均使用 `rotationMode:'normal'` + `normalTolerance:0.2`（AGENTS 铁律 #2）；有测试锁定该默认
- [x] 旧导出器 `scripts/export-mesh-gia.js` 删除；AGENTS.md / docs/open-items.md / retrospective 中「待清理」条目更新为已完成
- [x] 技能与文档：`gms-modeling-export/preflight`、`docs/mesh-panel-system-design.md` 补/改 ROOT_SCALE 补偿与面板化约定、AGENTS 关键铁律速览；`npm test` 全绿（165 + 新增），受影响的演示产物（contour-demo / export-qa-demo / scenario-results）重新生成且结果自洽

## 实现记录

### 共享 GIA 构造 + 面板化默认（代码）
- 新增 `src/cli/gia-common.ts`：`ROOT_SCALE=0.1`、`GAME_VERSION`、`UNIT_ID`、`TEMPLATE_PREFAB_ID`、`MESH_RESOURCE_ID`、`makeGiaInput(name, items)`。
  - `makeGiaInput`：`rootTransform.scale=[0.1,0.1,0.1]`，item `position/scale` 均 `÷ROOT_SCALE`（铁律 #1 双向补偿）。
- `src/mesh/panelize.ts` 新增 `panelizeMesh(mesh, opts?)` = `panelize(mesh, { rotationMode:'normal', normalTolerance:0.2, ...opts })`（铁律 #2）。
- `src/cli/export-mesh.ts` / `src/cli/contour-model.ts` 均 import `makeGiaInput`/`MESH_RESOURCE_ID` 与 `panelizeMesh`；删除各自本地的 `makeGiaInput` 与 `ROOT_SCALE`/常量重复定义（contour-model 旧 `ROOT_SCALE=0.0002` + 无 ÷补偿已移除）。
- 结果：两条 CLI 走到同一 `makeGiaInput` + `panelizeMesh`，root 语义与面板化默认完全一致。

### root/补偿统一证据（两 CLI 抽查）
- `delivery/export-qa-demo/contour-foot.gia` 经 `tools/gia/gia_parser.py` 回读：
  - `rootTransform.scale = [0.10000000149, 0.10000000149, 0.10000000149]`（float32 0.1）。
  - `items[0].transform.position = [0.507113993, 0.050000001, 0.045874633]` = structure `items[0].position / 0.1`（结构原值 `[0.050711400, 0.005, 0.004587463]`）。
  - `items[0].transform.scale = [0.10000000149, 0.050000001, 0.091835201]` = structure `items[0].scale / 0.1`（结构原值 `[0.01, 0.005, 0.009183520]`）。
- 同网格经两 CLI 输出 `.gia` 字节级一致：`contour-model` 与 `export-mesh` 对同一 mesh（`examples/contour-foot.json` → `align.mesh.json`）产出 `114431` 字节，`cmp` 判定 `BYTE_IDENTICAL`（测试 `tests/agents-align.test.ts` ② 固化）。demo 侧 `delivery/contour-demo/contour-foot.gia` 与 `delivery/export-qa-demo/contour-foot.gia` 同样字节一致（`114452` 字节）。

### 面板化统一证据
- `panelizeMesh` 出现于：`src/mesh/panelize.ts`（定义）、`src/cli/export-mesh.ts`、`src/cli/contour-model.ts`（调用）。`rotationMode:'normal'` + `normalTolerance:0.2` 已内置，两条 CLI 不再各自传参（避免漂移）。
- 测试 `tests/agents-align.test.ts` ③：CLI `.gia` == `panelizeMesh` 路径（`encodeGia(makeGiaInput(...))`），且 != 旧默认 `panelize(mesh)`（basis+0.999）路径。
- 测试 ⑤（防尖刺回归）：coarse UV-sphere（法线变化大）在 `normalTolerance:0.2` 下 `quads 24 / tris 0`（quads 占比 1.000），`normalTolerance:0.999` 下 `quads 16 / tris 16`（占比 0.500）——0.2 下 quads 占比显著高于 0.999。

### 清理与文档
- 删除 `scripts/export-mesh-gia.js`（旧导出器）。
- `AGENTS.md` 未闭合清单移除「旧导出器清理」项（保留 500×root 公式闭合项与趾部算法项）。
- `docs/open-items.md` O-2026-09-06-02 → 「已闭合：`scripts/export-mesh-gia.js` 已删除，现行管线唯一」。
- `docs/game-engine-knowledge/retrospective-2026-09-06-ganyu-ankle-gia-export.md` 第 51 行 → 「已完成清理：旧导出器已删除，现行管线唯一」。
- `docs/mesh-panel-system-design.md` §2.2（L0 仿射变换规则）补「GIA 根缩放（铁律 #1）」说明。
- `.dsh/skills/gms-modeling-export/SKILL.md`、`.dsh/skills/gms-modeling-preflight/SKILL.md` 补「AGENTS 铁律速览」小节（root=0.1 双向补偿 / 曲面 0.2+normal / 10009003 平面 / 网页预览+quads-tris / 先工具后算法 / 粗骨架→算法升面）。

### 演示再生成（.gia root 语义变化 → 字节变化，属预期）
- `delivery/contour-demo/`：62 点 cap both（`--views --no-qa`）`contour-foot.gia` 117172 → **114452** 字节（gate=passed）；`contour-foot-200/`（`--points 200 --no-gate --no-qa --views`）重生成。
- `delivery/export-qa-demo/`：`contour-foot.gia` 117172 → **114452** 字节；`qa=ok`；contact sheet 重生成（1248×710，8 views）。
- `delivery/scenario-results/`：`contour-foot:pass` / `basic-cylinder:pass` / `cup:manual` / `fan:pending` / `football:pending`（auto 例全绿，gate=passed、qa=ok）。

### 测试
- `npm test`：**170 通过 / 0 失败**（既有 165 未动 + 新增 `tests/agents-align.test.ts` 5 条）。

### 备注 / 未完成项
- 无字节级一致障碍（两 CLI 对同一结构/环输入的 `.gia` 字节级一致达成，无需退化为字段级等价）。
- 保留未闭合（不属本票据）：500×root 公式的格式文档闭合项（AGENTS 未闭合清单保留）；趾部算法（下一任务）。
