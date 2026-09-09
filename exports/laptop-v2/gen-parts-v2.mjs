// gen-parts-v2.mjs —— MacBook 式银灰极简笔记本 · 细节升级版（v2）规格生成器
//
// 依据：PROMPT-laptop-detail.md（D1–D10 + 消掉上轮 6 处妥协）+ PROMPT-laptop-model.md §2（坐标逐字沿用）
// 产出：
//   scripts/parts/laptop-v2-*.js     —— 自包含 part 输入脚本（run-gms-parts.sh 直接跑）
//   exports/laptop-v2/spec-v2.json   —— 全部元件规格（门禁/独立复算来源，与 items.json 逐件同序）
//   exports/laptop-v2/points-v2.json —— 关键点表 + conventions
//   exports/laptop-v2/rdp-table.json —— 每件 RDP 余量表（实测阈值：见下）
//
// 引擎实测（本轮 s0-preflight.json，2026-09-08 实跑）：
//   RDP 抽稀阈值（px）：epsilon = max(0.1, 0.005 × 笔画包围盒对角线)
//   矩形存活条件（米，画布 460px = 1m）：min(w,h) > max(0.0002174, 0.005 × hypot(w,h))
//   实测：0.14×0.0007 FAIL / 0.14×0.0008 OK；0.07×0.0003 FAIL / 0.07×0.0004 OK；
//         0.035×0.0002 FAIL（epsilon 下限）/ 0.035×0.0003 OK；0.0085×0.0002 FAIL / 0.0085×0.0004 OK。
//   poly 3D 折线（z 变化）端到端存活：1 笔画 3 点 → 2 根 10009008 杆（位置/旋转正确）→ 上盖边缘管用 poly 段。
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = '/home/h/genshin-model-studio'
const OUT_PARTS = join(ROOT, 'scripts/parts')
const OUT_EXP = join(ROOT, 'exports/laptop-v2')

// ---------- §2 规格常量（逐字沿用，不改数值） ----------
const W = 0.3040, D = 0.2120, H = 0.0155
const HX = W / 2, HZ = D / 2
const TOP_Y = 0.0115, LID_TH = 0.0040, TH = 0.0010, R_CHAM = 0.0100
const yBottom = (z) => 0.0006 + (z + HZ) / D * 0.0045
const OPEN_DEG = 100
const PIVOT = { y: 0.0115, z: -0.1000 }
const THETA = -OPEN_DEG * Math.PI / 180
const CT = Math.cos(THETA), ST = Math.sin(THETA)
const rotPt = (p) => { const dy = p[1] - PIVOT.y, dz = p[2] - PIVOT.z; return [p[0], PIVOT.y + dy * CT - dz * ST, PIVOT.z + dy * ST + dz * CT] }
const rotVec = (v) => [v[0], v[1] * CT - v[2] * ST, v[1] * ST + v[2] * CT]
const norm = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l] }
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const round = (v, n = 8) => Number(v.toFixed(n))

const C = {
  body: '#C9CDD4', well: '#1A1A1C', key: '#2A2A2E', tp: '#B9BEC6', tpWall: '#ADB3BC',
  hinge: '#8A8F96', port: '#4A4E55', logo: '#E8EAED', bezel: '#1A1A1C', ring: '#8A8F96',
}

// ---------- RDP 存活条件（本轮实测） ----------
const PX_PER_M = 460, RDP_RATIO = 0.005, RDP_MIN_PX = 0.1
const rdpLimit = (w, h) => Math.max(RDP_MIN_PX / PX_PER_M, RDP_RATIO * Math.hypot(w, h))
const rdpMargin = (w, h) => Math.min(w, h) / rdpLimit(w, h)
const RDP_MARGIN_MIN = 1.15

const parts = []
let seq = 0
const push = (p) => { p.seq = ++seq; parts.push(p); return p }
const quad = (o) => push({ kind: 'quad', thick: TH, lid: false, ...o })
const rodX = (o) => push({ kind: 'rod', lid: false, ...o })
const tube2 = (o) => push({ kind: 'poly2', lid: false, ...o })

// 面内局部坐标：u 沿 wDir、v 沿 hDir（原点 = face.surface）
const toLocal = (face, P) => {
  const d = [P[0] - face.surface[0], P[1] - face.surface[1], P[2] - face.surface[2]]
  return [d[0] * face.wDir[0] + d[1] * face.wDir[1] + d[2] * face.wDir[2],
          d[0] * face.hDir[0] + d[1] * face.hDir[1] + d[2] * face.hDir[2]]
}
const localToWorld = (face, u, v) => add(face.surface, add(mul(face.wDir, u), mul(face.hDir, v)))
const subQuad = (face, u0, u1, v0, v1, id, ref) => {
  const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2
  return quad({
    id, batch: face.batch, color: face.color, surface: localToWorld(face, uc, vc),
    n: face.n, wDir: face.wDir, hDir: face.hDir, w: u1 - u0, h: v1 - v0, thick: face.thick, lid: face.lid, ref,
  })
}
// 面 + 矩形开孔 → 网格分解（按 u/v 切线分带，再沿 u 合并、沿 v 合列）
const faceWithHoles = (face, holes, idPrefix, refPrefix) => {
  const us = [...new Set([-face.w / 2, face.w / 2, ...holes.flatMap((h) => [h.u0, h.u1])])].sort((a, b) => a - b)
  const vs = [...new Set([-face.h / 2, face.h / 2, ...holes.flatMap((h) => [h.v0, h.v1])])].sort((a, b) => a - b)
  const inHole = (u, v) => holes.some((h) => u > h.u0 - 1e-12 && u < h.u1 + 1e-12 && v > h.v0 - 1e-12 && v < h.v1 + 1e-12)
  const cells = []
  for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < vs.length - 1; j++) {
    const uc = (us[i] + us[i + 1]) / 2, vc = (vs[j] + vs[j + 1]) / 2
    if (!inHole(uc, vc)) cells.push({ u0: us[i], u1: us[i + 1], v0: vs[j], v1: vs[j + 1] })
  }
  const rows = []
  for (let j = 0; j < vs.length - 1; j++) {
    const row = cells.filter((c) => Math.abs(c.v0 - vs[j]) < 1e-12 && Math.abs(c.v1 - vs[j + 1]) < 1e-12).sort((a, b) => a.u0 - b.u0)
    let cur = null
    for (const c of row) {
      if (cur && Math.abs(cur.u1 - c.u0) < 1e-12) cur.u1 = c.u1
      else { if (cur) rows.push(cur); cur = { ...c } }
    }
    if (cur) rows.push(cur)
  }
  const merged = []
  for (const m of rows) {
    const prev = merged.find((o) => !o.done && Math.abs(o.u0 - m.u0) < 1e-12 && Math.abs(o.u1 - m.u1) < 1e-12 && Math.abs(o.v1 - m.v0) < 1e-12)
    if (prev) prev.v1 = m.v1
    else merged.push({ ...m, done: false })
  }
  merged.forEach((o) => delete o.done)
  return merged.map((o, k) => subQuad(face, o.u0, o.u1, o.v0, o.v1, `${idPrefix}_${k}`, `${refPrefix}（分解片 ${k + 1}）`))
}

// ============================================================
// D3 底座四角：4 段折线近似 R=0.0100（弦高误差 1.92e-4 ≤ 5e-4）
// ============================================================
const cornerFacets = (sx, sz, batch, color, ref) => {
  const cx = sx * (HX - R_CHAM), cz = sz * (HZ - R_CHAM)
  const yLo = yBottom(cz), yHi = TOP_Y
  const baseAngle = { '1,1': 0, '1,-1': -90, '-1,1': 90, '-1,-1': 180 }[`${sx},${sz}`]
  const N = 4
  const out = []
  for (let k = 0; k < N; k++) {
    const a0 = (baseAngle + k * 90 / N) * Math.PI / 180
    const a1 = (baseAngle + (k + 1) * 90 / N) * Math.PI / 180
    const am = (a0 + a1) / 2
    const P0 = [cx + R_CHAM * Math.cos(a0), 0, cz + R_CHAM * Math.sin(a0)]
    const P1 = [cx + R_CHAM * Math.cos(a1), 0, cz + R_CHAM * Math.sin(a1)]
    const wDir = norm([P1[0] - P0[0], 0, P1[2] - P0[2]])
    const n = [Math.cos(am), 0, Math.sin(am)]
    const surface = [(P0[0] + P1[0]) / 2, (yLo + yHi) / 2, (P0[2] + P1[2]) / 2]
    out.push(quad({
      id: `cham_base_${sx > 0 ? 'p' : 'n'}${sz > 0 ? 'p' : 'n'}_${k}`,
      name: k === 0 ? `cham_base_${sx > 0 ? 'p' : 'n'}${sz > 0 ? 'p' : 'n'}` : undefined,
      batch, color, surface, n, wDir, hDir: [0, 1, 0],
      w: Math.hypot(P1[0] - P0[0], P1[2] - P0[2]), h: yHi - yLo,
      ref: `${ref}（第 ${k + 1}/${N} 段）`,
    }))
  }
  return out
}

