/**
 * port-hole-shape.mjs —— 从网格直接量「接口开孔的形状」（打印 ASCII 俯视图，覆盖=#，孔=.）
 * 用法：node scripts/max/port-hole-shape.mjs [mesh.json] [left|right] [z0 z1]
 * 目的：判「孔边是直线还是阶梯/圆角」——像素取证太绕，直接在 (z,y) 平面做点-in-三角光栅化。
 */
import { readFileSync } from 'node:fs';
const mesh = JSON.parse(readFileSync(process.argv[2] ?? 'web/draw/macbook-closed.json', 'utf8'));
const target = process.argv[3] ?? 'left';
const X = target === 'left' ? -156.3 : 156.3;
const V = mesh.vertices.map(([x, y, z]) => [x * 1000, y * 1000, z * 1000]);
const raw = mesh.faces;
const flat = typeof raw[0] === 'number';
const triCount = flat ? raw.length / 3 : raw.length;
const tris = [];
for (let i = 0; i < triCount; i++) {
  const a = flat ? raw[i * 3] : raw[i][0], b = flat ? raw[i * 3 + 1] : raw[i][1], c = flat ? raw[i * 3 + 2] : raw[i][2];
  const p = [V[a], V[b], V[c]];
  // 只看贴在外壁面上的面片（含补片）：|x - X| 很小
  if (p.some((q) => Math.abs(q[0] - X) > 0.08)) continue;
  tris.push(p);
}
const Z0 = Number(process.argv[4] ?? -70), Z1 = Number(process.argv[5] ?? -58);
const Y0 = 5.0, Y1 = 10.5, st = 0.05;
const W = Math.round((Z1 - Z0) / st), H = Math.round((Y1 - Y0) / st);
const cov = new Uint8Array(W * H);
const inside = (p, a, b, c) => {
  const d = (b[2] - a[2]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[2] - a[2]);
  if (Math.abs(d) < 1e-12) return false;
  const w1 = ((b[2] - p[2]) * (c[1] - p[1]) - (b[1] - p[1]) * (c[2] - p[2])) / d;
  const w2 = ((c[2] - p[2]) * (a[1] - p[1]) - (c[1] - p[1]) * (a[2] - p[2])) / d;
  return w1 >= -1e-9 && w2 >= -1e-9 && w1 + w2 <= 1 + 1e-9;
};
for (const t of tris) {
  const zs = t.map((q) => q[2]), ys = t.map((q) => q[1]);
  const zLo = Math.max(Z0, Math.min(...zs)), zHi = Math.min(Z1, Math.max(...zs));
  const yLo = Math.max(Y0, Math.min(...ys)), yHi = Math.min(Y1, Math.max(...ys));
  for (let zi = Math.floor((zLo - Z0) / st); zi <= Math.ceil((zHi - Z0) / st); zi++) {
    for (let yi = Math.floor((yLo - Y0) / st); yi <= Math.ceil((yHi - Y0) / st); yi++) {
      if (zi < 0 || yi < 0 || zi >= W || yi >= H) continue;
      const p = [X, Y0 + yi * st, Z0 + zi * st];
      if (inside(p, t[0], t[1], t[2])) cov[yi * W + zi] = 1;
    }
  }
}
console.log(`壁面片 ${tris.length} 个（|x-${X}|<0.08）  z ${Z0}..${Z1}  y ${Y0}..${Y1}  单元 ${st}mm`);
// 每列统计孔的上下沿
let rows = [];
for (let yi = H - 1; yi >= 0; yi -= 1) {
  let line = '';
  for (let zi = 0; zi < W; zi++) line += cov[yi * W + zi] ? '#' : '.';
  rows.push(`y=${(Y0 + yi * st).toFixed(2).padStart(5)} |${line}|`);
}
console.log(rows.join('\n'));
// 逐列孔宽（每 10 列 = 0.5mm）
let prof = [];
for (let zi = 0; zi < W; zi += 5) {
  let n = 0;
  for (let yi = 0; yi < H; yi++) if (!cov[yi * W + zi]) n++;
  prof.push(`z=${(Z0 + zi * st).toFixed(2)}:${(n * st).toFixed(2)}mm`);
}
console.log(prof.join('  '));
