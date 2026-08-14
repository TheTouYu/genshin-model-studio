// 电风扇画法 v9（用户第五轮反馈）
// ① 金属片：plate（长方体）+ 端部半圆（disc）——非圆柱；三片长度一致（2.6cm）下端对齐
// ② 电线：竖直段 + seg=20 大弧线弯曲（自然下垂）+ 躺地段（接入橡皮体中心）
// ③ 后/前罩弧线 start 偏移避让电机（防穿模）
// ④ 电机顶部两按钮：高=摇头、矮=开关
window.gms.clear()
window.gms.part('rod',     {x1:0, y1:0.37, z:-0.10, x2:0, y2:0.15, size:0.005, color:'#2b3038'})  // 0 电线竖直段
window.gms.part('arc',     {x:0, y:0.15, y2:0.05, z:-0.10, r:0.1, rise:-0.02, seg:20, size:0.005, color:'#2b3038'})  // 1 电线弯曲段（20 点平滑弧）
window.gms.part('rod',     {x1:0.1, y1:0.05, z:-0.10, x2:0.155, y2:0.05, size:0.005, color:'#2b3038'})  // 2 电线躺地段（终点=橡皮体中心）
window.gms.part('el-disc', {x:0.155, y:0.06, z:-0.10, rx:0.022, ry:0.015, thick:0.012, axis:'up', color:'#1f232b'})  // 3 插头橡皮体
window.gms.part('plate',   {x:0.147, y:0.055, z:-0.10, len:0.022, wid:0.005, thick:0.0015, color:'#c0c4cc'})  // 4 金属片·上左（火线）
window.gms.part('disc',    {x:0.147, y:0.0425, z:-0.10, r:0.0025, thick:0.0015, axis:'front', color:'#c0c4cc'})  // 5 片端半圆
window.gms.part('plate',   {x:0.163, y:0.055, z:-0.10, len:0.022, wid:0.005, thick:0.0015, color:'#c0c4cc'})  // 6 金属片·上右（零线）
window.gms.part('disc',    {x:0.163, y:0.0425, z:-0.10, r:0.0025, thick:0.0015, axis:'front', color:'#c0c4cc'})  // 7
window.gms.part('plate',   {x:0.155, y:0.055, z:-0.10, len:0.022, wid:0.005, thick:0.0015, color:'#c0c4cc'})  // 8 金属片·下中（地线）
window.gms.part('disc',    {x:0.155, y:0.0425, z:-0.10, r:0.0025, thick:0.0015, axis:'front', color:'#c0c4cc'})  // 9
window.gms.part('disc',    {x:0, y:0.01,  z:-0.04, r:0.13,  thick:0.02, color:'#3f4650'})   // 10 底座
window.gms.part('rod',     {x1:0, y1:0.37, z:-0.06, x2:0, y2:0.012, size:0.02, color:'#5b6270'})  // 11 支架
window.gms.part('ring',    {x:0, y:0.416,  z:-0.004, r:0.125, size:0.004, color:'#aab4c0'})   // 12 后环
window.gms.part('arc',     {x:0, y:0.416,  z:-0.004, r:0.125, rise:-0.04, start:0.06, size:0.0015, color:'#9aa6b2'})  // 13 后弧源（start 避让电机）
window.gms.rotatem(13, 0, 0.416, 36)
window.gms.part('ring',    {x:0, y:0.416,  z:-0.06, r:0.05, size:0.012, color:'#6b7280'})   // 49 后中心环
window.gms.part('disc',    {x:0, y:0.416,  z:-0.075, r:0.05, thick:0.09, axis:'front', color:'#4a4f57'})  // 50 电机
window.gms.part('disc',    {x:0.02, y:0.476, z:-0.075, r:0.011, thick:0.022, axis:'up', color:'#2f3a4d'})  // 51 摇头按钮（高）
window.gms.part('disc',    {x:-0.02, y:0.471, z:-0.075, r:0.011, thick:0.012, axis:'up', color:'#39475c'})  // 52 开关按钮（矮）
window.gms.part('disc',    {x:0, y:0.416,  z:-0.015, r:0.02, thick:0.03, axis:'front', color:'#8b95a3'})  // 53 前轴
window.gms.part('disc',    {x:0, y:0.416,  z:-0.125, r:0.015, thick:0.01, axis:'front', color:'#8b95a3'})  // 54 后轴
window.gms.part('el-disc', {x:0.076, y:0.416, z:0, rx:0.042, ry:0.025, thick:0.002, axis:'front', rotation:[102,0,0], color:'#e8c15a'})  // 55 叶片源
window.gms.rotatem(55, 0, 0.416, 3)
window.gms.part('ring',    {x:0, y:0.416,  z:0, r:0.125, size:0.0075, color:'#c3ccd6'})   // 58 焊接圈
window.gms.part('disc',    {x:0, y:0.416,  z:0, r:0.035, thick:0.004, axis:'front', color:'#7a8494'})  // 59 固定盘
window.gms.part('disc',    {x:0, y:0.416,  z:0.02, r:0.035, thick:0.004, axis:'front', color:'#8a94a4'})  // 60 前脸圆
window.gms.part('ring',    {x:0, y:0.416,  z:0.004, r:0.125, size:0.004, color:'#b8c2cc'})   // 61 前环
window.gms.part('arc',     {x:0, y:0.416,  z:0.004, r:0.125, rise:0.04, start:0.05, size:0.0015, color:'#aab6c2'})  // 62 前弧源（start 避让中心盘）
window.gms.rotatem(62, 0, 0.416, 36)