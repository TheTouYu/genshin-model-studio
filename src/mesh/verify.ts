/**
 * verify.ts — 网格验证门禁（确定性，纯 TS，可单测）。
 *
 * 作用：导出前强制门禁。对「顶点 + 三角面索引 + 逐面颜色」网格做拓扑/几何校验，
 * 输出结构化结果（数量 + 定位 + 阈值），并把每个失败点转成可读中文（含定位：
 * 顶点坐标 / 面索引）。任何一项失败 ⇒ ok=false；门禁失败应拒绝导出。
 *
 * 与 02（panelize）的对接：
 *   - 门禁直接作用于原始网格（vertices/faces），几何检查与面板化产物一致
 *     （同一退化面判定 minArea、同一瘦长三角 minE/maxE 阈值）。
 *   - budget 检查消费 panelize 返回的 stats.budget.used（单元数）与 CLI --budget
 *     （requested）；门禁产出 budget{requested,used,exceeded,pass} 与逐条中文失败。
 *
 * 与 01/设计文档 §3.3 的对齐：
 *   - watertight：按索引统计每条边被三角引用次数；恰 2 次=闭合，1 次=开边/裂缝，
 *     >2 次=非流形。
 *   - seams/weld：对坐标接近但索引不同的顶点做近邻检测（容差可配），与索引闭合解耦。
 *   - normals outward：闭网格用「有向边一致性 + 逐连通分量有符号体积」判反向
 *     （替代会误报凹面体的全局质心点积）。
 *   - self-intersections：局部自交（Möller–Trumbore 边穿三角 + 均匀网格剪枝；
 *     排除相邻/退化/共面）；与绕序相互独立——一致绕序≠无自交。
 *   - degenerate：面积 < minArea（默认 1e-9）。
 *   - skinny：minE/maxE < 0.08（可配），占比 ≤ maxSkinnyPct（默认 5%）。
 *   - areaRatio：p95/p5（默认 ≤ 20，可配）。
 *   - budget：单元数 vs 预算 → exceeded（预算超限在导出前拦截）。
 *
 * 确定性契约：相同输入 + 相同 opts ⇒ 相同结果（拓扑遍历与统计均为确定性；
 * 采样只取前 maxSamples 个，坐标取整到 1e-6 保证定位稳定）。不修改输入网格。
 */

/** 三维向量。 */
export type Vec3 = [number, number, number]

/** 网格输入（与 panelize.ts 的 PanelMesh 承载语义一致）。 */
export type MeshVerifyInput = {
  vertices: number[][]
  /** 三角面索引，每 3 个 = 1 三角。 */
  faces: number[]
  colors?: string[]
}

/** 预算信息：requested 由 CLI --budget 给出（null=未设），used 由 panelize stats 给出。 */
export type BudgetInfo = {
  requested: number | null
  used: number
}

/** 门禁可选项（所有阈值均可配、均有明确默认）。 */
export type MeshVerifyOptions = {
  /** 顶点焊接容差（米）：坐标差 ≤ 此值视为同一位置（默认 2e-4）。 */
  weldTolerance?: number
  /** 退化面判定的最小面积（米²）。缺省 1e-9。 */
  minArea?: number
  /** 瘦长三角判据：minE/maxE < 此值（缺省 0.08）。 */
  skinnyEdgeRatio?: number
  /** 瘦长三角占比上限（%）。缺省 5。 */
  maxSkinnyPct?: number
  /** 面积比率 p95/p5 上限。缺省 20。 */
  maxAreaRatio?: number
  /** 预算：requested（null=未设）/ used（缺省用三角数估算，CLI 传入真实单元数）。 */
  budget?: BudgetInfo
  /** 每个检查最多采样定位数。缺省 5。 */
  maxSamples?: number
  /**
   * 多壳体装配模式（默认 false=单一水密壳语义）。
   *
   * 产品级装配件（机身 + 上盖 + 78 键 + 端口腔体…）由多个独立闭合/开放壳组成，
   * 壳间必然有开边与跨壳相交——这不是网格缺陷，而是装配语义。开启后：
   *   - watertight：开边/非流形仍统计并报告，但不判失败（装配件允许开边）
   *   - selfIntersections：仍统计，但不判失败（跨壳相交=结构堆叠）
   * 焊接 / 法线 / 退化 / 瘦三角 / 面积比 / 预算仍为硬门禁。
   */
  assembly?: boolean
}

/** 边采样定位：一条边的两个端点坐标。 */
export type PositionSample = { a: Vec3; b: Vec3 }
/** 面采样定位：面索引 + 面心坐标。 */
export type FaceSample = { faceIndex: number; position: Vec3 }
/** 自交采样定位：两个相交面（去相邻）各自的面心坐标。 */
export type IntersectionPairSample = { faceA: number; faceB: number; positionA: Vec3; positionB: Vec3 }

/** 门禁结果（机器可读，字段与设计 §3.3 对齐 + budget + selfIntersections）。 */
export type MeshVerifyResult = {
  ok: boolean
  checkedFaces: number
  checks: {
    watertight: { pass: boolean; openEdges: number; nonManifold: number; samplePositions: PositionSample[] }
    seams: { pass: boolean; seamCount: number; samplePositions: Vec3[] }
    normals: { pass: boolean; invertedCount: number; sampleFaces: FaceSample[] }
    degenerate: { count: number; pass: boolean }
    skinny: { count: number; pct: number; pass: boolean }
    areaRatio: { value: number; pass: boolean }
    budget: { requested: number | null; used: number; exceeded: boolean; pass: boolean }
    selfIntersections: { pass: boolean; intersectingPairs: number; samplePairs: IntersectionPairSample[] }
  }
  /** 可读中文失败原因，一个失败一条（含定位）。 */
  failures: string[]
  /** 装配模式下的非阻塞说明（统计项，不拦截）。 */
  notes?: string[]
}

