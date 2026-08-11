/**
 * 二期画线建模：核心生成模块单元测试（任务 A）。
 * 风格对齐 tests/golden.test.ts（node:test + assert/strict，纯确定性断言）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { BOX_RESOURCE_ID, CYLINDER_RESOURCE_ID, generateModel, toStructureItems } from '../src/draw/types.js'
import { detectClosed, fitStroke, resampleUniform, simplifyRdp } from '../src/draw/fitting.js'
import type { ModelOptions, Stroke } from '../src/draw/types.js'
import { resolveStructure } from '../src/core/structure.js'

// —— 工具 ——

/** 编辑器 YXZ 内旋：R = Ry(β)·Rx(α)·Rz(γ)，rotation=[α,β,γ]（度）。 */
function yxzMatrix(rotation: readonly [number, number, number]): number[][] {
  const a = (rotation[0] * Math.PI) / 180
  const b = (rotation[1] * Math.PI) / 180
  const g = (rotation[2] * Math.PI) / 180
  const c1 = Math.cos(b)
  const s1 = Math.sin(b)
  const c2 = Math.cos(a)
  const s2 = Math.sin(a)
  const c3 = Math.cos(g)
  const s3 = Math.sin(g)
  return [
    [c1 * c3 + s1 * s2 * s3, -c1 * s3 + s1 * s2 * c3, s1 * c2],
    [c2 * s3, c2 * c3, -s2],
    [-s1 * c3 + c1 * s2 * s3, s1 * s3 + c1 * s2 * c3, c1 * c2]
  ]
}

function apply(m: readonly number[][], v: readonly number[]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ]
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function normalize3(v: readonly number[]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2])
  return [v[0] / len, v[1] / len, v[2] / len]
}

function arcLength(points: readonly (readonly [number, number])[]): number {
  let sum = 0
  for (let i = 1; i < points.length; i++) {
    sum += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  }
  return sum
}

// —— 拟合管线 ——

test('rdp: removes collinear redundant points and keeps polyline corners', () => {
  const polyline: [number, number][] = [
    [0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2],
    [3, 3], [2, 3], [1, 3], [0, 3], [0, 2], [0, 1]
  ]
  const simplified = simplifyRdp(polyline, 0.5)
  assert.deepEqual(simplified, [[0, 0], [3, 0], [3, 3], [0, 3], [0, 1]])
})

test('resample: uniform arc length spacing (error < 5%)', () => {
  // 直线：精确等距（相邻点弧长 = 总长 / (N-1)）
  const line = resampleUniform([[0, 0], [5, 0], [10, 0], [15, 0]], 6)
  assert.equal(line.length, 6)
  for (let i = 1; i < line.length; i++) {
    assert.ok(Math.abs(line[i][0] - line[i - 1][0] - 3) < 1e-9, `straight segment ${i}`)
  }
  // 曲线（半圆折线）：相邻点弧长误差 < 5%，首尾端点保留
  const arc: [number, number][] = []
  const steps = 40
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI
    arc.push([50 - 50 * Math.cos(t), 50 * Math.sin(t)])
  }
  const n = 31
  const sampled = resampleUniform(arc, n)
  assert.equal(sampled.length, n)
  const expected = arcLength(arc) / (n - 1)
  for (let i = 1; i < sampled.length; i++) {
    const d = Math.hypot(sampled[i][0] - sampled[i - 1][0], sampled[i][1] - sampled[i - 1][1])
    assert.ok(Math.abs(d - expected) / expected < 0.05, `curve segment ${i}: ${d} vs ${expected}`)
  }
  assert.deepEqual(sampled[0], arc[0])
  assert.deepEqual(sampled[n - 1], arc[arc.length - 1])
})

