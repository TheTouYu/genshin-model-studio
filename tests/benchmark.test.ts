/**
 * benchmark 基准框架单元测试：
 * - 校验器自检：真值结构必须满分（GT self-score = 1.0），坏结构 < 1.0 且带违规清单；
 * - 确定性：同一输入两次校验输出逐位一致（可离线重算的前提）；
 * - 解析器容错：代码块围栏/尾逗号/缺 name/空 items；
 * - 几何核心：元件规范化（90° 等价类）、重力求解、支撑检查；
 * - 修复管线：幂等性 + 保守性（合法结构零改动）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { canonicalizeAll, gravitySolve, itemIou, matchItems, supportCheck } from '../src/benchmark/geo.js'
import { parseStructureOutput } from '../src/benchmark/parse.js'
import { repairStructure } from '../src/benchmark/repair.js'
import type { StructureItem } from '../src/core/structure.js'

import { buildGt as gtT1, validate as validateT1 } from '../benchmark/tasks/T1/validator.js'
import { buildGt as gtT2, buildBase as baseT2, validate as validateT2 } from '../benchmark/tasks/T2/validator.js'
import { buildGt as gtT3, validate as validateT3 } from '../benchmark/tasks/T3/validator.js'
import { validate as validateT4 } from '../benchmark/tasks/T4/validator.js'
import { buildGt as gtT5, validate as validateT5 } from '../benchmark/tasks/T5/validator.js'

const BOX = 10009001
const box = (position: [number, number, number], scale: [number, number, number]): StructureItem => ({
  resourceId: BOX,
  position,
  rotation: [0, 0, 0],
  scale
})
const structure = (items: StructureItem[]): Parameters<typeof validateT1>[0] => ({
  schemaVersion: 1,
  name: 'test',
  template: '空模型',
  templatePrefabId: 10005018,
  templateInstanceId: 10005018,
  prefabId: 1077936129,
  definitionAuxiliaryIds: [],
  instanceAuxiliaryIds: [],
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  items
})

/* ==================== 解析器 ==================== */

test('parse: 带代码块围栏与前后说明文字可解析', () => {
  const r = parseStructureOutput('好的，模型如下：\n```json\n{"name":"亭子","items":[{"resourceId":10009001,"position":[0,0.05,0],"rotation":[0,0,0],"scale":[2,0.1,1.6]}]}\n```\n请查收。')
  assert.equal(r.ok, true)
})

test('parse: 容忍尾逗号', () => {
  const r = parseStructureOutput('{"name":"x","items":[{"resourceId":10009001,"position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1],},]}')
  assert.equal(r.ok, true)
})

test('parse: 缺 name 自动补默认，items 可为空', () => {
  const r = parseStructureOutput('{"items":[]}')
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.structure.name, 'benchmark')
    assert.equal(r.structure.items.length, 0)
  }
})

test('parse: 未知 item 字段 fail-closed（数据契约不放宽）', () => {
  const r = parseStructureOutput('{"name":"x","items":[{"resourceId":10009001,"position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1],"magic":1}]}')
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.reason, /字段校验失败/)
})

test('parse: 纯垃圾文本解析失败', () => {
  const r = parseStructureOutput('这不是 JSON 也不是模型')
  assert.equal(r.ok, false)
})

/* ==================== 几何核心 ==================== */

test('geo: 盒体绕 Y 90° 等价类规范化（方向容错，不算加分）', () => {
  // 同一形状的两种等价表示：β=0 的 [3,1,2] ≡ β=90 的 [2,1,3]（AABB 相同）
  const a = canonicalizeAll([box([0, 0, 0], [3, 1, 2])])
  const b = canonicalizeAll([{ resourceId: BOX, position: [0, 0, 0], rotation: [0, 90, 0], scale: [2, 1, 3] }])
  assert.deepEqual(a[0].scale, b[0].scale)
  assert.equal(matchItems(a, b), 1)
  // 真正不同的 AABB（未旋转的 [2,1,3] vs 旋转后的 [2,1,3]→[3,1,2]）不得匹配
  const different = canonicalizeAll([box([0, 0, 0], [2, 1, 3])])
  assert.equal(matchItems(different, b), 0)
  // 180° 旋转 AABB 相同 → 匹配
  const c = canonicalizeAll([{ resourceId: BOX, position: [0, 0, 0], rotation: [0, 180, 0], scale: [2, 1, 3] }])
  assert.equal(matchItems(canonicalizeAll([box([0, 0, 0], [2, 1, 3])]), c), 1)
  // 非 k×90° 旋转 → 非轴对齐
  const d = canonicalizeAll([{ resourceId: BOX, position: [0, 0, 0], rotation: [0, 45, 0], scale: [2, 1, 3] }])
  assert.equal(d[0].axisAligned, false)
})

