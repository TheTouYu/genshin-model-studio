// 电风扇画法 v4（组件化，十六期——用户视觉设计重构）
// 结构（从前往后）：前罩弧线/前环(50% 细) → 前脸小圆 → 叶片×3(缩小) + 焊接圈(叶片平面)
//   → 后罩弧线/后环(50% 细) → 后中心环(电机空位) → 电机(大/厚/嵌入穿出) → 轴(向后)
//   → 电线(弧线+三角插头) → 支架 → 底座(加重)
// 顺序：电线/插头先画（x 非对称件定 bbox 中心，主体随后按同一中心回正——G15 规避）；
// 底座后画（solid 底=lift，画布 y 只影响轮廓与 bbox，底座底画在 bbox 底即可）。
window.gms.clear()
window.gms.part('arc',     {x:0.05, y:0.40, y2:0.10, z:-0.13, r:0.12, rise:-0.02, size:0.008, color:'#2b3038'})  // 0 电线（电机后部→斜下垂，弧线）
window.gms.part('rod',     {x1:0.17, y1:0.10, z:-0.13, x2:0.17, y2:0.035, size:0.008, color:'#2b3038'})  // 1 电线尾段
window.gms.part('rod',     {x1:0.17, y1:0.035, z:-0.13, x2:0.155, y2:0.02, size:0.008, color:'#2b3038'})  // 2 三角插头·脚1
window.gms.part('rod',     {x1:0.17, y1:0.035, z:-0.13, x2:0.185, y2:0.02, size:0.008, color:'#2b3038'})  // 3 三角插头·脚2
window.gms.part('rod',     {x1:0.17, y1:0.035, z:-0.13, x2:0.17, y2:0.015, size:0.008, color:'#2b3038'})  // 4 三角插头·脚3（三角分布）
window.gms.part('disc',    {x:0, y:0.01,  z:-0.04, r:0.13,  thick:0.02, color:'#3f4650'})   // 5 底座（加重 r0.13 厚0.02，贴地 y=厚/2）
window.gms.part('rod',     {x1:0, y1:0.37, z:-0.10, x2:0, y2:0.012, size:0.03, color:'#5b6270'})  // 6 支架（电机底→地面，与电机同面 z=-0.10）
window.gms.part('ring',    {x:0, y:0.416,  z:-0.05, r:0.125, size:0.015, color:'#aab4c0'})   // 7 后环（50% 半径/粗细）
window.gms.part('arc',     {x:0, y:0.416,  z:-0.05, r:0.125, rise:-0.04, color:'#9aa6b2'})  // 8 后罩弧线源（细铁丝）
window.gms.rotatem(8, 0, 0.416, 30)  // 后罩弧线×30（副本 9-37）
window.gms.part('ring',    {x:0, y:0.416,  z:-0.085, r:0.05, size:0.015, color:'#6b7280'})   // 38 后中心环（电机空位）
window.gms.part('disc',    {x:0, y:0.416,  z:-0.10, r:0.05, thick:0.09, axis:'front', color:'#4a4f57'})  // 39 电机（后移、比前脸圆大、厚；穿过后中心环嵌出）
window.gms.part('disc',    {x:0, y:0.416,  z:-0.175, r:0.015, thick:0.06, axis:'front', color:'#8b95a3'})  // 40 轴（电机后表面向后伸出）
window.gms.part('el-disc', {x:0.085, y:0.416, z:0, rx:0.03, ry:0.04, thick:0.002, axis:'front', rotation:[102,0,0], color:'#e8c15a'})  // 41 叶片源（缩小：内缘0.055 外缘0.115）
window.gms.rotatem(41, 0, 0.416, 3)  // 叶片×3（副本 42-43）
window.gms.part('ring',    {x:0, y:0.416,  z:0, r:0.125, size:0.015, color:'#c3ccd6'})   // 44 焊接圈（叶片平面，焊接前后罩）
window.gms.part('disc',    {x:0, y:0.416,  z:0.03, r:0.035, thick:0.004, axis:'front', color:'#7a8494'})  // 45 前脸小圆（朝向人一面）
window.gms.part('ring',    {x:0, y:0.416,  z:0.05, r:0.125, size:0.015, color:'#b8c2cc'})   // 46 前环（50% 半径/粗细）
window.gms.part('arc',     {x:0, y:0.416,  z:0.05, r:0.125, rise:0.04, color:'#aab6c2'})  // 47 前罩弧线源（细铁丝）
window.gms.rotatem(47, 0, 0.416, 30)  // 前罩弧线×30（副本 48-76）