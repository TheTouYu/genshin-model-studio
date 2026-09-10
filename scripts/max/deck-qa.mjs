#!/usr/bin/env node
/**
 * deck-qa —— 台面/前缘带「连续性与精细度」自动检测器（资产级工具，2026-09-11 立）
 *
 * 由来：前缘开盖凹槽（scoop）连续被用户打回三次，症状都是同一族——
 *   ① 质感割裂（凹槽像贴上去的一块）
 *   ② 不连续（板缝/台阶/悬空）
 *   ③ 多边形台阶（细密度不够）
 *   ④ 凹得太深/弧度太大
 * 这三族人眼要在浏览器里放大才看得出来，等用户发现就已经烧掉一轮。
 * 所以把**判据**做在这里：纯几何射线扫描，不开浏览器、不渲染，秒级出结论。
 *
 * 做法：对台面前缘带（默认 z ∈ [z0, z1]、全宽）按 cell 打一张俯视栅格，
 * 每格向下投射射线取**最上面的命中面** → 高度场 y(x,z) + 命中面颜色。
 * 在高度场上算 5 个判据：
 *   holes      无命中 / 命中面比台面低 >1mm 的格数（= 缝、悬空、看穿）
 *   step_max   相邻 0.5mm 格的高差最大值（= 台阶/断层）
 *   crease_max 二阶差分最大值（= 折痕，渲染成一条硬高光/硬阴影）
 *   depth      前缘带内相对台面拟合平面的最大下沉（= 凹槽深度）
 *   jag        下沉面的边界"拐角密度"（= 锯齿/多边形边界）
 *
 * 用法：
 *   node scripts/max/deck-qa.mjs web/draw/macbook-closed.json
 *   node scripts/max/deck-qa.mjs <mesh.json> --x0 -160 --x1 160 --z0 50 --z1 110.6 --cell 0.25 \
 *        --out .scratch/deckqa/run1 [--gates '{"step_max":0.10,"jag":0.15}']
 * 输出：<out>/report.json + <out>/height.pgm + <out>/mask.pgm + 一行结论（exit 1 = 判据不过）
 */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const meshPath = argv[0];
if (!meshPath) { console.error('usage: deck-qa.mjs <mesh.json> [--x0 .. --x1 .. --z0 .. --z1 .. --cell .. --out ..]'); process.exit(2); }
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const X0 = +arg('x0', -160), X1 = +arg('x1', 160);
const Z0 = +arg('z0', 50), Z1 = +arg('z1', 110.6);
const CELL = +arg('cell', 0.25);              // mm/格
const OUT = arg('out', path.join('.scratch', 'deckqa', path.basename(meshPath).replace(/\W+/g, '_')));
// 判据门（默认值 = 2026-09-11 基线标定；用户口径：「连续、精细、别凹太深」）
const GATES = JSON.parse(arg('gates', '{"holes":0,"step_max":0.05,"kink_max":0.35,"kink_px":40,"depth_max":1.8,"depth_min":0.5,"jag":0.20,"nang_max":12,"nang_px":400}'));

fs.mkdirSync(OUT, { recursive: true });
const raw = JSON.parse(fs.readFileSync(meshPath, 'utf8'));
const V = raw.vertices.map((v) => [v[0] * 1000, v[1] * 1000, v[2] * 1000]);   // → mm
const F = raw.faces;
const COL = raw.colors || [];
const NRM = raw.normals || null;   // 页面网格带解析法线 → 可以用**法线场**判「质感割裂」
console.log(`mesh: ${V.length} verts / ${F.length / 3} tris | region x[${X0},${X1}] z[${Z0},${Z1}] cell ${CELL}mm`);

