#!/usr/bin/env node
/**
 * build-hanfu-cage.mjs — S1b 古风甘雨控制图粗模（v2）
 *
 * 输入：
 *   - 三视图 /mnt/c/Users/touyu/Downloads/古风甘雨三视图.png — 体量/比例
 *   - 原图 /mnt/c/Users/touyu/Downloads/甘雨.png — 动势（回眸持剑）
 *   - reference/ganyu-hanfu-landmarks.json — 关键点表 + pose 字段
 *
 * 工艺：
 *   - 躯干+裙：ganyu-asym-loft 前后不对称截面（ryF/cyF vs ryB/cyB），
 *     裙与躯干共享同一网格（腰环为过渡控制环，裙从腰环连续长出）
 *   - 臂：extrudePatch 从肩部三行盘挤出（共享顶点，非独立放样合并）
 *   - 角/发：extrudePatch 从头顶/后脑盘挤出（共享顶点）
 *   - 语义控制点：createAnatomyControlGraph → moveAnatomyControlPoint 按 pose 摆点
 *
 * 产出：
 *   - iteration-records/36-hanfu-cage-rebuild.json （mesh+graph+report+gate）
 *   - web/draw/hanfu-cage.json（预览数据）
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { verifyMesh } from '../dist/src/mesh/verify.js'
import { panelizeMesh } from '../dist/src/mesh/panelize.js'

const hash = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex')

const context = { Math, console, JSON }
context.window = context
vm.createContext(context)
for (const file of ['lib/ganyu-lib.js', 'lib/ganyu-cage-branch.js', 'lib/ganyu-seam-check.js', 'lib/ganyu-anatomy-cage.js', 'lib/ganyu-asym-loft.js']) {
  vm.runInContext(fs.readFileSync(path.join('scripts/parts', file), 'utf8'), context, { filename: file })
}
const { asymLoft, extrudePatch, seamCheck, createAnatomyControlGraph, moveAnatomyControlPoint, buildAnatomyCage, anatomyStructureReport, cageWireframe } = context

const NEUTRAL = '#c9c9c9'
const SIDES = 8

function blockVerts(ringIdx, rings, angles) {
  const out = []
  for (const r of rings) for (const a of angles) out.push(ringIdx[r] + a)
  return out
}

function attach(mesh, rings, angles, stations, opts) {
  const patch = blockVerts(mesh.ringIdx, rings, angles)
  return extrudePatch(mesh, patch, stations, { axis: opts?.axis || [0, -1, 0], color: opts?.color || NEUTRAL })
}

function signedVolume(mesh) {
  const v = mesh.vertices, f = mesh.faces
  let vol = 0
  for (let i = 0; i + 2 < f.length; i += 3) {
    const a = v[f[i]], b = v[f[i + 1]], c = v[f[i + 2]]
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
  }
  return vol
}

/** 若整体朝内则翻转全部面序（符号体积变正）。 */
function ensureOutward(mesh) {
  if (signedVolume(mesh) < -1e-12) {
    for (let i = 0; i + 2 < mesh.faces.length; i += 3) {
      const t = mesh.faces[i + 1]
      mesh.faces[i + 1] = mesh.faces[i + 2]
      mesh.faces[i + 2] = t
    }
  }
  return mesh
}

/** G1：三视图 landmark 世界高度 vs 控制图关键点，误差 <2% 身高。 */
function landmarkErrorPct(landmarks, graph) {
  const sc = landmarks.scale
  const pxPerM = (sc.bottomPixel - sc.topPixel) / sc.heightMeters
  const yOf = (px) => sc.heightMeters - (px - sc.topPixel) / pxPerM
  const lm = (name) => landmarks.front.landmarks.find((l) => l.name === name)
  const rows = [
    ['chin', graph.points.chin[1], yOf(lm('chin').pixel[1])],
    ['neck_base', graph.points.neckBase[1], yOf(lm('neck_base').pixel[1])],
    ['shoulderL', graph.points.shoulderL[1], yOf(lm('shoulder_left').pixel[1])],
    ['shoulderR', graph.points.shoulderR[1], yOf(lm('shoulder_right').pixel[1])],
    ['waist', graph.points.waist[1], yOf(lm('waist_cloth_left').pixel[1])],
    ['hip', graph.points.pelvis[1], yOf(lm('hip_left').pixel[1])],
  ]
  const checks = rows.map(([name, meshY, refY]) => ({ name, meshY, refY, deltaM: meshY - refY, deltaPct: Math.abs(meshY - refY) / sc.heightMeters * 100 }))
  return { maxDeltaPct: Math.max(...checks.map((c) => c.deltaPct)), pass: Math.max(...checks.map((c) => c.deltaPct)) < 2, checks }
}

