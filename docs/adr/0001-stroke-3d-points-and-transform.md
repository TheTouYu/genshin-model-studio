# 笔画 3D 点集 + 显式变换（transform）

笔画此前是 2D 画布点集，3D 语义全靠服务端从坐标反推，导致补丁链不断累积：`angle`（从点坐标变化反推姿态）、`lift`（画布 y→高度失败后的补救）、主轴不变性（旋转副本 bbox 漂移后反推尺寸）、`parentGroupId`（从副本点反推源中心）。核验时也只能从几十个点反推整体形状。

决策：笔画数据升级为 3D 点集（`points: [x,y,z][]`，正视图 z=0），并增加整体变换属性 `transform`：
- `transform.position`：世界坐标偏移（米），叠加在点集 bbox 默认位置上（点集是位置的唯一真相来源）
- `transform.rotation`：最终欧拉角（度），存在时直接作为 item 旋转（覆盖 axis/angle 编码）

生成器优先读 transform；`angle`/`lift` 老路径保留过渡（无 transform 的旧笔画行为不变）。旧 2D 点数据解析时自动补 z=0。旋转副本（gms.rotate）不再只靠改写点坐标表达旋转，而是点坐标旋转（画布显示）+ `transform`（3D 语义）。

理由：消灭反推补丁链；核验与后续 UI 直接读写整体属性；为视图切换与选中笔画整体移动/旋转打基础。代价：一次数据模型迁移（解析兼容 + 测试迁移）。

实现约束：**凡新增笔画字段，必须同步补进前端 `applyWork()` 的恢复/导入白名单**（2026-08-13 事故：白名单重建静默剥离 lift/transform，刷新即丢字段且坏状态回写固化，详见 docs/agent-postmortem-2026-08-transform-sync.md）。
