// 电风扇画法（extrude 模式）
// 已知限制：solid 只支持圆/椭圆/矩形轮廓。
// 叶片朝向：axis='front'（长轴水平、短轴竖直、厚度沿前后）；副本带 angle 后
// 服务端编码 rotation=[90, k·120°, 0] 呈 0/120/240 辐向（side 长轴锁竖直，无法表达辐向）。
// 电机/叶片离地抬升（八期修复）：solid 柱体底默认贴 y=0（position.y = 厚度/2），
// 而罩子/辐条（杆）的画布 y → 世界 y——风扇侧视画法下电机/叶片会"掉"到地面。
// 修复：给电机/叶片 solid 加 lift（米），把柱体底抬到罩子中心高度。
//
// 换算过程（浏览器实测，不硬编码 0.416）：
//   gms.summary().options.calibration → "320px = 1m"（canvasHeightPx=320 = heightMeters=1）
//   笔画总 bbox 底 = 底座椭圆下缘 maxY = cy+95+38 = 383（画布 y 下为正；支架/底座画到底后稳定）
//   罩子中心画布 y = cy = 250 → 离地 px = 383−250 = 133 → 离地米 = 133 × (1/320) = 0.415625
//   电机：position.y = 厚度/2 + lift = 0.415625 → lift = 0.415625 − 0.03/2 = 0.400625
//   叶片：position.y = 厚度/2 + lift = 0.415625 → lift = 0.415625 − 0.002/2 = 0.414625
const cx = 302, cy = 250;
const CAL_PX = 320;                              // px/m：gms.summary().options.calibration 实测
const GROUND_Y = cy + 95 + 38;                   // bbox 底：底座椭圆下缘（画到 383 即接地）
const LIFT_M = (GROUND_Y - cy) / CAL_PX;         // 罩子中心离地高度（米）≈ 0.416
const liftToCenter = (thickness) => LIFT_M - thickness / 2; // solid 中心抬到罩子中心所需的 lift
window.gms.mode('extrude');
window.gms.clear();
// 防护罩外环（杆环）
window.gms.circle(cx, cy, 80);
// 辐条：中心到环边，旋转复制 4 份（含源）；transform.position[2]=-0.08 把辐条
// 移到电机（z=-0.045）与后罩（z=-0.10）之间——叶片在 z=0 平面，辐条不再与叶片共面
// （十一期：叶片/电机/后罩是旋转组「fan」，辐条/外罩/支架/底座是静止件；
// 服务端 sweepWarnings 会检测旋转组扫掠盘与静止件重叠并提示）
window.gms.line(cx, cy, cx + 80, cy, {transform: {position: [0, 0, -0.08]}});
window.gms.rotate(1, cx, cy, 4);
// 电机主体：柱体（圆面朝前后 Z），加大到 r=14（直径 0.0875），沿 Z 长 0.08；
// transform.position[2]=-0.045 让柱体从叶片平面（z=0）稍向后伸出（叶片/电机不再共面）
window.gms.circle(cx, cy, 14, {render: 'solid', height: 0.08, axis: 'front', lift: liftToCenter(0.08), transform: {position: [0, 0, -0.045]}, group: 'fan'});
// 后罩：比电机大的圆盘（r=20，直径 0.125），在电机后方（z=-0.10），模拟风扇电机后盖
window.gms.circle(cx, cy, 20, {render: 'solid', height: 0.015, axis: 'front', lift: liftToCenter(0.015), transform: {position: [0, 0, -0.10]}, group: 'fan'});
// 叶片：扁椭圆 loop（solid 只支持圆/椭圆/矩形）
// axis='front'：长轴（局部 X）水平、短轴（局部 Z）竖直、厚度（局部 Y）沿前后；
// gms.rotate 在副本上记录 transform.rotation=[90+k·120°, 90, 90]（绕 Z 三叶，长轴=位置方向）与 position（画布旋转的 y 偏移）；
// lift 由 makeRotationCopies 透传给副本（三片同高度）。
const blade = [];
for (let i = 0; i <= 24; i++) { const a = (i / 24) * 2 * Math.PI; blade.push([cx + 14 + 40 * Math.cos(a), cy + 28 * Math.sin(a)]); }
window.gms.loop(blade, {render: 'solid', height: 0.002, axis: 'front', lift: liftToCenter(0.002), group: 'fan'});
window.gms.rotate(7, cx, cy, 3);
// 支架：从罩子中心画到画布底部（与底座/bbox 底一致 → 底端接地 y=0，消除悬空）
// 十一期：支架与辐条同平面（z=-0.08，电机后方）——不穿过叶片扫掠盘
window.gms.line(cx, cy, cx, GROUND_Y, {transform: {position: [0, 0, -0.08]}});
// 底座：扁椭圆（65x22 会被拒，60x38 可过），贴地（lift 不设）
const base = [];
for (let i = 0; i <= 16; i++) { const a = (i / 16) * 2 * Math.PI; base.push([cx + 60 * Math.cos(a), cy + 95 + 38 * Math.sin(a)]); }
window.gms.loop(base, {render: 'solid', height: 0.01});
