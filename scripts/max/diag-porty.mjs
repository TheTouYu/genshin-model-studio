/**
 * diag-porty.mjs — 端口腔体与机身高度实测（buildMacbook14 mesh，输出 mm）
 * 核实 spec.ts ports.centerY 相对「底面 / 侧壁上沿 / 整机高度」的位置。
 */
import { readFileSync } from 'node:fs';
import { buildMacbook14 } from '../../dist/src/model/macbook/geometry.js';

const ROOT = new URL('../..', import.meta.url).pathname;
const logo = JSON.parse(readFileSync(ROOT + 'reference/macbook/logo-outline.json', 'utf8'));
const built = buildMacbook14({ openAngle: 0, screenOn: false, color: 'silver', lod: 1.0, legends: false }, { logo });
const { mesh } = built;
const P = mesh.pos, IDX = mesh.idx, MAT = mesh.mat;
const mm = (v) => v * 1000;
let ymin = 1e9, ymax = -1e9;
for (let i = 1; i < P.length; i += 3) { ymin = Math.min(ymin, P[i]); ymax = Math.max(ymax, P[i]); }
console.log(`verts ${P.length / 3} tris ${IDX.length / 3}  bbox y [${mm(ymin).toFixed(3)}, ${mm(ymax).toFixed(3)}] total ${mm(ymax - ymin).toFixed(3)} mm`);
const byMat = new Map();
for (let t = 0; t < MAT.length; t++) {
  const m = MAT[t];
  for (let k = 0; k < 3; k++) {
    const y = P[IDX[t * 3 + k] * 3 + 1];
    const r = byMat.get(m) ?? { y0: 1e9, y1: -1e9, n: 0 };
    r.y0 = Math.min(r.y0, y); r.y1 = Math.max(r.y1, y); r.n++;
    byMat.set(m, r);
  }
}
for (const [m, r] of [...byMat.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  mat ${String(m).padStart(2)} ${(built.materials[m]?.name ?? '?').padEnd(16)} y [${mm(r.y0).toFixed(2)}, ${mm(r.y1).toFixed(2)}] center ${mm((r.y0 + r.y1) / 2).toFixed(2)} n=${r.n}`);
}
