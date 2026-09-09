# 笔记本电脑（MacBook 式银灰极简）独立视觉复核任务

只读核验，不重跑任何脚本、不改任何文件。截图已存在，直接逐张 `read`：

- /home/h/genshin-model-studio/exports/laptop/views/view-iso.png
- /home/h/genshin-model-studio/exports/laptop/views/view-top.png
- /home/h/genshin-model-studio/exports/laptop/views/view-front.png
- /home/h/genshin-model-studio/exports/laptop/views/view-left.png
- /home/h/genshin-model-studio/exports/laptop/views/view-right.png
- /home/h/genshin-model-studio/exports/laptop/views/view-closeup.png

可选（近景辅助判断，同样只读）：
- /home/h/genshin-model-studio/exports/laptop/views/diag/keyboard-zoom.png
- /home/h/genshin-model-studio/exports/laptop/views/diag/side-minusx-usbc.png
- /home/h/genshin-model-studio/exports/laptop/views/diag/side-plusx-jack.png
- /home/h/genshin-model-studio/exports/laptop/views/diag/hinge-close.png
- /home/h/genshin-model-studio/exports/laptop/views/diag/top-tight.png
- /home/h/genshin-model-studio/exports/laptop/views/diag/bottom-grille.png
- /home/h/genshin-model-studio/exports/laptop/views/diag/logo-zoom.png

## 背景（用于判断「错位/缺失」是否真实缺陷）

这是「Genshin Model Studio」用 150 个平面/实心元件拼出的闭合笔记本（开合 100°）：
底座楔形（顶面水平 y=0.0115、底面斜升）、上盖 4mm 厚、逐键帽键盘 79 键（14/14/14/13/13/11，空格 0.0780×0.0150）、
触控板 0.1300×0.0740、屏幕可视区 0.2920×0.1825 + 黑边（左右/上 0.0060、下 0.0120）、摄像头 0.0020 方形、
logo 0.0140 方形、双 USB-C（x=−0.1520 侧）+ 耳机孔（x=+0.1520 侧）、底面 2 条散热格栅（各 1 框 + 4 片）、
4 脚垫（Ø0.0080）、转轴 rod（轴心 y=0.0115, z=−0.1000，size 0.0040）。
视角预设：iso/top/front/left/right 视距 2.4 m（模型因此偏小），closeup 视距 0.8 m。
坐标系：+z 朝用户（前缘），left 预设相机在 +X 侧、right 预设相机在 −X 侧。
渲染为实色材质（wireframe 关闭、网格/背景已隐藏），画面中的红/绿/蓝细线是坐标轴辅助线（非模型缺陷）。

## 要求

1. 逐张 `read` 六张主视图（view-*.png）。**不要**重截图、不要 grep 源码、不要运行任何命令（除非为了列目录）。
2. 对每张图报告：
   - 能否看清模型？画面是否空白/全黑（空白=失败）？
   - 破面 / 缺口 / 穿模 / 悬空（部件明显漂浮在体外）/ 错位（部件跑到不该在的位置）/ 比例问题；
   - 该视角应当可见的特征是否可见（iso：整体+屏+键盘+触控板；top：键盘井/键帽/触控板/屏；front：前缘与上盖；
     left：+X 侧（耳机孔应可见）；right：−X 侧（两个 USB-C 应可见）；closeup：近景细节）。
3. 每条缺陷必须给出：截图文件名 + 画面位置（大致方位/坐标）+ 现象描述 + 严重度（blocker/major/minor）。
4. 不要凭想象补全看不到的细节；看不清就写「该视角无法判断 X」。
5. 最后输出**一个 JSON**（也写在回复里），结构：
```json
{
  "conclusion": "pass | needs_fix | cannot_judge",
  "blockers": [{"file": "...", "where": "...", "issue": "...", "severity": "blocker"}],
  "major": [...], "minor": [...],
  "perView": [{"file": "view-iso.png", "visible": true, "notes": "..."}],
  "notes": "一句话总结"
}
```
6. 若某个 PNG 读不出图像内容（工具不渲染图像），直接写 `"cannot_judge"` 并说明原因，不要猜测。
