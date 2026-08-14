// 电风扇画法 v7（第三轮用户反馈）
// ① 前后罩/弧线 zBase ±0.015→±0.004（与焊接圈缝住，4mm 贴合）
// ② 电线：电机正底部（x=0）垂直向下 → 弯曲到地面 → 插头
// ③ 插头 = 小环 + 3 垂直脚（贴地摆正，接电线尾端）
window.gms.clear()
window.gms.part('rod',     {x1:0, y1:0.37, z:-0.10, x2:0, y2:0.20, size:0.005, color:'#2b3038'})  // 0 电线垂直段（电机正底部向下）
window.gms.part('arc',     {x:0, y:0.20, y2:0.06, z:-0.10, r:0.155, rise:-0.01, size:0.005, color:'#2b3038'})  // 1 电线弯曲段（→地面）
window.gms.part('ring',    {x:0.155, y:0.05, z:-0.10, r:0.012, size:0.004, color:'#1f232b'})  // 2 插头环（插头体，贴地）
window.gms.part('rod',     {x1:0.148, y1:0.05, z:-0.10, x2:0.148, y2:0.02, size:0.004, color:'#c0c4cc'})  // 3 插脚1（垂直向下）
window.gms.part('rod',     {x1:0.162, y1:0.05, z:-0.10, x2:0.162, y2:0.02, size:0.004, color:'#c0c4cc'})  // 4 插脚2
window.gms.part('rod',     {x1:0.155, y1:0.05, z:-0.10, x2:0.155, y2:0.012, size:0.004, color:'#c0c4cc'})  // 5 插脚3（三角）
window.gms.part('disc',    {x:0, y:0.01,  z:-0.04, r:0.13,  thick:0.02, color:'#3f4650'})   // 6 底座
window.gms.part('rod',     {x1:0, y1:0.37, z:-0.06, x2:0, y2:0.012, size:0.02, color:'#5b6270'})  // 7 支架
window.gms.part('ring',    {x:0, y:0.416,  z:-0.004, r:0.125, size:0.004, color:'#aab4c0'})   // 8 后环（缝住焊接圈）
window.gms.part('arc',     {x:0, y:0.416,  z:-0.004, r:0.125, rise:-0.04, size:0.0015, color:'#9aa6b2'})  // 9 后弧源
window.gms.rotatem(9, 0, 0.416, 36)
window.gms.part('ring',    {x:0, y:0.416,  z:-0.06, r:0.05, size:0.012, color:'#6b7280'})   // 45 后中心环
window.gms.part('disc',    {x:0, y:0.416,  z:-0.075, r:0.05, thick:0.09, axis:'front', color:'#4a4f57'})  // 46 电机
window.gms.part('disc',    {x:0, y:0.416,  z:-0.015, r:0.02, thick:0.03, axis:'front', color:'#8b95a3'})  // 47 前轴
window.gms.part('disc',    {x:0, y:0.416,  z:-0.125, r:0.015, thick:0.01, axis:'front', color:'#8b95a3'})  // 48 后轴
window.gms.part('el-disc', {x:0.076, y:0.416, z:0, rx:0.042, ry:0.025, thick:0.002, axis:'front', rotation:[102,0,0], color:'#e8c15a'})  // 49 叶片源
window.gms.rotatem(49, 0, 0.416, 3)
window.gms.part('ring',    {x:0, y:0.416,  z:0, r:0.125, size:0.0075, color:'#c3ccd6'})   // 52 焊接圈
window.gms.part('disc',    {x:0, y:0.416,  z:0, r:0.035, thick:0.004, axis:'front', color:'#7a8494'})  // 53 固定盘
window.gms.part('disc',    {x:0, y:0.416,  z:0.02, r:0.035, thick:0.004, axis:'front', color:'#8a94a4'})  // 54 前脸圆
window.gms.part('ring',    {x:0, y:0.416,  z:0.004, r:0.045, size:0.008, color:'#7f8ea0'})   // 55 前中心环（与前环同面）
window.gms.part('ring',    {x:0, y:0.416,  z:0.004, r:0.125, size:0.004, color:'#b8c2cc'})   // 56 前环（缝住焊接圈）
window.gms.part('arc',     {x:0, y:0.416,  z:0.004, r:0.125, rise:0.04, size:0.0015, color:'#aab6c2'})  // 57 前弧源
window.gms.rotatem(57, 0, 0.416, 36)