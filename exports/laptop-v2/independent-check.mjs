// independent-check.mjs —— 笔记本 v2 独立 AABB 复算（不依赖 gms.touches 的平面近似）
//
// 依据 PROMPT-laptop-detail.md §5：gms.touches 对 quad 用 AABB 且忽略 normal → 平面件判定既假阳性又假阴性，
// 必须另写脚本读 items.json 逐对复算。v2 相对 v1 的两点加强：
//   ① 圆柱件（10009008：rod / poly 段 / disc）用**精确轴对齐包围盒**（轴向 = R·(0,1,0)、半径 = scale[0]/2、
//      半长 = scale[1]/2；逐轴 extent = |u_k|·halfLen + r·sqrt(1−u_k²)）——v1 的 8 角点盒对斜置圆柱
//      高估最多 ~0.8 mm（实测 lid_rim_1 使 x 包围盒虚报 0.305577）；
//   ② 逐件与 spec-v2.json 对位（数值序拼装保证 1:1 同序），并复核 RDP 存活余量。
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = '/home/h/genshin-model-studio'
const ITEMS = process.argv[2] || `${ROOT}/exports/laptop-v2/items.json`
const OUT = process.argv[3] || `${ROOT}/exports/laptop-v2/independent-aabb.json`
const SPEC = JSON.parse(readFileSync(`${ROOT}/exports/laptop-v2/spec-v2.json`, 'utf8'))
const items = JSON.parse(readFileSync(ITEMS, 'utf8'))
const DEG = Math.PI / 180
const CYL = 10009008

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
  if (it.resourceId === CYL) {
    // 精确圆柱包围盒
    const u = apply(M, [0, 1, 0])
    const rad = Math.max(hx, hz)
    for (let k = 0; k < 3; k++) {
      const ext = Math.abs(u[k]) * hy + rad * Math.sqrt(Math.max(0, 1 - u[k] * u[k]))
      mn[k] = p[k] - ext; mx[k] = p[k] + ext
    }
  } else {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const w = apply(M, [sx * hx, sy * hy, sz * hz])
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k] + w[k]); mx[k] = Math.max(mx[k], p[k] + w[k]) }
    }
  }
  const sp = SPEC.parts[i] || {}
  return { i, id: sp.id || `item${i}`, resourceId: it.resourceId, pos: p, rot: r, scale: s, min: mn, max: mx,
           center: mn.map((v, k) => (v + mx[k]) / 2), size: mn.map((v, k) => mx[k] - v), specRef: sp.ref || null }
})

const axisGap = (a, b) => {
  const g = [0, 0, 0]
  for (let k = 0; k < 3; k++) g[k] = Math.max(0, Math.max(a.min[k] - b.max[k], b.min[k] - a.max[k]))
  return g
}
const gap = (a, b) => { const g = axisGap(a, b); return { g, d: Math.hypot(...g) } }

const pairs = []
for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
  const { g, d } = gap(boxes[i], boxes[j])
  pairs.push({ a: boxes[i].id, b: boxes[j].id, d: +d.toFixed(6), axis: g.map((v) => +v.toFixed(6)) })
}
pairs.sort((x, y) => x.d - y.d)

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

const contact = (a, b) => gap(a, b).d <= 0.001
const ground = boxes.filter((b) => b.min[1] <= 0.001).map((b) => b.id)
const groundSet = new Set(ground)
const adj = new Map(boxes.map((b) => [b.id, []]))
for (const p of pairs) if (p.d <= 0.001) { adj.get(p.a).push(p.b); adj.get(p.b).push(p.a) }
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

const worldMin = boxes.reduce((a, b) => a.map((v, k) => Math.min(v, b.min[k])), [Infinity, Infinity, Infinity])
const worldMax = boxes.reduce((a, b) => a.map((v, k) => Math.max(v, b.max[k])), [-Infinity, -Infinity, -Infinity])
const byRes = {}
for (const it of items) byRes[it.resourceId] = (byRes[it.resourceId] || 0) + 1
const gapsSorted = pairs.map((p) => p.d)

// —— 尺寸/姿态读数 ——
const find = (id) => boxes.find((b) => b.id === id)
const specOf = (id) => SPEC.parts.find((p) => p.id === id)
const r6 = (v) => +Number(v).toFixed(6)
const topFront = find('top_front')
const lidInner = find('lid_inner'), lidOuter = find('lid_outer')
const nLid = apply(matYXZ(items[lidInner.i].rotation), [0, 1, 0])
const openDeg = 180 - Math.acos(Math.max(-1, Math.min(1, nLid[1]))) / DEG
// 面片中心 = 表面点 − (thick/2)·n → 两面板中心的法向距离 + 各自半厚 = 表面间距（= 上盖厚）
const lidThMeasured = Math.abs(
  (items[lidOuter.i].position[0] - items[lidInner.i].position[0]) * nLid[0] +
  (items[lidOuter.i].position[1] - items[lidInner.i].position[1]) * nLid[1] +
  (items[lidOuter.i].position[2] - items[lidInner.i].position[2]) * nLid[2]) +
  Math.abs(items[lidInner.i].scale[1]) / 2 + Math.abs(items[lidOuter.i].scale[1]) / 2
const lowest = boxes.reduce((a, b) => (b.min[1] < a.min[1] ? b : a), boxes[0])

// —— RDP 余量复核（spec 的 w/h 与服务端实测规则对账） ——
const PX_PER_M = 460
const rdpLimit = (w, h) => Math.max(0.1 / PX_PER_M, 0.005 * Math.hypot(w, h))
const rdp = SPEC.parts.filter((p) => p.kind === 'quad').map((p) => ({
  id: p.id, w: p.w, h: p.h, margin: +(Math.min(p.w, p.h) / rdpLimit(p.w, p.h)).toFixed(4),
}))
const rdpWorst = rdp.slice().sort((a, b) => a.margin - b.margin).slice(0, 8)

