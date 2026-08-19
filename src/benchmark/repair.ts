/**
 * benchmark 确定性修复管线（论文 §6.1"生成后跑不变量校验并自动修复"在本项目域的落地）。
 *
 * 保守原则：只修明确违规，绝不改动合法精确结构（幂等性由单测保证）：
 * 1. 贴地吸附：底面在 [0, 0.05) 内的元件降到 y=0（容忍建模浮点误差）；
 * 2. 支撑修复：悬空（底面下方空隙 > 0.05）且底面中心有支撑体/地面的元件，
 *    下落到最高支撑面（中心点支撑规则）；无支撑者保留并记为未解决违规；
 * 3. 近轴对齐吸附：α/γ ≈ 0、β ≈ k×90° 的旋转吸附为轴对齐；
 * 4. 近似重复去重：同资源、位置/尺寸差 ≤ 0.01 的元件保留第一个。
 *
 * 输出：修复后结构 + fixes 记录 + unresolved 记录（不静默、不撒谎）。
 *
 * light 模式（复杂自由结构用，如摩天轮/风车）：只做贴地吸附/轴对齐吸附/去重，
 * 不做支撑修复——论文方法学教训：环/吊舱等"结构性悬空"是合法设计（如同
 * "屋顶横跨空心室内"），全局支撑修复会误伤并把形状拉坏。
 */
import type { StructureItem } from '../core/structure.js'
import { aabb, bottomFaceOverlaps, bottomY, canonicalize, topY, CONTACT_EPS } from './geo.js'

export type RepairResult = {
  structure: StructureItem[]
  fixes: string[]
  unresolved: string[]
}

const SNAP_GROUND_MAX = 0.05
/** 与支撑检查 CONTACT_EPS 一致：空隙 ≤ 该值视为已支撑，不修复。 */
const SUPPORT_GAP = CONTACT_EPS
const DEDUPE_TOL = 0.01

function nearAxisRotation(rotation: readonly [number, number, number]): readonly [number, number, number] | null {
  const [a, b, g] = rotation
  if (Math.abs(a) > 1e-3 || Math.abs(g) > 1e-3) return null
  let beta = ((b % 360) + 360) % 360
  const k = Math.round(beta / 90)
  if (Math.abs(beta - k * 90) > 1e-3) return null
  beta = ((k % 4) + 4) % 4 * 90
  if (Math.abs(beta - b) <= 1e-3) return null
  return [0, beta, 0]
}

/** 保守修复：合法结构（如 T1 真值）应返回零修复、零改变。 */
export function repairStructure(items: readonly StructureItem[]): RepairResult {
  return repairWithMode(items, 'full')
}

/**
 * light 模式：贴地吸附 + 轴对齐吸附 + 去重（不做支撑修复）。
 * 适用于环/吊舱等"结构性悬空"合法的复杂自由结构（论文方法学教训）。
 */
export function repairStructureLight(items: readonly StructureItem[]): RepairResult {
  return repairWithMode(items, 'light')
}