// ============================================================
// D2 键帽：顶面 0.0150² + 4 侧斜壁（45°，下沿 0.0184 → 相邻间隙 0.0006）
// ============================================================
const CAP_TOP = 0.0150, CAP_TH = 0.0003, CAP_CELL = 0.0184
const bevelKey = (id, cx, cz, wx, wz, ref) => {
  const dz = (CAP_CELL - CAP_TOP) / 2, dx = (CAP_CELL - CAP_TOP) / 2
  const yT = TOP_Y - CAP_TH, yB = 0.0095
  const dy = yT - yB
  const Lz = Math.hypot(dy, dz), Lx = Math.hypot(dy, dx)
  const halfT = CAP_TOP / 2, halfB = CAP_CELL / 2
  // 顶面
  quad({ id: `${id}_top`, batch: 'keyboard', color: C.key, surface: [cx, TOP_Y, cz], n: [0, 1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0], w: wz, h: wx, thick: CAP_TH, ref: `${ref} 顶面 0.0150×0.0150` })
  // 前（+z）
  quad({ id: `${id}_f`, batch: 'keyboard', color: C.key, surface: [cx, (yT + yB) / 2, cz + (halfT + halfB) / 2], n: norm([0, dz, dy]), wDir: [1, 0, 0], hDir: norm([0, -dy, dz]), w: wx + 2 * dx, h: Lz, thick: CAP_TH, ref: `${ref} 前斜壁 45°` })
  // 后（−z）
  quad({ id: `${id}_b`, batch: 'keyboard', color: C.key, surface: [cx, (yT + yB) / 2, cz - (halfT + halfB) / 2], n: norm([0, dz, -dy]), wDir: [1, 0, 0], hDir: norm([0, -dy, -dz]), w: wx + 2 * dx, h: Lz, thick: CAP_TH, ref: `${ref} 后斜壁 45°` })
  // 右（+x）
  quad({ id: `${id}_r`, batch: 'keyboard', color: C.key, surface: [cx + (halfT + halfB) / 2, (yT + yB) / 2, cz], n: norm([dy, dx, 0]), wDir: [0, 0, 1], hDir: norm([dx, -dy, 0]), w: wz + 2 * dz, h: Lx, thick: CAP_TH, ref: `${ref} 右斜壁 45°` })
  // 左（−x）
  quad({ id: `${id}_l`, batch: 'keyboard', color: C.key, surface: [cx - (halfT + halfB) / 2, (yT + yB) / 2, cz], n: norm([-dy, dx, 0]), wDir: [0, 0, 1], hDir: norm([-dx, -dy, 0]), w: wz + 2 * dz, h: Lx, thick: CAP_TH, ref: `${ref} 左斜壁 45°` })
}

// ============================================================
// 底座
// ============================================================
// —— 底面斜面（含 12 个开孔：2 格栅 + 铭牌 + 序列号槽 + 8 扬声器孔）——
const BOT = {
  batch: 'base', color: C.body, lid: false, thick: TH,
  surface: [0, (0.0006 + 0.0051) / 2, 0], n: norm([0, -1, 0.0045 / D]),
  wDir: [1, 0, 0], hDir: norm([0, -0.0045 / D, -1]), w: W, h: D,
}
const holeRect = (face, x0, x1, z0, z1) => {
  const A = toLocal(face, [x0, yBottom(z0), z0]), B = toLocal(face, [x1, yBottom(z1), z1])
  return { u0: Math.min(A[0], B[0]), u1: Math.max(A[0], B[0]), v0: Math.min(A[1], B[1]), v1: Math.max(A[1], B[1]) }
}
const GR = { xc: [-0.0750, 0.0750], wz: 0.0030, wx: 0.1400, zc: -0.1025, blades: 4, bladeW: 0.0005, bladeGap: 0.00025, bladeThick: 0.0003, bladeDepth: 0.0003, backDepth: 0.0012 }
// 与底面平行的面片（法线 = 底面法线）必须用引擎推导轴：wDir=[1,0,0]、hDir=BOT.hDir（≈ −z）
const botQuad = ({ id, name, batch, color, x, z, wx, wz, depth, thick, ref }) => quad({
  id, name, batch, color,
  surface: add([x, yBottom(z), z], mul(BOT.n, -depth)),
  n: BOT.n, wDir: [1, 0, 0], hDir: BOT.hDir, w: wx, h: wz, thick, ref,
})
const bottomHoles = []
GR.xc.forEach((xc) => bottomHoles.push(holeRect(BOT, xc - GR.wx / 2, xc + GR.wx / 2, GR.zc - GR.wz / 2, GR.zc + GR.wz / 2)))
const NP = { x: 0, z: 0.0545, wx: 0.0600, wz: 0.0090 }         // 铭牌位
const SN = { x: 0, z: 0.0641, wx: 0.0400, wz: 0.0022 }         // 序列号槽
bottomHoles.push(holeRect(BOT, NP.x - NP.wx / 2, NP.x + NP.wx / 2, NP.z - NP.wz / 2, NP.z + NP.wz / 2))
bottomHoles.push(holeRect(BOT, SN.x - SN.wx / 2, SN.x + SN.wx / 2, SN.z - SN.wz / 2, SN.z + SN.wz / 2))
const SPK = { xc: [-0.1100, 0.1100], z: 0.0735, slotW: 0.0016, slotD: 0.0070, pitch: 0.0026 }
const spkHoles = []
SPK.xc.forEach((xc) => {
  for (let k = 0; k < 4; k++) {
    const sx = xc + (k - 1.5) * SPK.pitch
    spkHoles.push(holeRect(BOT, sx - SPK.slotW / 2, sx + SPK.slotW / 2, SPK.z - SPK.slotD / 2, SPK.z + SPK.slotD / 2))
  }
})
bottomHoles.push(...spkHoles)
const bottomPieces = faceWithHoles(BOT, bottomHoles, 'base_bottom', '§2 底座楔形 底面斜面 y_bottom(z)=0.0006+(z+0.1060)/0.2120×0.0045')
// 最大片命名 base_bottom（门禁接触图锚点）
{
  let best = null
  for (const p of bottomPieces) { const a = p.w * p.h; if (!best || a > best.a) best = { p, a } }
  if (best) best.p.name = 'base_bottom'
}

// —— 底座四壁 ——
const baseWall = (id, surface, n, wDir, hDir, w, h, holes, ref) => {
  const face = { batch: 'base', color: C.body, lid: false, thick: TH, surface, n, wDir, hDir, w, h }
  if (!holes || !holes.length) {
    const q = quad({ id, batch: 'base', color: C.body, surface, n, wDir, hDir, w, h, ref })
    q.name = id
    return [q]
  }
  const pieces = faceWithHoles(face, holes, id, ref)
  let best = null
  for (const p of pieces) { const a = p.w * p.h; if (!best || a > best.a) best = { p, a } }
  if (best) best.p.name = id
  return pieces
}
const wallLocal = (face, y0, y1, z0, z1) => {
  const A = toLocal(face, [face.surface[0], y0, z0]), B = toLocal(face, [face.surface[0], y1, z1])
  return { u0: Math.min(A[0], B[0]), u1: Math.max(A[0], B[0]), v0: Math.min(A[1], B[1]), v1: Math.max(A[1], B[1]) }
}
// 左壁（x=−0.1520）：2 个 USB-C 开口
const LEFT = { batch: 'base', color: C.body, lid: false, thick: TH, surface: [-HX, 0.00605, 0], n: [-1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0], w: D, h: 0.0109 }
const USBC = [{ z: -0.0600 }, { z: -0.0200 }]
USBC.forEach((u, i) => { u.hole = wallLocal(LEFT, 0.00475, 0.00725, u.z - 0.00425, u.z + 0.00425) })
baseWall('base_left', LEFT.surface, LEFT.n, LEFT.wDir, LEFT.hDir, LEFT.w, LEFT.h, USBC.map((u) => u.hole), '§2 底座左壁（x=−0.1520，全高 0.0109；2×USB-C 开孔）')
// 右壁（x=+0.1520）：耳机孔开口
const RIGHT = { batch: 'base', color: C.body, lid: false, thick: TH, surface: [HX, 0.00605, 0], n: [1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0], w: D, h: 0.0109 }
const JACK = { z: -0.0700, y: 0.0060, s: 0.0035 }
const jackHole = wallLocal(RIGHT, JACK.y - JACK.s / 2, JACK.y + JACK.s / 2, JACK.z - JACK.s / 2, JACK.z + JACK.s / 2)
baseWall('base_right', RIGHT.surface, RIGHT.n, RIGHT.wDir, RIGHT.hDir, RIGHT.w, RIGHT.h, [jackHole], '§2 底座右壁（x=+0.1520，全高 0.0109；耳机孔开孔）')
// 前/后壁
baseWall('base_front', [0, (yBottom(HZ) + TOP_Y) / 2, HZ], [0, 0, 1], [1, 0, 0], [0, 1, 0], W, TOP_Y - yBottom(HZ), null, '§2 底座前壁（z=+0.1060，高 0.0064）')
baseWall('base_back', [0, (yBottom(-HZ) + TOP_Y) / 2, -HZ], [0, 0, -1], [1, 0, 0], [0, 1, 0], W, TOP_Y - yBottom(-HZ), null, '§2 底座后壁（z=−0.1060，高 0.0109）')

