// 电风扇画法 v3（组件化，十五期修正）
// 修正（用户视觉反馈 2026-08-14）：防护罩 = 细铁丝笼（30 根细弧线），
// 旧版 4 根粗平面辐条是多余的老设计——前后罩均只用细弧线，粗辐条删除。
// 结构：底座 / 支架 / 后环 / 后罩弧线×30 / 电机 / 后中心盘 / 叶片×3 / 前轮毂盘(轴心连接) / 前环 / 前罩弧线×30
window.gms.clear()
window.gms.part('disc',    {x:0, y:0.006,  z:-0.04, r:0.1,    thick:0.012, color:'#3f4650'})   // 0 底座（先画定 bbox 底）
window.gms.part('rod',     {x1:0, y1:0.416, z:-0.04, x2:0, y2:0.01,               color:'#5b6270'})  // 1 支架
window.gms.part('ring',    {x:0, y:0.416,  z:-0.04, r:0.25,                     color:'#aab4c0'})   // 2 后环
window.gms.part('arc',     {x:0, y:0.416,  z:-0.04, r:0.25, rise:-0.04,          color:'#9aa6b2'})  // 3 后罩弧线源（细铁丝，凸向后）
window.gms.rotatem(3, 0, 0.416, 30)  // 后罩弧线×30（副本 4-32）
window.gms.part('disc',    {x:0, y:0.416,  z:-0.045, r:0.04375, thick:0.08, axis:'front', color:'#4a4f57'})  // 33 电机
window.gms.part('disc',    {x:0, y:0.416,  z:-0.085, r:0.0625, thick:0.015, axis:'front', color:'#6b7280'})  // 34 后中心盘（后罩圆心）
window.gms.part('el-disc', {x:0.15, y:0.416, z:0, rx:0.09, ry:0.0625, thick:0.002, axis:'front', rotation:[102,0,0], color:'#e8c15a'})  // 35 叶片源（桨距 12°）
window.gms.rotatem(35, 0, 0.416, 3)  // 叶片×3（副本 36-37）
window.gms.part('disc',    {x:0, y:0.416,  z:0.003, r:0.055, thick:0.004, axis:'front', color:'#7a8494'})  // 38 前轮毂盘（轴心连接：与叶片根部紧挨，兼前罩圆心）
window.gms.part('ring',    {x:0, y:0.416,  z:0.05, r:0.25,                      color:'#b8c2cc'})   // 39 前环
window.gms.part('arc',     {x:0, y:0.416,  z:0.05, r:0.25, rise:0.04,           color:'#aab6c2'})  // 40 前罩弧线源（细铁丝，凸向前）
window.gms.rotatem(40, 0, 0.416, 30)  // 前罩弧线×30（副本 41-69）