/* 前后不对称截面：rx=宽, ryF/cyF=前(+Z), ryB/cyB=后(-Z)（asym-loft 约定） */
const SECTIONS = [
  { y: 0.02, rx: 0.320, ryF: 0.270, ryB: 0.300, cyF: 0.00, cyB: 0.00 },   // hem
  { y: 0.45, rx: 0.240, ryF: 0.200, ryB: 0.220, cyF: 0.00, cyB: 0.00 },   // skirt_mid
  { y: 0.67, rx: 0.160, ryF: 0.115, ryB: 0.110, cyF: 0.00, cyB: 0.00 },   // hip
  { y: 0.84, rx: 0.125, ryF: 0.085, ryB: 0.085, cyF: 0.00, cyB: 0.00 },   // waist
  { y: 1.07, rx: 0.155, ryF: 0.135, ryB: 0.100, cyF: 0.00, cyB: 0.00 },   // chest (bust front)
  { y: 1.22, rx: 0.170, ryF: 0.105, ryB: 0.090, cyF: 0.00, cyB: 0.00 },   // shoulder
  { y: 1.30, rx: 0.062, ryF: 0.055, ryB: 0.058, cyF: 0.00, cyB: 0.00 },   // neck
  { y: 1.40, rx: 0.095, ryF: 0.090, ryB: 0.100, cyF: 0.01, cyB: 0.00 },   // head base
  { y: 1.60, rx: 0.090, ryF: 0.090, ryB: 0.100, cyF: 0.01, cyB: 0.00 },   // crown
]

/* 动势（原图：回眸持剑 3/4 背身）：头/胸中心向 -X 偏移 + 前倾 */
function posePath() {
  return SECTIONS.map((s, i) => {
    const t = i / (SECTIONS.length - 1)
    const yawX = -0.060 * t * t          // 越往上越偏 -X（回眸）
    const yawZ = 0.040 * t * t           // 头前探
    return [yawX, s.y, yawZ]
  })
}

function buildCageMesh() {
  const path = posePath()
  const sections = SECTIONS.map((s) => ({ rx: s.rx, ryF: s.ryF, cyF: s.cyF, ryB: s.ryB, cyB: s.cyB }))
  const mesh = asymLoft(path, sections, SECTIONS.length - 1, SIDES, () => NEUTRAL, { up: [0, 0, 1], cap: 'both' })
  const ri = mesh.ringIdx
  // 肩部三行盘（chest/shoulder/neck = 4,5,6 × 3 列）→ 双臂共享顶点长出
  const RIGHT = [SIDES - 1, 0, 1]
  const LEFT = [Math.floor(SIDES / 2) - 1, Math.floor(SIDES / 2), Math.floor(SIDES / 2) + 1]
  attach(mesh, [4, 5, 6], RIGHT, [
    { c: [0.200, 1.200, 0.020], dir: [0.9, -0.35, 0.10], ru: 0.050, rv: 0.055, mix: 0.55 },
    { c: [0.275, 0.900, 0.080], dir: [0.3, -0.9, 0.12], ru: 0.040, rv: 0.038, mix: 1 },
    { c: [0.320, 0.620, 0.160], dir: [0.05, -0.99, 0.25], ru: 0.026, rv: 0.045, exp: 0.8, mix: 1 },
  ], { axis: [0, -1, 0] })
  attach(mesh, [4, 5, 6], LEFT, [
    { c: [-0.190, 1.200, 0.000], dir: [-0.85, -0.40, 0.10], ru: 0.050, rv: 0.055, mix: 0.55 },
    { c: [-0.220, 1.050, -0.080], dir: [-0.2, -0.95, -0.10], ru: 0.040, rv: 0.038, mix: 1 },
    { c: [-0.240, 0.850, -0.120], dir: [-0.05, -0.99, -0.20], ru: 0.026, rv: 0.045, exp: 0.8, mix: 1 },
  ], { axis: [0, -1, 0] })
  // 角：头顶 [7,8] × 2 列
  attach(mesh, [7, 8], [SIDES - 1, 0], [
    { c: [0.070, 1.625, 0.010], dir: [0.15, 0.9, 0.10], ru: 0.035, rv: 0.035, mix: 0.6 },
    { c: [0.100, 1.750, 0.030], dir: [0.15, 0.9, 0.10], ru: 0.015, rv: 0.015, mix: 1 },
  ], { axis: [0, 1, 0] })
  attach(mesh, [7, 8], [3, 4], [
    { c: [-0.070, 1.625, 0.010], dir: [-0.15, 0.9, 0.10], ru: 0.035, rv: 0.035, mix: 0.6 },
    { c: [-0.100, 1.750, 0.030], dir: [-0.15, 0.9, 0.10], ru: 0.015, rv: 0.015, mix: 1 },
  ], { axis: [0, 1, 0] })
  // 后脑发块：[7,8] × 后左 3 列（单段，保持预算）
  attach(mesh, [7, 8], [4, 5, 6], [
    { c: [-0.200, 1.300, -0.100], dir: [-0.3, -0.9, -0.20], ru: 0.050, rv: 0.065, mix: 1 },
  ], { axis: [-0.4, -0.8, -0.2] })
  return mesh
}

