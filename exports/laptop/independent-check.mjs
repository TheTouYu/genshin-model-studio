// independent-check.mjs —— 独立 AABB 复算（不依赖 gms.touches 的平面近似）
//
// 依据 PROMPT-laptop-model.md §4/§5：gms.touches 对 quad 用 AABB 且忽略 normal（web/index.html:2994-2996），
// 平面件判定既假阳性又假阴性 → 必须另写 node 脚本读 items.json 逐对复算轴对齐盒间距并报告最大缝隙。
//
// 本脚本对每个 item 按其真实 rotation（YXZ 欧拉，与 web/draw/preview.js 同款）把局部盒变换到世界，
// 取 8 角点世界 AABB，然后：
//   ① 逐对算轴对齐盒间距（分轴 gap + 欧氏 gap），报告「应贴合对」的最大缝隙与全对最小间隙；
//   ② 逐件找最近邻（min gap），列出孤立件（最近邻 > 0.001 m）；
//   ③ 支撑链 BFS：AABB 在下方 1mm 内且 x/z 投影重叠 = 支撑；报告无地面链的件（悬空）；
//   ④ 打印资源分布、世界包围盒、关键尺寸读数（供 s4-verify.json 引用）。
import { readFileSync, writeFileSync } from 'node:fs'

const ITEMS = process.argv[2] || '/home/h/genshin-model-studio/exports/laptop/items.json'
const OUT = process.argv[3] || '/home/h/genshin-model-studio/exports/laptop/independent-aabb.json'
const SPEC = JSON.parse(readFileSync('/home/h/genshin-model-studio/exports/laptop/spec.json', 'utf8'))
const items = JSON.parse(readFileSync(ITEMS, 'utf8'))
const DEG = Math.PI / 180

const matYXZ = (r) => {
  const [a, b, c] = r.map((v) => v * DEG)
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c)
  return [
    [cb * cc + sb * sa * sc, -cb * sc + sb * sa * cc, sb * ca],
    [ca * sc, ca * cc, -sa],
    [-sb * cc + cb * sa * sc, sb * sc + cb * sa * cc, cb * ca],
  ]
}
const apply = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
]

const boxes = items.map((it, i) => {
  const s = it.scale, p = it.position, r = it.rotation || [0, 0, 0]
  const M = matYXZ(r)
  const hx = Math.abs(s[0]) / 2, hy = Math.abs(s[1]) / 2, hz = Math.abs(s[2]) / 2
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const w = apply(M, [sx * hx, sy * hy, sz * hz])
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], p[k] + w[k])
      mx[k] = Math.max(mx[k], p[k] + w[k])
    }
  }
  const spec = SPEC.parts[i] || {}
  return { i, id: spec.id || `item${i}`, resourceId: it.resourceId, pos: p, rot: r, scale: s, min: mn, max: mx,
           center: mn.map((v, k) => (v + mx[k]) / 2), size: mn.map((v, k) => mx[k] - v), specRef: spec.ref || null }
})

const axisGap = (a, b) => {
  const g = [0, 0, 0]
  for (let k = 0; k < 3; k++) g[k] = Math.max(0, Math.max(a.min[k] - b.max[k], b.min[k] - a.max[k]))
  return g
}
const gap = (a, b) => { const g = axisGap(a, b); return { g, d: Math.hypot(...g) } }

// ① 逐对
const pairs = []
for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
  const { g, d } = gap(boxes[i], boxes[j])
  pairs.push({ a: boxes[i].id, b: boxes[j].id, d: +d.toFixed(6), axis: g.map((v) => +v.toFixed(6)) })
}
pairs.sort((x, y) => x.d - y.d)

// ② 最近邻 / 孤立
const nn = boxes.map((b) => {
  let best = { d: Infinity, id: null }
  for (const o of boxes) {
    if (o.i === b.i) continue
    const { d } = gap(b, o)
    if (d < best.d) best = { d, id: o.id }
  }
  return { id: b.id, nearest: best.id, minGap: +best.d.toFixed(6) }
})
const isolated = nn.filter((n) => n.minGap > 0.001)

// ③ 连接图（接触 = 轴对齐盒间距 ≤ 0.001 m；AABB 忽略朝向 → 对平面件是保守的「外接盒接触」）
//    判定：每个连通分量必须包含「贴地件」（minY ≤ 0.001）——分量不含贴地件 = 悬空。
const contact = (a, b) => gap(a, b).d <= 0.001
const ground = boxes.filter((b) => b.min[1] <= 0.001).map((b) => b.id)
const groundSet = new Set(ground)
const adj = new Map(boxes.map((b) => [b.id, []]))
for (const p of pairs) {
  if (p.d <= 0.001) { adj.get(p.a).push(p.b); adj.get(p.b).push(p.a) }
}
const comps = []
const seenAll = new Set()
for (const b of boxes) {
  if (seenAll.has(b.id)) continue
  const comp = []; const q = [b.id]; seenAll.add(b.id)
  while (q.length) {
    const cur = q.shift(); comp.push(cur)
    for (const nb of adj.get(cur)) { if (!seenAll.has(nb)) { seenAll.add(nb); q.push(nb) } }
  }
  comps.push(comp)
}
const floating = comps.filter((c) => !c.some((id) => groundSet.has(id)))
const floatingIds = floating.flat()
// 垂直支撑（信息项）：是否存在「在下方 1mm 内且 x/z 投影重叠」的件
const hasBelow = (b) => boxes.some((o) => o.id !== b.id && o.max[1] <= b.min[1] + 0.001 && gap(b, o).g[0] <= 0.001 && gap(b, o).g[2] <= 0.001)
const noBelow = boxes.filter((b) => !hasBelow(b)).map((b) => b.id)

