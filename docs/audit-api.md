# 通用建模审计 API 设计（audit-model）

> 2026-08-14，用户方向：提供技术能力，允许大模型自己调用这些技术能力，达到快速可验的信息输出。

## 三层架构

```
① 基础层  audit(data) → element 表          —— 普适，任何模型通用（kind/center/r/size/z/rot组/内缘外缘）
② 派生层  大模型写小脚本聚合领域组件         —— 车轮=轮毂盘+轮胎环+辐条组；罩子=环+弧线组；转子=椭圆盘组+中心盘
③ 验证层  checks() 内置示例规则（可替换）    —— 同心/分层/间隙/覆盖/粗细梯度（通用语义，不绑定领域）
```

## 基础层：element 抽象

最小几何单位（gms.part 的 kind）：ring / arc / disc / el-disc / rod。
旋转组（gms.rotate 的 rot 元数据：中心/份数/第 k 份）自动合并为组元素。

| element 字段 | 说明 |
|---|---|
| kind | ring/arc/disc/el-disc/rod |
| center | 世界坐标 [x, y]（米；组元素 = 旋转中心） |
| z | 世界 z（米；arc 为平均 z，另有 zBase=弧线所在平面） |
| size | 杆径粗细（米） |
| r / rx / ry / thick / len / rise | 按 kind 有效：环半径/椭圆半轴/厚度/长度/凸起 |
| group/n/radius/members | 旋转组：份数/旋转半径/成员数（独立件 n=1） |
| pitch | el-disc 桨距角（rotation.x − 90） |

## 派生层：大模型写脚本（示例 scripts/derive-example.py）

```python
from audit_model import audit   # 或 importlib 加载
r = audit(work_json)
els = r["elements"]
# 派生"罩子"：同 z 的 ring + arc 旋转组（半径接近）→ 位置/份数/rise/铁丝粗细
# 派生"转子"：el-disc 组 + 同 z 中心盘 → 叶片数/半径/桨距/固定盘
```

任何新模型（汽车/水杯）走同一底座：先 audit 拿基础数据，再写 10-30 行派生脚本，
即可输出"车轮位置/车门/车窗"级别的自定义组件信息。

## 验证层：内置示例规则（checks）

| 规则 | 语义（通用） | 来源 |
|---|---|---|
| concentric | 旋转对称件中心一致性（众数基准） | 用户：前罩对齐/柱子插底座中心 |
| coplanar | z 分层总览（同类件 z 列表） | 用户：三环不在同一平面 |
| motion-gap | 运动件 vs 同平面环的间隙（ok/tangent/overlap） | 用户：叶片贴中心环 |
| hub-cover | 中心固定盘 vs 旋转件内缘（覆盖/同面） | 用户：固定盘带叶片转 |
| thickness | 同类件粗细梯度 | 用户：前后环应比中心环细 |
| rotation | 旋转组清单（份数/中心/半径/单件） | 用户：旋转份数/最小步骤 |
| wire | 独立弧线端点信息（起点/终点/粗/长） | 用户：电线属性 |

## 组件对关系查询（relation）

> 2026-08-15，用户方向："每个组件之间可能的关系，要么平行（沿某个轴平行），要么相切，
> 或者只是简单接触……或者是某个点的起点和终点，再或者是穿过去"——让大模型对任意两组件
> 选择性查询关系，一眼看出问题（如"后罩弧线终点和电机之间是不是接触"）。

```python
from audit_model import relation
r = relation(els[i], els[j])   # 返回 dict，字段见下
```

CLI：`python3 scripts/audit-model.py work.json --rel <i> <j>`（i/j 为 elements 列表下标）

| 字段 | 语义 |
|---|---|
| center_dist | 组件中心水平距（米） |
| z_gap / coplanar | 轴向间距 / 是否同平面（<10mm） |
| axis | 轴向关系 same/different（disc/el-disc/plate=竖直轴，其余=水平） |
| radial | 径向关系：**分离(间隙)/相切/重叠(深度)**（容差 ±5mm） |
| intersect3d | 是否空间相交（穿模）：径向接触 + z 区间重叠 |
| z_overlap | z 区间重叠深度 |
| endpoint | arc/rod/curve 端点 vs 对方中心最近距离（of=start/end） |

体积模型（简化）：ring/disc/el-disc = 实心圆柱（半径 r+size/thick、z 区间）；
arc/rod/curve = 线段（size 为半径）。**arc 的径向范围 = [min(两端点旋转半径),
max(两端点旋转半径)]**（弧是部分圆环；端点坐标→相对旋转中心的距离），
不是"起点半径 + 弦长"——弦长 len 只用于长度信息。

典型判定（风扇 v10 实测）：
- 后罩组 vs 电机：相切（后弧起点 0.051 ≈ 电机 0.05，间隙 1mm）、不穿模
- 后罩组 vs 固定盘：分离 16mm（正确：后罩让出叶片位置）
- 前罩组 vs 前脸圆：起点贴中心（endpoint 1mm）、不穿模（设计上起点贴盘是正常的）
- 叶片组 vs 后罩组：径向重叠但 z 分离 → 不穿模（旋转时由 motion-gap 保证间隙）

## CLI

```bash
python3 scripts/audit-model.py work.json            # 全部（elements + checks）
python3 scripts/audit-model.py work.json --elements # 仅基础数据
python3 scripts/audit-model.py work.json --checks   # 仅示例检查
python3 scripts/audit-model.py work.json --rel 11 13  # 组件对关系查询
```