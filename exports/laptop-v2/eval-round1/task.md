# 笔记本电脑 v2（细节升级版）独立视觉复核任务

只读核验，不重跑任何脚本、不改任何文件。截图已存在，直接逐张 `read`：

- /home/h/genshin-model-studio/exports/laptop-v2/views/view-iso.png
- /home/h/genshin-model-studio/exports/laptop-v2/views/view-top.png
- /home/h/genshin-model-studio/exports/laptop-v2/views/view-front.png
- /home/h/genshin-model-studio/exports/laptop-v2/views/view-left.png
- /home/h/genshin-model-studio/exports/laptop-v2/views/view-right.png
- /home/h/genshin-model-studio/exports/laptop-v2/views/view-closeup.png

近景辅助（同样只读，用于判断细节是否成立）：
- views/diag/screen-glow.png（屏幕 12 行发光渐变 + 上黑边 0.0060 / 下巴 0.0120）
- views/diag/screen-camera.png（摄像头方形孔圈 + 状态点）
- views/diag/keycap-macro.png（键帽顶面 + 4 侧斜壁）
- views/diag/trackpad-zoom.png（触控板凹陷边框）
- views/diag/usbc-macro.png（USB-C 内腔，x=−0.1520 侧）
- views/diag/jack-macro.png（耳机孔内圈，x=+0.1520 侧）
- views/diag/grille-macro.png（散热格栅叶片 0.0005×0.0003、间距 0.00025）
- views/diag/nameplate-macro.png（铭牌位 + 序列号槽）
- views/diag/speaker-macro.png（扬声器孔阵列 4 孔）
- views/diag/hinge-zoom.png（铰链盖与机身缝隙）
- views/diag/corner-macro.png（四角圆角 4 段折线）
- views/diag/logo-zoom.png（logo 底衬 + 面层）
- views/diag/iso-tight.png / top-tight.png / front-tight.png（紧凑整机）

## 背景（用于判断「错位/缺失」是否真实缺陷）

这是「Genshin Model Studio」用 573 个平面/实心元件拼出的闭合笔记本（开合 100°，573 件 = 539 平面 + 34 实心）：
底座楔形（顶面水平 y=0.0115、底面斜升）、上盖 4mm 厚（边缘为 R 0.0100 圆角管）、
逐键帽键盘 79 键（每键 = 顶面 0.0150² + 4 侧斜壁，相邻键间隙 0.0006；空格 0.0780×0.0150）、
触控板 0.1300×0.0740（凹陷 0.0008 + 四侧壁 #ADB3BC）、屏幕可视区 0.2920×0.1825 拆 12 行发光渐变
（下 #0E1B2A → 上 #1B3A5C）+ 黑边（左右/上 0.0060、下 0.0120，下巴在下）、摄像头方形孔圈 0.0036² + 状态点、
logo 分层（底衬 0.0160² + 面层 0.0120²）、双 USB-C 内腔（x=−0.1520 侧，深 0.0035，含舌片）、
耳机孔内腔 + 内圈（x=+0.1520 侧，深 0.0040）、底面 2 条散热格栅（各 4 片叶片 + 暗底衬）、
底面铭牌位 + 序列号槽 + 2×4 扬声器孔、4 脚垫（Ø0.0080）、转轴 6 段 rod（轴心 y=0.0115, z=−0.1000，size 0.0040，段间 0.0008）。
视角预设：iso/top/front/left/right 视距 2.4 m（模型因此偏小，属预设行为，不是缺陷），closeup 视距 0.8 m。
坐标系：+z 朝用户（前缘），left 预设相机在 +X 侧、right 预设相机在 −X 侧。
渲染为实色材质（wireframe 关闭、网格/背景已隐藏），画面中的红/绿/蓝细线是坐标轴辅助线（非模型缺陷）。

## 已知限制（不算缺陷，无需报 blocking）

- 平面件用 AABB 近似注册，命名件只覆盖 31 件引擎可连通件；几何正确性由独立精确 AABB 复算保证。
- 上盖/底座的平面四角为矩形（引擎无 roll、四角圆角用竖直折线/圆角管表达），四角处可见约 4 mm 的直角外沿。

## 输出要求

逐张读完后输出 JSON（也给出简短中文结论）：
{"verdict":"pass|reject","blocking":[...],"major":[...],"minor":[...],"notes":"..."}
判定口径：blocking = 破面/悬空/明显错位/部件缺失；major = 比例明显失真、细节方向错误；
minor = 观感瑕疵。注意：模型在 iso/top/front/left/right 里偏小是预设视距 2.4 m 造成的，请以 closeup 与近景图判断细节。

EVALUATION SAFETY BOUNDARY:
- This is an isolated project copy. Follow the task's requested workflow and normal review gates.
- Reversible plans and candidate artifacts are allowed when the task requests them; they are not approval to change formal authority.
- Do not use --apply or perform Git mutations unless the task explicitly requires them.
- Report tool/documentation inconsistencies instead of silently guessing.
- Do not read or print credentials, secrets, raw private mappings, or unrestricted sensitive materials.