// —— 顶面 7 张框条 ——
const strip = (id, cx, cz, wx, wz, ref) => {
  const q = quad({ id, name: id, batch: 'base', color: C.body, surface: [cx, TOP_Y, cz], n: [0, 1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0], w: wz, h: wx, ref })
  return q
}
strip('top_front', 0, 0.1000, W, 0.0120, '§2 顶面框条① 前边距 0.3040×0.0120')
strip('top_tp_left', -0.1085, 0.0570, 0.0870, 0.0740, '§2 顶面框条② 触控板左 0.0870×0.0740')
strip('top_tp_right', 0.1085, 0.0570, 0.0870, 0.0740, '§2 顶面框条③ 触控板右 0.0870×0.0740')
strip('top_mid', 0, 0.0175, W, 0.0050, '§2 顶面框条④ 中隔 0.3040×0.0050')
strip('top_kb_left', -0.1450, -0.0395, 0.0140, 0.1090, '§2 顶面框条⑤ 键盘井左 0.0140×0.1090')
strip('top_kb_right', 0.1450, -0.0395, 0.0140, 0.1090, '§2 顶面框条⑥ 键盘井右 0.0140×0.1090')
strip('top_back', 0, -0.1000, W, 0.0120, '§2 顶面框条⑦ 后边距 0.3040×0.0120')

// —— D3 四角 4 段折线 ——
for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
  cornerFacets(sx, sz, 'base', C.body, `§2 圆角 四角 R 0.0100（D3：每角 4 段折线，弦高误差 1.92e-4）`)
}

// ============================================================
// 键盘：井底 + 4 壁 + 79 键帽（每键 5 件：顶面 + 4 斜壁）
// ============================================================
const WELL = { x0: -0.1380, x1: 0.1380, z0: -0.0940, z1: 0.0150, floor: 0.0095 }
quad({ id: 'well_floor', name: 'well_floor', batch: 'keyboard', color: C.well, surface: [0, WELL.floor, (WELL.z0 + WELL.z1) / 2], n: [0, 1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0], w: WELL.z1 - WELL.z0, h: WELL.x1 - WELL.x0, ref: '§2 键盘井 井底（y=0.0095）' })
quad({ id: 'well_front', name: 'well_front', batch: 'keyboard', color: C.well, surface: [0, (WELL.floor + TOP_Y) / 2, WELL.z1], n: [0, 0, -1], wDir: [1, 0, 0], hDir: [0, 1, 0], w: WELL.x1 - WELL.x0, h: TOP_Y - WELL.floor, ref: '§2 键盘井 前侧壁（法线朝井内）' })
quad({ id: 'well_back', name: 'well_back', batch: 'keyboard', color: C.well, surface: [0, (WELL.floor + TOP_Y) / 2, WELL.z0], n: [0, 0, 1], wDir: [1, 0, 0], hDir: [0, 1, 0], w: WELL.x1 - WELL.x0, h: TOP_Y - WELL.floor, ref: '§2 键盘井 后侧壁（法线朝井内）' })
quad({ id: 'well_left', name: 'well_left', batch: 'keyboard', color: C.well, surface: [WELL.x0, (WELL.floor + TOP_Y) / 2, (WELL.z0 + WELL.z1) / 2], n: [1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0], w: WELL.z1 - WELL.z0, h: TOP_Y - WELL.floor, ref: '§2 键盘井 左侧壁（法线朝井内）' })
quad({ id: 'well_right', name: 'well_right', batch: 'keyboard', color: C.well, surface: [WELL.x1, (WELL.floor + TOP_Y) / 2, (WELL.z0 + WELL.z1) / 2], n: [-1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0], w: WELL.z1 - WELL.z0, h: TOP_Y - WELL.floor, ref: '§2 键盘井 右侧壁（法线朝井内）' })

const COL = 0.0190, ROW = 0.0180
const colX = (i) => -0.1235 + i * COL
const rowZ = (j) => -0.0845 + j * ROW
const KEY_ROWS = [
  { xs: Array.from({ length: 14 }, (_, i) => colX(i)) },
  { xs: Array.from({ length: 14 }, (_, i) => colX(i)) },
  { xs: Array.from({ length: 14 }, (_, i) => colX(i)) },
  { xs: Array.from({ length: 13 }, (_, i) => -0.1140 + i * COL) },
  { xs: Array.from({ length: 13 }, (_, i) => -0.1140 + i * COL) },
  { xs: Array.from({ length: 10 }, (_, i) => -0.1265 + i * COL), spaceX: 0.0950, spaceW: 0.0780 },
]
let keyCount = 0
KEY_ROWS.forEach((row, j) => {
  const z = rowZ(j)
  row.xs.forEach((x, i) => {
    keyCount++
    bevelKey(`key_r${j}c${i}`, x, z, CAP_TOP, CAP_TOP, `§2/D2 键帽 第${j + 1}行第${i + 1}键`)
  })
  if (row.spaceX !== undefined) {
    keyCount++
    bevelKey(`key_r${j}_space`, row.spaceX, z, row.spaceW, CAP_TOP, '§2/D2 键帽 空格 0.0780×0.0150（占 4 槽）')
  }
})

// ============================================================
// D8 触控板：凹陷 0.0008 + 四侧壁（#ADB3BC 色差）
// ============================================================
const TP = { cx: 0, cz: 0.0570, wx: 0.1300, wz: 0.0740, th: 0.0006, recess: 0.0008 }
quad({ id: 'tp_face', name: 'tp_face', batch: 'trackpad', color: C.tp, surface: [TP.cx, TOP_Y - TP.recess, TP.cz], n: [0, 1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0], w: TP.wz, h: TP.wx, thick: TP.th, ref: '§2/D8 触控板 0.1300×0.0740（凹陷 0.0008，面 #B9BEC6）' })
const tpWallH = TP.recess
const tpWallY = TOP_Y - tpWallH / 2
// 前/后壁沿 x 分 2 段（RDP 余量 2.46）
for (const [sz, n] of [[1, [0, 0, -1]], [-1, [0, 0, 1]]]) {
  for (let k = 0; k < 2; k++) {
    quad({ id: `tp_${sz > 0 ? 'front' : 'back'}_${k}`, batch: 'trackpad', color: C.tpWall, surface: [TP.cx + (k === 0 ? -0.0325 : 0.0325), tpWallY, TP.cz + sz * TP.wz / 2], n, wDir: [1, 0, 0], hDir: [0, 1, 0], w: TP.wx / 2, h: tpWallH, ref: `§2/D8 触控板 ${sz > 0 ? '前' : '后'}侧壁（凹陷边框，h 0.0008）` })
  }
}
quad({ id: 'tp_left', batch: 'trackpad', color: C.tpWall, surface: [TP.cx - TP.wx / 2, tpWallY, TP.cz], n: [1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0], w: TP.wz, h: tpWallH, ref: '§2/D8 触控板 左侧壁（凹陷边框）' })
quad({ id: 'tp_right', batch: 'trackpad', color: C.tpWall, surface: [TP.cx + TP.wx / 2, tpWallY, TP.cz], n: [-1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0], w: TP.wz, h: tpWallH, ref: '§2/D8 触控板 右侧壁（凹陷边框）' })

