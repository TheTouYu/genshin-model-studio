/**
 * contour-loft.ts — 任意闭合轮廓环放样（确定性，纯 TS，可单测）。
 *
 * 目标：把「顶视轮廓（x,z）+ 侧视高度剖面」合成为一叠闭合截面环，再沿环序列蒙皮成
 * 水密 3D 网格（顶点 + 三角面索引 + 逐面颜色）。这是「像画画一样生成自定义多边形点」
 * 的正式入口：轮廓环 = Vec3[][200]，沿高度/路径序列组成四边带（loft strips）。
 *
 * 与既有路径（ganyu-lib.js 的 surface/loftMesh/profileLoft）的关系：本模块是通用 TS 版，
 * 输入直接吃「任意闭合轮廓环序列」；旧椭圆截面放样路径保持兼容，互不改写。
 *
 * 三个出口：
 *   - resampleClosedContour(pts, n)：闭合轮廓按弧长均匀重采样到 n 点。
 *   - ringsToMesh(rings, opts)：截面环序列 → 蒙皮网格 {vertices, faces, colors?}。
 *   - contourFromViews(topOutline, sideProfile, opts)：顶视 + 侧视剖面 → 截面环序列。
 *
 * 确定性契约：相同输入 + 相同 opts ⇒ 相同顶点/面/颜色（无随机、无时间戳）。
 * 坐标系：米；y 向上（地面 y=0）；x 左右、z 前后。
 */

/** 三维向量。 */
export type Vec3 = [number, number, number]

/** 逐环颜色带：按环参数 t ∈ [0,1]（第 0 环→末环）分区着色，color 为 "0xRRGGBB"。 */
export type ColorBand = { t0: number; t1: number; color: string }

/** 蒙皮选项（所有默认值明确、确定性）。 */
export type RingsToMeshOptions = {
  /** 目标环点数：环长不一致时按此重采样（缺省 200）。 */
  points?: number
  /** 逐环颜色带（按环参数 t 分区；缺省=无色，输出不带 colors）。 */
  colorBands?: ColorBand[]
  /** 封盖：'none' | 'first'(首环) | 'last'(末环) | 'both'；平顶盖三角扇，法线朝外闭合。缺省 'none'。 */
  cap?: 'none' | 'first' | 'last' | 'both'
  /** 环数上限：超过则抛中文错误（预算守卫）。 */
  ringCountLimit?: number
}

/** 蒙皮结果 = 网格数据（与 structure.ts 的 mesh item 承载语义一致）。 */
export type LoftMesh = {
  vertices: number[][]
  /** 三角面索引，每 3 个 = 1 三角。 */
  faces: number[]
  /** 逐三角面颜色（"0xRRGGBB"），仅在传入 colorBands 时给出。 */
  colors?: string[]
}

export const DEFAULT_RESAMPLE_POINTS = 200

const EPS = 1e-12

/* ------------------------------- 几何原语 ------------------------------- */

function sub(a: number[], b: number[]): number[] {
  return a.map((v, i) => v - b[i])
}

function cross(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function dot(a: number[], b: number[]): number {
  return a.reduce((acc, v, i) => acc + v * b[i], 0)
}

function len(v: number[]): number {
  return Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0)
}

/** 两点距离（跨任意维度）。 */
function dist(a: number[], b: number[]): number {
  return Math.hypot(...a.map((v, i) => v - b[i]))
}

function triangleCentroid(vertices: number[][], a: number, b: number, c: number): number[] {
  const pa = vertices[a]
  const pb = vertices[b]
  const pc = vertices[c]
  return [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3]
}

function triangleNormal(vertices: number[][], a: number, b: number, c: number): number[] {
  const n = cross(sub(vertices[b], vertices[a]), sub(vertices[c], vertices[a]))
  const l = len(n)
  return l < EPS ? [0, 0, 0] : [n[0] / l, n[1] / l, n[2] / l]
}

/** 点环（等长）质心 = 各点平均值（用于朝外判定）。 */
function ringCentroid(ring: number[][]): number[] {
  const n = ring.length
  if (n === 0) return [0, 0, 0]
  const acc = Array.from({ length: ring[0].length }, () => 0)
  for (const p of ring) for (let i = 0; i < acc.length; i++) acc[i] += p[i]
  return acc.map((v) => v / n)
}

