/**
 * T3 拱桥（规则推导）—— 论文「螺旋楼梯塔（规则推导）」对应。
 * 校验方式：模式与规则一致性检查（论文方法学：规则由规格推导，不直接给总数）：
 * - 桥面板数 N = 总长 3.0 / 板宽 0.5 = 6（不写进提示词，由校验器推导）；
 * - 每块板：尺寸/高度一致、落在等距网格、首尾相接无缺口无重叠；
 * - 每根柱：截面/高度一致、顶贴板底、位于某块板正下方；
 * - 支撑关系：每块板有柱支撑、每根柱支撑某块板；无多余元件。
 */
import type { StructureItem } from '../../../src/core/structure.js'
import type { ResolvedStructure } from '../../../src/core/structure.js'
import type { ValidationResult } from '../../../src/benchmark/types.js'
import { aabb, bottomY, canonicalizeAll, topY } from '../../../src/benchmark/geo.js'

const BOX = 10009001
const TOL = 0.02

/** 规则常量（与 T3/prompt.txt 一致）。 */
export const SPAN = 3.0 // 桥面总长（x 方向）
export const START_X = -1.5
export const SLAB_W = 0.5 // 板宽（x）
export const SLAB_T = 0.1 // 板厚（y）
export const SLAB_D = 1.6 // 板深（z）
export const DECK_BOTTOM = 0.8 // 桥面底面高度
export const PILLAR_SIDE = 0.12 // 柱截面（x/z）
export const N = SPAN / SLAB_W // 推导出的板数 = 6

/** 规则推导出的真值：N 块桥面板 + N 根立柱（与 prompt.txt 规则一致）。 */
export function buildGt(): StructureItem[] {
  const items: StructureItem[] = []
  for (let k = 0; k < N; k++) {
    const cx = START_X + k * SLAB_W + SLAB_W / 2
    items.push({
      resourceId: BOX,
      position: [cx, DECK_BOTTOM + SLAB_T / 2, 0],
      rotation: [0, 0, 0],
      scale: [SLAB_W, SLAB_T, SLAB_D]
    })
    items.push({
      resourceId: BOX,
      position: [cx, DECK_BOTTOM / 2, 0],
      rotation: [0, 0, 0],
      scale: [PILLAR_SIDE, DECK_BOTTOM, PILLAR_SIDE]
    })
  }
  return items
}

export type Classified = {
  slabs: { index: number; minX: number; maxX: number; it: ReturnType<typeof canonicalizeAll>[number] }[]
  pillars: ReturnType<typeof canonicalizeAll>[number][]
  extras: ReturnType<typeof canonicalizeAll>[number][]
}

/** 分类：位置在桥位（x∈[−1.5−ε,1.5+ε]、z≈0、y 在桥面高度或柱位高度）的盒体；其余为多余。 */
export function classify(items: readonly StructureItem[]): Classified {
  const can = canonicalizeAll(items)
  const slabs: Classified['slabs'] = []
  const pillars: ReturnType<typeof canonicalizeAll>[number][] = []
  const extras: ReturnType<typeof canonicalizeAll>[number][] = []
  for (const it of can) {
    if (!it.axisAligned) {
      extras.push(it)
      continue
    }
    const b = aabb(it)
    const zc = it.position[2]
    const inSpan = b.min[0] >= START_X - 0.1 && b.max[0] <= -START_X + 0.1 && Math.abs(zc) <= 1.0
    if (inSpan && Math.abs(bottomY(it) - DECK_BOTTOM) <= 0.05) {
      slabs.push({ index: -1, minX: b.min[0], maxX: b.max[0], it })
    } else if (inSpan && topY(it) <= DECK_BOTTOM + 0.05 && bottomY(it) >= -0.05) {
      pillars.push(it)
    } else {
      extras.push(it)
    }
  }
  return { slabs, pillars, extras }
}

