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

## CLI

```bash
python3 scripts/audit-model.py work.json            # 全部（elements + checks）
python3 scripts/audit-model.py work.json --elements # 仅基础数据
python3 scripts/audit-model.py work.json --checks   # 仅示例检查
```