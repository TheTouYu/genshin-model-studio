// 电风扇画法 v4.2（用户逐步视觉反馈第 N 轮）
// ① 叶片缩小：外缘 0.115→0.105（rx 0.03→0.025、中心距 0.085→0.08），与焊接圈内缘留 1.2cm 间隙
// ② 中心固定盘（前脸圆）：z 0.03→0（与叶片同平面）、r 0.035→0.058（紧贴叶片根部内缘 0.055，
//    视觉上"带着叶片转"）；前脸小圆保留在 z=0.035（朝向人）
// ③ 粗细：前后环 0.009→0.0063（×0.7）、铁丝 0.0036→0.0022（×0.6）
window.gms.clear()
window.gms.part('arc',     {x:0.05, y:0.40, y2:0.10, z:-0.13, r:0.12, rise:-0.02, size:0.005, color:'#2b3038'})  // 0 电线
window.gms.part('rod',     {x1:0.17, y1:0.10, z:-0.13, x2:0.17, y2:0.035, size:0.005, color:'#2b3038'})  // 1
window.gms.part('rod',     {x1:0.17, y1:0.035, z:-0.13, x2:0.155, y2:0.02, size:0.005, color:'#2b3038'})  // 2 插脚1
window.gms.part('rod',     {x1:0.17, y1:0.035, z:-0.13, x2:0.185, y2:0.02, size:0.005, color:'#2b3038'})  // 3 插脚2
window.gms.part('rod',     {x1:0.17, y1:0.035, z:-0.13, x2:0.17, y2:0.015, size:0.005, color:'#2b3038'})  // 4 插脚3
window.gms.part('disc',    {x:0, y:0.01,  z:-0.04, r:0.13,  thick:0.02, color:'#3f4650'})   // 5 底座
window.gms.part('rod',     {x1:0, y1:0.37, z:-0.10, x2:0, y2:0.012, size:0.02, color:'#5b6270'})  // 6 支架
window.gms.part('ring',    {x:0, y:0.416,  z:-0.05, r:0.125, size:0.0063, color:'#aab4c0'})   // 7 后环（×0.7）
window.gms.part('arc',     {x:0, y:0.416,  z:-0.05, r:0.125, rise:-0.04, size:0.0022, color:'#9aa6b2'})  // 8 后弧源（×0.6）
window.gms.rotatem(8, 0, 0.416, 30)
window.gms.part('ring',    {x:0, y:0.416,  z:-0.085, r:0.05, size:0.012, color:'#6b7280'})   // 38 后中心环
window.gms.part('disc',    {x:0, y:0.416,  z:-0.10, r:0.05, thick:0.09, axis:'front', color:'#4a4f57'})  // 39 电机
window.gms.part('disc',    {x:0, y:0.416,  z:-0.175, r:0.015, thick:0.06, axis:'front', color:'#8b95a3'})  // 40 轴
window.gms.part('el-disc', {x:0.075, y:0.416, z:0, rx:0.03, ry:0.025, thick:0.002, axis:'front', rotation:[102,0,0], color:'#e8c15a'})  // 41 叶片源（长轴径向 rx=0.03、中心距 0.075：内缘 0.045 贴固定盘、外缘 0.105 距焊接圈 1.2cm）
window.gms.rotatem(41, 0, 0.416, 3)
window.gms.part('ring',    {x:0, y:0.416,  z:0, r:0.125, size:0.0075, color:'#c3ccd6'})   // 44 焊接圈
window.gms.part('disc',    {x:0, y:0.416,  z:0, r:0.058, thick:0.004, axis:'front', color:'#7a8494'})  // 45 中心固定盘（叶片平面，紧贴叶片根部，带着转）
window.gms.part('disc',    {x:0, y:0.416,  z:0.035, r:0.035, thick:0.004, axis:'front', color:'#8a94a4'})  // 46 前脸小圆（朝向人）
window.gms.part('ring',    {x:0, y:0.416,  z:0.05, r:0.125, size:0.0063, color:'#b8c2cc'})   // 47 前环（×0.7）
window.gms.part('arc',     {x:0, y:0.416,  z:0.05, r:0.125, rise:0.04, size:0.0022, color:'#aab6c2'})  // 48 前弧源（×0.6）
window.gms.rotatem(48, 0, 0.416, 30)