test('geo: 圆柱绕 Y 旋转不可见', () => {
  const a = canonicalizeAll([{ resourceId: 10009008, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 2, 1] }])
  const b = canonicalizeAll([{ resourceId: 10009008, position: [0, 0, 0], rotation: [0, 120, 0], scale: [1, 2, 1] }])
  assert.equal(a[0].axisAligned, true)
  assert.equal(matchItems(a, b), 1)
})

test('geo: itemIou 与匹配计数', () => {
  const gt = canonicalizeAll([box([0, 0, 0], [1, 1, 1]), box([2, 0, 0], [1, 1, 1])])
  const pred = canonicalizeAll([box([0, 0, 0], [1, 1, 1]), box([9, 9, 9], [1, 1, 1])])
  assert.equal(matchItems(gt, pred), 1)
  assert.equal(itemIou(gt.length, pred.length, 1), 1 / 3)
})

test('geo: 重力求解与手算 GT 一致（列式分解）', () => {
  const initial = canonicalizeAll([
    box([0, 1.5, 0], [0.6, 0.6, 0.6]),
    box([0, 2.2, 0], [0.4, 0.4, 0.4]),
    box([1.0, 1.0, 0], [0.5, 0.5, 0.5]),
    box([1.0, 1.6, 0], [0.3, 0.3, 0.3])
  ])
  const { settled, initialOverlap } = gravitySolve(initial)
  assert.equal(initialOverlap, false)
  const pos = settled.map((s) => s.position.map((v) => Math.round(v * 100) / 100))
  assert.deepEqual(pos, [
    [0, 0.3, 0], // A 落到地面
    [0, 0.8, 0], // B 落到 A 顶（0.6）
    [1, 0.25, 0], // C 落到地面
    [1, 0.65, 0] // D 落到 C 顶（0.5）
  ])
})

test('geo: 支撑检查识别悬空元件', () => {
  const ok = canonicalizeAll([box([0, 0.05, 0], [1, 0.1, 1]), box([0, 0.6, 0], [0.2, 1, 0.2])])
  assert.equal(supportCheck(ok).length, 0) // 立柱底 0.1 落在板顶 0.1
  const bad = canonicalizeAll([box([0, 0.3, 0], [1, 0.1, 1])])
  assert.equal(supportCheck(bad).length, 1)
})

/* ==================== 修复管线 ==================== */

test('repair: 合法精确结构零修复（保守性）', () => {
  const r = repairStructure(gtT1())
  assert.equal(r.fixes.length, 0)
  assert.equal(r.unresolved.length, 0)
})

test('repair: 修复贴地/支撑问题，且幂等', () => {
  const floating = [box([0, 0.07, 0], [1, 0.1, 1]), box([0, 0.65, 0], [0.2, 1, 0.2])] // 板底 0.02、柱底 0.15
  const r1 = repairStructure(floating)
  assert.ok(r1.fixes.length > 0, '应产生修复')
  // 第一次修复后：板贴地；柱底 0.1 落在板顶 0.1
  const r2 = repairStructure(r1.structure)
  assert.equal(r2.fixes.length, 0, '第二次修复应无新增 fix（幂等）')
})

test('repair: 无支撑体时保守不修（记未解决，不静默）', () => {
  const r = repairStructure([box([0, 1.0, 0], [0.2, 0.2, 0.2])])
  assert.equal(r.fixes.length, 0)
  assert.equal(r.unresolved.length, 1)
})

/* ==================== 校验器自检（GT self-score = 1.0）==================== */

test('T1: 真值满分，坏结构 < 1', () => {
  const r1 = validateT1(structure(gtT1()))
  assert.equal(r1.score, 1.0)
  assert.equal(r1.violations.length, 0)

  const bad = structure([...gtT1().slice(0, 5)]) // 缺屋顶
  const r2 = validateT1(bad)
  assert.ok(r2.score < 1.0)
  assert.ok(r2.violations.some((v) => v.includes('屋顶')))
})

