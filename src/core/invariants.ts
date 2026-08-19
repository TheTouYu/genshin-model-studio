/**
 * 产品侧结构健康检查与保守修复（ADR-0003 提案 b 的落地）。
 *
 * 论文范式："生成后跑不变量校验并自动修复"——三维一致性交给确定性代数兜底。
 * 本模块是基准框架（src/benchmark/geo.ts 几何核心 + src/benchmark/repair.ts 修复管线）
 * 的产品化薄封装：几何/修复逻辑与基准共用同一实现（单一真相源），
 * 后续如需解耦可把几何核心提升到 src/core/geometry.ts（见 REVIEW 未做项）。
 *
 * 语义：
 * - 校验（确定性）：贴地（底 y ≥ −ε）、轴对齐、正尺度、支撑（底面投影重叠，角支撑有效）；
 * - 修复（保守，只修明确违规）：贴地吸附（|底|<0.05）、支撑修复（空隙>0.05 且有支撑体）、
 *   近轴对齐吸附、近似重复去重；修复不了的违规如实报告，不静默。
 */
import type { StructureItem } from './structure.js'
import { canonicalizeAll, supportCheck } from '../benchmark/geo.js'
import { repairStructure } from '../benchmark/repair.js'

export type HealthReport = {
  /** 原结构违规清单（未修复前的检查结果）。 */
  violations: string[]
  /** 修复动作记录（repair=true 时非空）。 */
  fixes: string[]
  /** 无法修复的违规（如实报告）。 */
  unresolved: string[]
  /** 修复后的元件列表（repair=false 时 = 原 items）。 */
  items: StructureItem[]
  /** 结构是否健康（违规数为 0）。 */
  ok: boolean
}

/** 校验（不改变输出语义）；repair=true 时执行保守修复。 */
export function checkStructure(items: readonly StructureItem[], repair = false): HealthReport {
  const scan = (list: readonly StructureItem[]): string[] => {
    const out: string[] = []
    const can = canonicalizeAll(list)
    for (const c of can) {
      if (!c.axisAligned) out.push(`非轴对齐元件：${JSON.stringify(c)}`)
      if (c.scale.some((s) => s <= 0)) out.push(`非正尺度：${JSON.stringify(c)}`)
      if (c.position[1] - c.scale[1] / 2 < -0.01) out.push(`元件入地（底 y=${(c.position[1] - c.scale[1] / 2).toFixed(3)}）：${JSON.stringify(c)}`)
    }
    for (const u of supportCheck(can)) {
      out.push(`元件悬空（底面无支撑）：${JSON.stringify(u)}`)
    }
    return out
  }

  const violations = scan(items)
  if (!repair) {
    return { violations, fixes: [], unresolved: [], items: [...items], ok: violations.length === 0 }
  }
  const r = repairStructure(items)
  // ok 反映"最终交付结构"的健康度：修复后的违规 + 无法修复的违规
  const finalViolations = scan(r.structure)
  return {
    violations,
    fixes: r.fixes,
    unresolved: r.unresolved,
    items: r.structure,
    ok: finalViolations.length === 0 && r.unresolved.length === 0
  }
}
