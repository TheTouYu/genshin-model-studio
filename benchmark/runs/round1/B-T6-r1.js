gms.clear();

// ---- 尺寸规划 ----
// 轮半径 R = 0.62，轮心高度 H = 1.2（轮整体 0.6~1.8，在地面之上）
// 前后两圈同心圆环（环平面竖直朝前，z 偏 ±0.03）
var R = 0.62;
var H = 1.2;

// ============ 1. 大轮：两个同心圆环（前后各一圈） ============
gms.part('ring', { x: 0, y: H, z: -0.03, r: R, size: 0.025, color: '#cc4444' });
gms.part('ring', { x: 0, y: H, z: 0.03,  r: R, size: 0.025, color: '#cc4444' });

// ============ 2. 6 个吊舱：绕轮心均匀分布，位于轮缘 ============
// 每个吊舱中心在半径 R 处；小椭圆盘，后环（z=-0.05）之后
var cabins = [
  { cx: 0,            cy: H + R },
  { cx: R * 0.866,    cy: H + R * 0.5 },
  { cx: R * 0.866,    cy: H - R * 0.5 },
  { cx: 0,            cy: H - R },
  { cx: -R * 0.866,   cy: H - R * 0.5 },
  { cx: -R * 0.866,   cy: H + R * 0.5 }
];
for (var i = 0; i < 6; i++) {
  var c = cabins[i];
  gms.part('el-disc', { x: c.cx, y: c.cy, z: -0.08, rx: 0.16, ry: 0.12, thick: 0.05, axis: 'front', rotation: [0, 0, 0], color: '#e8c060' });
}

// ============ 3. 轴：轮心处短轴连接 ============
// 竖直短轴置于轮心
gms.part('disc', { x: 0, y: H, z: 0, r: 0.05, thick: 0.05, axis: 'up', color: '#bbbbbb' });

// ============ 4. 支架：左右两根斜撑杆，底端贴地，顶端支撑轮心 ============
var W = 0.75;   // 两杆底端水平间距
var rodThick = 0.03;
// 左杆：底端 (-W, 0) → 顶端 (0, H)
gms.part('rod', { x1: -W, y1: 0, x2: 0, y2: H, z: 0, size: rodThick, color: '#888888' });
// 右杆：底端 (W, 0) → 顶端 (0, H)
gms.part('rod', { x1: W, y1: 0, x2: 0, y2: H, z: 0, size: rodThick, color: '#888888' });
