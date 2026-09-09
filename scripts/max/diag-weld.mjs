import { buildMacbook14 } from '../../dist/src/model/macbook/geometry.js';
import { readFileSync } from 'node:fs';
const logo = JSON.parse(readFileSync(new URL('../../reference/macbook/logo-outline.json', import.meta.url), 'utf8'));
const built = buildMacbook14({ openAngle: 100, screenOn: true, color: 'silver', lod: 0.12, legends: false }, { logo });
const m = built.mesh;
const nv = m.pos.length / 3;
// 空间哈希找最近的不同顶点对（排除同一三角形的共享边）
const TOL = 2e-4;
const cells = new Map();
const key = (a, b, c) => a + ',' + b + ',' + c;
const pts = [];
for (let i = 0; i < nv; i++) pts.push([m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]]);
for (let i = 0; i < nv; i++) {
  const [x, y, z] = pts[i];
  const gx = Math.floor(x / TOL), gy = Math.floor(y / TOL), gz = Math.floor(z / TOL);
  const k = key(gx, gy, gz);
  if (!cells.has(k)) cells.set(k, []);
  cells.get(k).push(i);
}
// 统计每个三角形的最小边长（用焊接后的索引判断退化）
const remap = new Int32Array(nv);
const verts = [];
const cellIdx = new Map();
for (let i = 0; i < nv; i++) {
  const [x, y, z] = pts[i];
  const gx = Math.floor(x / TOL), gy = Math.floor(y / TOL), gz = Math.floor(z / TOL);
  let hit = -1;
  outer: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const arr = cellIdx.get(key(gx + dx, gy + dy, gz + dz));
    if (!arr) continue;
    for (const j of arr) { const v = verts[j]; if (Math.abs(v[0] - x) <= TOL && Math.abs(v[1] - y) <= TOL && Math.abs(v[2] - z) <= TOL) { hit = j; break outer; } }
  }
  if (hit < 0) { hit = verts.length; verts.push([x, y, z]); const k = key(gx, gy, gz); if (!cellIdx.has(k)) cellIdx.set(k, []); cellIdx.get(k).push(hit); }
  remap[i] = hit;
}
const lost = {};
for (let t = 0; t < m.mat.length; t++) {
  const a = remap[m.idx[t * 3]], b = remap[m.idx[t * 3 + 1]], c = remap[m.idx[t * 3 + 2]];
  if (a === b || b === c || a === c) { const mat = m.mat[t]; lost[mat] = (lost[mat] || 0) + 1; }
}
console.log('collapsed-by-weld tris per material:', JSON.stringify(lost));
console.log('material names:', built.materials.map((mm, i) => i + ':' + mm.name).join(' '));
// 找最小特征：不同材料间的最近顶点距离分布
let minD = 1e9, minPair = null;
for (const [k, arr] of cellIdx) {
  for (const i of arr) for (const j of arr) {
    if (i >= j) continue;
    const a = verts[i], b = verts[j];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (d > 1e-12 && d < minD) { minD = d; minPair = [a, b]; }
  }
}
console.log('min distinct-vertex distance (m):', minD.toExponential(2), minPair && minPair.map((p) => p.map((v) => (v * 1000).toFixed(3)).join(',')).join(' | '));
// 样本：按材料打印塌陷三角的位置
const samples = {};
for (let t = 0; t < m.mat.length; t++) {
  const a = remap[m.idx[t * 3]], b = remap[m.idx[t * 3 + 1]], c = remap[m.idx[t * 3 + 2]];
  if (a === b || b === c || a === c) {
    const mat = m.mat[t];
    if (!samples[mat]) samples[mat] = [];
    if (samples[mat].length < 3) {
      const P = (i) => pts[i].map((v) => (v * 1000).toFixed(2)).join(',');
      samples[mat].push(`[${P(m.idx[t*3])} | ${P(m.idx[t*3+1])} | ${P(m.idx[t*3+2])}]`);
    }
  }
}
for (const k of Object.keys(samples)) console.log('mat', k, built.materials[k].name, samples[k].join('  '));
