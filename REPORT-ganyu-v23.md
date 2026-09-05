# 甘雨 v23 — P1：接缝 / 金藤 / 躯体曲线（特写核验）

## P1 修复
| Ticket | 实现 | 核验 |
|---|---|---|
| **seams-close** ✅ | 全部部位 `surface` 面片 **1.0→1.02 微叠**；新增**关节盖**：袜-鞋（disc r0.031 白袜色）、颈-头（disc r0.048 肤色） | 胸/腰特写无可见缝 |
| **gold-vines** ✅ | `vineFrom()` 金藤链（rod 0.0026 金）：**胸前斜襟金藤**（左肩→右髋 7 段波浪）、右侧腰/背 2 组；**双徽章**：左胸盾徽（白边蓝芯）+ 右胸蓝三棱徽 | `chest-closeup.png`：金藤枝+盾徽清晰 |
| **body-curves** ✅ | `ringAt2` 改 **smoothstep 插值**（cos 平滑）→ 腰-髋-胸连续曲线（躯干/腿）；配合已密环 | 胸-腰段可见收腰曲线 |

## 数据
- **6710 面**；IoU **0.6597**（与 v22 相当，P1 为观感/纹样修复）；历史 `vmtos9bmrvmsq`。
- 交付：`delivery/ganyu-v23/`（work/items/视图 + chest 特写）；`delivery_check` PASS。

## tickets 状态
P0 3/3 done；**P1 3/3 done**；剩 P2：`face-refine`（鼻/眉/唇）、`shoe-gold`（鞋型/交叉鞋带/金藤印刷）。

## 下一步
P2：face-refine（对照 02：鼻小直、眉细弯、唇淡粉+眼睑）→ shoe-gold（对照 08：交叉鞋带+侧金藤+鞋头/跟形）→
特写核验后：全视角并排对比 + 更新 REPORT + 技能 §10.5 基准刷新。目标保持 active。
