# 笔记本电脑 v2 独立视觉复核（精简版：14 张图）

只读核验，不重跑脚本、不改文件。逐张 `read` 后输出 JSON。

## 六视角（交付主图）
- /home/h/genshin-model-studio/exports/laptop-v2/views/view-iso.png
- /home/h/genshin-model-studio/exports/laptop-v2/views/view-top.png
- /home/h/genshin-model-studio/exports/laptop-v2/views/view-front.png
- /home/h/genshin-model-studio/exports/laptop-v2/views/view-left.png
- /home/h/genshin-model-studio/exports/laptop-v2/views/view-right.png
- /home/h/genshin-model-studio/exports/laptop-v2/views/view-closeup.png

## 细节近景（8 张）
- views/diag/screen-glow.png（屏幕 12 行渐变；上黑边 0.0060 / 下巴 0.0120）
- views/diag/keycap-macro.png（键帽顶面 + 4 侧斜壁）
- views/diag/trackpad-zoom.png（触控板凹陷边框）
- views/diag/grille-macro.png（底面格栅 4 片叶片 + 暗底衬）
- views/diag/nameplate-macro.png（铭牌位 + 序列号槽 + 扬声器孔）
- views/diag/corner-macro.png（四角圆角折线）
- views/diag/view-left-portzoom.png（view-left 底座侧壁 12× 放大）
- views/diag/view-right-portzoom.png（view-right 底座侧壁 12× 放大）

## 判读口径（关键，避免误读）
- 相机方位：yaw=0 → +Z（front）；yaw=+1.5708（left 预设）→ 相机在 **+X** 侧 → 看到 **x=+0.1520 壁**（**1 个圆形耳机孔**）；yaw=−1.5708（right 预设）→ 相机在 **−X** 侧 → 看到 **x=−0.1520 壁**（**2 个矩形 USB-C 开口**）。规格：USB-C 在 x=−0.1520，耳机孔在 x=+0.1520（已由 items.json 坐标核验）。
- 模型为 570 个平面/实心元件拼出的闭合笔记本（开合 100°）：底座楔形 + 上盖 4mm（边缘 R 0.0100 圆角管）+ 79 键（每键 5 件）+ 触控板凹陷 0.0008 + 屏幕 12 行渐变 + 摄像头方孔圈 + logo 分层 + 双 USB-C 内腔 + 耳机孔圆内圈 + 底面格栅/铭牌/序列号槽/2×4 扬声器孔 + 转轴 6 段 + 4 脚垫。
- 五视角视距 2.4 m（与上轮基线一致，模型偏小属预设行为，不是缺陷）；closeup 0.8 m。红/绿/蓝细线是坐标轴辅助线。
- 已知限制（不算缺陷）：上盖/底座平面四角为矩形（引擎无 roll），四角可见约 4 mm 直角外沿。

## 输出
```json
{"verdict":"pass|reject","blocking":[...],"major":[...],"minor":[...],"notes":"..."}
```
blocking = 破面/悬空/明显错位/部件缺失；major = 比例明显失真、细节方向错误；minor = 观感瑕疵。