const DEFAULT_WELD_TOL = 2e-4
const DEFAULT_MIN_AREA = 1e-9
const DEFAULT_SKINNY_EDGE_RATIO = 0.08
const DEFAULT_MAX_SKINNY_PCT = 5
const DEFAULT_MAX_AREA_RATIO = 20
const DEFAULT_MAX_SAMPLES = 5
const EPS = 1e-12
/** 线段-三角穿透测试的重心/参数边界容差（无量纲）：排除「共享顶点/共边处恰相触」的浮点假阳性。 */
const SEG_BC_EPS = 1e-7

/* ------------------------------- 几何原语 ------------------------------- */

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function len(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2])
}

function norm(a: Vec3): Vec3 {
  const l = len(a)
  if (l < EPS) return [0, 0, 0]
  return [a[0] / l, a[1] / l, a[2] / l]
}

function centroid(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
}

/** 坐标取整到 1e-6（保证定位字符串稳定、可对比）。 */
function roundPos(v: Vec3): Vec3 {
  return [
    Math.round(v[0] * 1e6) / 1e6,
    Math.round(v[1] * 1e6) / 1e6,
    Math.round(v[2] * 1e6) / 1e6
  ]
}

function fmtPos(v: Vec3): string {
  return `(${v[0]}, ${v[1]}, ${v[2]})`
}

/* ------------------------------- 输入解析 ------------------------------- */

function faceCountOf(faces: readonly number[]): number {
  if (faces.length % 3 !== 0) {
    throw new Error('[verify] faces length must be a multiple of 3 (one triangle per 3 indices)')
  }
  return faces.length / 3
}

function triangleIndices(faces: readonly number[], faceIndex: number): [number, number, number] {
  const a = faces[faceIndex * 3]
  const b = faces[faceIndex * 3 + 1]
  const c = faces[faceIndex * 3 + 2]
  return [a, b, c]
}

function trianglePositions(vertices: number[][], faces: readonly number[], faceIndex: number): [Vec3, Vec3, Vec3] {
  const [a, b, c] = triangleIndices(faces, faceIndex)
  for (const idx of [a, b, c]) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= vertices.length) {
      throw new Error(`[verify] faces[${faceIndex * 3}] index ${idx} out of range`)
    }
  }
  return [vertices[a] as Vec3, vertices[b] as Vec3, vertices[c] as Vec3]
}

function triangleArea(vertices: number[][], faces: readonly number[], faceIndex: number): number {
  const [a, b, c] = trianglePositions(vertices, faces, faceIndex)
  return 0.5 * len(cross(sub(b, a), sub(c, a)))
}

/** 一个三角的三条边（去重、忽略 a===a 退化边）。 */
function edgesOfTriangle(inds: readonly [number, number, number]): [number, number][] {
  const pairs: [number, number][] = [
    [inds[0], inds[1]],
    [inds[1], inds[2]],
    [inds[2], inds[0]]
  ]
  const out: [number, number][] = []
  const seen = new Set<string>()
  for (const [a, b] of pairs) {
    if (a === b) continue
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push([a, b])
  }
  return out
}

/* ------------------------------- 检查：watertight ------------------------------- */

function checkWatertight(vertices: number[][], faces: readonly number[], faceCount: number, maxSamples: number) {
  const edgeCount = new Map<string, { count: number; a: number; b: number }>()
  for (let fi = 0; fi < faceCount; fi++) {
    const inds = triangleIndices(faces, fi)
    for (const [a, b] of edgesOfTriangle(inds)) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      const cur = edgeCount.get(key)
      if (cur) cur.count++
      else edgeCount.set(key, { count: 1, a, b })
    }
  }
  let openEdges = 0
  let nonManifold = 0
  const openSamples: PositionSample[] = []
  const nonManifoldSamples: PositionSample[] = []
  for (const { count, a, b } of edgeCount.values()) {
    const av = roundPos(vertices[a] as Vec3)
    const bv = roundPos(vertices[b] as Vec3)
    if (count === 1) {
      openEdges++
      if (openSamples.length < maxSamples) openSamples.push({ a: av, b: bv })
    } else if (count > 2) {
      nonManifold++
      if (nonManifoldSamples.length < maxSamples) nonManifoldSamples.push({ a: av, b: bv })
    }
  }
  const samplePositions = [...openSamples, ...nonManifoldSamples]
  const pass = openEdges === 0 && nonManifold === 0
  return { pass, openEdges, nonManifold, samplePositions }
}

/* ------------------------------- 检查：seams / weld ------------------------------- */

function vertexDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** 近邻聚类：把坐标互为近邻（≤ tol）的顶点按传递闭包聚成组。 */
function findSeamClusters(vertices: number[][], tol: number): number[][] {
  const n = vertices.length
  const assigned = new Array<boolean>(n).fill(false)
  const clusters: number[][] = []
  for (let i = 0; i < n; i++) {
    if (assigned[i]) continue
    const cluster = [i]
    assigned[i] = true
    let expanded = true
    while (expanded) {
      expanded = false
      for (let j = 0; j < n; j++) {
        if (assigned[j]) continue
        if (cluster.some((idx) => vertexDistance(vertices[idx] as Vec3, vertices[j] as Vec3) <= tol)) {
          cluster.push(j)
          assigned[j] = true
          expanded = true
        }
      }
    }
    if (cluster.length > 1) clusters.push(cluster)
  }
  return clusters
}