// ---- 2D 桶索引（按三角形 (x,z) bbox 入桶）----
const B = 2.0;                                   // 桶边长 mm
const nx = Math.ceil((X1 - X0) / B) + 1, nz = Math.ceil((Z1 - Z0) / B) + 1;
const buckets = new Map();
const bkey = (i, j) => i * 100000 + j;
for (let t = 0; t < F.length; t += 3) {
  const a = V[F[t]], b = V[F[t + 1]], c = V[F[t + 2]];
  const xa = Math.min(a[0], b[0], c[0]), xb = Math.max(a[0], b[0], c[0]);
  const za = Math.min(a[2], b[2], c[2]), zb = Math.max(a[2], b[2], c[2]);
  if (xb < X0 || xa > X1 || zb < Z0 || za > Z1) continue;
  const i0 = Math.max(0, Math.floor((xa - X0) / B)), i1 = Math.min(nx - 1, Math.floor((xb - X0) / B));
  const j0 = Math.max(0, Math.floor((za - Z0) / B)), j1 = Math.min(nz - 1, Math.floor((zb - Z0) / B));
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const k = bkey(i, j); let arr = buckets.get(k); if (!arr) buckets.set(k, (arr = [])); arr.push(t / 3);
  }
}

// ---- 竖直射线（Möller–Trumbore，只看 +y 方向命中里最高的那个）----
function topHit(px, pz) {
  const i = Math.floor((px - X0) / B), j = Math.floor((pz - Z0) / B);
  const arr = buckets.get(bkey(i, j));
  if (!arr) return null;
  let bestY = -Infinity, bestTri = -1, bestN = null;
  for (const ti of arr) {
    const a = V[F[ti * 3]], b = V[F[ti * 3 + 1]], c = V[F[ti * 3 + 2]];
    // 2D 重心坐标（射线沿 y，只需 x-z 平面）
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((b[2] - c[2]) * (px - c[0]) + (c[0] - b[0]) * (pz - c[2])) / d;
    const l2 = ((c[2] - a[2]) * (px - c[0]) + (a[0] - c[0]) * (pz - c[2])) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const y = l1 * a[1] + l2 * b[1] + l3 * c[1];
    if (y > bestY) {
      bestY = y; bestTri = ti;
      if (NRM) {
        const na = NRM[F[ti * 3]], nb = NRM[F[ti * 3 + 1]], nc = NRM[F[ti * 3 + 2]];
        bestN = [l1 * na[0] + l2 * nb[0] + l3 * nc[0], l1 * na[1] + l2 * nb[1] + l3 * nc[1], l1 * na[2] + l2 * nb[2] + l3 * nc[2]];
      }
    }
  }
  return bestTri < 0 ? null : { y: bestY, tri: bestTri, n: bestN };
}

const NX = Math.floor((X1 - X0) / CELL) + 1, NZ = Math.floor((Z1 - Z0) / CELL) + 1;
const H = new Float32Array(NX * NZ).fill(NaN);
const C = new Int32Array(NX * NZ).fill(-1);
const NXa = new Float32Array(NX * NZ * 3).fill(NaN);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const h = topHit(X0 + i * CELL, Z0 + j * CELL);
  if (h) {
    H[j * NX + i] = h.y; C[j * NX + i] = h.tri;
    if (h.n) { const L = Math.hypot(h.n[0], h.n[1], h.n[2]) || 1; const k = (j * NX + i) * 3;
      NXa[k] = h.n[0] / L; NXa[k + 1] = h.n[1] / L; NXa[k + 2] = h.n[2] / L; }
  }
}
const nAt = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NZ) ? null : (Number.isFinite(NXa[(j * NX + i) * 3]) ? [(j * NX + i) * 3] : null);
const at = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NZ) ? NaN : H[j * NX + i];

