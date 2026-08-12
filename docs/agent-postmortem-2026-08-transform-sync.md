# 3D 变换迁移与同步链路复盘（2026-08-13）

范围：笔画 3D 点集 + transform 迁移，到"AI 改模型 → 用户刷新不丢"的同步闭环。用户已确认：三叶对称、电机层次、后罩、独立预览、调试面板均修复。

## 根因链（按发现顺序）

1. **applyWork 白名单重建剥离增量字段**（最重）：
   `applyWork()`（刷新恢复/导入路径）用 `.map()` 重建笔画，只保留 `id/points/color/render/height/axis`——
   **`lift` 和 `transform` 被静默剥离**。链条：AI 重画 → 保存正确数据 → 用户刷新 → 恢复路径丢字段
   → 组件贴地重合 → 恢复后自动 regenerate 又把坏状态写回 localStorage → **永久固化**。
   这也解释了最初"上色后字段丢失"现象：丢失发生在"刷新"那一刻，上色只是最后一次触发了保存。
2. **浏览器启发式缓存**：本地服务器响应无 `Cache-Control`，Edge 对页面做启发式缓存 → 刷新可能拿到
   旧版页面代码，加剧"刷新看到旧状态"。
3. **批量 edit 原子失败**：一次批量编辑中一条 oldText 不唯一 → **整批不应用**且无报错提示 →
   normalizeOpts 的 transform 支持漏发（页面报"未知字段 transform"才发现）。
4. **draw-fan.js 索引漂移**：插入后罩后 `gms.rotate(6,…)` 未改为 `rotate(7,…)` → 复制出三片后罩。
5. **dist/ 被 gitignore**：手写的 `dist/web/server.js`（含 no-cache 修复）不入库；且 `npm run build`
   （tsc）会覆盖 dist 下手写文件 → 修复随构建丢失。

## 铁律（沉淀，下轮直接用）

| # | 规则 |
|---|---|
| 1 | **新增笔画字段必须同步补进 `applyWork()` 白名单**（含合法值校验）。恢复/导入路径是字段丢失的高发点，改数据模型时先查它。 |
| 2 | 本地服务器响应一律 `no-cache`（开发期页面/脚本都要最新）。 |
| 3 | 手写服务器脚本放 `scripts/` 入库（dist 被 ignore 且 tsc 会覆盖 dist 手写文件）；`npm run web` 走 `scripts/web-server.js`。 |
| 4 | 批量 edit 后**必须 grep 验证每个改动点**（原子失败无提示）。 |
| 5 | 改 draw-fan.js 笔画顺序后，**逐个核对 `gms.rotate` 的索引**（插入/删除笔画会漂移）。 |

## 本轮修复清单（全部验证通过）

- `applyWork` 保留 `lift` + `transform`（含合法值校验）；`beforeunload` 同步落盘（消灭 AI 改完→用户立即刷新的窗口期）
- 服务器 `Cache-Control: no-cache, no-store, must-revalidate`
- `makeRotationCopies` 闭式 `[90-θ,90,90]` → `[90+θ,90,90]`（画布转 θ → 世界转 -θ，长轴 = 位置方向，三叶对称辐射）
- 电机：`axis='side'` → `'front'`（盘面朝前后 Z）+ 加大 r=14 + 柱体沿 Z 0.08 + `transform.position z=-0.045`（与叶片解共面）
- 新增后罩：r=20 圆盘，z=-0.10
- `normalizeOpts`/`gmsProps`/`addStrokeWithOpts` 支持 `transform` 透传
- 独立预览页 `preview-demo.html`：假数据 → 当前作品独立预览（读同一 localStorage）；主页加"⛶ 独立预览"按钮
- 调试面板：画布下方"🔍 笔画调试信息"（每笔 render/axis/height/lift/rot/pos/点数，实时刷新）

## 验证数据（API 生成结果，用户已确认）

- 叶片三片：pos 0°=右 0.0438、240°=(-0.0219,0.3777)、120°=(-0.0219,0.4535)，rot 与位置方向一致，z=0
- 电机柱体：z=-0.045（[0.088,0.08,0.088]）；后罩：z=-0.10（[0.125,0.015,0.125]）
- 同步链路：重画 → localStorage 字段完整 → 刷新 → 内存与保存一致（模拟验证 ✅）
- 测试 58/58；web/public sha256 一致

## 十一期补充：层级组 + 物理冲突检测 + 画布平移（2026-08-13 晚）

新增：笔画 `group`（旋转单元）；服务端 `sweepWarnings`（旋转组扫掠盘 vs 静止件 AABB 冲突检测）；层级面板（设组/移出/整组移出/警告框）；`gms.group/ungroup`；右键拖动画布平移 + 双击复位；rod 支持 transform.position；旋转副本透传组与 z 偏移。

验证：62/62 测试；正/负向警告（辐条回 z=0 精确报"静止笔画 #1"，移回 -0.08 后无警告）；分组刷新持久化；合成事件验证 pan（本环境 CDP Input 到不了页面，真机右键待用户确认）。

新铁律追加：

| # | 规则 |
|---|---|
| 6 | **命令层新字段必须同时改三处**：`normalizeOpts`（校验）、`addStrokeWithOpts` + `gmsProps`（应用）、`applyWork`（恢复白名单）——本轮 group 漏了 addStrokeWithOpts，笔画命令层不生效。 |
| 7 | **改服务端代码后必须重启服务进程**（node ESM 启动时加载 dist 模块，build 后进程仍是旧代码）——本轮 rod z 偏移"不生效"是进程未重启。 |
| 8 | 浏览器自动化里 **CDP Input.dispatchMouseEvent 可能到不了页面**（无头环境），用合成 PointerEvent 验证事件逻辑。 |
| 9 | 测试里 **rod 的 z 半轴 = min(scale)/2 = size/2**，z 偏移量必须大于杆半径否则检测器认为仍重叠（物理上也确实重叠）。 |

冲突检测模型（sweepWarnings）：组内"水平半径最大" item 为扫掠盘（圆心 = 组位置平均，半径 = 水平距离 + 水平半轴，厚度 = min(scale)/2 沿 Z）；静止件 AABB（position ± scale/2）z 重叠 + 水平与圆相交 → 警告。近似提示器（忽略 rotation 对 AABB 的影响），只抓明显共面/穿插。
