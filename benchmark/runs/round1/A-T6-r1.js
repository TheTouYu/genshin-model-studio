// Ferris wheel: 摩天轮
gms.clear();

// === 大轮：前后两圈同心圆环 ===
// 轮心高度 cy=1.3，轮半径 r=0.8
const cx = 0;
const cy = 1.3;
const r = 0.8;

// 前圈
gms.part('ring', { x: cx, y: cy, z: 0.08, r, size: 0.035, color: "#d33a3a" });
// 后圈
gms.part('ring', { x: cx, y: cy, z: -0.08, r, size: 0.035, color: "#d33a3a" });

// === 轴：轮心处短竖轴 ===
gms.part('rod', { x1: cx, y1: cy - 0.15, x2: cx, y2: cy + 0.15, z: 0, size: 0.06, color: "#8a8a8a" });

// === 吊舱：6 个，绕轮心均匀分布（相邻夹角 60°），座舱中心到轮心距离 = r ===
// 座舱用 el-disc，局部朝轮心，中心位于半径 r 处
function cabin(angleDeg) {
  const a = angleDeg * Math.PI / 180;
  const px = cx + r * Math.cos(a);
  const py = cy + r * Math.sin(a);
  // 座舱绕自身(朝轮心方向)旋转：在 xy 平面内让椭盘长轴沿径向？用绕 z? 
  // 这里使座舱水平放置（axis 朝前），并让顶部略朝向圆心方向不变，简单处理。
  gms.part('disc', { x: px, y: py, z: 0, r: 0.12, thick: 0.2, axis: 'front', color: "#3a7ad3" });
}

cabin(0);    // 右侧
cabin(60);
cabin(120);
cabin(180);
cabin(240);
cabin(300);

// === 支架：左右两根斜撑杆，从地面支撑轮轴 ===
// 两杆底端贴地(y=0)，顶端支撑轮心高度附近，分别支撑轮轴两端
// 左杆：底( -1.1, 0 ) → 顶( cx-0.05, cy-0.1 )
gms.part('rod', { x1: -1.1, y1: 0, x2: cx - 0.05, y2: cy - 0.1, z: -0.04, size: 0.07, color: "#4a4a4a" });
gms.part('rod', { x1: -1.1, y1: 0, x2: cx - 0.05, y2: cy - 0.1, z: 0.04, size: 0.07, color: "#4a4a4a" });
// 右杆：底( 1.1, 0 ) → 顶( cx+0.05, cy-0.1 )
gms.part('rod', { x1: 1.1, y1: 0, x2: cx + 0.05, y2: cy - 0.1, z: -0.04, size: 0.07, color: "#4a4a4a" });
gms.part('rod', { x1: 1.1, y1: 0, x2: cx + 0.05, y2: cy - 0.1, z: 0.04, size: 0.07, color: "#4a4a4a" });