// ④ 关键读数
const worldMin = boxes.reduce((a, b) => a.map((v, k) => Math.min(v, b.min[k])), [Infinity, Infinity, Infinity])
const worldMax = boxes.reduce((a, b) => a.map((v, k) => Math.max(v, b.max[k])), [-Infinity, -Infinity, -Infinity])
const byRes = {}
for (const it of items) byRes[it.resourceId] = (byRes[it.resourceId] || 0) + 1
const gapsSorted = pairs.map((p) => p.d)
const out = {
  input: ITEMS,
  itemCount: items.length,
  resourceHistogram: byRes,
  solidItems: items.map((it, i) => ({ i, id: boxes[i].id, resourceId: it.resourceId })).filter((x) => x.resourceId === 10009008),
  worldBBox: { min: worldMin.map((v) => +v.toFixed(6)), max: worldMax.map((v) => +v.toFixed(6)),
               size: worldMax.map((v, k) => +(v - worldMin[k]).toFixed(6)) },
  pairStats: {
    pairs: pairs.length,
    minGap: +gapsSorted[0].toFixed(6),
    touchingPairs_le_0_001: gapsSorted.filter((d) => d <= 0.001).length,
    overlappingPairs_eq_0: gapsSorted.filter((d) => d === 0).length,
    largestGap: +gapsSorted[gapsSorted.length - 1].toFixed(6),
  },
  // 应贴合对（按 §2 规格显式列出）——报告其最大缝隙
  expectedFlush: [
    ['base_bottom', 'base_back'], ['base_bottom', 'base_front'], ['base_bottom', 'base_left'], ['base_bottom', 'base_right'],
    ['top_front', 'base_front'], ['top_back', 'base_back'],
    ['top_kb_left', 'well_front'], ['top_kb_left', 'well_left'], ['top_kb_right', 'well_front'], ['top_kb_right', 'well_right'],
    ['top_kb_left', 'top_back'], ['top_kb_right', 'top_back'],
    ['cham_base_pp', 'base_front'], ['cham_base_pp', 'base_right'],
    ['well_floor', 'well_front'], ['well_floor', 'well_back'], ['well_floor', 'well_left'], ['well_floor', 'well_right'],
    ['tp_face', 'tp_front'], ['tp_face', 'tp_back'], ['tp_face', 'tp_left'], ['tp_face', 'tp_right'],
    ['lid_inner', 'lid_front'], ['lid_inner', 'lid_back'], ['lid_inner', 'lid_left'], ['lid_inner', 'lid_right'],
    ['screen_backplate', 'lid_inner'], ['bezel_top', 'screen_backplate'], ['screen_glow', 'bezel_top'],
    ['key_r0c0', 'well_floor'], ['key_r5_space', 'well_floor'],
    ['usbc1_back', 'base_left'], ['usbc2_back', 'base_left'], ['jack_back', 'base_right'],
    ['grille1_blade0', 'grille1_frame'], ['grille2_blade0', 'grille2_frame'],
    ['foot_pp', 'base_bottom'], ['foot_np', 'base_bottom'], ['hinge_cover_left', 'top_back'], ['hinge_rod', 'top_back'],
    ['lid_inner', 'hinge_rod'],
  ].map(([a, b]) => {
    const A = boxes.find((x) => x.id === a), B = boxes.find((x) => x.id === b)
    if (!A || !B) return { a, b, missing: true }
    const { g, d } = gap(A, B)
    return { a, b, gap: +d.toFixed(6), axis: g.map((v) => +v.toFixed(6)), note: d <= 0.001 ? 'contact/overlap' : 'GAP' }
  }),
  nearestNeighbour: nn,
  isolated: isolated,
  isolatedCount: isolated.length,
  contactGraph: { components: comps.length, sizes: comps.map((c) => c.length).sort((a, b) => b - a),
                  floatingComponents: floating.map((c) => ({ size: c.length, ids: c.slice(0, 20) })) },
  floatingNoGroundChain: floatingIds,
  floatingCount: floatingIds.length,
  groundItems: ground.length,
  noPartDirectlyBelow: noBelow,
  worstGaps: pairs.slice(-12).reverse(),
  boxes: boxes.map((b) => ({ id: b.id, resourceId: b.resourceId, min: b.min.map((v) => +v.toFixed(6)),
    max: b.max.map((v) => +v.toFixed(6)), size: b.size.map((v) => +v.toFixed(6)), ref: b.specRef })),
}
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
console.log('items:', out.itemCount, '| resources:', JSON.stringify(byRes))
console.log('world bbox size:', out.worldBBox.size.join(' × '))
console.log('pairs:', out.pairStats.pairs, '| touching(≤1mm):', out.pairStats.touchingPairs_le_0_001,
            '| overlapping:', out.pairStats.overlappingPairs_eq_0, '| minGap:', out.pairStats.minGap)
console.log('isolated (nearest > 1mm):', out.isolatedCount, out.isolated.map((x) => `${x.id}(${x.minGap})`).join(', ') || '(none)')
console.log('floating (no ground chain):', out.floatingCount, (out.floatingNoGroundChain || []).join(', ') || '(none)')
console.log('expectedFlush GAPs:', out.expectedFlush.filter((x) => x.note === 'GAP').map((x) => `${x.a}~${x.b}:${x.gap}`).join(', ') || '(none)')
console.log('->', OUT)
