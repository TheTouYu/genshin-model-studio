gms.clear();

// ---- 尺寸规划 ----
// 轮半径 R = 0.7，轮心高度 H = 1.25（轮最低点 0.55，高于地面）
// 前后两圈同心圆环：前环 z=+0.10，后环 z=-0.10，两环之间为吊舱悬挂带
// 四根十字斜撑位于旋转平面外侧 z=±0.20，顶端支撑轮轴两端

var R = 0.7;
var H = 1.25;
var ringZ = 0.10;    // 环面相对轮心面的 z 偏移
var size = 0.025;    // 环线径

// ============ 1. 大轮：两个同心圆环（前后各一圈） ============
gms.part('ring', { x: 0, y: H, z: -ringZ, r: R, size: size, color: '#cc4444' });
gms.part('ring', { x: 0, y: H, z:  ringZ, r: R, size: size, color: '#cc4444' });

// ============ 3. 轴：轮心处水平短轴（沿 z 贯穿两环并伸出到支架接触点） ============
// disc axis='front'：水平朝前（沿 z），thick=0.40 → 从 z=-0.20 到 z=+0.20
gms.part('disc', { x: 0, y: H, z: 0, r: 0.045, thick: 0.40, axis: 'front', color: '#bbbbbb' });

// ============ 4. 支架：四根斜撑（十字）从地面叉撑到轮轴两端，位于旋转平面外侧 ============
// 前侧两根在 z=-0.20 平面，后侧两根在 z=+0.20 平面（均在环面 z=±0.10 之外，不与轮环/吊舱转动路径相交）
// 每侧两根在 x 方向成八字形：底端贴地 ±0.85，顶端交汇于轮心 (0, H)，正好顶住轴端
var footX = 0.85;
var rodSize = 0.03;

gms.part('rod', { x1: -footX, y1: 0, x2: 0, y2: H, z: -0.20, size: rodSize, color: '#888888' });
gms.part('rod', { x1:  footX, y1: 0, x2: 0, y2: H, z: -0.20, size: rodSize, color: '#888888' });
gms.part('rod', { x1: -footX, y1: 0, x2: 0, y2: H, z:  0.20, size: rodSize, color: '#888888' });
gms.part('rod', { x1:  footX, y1: 0, x2: 0, y2: H, z:  0.20, size: rodSize, color: '#888888' });

// ============ 2. 6 个吊舱：绕轮心均匀分布（相邻 60°），悬挂在两环之间，竖直下垂姿态 ============
// 每舱：轮辐杆（z=0，从轮心到轮缘）+ 竖直椭圆座舱（z=±0.05，位于两环之间，中心略低于挂点模拟重力下垂）
var angs = [90, 150, 210, 270, 330, 30];
for (var i = 0; i < 6; i++) {
  var a = angs[i] * Math.PI / 180;
  var px = R * Math.cos(a);
  var py = R * Math.sin(a);
  var hang = 0.06; // 吊舱相对挂点的下垂量（座舱中心到轮心距离仍约等于轮半径）
  gms.part('rod', { x1: 0, y1: H, x2: px, y2: H + py, z: 0, size: 0.02, color: '#999999' });
  gms.part('el-disc', {
    x: px, y: H + py - hang, z: (i % 2 === 0 ? -0.05 : 0.05),
    rx: 0.10, ry: 0.14, thick: 0.04, axis: 'front', rotation: [0, 0, 0], color: '#e8c060'
  });
}
