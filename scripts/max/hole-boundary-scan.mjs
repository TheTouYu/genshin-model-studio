/**
 * hole-boundary-scan.mjs —— **孔的可见边界**独立测量（不依赖拓扑边，纯点包含判定）。
 *
 * 为什么需要它：`hole-arc-qa.mjs` 用「只被一个三角形使用的边」当孔边界，
 * 一旦网格里出现 T 型接缝 / 逐角裁剪后的梯形，这个集合就会混进非孔边 → 读数不可比
 * （R76 实测：同一网格改写裁剪方式后 maxArcDev 反而变大，但渲染完全变了样）。
 * 本工具直接从**材料在不在**这个角度量：从弧心按角度 θ 向外步进，
 * 找到第一个"落在台面铝三角形内"的半径 = 该 θ 的可见孔边界半径。
 *
 * 用法：
 *   node scripts/max/hole-boundary-scan.mjs <mesh.json> [--y 11.5] [--color 0xf3f3f4]
 *        [--cx 62.3 --cz 96.9 --r 5.15] [--win 0.6] [--step 0.004] [--json out.json]
 * 输出：每个 θ 的 r_edge 与 Δr=r_edge−r（+ = 材料越过理想弧、- = 缺料），以及 max|Δr|。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const meshPath = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? Number(args[i + 1]) : d; };
const optS = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };

const raw = JSON.parse(readFileSync(meshPath, 'utf8'));
const V = raw.vertices, F = raw.faces, C = raw.colors;
const scale = Math.max(...V.map((v) => Math.abs(v[0]))) < 10 ? 1000 : 1;   // 米 → 毫米
const y = opt('y', 11.5), col = String(optS('color', '0xf3f3f4')).toLowerCase();
const cx = opt('cx', 62.3), cz = opt('cz', 96.9), R = opt('r', 5.15);
const win = opt('win', 0.6), step = opt('step', 0.004);
// 弧所在的象限：默认 +x/+z（FR 角）；BR 角要 --sx 1 --sz -1，BL 角 --sx -1 --sz -1 …
const sx = opt('sx', 1), sz = opt('sz', 1);

// 收集窗口内、位于 y 平面的三角（2D）
const tris = [];
for (let f = 0; f < F.length / 3; f++) {
  if (String(C[f]).toLowerCase() !== col) continue;
  const P = [F[f * 3], F[f * 3 + 1], F[f * 3 + 2]].map((i) => [V[i][0] * scale, V[i][1] * scale, V[i][2] * scale]);
  if (P.some((p) => Math.abs(p[1] - y) > 1e-3)) continue;
  // ⚠ 过滤按**质心**给足余量：按顶点过滤会把跨过窗口边界的角面整体丢掉（R76 踩过 → 大量 null）
  const gx = (P[0][0] + P[1][0] + P[2][0]) / 3, gz = (P[0][2] + P[1][2] + P[2][2]) / 3;
  if (Math.hypot(gx - cx, gz - cz) > R + win + 3) continue;
  tris.push(P);
}
if (!tris.length) { console.error('窗口内没有该颜色的三角形'); process.exit(2); }

const inside = (x, z) => {
  for (const t of tris) {
    const d1 = (x - t[1][0]) * (t[0][2] - t[1][2]) - (t[0][0] - t[1][0]) * (z - t[1][2]);
    const d2 = (x - t[2][0]) * (t[1][2] - t[2][2]) - (t[1][0] - t[2][0]) * (z - t[2][2]);
    const d3 = (x - t[0][0]) * (t[2][2] - t[0][2]) - (t[2][0] - t[0][0]) * (z - t[0][2]);
    const neg = (d1 < 0) || (d2 < 0) || (d3 < 0), pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    if (!(neg && pos)) return true;
  }
  return false;
};

const rows = [];
let worst = null;
for (let deg = 0; deg <= 90; deg += 2.5) {
  const th = (deg * Math.PI) / 180;
  let redge = null;
  for (let r = R - 0.3; r <= R + win; r += step) {
    if (inside(cx + sx * r * Math.cos(th), cz + sz * r * Math.sin(th))) { redge = r; break; }
  }
  const d = redge === null ? null : redge - R;
  rows.push({ deg, r: redge === null ? null : +redge.toFixed(4), d: d === null ? null : +d.toFixed(4) });
  if (d !== null && (!worst || Math.abs(d) > Math.abs(worst.d))) worst = { deg, d };
}
const maxAbs = Math.max(...rows.map((r) => (r.d === null ? 99 : Math.abs(r.d))));
console.log(`hole-boundary-scan: ${meshPath}  center=(${cx},${cz}) R=${R}  窗口内三角形 ${tris.length}`);
console.log(rows.map((r) => `${r.deg}°:${r.d === null ? 'null' : (r.d >= 0 ? '+' : '') + r.d.toFixed(3)}`).join('  '));
console.log(`max|Δr| = ${maxAbs.toFixed(4)}mm  最差 θ=${worst ? worst.deg + '° (Δr=' + worst.d.toFixed(3) + ')' : 'n/a'}`);
const out = optS('json', '');
if (out) { writeFileSync(out, JSON.stringify({ meshPath, center: [cx, cz], R, rows, maxAbs }, null, 1)); console.log('report →', out); }