// ============================================================
// 上盖：内/外面 + D3 圆角边缘管（poly 段，消掉 gms.props 兜底）
// ============================================================
quad({ id: 'lid_inner', name: 'lid_inner', lid: true, batch: 'lid', color: C.body, surface: [0, TOP_Y, 0], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: W, h: D, ref: '§2 上盖 内面（闭态 y=0.0115，屏幕面）' })
quad({ id: 'lid_outer', name: 'lid_outer', lid: true, batch: 'lid', color: C.body, surface: [0, TOP_Y + LID_TH, 0], n: [0, 1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: W, h: D, ref: '§2 上盖 外面（闭态 y=0.0155）' })
// 边缘管：路径 = 轮廓内缩 0.0020（半径）→ 外表面恰为 R 0.0100 圆角轮廓；4 直边 + 4 角 × 5 段
{
  const rTube = LID_TH / 2, Rp = R_CHAM - rTube
  const yTube = TOP_Y + LID_TH / 2
  const ax = HX - rTube, az = HZ - rTube
  const cxArc = HX - R_CHAM, czArc = HZ - R_CHAM
  const seg = []
  const pushSeg = (x0, z0, x1, z1, ref) => seg.push({ p0: [x0, yTube, z0], p1: [x1, yTube, z1], ref })
  const arcPts = (sx, sz, k, N) => {
    const a0 = { '1,1': 0, '1,-1': -90, '-1,1': 90, '-1,-1': 180 }[`${sx},${sz}`] + k * 90 / N
    const a = a0 * Math.PI / 180
    return [sx * cxArc + Rp * Math.cos(a), sz * czArc + Rp * Math.sin(a)]
  }
  // 右直边
  pushSeg(ax, -az, ax, az, '上盖 右侧缘（管）')
  // 角（+,+）0→90
  for (let k = 0; k < 5; k++) { const A = arcPts(1, 1, k, 5), B = arcPts(1, 1, k + 1, 5); pushSeg(A[0], A[1], B[0], B[1], `上盖 圆角 +++（管第 ${k + 1}/5 段）`) }
  // 前直边
  pushSeg(cxArc, az, -cxArc, az, '上盖 前缘（管）')
  // 角（−,+）90→180
  for (let k = 0; k < 5; k++) { const A = arcPts(-1, 1, k, 5), B = arcPts(-1, 1, k + 1, 5); pushSeg(A[0], A[1], B[0], B[1], `上盖 圆角 −++（管第 ${k + 1}/5 段）`) }
  // 左直边
  pushSeg(-ax, az, -ax, -az, '上盖 左侧缘（管）')
  // 角（−,−）180→270
  for (let k = 0; k < 5; k++) { const A = arcPts(-1, -1, k, 5), B = arcPts(-1, -1, k + 1, 5); pushSeg(A[0], A[1], B[0], B[1], `上盖 圆角 −−−（管第 ${k + 1}/5 段）`) }
  // 后直边
  pushSeg(-cxArc, -az, cxArc, -az, '上盖 后缘（管）')
  // 角（+,−）270→360
  for (let k = 0; k < 5; k++) { const A = arcPts(1, -1, k, 5), B = arcPts(1, -1, k + 1, 5); pushSeg(A[0], A[1], B[0], B[1], `上盖 圆角 +−−（管第 ${k + 1}/5 段）`) }
  seg.forEach((s, i) => tube2({ id: `lid_rim_${i}`, batch: 'lid', color: C.body, p0: s.p0, p1: s.p1, size: LID_TH, lid: true, ref: `${s.ref}（R 0.0100 圆角，弦高误差 9.8e-5）` }))
}

// ============================================================
// 屏幕（D1 12 行渐变）+ D9 摄像头孔圈 + D10 logo 分层
// ============================================================
const SC = { wx: 0.2920, wz: 0.1825, bezelLR: 0.0060, bezelTop: 0.0060, bezelBottom: 0.0120, th: 0.0003, rows: 12 }
// 屏上边 = 闭态 +z（开合 100° 后位于顶部）→ 上黑边 0.0060 在 +z、下巴 0.0120 在 −z
const scZ0 = -(SC.wz + SC.bezelTop + SC.bezelBottom) / 2 + SC.bezelBottom   // 可视区 −z 端（下）
const scZ1 = scZ0 + SC.wz                                                    // 可视区 +z 端（上）
const decal = (o) => quad({ lid: true, batch: 'screen', thick: SC.th, ...o })
decal({ id: 'screen_backplate', name: 'screen_backplate', color: C.bezel, surface: [0, TOP_Y - SC.th, 0], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: W, h: D, ref: '§2 屏幕 背板 1（上盖内面底衬）' })
decal({ id: 'bezel_top', name: 'bezel_top', color: C.bezel, surface: [0, TOP_Y - SC.th * 2, scZ1 + SC.bezelTop / 2], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: W, h: SC.bezelTop, ref: '§2 屏幕 黑边 上 0.0060（开合后在屏顶）' })
decal({ id: 'bezel_bottom', name: 'bezel_bottom', color: C.bezel, surface: [0, TOP_Y - SC.th * 2, scZ0 - SC.bezelBottom / 2], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: W, h: SC.bezelBottom, ref: '§2 屏幕 黑边 下 0.0120（开合后在屏底=下巴）' })
decal({ id: 'bezel_left', name: 'bezel_left', color: C.bezel, surface: [-(SC.wx / 2 + SC.bezelLR / 2), TOP_Y - SC.th * 2, (scZ0 + scZ1) / 2], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: SC.bezelLR, h: SC.wz, ref: '§2 屏幕 黑边 左 0.0060' })
decal({ id: 'bezel_right', name: 'bezel_right', color: C.bezel, surface: [SC.wx / 2 + SC.bezelLR / 2, TOP_Y - SC.th * 2, (scZ0 + scZ1) / 2], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: SC.bezelLR, h: SC.wz, ref: '§2 屏幕 黑边 右 0.0060' })
// D1 渐变：12 行，自下（−z，#0E1B2A）向上（+z，#1B3A5C）逐行线性插值
const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const rgb2hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()
const GRAD0 = hex2rgb('#0E1B2A'), GRAD1 = hex2rgb('#1B3A5C')
for (let k = 0; k < SC.rows; k++) {
  const t = SC.rows === 1 ? 0 : k / (SC.rows - 1)
  const col = rgb2hex([0, 1, 2].map((i) => GRAD0[i] + (GRAD1[i] - GRAD0[i]) * t))
  const zc = scZ0 + SC.wz * (k + 0.5) / SC.rows
  decal({ id: `screen_glow_${k}`, batch: 'screen', color: col, surface: [0, TOP_Y - SC.th * 3, zc], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: SC.wx, h: SC.wz / SC.rows, ref: `§2/D1 屏幕发光 第 ${k + 1}/${SC.rows} 行（${col}，越靠上越亮）` })
}
// D9 摄像头：方形孔圈（外框 4 条 + 内芯）+ 状态点（屏上边中点）
const CAM = { z: scZ1 + SC.bezelTop / 2, yRing: TOP_Y - SC.th * 3, yCore: TOP_Y - SC.th * 4, outer: 0.0036, inner: 0.0020, ring: 0.0008 }
{
  const half = CAM.outer / 2, wIn = CAM.inner / 2
  decal({ id: 'cam_ring_top', batch: 'screen', color: C.port, surface: [0, CAM.yRing, CAM.z + half - CAM.ring / 2], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: CAM.outer, h: CAM.ring, ref: 'D9 摄像头 孔圈 上条' })
  decal({ id: 'cam_ring_bottom', batch: 'screen', color: C.port, surface: [0, CAM.yRing, CAM.z - half + CAM.ring / 2], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: CAM.outer, h: CAM.ring, ref: 'D9 摄像头 孔圈 下条' })
  decal({ id: 'cam_ring_left', batch: 'screen', color: C.port, surface: [-(wIn + CAM.ring / 2), CAM.yRing, CAM.z], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: CAM.ring, h: CAM.inner, ref: 'D9 摄像头 孔圈 左条' })
  decal({ id: 'cam_ring_right', batch: 'screen', color: C.port, surface: [wIn + CAM.ring / 2, CAM.yRing, CAM.z], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: CAM.ring, h: CAM.inner, ref: 'D9 摄像头 孔圈 右条' })
  decal({ id: 'cam_core', batch: 'screen', color: '#0A0A0C', surface: [0, CAM.yCore, CAM.z], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: CAM.inner, h: CAM.inner, ref: 'D9 摄像头 内芯（镜头，凹陷 0.0003）' })
  decal({ id: 'cam_status', batch: 'screen', color: C.logo, surface: [0.0035, CAM.yRing, CAM.z], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: 0.0005, h: 0.0005, ref: 'D9 摄像头 状态点 0.0005²' })
}
// D10 logo 分层（上盖背面中心）
quad({ id: 'logo_backing', lid: true, batch: 'screen', color: C.tp, surface: [0, TOP_Y + LID_TH + SC.th, 0], n: [0, 1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: 0.0160, h: 0.0160, thick: SC.th, ref: '§2/D10 logo 底衬 0.0160²（#B9BEC6）' })
quad({ id: 'logo_face', lid: true, batch: 'screen', color: C.logo, surface: [0, TOP_Y + LID_TH + SC.th * 2, 0], n: [0, 1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: 0.0120, h: 0.0120, thick: SC.th, ref: '§2/D10 logo 面层 0.0120²（#E8EAED，凸起 0.0003）' })

// ============================================================
// D4 接口内腔：2×USB-C（底板 + 3 壁 + 舌片）/ 耳机孔（底板 + 4 壁 + 内圈 + 芯）
// ============================================================
const PORT_D = 0.0035, PORT_TH = 0.0003
USBC.forEach((u, i) => {
  const tag = `usbc${i + 1}`
  const yc = 0.0060, wy = 0.0025, wz = 0.0085
  quad({ id: `${tag}_back`, name: `${tag}_back`, batch: 'ports', color: C.port, surface: [-HX + PORT_D, yc, u.z], n: [-1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0], w: wz, h: wy, thick: PORT_TH, ref: `D4 USB-C#${i + 1} 内腔底板（深 0.0035）` })
  quad({ id: `${tag}_top`, batch: 'ports', color: C.port, surface: [-HX + PORT_D / 2, yc + wy / 2, u.z], n: [0, -1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0], w: wz, h: PORT_D, thick: PORT_TH, ref: `D4 USB-C#${i + 1} 内腔顶壁` })
  quad({ id: `${tag}_bottom`, batch: 'ports', color: C.port, surface: [-HX + PORT_D / 2, yc - wy / 2, u.z], n: [0, 1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0], w: wz, h: PORT_D, thick: PORT_TH, ref: `D4 USB-C#${i + 1} 内腔底壁` })
  quad({ id: `${tag}_za`, batch: 'ports', color: C.port, surface: [-HX + PORT_D / 2, yc, u.z - wz / 2], n: [0, 0, 1], wDir: [1, 0, 0], hDir: [0, 1, 0], w: PORT_D, h: wy, thick: PORT_TH, ref: `D4 USB-C#${i + 1} 内腔侧壁 A` })
  quad({ id: `${tag}_zb`, batch: 'ports', color: C.port, surface: [-HX + PORT_D / 2, yc, u.z + wz / 2], n: [0, 0, -1], wDir: [1, 0, 0], hDir: [0, 1, 0], w: PORT_D, h: wy, thick: PORT_TH, ref: `D4 USB-C#${i + 1} 内腔侧壁 B` })
  quad({ id: `${tag}_tongue`, batch: 'ports', color: C.ring, surface: [-HX + PORT_D - 0.0027 / 2 - 0.00015, yc, u.z], n: [0, 1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0], w: 0.0060, h: 0.0027, thick: PORT_TH, ref: `D4 USB-C#${i + 1} 舌片 0.0060×0.0027` })
})
{
  const yc = JACK.y, s = JACK.s, d = 0.0040
  quad({ id: 'jack_back', name: 'jack_back', batch: 'ports', color: C.port, surface: [HX - d, yc, JACK.z], n: [1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0], w: s, h: s, thick: PORT_TH, ref: 'D4 耳机孔 内腔底板（深 0.0040）' })
  quad({ id: 'jack_top', batch: 'ports', color: C.port, surface: [HX - d / 2, yc + s / 2, JACK.z], n: [0, -1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0], w: s, h: d, thick: PORT_TH, ref: 'D4 耳机孔 内腔顶壁' })
  quad({ id: 'jack_bottom', batch: 'ports', color: C.port, surface: [HX - d / 2, yc - s / 2, JACK.z], n: [0, 1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0], w: s, h: d, thick: PORT_TH, ref: 'D4 耳机孔 内腔底壁' })
  quad({ id: 'jack_za', batch: 'ports', color: C.port, surface: [HX - d / 2, yc, JACK.z - s / 2], n: [0, 0, 1], wDir: [1, 0, 0], hDir: [0, 1, 0], w: d, h: s, thick: PORT_TH, ref: 'D4 耳机孔 内腔侧壁 A' })
  quad({ id: 'jack_zb', batch: 'ports', color: C.port, surface: [HX - d / 2, yc, JACK.z + s / 2], n: [0, 0, -1], wDir: [1, 0, 0], hDir: [0, 1, 0], w: d, h: s, thick: PORT_TH, ref: 'D4 耳机孔 内腔侧壁 B' })
  // D4 耳机孔内圈：方形轮廓无法表达圆孔 → 用 disc（axis='side'，圆柱轴沿 x）做「金属圈 + 暗孔」两层，
  // 独立视觉复核（gpt-5.6-sol）指出方孔不属于耳机孔形态，故改用引擎原生圆形件（10009008，逐件理由见 s4-verify.json）。
  push({ kind: 'disc', batch: 'ports', id: 'jack_ring', color: C.ring,
    spec: { x: HX - d + 0.0003, y: yc, z: JACK.z, r: 0.0017, thick: 0.0003, axis: 'side' },
    ref: 'D4 耳机孔 金属内圈 Ø0.0034（disc axis=side，圆孔外形；方形开口 0.0035 被圆盘遮住四角）' })
  push({ kind: 'disc', batch: 'ports', id: 'jack_core', color: '#0A0A0C',
    spec: { x: HX - d + 0.0006, y: yc, z: JACK.z, r: 0.0011, thick: 0.0003, axis: 'side' },
    ref: 'D4 耳机孔 暗孔芯 Ø0.0022（disc axis=side，位于金属圈之前 → 读作圆孔）' })
}

// ============================================================
// D5 散热格栅：开孔 + 暗底衬 + 4 叶片（0.0005×0.0003，间距 0.00025，沿 x 分 2 段满足 RDP）
// ============================================================
GR.xc.forEach((xc, k) => {
  const tag = `grille${k + 1}`
  const zc = GR.zc
  botQuad({ id: `${tag}_back`, name: `${tag}_back`, batch: 'grille', color: C.well, x: xc, z: zc, wx: GR.wx + 0.0040, wz: GR.wz + 0.0050, depth: GR.backDepth, thick: GR.bladeThick, ref: `D5 散热格栅#${k + 1} 暗底衬（下沉 0.0012）` })
  const pitch = GR.bladeW + GR.bladeGap
  const z0 = zc - ((GR.blades - 1) * pitch + GR.bladeW) / 2
  for (let b = 0; b < GR.blades; b++) {
    const zb = z0 + b * pitch + GR.bladeW / 2
    for (let seg = 0; seg < 2; seg++) {
      const xSeg = xc - GR.wx / 2 + GR.wx * (seg + 0.5) / 2
      botQuad({ id: `${tag}_blade${b}_${seg}`, name: seg === 0 && b === 0 ? `${tag}_blade0` : undefined, batch: 'grille', color: C.body, x: xSeg, z: zb, wx: GR.wx / 2, wz: GR.bladeW, depth: GR.bladeDepth, thick: GR.bladeThick, ref: `D5 散热格栅#${k + 1} 叶片${b + 1} 第 ${seg + 1}/2 段（0.0005×0.0003，间距 0.00025）` })
    }
  }
})

// ============================================================
// D7 底面：铭牌位 + 序列号槽 + 扬声器孔阵列（8 孔）底衬
// ============================================================
botQuad({ id: 'nameplate', name: 'nameplate', batch: 'bottom', color: C.tp, x: NP.x, z: NP.z, wx: NP.wx + 0.0080, wz: NP.wz + 0.0080, depth: 0.0012, thick: GR.bladeThick, ref: 'D7 铭牌位（0.0600×0.0090 开孔，底衬 #B9BEC6 下沉 0.0012）' })
botQuad({ id: 'serial_slot', name: 'serial_slot', batch: 'bottom', color: C.port, x: SN.x, z: SN.z, wx: SN.wx + 0.0060, wz: SN.wz + 0.0060, depth: 0.0012, thick: GR.bladeThick, ref: 'D7 序列号槽（0.0400×0.0022 开孔，暗底衬下沉 0.0012）' })
SPK.xc.forEach((xc, k) => {
  botQuad({ id: `speaker_back_${k}`, name: `speaker_back_${k}`, batch: 'bottom', color: C.well, x: xc, z: SPK.z, wx: 4 * SPK.pitch + 0.0050, wz: SPK.slotD + 0.0050, depth: 0.0012, thick: GR.bladeThick, ref: `D7 扬声器孔阵列 ${k + 1}/2（4 孔 0.0016×0.0070，暗底衬下沉 0.0012）` })
})

// ============================================================
// D6 转轴：沿 x 分 6 段（间隙 0.0008）+ 铰链盖（与机身留 0.0004 缝隙）
// ============================================================
{
  const segN = 6, gap = 0.0008
  const segL = (W - (segN - 1) * gap) / segN
  for (let k = 0; k < segN; k++) {
    const x0 = -HX + k * (segL + gap), x1 = x0 + segL
    rodX({ id: `hinge_rod_${k}`, name: `hinge_rod_${k}`, batch: 'hinge', color: C.hinge, x1: x0, y1: PIVOT.y, x2: x1, y2: PIVOT.y, z: PIVOT.z, size: 0.0040, ref: `D6 转轴 第 ${k + 1}/${segN} 段（rod size 0.0040，段间 0.0008）` })
  }
  for (const [sx, tag] of [[-1, 'left'], [1, 'right']]) {
    const cx = sx * 0.1270
    quad({ id: `hinge_cover_${tag}`, name: `hinge_cover_${tag}`, batch: 'hinge', color: C.hinge, surface: [cx, 0.0121, -0.1000], n: [0, 1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0], w: 0.0080, h: 0.0500, thick: PORT_TH, ref: `D6 铰链盖 ${tag} 顶面（离机身 0.0004 缝）` })
    quad({ id: `hinge_cover_${tag}_f`, batch: 'hinge', color: C.hinge, surface: [cx, 0.0120, -0.0950], n: norm([0, 0.0020, 0.0002]), wDir: [1, 0, 0], hDir: norm([0, -0.0002, 0.0020]), w: 0.0500, h: Math.hypot(0.0002, 0.0020), thick: PORT_TH, ref: `D6 铰链盖 ${tag} 前斜面` })
    quad({ id: `hinge_cover_${tag}_b`, batch: 'hinge', color: C.hinge, surface: [cx, 0.0120, -0.1050], n: norm([0, 0.0020, -0.0002]), wDir: [1, 0, 0], hDir: norm([0, -0.0002, -0.0020]), w: 0.0500, h: Math.hypot(0.0002, 0.0020), thick: PORT_TH, ref: `D6 铰链盖 ${tag} 后斜面` })
  }
}

// ============================================================
// 脚垫 4（disc）
// ============================================================
for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
  const x = sx * (HX - 0.0200), z = sz * (HZ - 0.0200)
  const id = `foot_${sx > 0 ? 'p' : 'n'}${sz > 0 ? 'p' : 'n'}`
  push({ kind: 'disc', batch: 'feet', id, name: id, color: C.body,
    spec: { x, y: yBottom(z) - 0.0003, z, r: 0.0040, thick: 0.0006, axis: 'up' },
    ref: '§2 脚垫 4×Ø0.0080×0.0006（disc，中心 y = y_bottom(z) − 0.0003）' })
}

// ---------- 门禁候选命名集合（最终注册集合由引擎接触模型自动裁剪，见下方 resolveGateNames） ----------
const CANDIDATE_NAMES = new Set([
  'base_bottom', 'base_left', 'base_right', 'base_back', 'base_front',
  'top_front', 'top_tp_left', 'top_tp_right', 'top_mid', 'top_kb_left', 'top_kb_right', 'top_back',
  'cham_base_pn', 'cham_base_nn', 'cham_base_pp', 'cham_base_np',
  'well_floor', 'well_front', 'well_back', 'well_left', 'well_right', 'tp_face',
  'lid_inner', 'lid_outer', 'screen_backplate', 'bezel_top', 'bezel_bottom',
  'usbc1_back', 'usbc2_back', 'jack_back',
  'grille1_back', 'grille2_back', 'grille1_blade0', 'grille2_blade0',
  'nameplate', 'serial_slot', 'speaker_back_0', 'speaker_back_1',
  'hinge_rod_0', 'hinge_rod_1', 'hinge_rod_2', 'hinge_rod_3', 'hinge_rod_4', 'hinge_rod_5',
  'hinge_cover_left', 'hinge_cover_right',
  'foot_pp', 'foot_pn', 'foot_np', 'foot_nn',
])

// ---------- 引擎侧旋转推导（与 web/index.html part('quad') 一致） ----------
const DEG = 180 / Math.PI
function rotFromNormal(n) {
  const ny = Math.max(-1, Math.min(1, n[1]))
  const phi = Math.atan2(n[2], n[0]) * DEG
  const delta = -Math.asin(ny) * DEG
  return [90 + delta, 90 - phi, 0]
}
function eulerToMat(r) {
  const a = r[0] / DEG, b = r[1] / DEG, c = r[2] / DEG
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
function basisToEuler(X, Y, Z) {
  const M = [[X[0], Y[0], Z[0]], [X[1], Y[1], Z[1]], [X[2], Y[2], Z[2]]]
  const alpha = Math.asin(-M[1][2]) * DEG
  const beta = Math.atan2(M[0][2], M[2][2]) * DEG
  const gamma = Math.atan2(M[1][0], M[1][1]) * DEG
  return [round(alpha, 6), round(beta, 6), round(gamma, 6)]
}
const parallel = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) > 0.9995

const resolved = []
const rdpTable = []
for (const p of parts) {
  if (p.kind === 'quad') {
    let surf = p.surface, n = norm(p.n), wDir = norm(p.wDir), hDir = norm(p.hDir)
    if (p.lid) { surf = rotPt(surf); n = rotVec(n); wDir = rotVec(wDir); hDir = rotVec(hDir) }
    const th = p.thick
    const center = [surf[0] - n[0] * th / 2, surf[1] - n[1] * th / 2, surf[2] - n[2] * th / 2]
    const pageRot = rotFromNormal(n)
    const M = eulerToMat(pageRot)
    const pageW = apply(M, [1, 0, 0]), pageH = apply(M, [0, 0, 1])
    const aligned = parallel(pageW, wDir) && parallel(pageH, hDir)
    const rotation = aligned ? pageRot : basisToEuler(wDir, n, hDir)
    const margin = rdpMargin(p.w, p.h)
    rdpTable.push({ id: p.id, batch: p.batch, w: round(p.w, 8), h: round(p.h, 8), aspect: round(Math.min(p.w, p.h) / Math.max(p.w, p.h), 6), limit: round(rdpLimit(p.w, p.h), 8), margin: round(margin, 4) })
    resolved.push({ ...p, center: center.map((v) => round(v, 8)), normal: n.map((v) => round(v, 8)), rotation: rotation.map((v) => round(v, 6)), needProps: !aligned, margin: round(margin, 4) })
  } else if (p.kind === 'rod') {
    resolved.push({ ...p })
  } else if (p.kind === 'poly2') {
    let p0 = p.p0, p1 = p.p1
    if (p.lid) { p0 = rotPt(p0); p1 = rotPt(p1) }
    resolved.push({ ...p, p0: p0.map((v) => round(v, 8)), p1: p1.map((v) => round(v, 8)) })
  } else if (p.kind === 'disc') {
    resolved.push({ ...p })
  }
}

// ---------- 门禁命名裁剪：只用引擎接触模型（AABB/线段）能连到地面的候选名 ----------
// 依据 web/index.html:3144-3168 gmsFloating：ground = 注册盒 minY ≤ 0.001；isSupportedBy(x,y) 需
// gap ≤ 0.001 且 y 的接触点不高于 x 的接触点 0.02 且 x/z 投影重叠；无地面链 = floating。
// 平面件注册盒 half=[w/2,h/2,thick/2]（忽略 normal）→ 部分候选名（如侧壁条/上盖/屏面）在引擎模型里
// 无法连通，注册它们只会制造假 floating；这些件由 independent-check.mjs 的精确复算覆盖。
const engineWorld = (p) => {
  if (p.kind === 'quad') return { kind: 'box', c: [p.center[0], p.center[1], p.center[2]], half: [p.w / 2, p.h / 2, p.thick / 2] }
  if (p.kind === 'rod') return { kind: 'rod', a: [p.x1, p.y1, p.z], b: [p.x2, p.y2, p.z], rad: p.size / 2 }
  if (p.kind === 'disc') return { kind: 'cyl', c: [p.spec.x, p.spec.y, p.spec.z], dir: [0, 1, 0], rad: p.spec.r, half: p.spec.thick / 2 }
  return null
}
const wbbox = (w) => {
  if (w.kind === 'rod') { const xs = [w.a[0], w.b[0]], ys = [w.a[1], w.b[1]], zs = [w.a[2], w.b[2]]
    return { minX: Math.min(...xs) - w.rad, maxX: Math.max(...xs) + w.rad, minY: Math.min(...ys) - w.rad, maxY: Math.max(...ys) + w.rad, minZ: Math.min(...zs) - w.rad, maxZ: Math.max(...zs) + w.rad } }
  if (w.kind === 'cyl') { const [cx, cy, cz] = w.c, [dx, dy, dz] = w.dir
    const hx = Math.abs(dx) * w.half + w.rad, hy = Math.abs(dy) * w.half + w.rad, hz = Math.abs(dz) * w.half + w.rad
    return { minX: cx - hx, maxX: cx + hx, minY: cy - hy, maxY: cy + hy, minZ: cz - hz, maxZ: cz + hz } }
  return { minX: w.c[0] - w.half[0], maxX: w.c[0] + w.half[0], minY: w.c[1] - w.half[1], maxY: w.c[1] + w.half[1], minZ: w.c[2] - w.half[2], maxZ: w.c[2] + w.half[2] }
}
const boxGap = (b1, b2) => Math.hypot(
  Math.max(0, Math.max(b1.minX - b2.maxX, b2.minX - b1.maxX)),
  Math.max(0, Math.max(b1.minY - b2.maxY, b2.minY - b1.maxY)),
  Math.max(0, Math.max(b1.minZ - b2.maxZ, b2.minZ - b1.maxZ)))
const segSeg = (p, p2, q, q2) => {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const d1 = sub(p2, p), d2 = sub(q2, q), r = sub(p, q)
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r)
  let s, t
  const EPS = 1e-12
  if (a <= EPS && e <= EPS) return { d: Math.hypot(...r), P: p, Q: q }
  if (a <= EPS) { s = 0; t = Math.max(0, Math.min(1, f / e)) }
  else { const c = dot(d1, r)
    if (e <= EPS) { t = 0; s = Math.max(0, Math.min(1, -c / a)) }
    else { const b = dot(d1, d2), den = a * e - b * b
      s = den > EPS ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0
      t = (b * s + f) / e
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)) }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)) } } }
  const P = [p[0] + d1[0] * s, p[1] + d1[1] * s, p[2] + d1[2] * s]
  const Q = [q[0] + d2[0] * t, q[1] + d2[1] * t, q[2] + d2[2] * t]
  return { d: Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]), P, Q }
}
const engineGap = (A, B) => {
  const seg = (w) => w.kind === 'rod' ? [w.a, w.b] : (w.kind === 'cyl' ? [w.c.map((v, i) => v - w.dir[i] * w.half), w.c.map((v, i) => v + w.dir[i] * w.half)] : null)
  const s1 = seg(A), s2 = seg(B)
  if (s1 && s2) { const r = segSeg(s1[0], s1[1], s2[0], s2[1]); return { gap: r.d - A.rad - B.rad, pa: r.P, pb: r.Q } }
  const b1 = wbbox(A), b2 = wbbox(B)
  const c1 = [(b1.minX + b1.maxX) / 2, (b1.minY + b1.maxY) / 2, (b1.minZ + b1.maxZ) / 2]
  const c2 = [(b2.minX + b2.maxX) / 2, (b2.minY + b2.maxY) / 2, (b2.minZ + b2.maxZ) / 2]
  return { gap: boxGap(b1, b2), pa: c1, pb: c2 }
}
const cand = resolved.filter((p) => p.name && CANDIDATE_NAMES.has(p.name))
const candWorlds = {}
for (const p of cand) candWorlds[p.name] = engineWorld(p)
const candNames = Object.keys(candWorlds)
const cground = candNames.filter((n) => wbbox(candWorlds[n]).minY <= 0.001)
const isSupportedBy = (x, y) => {
  const g = engineGap(candWorlds[x], candWorlds[y])
  if (g.gap > 0.001) return false
  if (g.pb[1] > g.pa[1] + 0.02) return false
  const bx = wbbox(candWorlds[x]), by = wbbox(candWorlds[y])
  return bx.minX <= by.maxX && bx.maxX >= by.minX && bx.minZ <= by.maxZ && bx.maxZ >= by.minZ
}
const reachable = (start) => {
  const seen = new Set([start]), q = [start]
  while (q.length) {
    const x = q.shift()
    for (const y of candNames) {
      if (seen.has(y)) continue
      if (!isSupportedBy(x, y)) continue
      if (cground.includes(y)) return true
      seen.add(y); q.push(y)
    }
  }
  return false
}
const connected = candNames.filter((n) => cground.includes(n) || reachable(n))
const GATE_NAMES = new Set(connected)
const gateDropped = candNames.filter((n) => !GATE_NAMES.has(n))
console.log('[gate] candidates:', candNames.length, '| engine-ground:', cground.length, '| connected:', connected.length)
console.log('[gate] dropped (引擎模型连不到地面 → 由独立复算覆盖):', gateDropped.join(', ') || '(none)')

