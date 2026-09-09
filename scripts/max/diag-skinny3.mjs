import { readFileSync } from 'node:fs';
const mesh = JSON.parse(readFileSync('delivery/macbook-gia/macbook-pro-14-silver-open-mesh.json', 'utf8'));
const { vertices: V, faces: F, colors: C } = mesh;
const P = (i) => V[i];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const cls = new Map(); // key: color|orient
const bump = (k, d) => { if (!cls.has(k)) cls.set(k, { n: 0, ...d }); const e = cls.get(k); e.n++; };
let total = 0, skinny = 0;
for (let t = 0; t < F.length / 3; t++) {
  const a = P(F[t*3]), b = P(F[t*3+1]), c = P(F[t*3+2]);
  const e = [norm(sub(b,a)), norm(sub(c,b)), norm(sub(a,c))];
  const mn = Math.min(...e), mx = Math.max(...e);
  const r = mx > 0 ? mn/mx : 0; total++;
  if (r >= 0.08) continue;
  skinny++;
  const n = cross(sub(b,a), sub(c,a)); const ln = norm(n) || 1;
  const u = n.map((v) => Math.abs(v/ln));
  const orient = u[1] > 0.9 ? 'top' : (u[0] > 0.9 || u[2] > 0.9 ? 'wall' : 'oblique');
  // degenerate: two verts closer than 1mm
  const degen = e.some((x) => x < 1e-3);
  const k = `${C[t]}|${orient}${degen ? '|degen' : ''}`;
  bump(k, { mn, mx });
}
console.log(`total ${total} skinny ${skinny}`);
for (const [k, v] of [...cls.entries()].sort((a,b)=>b[1].n-a[1].n)) console.log(`${k.padEnd(28)} n=${String(v.n).padStart(5)}`);
console.log('--- worst per class ---');
const worst = new Map();
for (let t = 0; t < F.length/3; t++) {
  const a = P(F[t*3]), b = P(F[t*3+1]), c = P(F[t*3+2]);
  const e = [norm(sub(b,a)), norm(sub(c,b)), norm(sub(a,c))];
  const r = Math.min(...e)/Math.max(...e);
  if (r >= 0.08) continue;
  const n = cross(sub(b,a), sub(c,a)); const ln = norm(n) || 1;
  const u = n.map((v) => Math.abs(v/ln));
  const orient = u[1] > 0.9 ? 'top' : (u[0] > 0.9 || u[2] > 0.9 ? 'wall' : 'oblique');
  const degen = e.some((x) => x < 1e-3);
  const k = `${C[t]}|${orient}${degen?'|degen':''}`;
  if (!worst.has(k) || r < worst.get(k).r) worst.set(k, { r, e, a, b, c });
}
for (const [k, w] of worst) console.log(`${k.padEnd(28)} r=${w.r.toFixed(4)} e=${w.e.map(x=>(x*1000).toFixed(2)).join('/')}mm  A=${w.a.map(x=>(x*1000).toFixed(1)).join(',')}  B=${w.b.map(x=>(x*1000).toFixed(1)).join(',')}  C=${w.c.map(x=>(x*1000).toFixed(1)).join(',')}`);
