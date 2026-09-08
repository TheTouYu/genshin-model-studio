#!/usr/bin/env node
/**
 * build-lowpoly-whitemodel.mjs — 低面数完整白模（人物 + 手持武器 + 衣物 + 道具 + 场景）
 *
 * 按参考图复刻：甘雨式角色（蓝发/红角/白蓝长裙/持发光剑）+ 庭院布景（石台/柱廊/樱花枝/远山）。
 * 人物网格：profileLoft 主干（躯干+头）+ extrudePatch 连续分支（臂/腿/发/角/裙/飘带/剑），
 *           共享顶点、单连通组件，目标 panelize quads ≤ 200。
 * 场景/道具：独立封闭低模 mesh items（面数另计）。
 *
 * 用法（先 npm run build）：
 *   node scripts/build-lowpoly-whitemodel.mjs [outdir]
 *
 * 产物：
 *   web/draw/lowpoly-model.json        -> 预览数据（10009019 items + 分组 + 面数摘要）
 *   <outdir>/lowpoly-whitemodel.report.json
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { verifyMesh, verifyMeshExport } from '../dist/src/mesh/verify.js'
import { panelizeMesh } from '../dist/src/mesh/panelize.js'

const hash = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex')

/* ------------------------------------------------------------------ */
/* vm 加载建模工具原语（与 build-body-cage.mjs 同款，仅 dataOnly 路径）   */
/* ------------------------------------------------------------------ */
const context = { Math, console, JSON }
context.window = context
vm.createContext(context)
for (const file of ['lib/ganyu-lib.js', 'lib/ganyu-cage-branch.js', 'lib/ganyu-seam-check.js', 'lib/ganyu-anatomy-cage.js']) {
  const sourcePath = path.join('scripts/parts', file)
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: file })
}
const { profileLoft, extrudePatch, seamCheck, createAnatomyControlGraph, anatomyStructureReport, buildAnatomyCage } = context

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */
const NEUTRAL = '#c9c9c9' // 白模中性灰

/** 有符号体积（散度定理）：>0 法线整体朝外，<0 朝内。 */
function signedVolume(mesh) {
  const v = mesh.vertices
  const f = mesh.faces
  let vol = 0
  for (let i = 0; i + 2 < f.length; i += 3) {
    const a = v[f[i]], b = v[f[i + 1]], c = v[f[i + 2]]
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
  }
  return vol
}

/** 若整体朝内则翻转全部面序（保持绕序一致，符号体积变正）。 */
function ensureOutward(mesh) {
  if (signedVolume(mesh) < -1e-12) {
    for (let i = 0; i + 2 < mesh.faces.length; i += 3) {
      const t = mesh.faces[i + 1]
      mesh.faces[i + 1] = mesh.faces[i + 2]
      mesh.faces[i + 2] = t
    }
    if (mesh.colors) {}
  }
  return mesh
}

function mirrorStations(stations) {
  return stations.map((s) => ({
    ...s,
    c: [-s.c[0], s.c[1], s.c[2]],
    dir: s.dir ? [-s.dir[0], s.dir[1], s.dir[2]] : s.dir,
    frame: s.frame
      ? { u: [-s.frame.u[0], s.frame.u[1], s.frame.u[2]], v: [-s.frame.v[0], s.frame.v[1], s.frame.v[2]] }
      : s.frame,
  }))
}

function blockVerts(ringIdx, rings, angles) {
  const out = []
  for (const r of rings) for (const a of angles) out.push(ringIdx[r] + a)
  return out
}

/** 在 mesh 上把「rings × angles」的面片盘替换为肢体/发/裙等分支。 */
function attachBranch(mesh, rings, angles, stations, opts) {
  const patch = blockVerts(mesh.ringIdx, rings, angles)
  return extrudePatch(mesh, patch, stations, { axis: opts?.axis || [0, -1, 0], color: opts?.color || NEUTRAL })
}

/* ------------------------------------------------------------------ */
/* 人物参数（参考图姿态：上身微转、右手持剑下垂、长裙、长发、双角）        */
/* ------------------------------------------------------------------ */
const SIDES = 8

