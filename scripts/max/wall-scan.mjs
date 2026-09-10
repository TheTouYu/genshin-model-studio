#!/usr/bin/env node
/**
 * wall-scan.mjs —— 接口开口「可见边界」尺子（R79 换算法必须换尺子）。
 *
 * 旧尺子 hole-arc-qa.mjs 量的是**水平板件**上的孔（键盘井/触控板，y=const 平面）；
 * v7 的开口在**竖直侧壁**上（x=±156.3），孔边界是 (z,y) 平面里的解析轮廓 —— 旧尺子量不到。
 *
 * 判据（对每个口的解析轮廓采样 720 点，每点取外法线）：
 *   · 轮廓外 0.06mm 处必须**有墙面**（否则开口被切过了头）
 *   · 轮廓内 0.06mm 处必须**没有墙面**（否则开口没切透 / 被墙板盖住）
 *   失败点 = 开口边界偏差 > 0.06mm。另外量腔底深度（应从口面向里 DEPTH=2.0mm）。
 * 口径与真机一致：这些点在 27 px/mm 的逐口特写里 = 1.6px，人类肉眼可辨。
 *
 * 用法：node scripts/max/wall-scan.mjs web/draw/macbook-current.json [--tol=0.03] [--dump=L-usbc1]
 * 退出码 1 = 有超出 tol 的边界偏差（每次接口几何改动必跑）。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const meshPath = args[0] || 'web/draw/macbook-current.json';
const tol = Number((args.find((a) => a.startsWith('--tol=')) || '--tol=0.06').split('=')[1]);
const DUMP = (args.find((a) => a.startsWith('--dump=')) || '').split('=')[1] || null;

const spec = require(process.cwd() + '/dist/src/model/macbook/spec.js');
const S = spec.S;

const raw = JSON.parse(readFileSync(meshPath, 'utf8'));
const flat = raw.vertices[0].length !== undefined;
const V = flat ? [] : raw.vertices;
if (flat) { for (const v of raw.vertices) V.push(v); }
const F = [];
if (raw.faces.length && Array.isArray(raw.faces[0])) { for (const f of raw.faces) F.push(f[0], f[1], f[2]); }
else for (const f of raw.faces) F.push(f);
// 单位自动识别（page-mesh 写的是米）
let maxc = 0;
for (const v of V) maxc = Math.max(maxc, Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
const K = maxc < 10 ? 1000 : 1;
const P = V.map((v) => [v[0] * K, v[1] * K, v[2] * K]);
const cols = raw.colors || [];
console.log(`mesh ${meshPath}: verts ${P.length} tris ${F.length / 3} unit×${K}`);

// 端口颜色组（墙 = 铝 #f3f3f4；腔 = port-cavity；舌 = port-tongue；触点 = port-gold）
const wallHex = 0xf3f3f4;
const isWallCol = (c) => {
  const h = typeof c === 'string' ? parseInt(c, 16) : c;
  return h === wallHex;
};

// (z,y) 桶：只测可能命中该射线的三角形
const BIN = 1.5;
const bins = new Map();
const key = (a, b) => `${a}|${b}`;
const triIds = [];
for (let t = 0; t < F.length / 3; t++) {
  const a = P[F[t * 3]], b = P[F[t * 3 + 1]], c = P[F[t * 3 + 2]];
  const z0 = Math.min(a[2], b[2], c[2]), z1 = Math.max(a[2], b[2], c[2]);
  const y0 = Math.min(a[1], b[1], c[1]), y1 = Math.max(a[1], b[1], c[1]);
  triIds.push([t, z0, z1, y0, y1]);
  for (let i = Math.floor(z0 / BIN); i <= Math.floor(z1 / BIN); i++) {
    for (let j = Math.floor(y0 / BIN); j <= Math.floor(y1 / BIN); j++) {
      const k = key(i, j);
      if (!bins.has(k)) bins.set(k, []);
      bins.get(k).push(t);
    }
  }
}

/**
 * 沿 x 射入（左壁从 −400mm 向 +x、右壁从 +400mm 向 −x），取**射线上 x 最小/最大的那个面**
 * （= 从机外看到的第一个面）。面的 x 用 (z,y) 平面重心坐标插值得到。
 * 侧壁面（墙面/墙板）的 (z,y) 投影非退化；腔壁（平行于射线）投影退化为线 → 跳过（掠射，测度零）。
 */
function shoot(side, z, y) {
  const i0 = Math.floor(z / BIN), j0 = Math.floor(y / BIN);
  const cand = new Set();
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const t of bins.get(key(i0 + di, j0 + dj)) || []) cand.add(t);
  let best = null;
  for (const t of cand) {
    const a = P[F[t * 3]], b = P[F[t * 3 + 1]], c = P[F[t * 3 + 2]];
    const det = (b[1] - c[1]) * (a[2] - c[2]) + (c[2] - b[2]) * (a[1] - c[1]);
    if (Math.abs(det) < 1e-9) continue;
    const l1 = ((b[1] - c[1]) * (z - c[2]) + (c[2] - b[2]) * (y - c[1])) / det;
    const l2 = ((c[1] - a[1]) * (z - c[2]) + (a[2] - c[2]) * (y - c[1])) / det;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const x = l1 * a[0] + l2 * b[0] + l3 * c[0];
    if (best === null || (side < 0 ? x < best.x : x > best.x)) best = { x, col: cols[t], wall: isWallCol(cols[t]) };
  }
  return best;
}

