# 12 — 不对称 profile-loft（截面 4 参数 + 分区着色 + cap 策略）

**What to build:** 把 loftMesh 升级为 profile-loft：截面支持 {rx, ry, cx?, cy?} 逐环序列（竖向/横向偏心 → 小腿肚、跟腱、脚弓、皱褶都能用截面表达）；cap 显式 'none'|'top'|'bottom'|'both'（杜绝"顶盖帽子"bug）；区域着色 regions:[{t0,t1,color}]（皮肤/袜/条纹在同一网格内分区）。

**Blocked by:** None（meshes/loftMesh 已在）

**Status:** done（demo：小腿肚 cy 偏心后凸可见；cap none/both 无“帽子”；区域着色=双蓝条纹可见）

- [ ] 抽样 demo：后凸小腿肚（cy 偏心）+ 踝收窄 + 脚弓（分段 cy）渲染正确
- [ ] cap 各策略演示无"帽子/端盖盘"误现
- [ ] 区域着色（皮肤/白袜/蓝白蓝条纹）同一网格可见
