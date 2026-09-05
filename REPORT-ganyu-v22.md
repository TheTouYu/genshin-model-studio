# 甘雨 v22 — P0 形态级重建：曲发/角/手指（对症 <30 分根因）

## 按苛评自审（AUDIT）执行的 3 个重罪修复
| Ticket | 实现 | 特写核验（read_image） |
|---|---|---|
| **hair-waves** ✅ | 新增 `crPt/catcurvedRibbon`（Catmull-Rom 采样 ribbon）：刘海 12 束弧形+发梢外翘；侧发 12 束中段波浪+**末端内勾卷**；**螺旋呆毛**（14 点弧环） | `head-closeup.png`：额头弧形刘海、波浪侧发、顶端螺旋，不再直条 |
| **horns-fix** ✅ | 角重建为**后-外弯月**：黑外层 + 暗红内层 + 近基**灰带** + 暗色尖锥，控制点从头顶向后外弯曲 | `head-side-closeup.png`：角从头顶向后弯（不再是向上小弯）；front 可见黑灰轮廓 |
| **hands-fingers** ✅ | 露指手套：更小手套 + **4 指（肤色指尖盘）** + 拇指 + 蓝指节边 | `hand-closeup.png`：黑手套下 3-4 根肤色手指+圆指尖清晰可读 |

## 数据
- **6693 面**（v21 6623 → 曲发/角/指 +70）；IoU **0.6597**（含手指后剪影略升；历史 0.6460）
- 历史 `vmtos65zm0zim`；`delivery/ganyu-v22/`（work/items/视图 + head/hand 特写）
- 工具补充：`setTarget(x,y,z)`（preview 相机目标，供特写核验）——已同步 public

## 判断（用户 100 分制）
- 之前 <30 分三大硬伤（发直、角错、无手指）**已按原图形态重建并通过特写核对**；
- 剩余扣分点（P1/P2 tickets 已立）：**接缝间隙 / 金藤+徽章 / 躯干曲线**（P1），鼻/眉/唇/鞋型（P2）。

## 下一步
P1：`seams-close`（surface 1.0→1.03 微叠 + 关节盖）→ `gold-vines`（金藤枝+徽章）→ `body-curves`（腰-髋-胸拟合）；
每步按"特写对比图 read_image → 过关再下一个"。目标保持 active。