function repairWithMode(items: readonly StructureItem[], mode: 'full' | 'light'): RepairResult {
  const fixes: string[] = []
  const unresolved: string[] = []

  // 第 1 步：近轴对齐吸附
  let current = items.map((it) => {
    const near = nearAxisRotation(it.rotation)
    if (near !== null) {
      fixes.push(`轴对齐吸附：${JSON.stringify(it.rotation)} → ${JSON.stringify(near)}`)
      return { ...it, rotation: near }
    }
    return it
  })

  // 第 2 步：贴地吸附（仅 [0, SNAP_GROUND_MAX) 的微差；真值结构不受影响）
  current = current.map((it) => {
    const c = canonicalize(it)
    const bottom = bottomY(c)
    if (c.axisAligned && bottom >= 0 && bottom < SNAP_GROUND_MAX && bottom > 1e-6) {
      fixes.push(`贴地吸附：position.y ${it.position[1]} → ${it.position[1] - bottom}`)
      return { ...it, position: [it.position[0], it.position[1] - bottom, it.position[2]] }
    }
    return it
  })

  // 第 3 步：近似重复去重
  const deduped: StructureItem[] = []
  for (const it of current) {
    const c = canonicalize(it)
    const dup = deduped.find((d) => {
      const dc = canonicalize(d)
      if (dc.resourceId !== c.resourceId) return false
      if (!dc.axisAligned || !c.axisAligned) return false
      const dp = Math.abs(dc.position[0] - c.position[0]) + Math.abs(dc.position[1] - c.position[1]) + Math.abs(dc.position[2] - c.position[2])
      const ds = Math.abs(dc.scale[0] - c.scale[0]) + Math.abs(dc.scale[1] - c.scale[1]) + Math.abs(dc.scale[2] - c.scale[2])
      return dp <= DEDUPE_TOL * 3 && ds <= DEDUPE_TOL * 3
    })
    if (dup !== undefined) {
      fixes.push(`去重：移除近似重复元件 ${JSON.stringify(c)}`)
    } else {
      deduped.push(it)
    }
  }
  current = deduped

  // 第 4 步：支撑修复（仅 full 模式；light 模式跳过——结构性悬空合法）
  let work = current.map((it) => ({ ...it, position: [...it.position] as [number, number, number] }))
  if (mode === 'full') {
    const canon = (list: StructureItem[]): ReturnType<typeof canonicalize>[] => list.map(canonicalize)
    for (let iter = 0; iter < 16; iter++) {
      let moved = false
      const cs = canon(work)
    const byBottom = cs
      .map((c, i) => ({ i, b: bottomY(c) }))
      .sort((p, q) => p.b - q.b)
      .map((p) => p.i)
    for (const i of byBottom) {
      const c = cs[i]
      if (!c.axisAligned) continue
      const bottom = bottomY(c)
      if (bottom <= SNAP_GROUND_MAX) continue
      const cx = c.position[0]
      const cz = c.position[2]
      let support = -Infinity
      for (let j = 0; j < cs.length; j++) {
        if (j === i) continue
        const sj = cs[j]
        if (!sj.axisAligned) continue
        const tj = topY(sj)
        // 支撑面必须不高于底面（允许恰好贴住）；投影重叠而非中心点
        // （论文教训：屋顶横跨空心室内合法悬空，角支撑是有效支撑）
        if (tj <= bottom + 1e-6 && tj > support && bottomFaceOverlaps(c, sj)) support = tj
      }
      if (support > -Infinity) {
        const gap = bottom - support
        if (gap > SUPPORT_GAP) {
          const h = c.scale[1]
          const newY = support + h / 2
          fixes.push(`支撑修复：${JSON.stringify(c.position)} → y=${newY}（支撑面 y=${support}，空隙 ${gap.toFixed(3)}）`)
          work[i] = { ...work[i], position: [work[i].position[0], newY, work[i].position[2]] }
          moved = true
        }
        // 空隙 ≤ SUPPORT_GAP：已贴地或贴支撑体（容差内），无需修复
      } else {
        unresolved.push(`无支撑且无支撑体：${JSON.stringify(c)}`)
      }
    }
      if (!moved) break
    }
  }

  // unresolved 去重（跨迭代可能重复上报同一元件）
  const seen = new Set<string>()
  const unresolvedDeduped: string[] = []
  for (const u of unresolved) {
    if (!seen.has(u)) {
      seen.add(u)
      unresolvedDeduped.push(u)
    }
  }

  return { structure: work, fixes, unresolved: unresolvedDeduped }
}

/** 修复的幂等性辅助：第二次修复应无任何新增 fix。 */
export function repairDelta(r: RepairResult): number {
  return r.fixes.length
}

/** 供测试用：结构 AABB 占用体积（粗糙健康指标）。 */
export function totalVolume(items: readonly StructureItem[]): number {
  let v = 0
  for (const it of items) {
    const c = canonicalize(it)
    const b = aabb(c)
    v += (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2])
  }
  return v
}