function checkSeams(vertices: number[][], tol: number, maxSamples: number) {
  const clusters = findSeamClusters(vertices, tol)
  let seamCount = 0
  for (const cluster of clusters) seamCount += cluster.length - 1
  const samplePositions: Vec3[] = []
  for (const cluster of clusters) {
    if (samplePositions.length >= maxSamples) break
    samplePositions.push(roundPos(vertices[cluster[0]] as Vec3))
  }
  return { pass: seamCount === 0, seamCount, samplePositions }
}

/* ------------------------------- 检查：normals ------------------------------- */

/**
 * 法线/朝向检查 — 用「有向边一致性 + 逐连通分量有符号体积」替代全局质心点积。

 * 既有全局质心点积（面法线·(面心−质心)<0）对凹面体（如人体、环）会误报：
 *   凹面处面法线可合法指向质心，导致大量「假朝内」。
 * 新判定：
 *   1) 有向边一致性：闭流形每条边被两三角共享；一致绕序 ⇒ 两三角对同一条边
 *      走相反方向（fwd==bwd）。某三角形翻面 ⇒ 其边出现 fwd!=bwd → 该边相邻面被标记。
 *   2) 逐连通分量有符号体积：仅对「全分量一致」的闭合件用散度定理算体积；
 *      体积<0 ⇒ 整件反向朝内，整件所有非退化面标记为朝内；体积>0 ⇒ 朝外通过。
 *   （全分量反向属「一致但朝内」，有向边一致性无法识别，需体积判定。）
 * 守卫：仅在 watertight（闭网格）时强制；开放表面朝外语义不成立，作信息项。
 * 退化面不参与计数（交由 degenerate 检查）。
 */
function findFaceComponents(faces: readonly number[], faceCount: number): number[][] {
  // 面片通过共享边（无向）连通成同一连通分量。
  const parent = new Array<number>(faceCount)
  for (let i = 0; i < faceCount; i++) parent[i] = i
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] }
    return x
  }
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  const edgeOwner = new Map<string, number>()
  for (let fi = 0; fi < faceCount; fi++) {
    const inds = triangleIndices(faces, fi)
    for (const [a, b] of edgesOfTriangle(inds)) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      const owner = edgeOwner.get(key)
      if (owner === undefined) edgeOwner.set(key, fi)
      else union(owner, fi)
    }
  }
  const groups = new Map<number, number[]>()
  for (let fi = 0; fi < faceCount; fi++) {
    const root = find(fi)
    const arr = groups.get(root)
    if (arr) arr.push(fi)
    else groups.set(root, [fi])
  }
  return [...groups.values()]
}

/**
 * 一个连通分量（闭合子表面）的有符号体积（散度定理，对闭合面数学上平移不变）。
 * 用「分量顶点质心」作局部原点：若网格远离世界原点，世界坐标三重积会大数相消（灾难性抵消）
 * 导致符号/量级失真；减去局部原点后数值稳定且平移不变。
 */
function componentSignedVolume(vertices: number[][], faces: readonly number[], component: readonly number[]): number {
  const vertexSet = new Set<number>()
  for (const fi of component) {
    const [a, b, c] = triangleIndices(faces, fi)
    vertexSet.add(a); vertexSet.add(b); vertexSet.add(c)
  }
  let sx = 0, sy = 0, sz = 0
  for (const idx of vertexSet) { const v = vertices[idx] as Vec3; sx += v[0]; sy += v[1]; sz += v[2] }
  const n = vertexSet.size || 1
  const ox = sx / n, oy = sy / n, oz = sz / n
  let v = 0
  for (const fi of component) {
    const [a, b, c] = trianglePositions(vertices, faces, fi)
    const a0 = a[0] - ox, a1 = a[1] - oy, a2 = a[2] - oz
    const b0 = b[0] - ox, b1 = b[1] - oy, b2 = b[2] - oz
    const c0 = c[0] - ox, c1 = c[1] - oy, c2 = c[2] - oz
    v += (a0 * (b1 * c2 - b2 * c1) + a1 * (b2 * c0 - b0 * c2) + a2 * (b0 * c1 - b1 * c0)) / 6
  }
  return v
}

