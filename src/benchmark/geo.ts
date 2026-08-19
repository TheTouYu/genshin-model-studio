/**
 * benchmark 几何核心：元件规范化 / AABB / 贪心匹配 / 变换 / 重力 / 支撑检查。
 *
 * 全部纯确定性代数，与模型无关（论文 §3.2 的"确定性校验器"在本项目域的对应物）。
 * 方向容错（论文"行翻/列翻取最优，不算加分"）：盒体绕 Y 的 k×90° 旋转与
 * 交换 scale.x/z 等价（AABB 相同），规范化后不计为错误。
 */
import type { StructureItem } from '../core/structure.js'

export const BOX_RESOURCE_ID = 10009001
export const CYLINDER_RESOURCE_ID = 10009008

/** 规范化吸附粒度：1e-3 米（远高于任务容差，低于 float32 精度损失量级）。 */
export const SNAP = 1e-3
/** 匹配位置容差（米）。 */
export const POS_TOL = 0.02
/** 匹配尺寸容差（米）。 */
export const SCALE_TOL = 0.02
/** 贴地/支撑接触容差（米）：与修复管线 SUPPORT_GAP 一致（空隙 ≤ 该值视为已支撑）。 */
export const CONTACT_EPS = 0.05
/** 贴地判定容差（底 y 距地面 ≤ 该值视为贴地）。 */
export const GROUND_EPS = 0.02

export type Vec3 = readonly [number, number, number]
export type Aabb = { min: Vec3; max: Vec3 }

/** 规范化后的元件：轴对齐（rotation=[0,0,0] 语义），数值吸附到 1e-3。 */
export type CanonicalItem = {
  resourceId: number
  position: Vec3
  scale: Vec3
  axisAligned: boolean
}

const snap = (v: number): number => Math.round(v * 1000) / 1000

/**
 * 规范化：
 * - 数值吸附 1e-3；
 * - 盒体绕 Y 的 k×90° 旋转 → 交换 scale.x/z（AABB 等价），rotation 归零；
 *   180° 不交换（AABB 相同）；
 * - 圆柱绕 Y 旋转不可见（scale 各向同性）→ rotation 归零；
 * - α/γ ≠ 0（绕 X/Z 旋转）→ 非轴对齐（axisAligned=false，保留原值供违规上报）。
 */
export function canonicalize(item: StructureItem): CanonicalItem {
  const position: Vec3 = [snap(item.position[0]), snap(item.position[1]), snap(item.position[2])]
  const rot: Vec3 = [snap(item.rotation[0]), snap(item.rotation[1]), snap(item.rotation[2])]
  let scale: Vec3 = [snap(item.scale[0]), snap(item.scale[1]), snap(item.scale[2])]
  const axisAligned = Math.abs(rot[0]) <= 1e-6 && Math.abs(rot[2]) <= 1e-6
  if (axisAligned && item.resourceId === BOX_RESOURCE_ID) {
    let beta = ((rot[1] % 360) + 360) % 360
    const k = Math.round(beta / 90)
    if (Math.abs(beta - k * 90) > 1e-6) {
      // β 不是 k×90°：盒体非轴对齐（注意 Math.round(0.5)=1，45° 会被误判为 90° 等价）
      return { resourceId: item.resourceId, position, scale, axisAligned: false }
    }
    const k4 = ((k % 4) + 4) % 4
    if (k4 === 1 || k4 === 3) scale = [scale[2], scale[1], scale[0]]
  }
  return { resourceId: item.resourceId, position, scale, axisAligned }
}

export function canonicalizeAll(items: readonly StructureItem[]): CanonicalItem[] {
  return items.map(canonicalize)
}

/** 轴对齐元件的 AABB；非轴对齐给出保守外接 AABB（仅用于粗略检查，匹配时不计）。 */
export function aabb(item: CanonicalItem): Aabb {
  const hx = item.scale[0] / 2
  const hy = item.scale[1] / 2
  const hz = item.scale[2] / 2
  if (!item.axisAligned) {
    const r = Math.max(hx, hy, hz)
    return {
      min: [item.position[0] - r, item.position[1] - r, item.position[2] - r],
      max: [item.position[0] + r, item.position[1] + r, item.position[2] + r]
    }
  }
  return {
    min: [item.position[0] - hx, item.position[1] - hy, item.position[2] - hz],
    max: [item.position[0] + hx, item.position[1] + hy, item.position[2] + hz]
  }
}

