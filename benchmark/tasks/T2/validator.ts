/**
 * T2 变换（旋转+平移）—— 论文「坐标旋转变换」对应。
 * 校验方式：对 GT 施加提示词同一变换公式（绕 Y 90° + 平移），逐元件与预测比对
 * （变换公式逐点核对：位置误差记录在 breakdown.maxPosErr）。
 */
import type { StructureItem } from '../../../src/core/structure.js'
import type { ResolvedStructure } from '../../../src/core/structure.js'
import type { ValidationResult } from '../../../src/benchmark/types.js'
import { canonicalizeAll, itemIou, matchPairs, rotateY90ThenTranslate } from '../../../src/benchmark/geo.js'

const BOX = 10009001

/** 变换前真值：长凳（凳面 + 左右腿），与 T2/prompt.txt 规格一致。 */
export function buildBase(): StructureItem[] {
  return [
    { resourceId: BOX, position: [0, 0.55, 0], rotation: [0, 0, 0], scale: [1.8, 0.1, 0.5] },
    { resourceId: BOX, position: [-0.8, 0.25, 0], rotation: [0, 0, 0], scale: [0.1, 0.5, 0.1] },
    { resourceId: BOX, position: [0.8, 0.25, 0], rotation: [0, 0, 0], scale: [0.1, 0.5, 0.1] }
  ]
}

/** 变换：绕 Y 旋转 90°（(x,z)→(−z,x)）再平移 (+1.0, 0, −0.5)。与 prompt.txt 公式一致。 */
export const TRANSFORM_T: readonly [number, number, number] = [1.0, 0, -0.5]

export function buildGt(): StructureItem[] {
  return rotateY90ThenTranslate(buildBase(), TRANSFORM_T)
}

export function validate(structure: ResolvedStructure): ValidationResult {
  const gt = canonicalizeAll(buildGt())
  const pred = canonicalizeAll(structure.items)
  const violations: string[] = []

  const { gtMatched, pairs } = matchPairs(gt, pred)
  const matched = pairs.length
  const score = itemIou(gt.length, pred.length, matched)

  // 变换公式逐点核对：每个 GT 元件与其匹配预测的位置误差
  let maxPosErr = 0
  let sumPosErr = 0
  for (const p of pairs) {
    const g = gt[p.gtIndex]
    const pr = pred[p.predIndex]
    const err = Math.hypot(g.position[0] - pr.position[0], g.position[1] - pr.position[1], g.position[2] - pr.position[2])
    if (err > maxPosErr) maxPosErr = err
    sumPosErr += err
  }
  for (let i = 0; i < gt.length; i++) {
    if (!gtMatched[i]) {
      violations.push(`变换核对失败 元件${i + 1}：期望 ${JSON.stringify(gt[i])}（位置含变换公式结果）`)
    }
  }
  for (const it of pred) {
    if (!it.axisAligned) violations.push(`非轴对齐元件：${JSON.stringify(it)}`)
  }
  const extra = pred.length - matched
  if (extra > 0) violations.push(`多余元件 ${extra} 个`)

  return {
    taskId: 'T2',
    parseOk: true,
    score,
    breakdown: {
      变换命中: matched / gt.length,
      maxPosErr: Number(maxPosErr.toFixed(4)),
      meanPosErr: Number((matched > 0 ? sumPosErr / matched : 0).toFixed(4)),
      预测元件数: pred.length,
      多余元件: extra,
      iou: score
    },
    violations
  }
}
