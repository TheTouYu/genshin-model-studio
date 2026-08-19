// Ferris wheel: 摩天轮（分层 2D 推理 + 物理合理性，第 4 轮完整受力链）
gms.clear();

const cx = 0;
const cy = 1.3;      // 轮心高度
const r = 0.8;       // 轮半径
const ringZ = 0.09;  // 两环分别偏 ±0.09（间距 0.18）
const wheelZ = 0;    // 吊舱/轮辐所在旋转中心平面

// === 第 1 层：支架（贴地，底跨距 2.2 ≥ 0.85×r = 0.68）===
// 四根斜杆从地面十字斜撑到轮心平面外侧，顶端抵达轮毂承重点。
const topY = cy;
const topXOut = 0.5;
const footX = 1.1;
gms.part('rod', { x1: -footX, y1: 0, x2: -topXOut, y2: topY, z: -0.22, size: 0.06, color: "#4a4a4a" });
gms.part('rod', { x1: -footX, y1: 0, x2: -topXOut, y2: topY, z: 0.22, size: 0.06, color: "#4a4a4a" });
gms.part('rod', { x1: footX, y1: 0, x2: topXOut, y2: topY, z: -0.22, size: 0.06, color: "#4a4a4a" });
gms.part('rod', { x1: footX, y1: 0, x2: topXOut, y2: topY, z: 0.22, size: 0.06, color: "#4a4a4a" });

// === 第 2 层：轮毂 + 轴 ===
// 轮毂盘面：位于轮心平面，连接支架顶端与中心轴（受力连续）
gms.part('disc', { x: cx, y: cy, z: 0, r: 0.3, thick: 0.05, axis: 'up', color: "#7a6d5a" });
// 中心轴：短竖轴，贯穿轮毂，两端接触支架顶端
gms.part('rod', { x1: cx, y1: cy - 0.12, x2: cx, y2: cy + 0.12, z: 0, size: 0.07, color: "#8a8a8a" });

// === 第 3 层：轮毂横杆（轴与轮辐之间受力连续，6 根均匀分布）===
for (let i = 0; i < 6; i++) {
  const rad = i * 60 * Math.PI / 180;
  const x1 = cx + 0.1 * Math.cos(rad);
  const y1 = cy + 0.1 * Math.sin(rad);
  const x2 = cx + 0.42 * Math.cos(rad);
  const y2 = cy + 0.42 * Math.sin(rad);
  gms.part('rod', { x1, y1, x2, y2, z: wheelZ, size: 0.02, color: "#9a7a6a" });
}

// === 第 4 层：大轮（前后两圈同心圆环）===
gms.part('ring', { x: cx, y: cy, z: ringZ, r, size: 0.035, color: "#d33a3a" });
gms.part('ring', { x: cx, y: cy, z: -ringZ, r, size: 0.035, color: "#d33a3a" });

// === 第 5 层：轮辐骨架（6 根）+ 环连接横杆（每轮辐外端 2 根）===
// 第 5 层与第 6 层统一分 6 角显式书写，避免依赖 rotatem 的索引。
for (let i = 0; i < 6; i++) {
  const rad = i * 60 * Math.PI / 180;
  const px = cx + r * Math.cos(rad);
  const py = cy + r * Math.sin(rad);

  // 轮辐：轴心 → 轮缘
  gms.part('rod', { x1: cx, y1: cy, x2: px, y2: py, z: wheelZ, size: 0.03, color: "#c87040" });

  // 环连接横杆：轮缘处沿 z 向连接前后两环（z=-ringZ → z=+ringZ）
  gms.part('rod', { x1: px, y1: py, x2: px, y2: py, z: -ringZ, size: 0.02, color: "#c87040" });
  gms.part('rod', { x1: px, y1: py, x2: px, y2: py, z: ringZ, size: 0.02, color: "#c87040" });

  // 吊舱：细绳索从轮缘挂点垂下，上端接触挂点、下端接触座舱顶；座舱竖直下垂于两环正中
  const ropeLen = 0.16;  // ≥ 0.05
  gms.part('rod', { x1: px, y1: py, x2: px, y2: py - ropeLen, z: wheelZ, size: 0.015, color: "#c8c8c8" });
  gms.part('el-disc', { x: px, y: py - ropeLen - 0.12, z: wheelZ, rx: 0.09, ry: 0.12, thick: 0.1, axis: 'up', rotation: [0, 0, 0], color: "#3a7ad3" });
}
