// 电风扇画法 v8（用户第四轮反馈）
// ① 插头：中国三脚插头——橡皮体（椭圆）+ 上排两片扁金属（火/零）+ 下中地线脚（品字，向下插）
// ② 电线：电机底竖直段 → 弯曲段 → 躺地段（自然形态，有韧性）→ 插头
// ③ 去掉前中心环（与固定盘/前脸圆重复）
window.gms.clear()
window.gms.part('rod',     {x1:0, y1:0.37, z:-0.10, x2:0, y2:0.15, size:0.005, color:'#2b3038'})  // 0 电线竖直段（电机正底）
window.gms.part('arc',     {x:0, y:0.15, y2:0.045, z:-0.10, r:0.08, rise:-0.012, size:0.005, color:'#2b3038'})  // 1 电线弯曲段（落地）
window.gms.part('rod',     {x1:0.08, y1:0.045, z:-0.10, x2:0.155, y2:0.045, size:0.005, color:'#2b3038'})  // 2 电线躺地段（→插头）
window.gms.part('el-disc', {x:0.155, y:0.06, z:-0.10, rx:0.022, ry:0.015, thick:0.012, axis:'up', color:'#1f232b'})  // 3 插头橡皮体（椭圆块）
window.gms.part('rod',     {x1:0.147, y1:0.055, z:-0.10, x2:0.147, y2:0.022, size:0.003, color:'#c0c4cc'})  // 4 金属片·上火线（扁片模拟）
window.gms.part('rod',     {x1:0.163, y1:0.055, z:-0.10, x2:0.163, y2:0.022, size:0.003, color:'#c0c4cc'})  // 5 金属片·上零线
window.gms.part('rod',     {x1:0.155, y1:0.05, z:-0.10, x2:0.155, y2:0.008, size:0.003, color:'#c0c4cc'})  // 6 金属片·下地线（品字）
window.gms.part('disc',    {x:0, y:0.01,  z:-0.04, r:0.13,  thick:0.02, color:'#3f4650'})   // 7 底座
window.gms.part('rod',     {x1:0, y1:0.37, z:-0.06, x2:0, y2:0.012, size:0.02, color:'#5b6270'})  // 8 支架
window.gms.part('ring',    {x:0, y:0.416,  z:-0.004, r:0.125, size:0.004, color:'#aab4c0'})   // 9 后环
window.gms.part('arc',     {x:0, y:0.416,  z:-0.004, r:0.125, rise:-0.04, size:0.0015, color:'#9aa6b2'})  // 10 后弧源
window.gms.rotatem(10, 0, 0.416, 36)
window.gms.part('ring',    {x:0, y:0.416,  z:-0.06, r:0.05, size:0.012, color:'#6b7280'})   // 46 后中心环
window.gms.part('disc',    {x:0, y:0.416,  z:-0.075, r:0.05, thick:0.09, axis:'front', color:'#4a4f57'})  // 47 电机
window.gms.part('disc',    {x:0, y:0.416,  z:-0.015, r:0.02, thick:0.03, axis:'front', color:'#8b95a3'})  // 48 前轴
window.gms.part('disc',    {x:0, y:0.416,  z:-0.125, r:0.015, thick:0.01, axis:'front', color:'#8b95a3'})  // 49 后轴
window.gms.part('el-disc', {x:0.076, y:0.416, z:0, rx:0.042, ry:0.025, thick:0.002, axis:'front', rotation:[102,0,0], color:'#e8c15a'})  // 50 叶片源
window.gms.rotatem(50, 0, 0.416, 3)
window.gms.part('ring',    {x:0, y:0.416,  z:0, r:0.125, size:0.0075, color:'#c3ccd6'})   // 53 焊接圈
window.gms.part('disc',    {x:0, y:0.416,  z:0, r:0.035, thick:0.004, axis:'front', color:'#7a8494'})  // 54 固定盘（相切）
window.gms.part('disc',    {x:0, y:0.416,  z:0.02, r:0.035, thick:0.004, axis:'front', color:'#8a94a4'})  // 55 前脸圆
window.gms.part('ring',    {x:0, y:0.416,  z:0.004, r:0.125, size:0.004, color:'#b8c2cc'})   // 56 前环
window.gms.part('arc',     {x:0, y:0.416,  z:0.004, r:0.125, rise:0.04, size:0.0015, color:'#aab6c2'})  // 57 前弧源
window.gms.rotatem(57, 0, 0.416, 36)