test('closed detection: closed and open strokes', () => {
  const closedStroke: Stroke = { id: 'c', points: [[0, 0], [10, 0], [10, 10], [0, 10], [0.1, 0.05]] }
  const openStroke: Stroke = { id: 'o', points: [[0, 0], [10, 0], [10, 10]] }
  assert.equal(detectClosed(closedStroke.points), true)
  assert.equal(detectClosed(openStroke.points), false)
  const result = generateModel([closedStroke, openStroke], {
    mode: 'extrude', shape: 'cylinder', size: 0.2, count: 12, heightMeters: 2
  })
  assert.deepEqual(result.closed, [true, false])
})

test('fit: pipeline is deterministic and preserves stroke endpoints', () => {
  const stroke: Stroke = { id: 's', points: [[10, 10], [90, 10], [90, 90], [10, 90]] }
  const a = fitStroke(stroke, 20)
  const b = fitStroke(stroke, 20)
  assert.ok(a !== null && b !== null)
  assert.deepEqual(a.points, b.points)
  assert.equal(a.points.length, 20)
  assert.deepEqual(a.points[0], [10, 10])
  assert.deepEqual(a.points[a.points.length - 1], [10, 90])
})

// —— 生成 ——

test('extrude: count segments produce count rods aligned to the polyline', () => {
  // 近似水平斜线：拟合后全部采样点共线 → 每段方向相同、可按中点连线断言
  const stroke: Stroke = { id: 's', points: [[0, 0], [100, 0], [200, 0], [300, 1]] }
  const opts: ModelOptions = { mode: 'extrude', shape: 'cylinder', size: 0.2, count: 8, heightMeters: 2 }
  const { items } = generateModel([stroke], opts)
  assert.equal(items.length, 8) // count 段 → count 个元件
  // 线段方向（世界）：画布方向 (300,1) 经 y 翻转 + 等比缩放
  const expectedDir = normalize3([300 * 2, -1 * 2, 0])
  for (const item of items) {
    assert.equal(item.resourceId, CYLINDER_RESOURCE_ID)
    assert.equal(item.group, 's')
    assert.equal(item.scale[0], 0.2) // 直径 = size
    assert.equal(item.scale[2], 0.2)
    assert.ok(item.scale[1] > 0) // 轴向长度 = 段长
    const axis = apply(yxzMatrix(item.rotation), [0, 1, 0]) // 圆柱零旋转轴向 = 局部 Y
    assert.ok(dot(axis, expectedDir) > 1 - 1e-9, `rod axis aligns with segment: ${item.rotation}`)
    assert.equal(item.position[2], 0)
  }
  // 位置 = 段中点：第一段中点 = 画布 (18.75, 0.0625) → 世界 (-262.5, 1.875)
  assert.ok(Math.abs(items[0].position[0] + 262.5) < 0.01, 'first rod x')
  assert.ok(Math.abs(items[0].position[1] - 1.875) < 0.01, 'first rod y')
  // 段长 = 世界弧长 / count ≈ 75
  assert.ok(Math.abs(items[0].scale[1] - 75) < 1, 'rod length')

  // 方杆：长轴 = 局部 Z 对齐
  const box = generateModel([stroke], { ...opts, shape: 'box' })
  assert.equal(box.items.length, 8)
  for (const item of box.items) {
    assert.equal(item.resourceId, BOX_RESOURCE_ID)
    assert.equal(item.scale[0], 0.2)
    assert.equal(item.scale[1], 0.2)
    assert.ok(item.scale[2] > 0)
    const axis = apply(yxzMatrix(item.rotation), [0, 0, 1]) // 长方体零旋转长轴 = 局部 Z
    assert.ok(dot(axis, expectedDir) > 1 - 1e-9, `box axis aligns with segment: ${item.rotation}`)
  }
})