/** 一个连通分量的包围盒对角线（用于该分量自身的体积容差，避免全局尺度误判小分量）。 */
function componentBBoxDiag(vertices: number[][], faces: readonly number[], component: readonly number[]): number {
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity, mnZ = Infinity, mxZ = -Infinity
  for (const fi of component) {
    const [a, b, c] = trianglePositions(vertices, faces, fi)
    for (const p of [a, b, c]) {
      if (p[0] < mnX) mnX = p[0]; if (p[0] > mxX) mxX = p[0]
      if (p[1] < mnY) mnY = p[1]; if (p[1] > mxY) mxY = p[1]
      if (p[2] < mnZ) mnZ = p[2]; if (p[2] > mxZ) mxZ = p[2]
    }
  }
  const dx = mxX - mnX, dy = mxY - mnY, dz = mxZ - mnZ
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** 网格包围盒对角线长度（用于相对体积容差）。 */
function meshBoundingBoxDiag(vertices: number[][]): number {
  if (vertices.length === 0) return 0
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const v of vertices) {
    if (v[0] < minX) minX = v[0]
    if (v[0] > maxX) maxX = v[0]
    if (v[1] < minY) minY = v[1]
    if (v[1] > maxY) maxY = v[1]
    if (v[2] < minZ) minZ = v[2]
    if (v[2] > maxZ) maxZ = v[2]
  }
  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function checkNormals(
  vertices: number[][],
  faces: readonly number[],
  faceCount: number,
  minArea: number,
  enforce: boolean,
  maxSamples: number
) {
  // 守卫：朝外语义仅在闭合网格上成立；开放表面作信息项（不拦截）。
  if (!enforce) return { pass: true, invertedCount: 0, sampleFaces: [] as FaceSample[] }

  // 有向边一致性：每条无向边被引用 2 次且方向相反（fwd==bwd）。
  const fwd = new Map<string, number>()
  const bwd = new Map<string, number>()
  const edgeFaces = new Map<string, number[]>()
  for (let fi = 0; fi < faceCount; fi++) {
    const [a, b, c] = triangleIndices(faces, fi)
    for (const [x, y] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const key = x < y ? `${x}|${y}` : `${y}|${x}`
      if (x < y) fwd.set(key, (fwd.get(key) ?? 0) + 1)
      else bwd.set(key, (bwd.get(key) ?? 0) + 1)
      const arr = edgeFaces.get(key)
      if (arr) arr.push(fi)
      else edgeFaces.set(key, [fi])
    }
  }
  const flagged = new Set<number>()
  for (const [key, f] of fwd) {
    const b = bwd.get(key) ?? 0
    if (f !== b) for (const fi of edgeFaces.get(key) ?? []) flagged.add(fi)
  }

  // 逐连通分量有符号体积：仅对「无标记面（一致绕序）」的闭合件判定朝外/朝内。
  const components = findFaceComponents(faces, faceCount)
  for (const comp of components) {
    if (comp.some((fi) => flagged.has(fi))) continue // 绕序不一致，体积不可靠
    const vol = componentSignedVolume(vertices, faces, comp)
    // 逐分量尺度容差：用该分量自身包围盒而非全局 diag——多尺度网格中小分量的反向
    // 不会被全局（偏大）容差漏检；体积已用分量局部原点计算（平移不变）。
    const cDiag = componentBBoxDiag(vertices, faces, comp) || meshBoundingBoxDiag(vertices) || 1
    const cVolEps = 1e-9 * cDiag * cDiag * cDiag
    if (vol < -cVolEps) {
      // 整件一致但朝内（全反向）：标记该件全部非退化面。
      for (const fi of comp) {
        if (triangleArea(vertices, faces, fi) >= minArea) flagged.add(fi)
      }
    }
  }

  // 汇总标记面（排除退化面），按面索引升序，采样定位。
  const inverted: number[] = []
  for (const fi of Array.from(flagged).sort((x, y) => x - y)) {
    if (triangleArea(vertices, faces, fi) >= minArea) inverted.push(fi)
  }
  const sampleFaces: FaceSample[] = inverted.slice(0, maxSamples).map((fi) => {
    const [a, b, c] = trianglePositions(vertices, faces, fi)
    return { faceIndex: fi, position: roundPos(centroid(a, b, c)) }
  })
  return { pass: inverted.length === 0, invertedCount: inverted.length, sampleFaces }
}

/* ------------------------------- 检查：self-intersections ------------------------------- */

/**
 * 线段 p0→p1 是否穿过三角 t 内部（Möller–Trumbore）。
 * 保守：平行/共面（|det|<detEps，体积量纲）返回 false（共面由 coplanarTrianglesOverlap2D 判定）；
 * 要求穿透点严格落在三角内部（u,v 严格在 (0,1) 内、t 在 (0,1)），避免把「边界相触」误判为自交。
 */
function segmentIntersectsTriangle(p0: Vec3, p1: Vec3, t: Vec3[], detEps: number): boolean {
  const e1 = sub(t[1], t[0])
  const e2 = sub(t[2], t[0])
  const d = sub(p1, p0)
  const h = cross(d, e2)
  const det = dot(e1, h)
  if (Math.abs(det) < detEps) return false
  const inv = 1 / det
  const s = sub(p0, t[0])
  const u = inv * dot(s, h)
  if (u <= SEG_BC_EPS || u >= 1 - SEG_BC_EPS) return false
  const q = cross(s, e1)
  const v = inv * dot(d, q)
  if (v <= SEG_BC_EPS || u + v >= 1 - SEG_BC_EPS) return false
  const tt = inv * dot(e2, q)
  return tt > SEG_BC_EPS && tt < 1 - SEG_BC_EPS
}

/** 二维有向叉积符号（>0 逆时针，<0 顺时针）。 */
function orient2D(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

/** 两条二维线段是否严格内部相交（非端点相触）。 */
function segmentsProperlyCross(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const o1 = orient2D(a, b, c), o2 = orient2D(a, b, d), o3 = orient2D(c, d, a), o4 = orient2D(c, d, b)
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))
}

/** 二维点是否严格在三角内部（不含边界）。 */
function pointInTriangle2D(p: [number, number], a: [number, number], b: [number, number], c: [number, number]): boolean {
  const o1 = orient2D(a, b, p), o2 = orient2D(b, c, p), o3 = orient2D(c, a, p)
  return (o1 > 0 && o2 > 0 && o3 > 0) || (o1 < 0 && o2 < 0 && o3 < 0)
}

