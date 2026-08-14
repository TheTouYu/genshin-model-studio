// 电风扇画法（extrude 模式）
// 十二期修复（视觉核验驱动，gpt-5.6-sol 报告见 docs/ 复盘）：
//  1. 外环/辐条/支架同平面 z=-0.04（外环原 z=0、辐条/支架 z=-0.08 → 环与辐条轴向断开约 5cm，
//     核验"高"缺陷；统一后同面连接；z=-0.04 与叶片盘 z=0 间隙 3.9cm，不触发旋转组扫掠冲突）
//  2. 后罩 z=-0.10 → -0.085（与电机后表面 z=-0.085 相接，消除 7.5mm 间隙；电机 z∈[-0.085,-0.005]）
//  3. 外环 48 点（原 circle 24 点 → RDP 后仅 32 段，近景多边形明显；48 点环段数翻倍以上）
//  4. 叶片桨距角 12°：源 transform.rotation=[90+12,0,0]（绕长轴=世界 X 转 12°，平板变扭转曲面感），
//     副本由 makeRotationCopies 四元数通用化继承（web/index.html 十二期补丁；闭式等价已用
//     .bh/verify-euler2.mjs 矩阵验证）
//  5. 电机/叶片间 4mm 间隙保留（旋转件与静止件的工程间隙，属正常）
// 已知限制：solid 只支持圆/椭圆/矩形轮廓。
// 叶片朝向：axis='front'（长轴水平、短轴竖直、厚度沿前后）。
// 电机/叶片离地抬升：solid 柱体底默认贴 y=0，给 solid 加 lift（米）抬到罩子中心高度。
//
// 换算过程（浏览器实测）：
//   gms.summary().options.calibration → "320px = 1m"
//   笔画总 bbox 底 = 底座椭圆下缘 maxY = cy+95+38 = 383（画布 y 下为正）
//   罩子中心画布 y = cy = 250 → 离地 px = 383−250 = 133 → 离地米 = 133/320 = 0.415625
//   电机：position.y = 厚度/2 + lift = 0.415625 → lift = 0.415625 − 0.08/2 = 0.375625
//   叶片：lift = 0.415625 − 0.002/2 = 0.414625
const cx = 302, cy = 250;
const CAL_PX = 320;                              // px/m：gms.summary().options.calibration 实测
const GROUND_Y = cy + 95 + 38;                   // bbox 底：底座椭圆下缘（画到 383 即接地）
const LIFT_M = (GROUND_Y - cy) / CAL_PX;         // 罩子中心离地高度（米）≈ 0.416
const liftToCenter = (thickness) => LIFT_M - thickness / 2; // solid 中心抬到罩子中心所需的 lift
// 十二期：外环/辐条/支架统一后移平面（叶片 z=0 之后、电机 z=-0.045 之前）
const RING_Z = -0.04;
window.gms.mode('extrude');
window.gms.clear();
// 防护罩外环（杆环，48 点密圆 + 后移 RING_Z 与辐条同面连接）
const ring = [];
for (let i = 0; i < 48; i++) { const a = (i / 48) * 2 * Math.PI; ring.push([cx + 80 * Math.cos(a), cy + 80 * Math.sin(a)]); }
window.gms.loop(ring, {transform: {position: [0, 0, RING_Z]}});
// 辐条：中心到环边，旋转复制 4 份（含源）；与环同平面（z=RING_Z）——不再断开
window.gms.line(cx, cy, cx + 80, cy, {transform: {position: [0, 0, RING_Z]}});
window.gms.rotate(1, cx, cy, 4);
// 电机主体：柱体（圆面朝前后 Z），r=14（直径 0.0875），沿 Z 长 0.08；
// transform.position[2]=-0.045 让柱体从叶片平面（z=0）稍向后伸出（叶片/电机不再共面）
window.gms.circle(cx, cy, 14, {render: 'solid', height: 0.08, axis: 'front', lift: liftToCenter(0.08), transform: {position: [0, 0, -0.045]}, group: 'fan'});
// 后罩：比电机大的圆盘（r=20，直径 0.125），z=-0.085 与电机后表面相接（消除间隙）
window.gms.circle(cx, cy, 20, {render: 'solid', height: 0.015, axis: 'front', lift: liftToCenter(0.015), transform: {position: [0, 0, -0.085]}, group: 'fan'});
// 叶片：扁椭圆 loop（solid 只支持圆/椭圆/矩形）
// axis='front'：长轴（局部 X）水平、短轴（局部 Z）竖直、厚度（局部 Y）沿前后；
// 十二期桨距角：transform.rotation=[90+12,0,0] 绕长轴（=世界 X）转 12° 给平板叶片扭转感；
// gms.rotate 副本经四元数通用化继承扭转并绕 Z 三叶（[90+θ°,·,·] 分支由 THREE 决定）；
// lift 由 makeRotationCopies 透传给副本（三片同高度）。
const blade = [];
for (let i = 0; i <= 24; i++) { const a = (i / 24) * 2 * Math.PI; blade.push([cx + 14 + 40 * Math.cos(a), cy + 28 * Math.sin(a)]); }
window.gms.loop(blade, {render: 'solid', height: 0.002, axis: 'front', lift: liftToCenter(0.002), transform: {rotation: [102, 0, 0]}, group: 'fan'});
window.gms.rotate(7, cx, cy, 3);
// 支架：从罩子中心画到画布底部（底端接地 y=0，消除悬空）；与辐条同平面（z=RING_Z）
window.gms.line(cx, cy, cx, GROUND_Y, {transform: {position: [0, 0, RING_Z]}});
// 底座：扁椭圆（65x22 会被拒，60x38 可过），贴地（lift 不设）
const base = [];
for (let i = 0; i <= 16; i++) { const a = (i / 16) * 2 * Math.PI; base.push([cx + 60 * Math.cos(a), cy + 95 + 38 * Math.sin(a)]); }
window.gms.loop(base, {render: 'solid', height: 0.01});