// 主干控制断面 {y, rx(半宽), front(+Z 前深), back(-Z 后深)}
const TRUNK_SECTIONS = [
  { y: 0.82, rx: 0.135, front: 0.090, back: 0.105 }, // pelvis
  { y: 0.93, rx: 0.160, front: 0.105, back: 0.125 }, // hip
  { y: 1.05, rx: 0.130, front: 0.085, back: 0.085 }, // waist
  { y: 1.17, rx: 0.155, front: 0.135, back: 0.100 }, // chest (bust)
  { y: 1.30, rx: 0.170, front: 0.105, back: 0.092 }, // shoulder
  { y: 1.36, rx: 0.065, front: 0.058, back: 0.058 }, // neck
  { y: 1.44, rx: 0.100, front: 0.090, back: 0.100 }, // head base
  { y: 1.60, rx: 0.090, front: 0.090, back: 0.100 }, // crown
]

const RIGHT_ANGLES = [SIDES - 1, 0, 1]
const LEFT_ANGLES = [Math.floor(SIDES / 2) - 1, Math.floor(SIDES / 2), Math.floor(SIDES / 2) + 1]

const ARM_STATIONS = [
  { c: [0.190, 1.265, 0.000], dir: [0.9, -0.35, 0.10], ru: 0.050, rv: 0.055, mix: 0.55 },
  { c: [0.260, 1.020, 0.020], dir: [0.3, -0.93, 0.15], ru: 0.038, rv: 0.034, mix: 1 },
  { c: [0.305, 0.735, 0.065], dir: [0.05, -0.99, 0.2], ru: 0.024, rv: 0.044, exp: 0.8, mix: 1 },
]

const LEG_STATIONS = [
  { c: [0.115, 0.785, 0.000], ru: 0.075, rv: 0.065, radial: true, mix: 0.5 },
  { c: [0.118, 0.480, 0.010], ru: 0.058, rv: 0.050, mix: 1 },
  { c: [0.115, 0.045, 0.110], ru: 0.032, rv: 0.042, bend: -1.38, mix: 1 },
]

// 腿：左右各 4 个角向列（覆盖骨盆底，配合裆部 arch 改善髋根连接）
const LEG_ANGLES_R = [SIDES - 1, 0, 1, 2]
const LEG_ANGLES_L = [4, 5, 6, 7]

const HAIR_STATIONS = [
  { c: [-0.14, 1.52, -0.05], dir: [-0.35, -0.85, 0.20], ru: 0.085, rv: 0.100, mix: 0.40 },
  { c: [-0.24, 1.30, -0.10], dir: [-0.50, -0.85, 0.15], ru: 0.060, rv: 0.090, mix: 1 },
  { c: [-0.30, 1.05, -0.12], dir: [-0.30, -0.95, 0.10], ru: 0.020, rv: 0.050, mix: 1 },
]

const HORN_STATIONS = [
  { c: [0.075, 1.68, 0.02], dir: [0.15, 1, 0.10], ru: 0.035, rv: 0.035, mix: 0.60 },
  { c: [0.100, 1.80, 0.04], dir: [0.15, 1, 0.10], ru: 0.012, rv: 0.012, mix: 1 },
]

const SKIRT_BACK_STATIONS = [
  { c: [-0.02, 0.90, -0.02], dir: [0, -0.90, -0.15], ru: 0.160, rv: 0.130, exp: 0.8, mix: 0.40 },
  { c: [-0.04, 0.55, -0.04], dir: [0, -0.95, -0.20], ru: 0.200, rv: 0.160, exp: 0.8, mix: 1 },
  { c: [-0.06, 0.25, -0.06], dir: [0, -0.90, -0.25], ru: 0.220, rv: 0.180, exp: 0.8, mix: 1 },
]

const SKIRT_FRONT_STATIONS = [
  { c: [0.05, 0.92, 0.05], dir: [0, -0.90, 0.20], ru: 0.150, rv: 0.100, exp: 0.8, mix: 0.40 },
  { c: [0.06, 0.60, 0.08], dir: [0, -0.90, 0.25], ru: 0.160, rv: 0.110, exp: 0.8, mix: 1 },
  { c: [0.07, 0.32, 0.10], dir: [0, -0.90, 0.30], ru: 0.170, rv: 0.120, exp: 0.8, mix: 1 },
]

