gms.clear();

// ---- 尺寸规划 ----
// 轮半径 R = 0.75（直径 1.5），轮心高度 H = 1.25
// 前后两圈同心圆环 z=±0.12；轮心平面 z=0 为旋转骨架与吊舱悬挂平面
// 四根十字斜撑位于旋转平面外侧 z=±0.2225，顶端贴住轮毂轴端面
// 受力链：地面 → 支架杆 → 轮毂轴(盘面) → 轮辐 → 轮缘横杆/环 → 绳索 → 座舱

var R = 0.75;
var H = 1.25;
var ringZ = 0.12;   // 环面相对轮心面的 z 偏移

// ============ 1. 大轮：两个同心圆环（前后各一圈） ============
gms.part('ring', { x: 0, y: H, z: -ringZ, r: R, size: 0.025, color: '#cc4444' });
gms.part('ring', { x: 0, y: H, z:  ringZ, r: R, size: 0.025, color: '#cc4444' });

// ============ 3. 轮毂：轮心处水平轴盘（沿 z 的短圆柱），两端伸到支架接触面 ============
// disc axis='front'：thick=0.42 → z 从 -0.21 到 +0.21；支架杆内侧面在 z=±0.21 面贴面接触
gms.part('disc', { x: 0, y: H, z: 0, r: 0.055, thick: 0.42, axis: 'front', color: '#bbbbbb' });

// ============ 4. 支架：四根斜撑（十字）从地面叉撑到轮轴两端，位于旋转平面外侧 ============
// 底端贴地 x=±0.85（跨距 1.70 ≥ 0.85×R=0.64），顶端交汇于 (0, H)，z=±0.2225（轴端面外 1.25cm，内侧面贴轴端面）
var footX = 0.85;
var rodSize = 0.025;

gms.part('rod', { x1: -footX, y1: 0, x2: 0, y2: H, z: -0.2225, size: rodSize, color: '#888888' });
gms.part('rod', { x1:  footX, y1: 0, x2: 0, y2: H, z: -0.2225, size: rodSize, color: '#888888' });
gms.part('rod', { x1: -footX, y1: 0, x2: 0, y2: H, z:  0.2225, size: rodSize, color: '#888888' });
gms.part('rod', { x1:  footX, y1: 0, x2: 0, y2: H, z:  0.2225, size: rodSize, color: '#888888' });

// ============ 2. 旋转骨架 + 吊舱（6 组，相邻 60°） ============
// 每组：轮辐（轮毂→轮缘）+ 环连接横杆（沿 z 连接两环）+ 1 根细绳索 + 竖直座舱
var angs = [90, 150, 210, 270, 330, 30];
var kSpoke = (R - 0.012) / R;   // 轮辐外端半径（与横杆相切，间隙 0.006=接触）
var ropeLen = 0.05;             // 绳索长度（挂点与座舱顶之间 = 0.05 ≥ 0.05）
var cabinRy = 0.10;             // 座舱半高（竖直 0.20 ≥ 水平 0.18）

for (var i = 0; i < 6; i++) {
  var a = angs[i] * Math.PI / 180;
  var px = R * Math.cos(a);      // 轮缘 x（相对轮心）
  var py = R * Math.sin(a);      // 轮缘 y（相对轮心）

  // 轮辐：从轮毂中心连到轮缘（旋转骨架，均匀 60°）
  gms.part('rod', { x1: 0, y1: H, x2: px * kSpoke, y2: H + py * kSpoke, z: 0, size: 0.012, color: '#999999' });

  // 环连接横杆：轮缘处沿 z 向连接前后两环（两端距环内面 7.5mm，接触容差内）
  gms.part('disc', { x: px, y: H + py, z: 0, r: 0.006, thick: 0.20, axis: 'front', color: '#aaaaaa' });

  // 细绳索：线径 0.012 ≤ 0.02，竖直绷直；上端端点相接轮辐外端挂点，下端接触座舱顶
  var hx = px * kSpoke;
  var hy = H + py * kSpoke;
  gms.part('rod', { x1: hx, y1: hy, x2: hx, y2: hy - ropeLen, z: 0, size: 0.012, color: '#dddddd' });

  // 座舱：竖直椭圆盘（受重力下垂姿态），中心在轮心平面 z=0，厚 0.10（小于环间距 0.24，与环留 5.75cm 间隙）
  gms.part('el-disc', {
    x: hx, y: hy - ropeLen - cabinRy, z: 0,
    rx: 0.09, ry: cabinRy, thick: 0.10, axis: 'front', rotation: [0, 0, 0], color: '#e8c060'
  });
}
