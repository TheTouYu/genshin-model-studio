/**
 * panelize.ts — 网格 → 最小单元面板化（确定性，纯 TS，可单测）。
 *
 * 目标：任意「顶点 + 三角面索引 + 逐面颜色」网格，确定性拆成官方基础元件序列：
 *   - 三角形两两配对（共享边 + 法线一致 + 索引序优先）→ 10009003 平面（局部基旋转）
 *   - 未配对三角 → 10009006 三棱锥压扁（三角面片）
 *   - 退化面（面积 < minArea）→ 10009001 长方体盒兜底（默认厚 1.5mm）或跳过+计数
 *   - 颜色逐面透传为 item.color（四边形取配对的第一个三角形的颜色）
 *
 * 确定性契约：相同 mesh + 相同 opts ⇒ 相同 item 序列与字节（无随机、无时间戳）。
 * 旋转采用「显式局部基 → YXZ 欧拉」（见 docs/design：quadB 参考实现，
 * method-2026-09-06 R=Ry(β)·Rx(α)·Rz(γ)，α 为 asin/acos 项、β/γ 为 atan2 项）。
 *
 * 本模块不依赖编码器（编码在 src/core/encoder.ts / src/gia/gia-encoder.ts），
 * 也不改写 src/core/structure.ts 的 mesh 校验；面板化产物全为官方基础元件，
 * 可直接被 resolveStructure/encodeStructure/encodeGia 消费。
 */

/** 三维向量。 */
export type Vec3 = [number, number, number]

/** 网格输入（与 structure.ts 的 mesh item 承载语义一致）。 */
export type PanelMesh = {
  vertices: number[][]
  /** 三角面索引，每 3 个 = 1 三角；四边形以 (A,B,C,A,C,D) 两三角书写。 */
  faces: number[]
  /** 逐三角面颜色（"0xRRGGBB" 或网页 "#RRGGBB"，含 #RGB 简写），可省略。 */
  colors?: string[]
}

/** 面板化产物 = 单个官方基础元件。color 为十六进制字符串（"0xRRGGBB" 或 "#RRGGBB"）或省略（默认材质）。 */
export type PanelItem = {
  resourceId: number
  position: Vec3
  rotation: Vec3
  scale: Vec3
  color?: string
}

/** 面板化可选项（所有阈值/默认值均明确、可缩小整数确定）。 */
export type PanelizeOptions = {
  /** 10009003 平面元件 Y 向厚度（米）。缺省 0.005。 */
  quadThickness?: number
  /** 10009006 三棱锥压扁三角面片的 Y 向厚度（米）。缺省 0.002。 */
  triThickness?: number
  /** 退化面兜底 10009001 盒的 Y 向厚度（米）。缺省 0.0015 = 1.5mm。 */
  boxThickness?: number
  /** 退化面判定的最小面积（米²）。缺省 1e-9。 */
  minArea?: number
  /** 「法线一致」的 cos 容差（越大越严格）。缺省 0.999。 */
  normalTolerance?: number
  /** 退化面行为：'box' 兜底（默认）或 'skip'（只计数不出件）。 */
  degenerate?: 'box' | 'skip'
  /** 可选门禁回调：面板化结束后以 stats 调用（对接 03 门禁的 seam）。 */
  gateCheck?: (stats: PanelizeStats) => void
  /** 旋转约定：'basis' = 显式局部基→YXZ 欧拉（缺省）；'normal' = 与网页 part('quad') 同款 rotFromNormal（游戏/网页 1:1）。 */
  rotationMode?: 'basis' | 'normal'
}

/** 面板化统计（机器可读摘要）与预算。 */
export type PanelizeStats = {
  /** 输入三角总数。 */
  faces: number
  /** 配对成四边形的平面单元数（10009003）。 */
  quads: number
  /** 未配对三角的三棱锥单元数（10009006）。 */
  tris: number
  /** 退化面处理数（10009001 或跳过）。 */
  degenerate: number
  /** 预算：requested（null=未设）/ used（=产出单元数）/ exceeded。默认继续不拦截。 */
  budget: { requested: number | null; used: number; exceeded: boolean }
}

export type PanelizeResult = {
  items: PanelItem[]
  stats: PanelizeStats
}

// 官方基础元件 resID（与 src/core/official-resources.ts 对齐）。
export const PLANE_RESOURCE_ID = 10009003
export const TETRA_RESOURCE_ID = 10009006
export const BOX_RESOURCE_ID = 10009001

