/**
 * /api/validate-model 产品接口测试（ADR-0003 提案 b 落地）：
 * 结构健康校验（确定性）+ 保守修复；不改变现有编码/回读语义。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { validateModelResult } from '../src/web-shared.js'

const stonePavilion = {
  name: '石亭',
  items: [
    { resourceId: 10009001, position: [0, 0.05, 0], rotation: [0, 0, 0], scale: [2.0, 0.1, 1.6] },
    { resourceId: 10009001, position: [-0.9, 0.85, -0.65], rotation: [0, 0, 0], scale: [0.1, 1.5, 0.1] },
    { resourceId: 10009001, position: [0.9, 0.85, -0.65], rotation: [0, 0, 0], scale: [0.1, 1.5, 0.1] },
    { resourceId: 10009001, position: [-0.9, 0.85, 0.65], rotation: [0, 0, 0], scale: [0.1, 1.5, 0.1] },
    { resourceId: 10009001, position: [0.9, 0.85, 0.65], rotation: [0, 0, 0], scale: [0.1, 1.5, 0.1] },
    { resourceId: 10009001, position: [0, 1.65, 0], rotation: [0, 0, 0], scale: [2.2, 0.1, 1.8] }
  ]
}

test('validate-model: 合法结构 ok 且零违规（确定性）', () => {
  const body = JSON.stringify({ structure: stonePavilion, repair: false })
  const r1 = validateModelResult(body)
  assert.equal(r1.parseOk, true)
  assert.equal(r1.ok, true)
  assert.deepEqual(r1.violations, [])
  const r2 = validateModelResult(body)
  assert.deepEqual(r1, r2, '两次校验必须逐位一致')
})

test('validate-model: 悬空/入地违规被检出', () => {
  const bad = {
    name: '坏桌',
    items: [
      { resourceId: 10009001, position: [0, 1.0, 0], rotation: [0, 0, 0], scale: [1.0, 0.1, 0.6] }, // 悬空
      { resourceId: 10009001, position: [0, 0.05, 0], rotation: [0, 0, 0], scale: [0.2, 0.2, 0.2] }, // 底 y=-0.05 入地
      { resourceId: 10009001, position: [2, 1.0, 0], rotation: [0, 45, 0], scale: [0.2, 1.0, 0.2] } // 非轴对齐
    ]
  }
  const r = validateModelResult(JSON.stringify({ structure: bad, repair: false }))
  assert.equal(r.ok, false)
  assert.ok(r.violations.some((v) => v.includes('悬空')))
  assert.ok(r.violations.some((v) => v.includes('入地')))
  assert.ok(r.violations.some((v) => v.includes('非轴对齐')))
})

test('validate-model: repair 保守修复（贴地吸附/支撑修复），幂等', () => {
  const floating = {
    name: '浮桌',
    items: [
      { resourceId: 10009001, position: [0, 0.07, 0], rotation: [0, 0, 0], scale: [1.0, 0.1, 0.6] }, // 底 0.02 → 吸附到 0
      { resourceId: 10009001, position: [0, 0.7, 0], rotation: [0, 0, 0], scale: [0.2, 1.0, 0.2] } // 底 0.2 → 落到板顶 0.1
    ]
  }
  const r = validateModelResult(JSON.stringify({ structure: floating, repair: true }))
  assert.equal(r.ok, true)
  assert.ok(r.fixes.length > 0, '应产生修复记录')
  const bottomY = (it: { position: readonly number[]; scale: readonly number[] }) => it.position[1] - it.scale[1] / 2
  assert.ok(Math.abs(bottomY(r.items[0])) < 1e-6, '板应贴地')
  assert.ok(Math.abs(bottomY(r.items[1]) - 0.1) < 1e-6, '柱应落到板顶 0.1')

  // 幂等：修复后的结构再次修复无新增 fix
  const again = validateModelResult(JSON.stringify({ structure: { name: '浮桌', items: r.items }, repair: true }))
  assert.equal(again.fixes.length, 0, '第二次修复应无新增 fix')
})

test('validate-model: 无支撑体时保守不修，如实报告 unresolved', () => {
  const lone = { name: '孤块', items: [{ resourceId: 10009001, position: [0, 1.0, 0], rotation: [0, 0, 0], scale: [0.2, 0.2, 0.2] }] }
  const r = validateModelResult(JSON.stringify({ structure: lone, repair: true }))
  assert.equal(r.fixes.length, 0)
  assert.equal(r.unresolved.length, 1)
  assert.equal(r.ok, false)
})

test('validate-model: 非法请求体抛错（fail-closed）', () => {
  assert.throws(() => validateModelResult('not json'), /请求体不是合法 JSON/)
  assert.throws(() => validateModelResult(JSON.stringify({ repair: true })), /缺少 structure/)
  assert.throws(
    () => validateModelResult(JSON.stringify({ structure: { name: 'x', items: [{ resourceId: 10009001, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], magic: 1 }] } })),
    /unknown field|未知/
  )
})
