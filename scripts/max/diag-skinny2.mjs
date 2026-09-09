import { readFileSync } from 'node:fs';
const mesh = JSON.parse(readFileSync('delivery/macbook-gia/macbook-pro-14-silver-open-mesh.json', 'utf8'));
const { vertices: V, faces: F, colors: C } = mesh;
const stats = new Map();
let total = 0, skinny = 0;
for (let t = 0; t < F.length / 3; t++) {
  const a = V[F[t * 3]], b = V[F[t * 3 + 1]], c = V[F[t * 3 + 2]];
  const e = [Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]), Math.hypot(c[0]-b[0],c[1]-b[1],c[2]-b[2]), Math.hypot(a[0]-c[0],a[1]-c[1],a[2]-c[2])];
  const mn = Math.min(...e), mx = Math.max(...e);
  const r = mx > 0 ? mn / mx : 0;
  const col = C[t]; total++;
  if (!stats.has(col)) stats.set(col, { n: 0, sk: 0, worst: 1, sample: '', maxE: 0, minE: 0 });
  const s = stats.get(col); s.n++;
  if (r < 0.08) {
    skinny++; s.sk++;
    if (r < s.worst) { s.worst = r; s.maxE = mx * 1000; s.minE = mn * 1000;
      s.sample = [a, b, c].map((p) => p.map((v) => (v * 1000).toFixed(1)).join(',')).join(' | '); }
  }
}
console.log(`total ${total} skinny ${skinny} (${(100*skinny/total).toFixed(1)}%)`);
for (const [col, s] of [...stats.entries()].sort((x, y) => y[1].sk - x[1].sk)) {
  if (s.sk === 0) continue;
  console.log(`${col} n=${String(s.n).padStart(5)} skinny=${String(s.sk).padStart(5)} (${String(Math.round(100*s.sk/s.n)).padStart(3)}%) worstRatio=${s.worst.toFixed(4)} edges ${s.minE.toFixed(2)}/${s.maxE.toFixed(2)}mm  ${s.sample}`);
}