/** 共面三角在平面内是否有内部重叠（正面积交叠；边界相触不算）。 */
function coplanarTrianglesOverlap2D(A: Vec3[], B: Vec3[], normal: Vec3): boolean {
  const ax = Math.abs(normal[0]), ay = Math.abs(normal[1]), az = Math.abs(normal[2])
  const project = ax >= ay && ax >= az ? (p: Vec3): [number, number] => [p[1], p[2]]
    : ay >= az ? (p: Vec3): [number, number] => [p[0], p[2]]
    : (p: Vec3): [number, number] => [p[0], p[1]]
  const a1 = project(A[0]), a2 = project(A[1]), a3 = project(A[2])
  const b1 = project(B[0]), b2 = project(B[1]), b3 = project(B[2])
  const triA = [a1, a2, a3], triB = [b1, b2, b3]
  for (let i = 0; i < 3; i++) { const j = (i + 1) % 3
    for (let k = 0; k < 3; k++) { const l = (k + 1) % 3
      if (segmentsProperlyCross(triA[i], triA[j], triB[k], triB[l])) return true
    }
  }
  if (pointInTriangle2D(a1, b1, b2, b3) || pointInTriangle2D(a2, b1, b2, b3) || pointInTriangle2D(a3, b1, b2, b3)) return true
  if (pointInTriangle2D(b1, a1, a2, a3) || pointInTriangle2D(b2, a1, a2, a3) || pointInTriangle2D(b3, a1, a2, a3)) return true
  return false
}

/** 三角对局部尺度（两三角包围盒对角线），用于共面/平行守卫的量纲匹配（长度）。 */
function pairScale(A: Vec3[], B: Vec3[]): number {
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity, mnZ = Infinity, mxZ = -Infinity
  for (const p of [...A, ...B]) {
    if (p[0] < mnX) mnX = p[0]; if (p[0] > mxX) mxX = p[0]
    if (p[1] < mnY) mnY = p[1]; if (p[1] > mxY) mxY = p[1]
    if (p[2] < mnZ) mnZ = p[2]; if (p[2] > mxZ) mxZ = p[2]
  }
  const dx = mxX - mnX, dy = mxY - mnY, dz = mxZ - mnZ
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * 两个三角是否几何相交。
 * - 平行但不同平面：两平行面不相交 → false。
 * - 共面（同平面，within coordEps）：2D 平面重叠判定。
 * - 一般位置：任一三角的任一边穿过另一三角内部（Möller–Trumbore）。
 * coordEps 为长度量纲（共面平面距离容差）；detEps 为体积量纲（边-三角平行守卫）。
 */
function trianglesIntersect(A: Vec3[], B: Vec3[], coordEps: number, detEps: number): boolean {
  const nA = norm(cross(sub(A[1], A[0]), sub(A[2], A[0])))
  const nB = norm(cross(sub(B[1], B[0]), sub(B[2], B[0])))
  if (len(nA) < 1e-12 || len(nB) < 1e-12) return false // 退化
  const dA = dot(nA, A[0])
  const dB = dot(nB, B[0])
  if (Math.abs(dot(nA, nB)) > 1 - 1e-8) {
    let coplanar = true
    for (const p of B) if (Math.abs(dot(nA, p) - dA) > coordEps) { coplanar = false; break }
    if (coplanar) for (const p of A) if (Math.abs(dot(nB, p) - dB) > coordEps) { coplanar = false; break }
    if (coplanar) return coplanarTrianglesOverlap2D(A, B, nA)
    return false
  }
  for (let i = 0; i < 3; i++) { const j = (i + 1) % 3
    if (segmentIntersectsTriangle(A[i], A[j], B, detEps)) return true
    if (segmentIntersectsTriangle(B[i], B[j], A, detEps)) return true
  }
  return false
}

/**
 * 两三角是否共享一条边（≥2 个顶点）——只有共享边才算拓扑相邻；
 * 仅共享单顶点的两三角仍可能跨面相交，不计为相邻，须继续测几何。
 */
function facesShareEdge(ia: readonly [number, number, number], ib: readonly [number, number, number]): boolean {
  let shared = 0
  if (ia[0] === ib[0] || ia[0] === ib[1] || ia[0] === ib[2]) shared++
  if (ia[1] === ib[0] || ia[1] === ib[1] || ia[1] === ib[2]) shared++
  if (ia[2] === ib[0] || ia[2] === ib[1] || ia[2] === ib[2]) shared++
  return shared >= 2
}

/**
 * 局部自交检测：对同网格内「非共边」的三角对做几何相交测试（一般位置 Möller–Trumbore；
 * 共面 2D 重叠）。仅共享单顶点的三角对照测（可能跨面相交）。用均匀网格做候选对剪枝
 * （按三角包围盒落到单元格，包围盒重叠必有共享单元格，故不漏判），确定性输出。
 * 注意：自交与绕序**相互独立**——一致绕序≠无自交；二者是不同的检查（见 checks.normals vs
 * checks.selfIntersections）。
 */
function checkSelfIntersections(
  vertices: number[][],
  faces: readonly number[],
  faceCount: number,
  minArea: number,
  maxSamples: number
) {
  const boxes: { fi: number; min: Vec3; max: Vec3 }[] = []
  let bminX = Infinity, bminY = Infinity, bminZ = Infinity, bmaxX = -Infinity, bmaxY = -Infinity, bmaxZ = -Infinity
  for (let fi = 0; fi < faceCount; fi++) {
    if (triangleArea(vertices, faces, fi) < minArea) continue
    const [a, b, c] = trianglePositions(vertices, faces, fi)
    const mn: Vec3 = [Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1]), Math.min(a[2], b[2], c[2])]
    const mx: Vec3 = [Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1]), Math.max(a[2], b[2], c[2])]
    boxes.push({ fi, min: mn, max: mx })
    if (mn[0] < bminX) bminX = mn[0]
    if (mn[1] < bminY) bminY = mn[1]
    if (mn[2] < bminZ) bminZ = mn[2]
    if (mx[0] > bmaxX) bmaxX = mx[0]
    if (mx[1] > bmaxY) bmaxY = mx[1]
    if (mx[2] > bmaxZ) bmaxZ = mx[2]
  }
  if (boxes.length < 2) return { pass: true, intersectingPairs: 0, samplePairs: [] as IntersectionPairSample[] }
  const diag = Math.hypot(bmaxX - bminX, bmaxY - bminY, bmaxZ - bminZ) || 1
  const cellSize = Math.max(diag / 8, 1e-6)
  const cells = new Map<string, number[]>()
  const cellKey = (cx: number, cy: number, cz: number): string => `${cx}|${cy}|${cz}`
  for (const { fi, min, max } of boxes) {
    const cx0 = Math.floor((min[0] - bminX) / cellSize), cx1 = Math.floor((max[0] - bminX) / cellSize)
    const cy0 = Math.floor((min[1] - bminY) / cellSize), cy1 = Math.floor((max[1] - bminY) / cellSize)
    const cz0 = Math.floor((min[2] - bminZ) / cellSize), cz1 = Math.floor((max[2] - bminZ) / cellSize)
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) for (let cz = cz0; cz <= cz1; cz++) {
      const key = cellKey(cx, cy, cz)
      const arr = cells.get(key)
      if (arr) arr.push(fi)
      else cells.set(key, [fi])
    }
  }
  const seen = new Set<string>()
  let intersectingPairs = 0
  const samplePairs: IntersectionPairSample[] = []
  for (const tris of cells.values()) {
    for (let x = 0; x < tris.length; x++) for (let y = x + 1; y < tris.length; y++) {
      const i = tris[x], j = tris[y]
      const pk = i < j ? `${i}|${j}` : `${j}|${i}`
      if (seen.has(pk)) continue
      seen.add(pk)
      const ia = triangleIndices(faces, i)
      const ib = triangleIndices(faces, j)
      if (facesShareEdge(ia, ib)) continue
      const A = [vertices[ia[0]] as Vec3, vertices[ia[1]] as Vec3, vertices[ia[2]] as Vec3]
      const B = [vertices[ib[0]] as Vec3, vertices[ib[1]] as Vec3, vertices[ib[2]] as Vec3]
      // 逐对局部尺度：多尺度网格中小三角对不被全局偏大的容差误判（量纲匹配）。
      const s = pairScale(A, B) || 1
      if (trianglesIntersect(A, B, 1e-8 * s, 1e-11 * s * s * s)) {
        intersectingPairs++
        if (samplePairs.length < maxSamples) {
          const [a, b, c] = trianglePositions(vertices, faces, i)
          const [d, e, f] = trianglePositions(vertices, faces, j)
          samplePairs.push({ faceA: i, faceB: j, positionA: roundPos(centroid(a, b, c)), positionB: roundPos(centroid(d, e, f)) })
        }
      }
    }
  }
  return { pass: intersectingPairs === 0, intersectingPairs, samplePairs }
}