const DEFAULT_QUAD_THICKNESS = 0.005
const DEFAULT_TRI_THICKNESS = 0.002
const DEFAULT_BOX_THICKNESS = 0.0015 // 1.5mm
const DEFAULT_MIN_AREA = 1e-9
const DEFAULT_NORMAL_TOL = 0.999
const EPS = 1e-12
const DEG = 180 / Math.PI

/* ------------------------------- 几何原语 ------------------------------- */

function avg4(a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 {
  return [
    (a[0] + b[0] + c[0] + d[0]) / 4,
    (a[1] + b[1] + c[1] + d[1]) / 4,
    (a[2] + b[2] + c[2] + d[2]) / 4
  ]
}

function centroid(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function len(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2])
}

function norm(v: Vec3): Vec3 {
  const l = len(v)
  if (l < EPS) return [0, 0, 0]
  return [v[0] / l, v[1] / l, v[2] / l]
}

/**
 * 显式局部基 → YXZ 欧拉（度），R = Ry(β)·Rx(α)·Rz(γ)。
 * 与 generate.ts 头部注释一致；quadB 参考实现（makeBasis → YXZ Euler）。
 * 传入三个列向量 c0=宽度方向、c1=法线、c2=深度方向（须构成右手正交基）。
 */
export function basisToEulerYxz(c0: Vec3, c1: Vec3, c2: Vec3): Vec3 {
  // M[r][c]：列向量即局部基在局部 X/Y/Z 轴上的投影。
  const M: number[][] = [
    [c0[0], c1[0], c2[0]],
    [c0[1], c1[1], c2[1]],
    [c0[2], c1[2], c2[2]]
  ]
  // R = Ry·Rx·Rz ⇒ sinα = −M[1][2]；cosα = √(M[1][0]²+M[1][1]²) ≥ 0。
  const sinX = -M[1][2]
  const cosX = Math.sqrt(Math.max(0, M[1][0] * M[1][0] + M[1][1] * M[1][1]))
  let rx: number
  let ry: number
  let rz: number
  if (cosX > EPS) {
    // 非万向锁：α、γ（滚转）、β 均由 atan2 确定性求出。
    rx = Math.atan2(sinX, cosX)
    rz = Math.atan2(M[1][0], M[1][1])
    ry = Math.atan2(M[0][2], M[2][2])
  } else {
    // 万向锁（cosα≈0，法线落在 ±X 水平位）：固定 γ=0，用剩余元素解 β。
    rx = sinX >= 0 ? Math.PI / 2 : -Math.PI / 2
    rz = 0
    ry = Math.atan2(-M[2][0], M[0][0])
  }
  return [rx * DEG, ry * DEG, rz * DEG]
}

/**
 * 由三点推平面局部基：
 *   widthDir 沿 B−A；normal 沿 cross(B−A, D−A)；depthDir = widthDir × normal（补全右手基）。
 */
function planeBasis(A: Vec3, B: Vec3, D: Vec3): {
  widthDir: Vec3
  depthDir: Vec3
  normal: Vec3
  width: number
  depth: number
} {
  const e1 = sub(B, A)
  const e2 = sub(D, A)
  const width = len(e1)
  const depth = len(e2)
  const widthDir = width < EPS ? ([1, 0, 0] as Vec3) : norm(e1)
  let normal = norm(cross(e1, e2))
  if (len(normal) < EPS) normal = [0, 1, 0] as Vec3 // 共线退化兜底：水平法线
  const depthDir = cross(widthDir, normal)
  return { widthDir, depthDir, normal, width, depth }
}

/* ------------------------------- 输入解析 ------------------------------- */

function triangleAt(mesh: PanelMesh, faceIndex: number): [number, number, number] {
  const a = mesh.faces[faceIndex * 3]
  const b = mesh.faces[faceIndex * 3 + 1]
  const c = mesh.faces[faceIndex * 3 + 2]
  for (const idx of [a, b, c]) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= mesh.vertices.length) {
      throw new Error(`[panelize] faces[${faceIndex * 3}] index ${idx} out of range`)
    }
  }
  return [a, b, c]
}

function trianglePositions(mesh: PanelMesh, faceIndex: number): [Vec3, Vec3, Vec3] {
  const [a, b, c] = triangleAt(mesh, faceIndex)
  return [mesh.vertices[a] as Vec3, mesh.vertices[b] as Vec3, mesh.vertices[c] as Vec3]
}

function triangleNormal(mesh: PanelMesh, faceIndex: number): Vec3 {
  const [a, b, c] = trianglePositions(mesh, faceIndex)
  const n = norm(cross(sub(b, a), sub(c, a)))
  return len(n) < EPS ? ([0, 1, 0] as Vec3) : n
}

