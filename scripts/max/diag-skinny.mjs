import { buildMacbook14 } from '../../dist/src/model/macbook/geometry.js';
import { readFileSync } from 'node:fs';
const logo = JSON.parse(readFileSync(new URL('../../reference/macbook/logo-outline.json', import.meta.url), 'utf8'));
const b = buildMacbook14({ openAngle: 100, screenOn: true, color: 'silver', lod: 0.12, legends: false }, { logo });
const m = b.mesh;
const P = (i) => [m.pos[i*3], m.pos[i*3+1], m.pos[i*3+2]];
const stats = {};
for (let t = 0; t < m.mat.length; t++) {
  const a = P(m.idx[t*3]), c = P(m.idx[t*3+1]), d = P(m.idx[t*3+2]);
  const e = [Math.hypot(c[0]-a[0],c[1]-a[1],c[2]-a[2]), Math.hypot(d[0]-c[0],d[1]-c[1],d[2]-c[2]), Math.hypot(a[0]-d[0],a[1]-d[1],a[2]-d[2])];
  const mn = Math.min(...e), mx = Math.max(...e);
  if (mx < 1e-12) continue;
  const r = mn/mx;
  const mat = m.mat[t];
  if (!stats[mat]) stats[mat] = { n: 0, skinny: 0, worst: 1, sample: null };
  const st = stats[mat]; st.n++;
  if (r < 0.08) { st.skinny++; if (r < st.worst) { st.worst = r; st.sample = [a,c,d].map(p=>p.map(v=>(v*1000).toFixed(2)).join(',')).join(' | '); } }
}
for (const k of Object.keys(stats)) {
  const s = stats[k];
  console.log(`mat ${k} ${b.materials[k].name.padEnd(18)} tris=${String(s.n).padStart(5)} skinny=${String(s.skinny).padStart(5)} (${(100*s.skinny/s.n).toFixed(0)}%) worst=${s.worst.toFixed(4)} ${s.sample||''}`);
}