// ---- 台面参考平面：用 z ∈ [z0+8, z1-18] 的中段拟合（避开凹槽与前缘圆角）----
let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, sy = 0, n = 0, sxy = 0, szy = 0, cnt = 0;
{
  const ja = Math.floor((Z0 + 8 - Z0) / CELL), jb = Math.floor((Z1 - 18 - Z0) / CELL);
  for (let j = ja; j <= jb; j++) for (let i = 0; i < NX; i++) {
    const y = at(i, j); if (!Number.isFinite(y)) continue;
    const x = X0 + i * CELL, z = Z0 + j * CELL;
    sxx += x * x; sxz += x * z; szz += z * z; sx += x; sz += z; sy += y;
    sxy += x * y; szy += z * y; cnt++;
  }
  // 最小二乘 y = a x + b z + c
  const m = [[sxx, sxz, sx], [sxz, szz, sz], [sx, sz, cnt]];
  const v = [sxy, szy, sy];
  const sol = solve3(m, v);
  var PA = sol[0], PB = sol[1], PC = sol[2];
}
function solve3(m, v) {
  const a = m.map((r, i) => [...r, v[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(a[k][i]) > Math.abs(a[p][i])) p = k;
    [a[i], a[p]] = [a[p], a[i]];
    for (let k = i + 1; k < 3; k++) { const f = a[k][i] / a[i][i]; for (let c = i; c < 4; c++) a[k][c] -= f * a[i][c]; }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) { let s = a[i][3]; for (let k = i + 1; k < 3; k++) s -= a[i][k] * x[k]; x[i] = s / a[i][i]; }
  return x;
}
const plane = (x, z) => PA * x + PB * z + PC;

// ---- 判据 ----
const FRONT = Math.floor((Z1 - 25 - Z0) / CELL);     // 只在前缘 25mm 内判「凹槽相关」
const dev = new Float32Array(NX * NZ).fill(NaN);     // 相对拟合平面的偏差（前缘带）
let holes = 0, holeXZ = [], stepMax = 0, stepXZ = null, kinkMax = 0, kinkXZ = null, kinkPx = 0, depth = 0, depthXZ = null;
const KINK_BAD = 0.20;   // 斜率跳变 >0.20 (≈11° / 0.25mm) 记一处「折」
const stepPx = Math.max(1, Math.round(0.5 / CELL));  // 0.5mm 步长
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const y = at(i, j);
  if (!Number.isFinite(y)) { if (j >= FRONT) { holes++; if (holeXZ.length < 40) holeXZ.push([+(X0 + i * CELL).toFixed(2), +(Z0 + j * CELL).toFixed(2)]); } continue; }
  dev[j * NX + i] = plane(X0 + i * CELL, Z0 + j * CELL) - y;   // >0 = 比台面低
  if (j < FRONT) continue;
  const d = dev[j * NX + i];
  if (d > depth) { depth = d; depthXZ = [+(X0 + i * CELL).toFixed(2), +(Z0 + j * CELL).toFixed(2)]; }
  const yl = at(i - stepPx, j), yr = at(i + stepPx, j), yd = at(i, j - stepPx), yu = at(i, j + stepPx);
  for (const [v, dx, dz] of [[yl, -1, 0], [yr, 1, 0], [yd, 0, -1], [yu, 0, 1]]) {
    if (!Number.isFinite(v)) continue;
    const s = Math.abs(v - y);
    if (s > stepMax) { stepMax = s; stepXZ = [+(X0 + i * CELL).toFixed(2), +(Z0 + j * CELL).toFixed(2), +s.toFixed(3)]; }
    if (s > 1.0) { holes++; if (holeXZ.length < 40) holeXZ.push([+(X0 + i * CELL).toFixed(2), +(Z0 + j * CELL).toFixed(2), +s.toFixed(2)]); }
  }
  // 斜率突变（kink）：把"本来就弯"和"突然折了"分开。
  // 用户口径「不连续/割裂」= 斜率跳变（台阶、板缝、折痕），不是曲率本身。
  for (const [a1, dx, dz] of [[yl, -1, 0], [yr, 1, 0], [yd, 0, -1], [yu, 0, 1]]) {
    if (!Number.isFinite(a1)) continue;
    const sOut = (a1 - y) / CELL;                       // 本格 → 邻格 的斜率
    const bx = i + dx * stepPx, bz = j + dz * stepPx;
    const a2 = at(bx + dx * stepPx, bz + dz * stepPx);  // 再往外一格
    if (!Number.isFinite(a2)) continue;
    const sIn = (a2 - a1) / CELL;
    const k = Math.abs(sOut - sIn);                     // 斜率跳变（mm/mm）
    if (k > kinkMax) { kinkMax = k; kinkXZ = [+(X0 + i * CELL).toFixed(2), +(Z0 + j * CELL).toFixed(2), +k.toFixed(4)]; }
    if (k > KINK_BAD) kinkPx++;
  }
}