function triangleArea(mesh: PanelMesh, faceIndex: number): number {
  const [a, b, c] = trianglePositions(mesh, faceIndex)
  return 0.5 * len(cross(sub(b, a), sub(c, a)))
}

/** 共享边：两个三角恰好共 2 个顶点索引 ⇒ 共享一条边。返回这对顶点索引。 */
function sharedEdge(t1: [number, number, number], t2: [number, number, number]): [number, number] | null {
  const set1 = new Set(t1)
  const common = t2.filter((v) => set1.has(v))
  if (common.length !== 2) return null
  return [common[0] as number, common[1] as number]
}

/* ------------------------------- 元件发射 ------------------------------- */

/** 与网页 part('quad') 一致的面板旋转：nx/ny/nz=面法线 → [90+δ, 90−φ, 0]（度） */
function rotFromNormal(n: Vec3): Vec3 {
  const ny = Math.max(-1, Math.min(1, n[1] ?? 0))
  if (Math.abs(ny) > 0.999) return [ny > 0 ? 0 : 180, 0, 0]
  const phi = Math.atan2(n[2] ?? 0, n[0] ?? 0) * 180 / Math.PI
  const delta = -Math.asin(ny) * 180 / Math.PI
  return [90 + delta, 90 - phi, 0]
}

function planeItemFromQuad(
  mesh: PanelMesh,
  faceIndex: number,
  partner: number,
  color: string | undefined,
  thickness: number,
  rotationMode: 'basis' | 'normal'
): PanelItem {
  // 四边形配对角：从两个三角各取非共享顶点，共享顶点对在 ti 内按出现序定为 A、C。
  // 标准格式 ti=(A,B,C)、pi=(A,C,D)：A=ti0、C=ti2、B=ti1（非共享）、D=pi 非共享顶点。
  const ti = triangleAt(mesh, faceIndex)
  const pi = triangleAt(mesh, partner)
  const shared = ti.filter((v) => pi.includes(v)) // 按 ti 内的出现序 = [共享0, 共享1]
  const B = ti.find((v) => !pi.includes(v))!
  const D = pi.find((v) => !ti.includes(v))!
  const [A, C] = [shared[0], shared[1]]
  const posA = mesh.vertices[A] as Vec3
  const posB = mesh.vertices[B] as Vec3
  const posC = mesh.vertices[C] as Vec3
  const posD = mesh.vertices[D] as Vec3
  const { widthDir, depthDir, normal, width, depth } = planeBasis(posA, posB, posD)
  const rotation = rotationMode === 'normal' ? rotFromNormal(normal) : basisToEulerYxz(widthDir, normal, depthDir)
  return {
    resourceId: PLANE_RESOURCE_ID,
    position: avg4(posA, posB, posC, posD),
    rotation,
    scale: [width || 1e-4, thickness, depth || 1e-4],
    ...(color === undefined ? {} : { color })
  }
}

function tetraItemFromTri(
  mesh: PanelMesh,
  faceIndex: number,
  color: string | undefined,
  thickness: number,
  rotationMode: 'basis' | 'normal'
): PanelItem {
  const [A, B, C] = trianglePositions(mesh, faceIndex)
  const { widthDir, depthDir, normal, width, depth } = planeBasis(A, B, C)
  const rotation = rotationMode === 'normal' ? rotFromNormal(normal) : basisToEulerYxz(widthDir, normal, depthDir)
  return {
    resourceId: TETRA_RESOURCE_ID,
    position: centroid(A, B, C),
    rotation,
    scale: [width || 1e-4, thickness, depth || 1e-4],
    ...(color === undefined ? {} : { color })
  }
}

function boxItemFromDegenerate(
  mesh: PanelMesh,
  faceIndex: number,
  color: string | undefined,
  thickness: number
): PanelItem {
  const [A, B, C] = trianglePositions(mesh, faceIndex)
  const extent = Math.max(len(sub(B, A)), len(sub(C, A)), len(sub(C, B)), 1e-4)
  return {
    resourceId: BOX_RESOURCE_ID,
    position: centroid(A, B, C),
    rotation: [0, 0, 0],
    scale: [extent, thickness, extent],
    ...(color === undefined ? {} : { color })
  }
}

/* ------------------------------- 主入口 ------------------------------- */

