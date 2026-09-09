/** 瘦三角来源归因：原型补丁拦截 MeshBuilder.tri，用调用栈定位发射点（打印真实 JS 行） */
import { readFileSync } from 'node:fs';
import { MeshBuilder } from '../../dist/src/render/geom.js';
import { buildMacbook14 } from '../../dist/src/model/macbook/geometry.js';
const ROOT = new URL('../..', import.meta.url).pathname;
const logo = JSON.parse(readFileSync(ROOT + 'reference/macbook/logo-outline.json', 'utf8'));
const srcCache = new Map();
const srcLine = (file, ln) => {
  if (!srcCache.has(file)) srcCache.set(file, readFileSync(file, 'utf8').split('\n'));
  return (srcCache.get(file)[ln - 1] || '').trim().slice(0, 90);
};
const hits = new Map();
const orig = MeshBuilder.prototype.tri;
MeshBuilder.prototype.tri = function (a, b, c) {
  const P = this.P;
  const g = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  const A = g(a), B = g(b), C = g(c);
  const d = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
  const e = [d(A, B), d(B, C), d(C, A)];
  const mn = Math.min(...e), mx = Math.max(...e);
  const r = mx > 0 ? mn / mx : 0;
  let site = '?', line = '';
  const st = new Error().stack.split('\n');
  for (const f of st) {
    const m = f.match(/(dist\/src\/(?:geom|model|render)\/[^:]+\.js):(\d+)/);
    if (m) { site = m[1].replace('dist/src/', '') + ':' + m[2]; line = srcLine(ROOT + m[1], +m[2]); break; }
  }
  const k = site + '|mat' + this.curMat;
  if (!hits.has(k)) hits.set(k, { n: 0, sk: 0, worst: 1, sample: '', mn: 0, mx: 0, line });
  const h = hits.get(k); h.n++;
  if (r < 0.08 && mn > 0.02) {
    h.sk++;
    if (r < h.worst) { h.worst = r; h.mn = mn; h.mx = mx;
      h.sample = [A, B, C].map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' | '); }
  }
  return orig.call(this, a, b, c);
};
const built = buildMacbook14({ openAngle: 100, screenOn: true, color: 'silver', lod: 0.12, legends: false }, { logo });
const tot = [...hits.values()].reduce((s, h) => s + h.n, 0);
const sk = [...hits.values()].reduce((s, h) => s + h.sk, 0);
console.log(`tris ${tot} skinny ${sk} (${(100*sk/tot).toFixed(1)}%)`);
for (const [k, h] of [...hits.entries()].filter(([, h]) => h.sk > 0).sort((a, b) => b[1].sk - a[1].sk)) {
  console.log(`\n${k}  tris=${h.n} skinny=${h.sk} worst=${h.worst.toFixed(4)} e=${h.mn.toFixed(2)}/${h.mx.toFixed(2)}mm`);
  console.log(`   ${h.line}`);
  console.log(`   ${h.sample}`);
}
