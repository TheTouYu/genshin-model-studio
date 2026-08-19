// Ferris wheel: 摩天轮（分层 2D 推理）
gms.clear();

const cx = 0;
const cy = 1.3;   // 轮心高度
const r = 0.8;    // 轮半径
const wheelZ = 0;  // 两环之间的 z 平面

// === 底层：支架结构（贴地 y=0）===
// 四根斜杆从地面十字斜撑到轮心平面外侧，避免穿过两环之间/转动路径。
// 杆底端贴地，顶端抵达轮心附近高度 cy，支撑轮轴两端(±x0 外侧)。
// 两环分别位于 z=±0.09，支架杆置于环平面外侧 z=±0.22。
const topY = cy;          // 顶端高度 = 轮心高度，支撑轮轴
const topXOut = 0.5;      // 顶端水平位置（轮心两侧）
const footX = 1.35;       // 杆底端贴地横向跨度
gms.part('rod', { x1: -footX, y1: 0, x2: -topXOut, y2: topY, z: -0.22, size: 0.06, color: "#4a4a4a" });
gms.part('rod', { x1: -footX, y1: 0, x2: -topXOut, y2: topY, z: 0.22, size: 0.06, color: "#4a4a4a" });
gms.part('rod', { x1: footX, y1: 0, x2: topXOut, y2: topY, z: -0.22, size: 0.06, color: "#4a4a4a" });
gms.part('rod', { x1: footX, y1: 0, x2: topXOut, y2: topY, z: 0.22, size: 0.06, color: "#4a4a4a" });
// 十字横向支撑与竖向叉杆稳定支架（贴地）
gms.part('rod', { x1: -footX, y1: 0, x2: -footX, y2: 0.15, z: -0.22, size: 0.05, color: "#4a4a4a" });
gms.part('rod', { x1: footX, y1: 0, x2: footX, y2: 0.15, z: -0.22, size: 0.05, color: "#4a4a4a" });

// === 轴：轮心处短竖轴（两端由支架顶端支撑）===
gms.part('rod', { x1: cx, y1: cy - 0.18, x2: cx, y2: cy + 0.18, z: 0, size: 0.07, color: "#8a8a8a" });

// === 大轮：前后两圈同心圆环（z 平面内）===
gms.part('ring', { x: cx, y: cy, z: 0.09, r, size: 0.035, color: "#d33a3a" });
gms.part('ring', { x: cx, y: cy, z: -0.09, r, size: 0.035, color: "#d33a3a" });

// === 吊舱：6 个，绕轮心均匀分布（相邻 60°），座舱中心到轮心距离 = r ===
// 座舱竖直悬挂（竖直尺寸 >= 水平），吊挂在两环之间，随轮转动保持竖直姿态。
function cabin(angleDeg) {
  const a = angleDeg * Math.PI / 180;
  const px = cx + r * Math.cos(a);
  const py = cy + r * Math.sin(a);
  // 主体：竖直椭盘，中心略低于轮缘连接点，模拟悬吊下垂
  gms.part('disc', { x: px, y: py - 0.14, z: 0, r: 0.13, thick: 0.12, axis: 'up', color: "#3a7ad3" });
  // 吊挂短杆
  gms.part('rod', { x1: px, y1: py, x2: px, y2: py - 0.08, z: 0, size: 0.02, color: "#9a9a9a" });
}
cabin(0);
cabin(60);
cabin(120);
cabin(180);
cabin(240);
cabin(300);