// ---------- 断言 ----------
const needProps = resolved.filter((p) => p.needProps)
const badRdp = rdpTable.filter((r) => r.margin <= RDP_MARGIN_MIN)
if (needProps.length) {
  console.error('PROPS NEEDED（roll 未实现，必须消掉）:', needProps.map((p) => p.id).join(', '))
  process.exit(1)
}
if (badRdp.length) {
  console.error('RDP MARGIN TOO SMALL (<= 1.15):', badRdp.map((r) => `${r.id}:${r.margin}`).join(', '))
  process.exit(1)
}

// ---------- 生成 part 脚本 ----------
const BATCH_ORDER = ['base', 'keyboard', 'trackpad', 'lid', 'screen', 'ports', 'grille', 'bottom', 'hinge', 'feet']
const BATCH_FILE = {
  base: 'laptop-v2-base.js', keyboard: 'laptop-v2-keyboard.js', trackpad: 'laptop-v2-trackpad.js',
  lid: 'laptop-v2-lid.js', screen: 'laptop-v2-screen.js', ports: 'laptop-v2-ports.js',
  grille: 'laptop-v2-grille.js', bottom: 'laptop-v2-bottom.js', hinge: 'laptop-v2-hinge.js', feet: 'laptop-v2-feet.js',
}
const HEADER = (batch, n) => `// ${BATCH_FILE[batch]} —— 笔记本 v2（细节升级版）part：${batch}（${n} 件）
// 自包含单文件（run-gms-parts.sh 直接在页面上下文执行；不依赖任何未注入的全局）。
// 规格来源：PROMPT-laptop-detail.md D1–D10 + PROMPT-laptop-model.md §2（坐标逐字沿用）。
// 引擎事实（本轮实测）：quad 的 w 沿局部 X、h 沿局部 Z、法线沿局部 Y；rotFromNormal(n)=[90+δ,90−φ,0]；
//   RDP 存活条件 min(w,h) > max(0.0002174, 0.005×hypot(w,h))（460px=1m）；poly 3D 折线端到端存活。
// window.__gmsNoClear=true 时不 clear（用于「全量装配 + 门禁复核」一次跑全部 part）。
;(function () {
  var G = window.gms
  if (!window.__gmsNoClear) G.clear()
  function q(s) { return G.part('quad', s) }
`
const FOOTER = `})()
`
mkdirSync(OUT_PARTS, { recursive: true })
// CDP Runtime.evaluate 单次表达式有长度上限（实测 76KB 的 keyboard 文件报
// "Separator is found, but chunk is longer than limit"）→ 每批按 ≤100 件切块成多个 part 文件。
const CHUNK = 100
const chunkFiles = {}
for (const batch of BATCH_ORDER) {
  const all = resolved.filter((p) => p.batch === batch)
  const nChunks = Math.max(1, Math.ceil(all.length / CHUNK))
  chunkFiles[batch] = []
  for (let ci = 0; ci < nChunks; ci++) {
  const list = all.slice(ci * CHUNK, (ci + 1) * CHUNK)
  const fname = nChunks === 1 ? BATCH_FILE[batch] : BATCH_FILE[batch].replace(/\.js$/, `-${ci + 1}.js`)
  chunkFiles[batch].push({ file: fname, count: list.length })
  let src = HEADER(batch, list.length)
  for (const p of list) {
    if (p.kind === 'quad') {
      const s = { x: p.center[0], y: p.center[1], z: p.center[2], w: round(p.w, 8), h: round(p.h, 8), thick: p.thick, normal: p.normal, color: p.color }
      if (p.name && GATE_NAMES.has(p.name)) s.name = p.name
      src += `  // ${p.ref}\n  q(${JSON.stringify(s)})\n`
      if (p.needProps) src += `  G.props(-1, { transform: { position: [0, 0, ${s.z}], rotation: ${JSON.stringify(p.rotation)} } })\n`
    } else if (p.kind === 'rod') {
      const s = { x1: round(p.x1, 8), y1: round(p.y1, 8), x2: round(p.x2, 8), y2: round(p.y2, 8), z: round(p.z, 8), size: p.size, color: p.color }
      if (p.name && GATE_NAMES.has(p.name)) s.name = p.name
      src += `  // ${p.ref}\n  G.part('rod', ${JSON.stringify(s)})\n`
    } else if (p.kind === 'poly2') {
      src += `  // ${p.ref}\n  G.part('poly', ${JSON.stringify({ points: [p.p0, p.p1], size: p.size, color: p.color })})\n`
    } else if (p.kind === 'disc') {
      src += `  // ${p.ref}\n  G.part('disc', ${JSON.stringify({ ...p.spec, color: p.color, ...(p.name && GATE_NAMES.has(p.name) ? { name: p.name } : {}) })})\n`
    }
  }
  src += FOOTER
  writeFileSync(join(OUT_PARTS, fname), src)
  }
}