/* ------------------------------- 检查：degenerate / skinny / areaRatio ------------------------------- */

function collectAreas(vertices: number[][], faces: readonly number[], faceCount: number, minArea: number) {
  const areas: number[] = []
  let degenerate = 0
  for (let fi = 0; fi < faceCount; fi++) {
    const area = triangleArea(vertices, faces, fi)
    if (area < minArea) degenerate++
    else areas.push(area)
  }
  return { areas, degenerate }
}

function checkSkinny(
  vertices: number[][],
  faces: readonly number[],
  faceCount: number,
  minArea: number,
  ratioThreshold: number,
  maxPct: number
) {
  let skinny = 0
  let scored = 0
  for (let fi = 0; fi < faceCount; fi++) {
    const [a, b, c] = trianglePositions(vertices, faces, fi)
    if (triangleArea(vertices, faces, fi) < minArea) continue
    scored++
    const l1 = vertexDistance(a, b)
    const l2 = vertexDistance(b, c)
    const l3 = vertexDistance(c, a)
    const minE = Math.min(l1, l2, l3)
    const maxE = Math.max(l1, l2, l3)
    if (maxE > EPS && minE / maxE < ratioThreshold) skinny++
  }
  const pct = +(100 * skinny / Math.max(1, scored)).toFixed(2)
  return { count: skinny, pct, pass: pct <= maxPct }
}

function checkAreaRatio(areas: readonly number[], maxRatio: number) {
  if (areas.length === 0) return { value: 0, pass: true }
  const sorted = [...areas].sort((a, b) => a - b)
  const p5 = sorted[Math.floor(sorted.length * 0.05)] ?? 0
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
  const value = +(p95 / Math.max(p5, 1e-12)).toFixed(1)
  return { value, pass: value <= maxRatio }
}

/* ------------------------------- 主入口：单网格 ------------------------------- */

