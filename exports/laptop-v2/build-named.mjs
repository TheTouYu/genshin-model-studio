// build-named.mjs —— 由 work.json + spec-v2.json 离线生成 work-named.json（含 components/links）
//
// 为什么离线生成：`window.__gmsNoClear=true` 逐文件注入 13 个 part 时，随模型增长每次 gms.part 触发
// 全量重绘/重生成，第 4 个键盘块即 CDP Runtime.evaluate 超时（实测 2026-09-08）。
// applyWork（web/index.html:2068-2090）会按 components 逐条重注册命名件并恢复 links，因此
// 离线算好 components/links 后一次 gms.import 即可（语义与引擎一致）。
//
// 引擎接触语义（web/index.html:3087-3112 gmsGeomGap 逐行复刻）：
//   rod/cyl 之间 = 线段-线段距离 − rad1 − rad2；含 box（quad 注册盒 [w/2,h/2,thick/2]）时 = 轴对齐盒间距。
//   contact = gap ≤ 0.001（web/index.html:3127）。
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = '/home/h/genshin-model-studio'
const OUT = `${ROOT}/exports/laptop-v2`
const work = JSON.parse(readFileSync(`${OUT}/work.json`, 'utf8'))
const spec = JSON.parse(readFileSync(`${OUT}/spec-v2.json`, 'utf8'))
const parts = spec.parts
if (work.strokes.length !== parts.length) throw new Error(`strokes(${work.strokes.length}) ≠ spec.parts(${parts.length})`)

// —— 注册世界体（与 gmsPartRegister 一致） ——
const worlds = {}
const components = {}
parts.forEach((p, i) => {
  if (!p.name || !p.registered) return
  const sid = work.strokes[i].id
  components[sid] = p.name
  if (p.kind === 'quad') {
    worlds[p.name] = { kind: 'box', c: [p.x, p.y, p.z], half: [p.w / 2, p.h / 2, p.thick / 2] }
  } else if (p.kind === 'rod') {
    worlds[p.name] = { kind: 'rod', a: [p.spec.x1, p.spec.y1, p.spec.z], b: [p.spec.x2, p.spec.y2, p.spec.z], rad: p.spec.size / 2 }
  } else if (p.kind === 'disc') {
    worlds[p.name] = { kind: 'cyl', c: [p.spec.x, p.spec.y, p.spec.z], dir: [0, 1, 0], rad: p.spec.r, half: p.spec.thick / 2 }
  }
})
const names = Object.keys(worlds)
const bboxOf = (w) => {
  if (w.kind === 'rod') {
    const xs = [w.a[0], w.b[0]], ys = [w.a[1], w.b[1]], zs = [w.a[2], w.b[2]]
    return { minX: Math.min(...xs) - w.rad, maxX: Math.max(...xs) + w.rad, minY: Math.min(...ys) - w.rad, maxY: Math.max(...ys) + w.rad, minZ: Math.min(...zs) - w.rad, maxZ: Math.max(...zs) + w.rad }
  }
  if (w.kind === 'cyl') {
    const [cx, cy, cz] = w.c, [dx, dy, dz] = w.dir
    const hx = Math.abs(dx) * w.half + w.rad, hy = Math.abs(dy) * w.half + w.rad, hz = Math.abs(dz) * w.half + w.rad
    return { minX: cx - hx, maxX: cx + hx, minY: cy - hy, maxY: cy + hy, minZ: cz - hz, maxZ: cz + hz }
  }
  return { minX: w.c[0] - w.half[0], maxX: w.c[0] + w.half[0], minY: w.c[1] - w.half[1], maxY: w.c[1] + w.half[1], minZ: w.c[2] - w.half[2], maxZ: w.c[2] + w.half[2] }
}
const boxGap = (b1, b2) => Math.hypot(
  Math.max(0, Math.max(b1.minX - b2.maxX, b2.minX - b1.maxX)),
  Math.max(0, Math.max(b1.minY - b2.maxY, b2.minY - b1.maxY)),
  Math.max(0, Math.max(b1.minZ - b2.maxZ, b2.minZ - b1.maxZ)))
// 线段-线段最近距离（web/index.html segSegDist 的等价实现）
const segSegDist = (p, p2, q, q2) => {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const d1 = sub(p2, p), d2 = sub(q2, q), r = sub(p, q)
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r)
  let s, t
  const EPS = 1e-12
  if (a <= EPS && e <= EPS) return { d: Math.hypot(...r), s1: 0, s2: 0 }
  if (a <= EPS) { s = 0; t = Math.max(0, Math.min(1, f / e)) }
  else {
    const c = dot(d1, r)
    if (e <= EPS) { t = 0; s = Math.max(0, Math.min(1, -c / a)) }
    else {
      const b = dot(d1, d2), denom = a * e - b * b
      s = denom > EPS ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0
      t = (b * s + f) / e
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)) }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)) }
    }
  }
  const P = [p[0] + d1[0] * s, p[1] + d1[1] * s, p[2] + d1[2] * s]
  const Q = [q[0] + d2[0] * t, q[1] + d2[1] * t, q[2] + d2[2] * t]
  return { d: Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]), s1: s, s2: t }
}
const gapOf = (A, B) => {
  const seg = (w) => w.kind === 'rod' ? [w.a, w.b] : (w.kind === 'cyl' ? [w.c.map((v, i) => v - w.dir[i] * w.half), w.c.map((v, i) => v + w.dir[i] * w.half)] : null)
  const s1 = seg(A), s2 = seg(B)
  if (s1 && s2) return segSegDist(s1[0], s1[1], s2[0], s2[1]).d - A.rad - B.rad
  return boxGap(bboxOf(A), bboxOf(B))
}

const links = []
const pairs = []
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const g = gapOf(worlds[names[i]], worlds[names[j]])
  pairs.push([names[i], names[j], +g.toFixed(6)])
  if (g <= 0.001) links.push({ a: names[i], b: names[j], support: null, gap: +g.toFixed(6), contact: true })
}
const named = { ...work, components, links }
writeFileSync(`${OUT}/work-named.json`, JSON.stringify(named))
writeFileSync(`${OUT}/gate-pairs-offline.json`, JSON.stringify({ named: names.length, pairs: pairs.length, links: links.length, contactPairs: pairs.filter((p) => p[2] <= 0.001) }, null, 2) + '\n')
const ground = names.filter((n) => bboxOf(worlds[n]).minY <= 0.001)
console.log('named:', names.length, '| links(≤1mm):', links.length, '| ground-touching named:', ground.length)
console.log('ground:', ground.join(', '))
console.log('->', `${OUT}/work-named.json`)

// —— 顺带入库页面历史（用户上轮需求「写到页面的历史里面去」；同时供门禁脚本用
//    /api/history/get 一次性把完整作品（含 components/links）喂给 gms.import，
//    避免逐 part 注入在模型变大后 CDP Runtime.evaluate 超时）——
const payload = { name: `笔记本 MacBook v2 细节升级（${work.strokes.length} 元件）`, tags: `laptop-v2 ${work.strokes.length}元件 31命名/22连接 开合100° D1-D10`, items: work.strokes.length, work: named }
const hs = await fetch('http://localhost:8787/api/history/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
if (!hs.ok) { console.error('history save FAILED', hs.status, await hs.text()); process.exit(1) }
const meta = await hs.json()
writeFileSync(`${OUT}/history-id.txt`, meta.id + '\n')
console.log('history entry:', JSON.stringify(meta))