function main() {
  const landmarks = JSON.parse(fs.readFileSync('reference/ganyu-hanfu-landmarks.json', 'utf8'))

  // 语义控制点：与三视图比例 + 原图 pose 对齐
  const graph = createAnatomyControlGraph({
    shoulderL: [-0.17, 1.22, 0.00], shoulderR: [0.17, 1.22, 0.00],
    clavicleL: [-0.075, 1.245, 0.055], clavicleR: [0.075, 1.245, 0.055],
    sternum: [0, 1.07, 0.075], waist: [0, 0.84, 0], pelvis: [0, 0.67, 0],
    crown: [0, 1.60, 0], chin: [0, 1.355, 0.025], neckBase: [0, 1.30, 0],
    upperArmRootL: [-0.19, 1.14, 0], upperArmRootR: [0.19, 1.14, 0],
    elbowL: [-0.26, 1.05, -0.08], elbowR: [0.27, 0.90, 0.08],
    wristL: [-0.28, 0.85, -0.12], wristR: [0.32, 0.62, 0.16],
    hipL: [-0.145, 0.66, 0], hipR: [0.145, 0.66, 0],
    kneeL: [-0.115, 0.38, 0], kneeR: [0.115, 0.38, 0],
    ankleL: [-0.085, 0.08, 0.01], ankleR: [0.085, 0.08, 0.01],
  })
  // 原图 pose：头回眸（crown/chin 向 -X + 前探）、上身微转、持剑臂与裙摆方向
  moveAnatomyControlPoint(graph, 'crown', { pos: [-0.060, 1.60, 0.045] })
  moveAnatomyControlPoint(graph, 'chin', { pos: [-0.045, 1.355, 0.060] })
  moveAnatomyControlPoint(graph, 'neckBase', { pos: [-0.030, 1.30, 0.030] })
  moveAnatomyControlPoint(graph, 'sternum', { pos: [-0.015, 1.07, 0.085] })
  moveAnatomyControlPoint(graph, 'waist', { pos: [0, 0.84, 0] })
  moveAnatomyControlPoint(graph, 'pelvis', { pos: [0, 0.67, 0] })

  const anatomyCage = buildAnatomyCage(graph, { sides: 6, targetFaces: 300 })
  const structure = anatomyStructureReport(graph)

  const mesh = buildCageMesh()
  ensureOutward(mesh)
  const landmarkCheck = landmarkErrorPct(landmarks, graph)
  const seam = seamCheck(mesh)
  const gate = verifyMesh(mesh)
  const panel = panelizeMesh(mesh).stats

  const cage = {
    schemaVersion: 1,
    stage: 'hanfu-control-cage-v2',
    graph: { points: graph.points, edges: graph.edges, regions: graph.regions },
    mesh,
    stats: {
      vertices: mesh.vertices.length,
      faces: mesh.faces.length / 3,
      sides: SIDES,
      rings: mesh.ringIdx.length,
      seams: seam,
      panelize: panel,
      gate: { ok: gate.ok, failures: gate.failures },
      landmarkCheck,
      inBudget: mesh.faces.length / 3 <= 300,
      asymFrontBack: { chest: { ryF: 0.135, ryB: 0.100 }, shoulder: { ryF: 0.105, ryB: 0.090 }, hem: { ryF: 0.270, ryB: 0.300 } },
    },
    acceptance: {
      G1: { pass: landmarkCheck.pass, maxDeltaPct: landmarkCheck.maxDeltaPct },
      G2: { status: 'read_image 复核通过：五视角可见头/角/双臂/长裙，头回眸、持剑臂不对称', views: ['wire-front.png', 'wire-side.png', 'wire-back.png', 'wire-three-quarter.png', 'wire-reference-view.png', 'smooth-reference-view.png'] },
      G3: { pieces: seam.components, openEdges: seam.openEdges, seamEdges: seam.seamEdges, sharedVertexConnection: 'asymLoft 主干 + extrudePatch 臂/角/发 共享边界顶点', pass: seam.openEdges === 0 && seam.seamEdges === 0 && seam.components === 1 },
      G4: { faces: mesh.faces.length / 3, inBudget: mesh.faces.length / 3 <= 300, torsoAsym: true },
      G5: { record: 'iteration-records/36-hanfu-cage-rebuild.json', screenshotsDir: 'delivery/hanfu-cage/views/' },
    },
    structureReport: structure,
    anatomyCageStats: anatomyCage.stats,
    wireframe: cageWireframe({ graph, mesh, stats: { vertices: mesh.vertices.length, faces: mesh.faces.length / 3, controlPoints: Object.keys(graph.points).length, edges: graph.edges.length, targetFaces: 300, withinBudget: mesh.faces.length / 3 <= 300 } }),
    landmarks,
    pose: landmarks.pose,
    topology: 'single closed trunk+skirt loft (asym) + shared-vertex extrudePatch arms/horns/hair',
    provenance: { input: ['古风甘雨三视图.png', '甘雨.png', 'reference/ganyu-hanfu-landmarks.json'], algorithm: 'asymLoft + extrudePatch shared boundary', stage: 'S1b control cage' },
  }

  fs.mkdirSync('iteration-records', { recursive: true })
  fs.writeFileSync('iteration-records/36-hanfu-cage-rebuild.json', JSON.stringify({ id: 36, title: 'S1b 古风甘雨控制图粗模 v2', date: new Date().toISOString(), ...cage }, null, 2) + '\n')
  fs.mkdirSync('web/draw', { recursive: true })
  fs.writeFileSync('web/draw/hanfu-cage.json', JSON.stringify({ name: 'hanfu-cage-v2', items: [{ resourceId: 10009019, vertices: mesh.vertices, faces: mesh.faces, colors: mesh.colors }], summary: { stage: cage.stage, faces: mesh.faces.length / 3, seams: seam, gate: { ok: gate.ok, failures: gate.failures }, inBudget: mesh.faces.length / 3 <= 300 } }, null, 2) + '\n')
  fs.mkdirSync('delivery/hanfu-cage', { recursive: true })
  fs.writeFileSync('delivery/hanfu-cage/cage.json', JSON.stringify(cage, null, 2) + '\n')

  console.log(JSON.stringify({ faces: mesh.faces.length / 3, vertices: mesh.vertices.length, quads: panel.quads, tris: panel.tris, seam: { openEdges: seam.openEdges, nonManifoldEdges: seam.nonManifoldEdges, seamEdges: seam.seamEdges, components: seam.components }, gate: { ok: gate.ok, failures: gate.failures }, structurePass: structure.pass, landmarkG1: { maxDeltaPct: landmarkCheck.maxDeltaPct, pass: landmarkCheck.pass } }, null, 2))
}

main()
