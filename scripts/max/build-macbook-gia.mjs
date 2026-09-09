/**
 * 引擎导出生成器：标定几何 → 引擎 mesh JSON（vertices/faces/colors）
 *
 * 来源：src/model/macbook/spec.ts（真机实测标定）+ geometry.ts（同一几何构建器，
 * LOD 只改 tessellation）→ 本脚本输出 export-mesh 可吃的 mesh JSON → panelize → .gia。
 *
 * 用法：node scripts/max/build-macbook-gia.mjs [--lod 0.12] [--open 100] [--color silver]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildMacbook14 } from '../../dist/src/model/macbook/geometry.js';
import { linearToSrgb } from '../../dist/src/render/image.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const ROOT = new URL('../..', import.meta.url).pathname;

const lod = parseFloat(arg('lod', '0.12'));
const openAngle = parseFloat(arg('open', '100'));
const color = arg('color', 'silver');
const screenOn = arg('screen', '1') !== '0';

const logo = JSON.parse(readFileSync(ROOT + 'reference/macbook/logo-outline.json', 'utf8'));
const built = buildMacbook14({ openAngle, screenOn, color, lod, legends: false }, { logo });
const mesh = built.mesh;

/** 线性 RGB → sRGB 十六进制（引擎 item color 语义） */
const hexOf = built.materials.map((m) => {
  const to255 = (v) => Math.max(0, Math.min(255, linearToSrgb(v)));
  return '0x' + [0, 1, 2].map((i) => to255(m.baseColor[i]).toString(16).padStart(2, '0')).join('');
});

const nv = mesh.pos.length / 3;
const rawVerts = new Array(nv);
for (let i = 0; i < nv; i++) {
  rawVerts[i] = [mesh.pos[i * 3], mesh.pos[i * 3 + 1], mesh.pos[i * 3 + 2]];
}

// ---- 网格清理 1：焊接（容差 2e-4 m = 0.2mm，与门禁 weldTolerance 一致；
//      最小特征 = 键帽倒角 0.35mm、螺丝十字槽 0.76mm，均大于容差）----
const TOL = 2e-4;
const cells = new Map();
const remap = new Int32Array(nv);
const vertices = [];
const cellKey = (a, b, c) => a + ',' + b + ',' + c;
for (let i = 0; i < nv; i++) {
  const [x, y, z] = rawVerts[i];
  const gx = Math.floor(x / TOL), gy = Math.floor(y / TOL), gz = Math.floor(z / TOL);
  let hit = -1;
  outer:
  for (let dx = -1; dx <= 1 && hit < 0; dx++) {
    for (let dy = -1; dy <= 1 && hit < 0; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const arr = cells.get(cellKey(gx + dx, gy + dy, gz + dz));
        if (!arr) continue;
        for (const j of arr) {
          const v = vertices[j];
          if (Math.abs(v[0] - x) <= TOL && Math.abs(v[1] - y) <= TOL && Math.abs(v[2] - z) <= TOL) { hit = j; break outer; }
        }
      }
    }
  }
  if (hit < 0) {
    hit = vertices.length;
    vertices.push([+x.toFixed(6), +y.toFixed(6), +z.toFixed(6)]);
    const k = cellKey(gx, gy, gz);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(hit);
  }
  remap[i] = hit;
}

// ---- 网格清理 2：去退化面（重复索引 / 面积 < 1e-10 m²）----
const faces = [];
const colors = [];
let dropped = 0;
for (let t = 0; t < mesh.mat.length; t++) {
  const a = remap[mesh.idx[t * 3]], b = remap[mesh.idx[t * 3 + 1]], c = remap[mesh.idx[t * 3 + 2]];
  if (a === b || b === c || a === c) { dropped++; continue; }
  const p0 = vertices[a], p1 = vertices[b], p2 = vertices[c];
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
  const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  const area = 0.5 * Math.hypot(cx, cy, cz);
  const e0 = Math.hypot(ux, uy, uz);
  const e1 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
  const e2 = Math.hypot(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
  const minE = Math.min(e0, e1, e2);
  // 退化判据：面积过小，或最短边 < 0.02mm（细分网格的零面积 sliver——视觉贡献为 0，
  // 却会把瘦三角占比推到 25%+）
  if (area < 1e-9 || minE < 2e-5) { dropped++; continue; }
  faces.push(a, b, c);
  colors.push(hexOf[mesh.mat[t]]);
}
console.log('cleanup: verts', nv, '→', vertices.length, '| tris', mesh.mat.length, '→', faces.length / 3, '| dropped', dropped);

const out = { name: `macbook-pro-14-${color}${openAngle > 1 ? '-open' : '-closed'}`, vertices, faces, colors };
mkdirSync(ROOT + 'delivery/macbook-gia', { recursive: true });
const outPath = ROOT + `delivery/macbook-gia/${out.name}-mesh.json`;
writeFileSync(outPath, JSON.stringify(out));

const counts = {};
for (const t of mesh.mat) counts[t] = (counts[t] || 0) + 1;
console.log('wrote', outPath);
console.log('tris', faces.length / 3, 'verts', nv, 'materials', built.materials.length);
console.log('per-material', JSON.stringify(counts));
console.log('colors', JSON.stringify(hexOf));
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (const v of vertices) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); }
console.log('bbox mm', mn.map((v) => (v * 1000).toFixed(1)).join(','), '→', mx.map((v) => (v * 1000).toFixed(1)).join(','));
console.log('dims mm', mx.map((v, i) => ((v - mn[i]) * 1000).toFixed(1)).join(' × '));
