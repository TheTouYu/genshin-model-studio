# 03 — 曲面贴花 decal + decalCheck

**What to build:** 纹样（号码/徽章/鸢尾/金藤）以曲面 UV 参数贴到曲面上：自动求该点世界坐标/法线/切向、自动微抬防 z-fight；并提供 `decalCheck` 自动断言"每件贴花与曲面平均脱离距离 ≤ 2mm"，把"肉眼找浮空"变成断言。

**Blocked by:** 01（依赖公共库里的 surface 几何）

**Status:** ready-for-agent

- [ ] 胸面贴 10/盾徽/鸢尾，特写无浮空/无倾斜
- [ ] decalCheck 全绿（平均脱离 ≤2mm），人为抬高 5mm 时断言变红
