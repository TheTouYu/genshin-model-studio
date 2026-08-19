/**
 * T5 箱体重力 —— 论文「重力物理」对应（按轴列式分解核对）。
 * 校验方式：确定性重力求解器（中心点支撑规则，逐列分解）计算 GT 最终位置，
 * 与预测逐元件比对（IoU）+ 支撑不变量复核（模型输出必须是"下落稳定后"的结构）。
 */
import type { StructureItem } from '../../../src/core/structure.js'
import type { ResolvedStructure } from '../../../src/core/structure.js'
import type { ValidationResult } from '../../../src/benchmark/types.js'
import {
  canonicalizeAll,
  gravitySolve,
  itemIou,
  matchPairs,
  supportCheck
} from '../../../src/benchmark/geo.js'

const BOX = 10009001

/** 初始位置（含悬空），与 T5/prompt.txt 一致。 */
export function buildInitial(): StructureItem[] {
  return [
    { resourceId: BOX, position: [0, 1.5, 0], rotation: [0, 0, 0], scale: [0.6, 0.6, 0.6] },
    { resourceId: BOX, position: [0, 2.2, 0], rotation: [0, 0, 0], scale: [0.4, 0.4, 0.4] },
    { resourceId: BOX, position: [1.0, 1.0, 0], rotation: [0, 0, 0], scale: [0.5, 0.5, 0.5] },
    { resourceId: BOX, position: [1.0, 1.6, 0], rotation: [0, 0, 0], scale: [0.3, 0.3, 0.3] }
  ]
}

const BOX_NAMES = ['A', 'B', 'C', 'D']

/** 确定性 GT：对初始位置运行重力求解。 */
export function buildGt(): StructureItem[] {
  const { settled } = gravitySolve(canonicalizeAll(buildInitial()))
  return settled.map((c) => ({
    resourceId: c.resourceId,
    position: [c.position[0], c.position[1], c.position[2]],
    rotation: [0, 0, 0],
    scale: [c.scale[0], c.scale[1], c.scale[2]]
  }))
}

export function validate(structure: ResolvedStructure): ValidationResult {
  const gt = canonicalizeAll(buildGt())
  const pred = canonicalizeAll(structure.items)
  const violations: string[] = []

  const { gtMatched, pairs } = matchPairs(gt, pred)
  const matched = pairs.length
  const score = itemIou(gt.length, pred.length, matched)

  for (let i = 0; i < gt.length; i++) {
    if (!gtMatched[i]) violations.push(`箱体 ${BOX_NAMES[i]} 最终位置不符：期望 ${JSON.stringify(gt[i])}`)
  }
  for (const it of pred) {
    if (!it.axisAligned) violations.push(`非轴对齐元件：${JSON.stringify(it)}`)
  }
  const extra = pred.length - matched
  if (extra > 0) violations.push(`多余元件 ${extra} 个`)

  // 支撑不变量：下落稳定后每个箱体必须贴地或落在支撑体顶面（列式分解核对）
  const unsupported = supportCheck(pred)
  for (const u of unsupported) violations.push(`箱体未稳定（下方悬空或底面中心无支撑）：${JSON.stringify(u)}`)
  const supportOk = unsupported.length === 0 ? 1 : 0

  return {
    taskId: 'T5',
    parseOk: true,
    score,
    breakdown: {
      A: gtMatched[0] ? 1 : 0,
      B: gtMatched[1] ? 1 : 0,
      C: gtMatched[2] ? 1 : 0,
      D: gtMatched[3] ? 1 : 0,
      支撑不变量: supportOk,
      预测元件数: pred.length,
      多余元件: extra,
      iou: score
    },
    violations
  }
}
