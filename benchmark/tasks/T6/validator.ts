/**
 * T6 摩天轮（复杂自由生成）—— 自创复杂任务（非抄袭项目已有风扇）。
 * 校验方式：items 级确定性结构不变量（无真值）：
 *   环识别（按到轮心距离聚类）/ 吊舱均布 / 支架贴地支撑 / 对称 / 比例 / 无穿模。
 * 轮心由支架杆顶端推导（两杆顶平均）；环段/吊舱围绕轮心判定。
 */
import type { StructureItem } from '../../../src/core/structure.js'
import type { ResolvedStructure } from '../../../src/core/structure.js'
import type { ValidationResult } from '../../../src/benchmark/types.js'
import { aabb, canonicalize, canonicalizeAll } from '../../../src/benchmark/geo.js'

type CItem = ReturnType<typeof canonicalizeAll>[number]

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))
const dist2d = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(a[0] - b[0], a[2] - b[2])

/** 圆柱段方向（局部 Y 轴世界方向，extrudeRod 约定 R=Ry(β)·Rx(α)，rotation=[α,β,0] 度）。 */
function segDir(rotation: readonly number[]): [number, number, number] {
  const ar = (rotation[0] * Math.PI) / 180
  const br = (rotation[1] * Math.PI) / 180
  const sa = Math.sin(ar)
  const ca = Math.cos(ar)
  return [Math.sin(br) * sa, ca, Math.cos(br) * sa]
}

/**
 * 支架杆识别：extrude 模式把每笔重采样为 count 段小圆柱（首尾相连成直线），
 * 因此"杆"在 items 层是段序列——按"共线 + 端点相连"聚类，簇 = 一根杆。
 * 输入原始 StructureItem（含 rotation，规范化会丢弃它）。
 */
function findPoles(items: readonly StructureItem[]): { pole: StructureItem[]; tip: { x: number; y: number; z: number } }[] {
  // 细段候选：圆柱、截面 ≤ 0.15。
  // 兼容两种形态：extrude 段序列（段长 ≤ 0.15，多段首尾相连成杆）与
  // 直线优化后的单根长杆（段长 > 0.15，自身即一根杆）。
  const segs: StructureItem[] = items.filter(
    (c) =>
      c.resourceId === 10009008 &&
      Math.max(c.scale[0], c.scale[2]) <= 0.15 &&
      c.scale[1] > 0
  )
  const n = segs.length
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  const union = (a: number, b: number): void => {
    parent[find(a)] = find(b)
  }
  const ends = segs.map((c) => {
    const d = segDir(c.rotation)
    const half = c.scale[1] / 2
    return {
      a: [c.position[0] - d[0] * half, c.position[1] - d[1] * half, c.position[2] - d[2] * half],
      b: [c.position[0] + d[0] * half, c.position[1] + d[1] * half, c.position[2] + d[2] * half]
    }
  })
  const connected = (i: number, j: number): boolean => {
    const di = segDir(segs[i].rotation)
    const dj = segDir(segs[j].rotation)
    const dot = Math.abs(di[0] * dj[0] + di[1] * dj[1] + di[2] * dj[2])
    if (dot < 0.98) return false
    let best = Infinity
    for (const p of [ends[i].a, ends[i].b]) {
      for (const q of [ends[j].a, ends[j].b]) {
        const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
        if (d < best) best = d
      }
    }
    return best < 0.12
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (connected(i, j)) union(i, j)
    }
  }
  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(i)
  }
  const poles: { pole: StructureItem[]; tip: { x: number; y: number; z: number } }[] = []
  for (const idxs of groups.values()) {
    const list = idxs.map((i) => segs[i])
    const hasLong = list.some((c) => c.scale[1] > 0.15)
    if (idxs.length < 3 && !hasLong) continue // 孤立细段（环段/轴盘等）不是杆；单根长杆自身即杆
    // 簇沿主方向的跨度：用**端点**投影（单根长杆簇的中心点投影 span=0 会误跳过）
    const d = segDir(list[0].rotation)
    const proj = list.flatMap((c) => {
      const half = c.scale[1] / 2
      const p = c.position[0] * d[0] + c.position[1] * d[1] + c.position[2] * d[2]
      return [p - half, p + half]
    })
    const span = Math.max(...proj) - Math.min(...proj)
    if (span < 0.35) continue
    // 簇底端（世界 y 最小端点）贴地；顶端 = y 最大端点
    let minY = Infinity
    let tip: { x: number; y: number; z: number } | null = null
    let maxY = -Infinity
    for (const c of list) {
      const e = ends[segs.indexOf(c)]
      for (const p of [e.a, e.b]) {
        if (p[1] < minY) minY = p[1]
        if (p[1] > maxY) {
          maxY = p[1]
          tip = { x: p[0], y: p[1], z: p[2] }
        }
      }
    }
    if (minY > 0.05) continue // 不贴地 → 不是支架杆
    poles.push({ pole: list, tip: tip! })
  }
  return poles
}