// —— 应贴合对（v2 设计意图；间隙 > 1mm 视为异常） ——
const expectedFlush = [
  ['top_front', 'base_front'], ['top_back', 'base_back'], ['base_bottom', 'base_back'], ['base_bottom', 'base_front'],
  ['well_floor', 'well_front'], ['well_floor', 'well_left'], ['top_kb_left', 'well_left'],
  ['key_r0c0_f', 'well_floor'], ['key_r0c0_b', 'well_floor'], ['key_r0c0_l', 'well_floor'], ['key_r0c0_r', 'well_floor'],
  ['key_r5_space_f', 'well_floor'], ['key_r5_space_b', 'well_floor'],
  ['tp_face', 'tp_front_0'], ['tp_face', 'tp_left'], ['tp_face', 'top_mid'],
  ['screen_backplate', 'lid_inner'], ['bezel_top', 'screen_backplate'], ['screen_glow_0', 'bezel_bottom'],
  ['screen_glow_11', 'bezel_top'], ['cam_core', 'cam_ring_top'], ['logo_face', 'logo_backing'],
  ['usbc1_top', 'base_left'], ['usbc2_top', 'base_left'], ['usbc1_back', 'usbc1_top'], ['jack_top', 'base_right'],
  ['jack_back', 'jack_ring_top'], ['grille1_blade0_0', 'grille1_back'], ['grille2_blade0_0', 'grille2_back'],
  ['nameplate', 'base_bottom'], ['serial_slot', 'base_bottom'], ['speaker_back_0', 'base_bottom'],
  ['hinge_rod_0', 'top_back'], ['hinge_cover_left', 'top_back'], ['lid_inner', 'hinge_rod_2'],
  ['foot_pp', 'base_bottom'], ['foot_nn', 'base_bottom'],
].map(([a, b]) => {
  const A = find(a), B = find(b)
  if (!A || !B) return { a, b, missing: true }
  const { g, d } = gap(A, B)
  return { a, b, gap: +d.toFixed(6), axis: g.map((v) => +v.toFixed(6)), note: d <= 0.001 ? 'contact/overlap' : 'GAP' }
})

const out = {
  input: ITEMS,
  itemCount: items.length,
  resourceHistogram: byRes,
  solidItems: items.map((it, i) => ({ i, id: boxes[i].id, resourceId: it.resourceId })).filter((x) => x.resourceId === CYL),
  worldBBox: { min: worldMin.map(r6), max: worldMax.map(r6), size: worldMax.map((v, k) => r6(v - worldMin[k])) },
  dimensions: {
    topFaceY: r6(items[topFront.i].position[1] + items[topFront.i].scale[1] / 2),
    lidThickness: r6(lidThMeasured),
    closedTotalHeight: r6(items[topFront.i].position[1] + items[topFront.i].scale[1] / 2 + lidThMeasured),
    openAngleDeg: r6(openDeg),
    lidFarEndY: r6(lidInner.max[1]),
    lowestItem: { id: lowest.id, minY: r6(lowest.min[1]) },
    widthX: r6(worldMax[0] - worldMin[0]),
    depthZ: r6(worldMax[2] - worldMin[2]),
  },
  pairStats: {
    pairs: pairs.length,
    minGap: r6(gapsSorted[0]),
    touchingPairs_le_0_001: gapsSorted.filter((d) => d <= 0.001).length,
    overlappingPairs_eq_0: gapsSorted.filter((d) => d === 0).length,
    largestGap: r6(gapsSorted[gapsSorted.length - 1]),
  },
  rdp: { rule: SPEC.rdpRule, minMargin: +Math.min(...rdp.map((r) => r.margin)).toFixed(4), worst: rdpWorst, quadCount: rdp.length },
  expectedFlush,
  nearestNeighbour: nn,
  isolated,
  isolatedCount: isolated.length,
  contactGraph: { components: comps.length, sizes: comps.map((c) => c.length).sort((a, b) => b - a),
                  floatingComponents: floating.map((c) => ({ size: c.length, ids: c.slice(0, 20) })) },
  floatingNoGroundChain: floatingIds,
  floatingCount: floatingIds.length,
  groundItems: ground.length,
  worstGaps: pairs.slice(-12).reverse(),
  boxes: boxes.map((b) => ({ id: b.id, resourceId: b.resourceId, min: b.min.map(r6), max: b.max.map(r6),
    size: b.size.map(r6), ref: b.specRef })),
}
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
console.log('items:', out.itemCount, '| resources:', JSON.stringify(byRes))
console.log('world bbox size:', out.worldBBox.size.join(' × '))
console.log('dimensions:', JSON.stringify(out.dimensions))
console.log('pairs:', out.pairStats.pairs, '| touching(≤1mm):', out.pairStats.touchingPairs_le_0_001,
            '| minGap:', out.pairStats.minGap, '| largestGap:', out.pairStats.largestGap)
console.log('RDP min margin:', out.rdp.minMargin, '| worst:', out.rdp.worst.map((r) => `${r.id}:${r.margin}`).join(', '))
console.log('isolated (nearest > 1mm):', out.isolatedCount, isolated.map((x) => `${x.id}(${x.minGap})`).join(', ') || '(none)')
console.log('floating (no ground chain):', out.floatingCount, floatingIds.join(', ') || '(none)')
console.log('expectedFlush GAPs:', out.expectedFlush.filter((x) => x.note === 'GAP').map((x) => `${x.a}~${x.b}:${x.gap}`).join(', ') || '(none)')
console.log('->', OUT)