/** 沿轮廓外法线二分找「墙面 → 非墙面」的过渡点（相对解析轮廓的偏移，mm） */
function edgeOffset(side, z, y, nz, ny) {
  let lo = -0.5, hi = 0.5;   // lo = 轮廓内 0.5mm（应为腔），hi = 轮廓外 0.5mm（应为墙）
  // 必须命中**近侧**墙面：射线会穿过开口打到对侧内壁（也是铝）→ 会把"腔"误判成"墙"
  const isWallAt = (d) => {
    const h = shoot(side, z + nz * d, y + ny * d);
    if (!h || !h.wall) return false;
    return side < 0 ? h.x < -wallX + 0.3 : h.x > wallX - 0.3;
  };
  if (!isWallAt(hi) || isWallAt(lo)) return null;   // 端点就不是预期状态 → 该点无效（窗口/别的结构）
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (isWallAt(m)) hi = m; else lo = m;
  }
  return (lo + hi) / 2;
}

// 解析轮廓（与 geometry.ts portOutlineZY 同式）
function outline(hw, hh, rr, n) {
  const r = Math.min(rr, hw - 1e-4, hh - 1e-4), ax = hw - r, ay = hh - r;
  const pts = [];
  const add = (z, y, nz, ny) => { const l = pts[pts.length - 1]; if (l && Math.hypot(l.z - z, l.y - y) < 1e-5) return; pts.push({ z, y, nz, ny }); };
  const arc = (cz, cy, a0, a1) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); add(cz + r * Math.cos(a), cy + r * Math.sin(a), Math.cos(a), Math.sin(a)); } };
  const D = Math.PI / 180;
  add(-ax, hh, 0, 1); arc(ax, ay, 90 * D, 0); add(hw, -ay, 1, 0); arc(ax, -ay, 0, -90 * D);
  add(-ax, -hh, 0, -1); arc(-ax, -ay, -90 * D, -180 * D); add(-hw, ay, -1, 0); arc(-ax, ay, 180 * D, 90 * D);
  const f = pts[0], l = pts[pts.length - 1];
  if (pts.length > 1 && Math.hypot(f.z - l.z, f.y - l.y) < 1e-5) pts.pop();
  return pts;
}

const ports = [
  ...S.ports.left.map((p) => ({ ...p, side: -1 })),
  ...S.ports.right.map((p) => ({ ...p, side: 1 })),
];
const cy = S.ports.centerY;
const wallX = S.base.w / 2;
let worst = 0, worstAt = null, fails = 0, valid = 0;
for (const p of ports) {
  const hh = p.h / 2, hw = p.w / 2;
  const rr = (p.kind === 'jack' || p.kind === 'usbc' || p.kind === 'magsafe')
    ? Math.min(hh, hw) - 0.01 : Math.min(0.9, hh - 0.01, hw - 0.01);
  const ops = outline(hw, hh, rr, 64);
  let pf = 0, mx = 0;
  for (const o of ops) {
    const d = edgeOffset(p.side, p.z + o.z, cy + o.y, o.nz, o.ny);
    if (DUMP && `${p.side < 0 ? 'L' : 'R'}-${p.kind}` === DUMP) console.log(`    pt z=${(p.z + o.z).toFixed(3)} y=${(cy + o.y).toFixed(3)} n=(${o.nz.toFixed(2)},${o.ny.toFixed(2)}) off=${d === null ? 'null' : d.toFixed(3)}`);
    if (d === null) { fails++; pf++; continue; }
    valid++;
    mx = Math.max(mx, Math.abs(d));
    if (Math.abs(d) > tol) {
      fails++; pf++;
      if (Math.abs(d) > worst) { worst = Math.abs(d); worstAt = `${p.side < 0 ? 'L' : 'R'}-${p.kind} z=${(p.z + o.z).toFixed(2)} y=${(cy + o.y).toFixed(2)} n=(${o.nz.toFixed(3)},${o.ny.toFixed(3)}) offset=${d.toFixed(3)}mm`; }
    }
  }
  const c = shoot(p.side, p.z, cy);
  const depth = c ? wallX - (p.side < 0 ? -c.x : c.x) : NaN;
  console.log(`${p.side < 0 ? 'L' : 'R'}-${p.kind.padEnd(8)} outline ${ops.length} pts  fails ${pf}  maxDev ${mx.toFixed(3)}mm  centerHit x=${c ? c.x.toFixed(2) : 'none'} (${c && c.wall ? 'wall' : 'cavity'}) depth ${depth.toFixed(2)}mm`);
}
console.log(`\nTOTAL valid ${valid}, fails ${fails} (tol ${tol}mm), worst ${worst.toFixed(3)}mm @ ${worstAt || 'none'}`);
process.exit(fails ? 1 : 0);