const SASH_STATIONS = [
  { c: [0.16, 0.75, 0.06], dir: [0.15, -0.85, 0.20], ru: 0.020, rv: 0.045, exp: 0.7, mix: 0.6 },
  { c: [0.22, 0.40, 0.12], dir: [0.15, -0.85, 0.20], ru: 0.016, rv: 0.038, exp: 0.7, mix: 1 },
  { c: [0.26, 0.20, 0.15], dir: [0.10, -0.90, 0.25], ru: 0.007, rv: 0.020, exp: 0.7, mix: 1 },
]

// 剑：从右手掌端长出（guard 宽 → 刃细），沿参考图右下方指向
const SWORD_STATIONS = [
  { c: [0.30, 0.70, 0.08], dir: [0.15, -0.90, 0.30], ru: 0.018, rv: 0.060, exp: 0.6, mix: 0.50 },
  { c: [0.36, 0.42, 0.20], dir: [0.15, -0.90, 0.30], ru: 0.012, rv: 0.045, exp: 0.6, mix: 1 },
  { c: [0.42, 0.18, 0.30], dir: [0.15, -0.90, 0.30], ru: 0.003, rv: 0.012, exp: 0.6, mix: 1 },
]

function buildCharacterMesh() {
  const path2 = TRUNK_SECTIONS.map((s) => [0, s.y, 0])
  const sections = TRUNK_SECTIONS.map((s) => ({ rx: s.rx, ryB: s.front, ryF: s.back }))
  const mesh = profileLoft(path2, sections, TRUNK_SECTIONS.length - 1, SIDES, () => NEUTRAL, {
    dataOnly: true,
    cap: 'both',
    up: [0, 0, 1],
  })
  const ri = mesh.ringIdx
  // 裆部拱起（body-cage 同款）：抬升骨盆底环中线
  for (let j = 0; j < SIDES; j++) {
    const p = mesh.vertices[j]
    p[1] += 0.055 * (1 - Math.abs(p[0]) / TRUNK_SECTIONS[0].rx)
  }
  mesh.vertices[SIDES * ri.length][1] = 0.855
  return { mesh }
}

/* ------------------------------------------------------------------ */
/* 场景/道具封闭低模（白模，不占人物 200 面预算）                        */
/* ------------------------------------------------------------------ */
function boxMesh(w, h, d, cx, cy, cz) {
  const x = w / 2, y = h / 2, z = d / 2
  const v = [
    [cx - x, cy - y, cz - z], [cx + x, cy - y, cz - z], [cx + x, cy - y, cz + z], [cx - x, cy - y, cz + z],
    [cx - x, cy + y, cz - z], [cx + x, cy + y, cz - z], [cx + x, cy + y, cz + z], [cx - x, cy + y, cz + z],
  ]
  const f = [0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2, 0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 1, 1, 4, 5, 2, 6, 7, 2, 7, 3]
  return { vertices: v, faces: f, colors: [] }
}

function cylinderMesh(rt, rb, hgt, sides, cx, cy, cz, segY) {
  // 分段圆柱（每段高度 ≤ ~6×radius，避免细长侧三角）
  if (segY == null) segY = Math.max(1, Math.ceil(hgt / (Math.max(Math.abs(rt), Math.abs(rb), 0.001) * 6)))
  const v = [], f = []
  const y0 = cy - hgt / 2
  for (let k = 0; k <= segY; k++) {
    const t = k / segY
    const y = y0 + hgt * t
    const r = rb + (rt - rb) * t
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2
      v.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r])
    }
  }
  for (let k = 0; k < segY; k++) {
    const base = k * sides, next = (k + 1) * sides
    for (let i = 0; i < sides; i++) {
      const n = (i + 1) % sides
      f.push(base + i, next + i, next + n, base + i, next + n, base + n)
    }
  }
  const cBot = v.length
  v.push([cx, y0, cz])
  for (let i = 0; i < sides; i++) f.push(cBot, i, ((i + 1) % sides))
  const cTop = v.length
  v.push([cx, cy + hgt / 2, cz])
  const base = segY * sides
  for (let i = 0; i < sides; i++) f.push(cTop, base + ((i + 1) % sides), base + i)
  return { vertices: v, faces: f, colors: [] }
}