test('lathe: count discs stacked by sample height with scale.x = 2r', () => {
  // 倒 V 母线：最左点 (20,0) 为内部点，采样不落其上 → 全部盘片半径 > 0，恰 count 层
  const stroke: Stroke = { id: 'v', points: [[40, 100], [20, 0], [60, 100]] }
  const opts: ModelOptions = { mode: 'lathe', shape: 'cylinder', size: 0.2, count: 10, heightMeters: 2 }
  const { items } = generateModel([stroke], opts)
  assert.equal(items.length, 10) // count 层盘片
  // 与拟合曲线逐点对照（母线 = 拟合后的采样曲线）：
  // 归一化：minX=20, maxX=60, minY=0, maxY=100, s = 2/100
  const fit = fitStroke(stroke, 10)
  assert.ok(fit !== null)
  const s = 2 / 100
  const axisX = -((60 - 20) * s) / 2 // 旋转轴（归一化前 minX=20）的世界 x
  const thickness = 2 / 10 // 盘厚 = 总高 / count
  assert.equal(items.length, fit.points.length)
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const p = fit.points[i]
    assert.equal(item.resourceId, CYLINDER_RESOURCE_ID)
    assert.equal(item.group, 'v')
    assert.deepEqual(item.rotation, [0, 0, 0]) // 盘片轴向 Y 零旋转
    assert.equal(item.position[2], 0)
    assert.equal(item.scale[1], thickness)
    assert.equal(item.scale[0], item.scale[2])
    assert.ok(item.scale[0] > 0, `disc ${i} radius > 0`)
    const r = item.scale[0] / 2 // 直径 = 2r
    // 半径 = (x − minX) × s，盘高 = 采样点归一化高度（半径/高度与母线吻合）
    assert.ok(Math.abs(r - (p[0] - 20) * s) < 1e-9, `disc ${i} radius matches the fitted profile`)
    assert.ok(Math.abs(item.position[1] - (100 - p[1]) * s) < 1e-9, `disc ${i} height matches the fitted profile`)
    // 盘心恒在旋转轴上（旋转轴 = 归一化前 minX 的世界位置）
    assert.ok(Math.abs(item.position[0] - axisX) < 1e-9, `disc ${i} centered on the rotation axis`)   
  }
  // 端点 (60,100) 为采样点 → 最大半径 = (60−20)×0.02 = 0.8；两端点高度 y=0
  const maxR = Math.max(...items.map((i) => i.scale[0] / 2))
  assert.ok(Math.abs(maxR - 0.8) < 1e-9, 'max radius')
  assert.equal(Math.min(...items.map((i) => i.position[1])), 0)
  // 平滑后曲线最低点高于原始顶点（Chaikin 角切把 V 尖削平），盘片仍覆盖大半高度
  assert.ok(Math.max(...items.map((i) => i.position[1])) > 1, 'discs span most of the height')
})

test('deterministic: identical input yields deep-equal output', () => {
  const strokes: Stroke[] = [
    { id: 'a', points: [[0, 0], [100, 0], [100, 100], [0, 100]] },
    { id: 'b', points: [[50, 0], [80, 60], [20, 120]] }
  ]
  const opts: ModelOptions = { mode: 'extrude', shape: 'cylinder', size: 0.3, count: 20, heightMeters: 3 }
  assert.deepEqual(generateModel(strokes, opts), generateModel(strokes, opts))
  assert.deepEqual(
    generateModel(strokes, { ...opts, mode: 'lathe' }),
    generateModel(strokes, { ...opts, mode: 'lathe' })
  )
})

test('flatten: toStructureItems strips internal fields and passes resolveStructure', () => {
  const stroke: Stroke = { id: 'a', points: [[0, 0], [100, 0], [100, 100], [0, 100]] }
  const { items } = generateModel([stroke], {
    mode: 'extrude', shape: 'cylinder', size: 0.2, count: 10, heightMeters: 2
  })
  assert.ok(items.length > 0)
  const flat = toStructureItems(items)
  assert.equal(flat.length, items.length)
  for (const item of flat) {
    assert.ok(!('group' in item), 'group must be stripped')
    assert.equal(item.color, undefined) // 不写 color = 默认材质
  }
  // 兜底验证：拍平产物必须通过一期 fail-closed 解析器
  const resolved = resolveStructure({ name: 'draw-test', items: flat })
  assert.equal(resolved.items.length, items.length)
  assert.equal(resolved.items[0].resourceId, CYLINDER_RESOURCE_ID)
})