/* ------------------------------- 输入校验 ------------------------------- */

function isFinitePoint(pt: unknown): pt is number[] {
  return (
    Array.isArray(pt) &&
    pt.length >= 2 &&
    pt.every((v) => typeof v === 'number' && Number.isFinite(v))
  )
}

/* ------------------------------- resampleClosedContour ------------------------------- */

/**
 * 闭合轮廓按弧长均匀重采样到 n 点。
 *
 * - 首点固定：输出[0] = 输入首点 pts[0]。
 * - 方向保持：沿输入绕向（最后一点连回第一点）顺序重采样。
 * - 非法输入抛中文错误：少于 3 点、点维度不足、总弧长≈0（退化/非闭合）。
 * - 输入若末尾重复首点（显式闭合点），先剔除再按闭合处理。
 *
 * @param pts 闭合轮廓点（每点至少 2 维，如 [x,z] 或 [x,y,z]）。
 * @param n   目标点数（缺省 200）。
 */
export function resampleClosedContour(pts: number[][], n: number = DEFAULT_RESAMPLE_POINTS): number[][] {
  if (!Array.isArray(pts) || pts.length < 3) {
    throw new Error('[contour-loft] 闭合轮廓至少需要 3 个点')
  }
  for (const pt of pts) {
    if (!isFinitePoint(pt)) {
      throw new Error('[contour-loft] 轮廓点必须是有限数数组（至少 2 维）')
    }
  }
  const dim = pts[0].length
  for (const pt of pts) {
    if (pt.length !== dim) throw new Error('[contour-loft] 轮廓点维度不一致')
  }
  if (!Number.isInteger(n) || n < 3) {
    throw new Error('[contour-loft] 目标点数 n 必须是 ≥ 3 的整数')
  }

  // 去除显式闭合重复点（首尾几乎重合）。
  let loop = pts
  if (dist(pts[0], pts[pts.length - 1]) < EPS) {
    loop = pts.slice(0, pts.length - 1)
    if (loop.length < 3) throw new Error('[contour-loft] 闭合轮廓至少需要 3 个点')
  }

  // 逐段弧长 + 累计。
  const segLens: number[] = []
  let total = 0
  for (let k = 0; k < loop.length; k++) {
    const a = loop[k]
    const b = loop[(k + 1) % loop.length]
    const d = dist(a, b)
    segLens.push(d)
    total += d
  }
  if (total < EPS) {
    throw new Error('[contour-loft] 轮廓退化（总弧长为 0），无法构成闭合环')
  }

  const out: number[][] = []
  let segIndex = 0
  let segStart = 0
  for (let k = 0; k < n; k++) {
    const target = (k * total) / n
    // 推进到目标所在的线段。
    while (segIndex < segLens.length - 1 && target > segStart + segLens[segIndex]) {
      segStart += segLens[segIndex]
      segIndex++
    }
    const segLen = segLens[segIndex]
    const t = segLen < EPS ? 0 : Math.min(1, Math.max(0, (target - segStart) / segLen))
    const a = loop[segIndex]
    const b = loop[(segIndex + 1) % loop.length]
    out.push(a.map((v, i) => v + (b[i] - v) * t))
  }
  return out
}

/* ------------------------------- ringsToMesh ------------------------------- */

/**
 * 截面环序列 → 蒙皮网格。
 *
 * - 相邻环逐段四边形 → 两三角（绕序一致）；法线取跨边叉积并统一朝外（相对环质心路径）。
 * - 环长一致直接蒙皮；不一致时按 opts.points 重采样对齐。
 * - opts.colorBands 按环参数 t ∈ [0,1] 分区着色（首环 t=0，末环 t=1）。
 * - opts.cap 平顶盖三角扇：'first'/'last'/'both' 使对应端闭合（水密、法线朝外）；
 *   'none'（缺省）为开放管面。
 *
 * @param rings 截面环序列（每环为闭合 Vec3[]）。
 */