// ---------- 门禁专用 part 脚本（只含 31 个引擎可连通命名件）----------
// 为什么单独出：gms.verify 只检查命名件；而 gms.import 走 uiStrokePartInfo 重建 spec 会失真
// （实测 2026-09-08：导入后所有件都被注册成默认 rod/0.03 盒），必须走 gms.part 注册路径。
{
  const list = resolved.filter((p) => p.name && GATE_NAMES.has(p.name))
  let src = HEADER('gate', list.length)
  for (const p of list) {
    if (p.kind === 'quad') {
      const s = { x: p.center[0], y: p.center[1], z: p.center[2], w: round(p.w, 8), h: round(p.h, 8), thick: p.thick, normal: p.normal, color: p.color, name: p.name }
      src += `  // ${p.ref}\n  q(${JSON.stringify(s)})\n`
    } else if (p.kind === 'rod') {
      src += `  // ${p.ref}\n  G.part('rod', ${JSON.stringify({ x1: round(p.x1, 8), y1: round(p.y1, 8), x2: round(p.x2, 8), y2: round(p.y2, 8), z: round(p.z, 8), size: p.size, color: p.color, name: p.name })})\n`
    } else if (p.kind === 'disc') {
      src += `  // ${p.ref}\n  G.part('disc', ${JSON.stringify({ ...p.spec, color: p.color, name: p.name })})\n`
    }
  }
  src += FOOTER
  writeFileSync(join(OUT_PARTS, 'laptop-v2-gate.js'), src)
}

