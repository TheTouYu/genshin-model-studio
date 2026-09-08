# 魔方旋转提示圆环（cube-ring）

用于 3x3 魔方游戏的旋转方向提示环，两个变体：

| 文件 | 含义 |
|---|---|
| ring-cw.gil / ring-cw.gia / ring-cw.work.json / ring-cw.structure.json | 顺时针变体 |
| ring-ccw.gil / ring-ccw.gia / ring-ccw.work.json / ring-ccw.structure.json | 逆时针变体 |

## 模型规格
- 双轨圆环：外轨中心半径 0.231m、内轨中心半径 0.131m，轨径 0.016m（96 边形平滑分段）
- 4 个金色 V 形箭头位于双轨之间（半径带 0.170..0.206m），杆径 0.013m
- 颜色：轨 #4A90FF（蓝）、箭头 #FFC53D（金）
- 元件数：604（外轨 182 + 内轨 182 + 箭头 4×60）；全部位于局部 XY 平面（z=0），厚度 ≈ 0.016m
- 环心位于局部 (0, 0.24, 0)：环底贴局部 y=0（便于落地摆放/对齐）

## 朝向约定
模型局部坐标中圆环位于 XY 平面（法线 +Z）：
- **ring-cw**：从 +Z 侧俯视（视线沿 −Z），箭头指向**顺时针**
- **ring-ccw**：从 +Z 侧俯视，箭头指向**逆时针**

加载到魔方面上时，把环的法线（+Z）朝向魔方外（对着观察者）即可。游戏内可按需缩放（外径 ≈ 0.48m，1 单位魔方面约占 48%）。

## 文件说明
- `*.gil` / `*.gia`：千星沙箱静态模型格式（genshin-ts 直接可加载）
- `*.work.json`：Genshin Model Studio 画线作品（可在页面「导入」恢复后继续编辑）
- `*.structure.json`：structure 格式（schemaVersion 1，含逐元件颜色），可直接对照 assets 配置接入
