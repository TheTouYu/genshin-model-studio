import { readFileSync } from 'node:fs';
import { MeshBuilder } from '../../dist/src/render/geom.js';
import { buildMacbook14 } from '../../dist/src/model/macbook/geometry.js';
const ROOT = new URL('../..', import.meta.url).pathname;
const logo = JSON.parse(readFileSync(ROOT + 'reference/macbook/logo-outline.json', 'utf8'));
const seen = new Map();
const orig = MeshBuilder.prototype.tri;
MeshBuilder.prototype.tri = function (a, b, c) {
  const P = this.P; const g = (i) => [P[i*3], P[i*3+1], P[i*3+2]];
  const A = g(a), B = g(b), C = g(c);
  const d = (u,v) => Math.hypot(u[0]-v[0],u[1]-v[1],u[2]-v[2]);
  const e = [d(A,B), d(B,C), d(C,A)]; const mn = Math.min(...e), mx = Math.max(...e);
  if (mx > 0 && mn/mx < 0.08 && mn > 0.05 && mn < 0.15) {
    const st = new Error().stack.split('\n').slice(2, 8).map((s) => s.trim().replace(/^at /, '').replace(ROOT, '')).join('\n     ');
    if (!seen.has(st)) { seen.set(st, { n: 0, sample: [A,B,C].map(p=>p.map(v=>v.toFixed(2)).join(',')).join(' | ') }); }
    seen.get(st).n++;
  }
  return orig.call(this, a, b, c);
};
buildMacbook14({ openAngle: 100, screenOn: true, color: 'silver', lod: 0.12, legends: false }, { logo });
for (const [st, v] of [...seen.entries()].slice(0, 6)) console.log(`\n### n=${v.n}  ${v.sample}\n     ${st}`);
