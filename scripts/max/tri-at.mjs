// tri-at：列出某个 (x,z) 竖直柱内所有三角形（按 y 排序），给出各自在该点的 y、颜色、法线
// 用法：node scripts/max/tri-at.mjs <mesh.json> <x> <z> [--r 0.25]
import { readFileSync } from 'node:fs'
const [file, xs, zs] = process.argv.slice(2)
const X = Number(xs), Z = Number(zs)
const i = process.argv.indexOf('--r'); const R = i > 0 ? Number(process.argv[i + 1]) : 0.25
const raw = JSON.parse(readFileSync(file, 'utf8'))
const V = raw.vertices.map((v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]))
let F = raw.faces; if (Array.isArray(F[0])) F = F.flat()
const C = raw.colors || []
let sc = 1
{ let m = 0; for (const v of V) m = Math.max(m, Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])); if (m < 10) sc = 1000 }
const P = V.map((v) => [v[0] * sc, v[1] * sc, v[2] * sc])
const hits = []
for (let k = 0; k < F.length; k += 3) {
  const a = P[F[k]], b = P[F[k+1]], c = P[F[k+2]]
  const d = (b[2]-c[2])*(a[0]-c[0]) + (c[0]-b[0])*(a[2]-c[2])
  if (Math.abs(d) < 1e-12) continue
  const l1 = ((b[2]-c[2])*(X-c[0]) + (c[0]-b[0])*(Z-c[2])) / d
  const l2 = ((c[2]-a[2])*(X-c[0]) + (a[0]-c[0])*(Z-c[2])) / d
  const l3 = 1 - l1 - l2
  const tol = R / 3
  if (l1 < -tol || l2 < -tol || l3 < -tol) continue
  const y = l1*a[1] + l2*b[1] + l3*c[1]
  const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], w = [c[0]-a[0], c[1]-a[1], c[2]-a[2]]
  const n = [u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]]
  const L = Math.hypot(...n) || 1
  const ar = 0.5 * L
  hits.push({ k: k/3, y, col: C[k/3] ?? C[k] ?? '?', n: n.map((q) => q/L), ar, a, b, c })
}
hits.sort((p, q) => q.y - p.y)
console.log(`${file}  (x=${X}, z=${Z}, r=${R})  命中 ${hits.length} 个三角形`)
for (const h of hits.slice(0, 10)) {
  console.log(`  y=${h.y.toFixed(4)}  col=${h.col}  n=(${h.n.map((q) => q.toFixed(3)).join(',')})  area=${h.ar.toFixed(2)}mm²  tri#${h.k}`)
  console.log(`      v0=(${h.a.map((q) => q.toFixed(2)).join(', ')}) v1=(${h.b.map((q) => q.toFixed(2)).join(', ')}) v2=(${h.c.map((q) => q.toFixed(2)).join(', ')})`)
}
