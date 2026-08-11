/**
 * 二期画线建模：笔画拟合管线（矢量层，PRD 架构②）。
 *
 * 原始点 → 抽稀（Ramer-Douglas-Peucker，阈值自适应）→ 平滑（Chaikin 2 轮）
 * → 弧长均匀重采样 N 点 → 封闭检测。
 * 全部为确定性纯函数：相同输入 ⇒ 相同输出（无随机、无时间戳）。
 */
import type { Stroke } from './types.js'

export type Point = readonly [number, number]
export type Polyline = Point[]

/** 抽稀阈值 = 笔画包围盒对角线 × 该比例（自适应：大笔画允许更大偏差）。 */
export const RDP_EPSILON_RATIO = 0.005
/** 抽稀阈值下限（像素），避免极小笔画连噪声都不去。 */
export const RDP_EPSILON_MIN = 0.1
/** Chaikin 平滑轮数（PRD：迭代 2-3 轮）。 */
export const CHAIKIN_ROUNDS = 2
/** 封闭判定：首尾距离 < 包围盒对角线 × 该比例（3% 量级）。 */
export const CLOSED_DISTANCE_RATIO = 0.03

/** 拟合结果：弧长均匀重采样后的曲线 + 封闭标记。 */
export type FittedStroke = {
  id: string
  points: Polyline
  closed: boolean
}

function bounds(points: readonly Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/** 自适应抽稀阈值：笔画包围盒对角线的一定比例（带像素下限）。 */
export function adaptiveEpsilon(points: readonly Point[]): number {
  const { minX, minY, maxX, maxY } = bounds(points)
  const diagonal = Math.hypot(maxX - minX, maxY - minY)
  return Math.max(RDP_EPSILON_MIN, diagonal * RDP_EPSILON_RATIO)
}

/**
 * Ramer-Douglas-Peucker 抽稀：保留共线冗余点去除后、距弦超阈值的顶点。
 * 端点恒保留；epsilon 为点到弦的垂直距离阈值。
 */
export function simplifyRdp(points: readonly Point[], epsilon: number): Polyline {
  if (points.length <= 2) return points.map((p): Point => [p[0], p[1]])
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number]
    const [ax, ay] = points[start]
    const [bx, by] = points[end]
    const dx = bx - ax
    const dy = by - ay
    const lengthSq = dx * dx + dy * dy
    let maxDistance = -1
    let maxIndex = -1
    for (let i = start + 1; i < end; i++) {
      const [px, py] = points[i]
      let distance: number
      if (lengthSq === 0) {
        distance = Math.hypot(px - ax, py - ay)
      } else {
        const t = ((px - ax) * dx + (py - ay) * dy) / lengthSq
        distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
      }
      if (distance > maxDistance) {
        maxDistance = distance
        maxIndex = i
      }
    }
    if (maxDistance > epsilon && maxIndex !== -1) {
      keep[maxIndex] = 1
      stack.push([start, maxIndex], [maxIndex, end])
    }
  }
  const out: Polyline = []
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push([points[i][0], points[i][1]])
  }
  return out
}

/** Chaikin 角切平滑：每段按 1/4–3/4 切角；开曲线端点恒保留。 */
export function smoothChaikin(points: readonly Point[], rounds = CHAIKIN_ROUNDS): Polyline {
  let poly: Polyline = points.map((p): Point => [p[0], p[1]])
  for (let round = 0; round < rounds; round++) {
    if (poly.length < 3) break
    const next: Polyline = [[poly[0][0], poly[0][1]]]
    for (let i = 0; i + 1 < poly.length; i++) {
      const [ax, ay] = poly[i]
      const [bx, by] = poly[i + 1]
      next.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by])
      next.push([0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by])
    }
    const last = poly[poly.length - 1]
    next.push([last[0], last[1]])
    poly = next
  }
  return poly
}

/**
 * 弧长均匀重采样到 count 个点（首尾恒为原曲线端点，中间点按累计弧长线性插值）。
 */
export function resampleUniform(points: readonly Point[], count: number): Polyline {
  const n = Math.max(1, Math.floor(count))
  if (points.length === 0) return []
  if (n === 1) return [[points[0][0], points[0][1]]]
  const cumulative: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    cumulative.push(
      cumulative[i - 1] +
        Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    )
  }
  const total = cumulative[cumulative.length - 1]
  if (total === 0) {
    // 全点重合的退化笔画：返回同一位置 count 个点（后续几何层自行丢弃零长段）。
    const [x, y] = points[0]
    return Array.from({ length: n }, (): Point => [x, y])
  }
  const out: Polyline = []
  let segment = 0
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      // 末点 = 原曲线终点（避免 a + (b−a) 的浮点回舍引入 1ulp 偏差）
      const [lx, ly] = points[points.length - 1]
      out.push([lx, ly])
      break
    }
    const target = (total * i) / (n - 1)
    while (segment < cumulative.length - 2 && cumulative[segment + 1] < target) segment++
    const segStart = cumulative[segment]
    const segEnd = cumulative[segment + 1]
    const t = segEnd > segStart ? (target - segStart) / (segEnd - segStart) : 0
    out.push([
      points[segment][0] + t * (points[segment + 1][0] - points[segment][0]),
      points[segment][1] + t * (points[segment + 1][1] - points[segment][1])
    ])
  }
  return out
}

/** 封闭检测：首尾距离 < 包围盒对角线 × ratio（默认 3% 量级）。 */
export function detectClosed(points: readonly Point[], ratio = CLOSED_DISTANCE_RATIO): boolean {
  if (points.length < 3) return false
  const { minX, minY, maxX, maxY } = bounds(points)
  const diagonal = Math.hypot(maxX - minX, maxY - minY)
  if (diagonal <= 0) return false
  const first = points[0]
  const last = points[points.length - 1]
  return Math.hypot(first[0] - last[0], first[1] - last[1]) < diagonal * ratio
}

/**
 * 单笔画完整拟合管线。sampleCount 为均匀重采样的目标点数。
 * 笔画点数 < 2 时返回 null（该笔画不产生元件）。
 */
export function fitStroke(stroke: Stroke, sampleCount: number): FittedStroke | null {
  if (stroke.points.length < 2) return null
  let poly = simplifyRdp(stroke.points, adaptiveEpsilon(stroke.points))
  poly = smoothChaikin(poly)
  if (poly.length < 2) return null
  poly = resampleUniform(poly, sampleCount)
  return { id: stroke.id, points: poly, closed: detectClosed(poly) }
}