function coneMesh(r, hgt, sides, cx, cy, cz) {
  // 圆锥：底面在 cy，尖在 cy+hgt（白模山脉/装饰）
  const v = [], f = []
  const base = v.length
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2
    v.push([cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r])
  }
  const apex = v.length
  v.push([cx, cy + hgt, cz])
  for (let i = 0; i < sides; i++) {
    const n = (i + 1) % sides
    f.push(base + i, apex, base + n)
  }
  const center = v.length
  v.push([cx, cy, cz])
  for (let i = 0; i < sides; i++) f.push(center, base + i, base + ((i + 1) % sides))
  return { vertices: v, faces: f, colors: [] }
}

function tubeSegments(points, r, sides) {
  // 枝条：每段一个独立封闭圆柱（场景件，段间不共享顶点也无重复坐标）
  const out = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    out.push(cylinderMesh(r, r, len, sides, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2))
  }
  return out
}

/** 连续圆管/异形截面放样（独立件：发/角/裙/飘带），两端封口、共享顶点、闭合。 */
function sweepMesh(centers, radii, sides, opts) {
  opts = opts || {}
  const exp = opts.exp || 1
  const v = [], f = []
  const n = centers.length
  const norm = (p) => { const l = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / l, p[1] / l, p[2] / l] }
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  for (let i = 0; i < n; i++) {
    const p0 = centers[Math.max(0, i - 1)], p1 = centers[Math.min(n - 1, i + 1)]
    const tg = norm([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]])
    const up = Math.abs(tg[1]) > 0.95 ? [1, 0, 0] : (opts.up || [0, 1, 0])
    const u1 = norm(cross(tg, up))
    const u2 = cross(tg, u1)
    const c = centers[i], r = radii[Math.min(radii.length - 1, i)]
    const ru = Array.isArray(r) ? r[0] : r, rv = Array.isArray(r) ? r[1] : r
    for (let a = 0; a < sides; a++) {
      const th = (a / sides) * Math.PI * 2
      const ce = Math.cos(th), se = Math.sin(th)
      const ce2 = (ce < 0 ? -1 : 1) * Math.pow(Math.abs(ce), exp)
      const se2 = (se < 0 ? -1 : 1) * Math.pow(Math.abs(se), exp)
      v.push([
        c[0] + u1[0] * ce2 * ru + u2[0] * se2 * rv,
        c[1] + u1[1] * ce2 * ru + u2[1] * se2 * rv,
        c[2] + u1[2] * ce2 * ru + u2[2] * se2 * rv,
      ])
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let a = 0; a < sides; a++) {
      const an = (a + 1) % sides
      const A = i * sides + a, B = i * sides + an, C = (i + 1) * sides + an, D = (i + 1) * sides + a
      f.push(A, B, C, A, C, D)
    }
  }
  const c0 = v.length
  v.push(centers[0].slice())
  for (let a = 0; a < sides; a++) f.push(c0, ((a + 1) % sides), a)
  const c1 = v.length
  v.push(centers[n - 1].slice())
  const base = (n - 1) * sides
  for (let a = 0; a < sides; a++) f.push(c1, base + a, base + ((a + 1) % sides))
  return { vertices: v, faces: f, colors: [] }
}