/** 验证单个网格；返回结构化结果 + 中文失败列表。 */
export function verifyMesh(mesh: MeshVerifyInput, opts: MeshVerifyOptions = {}): MeshVerifyResult {
  const vertices = mesh.vertices
  const faces = mesh.faces
  const faceCount = faceCountOf(faces)
  const minArea = opts.minArea ?? DEFAULT_MIN_AREA
  const weldTolerance = opts.weldTolerance ?? DEFAULT_WELD_TOL
  const skinnyEdgeRatio = opts.skinnyEdgeRatio ?? DEFAULT_SKINNY_EDGE_RATIO
  const maxSkinnyPct = opts.maxSkinnyPct ?? DEFAULT_MAX_SKINNY_PCT
  const maxAreaRatio = opts.maxAreaRatio ?? DEFAULT_MAX_AREA_RATIO
  const maxSamples = opts.maxSamples ?? DEFAULT_MAX_SAMPLES

  const watertight = checkWatertight(vertices, faces, faceCount, maxSamples)
  const seams = checkSeams(vertices, weldTolerance, maxSamples)
  const { areas, degenerate } = collectAreas(vertices, faces, faceCount, minArea)
  const normals = checkNormals(vertices, faces, faceCount, minArea, watertight.pass, maxSamples)
  const skinny = checkSkinny(vertices, faces, faceCount, minArea, skinnyEdgeRatio, maxSkinnyPct)
  const areaRatio = checkAreaRatio(areas, maxAreaRatio)
  const selfIntersections = checkSelfIntersections(vertices, faces, faceCount, minArea, maxSamples)

  const used = opts.budget?.used ?? faceCount
  const requested = opts.budget?.requested ?? null
  const exceeded = requested !== null && used > requested
  const budget = { requested, used, exceeded, pass: !exceeded }

  const failures: string[] = []
  const notes: string[] = []
  const assembly = opts.assembly === true
  if (!watertight.pass && assembly) {
    notes.push(
      `装配模式：开边 ${watertight.openEdges} 条、非流形边 ${watertight.nonManifold} 条` +
        `（多壳体装配件允许，仍统计）`
    )
  }
  if (!watertight.pass && !assembly) {
    const loc = watertight.samplePositions.length
      ? `（如边 ${fmtPos(watertight.samplePositions[0].a)}→${fmtPos(watertight.samplePositions[0].b)}）`
      : ''
    failures.push(`水密性未通过：开边 ${watertight.openEdges} 条、非流形边 ${watertight.nonManifold} 条${loc}`)
  }
  if (!seams.pass) {
    const loc = seams.samplePositions.length ? `（重复顶点 ${fmtPos(seams.samplePositions[0])}）` : ''
    failures.push(`存在未焊接顶点：${seams.seamCount} 处${loc}，请在容差 ${weldTolerance} 内焊接`)
  }
  if (!normals.pass) {
    const loc = normals.sampleFaces.length
      ? `（面 #${normals.sampleFaces[0].faceIndex}，位置 ${fmtPos(normals.sampleFaces[0].position)}）`
      : ''
    failures.push(`存在 ${normals.invertedCount} 个朝内的法线面（有向边不一致或分量朝内）${loc}`)
  }
  if (!selfIntersections.pass && assembly) {
    notes.push(`装配模式：跨壳/壳内相交 ${selfIntersections.intersectingPairs} 处（结构堆叠，仍统计）`)
  }
  if (!selfIntersections.pass && !assembly) {
    const loc = selfIntersections.samplePairs.length
      ? `（面 #${selfIntersections.samplePairs[0].faceA} 与 #${selfIntersections.samplePairs[0].faceB}）`
      : ''
    failures.push(`存在 ${selfIntersections.intersectingPairs} 处局部自交${loc}`)
  }
  if (degenerate > 0) {
    failures.push(`存在 ${degenerate} 个退化面（面积 < ${minArea}）`)
  }
  if (!skinny.pass) {
    failures.push(`瘦长三角 ${skinny.count} 个，占比 ${skinny.pct}%（阈值 ≤ ${maxSkinnyPct}%）`)
  }
  if (!areaRatio.pass) {
    failures.push(`面积比率 p95/p5 = ${areaRatio.value}（阈值 ≤ ${maxAreaRatio}）`)
  }
  if (!budget.pass) {
    failures.push(budgetFailure(requested, used))
  }

  return {
    ok: failures.length === 0,
    checkedFaces: faceCount,
    checks: {
      watertight,
      seams,
      normals,
      degenerate: { count: degenerate, pass: degenerate === 0 },
      skinny,
      areaRatio,
      budget,
      selfIntersections
    },
    failures,
    ...(notes.length ? { notes } : {})
  }
}

/** 预算超限的中文失败文案（供单网格与批量共用）。 */
export function budgetFailure(requested: number | null, used: number): string {
  return `面片/单元预算超限：需要 ${used} 个单元，预算 ${requested}，超出 ${used - (requested ?? 0)}`
}

/* ------------------------------- 批量入口：多网格导出门禁 ------------------------------- */

/**
 * 导出流水线门禁：对一组网格逐个做几何校验，并以「面板化单元数合计」为准做全局预算判定。
 *
 * @param meshes    输入网格列表（structure 里的每个 mesh item）。
 * @param units     每个网格经 panelize 产生的单元数（stats.budget.used）。
 * @param requested CLI --budget（null=未设预算）。
 * @param opts      几何阈值（weldTolerance/minArea/skinnyEdgeRatio/maxSkinnyPct/maxAreaRatio/maxSamples）。
 * @returns         合并后的单份门禁结果（全局 budget 判定，逐条中文失败）。
 */
