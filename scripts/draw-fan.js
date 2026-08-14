// 电风扇画法 v6（用户第二轮反馈修复 + z 层次压缩）
// ① 柱子中心观感：支架 z=-0.10→-0.06（上接电机下插底座，透视不再偏）
// ② 前后罩贴合：环/弧线 zBase ±0.05→±0.015（贴近焊接圈 0，不再隔离）
// ③ 固定盘相切：r 0.058→0.035（≈叶片内缘 0.034，相切固定三叶）
// ④ 电线从电机底部引出 + 插头体（椭圆盘）+ 三脚接插头体
window.gms.clear()
window.gms.part('arc',     {x:0.02, y:0.36, y2:0.07, z:-0.08, r:0.14, rise:-0.02, size:0.005, color:'#2b3038'})  // 0 电线（电机底→斜下垂）
window.gms.part('el-disc', {x:0.16, y:0.035, z:-0.08, rx:0.02, ry:0.015, thick:0.01, axis:'up', color:'#1f232b'})  // 1 插头体（椭圆块）
window.gms.part('rod',     {x1:0.16, y1:0.04, z:-0.08, x2:0.145, y2:0.025, size:0.005, color:'#2b3038'})  // 2 插脚1
window.gms.part('rod',     {x1:0.16, y1:0.04, z:-0.08, x2:0.175, y2:0.025, size:0.005, color:'#2b3038'})  // 3 插脚2
window.gms.part('rod',     {x1:0.16, y1:0.04, z:-0.08, x2:0.16, y2:0.018, size:0.005, color:'#2b3038'})  // 4 插脚3
window.gms.part('disc',    {x:0, y:0.01,  z:-0.04, r:0.13,  thick:0.02, color:'#3f4650'})   // 5 底座
window.gms.part('rod',     {x1:0, y1:0.37, z:-0.06, x2:0, y2:0.012, size:0.02, color:'#5b6270'})  // 6 支架
window.gms.part('ring',    {x:0, y:0.416,  z:-0.015, r:0.125, size:0.004, color:'#aab4c0'})   // 7 后环
window.gms.part('arc',     {x:0, y:0.416,  z:-0.015, r:0.125, rise:-0.04, size:0.0015, color:'#9aa6b2'})  // 8 后弧源
window.gms.rotatem(8, 0, 0.416, 36)
window.gms.part('ring',    {x:0, y:0.416,  z:-0.06, r:0.05, size:0.012, color:'#6b7280'})   // 44 后中心环
window.gms.part('disc',    {x:0, y:0.416,  z:-0.075, r:0.05, thick:0.09, axis:'front', color:'#4a4f57'})  // 45 电机
window.gms.part('disc',    {x:0, y:0.416,  z:-0.015, r:0.02, thick:0.03, axis:'front', color:'#8b95a3'})  // 46 前轴
window.gms.part('disc',    {x:0, y:0.416,  z:-0.125, r:0.015, thick:0.01, axis:'front', color:'#8b95a3'})  // 47 后轴
window.gms.part('el-disc', {x:0.076, y:0.416, z:0, rx:0.042, ry:0.025, thick:0.002, axis:'front', rotation:[102,0,0], color:'#e8c15a'})  // 48 叶片源
window.gms.rotatem(48, 0, 0.416, 3)
window.gms.part('ring',    {x:0, y:0.416,  z:0, r:0.125, size:0.0075, color:'#c3ccd6'})   // 51 焊接圈
window.gms.part('disc',    {x:0, y:0.416,  z:0, r:0.035, thick:0.004, axis:'front', color:'#7a8494'})  // 52 固定盘（相切）
window.gms.part('disc',    {x:0, y:0.416,  z:0.02, r:0.035, thick:0.004, axis:'front', color:'#8a94a4'})  // 53 前脸圆
window.gms.part('ring',    {x:0, y:0.416,  z:0.015, r:0.045, size:0.008, color:'#7f8ea0'})   // 54 前中心环
window.gms.part('ring',    {x:0, y:0.416,  z:0.015, r:0.125, size:0.004, color:'#b8c2cc'})   // 55 前环
window.gms.part('arc',     {x:0, y:0.416,  z:0.015, r:0.125, rise:0.04, size:0.0015, color:'#aab6c2'})  // 56 前弧源
window.gms.rotatem(56, 0, 0.416, 36)