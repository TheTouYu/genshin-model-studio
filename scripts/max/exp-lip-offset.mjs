// 实验：前唇带所有权归机身扫掠 —— 把台面板在该带的下表面（法线朝下的 alu 面）整体下沉 0.06mm
// 用法：node scripts/max/exp-lip-offset.mjs <in.json> <out.json> [--off 0.06] [--zmin 108.5]
import { readFileSync, writeFileSync } from 'node:fs'
const [inF, outF] = process.argv.slice(2)
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i+1]) : d }
const OFF = arg('off', 0.06), ZMIN = arg('zmin', 108.5)
const raw = JSON.parse(readFileSync(inF, 'utf8'))
const V = raw.vertices.map((v) => { const a = Array.isArray(v) ? v : [v.x, v.y, v.z]; return [a[0]*1000, a[1]*1000, a[2]*1000] }) // mm
let F = raw.faces; if (Array.isArray(F[0])) F = F.flat()
const C = raw.colors || []
const isAlu = (c) => String(c) === '0xf3f3f4' || String(c) === '16250868'
const move = new Set()
for (let k = 0; k < F.length; k += 3) {
  if (!isAlu(C[k/3] ?? C[k])) continue
  const a = V[F[k]], b = V[F[k+1]], c = V[F[k+2]]
  if (![a,b,c].every((p) => p[2] > ZMIN)) continue                    // 只动前缘带
  if (![a,b,c].every((p) => p[1] > 9.0 && p[1] < 11.7)) continue       // 只动台面高度
  const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], w = [c[0]-a[0], c[1]-a[1], c[2]-a[2]]
  const n = [u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]]
  const L = Math.hypot(...n) || 1; const ny = n[1]/L
  if (ny > -0.9) continue                                              // 只要法线朝下的台面板
  for (const idx of [F[k], F[k+1], F[k+2]]) move.add(idx)
}
const out = { ...raw }                       // 保留 lid / colors / faces 等全部字段（丢 lid 会让页面加载失败）
out.vertices = raw.vertices.map((v, i) => {  // 单位沿用输入（page-mesh 产物是米）
  if (!move.has(i)) return v
  if (Array.isArray(v)) { const a = v.slice(); a[1] -= OFF/1000; return a }
  return { ...v, y: v.y - OFF/1000 }
})
writeFileSync(outF, JSON.stringify(out))
console.log(`exp-lip-offset: 下沉顶点 ${move.size} 个（--off ${OFF}mm, z>${ZMIN}）→ ${outF}`)
