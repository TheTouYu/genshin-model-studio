import { buildMacbook14 } from '../../dist/src/model/macbook/geometry.js';
const r = buildMacbook14({ openAngle: 100, screenOn: true, color: 'silver', lod: parseFloat(process.argv[2]||'1'), legends: false }, {});
console.log('stats', JSON.stringify(r.stats));
console.log('materials', r.materials.length);
r.materials.forEach((m, i) => console.log(' ', i, m.name, m.baseColor.map((x) => x.toFixed(3)).join(','), 'metal', m.metallic, 'rough', m.roughness));
const p = r.mesh.pos; const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[i + k]); mx[k] = Math.max(mx[k], p[i + k]); }
console.log('bbox m', mn.map((v) => v.toFixed(4)), mx.map((v) => v.toFixed(4)));
console.log('dims mm', ((mx[0] - mn[0]) * 1000).toFixed(1), ((mx[1] - mn[1]) * 1000).toFixed(1), ((mx[2] - mn[2]) * 1000).toFixed(1));
const counts = {};
for (let i = 0; i < r.mesh.mat.length; i++) counts[r.mesh.mat[i]] = (counts[r.mesh.mat[i]] || 0) + 1;
console.log('tris per material', JSON.stringify(counts));