// ---------- spec-v2 / points-v2 / rdp-table ----------
const ordered = BATCH_ORDER.flatMap((b) => resolved.filter((p) => p.batch === b))
const counts = {
  total: resolved.length,
  quads: resolved.filter((p) => p.kind === 'quad').length,
  rods: resolved.filter((p) => p.kind === 'rod').length,
  tubes: resolved.filter((p) => p.kind === 'poly2').length,
  discs: resolved.filter((p) => p.kind === 'disc').length,
  keycaps: keyCount,
  named: resolved.filter((p) => p.name && GATE_NAMES.has(p.name)).length,
}
const spec = {
  name: 'laptop-v2',
  generatedBy: 'exports/laptop-v2/gen-parts-v2.mjs',
  sourcePrompt: 'PROMPT-laptop-detail.md',
  openAngleDeg: OPEN_DEG, pivot: PIVOT,
  rdpRule: 'min(w,h) > max(0.0002174, 0.005*hypot(w,h))  [460px=1m, 实测]',
  counts,
  batches: BATCH_ORDER.map((b) => ({ batch: b, files: chunkFiles[b], count: resolved.filter((p) => p.batch === b).length })),
  parts: ordered.map((p) => {
    const reg = !!(p.name && GATE_NAMES.has(p.name))
    if (p.kind === 'quad') return { id: p.id, name: p.name || null, registered: reg, kind: 'quad', batch: p.batch, color: p.color, ref: p.ref, x: p.center[0], y: p.center[1], z: p.center[2], w: round(p.w, 8), h: round(p.h, 8), thick: p.thick, normal: p.normal, rotation: p.rotation, needProps: p.needProps, lid: !!p.lid, rdpMargin: p.margin }
    if (p.kind === 'rod') return { id: p.id, name: p.name || null, registered: reg, kind: 'rod', batch: p.batch, color: p.color, ref: p.ref, spec: { x1: round(p.x1, 8), y1: round(p.y1, 8), x2: round(p.x2, 8), y2: round(p.y2, 8), z: round(p.z, 8), size: p.size } }
    if (p.kind === 'poly2') return { id: p.id, name: p.name || null, registered: reg, kind: 'poly2', batch: p.batch, color: p.color, ref: p.ref, points: [p.p0, p.p1], size: p.size }
    return { id: p.id, name: p.name || null, registered: reg, kind: 'disc', batch: p.batch, color: p.color, ref: p.ref, spec: p.spec }
  }),
}
mkdirSync(OUT_EXP, { recursive: true })
writeFileSync(join(OUT_EXP, 'spec-v2.json'), JSON.stringify(spec, null, 2) + '\n')
writeFileSync(join(OUT_EXP, 'rdp-table.json'), JSON.stringify({ rule: spec.rdpRule, marginMin: RDP_MARGIN_MIN, minMargin: Math.min(...rdpTable.map((r) => r.margin)), entries: rdpTable }, null, 2) + '\n')

