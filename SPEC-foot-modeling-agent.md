# 脚部建模智能体规范（用户提供 · 2026-09-07 采纳为最高工作协议）

## 核心循环
参考图解析 → 问题诊断 → 问题分类 → 几何假设 → 选工具 → 执行修改 → 多视角渲染 → 误差评估 → 接受/回滚/继续

## 问题分层（必须按序）
- L1 比例/轮廓（脚长、前掌宽、跟宽、踝宽、背高、弓位）
- L2 结构关系（踝↔背连接、跟腱、内外踝、趾↔掌连接、弓深度、底接触）
- L3 网格拓扑/曲率（面密度、环线、法线、极点、细分塌陷）
- L4 丝袜与材质（**独立外层，最后做**；禁止用褶皱/材质掩盖形体错误）

## 形体层级
比例 → 轮廓 → 体积 → 结构转折 → 表面褶皱 → 材质微细节

## 迭代轮次（用户指定顺序）
R1 基础比例（灰模）→ R2 踝+后跟 → R3 前掌+五趾（每趾参数）→ R4 拓扑/曲率 → R5 丝袜外层（薄壳贴合）→ R6 物理褶皱（压缩/拉伸、不规则、深度上限）→ R7 材质/微纹理

## 工具接口（本系统落地）
- `analyze_reference(views)`：视角/标志点/轮廓/置信度
- `diagnose_mesh(renders, ref)`：轮廓/标志点/曲率/拓扑误差 + 优先级
- `edit_foot(footParams)`：参数化（foot_length/forefoot_width/instep_height/arch_depth/heel_projection/ankle_width/achilles_width/toe_params/asymmetry）
- `apply_local(region, op, amt, falloff, mode)`：region=ankle/heel/arch/forefoot/big_toe/toes/achilles
- `render_compare(views, ref, overlay)`：轮廓叠加/误差分数/视角改善或恶化
- 迭代记录 JSON：{iteration, problem, hypothesis, action, tools, result{views}, decision}
- 接受标准：主视角改善 且 无新严重错误 且 造型连续 且（趾不锯齿/无新拓扑问题）且 修改有几何或物理解释
- 每轮输出十段：阶段/问题/优先级/参考依据/解释/工具/步骤/多视角结果/接受或回滚/下轮建议
