# 18 — 表面位移 displace（皱褶/罗纹，修 F3/P6）

**What to build:** displace(vertices, fn(t,theta), amp)：按参数做正弦/高斯位移（踝部 2 道褶皱环、足背微褶、罗纹肌理近似）。作为 lib 函数作用在 mesh 顶点上再 emit。

**Blocked by:** 16

**Status:** done（rings 褶皱=表面径向波，踝部可见；悬空杆已移除）

- [ ] 踝部皱褶为表面连续褶皱（无悬空杆）
- [ ] 可选：袜面细罗纹（幅值 0.2mm 级）可见但不破色
