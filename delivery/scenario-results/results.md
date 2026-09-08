# 场景验证集结果

| 场景 | 状态 | route | 单元 | gate | qa | bytes | sha256 |
|---|---|---|---|---|---|---|---|
| contour-foot — 角色-脚（顶视+侧视轮廓放样，64 点 cap both） | ✅ | mesh | 576 | passed | ok | 688089 | 13b2581539d2
| basic-cylinder — 基础圆柱（24 边圆环放样，cap both） | ✅ | mesh | 48 | passed | ok | 50399 | 3ded0fce06dc
| cup — 水杯（mesh 等价=圆柱+盖；或经典画线 stroke 手动） | 🧑‍🔧 | mesh | - | - | - | - | -
| fan — 电风扇（mesh 近似=环+叶片多 mesh 拼装；或标手动） | ⏳ | mesh | - | - | - | - | -
| football — 足球（球体拼接，标手动） | ⏳ | mesh | - | - | - | - | -

## cup 说明
- 手动标定（未自动运行）

## fan 说明
- 待实现（依赖浏览器/经典 stroke 链路）

## football 说明
- 待实现（依赖浏览器/经典 stroke 链路）

