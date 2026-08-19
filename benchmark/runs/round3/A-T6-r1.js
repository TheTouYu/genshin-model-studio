// Ferris wheel: 摩天轮（分层 2D 推理 + 物理合理性，第 3 轮细化）
gms.clear();

const cx = 0;
const cy = 1.3;   // 轮心高度
const r = 0.8;    // 轮半径
const ringZ = 0.09; // 两环分别朝前/朝后偏 0.09（两环间距 0.18）

// === 第 1 层：支架（贴地 y=0）===
// 四根斜杆从地面十字斜撑到轮心平面外侧，避开两环之间与转动路径。
// 杆顶端抵达轮心两侧外端（承重点），两环平面 z=±0.09，支架置于 z=±0.22 外侧。
const topY = cy;         // 顶端高度 = 轮心高度
const topXOut = 0.45;    // 顶端水平位置（轮心两侧，轮毂承重点之下）
const footX = 1.35;      // 杆底端贴地横向跨度
gms.part('rod', { x1: -footX, y1: 0, x2: -topXOut, y2: topY, z: -0.22, size: 0.06, color: "#4a4a4a" });
gms.part('rod', { x1: -footX, y1: 0, x2: -topXOut, y2: topY, z: 0.22, size: 0.06, color: "#4a4a4a" });
gms.part('rod', { x1: footX, y1: 0, x2: topXOut, y2: topY, z: -0.22, size: 0.06, color: "#4a4a4a" });
gms.part('rod', { x1: footX, y1: 0, x2: topXOut, y2: topY, z: 0.22, size: 0.06, color: "#4a4a4a" });

// === 第 2 层：轮毂（支架顶端建立物理连接，轴与轮环支撑点）===
// 轮毂：位于轮心平面的竖直盘，把两侧支架顶端/轮轴连成一体，作为轮环支撑点。
gms.part('disc', { x: cx, y: cy, z: 0, r: 0.32, thick: 0.06, axis: 'up', color: "#7a6d5a" });

// 轴：轮心处短竖轴，两端分别接触支架顶端（y=cy±0.12），并通过轮毂获得支撑
gms.part('rod', { x1: cx, y1: cy - 0.12, x2: cx, y2: cy + 0.12, z: 0, size: 0.07, color: "#8a8a8a" });

// === 第 3 层：大轮（前后两圈同心圆环节面，位于轮毂两侧）===
gms.part('ring', { x: cx, y: cy, z: ringZ, r, size: 0.035, color: "#d33a3a" });
gms.part('ring', { x: cx, y: cy, z: -ringZ, r, size: 0.035, color: "#d33a3a" });

// === 第 4 层：吊舱（统一悬挂在轮心平面 z=0，两环正中；随轮转动保持竖直）===
// 每个吊舱由 1 根细绳索从轮缘挂点垂下，座舱竖直下垂（竖直尺寸 >= 水平）。
// 挂点与座舱顶之间至少 0.05m。
function cabin(angleDeg) {
  const a = angleDeg * Math.PI / 180;
  const px = cx + r * Math.cos(a);
  const py = cy + r * Math.sin(a);
  // 细绳索：挂点(轮缘) → 座舱顶，绳线径 0.015
  gms.part('rod', { x1: px, y1: py, x2: px, y2: py - 0.12, z: 0, size: 0.015, color: "#c8c8c8" });
  // 座舱主体：竖直椭盘（竖直直径 0.26 > 水平），吊挂于两环正中间（z=0）
  gms.part('disc', { x: px, y: py - 0.12 - 0.13, z: 0, r: 0.13, thick: 0.12, axis: 'up', color: "#3a7ad3" });
}
cabin(0);
cabin(60);
cabin(120);
cabin(180);
cabin(240);
cabin(300);