export function ringsToMesh(rings: Vec3[][], opts: RingsToMeshOptions = {}): LoftMesh {
  if (!Array.isArray(rings) || rings.length < 2) {
    throw new Error('[contour-loft] 蒙皮至少需要 2 个截面环')
  }
  const ringCountLimit = opts.ringCountLimit
  if (ringCountLimit !== undefined && (ringCountLimit < 2 || !Number.isInteger(ringCountLimit))) {
    throw new Error('[contour-loft] ringCountLimit 必须是 ≥ 2 的整数')
  }
  if (ringCountLimit !== undefined && rings.length > ringCountLimit) {
    throw new Error(`[contour-loft] 截面环数量 ${rings.length} 超过上限 ${ringCountLimit}`)
  }
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 3) {
      throw new Error('[contour-loft] 每个截面环至少需要 3 个点（闭合）')
    }
    for (const pt of ring) {
      if (!isFinitePoint(pt) || pt.length !== 3) {
        throw new Error('[contour-loft] 截面环点必须为 3 维有限数 [x,y,z]')
      }
    }
  }

  const cap = opts.cap ?? 'none'
  if (cap !== 'none' && cap !== 'first' && cap !== 'last' && cap !== 'both') {
    throw new Error(`[contour-loft] cap 非法："${cap}"（应为 none/first/last/both）`)
  }

  // 环长统一：一致直接用；不一致按 opts.points 重采样。
  let normalized = rings
  const lengths = rings.map((r) => r.length)
  const allEqual = lengths.every((l) => l === lengths[0])
  if (!allEqual) {
    if (opts.points === undefined) {
      throw new Error(
        `[contour-loft] 截面环长度不一致（${lengths.join(', ')}）；请用 opts.points 统一重采样`
      )
    }
    normalized = rings.map((r) =>
      r.length === opts.points ? r : (resampleClosedContour(r, opts.points) as Vec3[])
    )
  }

  const ringN = normalized[0].length
  const R = normalized.length

  // 顶点表。
  const vertices: number[][] = []
  const idx: number[][] = []
  for (let i = 0; i < R; i++) {
    const base = vertices.length
    idx.push([])
    for (let j = 0; j < ringN; j++) {
      vertices.push(normalized[i][j] as number[])
      idx[i].push(base + j)
    }
  }

  const hasColors = (opts.colorBands ?? []).length > 0
  const colorBands = opts.colorBands ?? []

  /** 每面的环参数 t 颜色槽。 */
  function colorForT(t: number): string {
    for (const band of colorBands) {
      if (t >= band.t0 && t <= band.t1) return band.color
    }
    // 落在色带空档 / 边界外：取 t0 ≤ t 的最大色带；否则第一条色带。
    const floor = colorBands.filter((b) => b.t0 <= t).sort((a, b) => b.t0 - a.t0)[0]
    return (floor ?? colorBands[0]).color
  }

  // 构建三角（含颜色槽对齐）。先建侧壁（规范绕序），再建封盖，最后统一翻转。
  const triVert: number[][] = []
  const triColor: string[] = []

  function addTri(a: number, b: number, c: number, t: number): void {
    triVert.push([a, b, c])
    if (hasColors) triColor.push(colorForT(t))
  }

  // 侧壁：环 i 与 i+1 之间。
  for (let i = 0; i < R - 1; i++) {
    const t = i / Math.max(1, R - 1)
    for (let j = 0; j < ringN; j++) {
      const j2 = (j + 1) % ringN
      const a = idx[i][j]
      const b = idx[i][j2]
      const c = idx[i + 1][j]
      const d = idx[i + 1][j2]
      addTri(a, c, d, t)
      addTri(a, d, b, t)
    }
  }

  // 封盖：平面质心为顶点，三角扇朝外。
  let cap0Idx = -1
  let capLIdx = -1
  const capFirst = cap === 'first' || cap === 'both'
  const capLast = cap === 'last' || cap === 'both'
  if (capFirst) {
    const center = ringCentroid(normalized[0] as number[][])
    cap0Idx = vertices.length
    vertices.push(center)
    for (let j = 0; j < ringN; j++) addTri(cap0Idx, idx[0][j], idx[0][(j + 1) % ringN], 0)
  }
  if (capLast) {
    const center = ringCentroid(normalized[R - 1] as number[][])
    capLIdx = vertices.length
    vertices.push(center)
    for (let j = 0; j < ringN; j++) addTri(capLIdx, idx[R - 1][(j + 1) % ringN], idx[R - 1][j], 1)
  }

  // 统一朝外：取所有侧壁三角的 (法线·偏移) 之和；为负则整体翻转绕序（水密与颜色槽保持）。
  let orientationSum = 0
  const sideTriCount = 2 * (R - 1) * ringN
  const pathCentroid = ringCentroid(vertices)
  for (let t = 0; t < sideTriCount; t++) {
    const [a, b, c] = triVert[t]
    const normal = triangleNormal(vertices, a, b, c)
    const offset = sub(triangleCentroid(vertices, a, b, c), pathCentroid)
    orientationSum += dot(normal, offset)
  }
  if (orientationSum < 0) {
    for (const tri of triVert) {
      const tmp = tri[1]
      tri[1] = tri[2]
      tri[2] = tmp
    }
  }

  const faces: number[] = []
  for (const tri of triVert) faces.push(tri[0], tri[1], tri[2])
  return hasColors ? { vertices, faces, colors: triColor } : { vertices, faces }
}

