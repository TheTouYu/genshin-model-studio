/**
 * T1 精确规格石亭 —— 论文「精确规格小屋」对应。
 * 校验方式：逐元件 IoU（规范化 + 贪心匹配）+ 结构特征分解（地板/立柱/屋顶）。
 * GT 由本文件确定性生成（与 prompt.txt 规格一致），不落盘给会话可见。
 */
import type { StructureItem } from '../../../src/core/structure.js'
import type { ResolvedStructure } from '../../../src/core/structure.js'
import type { ValidationResult } from '../../../src/benchmark/types.js'
import {
  canonicalizeAll,
  bottomY,
  itemIou,
  matchPairs
} from '../../../src/benchmark/geo.js'

const BOX = 10009001

/** 真值：地板 + 4 立柱 + 屋顶 = 6 元件（与 T1/prompt.txt 逐条规格一致）。 */
export function buildGt(): StructureItem[] {
  return [
    { resourceId: BOX, position: [0, 0.05, 0], rotation: [0, 0, 0], scale: [2.0, 0.1, 1.6] },
    { resourceId: BOX, position: [-0.9, 0.85, -0.65], rotation: [0, 0, 0], scale: [0.1, 1.5, 0.1] },
    { resourceId: BOX, position: [0.9, 0.85, -0.65], rotation: [0, 0, 0], scale: [0.1, 1.5, 0.1] },
    { resourceId: BOX, position: [-0.9, 0.85, 0.65], rotation: [0, 0, 0], scale: [0.1, 1.5, 0.1] },
    { resourceId: BOX, position: [0.9, 0.85, 0.65], rotation: [0, 0, 0], scale: [0.1, 1.5, 0.1] },
    { resourceId: BOX, position: [0, 1.65, 0], rotation: [0, 0, 0], scale: [2.2, 0.1, 1.8] }
  ]
}

const FEATURES = ['地板', '立柱1', '立柱2', '立柱3', '立柱4', '屋顶']

export function validate(structure: ResolvedStructure): ValidationResult {
  const gt = canonicalizeAll(buildGt())
  const pred = canonicalizeAll(structure.items)
  const violations: string[] = []

  const { gtMatched, pairs } = matchPairs(gt, pred)
  const matched = pairs.length
  const score = itemIou(gt.length, pred.length, matched)

  const hit: Record<string, number> = {}
  for (let i = 0; i < gt.length; i++) {
    hit[FEATURES[i]] = gtMatched[i] ? 1 : 0
    if (!gtMatched[i]) violations.push(`未匹配 ${FEATURES[i]}：${JSON.stringify(gt[i])}`)
  }
  for (const it of pred) {
    if (!it.axisAligned) violations.push(`非轴对齐元件：${JSON.stringify(it)}`)
    if (bottomY(it) < -0.01) violations.push(`元件入地（底 y=${bottomY(it).toFixed(3)}）：${JSON.stringify(it)}`)
  }
  const extra = pred.length - matched
  if (extra > 0) violations.push(`多余元件 ${extra} 个（未匹配预测）`)

  return {
    taskId: 'T1',
    parseOk: true,
    score,
    breakdown: {
      ...hit,
      立柱合计: hit['立柱1'] + hit['立柱2'] + hit['立柱3'] + hit['立柱4'],
      iou: score,
      预测元件数: pred.length,
      多余元件: extra,
      匹配数: matched
    },
    violations
  }
}