// ---- 法线场：相邻格法线夹角（渲染判据：>5° 就是一条硬边/割裂）----
let nangMax = 0, nangXZ = null, nangPx = 0, tiltMax = 0;
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const k = (j * NX + i) * 3;
  if (!Number.isFinite(NXa[k])) continue;
  const n0 = [NXa[k], NXa[k + 1], NXa[k + 2]];
  const tilt = Math.acos(Math.min(1, Math.abs(n0[1]))) * 180 / Math.PI;
  if (tilt > tiltMax) tiltMax = tilt;
  for (const [di, dj] of [[1, 0], [0, 1]]) {
    const k2 = ((j + dj) * NX + (i + di)) * 3;
    if (!Number.isFinite(NXa[k2])) continue;
    const dot = n0[0] * NXa[k2] + n0[1] * NXa[k2 + 1] + n0[2] * NXa[k2 + 2];
    const ang = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot)))) * 180 / Math.PI;
    if (ang > nangMax) { nangMax = ang; nangXZ = [+(X0 + i * CELL).toFixed(2), +(Z0 + j * CELL).toFixed(2)]; }
    if (ang > 5) nangPx++;
  }
}

// ---- 下沉面边界拐角密度（锯齿/多边形边界）----
let boundary = 0, corners = 0;
const MASK = (i, j) => { const d = dev[j * NX + i]; return Number.isFinite(d) && d > 0.15; };
for (let j = FRONT; j < NZ; j++) for (let i = 0; i < NX; i++) {
  if (!MASK(i, j)) continue;
  const nb = [MASK(i - 1, j), MASK(i + 1, j), MASK(i, j - 1), MASK(i, j + 1)];
  if (nb.every(Boolean)) continue;                        // 内部
  boundary++;
  // 4 邻域里"内外交替"≥4 次 = 拐角
  let flips = 0;
  for (let k = 0; k < 4; k++) if (nb[k] !== nb[(k + 1) % 4]) flips++;
  if (flips >= 4) corners++;
}
const perim = boundary * CELL;                              // mm（近似）
const jag = perim > 0 ? corners / perim : 0;                // 拐角/mm

// ---- 可视化（PGM，PIL/任何看图工具都能读）----
function pgm(file, fn) {
  const buf = Buffer.alloc(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const v = fn(i, j);
    buf[(NZ - 1 - j) * NX + i] = Number.isFinite(v) ? Math.max(0, Math.min(255, Math.round(v))) : 0;
  }
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`P5\n${NX} ${NZ}\n255\n`), buf]));
}
pgm(path.join(OUT, 'height.pgm'), (i, j) => {
  const y = at(i, j); if (!Number.isFinite(y)) return 255;      // 空洞 → 白
  return (y - 7.0) / (12.0 - 7.0) * 255;
});
pgm(path.join(OUT, 'dev.pgm'), (i, j) => {
  const d = dev[j * NX + i]; if (!Number.isFinite(d)) return 255;
  return 128 + d * 40;                                          // 下沉 → 亮
});
pgm(path.join(OUT, 'step.pgm'), (i, j) => {
  const y = at(i, j); if (!Number.isFinite(y)) return 255;
  const yr = at(i + stepPx, j), yd = at(i, j + stepPx);
  const s = Math.max(Math.abs((Number.isFinite(yr) ? yr : y) - y), Math.abs((Number.isFinite(yd) ? yd : y) - y));
  return s * 120;
});