export const bottomY = (it: CanonicalItem): number => it.position[1] - it.scale[1] / 2
export const topY = (it: CanonicalItem): number => it.position[1] + it.scale[1] / 2

/** 排序键：resourceId + 位置 + 尺寸（规范化后）。 */
export function sortKey(item: CanonicalItem): string {
  return `${item.resourceId}|${item.position[0]},${item.position[1]},${item.position[2]}|${item.scale[0]},${item.scale[1]},${item.scale[2]}`
}

/**
 * 贪心匹配（成对版）：GT 与预测各自按 sortKey 排序后，为每个 GT 元件找最优未匹配预测元件
 * （resourceId 一致、位置/尺寸均在容差内、且 axisAligned 一致），取位置+尺寸误差最小者。
 * 返回匹配对（gtIndex → predIndex）。确定性：排序键唯一决定顺序。
 */
export function matchPairs(
  gt: readonly CanonicalItem[],
  pred: readonly CanonicalItem[],
  posTol = POS_TOL,
  scaleTol = SCALE_TOL
): { gtMatched: boolean[]; pairs: { gtIndex: number; predIndex: number }[] } {
  const predSorted = pred
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (sortKey(a.it) < sortKey(b.it) ? -1 : 1))
  const used = new Array(predSorted.length).fill(false)
  const gtMatched = new Array(gt.length).fill(false)
  const pairs: { gtIndex: number; predIndex: number }[] = []
  for (let g = 0; g < gt.length; g++) {
    const gIt = gt[g]
    let best = -1
    let bestErr = Infinity
    for (let i = 0; i < predSorted.length; i++) {
      if (used[i]) continue
      const p = predSorted[i].it
      if (p.resourceId !== gIt.resourceId) continue
      if (p.axisAligned !== gIt.axisAligned) continue
      const dx = Math.abs(p.position[0] - gIt.position[0])
      const dy = Math.abs(p.position[1] - gIt.position[1])
      const dz = Math.abs(p.position[2] - gIt.position[2])
      if (dx > posTol || dy > posTol || dz > posTol) continue
      const sx = Math.abs(p.scale[0] - gIt.scale[0])
      const sy = Math.abs(p.scale[1] - gIt.scale[1])
      const sz = Math.abs(p.scale[2] - gIt.scale[2])
      if (sx > scaleTol || sy > scaleTol || sz > scaleTol) continue
      const err = dx + dy + dz + sx + sy + sz
      if (err < bestErr) {
        bestErr = err
        best = i
      }
    }
    if (best >= 0) {
      used[best] = true
      gtMatched[g] = true
      pairs.push({ gtIndex: g, predIndex: predSorted[best].i })
    }
  }
  return { gtMatched, pairs }
}

/** 贪心匹配（计数版）：兼容简单用法。 */
export function matchItems(
  gt: readonly CanonicalItem[],
  pred: readonly CanonicalItem[],
  posTol = POS_TOL,
  scaleTol = SCALE_TOL
): number {
  return matchPairs(gt, pred, posTol, scaleTol).pairs.length
}

/** 元件级 IoU = 匹配数 / 并集数（论文逐格 IoU 的元件域对应物）。 */
export function itemIou(gtCount: number, predCount: number, matched: number): number {
  const union = gtCount + predCount - matched
  return union > 0 ? matched / union : 0
}

/** 绕 Y 轴旋转 90°（右手定则 (x,z)→(−z,x)）后平移 t，作用于整组元件。 */
export function rotateY90ThenTranslate(items: readonly StructureItem[], t: Vec3): StructureItem[] {
  return items.map((it) => ({
    ...it,
    position: [
      -it.position[2] + t[0],
      it.position[1] + t[1],
      it.position[0] + t[2]
    ] as Vec3,
    rotation: (it.rotation[1] + 90) % 360 === 0 ? [0, 0, 0] : ([0, it.rotation[1] + 90, 0] as Vec3),
    scale: it.scale
  }))
}

/** 中心点支撑规则：j 的顶面覆盖 item 底面中心（x,z）。 */
export function footprintCovers(supporter: CanonicalItem, cx: number, cz: number, eps = 1e-6): boolean {
  const b = aabb(supporter)
  return cx >= b.min[0] - eps && cx <= b.max[0] + eps && cz >= b.min[2] - eps && cz <= b.max[2] + eps
}