test('T2: 变换后真值满分，未变换输出 0 分', () => {
  const r1 = validateT2(structure(gtT2()))
  assert.equal(r1.score, 1.0)

  const initial = structure(baseT2()) // 未施加变换的长凳原样输出
  const r2 = validateT2(initial)
  assert.ok(r2.score < 1.0)
})

test('T3: 规则真值满分，坏结构（柱高不足）< 1', () => {
  const r1 = validateT3(structure(gtT3()))
  assert.equal(r1.score, 1.0)
  assert.equal(r1.violations.length, 0)

  const bad = structure(gtT3().map((it) =>
    it.position[1] === 0.4 && Math.abs(it.position[0] - 0.25) < 0.01
      ? { ...it, scale: [0.12, 0.7, 0.12] as [number, number, number], position: [0.25, 0.35, 0] as [number, number, number] }
      : it
  ))
  const r2 = validateT3(bad)
  assert.ok(r2.score < 1.0)
  assert.ok(r2.violations.some((v) => v.includes('支撑') || v.includes('立柱')))
})

test('T4: 完美桌满分；"壳"式桌（腿悬空/穿模）低分', () => {
  const perfect = structure([
    box([0, 0.53, 0], [1.0, 0.06, 0.6]), // 桌面：底 0.5
    box([-0.45, 0.25, -0.25], [0.1, 0.5, 0.1]),
    box([0.45, 0.25, -0.25], [0.1, 0.5, 0.1]),
    box([-0.45, 0.25, 0.25], [0.1, 0.5, 0.1]),
    box([0.45, 0.25, 0.25], [0.1, 0.5, 0.1])
  ])
  const r1 = validateT4(perfect)
  assert.equal(r1.score, 1.0, JSON.stringify(r1.violations))

  // 论文"壳"式缺陷的桌域变体：腿不落地（底 0.2）、腿顶高于桌底（穿模）
  const shell = structure([
    box([0, 0.53, 0], [1.0, 0.06, 0.6]),
    box([-0.45, 0.45, -0.25], [0.1, 0.5, 0.1]),
    box([0.45, 0.45, -0.25], [0.1, 0.5, 0.1]),
    box([-0.45, 0.45, 0.25], [0.1, 0.5, 0.1]),
    box([0.45, 0.45, 0.25], [0.1, 0.5, 0.1])
  ])
  const r2 = validateT4(shell)
  assert.ok(r2.score < 0.5, `壳式桌得分应显著低于 0.5，实际 ${r2.score}`)
  assert.ok(r2.violations.length > 0)
})

test('T5: 重力 GT 满分；初始位置（未施加重力）0 分', () => {
  const r1 = validateT5(structure(gtT5()))
  assert.equal(r1.score, 1.0)
  assert.equal(r1.violations.length, 0)

  const initial = structure(gtT5().map((it) => {
    const y = it.scale[0] === 0.6 ? 1.5 : it.scale[0] === 0.4 ? 2.2 : it.scale[0] === 0.5 ? 1.0 : 1.6
    const x = it.scale[0] === 0.5 || it.scale[0] === 0.3 ? 1.0 : 0
    return { ...it, position: [x, y, 0] as [number, number, number] }
  }))
  const r2 = validateT5(initial)
  assert.equal(r2.score, 0)
  assert.ok(r2.violations.some((v) => v.includes('箱体')))
})

/* ==================== 确定性 ==================== */

test('确定性：同一输入两次校验输出逐位一致', () => {
  for (const [name, v, s] of [
    ['T1', validateT1, structure(gtT1())],
    ['T2', validateT2, structure(gtT2())],
    ['T3', validateT3, structure(gtT3())],
    ['T4', validateT4, structure([box([0, 0.53, 0], [1.0, 0.06, 0.6]), box([-0.45, 0.25, -0.25], [0.1, 0.5, 0.1])])],
    ['T5', validateT5, structure(gtT5())]
  ] as const) {
    const a = v(s as Parameters<typeof validateT1>[0])
    const b = v(s as Parameters<typeof validateT1>[0])
    assert.deepEqual(a, b, `${name} 两次校验不一致`)
  }
})