// 调试统计：高度场与偏差场的极值（判据失准时先看这两个）
let yMin = Infinity, yMax = -Infinity, dMin = Infinity, dMax = -Infinity;
for (let k = 0; k < H.length; k++) {
  if (Number.isFinite(H[k])) { if (H[k] < yMin) yMin = H[k]; if (H[k] > yMax) yMax = H[k]; }
  if (Number.isFinite(dev[k])) { if (dev[k] < dMin) dMin = dev[k]; if (dev[k] > dMax) dMax = dev[k]; }
}
const rep = {
  mesh: meshPath, region: { X0, X1, Z0, Z1, cell: CELL }, grid: { NX, NZ },
  y_range: [+yMin.toFixed(3), +yMax.toFixed(3)], dev_range: [+dMin.toFixed(3), +dMax.toFixed(3)],
  samples: { c100: +at(Math.round((0 - X0) / CELL), Math.round((100 - Z0) / CELL)).toFixed(3), plane100: +plane(0, 100).toFixed(3) },
  deckPlane: { a: +PA.toFixed(6), b: +PB.toFixed(6), c: +PC.toFixed(3) },
  holes,
  step_max: +stepMax.toFixed(4), step_at: stepXZ,
  kink_max: +kinkMax.toFixed(4), kink_at: kinkXZ, kink_px: kinkPx,
  depth: +depth.toFixed(3), depth_at: depthXZ,
  nang_max_deg: +nangMax.toFixed(2), nang_at: nangXZ, nang_px5: nangPx, tilt_max_deg: +tiltMax.toFixed(2),
  boundary_px: boundary, perimeter_mm: +perim.toFixed(1), corners, jag: +jag.toFixed(4),
  hole_samples: holeXZ.slice(0, 20),
  gates: GATES,
};
const fail = [];
// 视场自检：如果是常量高度场，说明射线打在被上盖/其它面遮住的层上（合盖网格常见）——
// 判据会全 0 假通过。必须用**开盖**网格（台面暴露）跑。
if (yMax - yMin < 0.05) {
  console.error(`⚠ 视场内高度几乎恒定 (${yMin.toFixed(2)}..${yMax.toFixed(2)}mm)：多半在用合盖网格/被上盖遮住。`);
  console.error('  请改用开盖网格，例如：node scripts/max/page-mesh.mjs --lod 1.0 --open 100 --out web/draw/macbook-current.json');
  fail.push('flat_height_field');
}
if (rep.holes > GATES.holes) fail.push(`holes=${rep.holes}>${GATES.holes}`);
if (rep.step_max > GATES.step_max) fail.push(`step_max=${rep.step_max}>${GATES.step_max}`);
if (rep.kink_max > GATES.kink_max) fail.push(`kink_max=${rep.kink_max}>${GATES.kink_max}（折/台阶）`);
if (rep.kink_px > GATES.kink_px) fail.push(`kink_px=${rep.kink_px}>${GATES.kink_px}`);
if (rep.depth > GATES.depth_max) fail.push(`depth=${rep.depth}>${GATES.depth_max}（凹太深）`);
if (rep.depth < GATES.depth_min) fail.push(`depth=${rep.depth}<${GATES.depth_min}（太浅看不出）`);
if (rep.jag > GATES.jag) fail.push(`jag=${rep.jag}>${GATES.jag}（边界锯齿）`);
if (rep.nang_max_deg > GATES.nang_max) fail.push(`nang_max=${rep.nang_max_deg}°>${GATES.nang_max}°（法线硬折=质感割裂）`);
if (rep.nang_px5 > GATES.nang_px) fail.push(`nang_px5=${rep.nang_px5}>${GATES.nang_px}`);
rep.verdict = fail.length ? 'FAIL' : 'PASS';
rep.fail = fail;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(rep, null, 1));
console.log(`holes=${rep.holes} step_max=${rep.step_max}mm @${JSON.stringify(rep.step_at)} kink_max=${rep.kink_max} @${JSON.stringify(rep.kink_at)} kink_px=${rep.kink_px} depth=${rep.depth}mm @${JSON.stringify(rep.depth_at)} jag=${rep.jag}/mm (perim ${rep.perimeter_mm}mm)`);
console.log(`${rep.verdict}${fail.length ? ' :: ' + fail.join(' | ') : ''}  → ${path.join(OUT, 'report.json')}`);
process.exit(fail.length ? 1 : 0);
