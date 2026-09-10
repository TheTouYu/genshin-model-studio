// weld-audit：扫「两张面法向近似、相距 < tol、投影重叠」的共面打架区域（R45 同族扩展）
// 用法：node scripts/max/weld-audit.mjs web/draw/macbook-current.json [--tol 0.05] [--ang 0.98] [--top 12]
// 判据：|n1·n2| >= ang、A 顶点到 B 平面的最大距离 <= tol（双向）、xz 投影重叠（点在三角内或边相交）
// 输出：按面积排序的簇（世界坐标 mm + 颜色），exit 1 = 发现 >=1 簇
import { readFileSync } from 'node:fs'

const file = process.argv[2] || 'web/draw/macbook-current.json'
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d }
const TOL = arg('tol', 0.05), ANG = arg('ang', 0.98), TOP = arg('top', 12)
const SAME = process.argv.includes('--same')   // 只看同色两面打架（同材质=同一张可见面被盖两层）
const raw = JSON.parse(readFileSync(file, 'utf8'))
const V = raw.vertices.map((v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]))
let F = raw.faces
if (Array.isArray(F[0])) F = F.flat()
const C = raw.colors || []
let scale = 1
{ let m = 0; for (const v of V) m = Math.max(m, Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]))
  if (m < 10) scale = 1000 }            // m → mm
const P = V.map((v) => [v[0] * scale, v[1] * scale, v[2] * scale])

const nrm = (a, b, c) => { const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]]
  const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
  const L = Math.hypot(...n) || 1; return [n[0]/L, n[1]/L, n[2]/L] }
const area = (a, b, c) => 0.5 * Math.hypot((b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]),
  (b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]), (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))

const T = []
for (let i = 0; i < F.length; i += 3) {
  const a = P[F[i]], b = P[F[i+1]], c = P[F[i+2]]
  const n = nrm(a, b, c), ar = area(a, b, c)
  if (ar < 1e-6) continue
  const cen = [(a[0]+b[0]+c[0])/3, (a[1]+b[1]+c[1])/3, (a[2]+b[2]+c[2])/3]
  T.push({ i: i/3, a, b, c, n, ar, cen, col: C[i/3] ?? C[i] ?? '?' })
}
// 空间桶（2mm 格）
const CELL = 2, buckets = new Map()
const key = (x, y, z) => `${Math.floor(x/CELL)},${Math.floor(y/CELL)},${Math.floor(z/CELL)}`
for (const t of T) { const k = key(...t.cen); (buckets.get(k) || buckets.set(k, []).get(k)).push(t) }
const inTri2 = (p, a, b, c) => { const d = (b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2])
  const l1 = ((b[2]-c[2])*(p[0]-c[0])+(c[0]-b[0])*(p[2]-c[2]))/d, l2 = ((c[2]-a[2])*(p[0]-c[0])+(a[0]-c[0])*(p[2]-c[2]))/d
  return l1 >= -0.02 && l2 >= -0.02 && l1 + l2 <= 1.02 }
const bboxOv = (t, u) => { const m = (q, k) => Math.max(q.a[k], q.b[k], q.c[k]), n = (q, k) => Math.min(q.a[k], q.b[k], q.c[k])
  return n(t,0) <= m(u,0)+1e-6 && n(u,0) <= m(t,0)+1e-6 && n(t,2) <= m(u,2)+1e-6 && n(u,2) <= m(t,2)+1e-6 }
const pd = (p, t) => Math.abs((p[0]-t.a[0])*t.n[0] + (p[1]-t.a[1])*t.n[1] + (p[2]-t.a[2])*t.n[2])

const pairs = [], seen = new Set()
for (const [k, list] of buckets) {
  const [bx, by, bz] = k.split(',').map(Number)
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const other = buckets.get(`${bx+dx},${by+dy},${bz+dz}`); if (!other) continue
    for (const t of list) for (const u of other) {
      if (u.i <= t.i) continue
      const id = t.i + ':' + u.i; if (seen.has(id)) continue; seen.add(id)
      if (SAME && String(t.col) !== String(u.col)) continue
      if (Math.abs(t.n[0]*u.n[0] + t.n[1]*u.n[1] + t.n[2]*u.n[2]) < ANG) continue
      if (Math.max(pd(t.a,u), pd(t.b,u), pd(t.c,u), pd(u.a,t), pd(u.b,t), pd(u.c,t)) > TOL) continue
      if (!bboxOv(t, u)) continue
      const ov = inTri2(t.cen, u.a, u.b, u.c) || inTri2(u.cen, t.a, t.b, t.c)
        || inTri2(t.a, u.a, u.b, u.c) || inTri2(u.a, t.a, t.b, t.c)
      if (!ov) continue
      pairs.push({ t, u, gap: Math.max(pd(t.a,u), pd(t.b,u), pd(t.c,u)) })
    }
  }
}
// 聚类（按质心 3mm 内合并）
const clusters = []
for (const p of pairs) {
  const c = p.t.cen
  let hit = clusters.find((g) => Math.hypot(g.c[0]-c[0], g.c[1]-c[1], g.c[2]-c[2]) < 3.0)
  if (!hit) { hit = { c, n: 0, area: 0, minGap: 1e9, cols: new Set(), sample: p }; clusters.push(hit) }
  hit.n++; hit.area += p.t.ar; hit.minGap = Math.min(hit.minGap, p.gap)
  hit.cols.add(p.t.col); hit.cols.add(p.u.col)
}
clusters.sort((a, b) => b.area - a.area)
console.log(`weld-audit: ${file}  tris=${T.length}  共面打架对=${pairs.length}  簇=${clusters.length}  (tol=${TOL}mm ang=${ANG} same=${SAME})`)
for (const g of clusters.slice(0, TOP)) {
  console.log(`  area=${g.area.toFixed(2)}mm² pairs=${g.n} gap=${g.minGap.toFixed(4)}mm ` +
    `@(${g.c.map((v) => v.toFixed(1)).join(', ')}) cols=${[...g.cols].slice(0,3).join('/')}`)
}
// 已知真值自检：必须报出前唇 z≈110.3–110.5 附近至少一簇
const lip = clusters.find((g) => Math.abs(g.c[2] - 110.4) < 2 && Math.abs(g.c[1] - 11.5) < 1.5)
console.log(lip ? `SELFTEST OK：报出已知前唇对 @(${lip.c.map((v)=>v.toFixed(1)).join(', ')})` : 'SELFTEST FAIL：未报出已知前唇对 → 尺子不可信')
process.exit(clusters.length ? 1 : 0)
