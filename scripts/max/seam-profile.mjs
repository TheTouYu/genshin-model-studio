/**
 * seam-profile.mjs —— 合盖侧缝轮廓测量（用户三轮重复反馈的那一条）
 *
 * 用户原话：「盖着的时候，上下两面是完全大小相等的」「闭合的这个线条，从侧面看好像
 * 有点对不上」「官方确实是严丝闭合的」。判据：真机合盖后上盖侧壁与底座侧壁构成
 * **同一个竖直平面**（侧面看是一条连续线），只在分缝处有一条极细暗线，不许有台阶。
 *
 * 量法：从导出网格取左壁（x < −100mm）在 |z| < 80mm（避开机身圆角）内的顶点，
 * 按 y 分箱取最外沿 x → 得到「y → 左壁 x」剖面。
 * 用法：node scripts/max/seam-profile.mjs [mesh.json]
 */
import { readFileSync } from 'node:fs';

const mesh = JSON.parse(readFileSync(process.argv[2] ?? 'web/draw/macbook-closed.json', 'utf8'));
let V = mesh.vertices;
let maxAbs = 0;
for (const v of V) for (const c of v) maxAbs = Math.max(maxAbs, Math.abs(c));
const K = maxAbs < 5 ? 1000 : 1;
if (K !== 1) V = V.map(([x, y, z]) => [x * K, y * K, z * K]);
console.log(`unit x${K}  verts ${V.length}  max|coord| ${maxAbs.toFixed(3)}`);

const bin = 0.01;
const prof = new Map();
for (const [x, y, z] of V) {
  if (x > -100 || Math.abs(z) > 80) continue; // 只要左壁中段
  const k = Math.round(y / bin) * bin;
  const cur = prof.get(k);
  if (cur === undefined || x < cur) prof.set(k, x);
}
const ys = [...prof.keys()].sort((a, b) => a - b);
const outer = Math.min(...ys.map((y) => prof.get(y)));
console.log(`左壁最外沿 x = ${outer.toFixed(3)} mm（y ${ys[0].toFixed(2)}..${ys[ys.length - 1].toFixed(2)}）\n`);
console.log('   y(mm)     左壁x(mm)   相对最外(mm)');
for (const y of ys) {
  if (y < 10.4 || y > 15.6) continue;
  const x = prof.get(y);
  console.log(`  ${y.toFixed(2).padStart(6)}   ${x.toFixed(3).padStart(10)}   ${(x - outer).toFixed(3).padStart(8)}`);
}

const inRange = (a, b) => ys.filter((y) => y >= a && y <= b).map((y) => prof.get(y));
const b1 = inRange(10.6, 11.5), l1 = inRange(11.7, 15.4);
const st = (a) => (a.length ? `min ${Math.min(...a).toFixed(3)}  max ${Math.max(...a).toFixed(3)}` : 'n/a');
console.log(`\n底座侧壁 (y 10.6-11.5): ${st(b1)}`);
console.log(`上盖侧壁 (y 11.7-15.4): ${st(l1)}`);
if (b1.length && l1.length) {
  const step = Math.min(...b1) - Math.min(...l1);
  const verdict = Math.abs(step) <= 0.05 ? 'OK 齐平（同一竖直平面）' : step > 0 ? 'FAIL 底座外凸 -> 可见台阶' : 'FAIL 上盖外凸 -> 可见悬挑';
  console.log(`台阶 = 底座最外 - 上盖最外 = ${step.toFixed(3)} mm  ${verdict}`);
}
