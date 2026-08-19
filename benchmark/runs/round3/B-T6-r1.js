gms.clear();

// ---- 尺寸规划 ----
// 轮半径 R = 0.75（直径 1.5，在 0.8~1.8 范围内），轮心高度 H = 1.25（在 1.0~1.5 范围内）
// 前后两圈同心圆环：z=±0.10，环间距 0.20；轮心面 z=0 为吊舱悬挂平面
// 四根十字斜撑位于旋转平面外侧 z=±0.20，顶端顶住轮轴端面

var R = 0.75;
var H = 1.25;
var ringZ = 0.10;

// ============ 1. 大轮：两个同心圆环（前后各一圈） ============
gms.part('ring', { x: 0, y: H, z: -ringZ, r: R, size: 0.025, color: '#cc4444' });
gms.part('ring', { x: 0, y: H, z:  ringZ, r: R, size: 0.025, color: '#cc4444' });

// ============ 3. 轴 / 轮毂：轮心处水平短轴（盘面），沿 z 贯穿两环并伸出到支架接触点 ============
// disc axis='front'：沿 z 方向，thick=0.40 → 从 z=-0.20 到 z=+0.20，两端与支架杆顶端面贴面接触
gms.part('disc', { x: 0, y: H, z: 0, r: 0.05, thick: 0.40, axis: 'front', color: '#bbbbbb' });

// ============ 4. 支架：四根斜撑（十字）从地面叉撑到轮轴两端，位于旋转平面外侧 ============
// 前侧两根在 z=-0.20 平面，后侧两根在 z=+0.20 平面（环面 ±0.10 之外，不与轮环/吊舱/辐条转动路径相交）
// 底端贴地 ±0.85，顶端交汇于 (0, H)，正好顶住轮毂轴端
var footX = 0.85;
var rodSize = 0.03;

gms.part('rod', { x1: -footX, y1: 0, x2: 0, y2: H, z: -0.20, size: rodSize, color: '#888888' });
gms.part('rod', { x1:  footX, y1: 0, x2: 0, y2: H, z: -0.20, size: rodSize, color: '#888888' });
gms.part('rod', { x1: -footX, y1: 0, x2: 0, y2: H, z:  0.20, size: rodSize, color: '#888888' });
gms.part('rod', { x1:  footX, y1: 0, x2: 0, y2: H, z:  0.20, size: rodSize, color: '#888888' });

// ============ 2. 6 个吊舱：绕轮心均匀分布（相邻 60°），统一悬挂在轮心平面 z=0（两环正中） ============
// 每个吊舱：轮辐（轮毂→轮缘）+ 1 根细绳索（挂点→座舱顶，长 0.05）+ 竖直椭圆座舱（受重力竖直下垂）
var angs = [90, 150, 210, 270, 330, 30];
for (var i = 0; i < 6; i++) {
  var a = angs[i] * Math.PI / 180;
  var px = R * Math.cos(a);        // 轮缘挂点 x（相对轮心）
  var py = R * Math.sin(a);        // 轮缘挂点 y（相对轮心）
  var ropeLen = 0.05;              // 绳索长度（挂点与座舱顶之间 ≥ 0.05）
  var cabinRy = 0.10;              // 座舱半高（竖直），竖直尺寸 0.20 ≥ 水平 0.18

  // 轮辐：从轮毂中心连到轮缘挂点（轮环通过轮毂+辐条获得物理支撑，非仅"穿过"）
  gms.part('rod', { x1: 0, y1: H, x2: px, y2: H + py, z: 0, size: 0.02, color: '#999999' });
  // 细绳索：线径 0.014 ≤ 0.02，从挂点垂直垂下
  gms.part('rod', { x1: px, y1: H + py, x2: px, y2: H + py - ropeLen, z: 0, size: 0.014, color: '#dddddd' });
  // 座舱：竖直椭圆盘，中心在轮心平面 z=0，厚 0.10（小于环间距 0.20，与环留有间隙）
  gms.part('el-disc', {
    x: px, y: H + py - ropeLen - cabinRy, z: 0,
    rx: 0.09, ry: cabinRy, thick: 0.10, axis: 'front', rotation: [0, 0, 0], color: '#e8c060'
  });
}