/** 角色衣/发/角等贴合件（与人体主网格重叠/嵌入，不悬空）。 */
function buildCharacterClothingItems() {
  const items = []
  const push = (mesh) => items.push({ resourceId: 10009019, ...ensureOutward(mesh) })

  // 右臂（持剑侧）：肩→肘→腕/掌，根部嵌入躯干
  push(sweepMesh(
    [[0.150, 1.280, 0.000], [0.255, 1.020, 0.020], [0.305, 0.735, 0.065]],
    [[0.050, 0.052], [0.042, 0.040], [0.035, 0.045]], 4, { exp: 0.8 }
  ))
  // 左臂（下垂 + 轻微外张；固定 up=[1,0,0] 避免近竖直架翻转）
  push(sweepMesh(
    [[-0.150, 1.280, 0.000], [-0.200, 1.050, 0.000], [-0.300, 0.800, 0.020]],
    [[0.050, 0.052], [0.042, 0.040], [0.035, 0.045]], 4, { exp: 0.8, up: [1, 0, 0] }
  ))

  // 右腿（髋→膝→足前端，长段平滑，根部嵌入骨盆）
  push(sweepMesh(
    [[0.100, 0.840, 0.000], [0.105, 0.480, 0.010], [0.105, 0.035, 0.130]],
    [[0.065, 0.060], [0.052, 0.050], [0.042, 0.045]], 4, { exp: 0.8 }
  ))
  push(sweepMesh(
    [[-0.100, 0.840, 0.000], [-0.105, 0.480, 0.010], [-0.105, 0.035, 0.130]],
    [[0.065, 0.060], [0.052, 0.050], [0.042, 0.045]], 4, { exp: 0.8 }
  ))

  // 剑（右手握持处与腕部重叠，刃向右下）
  push(sweepMesh(
    [[0.315, 0.730, 0.080], [0.385, 0.440, 0.200], [0.455, 0.160, 0.310]],
    [[0.035, 0.065], [0.032, 0.060], [0.026, 0.050]], 4, { exp: 0.7 }
  ))

  // 长发：后左大股（起点嵌入头部）
  push(sweepMesh(
    [[-0.06, 1.56, -0.02], [-0.16, 1.35, -0.05], [-0.26, 1.05, -0.08]],
    [[0.075, 0.080], [0.065, 0.070], [0.050, 0.055]], 4, { exp: 0.8 }
  ))
  // 前右侧短股（发梢到肩前）
  push(sweepMesh(
    [[0.05, 1.56, 0.02], [0.12, 1.42, 0.05], [0.15, 1.24, 0.07]],
    [[0.058, 0.062], [0.048, 0.052], [0.032, 0.038]], 4, { exp: 0.8 }
  ))

  // 双角（根部嵌入头顶，弯向上外，3 边均匀锥）
  push(sweepMesh(
    [[0.065, 1.57, 0.01], [0.090, 1.70, 0.03], [0.120, 1.82, 0.05]],
    [[0.030, 0.030], [0.028, 0.028], [0.026, 0.026]], 3
  ))
  push(sweepMesh(
    [[-0.065, 1.57, 0.01], [-0.090, 1.70, 0.03], [-0.120, 1.82, 0.05]],
    [[0.030, 0.030], [0.028, 0.028], [0.026, 0.026]], 3
  ))

  // 长裙后幅（背侧封闭锥壳，上端嵌入腰腹）
  push(sweepMesh(
    [[0, 0.96, -0.02], [0, 0.65, -0.05], [0, 0.35, -0.08], [0, 0.18, -0.10]],
    [[0.150, 0.070], [0.190, 0.100], [0.220, 0.120], [0.220, 0.120]], 4, { exp: 0.7, up: [0, 0, 1] }
  ))
  // 长裙前/右侧摆（正面可读的衣摆，向前开衩）
  push(sweepMesh(
    [[0.06, 0.95, 0.04], [0.10, 0.65, 0.10], [0.12, 0.35, 0.14], [0.13, 0.18, 0.16]],
    [[0.100, 0.050], [0.130, 0.070], [0.150, 0.080], [0.150, 0.080]], 4, { exp: 0.8 }
  ))

  return items
}

