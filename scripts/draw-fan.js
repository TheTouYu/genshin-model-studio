// 电风扇画法 v10（用户第六轮反馈）
// ① 电线：gms.curve 整段曲线（电机底→垂→弯→入橡皮体内部）——无 rod 硬接
// ② 金属片：plate 瘦长方 + 端部半圆盘（disc 贴片底端，一半嵌入=半圆弧）；三片品字三角排列
// ③ 后弧 start=0.051（精密：电机 r 0.05 + 弧线半粗 0.00075——贴电机外缘不穿不悬空）
// ④ 前弧 start=0 恢复（与前脸圆/固定盘接触为正常设计）
window.gms.clear(); // 必须分号：下行以 ( 开头时 ASL 会把 clear()(...) 合并成调用返回值
(() => { const o = window.gms.summary().options; const K = o.canvasHeightPx / o.heightMeters; const CX = o.canvasWidthPx / 2; const B = o.canvasHeightPx; window.gms.curve([[CX, B-0.37*K], [CX+0.012*K, B-0.28*K], [CX+0.06*K, B-0.11*K], [CX+0.155*K, B-0.06*K]], false, {size:0.005, transform:{position:[0,0,-0.10]}, color:'#2b3038'}) })()  // 0 电线曲线（米制→画布换算；终点=橡皮体中心）
window.gms.part('el-disc', {x:0.155, y:0.06, z:-0.10, rx:0.022, ry:0.015, thick:0.012, axis:'up', color:'#1f232b'})  // 1 插头橡皮体
window.gms.part('plate',   {x:0.147, y:0.055, z:-0.10, len:0.022, wid:0.005, thick:0.0015, color:'#c0c4cc'})  // 2 金属片·上左（火线）
window.gms.part('disc',    {x:0.147, y:0.053, z:-0.10, r:0.0025, thick:0.0015, axis:'front', color:'#c0c4cc'})  // 3 半圆弧（贴片底端）
window.gms.part('plate',   {x:0.163, y:0.055, z:-0.10, len:0.022, wid:0.005, thick:0.0015, color:'#c0c4cc'})  // 4 金属片·上右（零线）
window.gms.part('disc',    {x:0.163, y:0.053, z:-0.10, r:0.0025, thick:0.0015, axis:'front', color:'#c0c4cc'})  // 5
window.gms.part('plate',   {x:0.155, y:0.055, z:-0.10, len:0.022, wid:0.005, thick:0.0015, color:'#c0c4cc'})  // 6 金属片·下中（地线）
window.gms.part('disc',    {x:0.155, y:0.053, z:-0.10, r:0.0025, thick:0.0015, axis:'front', color:'#c0c4cc'})  // 7
window.gms.part('disc',    {x:0, y:0.01,  z:-0.04, r:0.13,  thick:0.02, color:'#3f4650'})   // 8 底座
window.gms.part('rod',     {x1:0, y1:0.37, z:-0.06, x2:0, y2:0.012, size:0.02, color:'#5b6270'})  // 9 支架
window.gms.part('ring',    {x:0, y:0.416,  z:-0.004, r:0.125, size:0.004, color:'#aab4c0'})   // 10 后环
window.gms.part('arc',     {x:0, y:0.416,  z:-0.004, r:0.125, rise:-0.04, start:0.051, size:0.0015, color:'#9aa6b2'})  // 11 后弧源（start=电机r+半粗，贴电机外缘）
window.gms.rotatem(11, 0, 0.416, 36)
window.gms.part('ring',    {x:0, y:0.416,  z:-0.06, r:0.05, size:0.012, color:'#6b7280'})   // 47 后中心环
window.gms.part('disc',    {x:0, y:0.416,  z:-0.075, r:0.05, thick:0.09, axis:'front', color:'#4a4f57'})  // 48 电机
window.gms.part('disc',    {x:0.02, y:0.476, z:-0.075, r:0.011, thick:0.022, axis:'up', color:'#2f3a4d'})  // 49 摇头按钮（高）
window.gms.part('disc',    {x:-0.02, y:0.471, z:-0.075, r:0.011, thick:0.012, axis:'up', color:'#39475c'})  // 50 开关按钮（矮）
window.gms.part('disc',    {x:0, y:0.416,  z:-0.015, r:0.02, thick:0.03, axis:'front', color:'#8b95a3'})  // 51 前轴
window.gms.part('disc',    {x:0, y:0.416,  z:-0.125, r:0.015, thick:0.01, axis:'front', color:'#8b95a3'})  // 52 后轴
window.gms.part('el-disc', {x:0.076, y:0.416, z:0, rx:0.042, ry:0.025, thick:0.002, axis:'front', rotation:[102,0,0], color:'#e8c15a'})  // 53 叶片源
window.gms.rotatem(53, 0, 0.416, 3)
window.gms.part('ring',    {x:0, y:0.416,  z:0, r:0.125, size:0.0075, color:'#c3ccd6'})   // 56 焊接圈
window.gms.part('disc',    {x:0, y:0.416,  z:0, r:0.035, thick:0.004, axis:'front', color:'#7a8494'})  // 57 固定盘
window.gms.part('disc',    {x:0, y:0.416,  z:0.02, r:0.035, thick:0.004, axis:'front', color:'#8a94a4'})  // 58 前脸圆
window.gms.part('ring',    {x:0, y:0.416,  z:0.004, r:0.125, size:0.004, color:'#b8c2cc'})   // 59 前环
window.gms.part('arc',     {x:0, y:0.416,  z:0.004, r:0.125, rise:0.04, size:0.0015, color:'#aab6c2'})  // 60 前弧源（恢复 start=0：与中心盘接触为正常设计）
window.gms.rotatem(60, 0, 0.416, 36)