const points = {
  schema: 'gms-laptop-points/v2',
  generatedBy: 'exports/laptop-v2/gen-parts-v2.mjs',
  sourceSpec: 'PROMPT-laptop-model.md §2（坐标逐字沿用）+ PROMPT-laptop-detail.md D1–D10',
  counts,
  conventions: {
    axes: 'x = 宽度（左右，±0.1520）；y = 高度（向上，y=0 为底面后缘基准面）；z = 深度（+z 朝用户/前缘，−z 朝转轴/后缘，±0.1060）',
    datum: '整机最低点 = 后脚垫底面 0.0004245',
    rdp: spec.rdpRule,
    poly3d: 'gms.part("poly", {points:[[x,y,z],[x,y,z]], size}) → 1 根 10009008 圆柱（3D 朝向由两端点决定）→ 上盖边缘管用 poly 段，消掉 roll 缺失导致的 gms.props 兜底',
    roll: '引擎未实现 roll；v2 通过「上盖边缘改为 poly 圆角管 + 底座四角改 4 段竖直折线」使 needProps = 0（本文件 parts[].needProps 全为 false）',
    screenOrientation: '屏上边 = 闭态 +z（开合 100° 后位于顶部）：上黑边 0.0060 在 +z、下巴 0.0120 在 −z、摄像头在 +z 上边中点（v1 上下颠倒，v2 修正）',
  },
  keyPoints: ordered.map((p) => p.kind === 'quad'
    ? { id: p.id, kind: 'quad', x: p.center[0], y: p.center[1], z: p.center[2], w: round(p.w, 8), h: round(p.h, 8), thick: p.thick, normal: p.normal, batch: p.batch, ref: p.ref }
    : { id: p.id, kind: p.kind, batch: p.batch, ref: p.ref }),
  layoutBudget: {
    zFrontToBack: { frontMargin: 0.0120, trackpad: 0.0740, gap: 0.0050, keyboardWell: 0.1090, hingeZone: 0.0120, sum: 0.2120 },
    keyboard: { rows: 6, rowPitch: 0.0180, cols: 14, colPitch: 0.0190, keys: keyCount, capTop: CAP_TOP, capCell: CAP_CELL, capGap: round(CAP_CELL - CAP_TOP, 4) === 0 ? 0 : round(0.0190 - CAP_CELL, 4) },
    screen: { visible: '0.2920×0.1825', bezelLR: 0.0060, bezelTop: 0.0060, bezelBottom: 0.0120, gradientRows: SC.rows },
    height: { closedTop: TOP_Y, lidTh: LID_TH, closedTotal: 0.0155, bottomBack: 0.0006, bottomFront: 0.0051 },
    chamfer: { R: R_CHAM, baseSegments: 4, lidArcSegments: 5, baseChordError: 0.000192, lidChordError: 0.000098 },
  },
}
writeFileSync(join(OUT_EXP, 'points-v2.json'), JSON.stringify(points, null, 2) + '\n')

console.log('parts:', counts.total, '| quads:', counts.quads, '| rods:', counts.rods, '| tubes:', counts.tubes, '| discs:', counts.discs, '| keycaps:', keyCount)
console.log('named:', counts.named, '| needProps:', needProps.length, '| min RDP margin:', Math.min(...rdpTable.map((r) => r.margin)))
console.log('solids (10009008):', counts.rods + counts.tubes + counts.discs, '| planes (10009003):', counts.quads)
for (const b of spec.batches) console.log(' ', b.batch.padEnd(10), String(b.count).padStart(4), b.files.map((f) => f.file).join(' '))
