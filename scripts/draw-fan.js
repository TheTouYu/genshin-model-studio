// 电风扇画法 v4.1（粗细体系修正——用户语义澄清：大小=杆径粗细，半径体系不变）
// 粗细：环 0.009（边框）> 焊接圈/中心环 0.012/0.0075 > 铁丝 0.0036 > 电线 0.005
// 半径层级（用户确认）：前环=后环=焊接圈(0.125) > 叶片外缘(0.115) > 电机(0.05) > 前脸圆(0.035)
window.gms.clear()
window.gms.part('arc',     {x:0.05, y:0.40, y2:0.10, z:-0.13, r:0.12, rise:-0.02, size:0.005, color:'#2b3038'})  // 0 电线
window.gms.part('rod',     {x1:0.17, y1:0.10, z:-0.13, x2:0.17, y2:0.035, size:0.005, color:'#2b3038'})  // 1 电线尾段
window.gms.part('rod',     {x1:0.17, y1:0.035, z:-0.13, x2:0.155, y2:0.02, size:0.005, color:'#2b3038'})  // 2 插脚1
window.gms.part('rod',     {x1:0.17, y1:0.035, z:-0.13, x2:0.185, y2:0.02, size:0.005, color:'#2b3038'})  // 3 插脚2
window.gms.part('rod',     {x1:0.17, y1:0.035, z:-0.13, x2:0.17, y2:0.015, size:0.005, color:'#2b3038'})  // 4 插脚3
window.gms.part('disc',    {x:0, y:0.01,  z:-0.04, r:0.13,  thick:0.02, color:'#3f4650'})   // 5 底座
window.gms.part('rod',     {x1:0, y1:0.37, z:-0.10, x2:0, y2:0.012, size:0.02, color:'#5b6270'})  // 6 支架
window.gms.part('ring',    {x:0, y:0.416,  z:-0.05, r:0.125, size:0.009, color:'#aab4c0'})   // 7 后环（细 0.009）
window.gms.part('arc',     {x:0, y:0.416,  z:-0.05, r:0.125, rise:-0.04, size:0.0036, color:'#9aa6b2'})  // 8 后弧源（铁丝 ×0.3=3.6mm）
window.gms.rotatem(8, 0, 0.416, 30)  // 后罩弧线×30
window.gms.part('ring',    {x:0, y:0.416,  z:-0.085, r:0.05, size:0.012, color:'#6b7280'})   // 38 后中心环（×0.8=0.012）
window.gms.part('disc',    {x:0, y:0.416,  z:-0.10, r:0.05, thick:0.09, axis:'front', color:'#4a4f57'})  // 39 电机
window.gms.part('disc',    {x:0, y:0.416,  z:-0.175, r:0.015, thick:0.06, axis:'front', color:'#8b95a3'})  // 40 轴
window.gms.part('el-disc', {x:0.085, y:0.416, z:0, rx:0.03, ry:0.04, thick:0.002, axis:'front', rotation:[102,0,0], color:'#e8c15a'})  // 41 叶片源
window.gms.rotatem(41, 0, 0.416, 3)  // 叶片×3
window.gms.part('ring',    {x:0, y:0.416,  z:0, r:0.125, size:0.0075, color:'#c3ccd6'})   // 44 焊接圈（×0.5=0.0075）
window.gms.part('disc',    {x:0, y:0.416,  z:0.03, r:0.035, thick:0.004, axis:'front', color:'#7a8494'})  // 45 前脸圆
window.gms.part('ring',    {x:0, y:0.416,  z:0.05, r:0.125, size:0.009, color:'#b8c2cc'})   // 46 前环（细 0.009）
window.gms.part('arc',     {x:0, y:0.416,  z:0.05, r:0.125, rise:0.04, size:0.0036, color:'#aab6c2'})  // 47 前弧源（铁丝 3.6mm）
window.gms.rotatem(47, 0, 0.416, 30)  // 前罩弧线×30