export function verifyMeshExport(
  meshes: MeshVerifyInput[],
  units: number[],
  requested: number | null,
  opts: MeshVerifyOptions = {}
): MeshVerifyResult {
  if (meshes.length === 0) throw new Error('[verify] no mesh items to verify')
  const parts = meshes.map((m, i) => verifyMesh(m, { ...opts, budget: { requested: null, used: units[i] ?? 0 } }))

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const totalUnits = sum(units)
  const exceeded = requested !== null && totalUnits > requested
  const budget = { requested, used: totalUnits, exceeded, pass: !exceeded }

  const maxSamples = opts.maxSamples ?? DEFAULT_MAX_SAMPLES
  const take = <T>(arr: T[], n: number): T[] => arr.slice(0, n)

  const watertightOpen = sum(parts.map((p) => p.checks.watertight.openEdges))
  const watertightNonManifold = sum(parts.map((p) => p.checks.watertight.nonManifold))
  const watertight = {
    pass: parts.every((p) => p.checks.watertight.pass),
    openEdges: watertightOpen,
    nonManifold: watertightNonManifold,
    samplePositions: take(
      parts.flatMap((p) => p.checks.watertight.samplePositions),
      maxSamples
    )
  }

  const seamCount = sum(parts.map((p) => p.checks.seams.seamCount))
  const seams = {
    pass: parts.every((p) => p.checks.seams.pass),
    seamCount,
    samplePositions: take(
      parts.flatMap((p) => p.checks.seams.samplePositions),
      maxSamples
    )
  }

  const invertedCount = sum(parts.map((p) => p.checks.normals.invertedCount))
  const normals = {
    pass: parts.every((p) => p.checks.normals.pass),
    invertedCount,
    sampleFaces: take(
      parts.flatMap((p) => p.checks.normals.sampleFaces),
      maxSamples
    )
  }

  const degenerate = sum(parts.map((p) => p.checks.degenerate.count))
  const skinTotal = sum(parts.map((p) => p.checkedFaces))
  const skinny = {
    count: sum(parts.map((p) => p.checks.skinny.count)),
    pct: parts.reduce((a, p) => a + p.checkedFaces * p.checks.skinny.pct, 0) / Math.max(1, skinTotal),
    pass: parts.every((p) => p.checks.skinny.pass)
  }
  const areaRatio = {
    value: parts[0].checks.areaRatio.value,
    pass: parts.every((p) => p.checks.areaRatio.pass)
  }
  const selfIntersections = {
    pass: parts.every((p) => p.checks.selfIntersections.pass),
    intersectingPairs: sum(parts.map((p) => p.checks.selfIntersections.intersectingPairs)),
    samplePairs: take(
      parts.flatMap((p) => p.checks.selfIntersections.samplePairs),
      maxSamples
    )
  }

  // 逐条失败：先几何，后全局预算。
  const failures: string[] = []
  const notes: string[] = []
  const assembly = opts.assembly === true
  if (!watertight.pass && assembly) {
    notes.push(
      `装配模式：开边 ${watertight.openEdges} 条、非流形边 ${watertight.nonManifold} 条` +
        `（多壳体装配件允许，仍统计）`
    )
  }
  if (!watertight.pass && !assembly) {
    const loc = watertight.samplePositions.length
      ? `（如边 ${fmtPos(watertight.samplePositions[0].a)}→${fmtPos(watertight.samplePositions[0].b)}）`
      : ''
    failures.push(`水密性未通过：开边 ${watertight.openEdges} 条、非流形边 ${watertight.nonManifold} 条${loc}`)
  }
  if (!seams.pass) {
    const loc = seams.samplePositions.length ? `（重复顶点 ${fmtPos(seams.samplePositions[0])}）` : ''
    failures.push(`存在未焊接顶点：${seams.seamCount} 处${loc}，请在容差 ${opts.weldTolerance ?? DEFAULT_WELD_TOL} 内焊接`)
  }
  if (!normals.pass) {
    const loc = normals.sampleFaces.length
      ? `（面 #${normals.sampleFaces[0].faceIndex}，位置 ${fmtPos(normals.sampleFaces[0].position)}）`
      : ''
    failures.push(`存在 ${normals.invertedCount} 个朝内的法线面（有向边不一致或分量朝内）${loc}`)
  }
  if (!selfIntersections.pass && assembly) {
    notes.push(`装配模式：跨壳/壳内相交 ${selfIntersections.intersectingPairs} 处（结构堆叠，仍统计）`)
  }
  if (!selfIntersections.pass && !assembly) {
    const loc = selfIntersections.samplePairs.length
      ? `（面 #${selfIntersections.samplePairs[0].faceA} 与 #${selfIntersections.samplePairs[0].faceB}）`
      : ''
    failures.push(`存在 ${selfIntersections.intersectingPairs} 处局部自交${loc}`)
  }
  if (degenerate > 0) {
    failures.push(`存在 ${degenerate} 个退化面（面积 < ${opts.minArea ?? DEFAULT_MIN_AREA}）`)
  }
  if (!skinny.pass) {
    failures.push(
      `瘦长三角 ${skinny.count} 个，占比 ${skinny.pct.toFixed(2)}%（阈值 ≤ ${opts.maxSkinnyPct ?? DEFAULT_MAX_SKINNY_PCT}%）`
    )
  }
  if (!areaRatio.pass) {
    failures.push(`面积比率 p95/p5 = ${areaRatio.value}（阈值 ≤ ${opts.maxAreaRatio ?? DEFAULT_MAX_AREA_RATIO}）`)
  }
  if (!budget.pass) {
    failures.push(budgetFailure(requested, totalUnits))
  }

  return {
    ok: failures.length === 0,
    checkedFaces: skinTotal,
    checks: {
      watertight,
      seams,
      normals,
      degenerate: { count: degenerate, pass: degenerate === 0 },
      skinny,
      areaRatio,
      budget,
      selfIntersections
    },
    failures,
    ...(notes.length ? { notes } : {})
  }
}