export function validate(structure: ResolvedStructure): ValidationResult {
  const can = canonicalizeAll(structure.items)
  const violations: string[] = []

  // ---- 健康检查（结构级） ----
  let healthy = 1
  let axisAlignedCount = 0
  for (const c of can) {
    if (c.scale.some((s) => s <= 0)) {
      violations.push(`非正尺度：${JSON.stringify(c)}`)
      healthy = 0
    }
    // 入地检查只对轴对齐部件用精确底（斜杆/斜梁是合法设计，其贴地由端点支撑检查覆盖；
    // 非轴对齐的外接 AABB 会保守误报）
    if (c.axisAligned && c.position[1] - c.scale[1] / 2 < -0.01) {
      violations.push(`元件入地（底 y=${(c.position[1] - c.scale[1] / 2).toFixed(3)}）：${JSON.stringify(c)}`)
      healthy = 0
    }
    if (c.axisAligned) axisAlignedCount++
  }

  // ---- 支架杆识别（段序列聚类）→ 轮心（两阶段：杆顶粗推 → 环段 y 中位数修正） ----
  const poles = findPoles(structure.items)
  let wheelCenter: { x: number; y: number; z: number } | null = null
  if (poles.length >= 2) {
    const yAvg = poles.reduce((s, p) => s + p.tip.y, 0) / poles.length
    const xAvg = poles.reduce((s, p) => s + p.tip.x, 0) / poles.length
    const zAvg = poles.reduce((s, p) => s + p.tip.z, 0) / poles.length
    const coarse = { x: xAvg, y: yAvg, z: zAvg }
    // 阶段 2：轮心 y 修正——杆顶可能略低于环平面（支架顶支撑在轮心高度"附近"），
    // 用环段（细圆柱、3D 距离 ∈ [0.25, 1.15]）的 y **中位数**修正环平面高度。
    // 注意不能用众数：环段均匀分布在圆上，y 的概率密度在轮圈顶部/底部最大（sin 分布两端密）。
    const poleSegSet0 = new Set<StructureItem>(poles.flatMap((p) => p.pole))
    const d3 = (p: readonly number[]): number =>
      Math.hypot(p[0] - coarse.x, p[1] - coarse.y, p[2] - coarse.z)
    const yValues: number[] = []
    for (let i = 0; i < can.length; i++) {
      const c = can[i]
      if (poleSegSet0.has(structure.items[i])) continue
      if (c.resourceId !== 10009008 || Math.max(c.scale[0], c.scale[2]) > 0.06) continue
      if (c.scale[1] > 0.15) continue
      const d = d3(c.position)
      if (d < 0.25 || d > 1.15) continue
      yValues.push(c.position[1])
    }
    let bestY = coarse.y
    if (yValues.length >= 4) {
      yValues.sort((a, b) => a - b)
      const mid = Math.floor(yValues.length / 2)
      // 偶数个数取中间两值平均（单点取高侧会引入系统性偏差，如 1.262 vs 1.25）
      bestY = yValues.length % 2 === 0 ? (yValues[mid - 1] + yValues[mid]) / 2 : yValues[mid]
    }
    wheelCenter = { x: coarse.x, y: bestY, z: coarse.z }
  }
  const W = wheelCenter

  // ---- 环段/吊舱/轴分类 ----
  let rimCount = 0
  let rimR = 0
  let rimCover = 0
  let rim: CItem[] = [] // 环带集合（提升到函数级：环段分类与穿模检查共用）
  let uBasis: number[] | null = null // 轮平面正交基（环覆盖/吊舱均布共用）
  let vBasis: number[] | null = null
  const pods: CItem[] = []
  const podRotations: number[][] = [] // 吊舱原始 rotation（canonicalize 会丢弃）
  let axle: CItem | null = null
  // 支架杆段集合（环段/轴/吊舱分类都要排除它）
  const poleSegSet = new Set<StructureItem>(poles.flatMap((p) => p.pole))
  if (W !== null) {
    // 环段：细圆柱（非支架杆段），3D 距离到轮心 ∈ [0.25, 1.15] → 距离众数半径。
    // 轮圈在竖直平面：环段 y 覆盖整个轮圈（0.5~2.1），不能用 y 容差；3D 距离才是环段特征。
    const dist3dW = (p: readonly number[]): number =>
      Math.hypot(p[0] - W.x, p[1] - W.y, p[2] - W.z)
    const bins = new Map<number, CItem[]>()
    for (let i = 0; i < can.length; i++) {
      const c = can[i]
      if (poleSegSet.has(structure.items[i])) continue
      if (c.resourceId !== 10009008) continue
      if (Math.max(c.scale[0], c.scale[2]) > 0.06) continue
      if (c.scale[1] > 0.15) continue // 环段是短弧段；轴等长杆排除
      const d = dist3dW(c.position)
      if (d < 0.25 || d > 1.15) continue
      const bin = Math.round(d * 20) / 20
      if (!bins.has(bin)) bins.set(bin, [])
      bins.get(bin)!.push(c)
    }
    let bestBin = 0
    let bestCount = 0
    for (const [bin, list] of bins) {
      if (list.length > bestCount) {
        bestCount = list.length
        bestBin = bin
      }
    }
    // 环带集合：|3D 距离 − r| ≤ 0.12（前后环 z 偏移 ±0.06 + 轮心推导偏差容差）
    if (bestCount > 0) {
      rim = can.filter(
        (c, i) =>
          !poleSegSet.has(structure.items[i]) &&
          c.resourceId === 10009008 &&
          Math.max(c.scale[0], c.scale[2]) <= 0.06 &&
          c.scale[1] <= 0.15 &&
          Math.abs(dist3dW(c.position) - bestBin) <= 0.12
      )
    }
    rimCount = rim.length
    rimR = bestBin
    // 轮平面正交基：u = 轮心→某环段方向；v = 法线×u（环可能在任意竖直平面，水平面角度会失真）
    if (rim.length >= 2) {
      const p0 = rim[0].position
      let p1: readonly number[] | null = null
      for (const r of rim) {
        if (Math.hypot(r.position[0] - p0[0], r.position[1] - p0[1], r.position[2] - p0[2]) > 0.3) {
          p1 = r.position
          break
        }
      }
      if (p1 !== null) {
        const d0 = [p0[0] - W.x, p0[1] - W.y, p0[2] - W.z]
        const d1 = [p1[0] - W.x, p1[1] - W.y, p1[2] - W.z]
        const l0 = Math.hypot(d0[0], d0[1], d0[2])
        const n = [d0[1] * d1[2] - d0[2] * d1[1], d0[2] * d1[0] - d0[0] * d1[2], d0[0] * d1[1] - d0[1] * d1[0]]
        const ln = Math.hypot(n[0], n[1], n[2])
        if (l0 > 0.01 && ln > 0.01) {
          uBasis = [d0[0] / l0, d0[1] / l0, d0[2] / l0]
          const nx = n[0] / ln
          const ny = n[1] / ln
          const nz = n[2] / ln
          vBasis = [ny * uBasis[2] - nz * uBasis[1], nz * uBasis[0] - nx * uBasis[2], nx * uBasis[1] - ny * uBasis[0]]
        }
      }
    }
    if (rimCount > 0) {
      const wheelAngle = (p: readonly number[]): number => {
        if (uBasis === null || vBasis === null) return Math.atan2(p[2] - W.z, p[0] - W.x)
        const dx = p[0] - W.x
        const dy = p[1] - W.y
        const dz = p[2] - W.z
        return Math.atan2(dx * vBasis[0] + dy * vBasis[1] + dz * vBasis[2], dx * uBasis[0] + dy * uBasis[1] + dz * uBasis[2])
      }
      const angles = rim.map((c) => wheelAngle(c.position))
      angles.sort((a, b) => a - b)
      let cover = 0
      for (let i = 0; i < angles.length; i++) {
        const next = angles[(i + 1) % angles.length]
        let gap = next - angles[i]
        if (i === angles.length - 1) gap += 2 * Math.PI
        if (gap > cover) cover = gap
      }
      // 环完整性：最大间隙 ≤ 12°（≈48 段连续环）即视为完整；更大间隙按比例扣
      const FULL_GAP = (12 * Math.PI) / 180
      rimCover = cover <= FULL_GAP ? 1 : Math.max(0, 1 - (cover - FULL_GAP) / (2 * Math.PI - FULL_GAP))
    }
    // 轴：轮心附近（水平 ≤ 0.15、y ≈ 轮心 y）的非支架杆元件
    for (let i = 0; i < can.length; i++) {
      const c = can[i]
      if (poleSegSet.has(structure.items[i])) continue
      if (Math.hypot(c.position[0] - W.x, c.position[2] - W.z) > 0.15) continue
      if (Math.abs(c.position[1] - W.y) > 0.2) continue
      axle = c
      break
    }
    // 吊舱：盘状（y 向薄 ≤ 0.35），到轮心的 3D 距离 ≈ r（±0.25）；
    // 排除环段（细圆柱特征，不依赖距离容差——z 偏移/轮心偏差会使 3D 距离变化）、轴、支架杆段
    const dist3d = (p: readonly number[]): number =>
      Math.hypot(p[0] - W.x, p[1] - W.y, p[2] - W.z)
    for (let i = 0; i < can.length; i++) {
      const c = can[i]
      if (poleSegSet.has(structure.items[i])) continue
      if (c.scale[1] > 0.35) continue
      const d = dist3d(c.position)
      if (d < rimR - 0.25 || d > rimR + 0.25) continue
      if (d <= 0.15) continue // 轴
      if (c.resourceId === 10009008 && Math.max(c.scale[0], c.scale[2]) <= 0.06) continue // 环段（细圆柱）
      pods.push(c)
      podRotations.push([...structure.items[i].rotation])
    }
    if (rimCount === 0) violations.push('未识别到轮环（细圆柱环段数不足）')
    if (pods.length < 4) violations.push(`吊舱数量 ${pods.length} < 4（要求 6）`)
  } else {
    violations.push('未识别到支架杆（≥2 根细长圆柱、底贴地）——无法确定轮心')
  }

  // ---- 支架检查（簇 = 一根杆） ----
  let poleScore = 0
  if (poles.length >= 2) {
    const clusterBottom = (p: (typeof poles)[number]): number => {
      let minY = Infinity
      for (const s of p.pole) {
        const b = aabb(canonicalize(s))
        if (b.min[1] < minY) minY = b.min[1]
      }
      return minY
    }
    const grounded = poles.filter((p) => clusterBottom(p) <= 0.05).length
    const topClose = poles.filter((p) => Math.abs(p.tip.y - W!.y) <= 0.25).length
    const bottoms = poles.map((p) => {
      let bx = 0
      let bz = 0
      let minY = Infinity
      for (const s of p.pole) {
        const b = aabb(canonicalize(s))
        if (b.min[1] < minY) {
          minY = b.min[1]
          bx = s.position[0]
          bz = s.position[2]
        }
      }
      return [bx, bz] as const
    })
    let maxSpread = 0
    for (let i = 0; i < bottoms.length; i++) {
      for (let j = i + 1; j < bottoms.length; j++) {
        const d = Math.hypot(bottoms[i][0] - bottoms[j][0], bottoms[i][1] - bottoms[j][1])
        if (d > maxSpread) maxSpread = d
      }
    }
    poleScore = clamp01(
      0.4 * (grounded / poles.length) +
        0.3 * (topClose / poles.length) +
        0.3 * (maxSpread >= rimR * 0.85 ? 1 : maxSpread / (rimR * 0.85))
    )
    if (grounded < poles.length) violations.push(`支架杆有未贴地（${poles.length - grounded} 根）`)
    if (topClose < poles.length) violations.push(`支架杆顶端未支撑到轮心高度（${poles.length - topClose} 根）`)
    if (maxSpread < rimR * 0.7) violations.push(`支架底跨距 ${maxSpread.toFixed(2)} < 轮半径×0.7（${(rimR * 0.7).toFixed(2)}），比例不稳`)
  } else {
    poleScore = 0
    violations.push(`支架杆数量 ${poles.length} < 2`)
  }

  // ---- 吊舱均布（轮平面投影角度：复用环段分类构建的 uBasis/vBasis） ----
  let podUniform = 0
  if (pods.length >= 2 && W !== null) {
    const angles = pods
      .map((p) => {
        if (uBasis === null || vBasis === null) return null
        const dx = p.position[0] - W.x
        const dy = p.position[1] - W.y
        const dz = p.position[2] - W.z
        return Math.atan2(dx * vBasis[0] + dy * vBasis[1] + dz * vBasis[2], dx * uBasis[0] + dy * uBasis[1] + dz * uBasis[2])
      })
      .filter((a): a is number => a !== null)
      .sort((a, b) => a - b)
    if (angles.length >= 2) {
      const gaps: number[] = []
      for (let i = 0; i < angles.length; i++) {
        let gap = angles[(i + 1) % angles.length] - angles[i]
        if (i === angles.length - 1) gap += 2 * Math.PI
        gaps.push(gap)
      }
      const maxGapDeg = (Math.max(...gaps) * 180) / Math.PI
      podUniform = clamp01(1 - Math.max(0, maxGapDeg - 75) / 100)
      if (maxGapDeg > 90) violations.push(`吊舱分布不均（最大相邻夹角 ${maxGapDeg.toFixed(0)}°，理想 60°）`)
    }
  }

  // ---- 吊舱半径一致性（吊舱在轮缘上，用 3D 距离：轮圈上下方的吊舱 2D 距离会失真） ----
  let podOnRim = 0
  if (W !== null) {
    for (const p of pods) {
      const d = Math.hypot(p.position[0] - W.x, p.position[1] - W.y, p.position[2] - W.z)
      if (Math.abs(d - rimR) <= 0.25) podOnRim++
    }
  }
  const podRimScore = pods.length > 0 ? podOnRim / pods.length : 0
  if (pods.length > 0 && podOnRim < pods.length) violations.push(`有吊舱不在轮缘上（${pods.length - podOnRim} 个）`)

  // ---- 无穿模（支架杆 vs 环段/吊舱）：线段-点距离（外接 AABB 对斜杆太保守会误报） ----
  let noClip = 1
  if (W !== null) {
    const segEnds = (seg: StructureItem): [number[], number[]] => {
      const d = segDir(seg.rotation)
      const half = seg.scale[1] / 2
      return [
        [seg.position[0] - d[0] * half, seg.position[1] - d[1] * half, seg.position[2] - d[2] * half],
        [seg.position[0] + d[0] * half, seg.position[1] + d[1] * half, seg.position[2] + d[2] * half]
      ]
    }
    const segPointDist = (a: number[], b: number[], p: readonly number[]): number => {
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1)))
      return Math.hypot(p[0] - (a[0] + t * ab[0]), p[1] - (a[1] + t * ab[1]), p[2] - (a[2] + t * ab[2]))
    }
    for (const pole of poles) {
      for (const seg of pole.pole) {
        let clipped = false
        const [a, b] = segEnds(seg)
        const rodR = Math.max(seg.scale[0], seg.scale[2]) / 2
        for (const r of rim) {
          const targetR = Math.max(r.scale[0], r.scale[1], r.scale[2]) / 2
          if (segPointDist(a, b, r.position) < rodR + targetR - 0.005) {
            noClip = 0
            violations.push(`支架杆与轮环穿模`)
            clipped = true
            break
          }
        }
        for (const pod of pods) {
          const targetR = Math.max(pod.scale[0], pod.scale[1], pod.scale[2]) / 2
          if (segPointDist(a, b, pod.position) < rodR + targetR - 0.005) {
            noClip = 0
            violations.push(`支架杆与吊舱穿模`)
            clipped = true
            break
          }
        }
        if (clipped) break
      }
    }
  }

  // ---- 物理合理性（用户终审反馈 2026-08-16：轮心支撑 / 转动不干涉 / 吊舱重力悬挂） ----
  let podBetweenScore = 0
  let podVerticalScore = 0
  let podSizeScore = 0
  let podRopeScore = 0
  let hubSpreader = 0
  let ringConnectorScore = 0
  // ① 轮心支撑：至少一根支架杆的顶端（或杆上一点）抵达轮心（3D 距离 ≤ 0.25；
    //    支架顶在轴端面 z=±0.21 属合理"轴端支撑"，0.2 阈值过严）
  let hubSupport = 0
  if (W !== null && poles.length > 0) {
    for (const pole of poles) {
      const d = Math.hypot(pole.tip.x - W.x, pole.tip.y - W.y, pole.tip.z - W.z)
      if (d <= 0.25) {
        hubSupport = 1
        break
      }
    }
    if (hubSupport === 0) violations.push('轮心无支架支撑（杆顶距轮心 > 0.25，轮心悬空）')
  }
  // ② 吊舱在两环之间（轮心平面，不得左右分列）：吊舱 z 距轮心 z ≤ 0.05
  let podBetweenRings = 0
  if (W !== null && rim.length >= 4) {
    podBetweenRings = pods.filter((p) => Math.abs(p.position[2] - W.z) <= 0.05).length
    podBetweenScore = pods.length > 0 ? podBetweenRings / pods.length : 0
    if (podBetweenScore < 1) violations.push(`有吊舱不在轮心平面（|z−轮心| > 0.05，左右分列）`)
    // ③ 吊舱竖直主轴（重力悬挂姿态）：世界 y 向尺寸 ≥ 0.5 × 最大水平尺寸。
    // axis front 盘（rotation [90,0,0]）的竖直尺寸在 scale[2]（局部 Z→世界 Y），不能只看 scale[1]
    const ySizeOf = (rot: readonly number[], scale: readonly number[]): number => {
      const ar = (rot[0] * Math.PI) / 180
      return scale[1] * Math.abs(Math.cos(ar)) + scale[2] * Math.abs(Math.sin(ar))
    }
    const upright = pods.filter((p, idx) => {
      const rot = podRotations[idx]
      return ySizeOf(rot, p.scale) >= 0.5 * Math.max(p.scale[0], p.scale[2])
    }).length
    if (upright < pods.length) violations.push(`有吊舱姿态不竖直（${pods.length - upright} 个，主轴未沿重力方向）`)
    podVerticalScore = pods.length > 0 ? upright / pods.length : 0
  }
  // ④ 杆-吊舱转动平面分离：支架杆不得与吊舱位于同一 z 平面（转动会碰撞），
  //    除非该杆段在轮心连接区（距轮心 ≤ 0.2）
  let polePlaneFree = 1
  if (W !== null && poles.length > 0 && pods.length > 0) {
    const segEnds2 = (seg: StructureItem): [number[], number[]] => {
      const d = segDir(seg.rotation)
      const half = seg.scale[1] / 2
      return [
        [seg.position[0] - d[0] * half, seg.position[1] - d[1] * half, seg.position[2] - d[2] * half],
        [seg.position[0] + d[0] * half, seg.position[1] + d[1] * half, seg.position[2] + d[2] * half]
      ]
    }
    outer: for (const pole of poles) {
      for (const seg of pole.pole) {
        const [a, b] = segEnds2(seg)
        const rodR = Math.max(seg.scale[0], seg.scale[2]) / 2
        for (const pod of pods) {
          const podHalf = Math.max(pod.scale[0], pod.scale[2]) / 2
          // 杆段与吊舱 z 平面距离
          const podZ = pod.position[2]
          const rodZMin = Math.min(a[2], b[2])
          const rodZMax = Math.max(a[2], b[2])
          const zGap = rodZMax < podZ ? podZ - rodZMax : rodZMin > podZ ? rodZMin - podZ : 0
          if (zGap > rodR + podHalf + 0.01) continue // 平面分离 ✓
          // 同平面：杆必须只在轮心连接区（杆段上所有点到轮心 ≤ 0.2）
          const segPointDist2 = (p: readonly number[]): number => {
            const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
            const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1)))
            return Math.hypot(p[0] - (a[0] + t * ab[0]), p[1] - (a[1] + t * ab[1]), p[2] - (a[2] + t * ab[2]))
          }
          if (segPointDist2([W.x, W.y, W.z]) > 0.2) {
            polePlaneFree = 0
            violations.push('支架杆与吊舱同平面且伸出轮心连接区——转动时碰撞')
            break outer
          }
        }
      }
    }
  }

  // ⑤ 吊舱尺寸：舱体 z 向尺寸不得超过两环间距（避免与环重叠）
  if (W !== null && rim.length >= 4 && pods.length > 0) {
    const rimZs = rim.map((r) => r.position[2]).sort((a, b) => a - b)
    const zLo = rimZs[Math.floor(rimZs.length * 0.15)]
    const zHi = rimZs[Math.floor(rimZs.length * 0.85)]
    const gap = zHi - zLo
    const okSize = pods.filter((p, idx) => {
      const rot = podRotations[idx]
      const ar = Math.abs(rot[0])
      // 世界 z 向尺寸：α≈0 → scale[2]（局部 Z 沿世界 Z）；α≈±90 → scale[1]（局部 Y 转世界 Z）
      const zSize = ar <= 1e-3 ? p.scale[2] : ar - 90 <= 1e-3 || ar + 90 <= 1e-3 ? p.scale[1] : Math.max(p.scale[1], p.scale[2])
      return zSize <= gap + 0.04
    }).length
    podSizeScore = okSize / pods.length
    if (podSizeScore < 1) violations.push(`有吊舱 z 向尺寸超过环间距 ${gap.toFixed(2)}（${pods.length - okSize} 个）`)
  }
  // ⑥ 绳索挂点：每个吊舱上方有细杆（截面 ≤ 0.03）从轮缘挂点垂下连接座舱顶部
  if (W !== null && poles.length >= 0 && pods.length > 0) {
    const ropes = structure.items.filter(
      (it) =>
        it.resourceId === 10009008 &&
        Math.max(it.scale[0], it.scale[2]) <= 0.03 &&
        it.scale[1] >= 0.03
    )
    const ropeBottom = (it: StructureItem): number => {
      const d = segDir(it.rotation)
      const half = it.scale[1] / 2
      const a = it.position[1] - d[1] * half
      const b = it.position[1] + d[1] * half
      return Math.min(a, b)
    }
    const ropeTop = (it: StructureItem): number => {
      const d = segDir(it.rotation)
      const half = it.scale[1] / 2
      const a = it.position[1] - d[1] * half
      const b = it.position[1] + d[1] * half
      return Math.max(a, b)
    }
    const hung = pods.filter((p) => {
      const podTop = p.position[1] + p.scale[1] / 2
      // 细杆下端接近座舱顶部（≤0.1），且上端在轮缘高度（≈ 吊舱上方挂点）
      return ropes.some((r) => {
        const bottom = ropeBottom(r)
        const top = ropeTop(r)
        if (Math.abs(bottom - podTop) > 0.02) return false // 下端必须接触座舱顶（受力连接，不得悬空）
        if (top <= podTop + 0.03) return false
        // 挂点接近轮缘：水平距离到轮心 ≈ rimR
        const d = Math.hypot(r.position[0] - W.x, r.position[2] - W.z)
        return Math.abs(d - rimR) <= 0.2 || top - podTop >= 0.03
      })
    }).length
    podRopeScore = pods.length > 0 ? hung / pods.length : 0
    if (podRopeScore < 1) violations.push(`有吊舱无绳索挂点（${pods.length - hung} 个）`)
  }
  // ⑦a 环连接横杆：轮缘处存在沿 z 向连接两环的横杆（z 跨度 ≥ 环间距×0.8 且距轮心 ≈ 轮半径）
  if (W !== null && rim.length >= 4) {
    const rimZs = rim.map((r) => r.position[2]).sort((a, b) => a - b)
    const zLo = rimZs[Math.floor(rimZs.length * 0.15)]
    const zHi = rimZs[Math.floor(rimZs.length * 0.85)]
    const gap = zHi - zLo
    const zSpan = (it: StructureItem): number => {
      const rot = it.rotation
      const ar = Math.abs(rot[0])
      if (ar <= 1e-3) return it.scale[2]
      if (ar - 90 <= 1e-3 || ar + 90 <= 1e-3) return it.scale[1]
      return Math.max(it.scale[1], it.scale[2])
    }
    const rimConnector = structure.items.some((it) => {
      if (poleSegSet.has(it)) return false
      const d = Math.hypot(it.position[0] - W.x, it.position[1] - W.y, it.position[2] - W.z)
      if (Math.abs(d - rimR) > 0.2) return false // 轮缘带
      return zSpan(it) >= gap * 0.8
    })
    if (!rimConnector) violations.push('轮缘无环连接横杆（缺少沿 z 向连接两环的横杆 ≥ 环间距×0.8）')
    ringConnectorScore = rimConnector ? 1 : 0
  }
  // ⑦ 轮毂横撑：轮心附近存在水平连接件（最大尺寸 ≥ 0.2 且最大尺寸方向为水平），
  //    支架杆顶端之间建立物理连接，环获得支撑点
  if (W !== null) {
    for (let i = 0; i < can.length; i++) {
      const c = can[i]
      if (poleSegSet.has(structure.items[i])) continue
      const d = Math.hypot(c.position[0] - W.x, c.position[1] - W.y, c.position[2] - W.z)
      if (d > 0.25) continue
      const rot = structure.items[i].rotation
      const ar = Math.abs(rot[0])
      const verticalSize = ar <= 1e-3 ? c.scale[1] : ar - 90 <= 1e-3 || ar + 90 <= 1e-3 ? c.scale[2] : Math.max(c.scale[1], c.scale[2])
      const horizontalSize = Math.max(c.scale[0], c.scale[1], c.scale[2]) !== verticalSize
        ? Math.max(c.scale[0], c.scale[1], c.scale[2])
        : Math.max(c.scale[0], c.scale[2])
      if (horizontalSize >= 0.2) {
        hubSpreader = 1
        break
      }
    }
    if (hubSpreader === 0) violations.push('轮心无轮毂横撑（支架杆顶端之间缺少水平连接件 ≥ 0.2 米）')
  }

  const rimScore = rimCount > 0 ? clamp01(0.5 * Math.min(1, rimCount / 16) + 0.5 * rimCover) : 0
  const podCountScore = clamp01(pods.length / 6)
  const axleScore = axle !== null ? 1 : 0.5
  const scaleScore = rimR >= 0.4 && rimR <= 1.0 ? 1 : rimR > 0 ? 0.4 : 0

  const score = clamp01(
    0.12 * rimScore +
      0.1 * podCountScore +
      0.1 * podUniform +
      0.08 * podRimScore +
      0.1 * poleScore +
      0.05 * hubSupport +
      0.05 * podBetweenScore +
      0.05 * podVerticalScore +
      0.05 * podSizeScore +
      0.05 * podRopeScore +
      0.05 * ringConnectorScore +
      0.07 * hubSpreader +
      0.05 * polePlaneFree +
      0.05 * scaleScore +
      0.03 * noClip +
      0.02 * healthy
  )

  return {
    taskId: 'T6',
    parseOk: true,
    score,
    breakdown: {
      元件数: can.length,
      支架杆: poles.length,
      轮半径: Number(rimR.toFixed(2)),
      环段数: rimCount,
      环覆盖: Number(rimCover.toFixed(2)),
      吊舱数: pods.length,
      吊舱均布: Number(podUniform.toFixed(2)),
      吊舱在轮缘: Number(podRimScore.toFixed(2)),
      支架: Number(poleScore.toFixed(2)),
      轮心支撑: hubSupport,
      吊舱在中心平面: Number(podBetweenScore.toFixed(2)),
      吊舱竖直: Number(podVerticalScore.toFixed(2)),
      吊舱尺寸: Number(podSizeScore.toFixed(2)),
      绳索挂点: Number(podRopeScore.toFixed(2)),
      环连接横杆: Number(ringConnectorScore.toFixed(2)),
      轮毂横撑: hubSpreader,
      杆平面分离: polePlaneFree,
      轴: axle !== null ? 1 : 0,
      比例: Number(scaleScore.toFixed(2)),
      无穿模: noClip,
      健康: healthy,
      score: Number(score.toFixed(4))
    },
    violations
  }
}