function buildSceneItems() {
  const items = []
  const push = (mesh) => items.push({ resourceId: 10009019, ...ensureOutward(mesh) })

  // 石台/地面
  push(cylinderMesh(1.45, 1.55, 0.08, 12, 0, -0.04, 0))
  push(cylinderMesh(0.85, 0.95, 0.06, 12, 0, -0.03, 1.0))
  // 柱廊（左右 + 后，圆柱竖向）
  for (const [x, z] of [[-1.5, -1.4], [1.5, -1.4], [-1.5, -2.6], [1.5, -2.6]]) {
    push(cylinderMesh(0.10, 0.10, 2.3, 6, x, 1.15, z))
  }
  // 顶部梁（横杆）+ 低顶锥 + 侧梁
  push(sweepMesh([[-1.7, 2.36, -1.4], [-0.85, 2.36, -1.4], [0, 2.36, -1.4], [0.85, 2.36, -1.4], [1.7, 2.36, -1.4]], [[0.08, 0.08], [0.08, 0.08], [0.08, 0.08], [0.08, 0.08], [0.08, 0.08]], 6))
  push(coneMesh(1.8, 0.12, 8, 0, 2.40, -2.0))
  push(sweepMesh([[-1.5, 2.36, -3.4], [-1.5, 2.36, -2.7], [-1.5, 2.36, -2.0], [-1.5, 2.36, -1.3], [-1.5, 2.36, -0.6]], [[0.08, 0.08], [0.08, 0.08], [0.08, 0.08], [0.08, 0.08], [0.08, 0.08]], 6))
  push(sweepMesh([[1.5, 2.36, -3.4], [1.5, 2.36, -2.7], [1.5, 2.36, -2.0], [1.5, 2.36, -1.3], [1.5, 2.36, -0.6]], [[0.08, 0.08], [0.08, 0.08], [0.08, 0.08], [0.08, 0.08], [0.08, 0.08]], 6))
  // 栏杆（横杆）
  const railing = [-2.6, -1.9, -1.2, -0.5]
  for (const z of railing) {
    const railPts = [[-1.4, 0.72, z], [-0.84, 0.72, z], [-0.28, 0.72, z], [0.28, 0.72, z], [0.84, 0.72, z], [1.4, 0.72, z]]
    const railPts2 = [[-1.4, 1.05, z], [-0.84, 1.05, z], [-0.28, 1.05, z], [0.28, 1.05, z], [0.84, 1.05, z], [1.4, 1.05, z]]
    push(sweepMesh(railPts, [[0.055, 0.055], [0.055, 0.055], [0.055, 0.055], [0.055, 0.055], [0.055, 0.055], [0.055, 0.055]], 6))
    push(sweepMesh(railPts2, [[0.055, 0.055], [0.055, 0.055], [0.055, 0.055], [0.055, 0.055], [0.055, 0.055], [0.055, 0.055]], 6))
  }
  // 樱花枝（前景左右）+ 花簇
  for (const m of tubeSegments([[-1.35, 0.2, 1.9], [-1.0, 0.9, 1.5], [-0.55, 1.3, 1.1]], 0.035, 6)) push(m)
  for (const m of tubeSegments([[0.9, 0.1, 1.9], [1.2, 0.8, 1.4], [1.45, 1.35, 0.9]], 0.035, 6)) push(m)
  for (const [x, y, z] of [[-0.55, 1.35, 1.1], [-1.05, 0.95, 1.5], [1.45, 1.4, 0.9], [1.2, 0.85, 1.4]]) {
    push(cylinderMesh(0.12, 0.12, 0.02, 6, x, y, z))
    push(cylinderMesh(0.07, 0.07, 0.02, 6, x + 0.14, y + 0.07, z - 0.06))
  }
  // 远山（推远、降低，避免压过人物）
  push(coneMesh(1.2, 1.0, 6, -3.2, 0, -7.0))
  push(coneMesh(1.6, 1.3, 6, 1.8, 0, -8.0))
  push(coneMesh(0.9, 0.8, 6, 3.6, 0, -9.0))
  // 挂饰/小灯笼
  push(boxMesh(0.16, 0.16, 0.16, -1.5, 2.9, -1.4))
  for (const m of tubeSegments([[-1.5, 2.36, -1.4], [-1.5, 2.82, -1.4]], 0.015, 6)) push(m)

  return items
}

/* ------------------------------------------------------------------ */
/* 汇总与报告                                                          */
/* ------------------------------------------------------------------ */
function summarize(items) {
  const meshes = items.map((it) => ({ vertices: it.vertices, faces: it.faces, colors: it.colors }))
  const stats = meshes.map((m) => panelizeMesh(m).stats)
  const totalQuads = stats.reduce((n, s) => n + s.quads, 0)
  const totalTris = stats.reduce((n, s) => n + s.tris, 0)
  const totalUnits = stats.reduce((n, s) => n + s.budget.used, 0)
  return { stats, totalQuads, totalTris, totalUnits }
}