/* ------------------------------- contourFromViews ------------------------------- */

/** 侧视高度剖面层。 */
export type SideProfileLevel = {
  /** 该环的 y 高度（米）。 */
  y: number
  /** 顶视轮廓的均匀缩放（x 与 z 同乘）。 */
  widthScale: number
  /** 该环中心的 z 平移（米，前后向）。缺省 0。 */
  centerZ?: number
}

/** contourFromViews 选项。 */
export type ContourFromViewsOptions = {
  /** 顶视轮廓重采样目标点数（缺省 200）。 */
  points?: number
}

/**
 * 顶视轮廓（x,z）+ 侧视高度剖面 → 截面环序列。
 *
 * 每高度层 = top 轮廓点集按 widthScale 缩放、z 按 centerZ 平移：
 *   ring[k] = [x_k * widthScale, y, z_k * widthScale + centerZ]
 *
 * 也支持直接传 rings（高级用法，跳过本函数）。
 */
export function contourFromViews(
  topOutline: number[][],
  sideProfile: SideProfileLevel[],
  opts: ContourFromViewsOptions = {}
): Vec3[][] {
  const points = opts.points ?? DEFAULT_RESAMPLE_POINTS
  if (!Array.isArray(topOutline) || topOutline.length < 3) {
    throw new Error('[contour-loft] 顶视轮廓至少需要 3 个点')
  }
  if (!Array.isArray(sideProfile) || sideProfile.length < 2) {
    throw new Error('[contour-loft] 侧视剖面至少需要 2 个高度层')
  }
  const outline = resampleClosedContour(
    topOutline.map((p) => [p[0], p[1]] as number[]),
    points
  )
  const levels: Required<SideProfileLevel>[] = sideProfile.map((lvl, index) => {
    if (typeof lvl?.y !== 'number' || !Number.isFinite(lvl.y)) {
      throw new Error(`[contour-loft] sideProfile[${index}].y 必须是有限数`)
    }
    if (typeof lvl?.widthScale !== 'number' || !Number.isFinite(lvl.widthScale)) {
      throw new Error(`[contour-loft] sideProfile[${index}].widthScale 必须是有限数`)
    }
    if (lvl.centerZ !== undefined && (typeof lvl.centerZ !== 'number' || !Number.isFinite(lvl.centerZ))) {
      throw new Error(`[contour-loft] sideProfile[${index}].centerZ 必须是有限数`)
    }
    return { y: lvl.y, widthScale: lvl.widthScale, centerZ: lvl.centerZ ?? 0 }
  })
  const rings: Vec3[][] = []
  for (const lvl of levels) {
    const ring = outline.map(([px, pz]) => [px * lvl.widthScale, lvl.y, pz * lvl.widthScale + lvl.centerZ] as Vec3)
    rings.push(ring)
  }
  return rings
}