export function panelize(mesh: PanelMesh, opts: PanelizeOptions = {}): PanelizeResult {
  if (!Number.isInteger(mesh.faces.length / 3) || mesh.faces.length < 3) {
    throw new Error('[panelize] faces must contain one or more triangles (length % 3 === 0)')
  }
  const quadThickness = opts.quadThickness ?? DEFAULT_QUAD_THICKNESS
  const triThickness = opts.triThickness ?? DEFAULT_TRI_THICKNESS
  const boxThickness = opts.boxThickness ?? DEFAULT_BOX_THICKNESS
  const minArea = opts.minArea ?? DEFAULT_MIN_AREA
  const normalTol = opts.normalTolerance ?? DEFAULT_NORMAL_TOL
  const degenerateMode = opts.degenerate ?? 'box'
  const rotationMode = opts.rotationMode ?? 'basis'

  const faceCount = mesh.faces.length / 3
  const colors = mesh.colors ?? []
  const colorOf = (faceIndex: number): string | undefined => colors[faceIndex]

  const items: PanelItem[] = []
  const used = new Array<boolean>(faceCount).fill(false)
  let quads = 0
  let tris = 0
  let degenerate = 0

  // 第一遍：退化面逐个处理（固定顺序，先于配对）。
  for (let i = 0; i < faceCount; i++) {
    if (triangleArea(mesh, i) >= minArea) continue
    used[i] = true
    degenerate++
    if (degenerateMode === 'box') {
      items.push(boxItemFromDegenerate(mesh, i, colorOf(i), boxThickness))
    }
  }

  // 第二遍：配对（索引序优先）。对每个未用三角 i，取最小 j>i 且与 i 共边、法线一致的三角。
  for (let i = 0; i < faceCount; i++) {
    if (used[i]) continue
    let partner = -1
    const ti = triangleAt(mesh, i)
    const ni = triangleNormal(mesh, i)
    for (let j = i + 1; j < faceCount; j++) {
      if (used[j]) continue
      if (sharedEdge(ti, triangleAt(mesh, j)) === null) continue
      if (dot(ni, triangleNormal(mesh, j)) < normalTol) continue
      partner = j
      break // 索引序优先：取最小 j。
    }
    if (partner >= 0) {
      used[i] = true
      used[partner] = true
      quads++
      items.push(planeItemFromQuad(mesh, i, partner, colorOf(i), quadThickness, rotationMode))
    } else {
      used[i] = true
      tris++
      items.push(tetraItemFromTri(mesh, i, colorOf(i), triThickness, rotationMode))
    }
  }

  const usedUnits = items.length
  const stats: PanelizeStats = {
    faces: faceCount,
    quads,
    tris,
    degenerate,
    budget: { requested: null, used: usedUnits, exceeded: false }
  }
  if (opts.gateCheck) opts.gateCheck(stats)
  return { items, stats }
}

/**
 * 曲面项目面板化默认（AGENTS 铁律 #2）：rotationMode='normal'（与网页 part('quad')
 * 同款 rotFromNormal，保证网页=游戏）+ normalTolerance=0.2（高曲率区不再被默认 0.999
 * 拆成 10009006 三角尖刺）。export-mesh / contour-model 两条 CLI 统一走此入口，
 * 避免两处参数漂移；调用方仍可显式传 opts 覆盖个别项。
 */
export function panelizeMesh(mesh: PanelMesh, opts: PanelizeOptions = {}): PanelizeResult {
  return panelize(mesh, { rotationMode: 'normal', normalTolerance: 0.2, ...opts })
}

/**
 * 逐三角面颜色 → structure/gia 的颜色槽（enabled + rgb + opacity100 + overwrite）。
 *
 * 兼容网页 "#RRGGBB"（含 #RGB 简写）与既有 "0xRRGGBB"（1–6 位十六进制）三种写法，
 * 统一输出 0xRRGGBB 十进制整数（rgb）；非法输入抛中文错误（fail-closed）。
 */
export function colorStringToItemColor(
  hex: string | undefined
):
  | { enabled: true; rgb: number; opacity: number; overlay: 'overwrite' }
  | undefined {
  if (hex === undefined) return undefined
  let rgb: number
  if (/^0x[0-9a-fA-F]{1,6}$/.test(hex)) {
    rgb = Number.parseInt(hex.slice(2), 16)
  } else {
    const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex)
    if (m) {
      const body = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
      rgb = Number.parseInt(body, 16)
    } else {
      rgb = NaN
    }
  }
  if (Number.isNaN(rgb) || rgb < 0 || rgb > 0xffffff) {
    throw new Error(`[panelize] invalid color "${hex}" (expected "#RRGGBB" or "0xRRGGBB")`)
  }
  return { enabled: true, rgb, opacity: 100, overlay: 'overwrite' }
}