function main() {
  const outDir = process.argv[2] || 'delivery/lowpoly-whitemodel'
  fs.mkdirSync(outDir, { recursive: true })

  const build = buildCharacterMesh()
  ensureOutward(build.mesh)
  const characterMesh = build.mesh
  const bodyItem = { resourceId: 10009019, vertices: characterMesh.vertices, faces: characterMesh.faces, colors: characterMesh.colors }

  const seam = seamCheck(characterMesh) // 人体主网格：一体/水密
  const clothingItems = buildCharacterClothingItems()
  const characterItems = [bodyItem, ...clothingItems]
  const charMeshes = characterItems.map((it) => ({ vertices: it.vertices, faces: it.faces, colors: it.colors }))
  const charStatsList = charMeshes.map((m) => panelizeMesh(m).stats)
  const charQuads = charStatsList.reduce((n, s) => n + s.quads, 0)
  const charTris = charStatsList.reduce((n, s) => n + s.tris, 0)
  const charUnits = charStatsList.reduce((n, s) => n + s.budget.used, 0)
  const charGate = verifyMeshExport(charMeshes, charStatsList.map((s) => s.budget.used), null)
  const charBudgetFailures = charQuads > 200 ? [`人物 quads=${charQuads} 超过 200 预算`] : []
  const gate = { ok: charGate.ok && charBudgetFailures.length === 0, failures: [...charGate.failures, ...charBudgetFailures] }

  // 语义控制点核验：肩峰/锁骨/腋窝/上臂根/髋/膝/踝 等 landmark 进骨架（≤300 face cage 验证）
  const graph = createAnatomyControlGraph()
  const cage = buildAnatomyCage(graph, { sides: 6, targetFaces: 300 })
  const anatomy = { stats: cage.stats, report: anatomyStructureReport(graph) }

  const sceneItems = buildSceneItems()
  const allItems = [...characterItems, ...sceneItems]
  const sceneSum = summarize(sceneItems)
  const sceneMeshes = sceneItems.map((it) => ({ vertices: it.vertices, faces: it.faces, colors: it.colors }))
  const sceneGate = verifyMeshExport(sceneMeshes, sceneSum.stats.map((s) => s.budget.used), null)

  const payload = {
    name: 'lowpoly-ganyu-whitemodel',
    items: allItems,
    groups: { character: allItems.map((_, i) => i).slice(0, characterItems.length), scene: allItems.map((_, i) => i).slice(characterItems.length) },
    summary: {
      character: { quads: charQuads, tris: charTris, units: charUnits, trisTotal: charQuads * 2 + charTris },
      scene: { quads: sceneSum.totalQuads, tris: sceneSum.totalTris, units: sceneSum.totalUnits },
      seam: { onePiece: seam.onePiece, watertight: seam.watertight, openEdges: seam.openEdges, nonManifoldEdges: seam.nonManifoldEdges, seamEdges: seam.seamEdges, components: seam.components },
      gate: { ok: gate.ok, failures: gate.failures },
      sceneGate: { ok: sceneGate.ok, failures: sceneGate.failures },
      panelize: charStatsList,
    },
  }
  fs.writeFileSync(path.join('web', 'draw', 'lowpoly-model.json'), JSON.stringify(payload, null, 2) + '\n')

  const report = {
    generatedAt: new Date().toISOString(),
    meshFingerprint: hash(characterMesh),
    metrics: {
      vertices: characterMesh.vertices.length,
      tris: characterMesh.faces.length / 3,
      rings: characterMesh.ringIdx ? characterMesh.ringIdx.length : null,
      sides: SIDES,
    },
    seam,
    panelize: charStatsList,
    characterQuads: charQuads,
    characterUnits: charUnits,
    gate,
    anatomy,
    sceneGate,
    sceneMeshCount: sceneItems.length,
    sceneUnits: sceneSum.totalUnits,
    visualAcceptance: 'pending',
    gameAcceptance: 'pending',
  }
  fs.writeFileSync(path.join(outDir, 'lowpoly-whitemodel.report.json'), JSON.stringify(report, null, 2) + '\n')
  fs.writeFileSync(
    path.join(outDir, 'character.json'),
    JSON.stringify({ name: 'lowpoly-ganyu-whitemodel-character', vertices: characterMesh.vertices, faces: characterMesh.faces, colors: characterMesh.colors }, null, 2) + '\n'
  )
  console.log(JSON.stringify(report, null, 2))
}

main()