export function validate(structure: ResolvedStructure): ValidationResult {
  const { slabs, pillars, extras } = classify(structure.items)
  const violations: string[] = []

  // 桥面板按 x 排序，检查网格对齐与无缺口/重叠
  const ordered = [...slabs].sort((p, q) => p.minX - q.minX)
  let slabOk = 0
  let gap = 0
  let covered = 0
  for (let k = 0; k < ordered.length; k++) {
    const s = ordered[k]
    const it = s.it
    const dimsOk =
      Math.abs(it.scale[0] - SLAB_W) <= TOL &&
      Math.abs(it.scale[1] - SLAB_T) <= TOL &&
      Math.abs(it.scale[2] - SLAB_D) <= TOL
    const yOk = Math.abs(bottomY(it) - DECK_BOTTOM) <= TOL
    const gridX = START_X + k * SLAB_W
    const gridOk = Math.abs(s.minX - gridX) <= TOL && Math.abs(s.maxX - (gridX + SLAB_W)) <= TOL
    const zOk = Math.abs(it.position[2]) <= TOL
    if (dimsOk && yOk && gridOk && zOk) {
      slabOk++
    } else {
      const why: string[] = []
      if (!dimsOk) why.push(`尺寸 [${it.scale}] 应为 [${SLAB_W},${SLAB_T},${SLAB_D}]`)
      if (!yOk) why.push(`底面 y=${bottomY(it).toFixed(3)} 应为 ${DECK_BOTTOM}`)
      if (!gridOk) why.push(`x 区间 [${s.minX.toFixed(2)},${s.maxX.toFixed(2)}] 不在网格 ${gridX}~${gridX + SLAB_W}`)
      if (!zOk) why.push(`z 中心 ${it.position[2]} 应为 0`)
      violations.push(`桥面板#${k + 1} 不满足规则：${why.join('；')}`)
    }
    if (k > 0) {
      const prev = ordered[k - 1]
      const g = s.minX - prev.maxX
      if (g > TOL) {
        gap += g
        violations.push(`桥面板#${k} 与 #${k + 1} 之间有空隙 ${g.toFixed(3)} 米`)
      }
      if (prev.maxX - s.minX > TOL) violations.push(`桥面板#${k} 与 #${k + 1} 重叠`)
    }
  }
  if (ordered.length > 0) {
    const lo = Math.max(ordered[0].minX, START_X)
    const hi = Math.min(ordered[ordered.length - 1].maxX, -START_X)
    covered = Math.max(0, hi - lo)
    if (ordered[0].minX > START_X + TOL) violations.push(`桥面起点 x=${ordered[0].minX.toFixed(2)}，应从 ${START_X} 开始`)
    if (ordered[ordered.length - 1].maxX < -START_X - TOL) violations.push(`桥面终点 x=${ordered[ordered.length - 1].maxX.toFixed(2)}，应到 ${-START_X}`)
  } else {
    violations.push('没有桥面板')
  }
  const gapScore = Math.max(0, 1 - gap / SPAN)
  const slabScore = slabOk / N

  // 立柱检查：截面/高度/位置网格对齐（柱心应等于某块板心）
  let pillarOk = 0
  const slabCenters = ordered.map((s) => (s.minX + s.maxX) / 2)
  for (const p of pillars) {
    const dimsOk =
      Math.abs(p.scale[0] - PILLAR_SIDE) <= TOL &&
      Math.abs(p.scale[1] - (DECK_BOTTOM)) <= TOL &&
      Math.abs(p.scale[2] - PILLAR_SIDE) <= TOL
    const posOk =
      Math.abs(bottomY(p)) <= TOL &&
      Math.abs(topY(p) - DECK_BOTTOM) <= TOL &&
      Math.abs(p.position[2]) <= TOL
    const onGrid = slabCenters.some((c) => Math.abs(p.position[0] - c) <= TOL + 0.01)
    if (dimsOk && posOk && onGrid) pillarOk++
    else violations.push(`立柱不符规则：${JSON.stringify(p)}（尺寸应为 [${PILLAR_SIDE},${DECK_BOTTOM},${PILLAR_SIDE}]、贴地、顶贴板底、位于板心）`)
  }
  const pillarScore = pillarOk / N

  // 支撑关系：每块板下方有柱（柱心在板 x 区间内、柱顶贴板底）；每根柱上方有板
  let supportedSlabs = 0
  for (const s of ordered) {
    const under = pillars.some(
      (p) => p.position[0] >= s.minX - TOL && p.position[0] <= s.maxX + TOL && Math.abs(topY(p) - bottomY(s.it)) <= TOL
    )
    if (under) supportedSlabs++
    else violations.push(`桥面板 [${s.minX.toFixed(2)},${s.maxX.toFixed(2)}] 下方无立柱支撑`)
  }
  let supportedPillars = 0
  for (const p of pillars) {
    const over = ordered.some(
      (s) => p.position[0] >= s.minX - TOL && p.position[0] <= s.maxX + TOL && Math.abs(bottomY(s.it) - topY(p)) <= TOL
    )
    if (over) supportedPillars++
    else violations.push(`立柱 ${JSON.stringify(p.position)} 上方无桥面板`)
  }
  const supportScore =
    slabs.length + pillars.length > 0 ? (supportedSlabs + supportedPillars) / (slabs.length + pillars.length) : 0

  const extraScore = Math.max(0, 1 - extras.length / 3)
  for (const e of extras) violations.push(`多余元件：${JSON.stringify(e)}`)

  const score = Math.max(
    0,
    Math.min(1, 0.4 * slabScore + 0.15 * gapScore + 0.15 * pillarScore + 0.2 * supportScore + 0.1 * extraScore)
  )

  return {
    taskId: 'T3',
    parseOk: true,
    score,
    breakdown: {
      桥面板规则命中: slabOk,
      期望板数: N,
      实际板数: slabs.length,
      覆盖率: Number((covered / SPAN).toFixed(3)),
      立柱规则命中: pillarOk,
      实际柱数: pillars.length,
      支撑比例: Number(supportScore.toFixed(3)),
      多余元件: extras.length,
      空隙总和: Number(gap.toFixed(3)),
      score: score
    },
    violations
  }
}