/** 底面投影重叠：item 底面与 supporter 顶面在 XZ 平面的 2D 投影相交（论文"屋顶横跨空心室内合法"）。 */
export function bottomFaceOverlaps(item: CanonicalItem, supporter: CanonicalItem, eps = 1e-6): boolean {
  if (!item.axisAligned || !supporter.axisAligned) return false
  const a = aabb(item)
  const b = aabb(supporter)
  return a.min[0] < b.max[0] - eps && a.max[0] > b.min[0] + eps && a.min[2] < b.max[2] - eps && a.max[2] > b.min[2] + eps
}

/** 任意点支撑：supporter 顶面与 item 底面在 XZ 投影重叠且竖直接触（容差内）。 */
export function supportsBottom(item: CanonicalItem, supporter: CanonicalItem, contactEps = CONTACT_EPS): boolean {
  if (!item.axisAligned || !supporter.axisAligned) return false
  if (Math.abs(topY(supporter) - bottomY(item)) > contactEps) return false
  return bottomFaceOverlaps(item, supporter)
}

/**
 * 确定性重力求解：每个元件沿 −Y 下落，底面碰到地面（y=0）或"覆盖其底面中心的
 * 最高支撑顶面"为止；迭代至稳定（最多 32 轮）。按底面 y 升序处理保证链式支撑
 * （上层落在刚下落的支撑上）。论文"按 (x,z) 列分解"的连续域对应物。
 */
export function gravitySolve(items: readonly CanonicalItem[]): {
  settled: CanonicalItem[]
  initialOverlap: boolean
} {
  const settled = items.map((it) => ({ ...it, position: [...it.position] as Vec3 }))
  let initialOverlap = false
  for (let i = 0; i < settled.length; i++) {
    for (let j = i + 1; j < settled.length; j++) {
      if (aabbOverlapVolume(settled[i], settled[j]) > 1e-9) initialOverlap = true
    }
  }
  const order = (): number[] =>
    settled
      .map((it, i) => ({ i, b: bottomY(it) }))
      .sort((p, q) => p.b - q.b)
      .map((p) => p.i)
  for (let iter = 0; iter < 32; iter++) {
    let moved = false
    for (const i of order()) {
      const it = settled[i]
      if (!it.axisAligned) continue
      const cx = it.position[0]
      const cz = it.position[2]
      let support = 0
      for (let j = 0; j < settled.length; j++) {
        if (j === i) continue
        const sj = settled[j]
        if (!sj.axisAligned) continue
        const bj = bottomY(sj)
        const tj = topY(sj)
        // 支撑面必须不高于底面（允许恰好贴住：tj == bottom 时差为 0，稳定不动）
        if (tj <= bottomY(it) + 1e-6 && tj > support && footprintCovers(sj, cx, cz)) support = tj
      }
      const newBottom = support
      if (Math.abs(newBottom - bottomY(it)) > 1e-9) {
        const h = it.scale[1]
        settled[i] = { ...it, position: [it.position[0], newBottom + h / 2, it.position[2]] }
        moved = true
      }
    }
    if (!moved) break
  }
  return { settled, initialOverlap }
}

export function aabbOverlapVolume(a: CanonicalItem, b: CanonicalItem): number {
  const A = aabb(a)
  const B = aabb(b)
  const w = Math.min(A.max[0], B.max[0]) - Math.max(A.min[0], B.min[0])
  const h = Math.min(A.max[1], B.max[1]) - Math.max(A.min[1], B.min[1])
  const d = Math.min(A.max[2], B.max[2]) - Math.max(A.min[2], B.min[2])
  return Math.max(0, w) * Math.max(0, h) * Math.max(0, d)
}

/** 支撑检查：每个元件的底面必须贴地（≤GROUND_EPS）或与某支撑体顶面竖直接触且投影重叠。 */
export function supportCheck(items: readonly CanonicalItem[], eps = CONTACT_EPS): CanonicalItem[] {
  const unsupported: CanonicalItem[] = []
  for (const it of items) {
    if (!it.axisAligned) {
      unsupported.push(it)
      continue
    }
    if (bottomY(it) <= eps) continue
    let ok = false
    for (const j of items) {
      if (j === it) continue
      if (supportsBottom(it, j, eps)) {
        ok = true
        break
      }
    }
    if (!ok) unsupported.push(it)
  }
  return unsupported
}
