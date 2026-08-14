// 电风扇画法 v2（组件化：gms.part + gms.rotatem，十三期）
// 修复（用户亲自核验 2026-08-14）：
//  ① 叶片交错：旧版叶片中心距电机中心仅 0.04375m 而半长轴 0.125m——三片任意两片重叠
//     （历轮视觉代理复验漏检，核验断言缺"叶片-叶片间距"）。新参数采用 v3-gpt 实测验证的方案：
//     中心距 0.15m、半长轴 0.09m（叶片 0.18×0.125m）→ 相邻中心距 0.26m > 0.18m 不交，
//     内缘 0.06m 与电机（r=0.04375）留 16mm 间隙，外缘 0.24m 贴环内缘。
//  ② 外壳缺失：旧版只有单层外环+辐条。补前护罩层（z=+0.05 前环 + 4 前辐条），
//     与后层（z=-0.04 环/辐条/支架）夹住叶片（z=0）——真实风扇前后护罩结构。
//  ③ 全部用米制世界坐标（gms.part / gms.rotatem），零像素换算。
window.gms.clear()
window.gms.part('disc',    {x:0, y:0.006,  z:-0.04, r:0.1,    thick:0.012, color:'#3f4650'})   // 0 底座（先画定 bbox 底）
window.gms.part('rod',     {x1:0, y1:0.416, z:-0.04, x2:0, y2:0.01,               color:'#5b6270'})  // 1 支架
window.gms.part('ring',    {x:0, y:0.416,  z:-0.04, r:0.25,                     color:'#aab4c0'})   // 2 后环
window.gms.part('rod',     {x1:0, y1:0.416, z:-0.04, x2:0.25, y2:0.416,          color:'#9aa6b2'})  // 3 后辐条源
window.gms.rotatem(3, 0, 0.416, 4)  // 后辐条×4（米制中心，副本 4-6）
window.gms.part('disc',    {x:0, y:0.416,  z:-0.045, r:0.04375, thick:0.08, axis:'front', color:'#4a4f57'})  // 7 电机
window.gms.part('disc',    {x:0, y:0.416,  z:-0.085, r:0.0625, thick:0.015, axis:'front', color:'#6b7280'})  // 8 后罩
window.gms.part('el-disc', {x:0.15, y:0.416, z:0, rx:0.09, ry:0.0625, thick:0.002, axis:'front', rotation:[102,0,0], color:'#e8c15a'})  // 9 叶片源（桨距 12°）
window.gms.rotatem(9, 0, 0.416, 3)  // 叶片×3（副本 10-11）
window.gms.part('ring',    {x:0, y:0.416,  z:0.05, r:0.25,                      color:'#b8c2cc'})   // 12 前环
window.gms.part('rod',     {x1:0, y1:0.416, z:0.05, x2:0.25, y2:0.416,           color:'#aab6c2'})  // 13 前辐条源
window.gms.rotatem(13, 0, 0.416, 4)  // 前辐条×4（副本 14-16）