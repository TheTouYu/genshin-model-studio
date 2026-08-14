// 电风扇画法 v5（用户全部历史反馈修复轮）
// 修复清单：①叶片外缘 0.118 与罩环相切（4mm）；②前轴（电机→固定盘插接）+ 后轴缩短 0.02；
// ③前中心环 z=0.05（前罩弧线内端连接，不再悬空）；④电线从电机底部引出；⑤插脚接电线尾端；
// ⑥前后环 0.004（更细）、铁丝 0.0015（更细）、36 根（更密）
window.gms.clear()
window.gms.part('arc',     {x:0.03, y:0.35, y2:0.06, z:-0.11, r:0.13, rise:-0.02, size:0.005, color:'#2b3038'})  // 0 电线（电机底部→斜下垂）
window.gms.part('rod',     {x1:0.16, y1:0.06, z:-0.11, x2:0.16, y2:0.03, size:0.005, color:'#2b3038'})  // 1 电线尾段（接插头）
window.gms.part('rod',     {x1:0.16, y1:0.03, z:-0.11, x2:0.145, y2:0.02, size:0.005, color:'#2b3038'})  // 2 插脚1（尾端散开）
window.gms.part('rod',     {x1:0.16, y1:0.03, z:-0.11, x2:0.175, y2:0.02, size:0.005, color:'#2b3038'})  // 3 插脚2
window.gms.part('rod',     {x1:0.16, y1:0.03, z:-0.11, x2:0.16, y2:0.012, size:0.005, color:'#2b3038'})  // 4 插脚3（三角）
window.gms.part('disc',    {x:0, y:0.01,  z:-0.04, r:0.13,  thick:0.02, color:'#3f4650'})   // 5 底座
window.gms.part('rod',     {x1:0, y1:0.37, z:-0.10, x2:0, y2:0.012, size:0.02, color:'#5b6270'})  // 6 支架
window.gms.part('ring',    {x:0, y:0.416,  z:-0.05, r:0.125, size:0.004, color:'#aab4c0'})   // 7 后环（×0.63 更细）
window.gms.part('arc',     {x:0, y:0.416,  z:-0.05, r:0.125, rise:-0.04, size:0.0015, color:'#9aa6b2'})  // 8 后弧源（铁丝 1.5mm）
window.gms.rotatem(8, 0, 0.416, 36)  // 后罩弧线×36（副本 9-43）
window.gms.part('ring',    {x:0, y:0.416,  z:-0.085, r:0.05, size:0.012, color:'#6b7280'})   // 44 后中心环（电机空位）
window.gms.part('disc',    {x:0, y:0.416,  z:-0.10, r:0.05, thick:0.09, axis:'front', color:'#4a4f57'})  // 45 电机（嵌入后中心环穿出）
window.gms.part('disc',    {x:0, y:0.416,  z:-0.0275, r:0.02, thick:0.055, axis:'front', color:'#8b95a3'})  // 46 前轴（电机前表面→固定盘，插接）
window.gms.part('disc',    {x:0, y:0.416,  z:-0.155, r:0.015, thick:0.02, axis:'front', color:'#8b95a3'})  // 47 后轴（缩短到 2cm）
window.gms.part('el-disc', {x:0.076, y:0.416, z:0, rx:0.042, ry:0.025, thick:0.002, axis:'front', rotation:[102,0,0], color:'#e8c15a'})  // 48 叶片源（外缘0.118 与罩环相切）
window.gms.rotatem(48, 0, 0.416, 3)  // 叶片×3（副本 49-50）
window.gms.part('ring',    {x:0, y:0.416,  z:0, r:0.125, size:0.0075, color:'#c3ccd6'})   // 51 焊接圈
window.gms.part('disc',    {x:0, y:0.416,  z:0, r:0.058, thick:0.004, axis:'front', color:'#7a8494'})  // 52 固定盘（叶片平面，前轴插入）
window.gms.part('disc',    {x:0, y:0.416,  z:0.035, r:0.035, thick:0.004, axis:'front', color:'#8a94a4'})  // 53 前脸圆
window.gms.part('ring',    {x:0, y:0.416,  z:0.05, r:0.045, size:0.008, color:'#7f8ea0'})   // 54 前中心环（前罩 hub，弧线内端连接）
window.gms.part('ring',    {x:0, y:0.416,  z:0.05, r:0.125, size:0.004, color:'#b8c2cc'})   // 55 前环（×0.63 更细）
window.gms.part('arc',     {x:0, y:0.416,  z:0.05, r:0.125, rise:0.04, size:0.0015, color:'#aab6c2'})  // 56 前弧源（铁丝 1.5mm）
window.gms.rotatem(56, 0, 0.416, 36)  // 前罩弧线×36（副本 57-91）