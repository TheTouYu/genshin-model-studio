/**
 * 二期画线建模：核心生成模块单元测试（任务 A）。
 * 风格对齐 tests/golden.test.ts（node:test + assert/strict，纯确定性断言）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { BOX_RESOURCE_ID, CYLINDER_RESOURCE_ID, SPHERE_RESOURCE_ID, generateModel, toStructureItems } from '../src/draw/types.js'
import { adaptiveEpsilon, detectClosed, fitStroke, resampleUniform, simplifyRdp } from '../src/draw/fitting.js'
import { OPEN_CYLINDER_RESOURCE_ID } from '../src/draw/types.js'
import { catmullRom } from '../src/draw/spline.js'
import { parseDrawModelRequest, sweepWarnings } from '../src/web-shared.js'
import type { ModelOptions, Stroke, TaggedItem } from '../src/draw/types.js'
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

test('extrude: straight lines stay 1 segment (17期优化), curves keep count segments', () => {
  // 直线（RDP 抽稀后 ≤2 点）不再细分成 count 段：1 段即最优表示（元件爆炸/核验成本/编码体积）
  const stroke: Stroke = { id: 's', points: [[0, 0], [100, 0], [200, 0], [300, 1]] }
  const opts: ModelOptions = { mode: 'extrude', shape: 'cylinder', size: 0.2, count: 8, heightMeters: 2 }
  const { items } = generateModel([stroke], opts)
  assert.equal(items.length, 1) // 直线 1 段（整根杆）
  // 线段方向（世界）：画布方向 (300,1) 经 y 翻转 + 等比缩放
  const expectedDir = normalize3([300 * 2, -1 * 2, 0])
  for (const item of items) {
    assert.equal(item.resourceId, CYLINDER_RESOURCE_ID)
    assert.equal(item.group, 's')
    assert.equal(item.scale[0], 0.2) // 直径 = size
    assert.equal(item.scale[2], 0.2)
    assert.ok(item.scale[1] > 0) // 轴向长度 = 整根杆长
    const axis = apply(yxzMatrix(item.rotation), [0, 1, 0]) // 圆柱零旋转轴向 = 局部 Y
    assert.ok(dot(axis, expectedDir) > 1 - 1e-9, `rod axis aligns with segment: ${item.rotation}`)
    assert.equal(item.position[2], 0)
  }
  // 位置 = 杆中点：画布 (150, 0.5) → 世界 (0, 1)（整根杆中点；scale = 2/bbox高1）
  assert.ok(Math.abs(items[0].position[0]) < 0.01, 'rod x')
  assert.ok(Math.abs(items[0].position[1] - 1) < 0.01, 'rod y')
  // 杆长 = 世界总长 ≈ hypot(300,1)×2 ≈ 600
  assert.ok(Math.abs(items[0].scale[1] - 600) < 2, 'rod length')

  // 方杆：长轴 = 局部 Z 对齐
  const box = generateModel([stroke], { ...opts, shape: 'box' })
  assert.equal(box.items.length, 1)
  for (const item of box.items) {
    assert.equal(item.resourceId, BOX_RESOURCE_ID)
    assert.equal(item.scale[0], 0.2)
    assert.equal(item.scale[1], 0.2)
    assert.ok(item.scale[2] > 0)
    const axis = apply(yxzMatrix(item.rotation), [0, 0, 1]) // 长方体零旋转长轴 = 局部 Z
    assert.ok(dot(axis, expectedDir) > 1 - 1e-9, `box axis aligns with segment: ${item.rotation}`)
  }
})

test('lathe: single seamless open cylinder around the widest profile radius (hollow cup)', () => {
  // L 形母线（细分，模拟前端 polyline）：锚点 (20,0) 在底部，水平渐变后竖直向上
  const pts: [number, number][] = []
  for (let i = 0; i <= 30; i++) pts.push([20 + (20 * i) / 30, 0])
  for (let i = 1; i <= 60; i++) pts.push([40, (100 * i) / 60])
  const stroke: Stroke = { id: 'v', points: pts }
  const opts: ModelOptions = { mode: 'lathe', shape: 'cylinder', size: 0.2, count: 60, heightMeters: 2 }
  const { items } = generateModel([stroke], opts)
  assert.equal(items.length, 1) // 无缝旋转体：单个开口圆柱
  const item = items[0]
  const s = 2 / 100
  const axisX = -((40 - 20) * s) / 2 // 旋转轴（归一化前 minX=20，单笔画 bbox 宽 20）的世界 x
  assert.equal(item.resourceId, OPEN_CYLINDER_RESOURCE_ID)
  assert.equal(item.group, 'v')
  assert.deepEqual(item.rotation, [0, 0, 0]) // 轴向 Y 零旋转
  assert.equal(item.position[2], 0) // 居中在轴上
  assert.ok(Math.abs(item.position[0] - axisX) < 0.01, 'axis centered')
  assert.ok(Math.abs(item.scale[0] - 0.8) < 0.01, `diameter = 2r = ${item.scale[0]}`)
  assert.ok(Math.abs(item.scale[1] - 2) < 0.01, 'wall height = profile height')
  assert.ok(Math.abs(item.scale[2] - item.scale[0]) < 1e-9, 'circular: z diameter = x diameter')
  assert.ok(Math.abs(item.position[1] - 1) < 0.01, 'height center')
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

// —— 三期颜色（PRD §9）：Stroke.color → TaggedItem.color → 拍平写 StructureItem.color ——

test('color: stroke with color → flattened item carries full color fields and resolves', () => {
  const stroke: Stroke = { id: 'red', points: [[0, 0], [100, 0], [200, 0]], color: '0xC8A87C' }
  const { items } = generateModel([stroke], {
    mode: 'extrude', shape: 'cylinder', size: 0.2, count: 4, heightMeters: 2
  })
  assert.ok(items.length > 0)
  // 生成侧：透传 "0xRRGGBB" 字符串到该笔所有 TaggedItem
  for (const item of items) {
    assert.deepEqual(item.color, { enabled: true, rgb: '0xC8A87C', opacity: 100, overlay: 'overwrite' })
  }
  // 拍平侧：rgb 转数值，写完整全字段
  const flat = toStructureItems(items)
  assert.equal(flat.length, items.length)
  for (const item of flat) {
    assert.ok(!('group' in item), 'group must be stripped')
    assert.deepEqual(item.color, { enabled: true, rgb: 0xc8a87c, opacity: 100, overlay: 'overwrite' })
  }
  // 兜底：带 color 的拍平产物必须被一期 fail-closed 解析器接受
  const resolved = resolveStructure({ name: 'draw-color', items: flat })
  assert.equal(resolved.items.length, flat.length)
  assert.deepEqual(resolved.items[0].color, { enabled: true, rgb: 0xc8a87c, opacity: 100, overlay: 'overwrite' })
})

test('color: stroke without color → no color field anywhere (default material)', () => {
  const stroke: Stroke = { id: 'plain', points: [[0, 0], [100, 0]] }
  const { items } = generateModel([stroke], {
    mode: 'extrude', shape: 'cylinder', size: 0.2, count: 4, heightMeters: 2
  })
  assert.ok(items.length > 0)
  for (const item of items) assert.equal(item.color, undefined)
  const flat = toStructureItems(items)
  for (const item of flat) assert.equal(item.color, undefined)
  assert.equal(resolveStructure({ name: 'draw-plain', items: flat }).items.length, flat.length)
})

test('color: mixed strokes (one colored, one plain) keep colors per stroke', () => {
  const red: Stroke = { id: 'red', points: [[0, 0], [100, 0]], color: '0xFF0000' }
  const plain: Stroke = { id: 'plain', points: [[0, 50], [100, 50]] }
  const { items } = generateModel([red, plain], {
    mode: 'extrude', shape: 'cylinder', size: 0.2, count: 4, heightMeters: 2,
    currentColor: '0x00FF00' // 生成侧不消费：无 color 的笔画仍不写 color（新笔画默认色由前端落为 stroke.color）
  })
  assert.ok(items.length >= 2)
  for (const item of items) {
    if (item.group === 'red') {
      assert.deepEqual(item.color, { enabled: true, rgb: '0xFF0000', opacity: 100, overlay: 'overwrite' })
    } else {
      assert.equal(item.group, 'plain')
      assert.equal(item.color, undefined)
    }
  }
  const flat = toStructureItems(items)
  const redFlat = flat.filter((_, i) => items[i].group === 'red')
  const plainFlat = flat.filter((_, i) => items[i].group === 'plain')
  assert.ok(redFlat.length > 0 && plainFlat.length > 0)
  for (const item of redFlat) {
    assert.deepEqual(item.color, { enabled: true, rgb: 0xff0000, opacity: 100, overlay: 'overwrite' })
  }
  for (const item of plainFlat) assert.equal(item.color, undefined)
  // 兜底：混合输入同样被解析器接受
  assert.equal(resolveStructure({ name: 'draw-mixed', items: flat }).items.length, flat.length)
})

test('color: determinism unchanged (extrude + lathe, with/without colors)', () => {
  const strokes: Stroke[] = [
    { id: 'a', points: [[0, 0], [100, 0], [100, 100]], color: '0x112233' },
    { id: 'b', points: [[50, 0], [80, 60], [20, 120]] }
  ]
  const opts: ModelOptions = { mode: 'extrude', shape: 'box', size: 0.3, count: 10, heightMeters: 3 }
  assert.deepEqual(generateModel(strokes, opts), generateModel(strokes, opts))
  assert.deepEqual(
    generateModel(strokes, { ...opts, mode: 'lathe' }),
    generateModel(strokes, { ...opts, mode: 'lathe' })
  )
  // 与一期同输入同输出：无 color 字段时产物与带 color 输入去掉 color 后逐位一致
  const plain: Stroke[] = strokes.map(({ id, points }) => ({ id, points }))
  const coloredStripped = generateModel(strokes, opts).items.map(({ color, ...rest }) => rest)
  assert.deepEqual(generateModel(plain, opts).items, coloredStripped)
})

// —— 四期：Catmull-Rom 样条（src/draw/spline.ts）——

/** 等距采样圆环 + 首尾同点闭合（与前端圆工具输出同构）。 */
function closedRing(rx: number, ry: number, n = 32): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([50 + rx * Math.cos(a), 50 + ry * Math.sin(a)])
  }
  pts.push(pts[0])
  return pts
}

const solidOpts: ModelOptions = { mode: 'extrude', shape: 'cylinder', size: 0.2, count: 8, heightMeters: 2 }

test('spline: output passes through all control points (open and closed)', () => {
  const ctrl: [number, number][] = [[0, 0], [50, 80], [100, 0], [150, 50]]
  const open = catmullRom(ctrl, false, 16)
  assert.equal(open.length, 1 + 3 * 16) // 开放：1 + (n−1)×samplesPerSeg
  assert.deepEqual(open[0], ctrl[0])
  assert.deepEqual(open[open.length - 1], ctrl[ctrl.length - 1])
  for (const p of ctrl) {
    assert.ok(open.some((q) => q[0] === p[0] && q[1] === p[1]), `open 过点 (${p[0]},${p[1]})`)
  }
  const closed = catmullRom(ctrl, true, 16)
  assert.equal(closed.length, 4 * 16 + 1) // 闭合：n×samplesPerSeg + 末尾精确重复首点
  assert.deepEqual(closed[0], ctrl[0])
  assert.deepEqual(closed[closed.length - 1], ctrl[0]) // 首尾衔接 = 同一控制点
  for (const p of ctrl) {
    assert.ok(closed.some((q) => q[0] === p[0] && q[1] === p[1]), `closed 过点 (${p[0]},${p[1]})`)
  }
  // 输出必须能被后端封闭检测识别（首尾重合 → closed=true）
  assert.equal(detectClosed(closed), true)
})

test('spline: closed curve joins head and tail without a jump', () => {
  // 控制点多边形接近圆 → 曲线处处低曲率，接缝应与所有其他点一样平滑
  const ctrl: [number, number][] = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2
    ctrl.push([100 + 80 * Math.cos(a), 100 + 80 * Math.sin(a)])
  }
  const out = catmullRom(ctrl, true, 16)
  assert.deepEqual(out[0], out[out.length - 1])
  // 环绕采样下，接缝处采样间距与整体均值一致（无跳变/无重合）
  let total = 0
  for (let i = 1; i < out.length; i++) total += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1])
  const mean = total / (out.length - 1)
  const seam = Math.hypot(out[out.length - 2][0] - out[0][0], out[out.length - 2][1] - out[0][1])
  assert.ok(seam > mean * 0.5 && seam < mean * 2, `seam spacing ${seam} vs mean ${mean}`)
  // 接缝处切线连续：前/后各一个采样点估计切线方向，点积 ≈ 1，且与其余控制点处一致
  const kinkAt = (i: number): number => {
    // 接缝处（i=0）前一点是 out[len-2]（out[len-1] 是首点重复，向量为零）
    const prev = i === 0 ? out[out.length - 2] : out[i - 1]
    const a = [out[i][0] - prev[0], out[i][1] - prev[1]]
    const b = [out[(i + 1) % out.length][0] - out[i][0], out[(i + 1) % out.length][1] - out[i][1]]
    return (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]))
  }
  const seamKink = kinkAt(0)
  assert.ok(seamKink > 0.999, `seam kink ${seamKink}`)
  for (let k = 1; k < ctrl.length; k++) {
    const other = kinkAt(k * 16)
    assert.ok(Math.abs(other - seamKink) < 1e-9, `control point ${k} kink ${other} == seam ${seamKink}`)
  }
})

test('spline: 2 points = straight line, <2 points returned as-is', () => {
  const line = catmullRom([[3, 4], [13, 14]], false, 8)
  assert.equal(line.length, 9)
  assert.deepEqual(line[0], [3, 4])
  assert.deepEqual(line[line.length - 1], [13, 14])
  for (let i = 1; i < line.length; i++) {
    // 严格共线且等距（每段 = 总长 / 8）
    assert.ok(Math.abs((line[i][0] - line[i - 1][0]) - 1.25) < 1e-12, `x spacing ${i}`)
    assert.ok(Math.abs((line[i][1] - line[i - 1][1]) - 1.25) < 1e-12, `y spacing ${i}`)
  }
  assert.deepEqual(catmullRom([[1, 2]], true, 8), [[1, 2]])
  assert.deepEqual(catmullRom([], false, 8), [])
})

// —— 四期：solid 柱体渲染器（PRD §5.2）——

test('solid: closed circle → cylinder (resource/scale/position), multi-stroke placement', () => {
  const { items } = generateModel([{ id: 'c', points: closedRing(40, 40), render: 'solid', height: 0.08 }], solidOpts)
  assert.equal(items.length, 1)
  const item = items[0]
  assert.equal(item.resourceId, CYLINDER_RESOURCE_ID)
  assert.equal(item.group, 'c')
  // 圆：bbox 10..90 × 10..90 → 直径 = 80 × (2/80) = 2；厚度 = height = 0.08
  assert.deepEqual(item.scale, [2, 0.08, 2])
  assert.deepEqual(item.rotation, [0, 0, 0]) // up 缺省：轴向 Y 零旋转
  assert.deepEqual(item.position, [0, 0.04, 0]) // x/z 居中，y = 厚度/2（底贴 y=0）
  // 多笔画（八期语义）：x 仍按画布 x 全局居中；z 用各自包围盒居中归 0——画布 y
  // 不再映射世界 z（与杆 z=0 平面一致）。回归：画布 y 不同的 solid 都 z=0、x 各自居中
  const a = closedRing(20, 20).map(([x, y]) => [x, y] as [number, number]) // 0..40 区域
  const b = closedRing(20, 20).map(([x, y]) => [x + 200, y + 100] as [number, number])
  const two = generateModel(
    [
      { id: 'a', points: a, render: 'solid', height: 0.1 },
      { id: 'b', points: b, render: 'solid', height: 0.1 }
    ],
    { ...solidOpts, heightMeters: 4 }
  )
  const ia = two.items.find((i) => i.group === 'a')
  const ib = two.items.find((i) => i.group === 'b')
  assert.ok(ia && ib)
  // 全局包络 0..240 × 0..140 → s = 4/140；A 中心画布 (20,20) → 世界 x = 20s − 240s/2
  const s = 4 / 140
  assert.ok(Math.abs(ia.position[0] - (20 * s - (240 * s) / 2)) < 1e-9, 'A x')
  assert.ok(Math.abs(ia.position[2]) < 1e-9, 'A z = 0（画布 y 不映射世界 z）')
  assert.ok(Math.abs(ib.position[0] - (220 * s - (240 * s) / 2)) < 1e-9, 'B x')
  assert.ok(Math.abs(ib.position[2]) < 1e-9, 'B z = 0（画布 y 不映射世界 z）')
})

test('solid: ellipse → non-uniform cylinder scale=[width, height, depth]', () => {
  const { items } = generateModel([{ id: 'e', points: closedRing(60, 30), render: 'solid', height: 0.1 }], solidOpts)
  assert.equal(items.length, 1)
  const item = items[0]
  assert.equal(item.resourceId, CYLINDER_RESOURCE_ID)
  // 椭圆：bbox −10..110 × 20..80 → s = 2/60 → 宽 4、深 2、厚 0.1
  assert.deepEqual(item.scale, [4, 0.1, 2])
  assert.notEqual(item.scale[0], item.scale[2]) // 非等比
  assert.deepEqual(item.position, [0, 0.05, 0])
})

test('solid: rectangle → box scale=[width, height, depth]', () => {
  const rect: [number, number][] = [[0, 0], [100, 0], [100, 60], [0, 60], [0, 0]]
  const { items } = generateModel([{ id: 'r', points: rect, render: 'solid', height: 0.08 }], solidOpts)
  assert.equal(items.length, 1)
  const item = items[0]
  assert.equal(item.resourceId, BOX_RESOURCE_ID)
  // 矩形：bbox 0..100 × 0..60 → s = 2/60 → 宽 100/30、深 2、厚 0.08
  assert.deepEqual(item.scale, [100 / 30, 0.08, 2])
  assert.deepEqual(item.rotation, [0, 0, 0])
  assert.deepEqual(item.position, [0, 0.04, 0])
})

test('solid: axis front/side read back as +Z / +X (YXZ intrinsic rotation)', () => {
  const ring = closedRing(40, 40)
  for (const [axis, expected] of [
    ['up', [0, 1, 0]],
    ['front', [0, 0, 1]],
    ['side', [1, 0, 0]]
  ] as const) {
    const stroke: Stroke = { id: axis, points: ring, render: 'solid', height: 0.08, axis }
    const cylinder = generateModel([stroke], solidOpts).items[0]
    const dir = apply(yxzMatrix(cylinder.rotation), [0, 1, 0]) // 圆柱零旋转轴向 = 局部 Y
    assert.ok(dot(dir, expected) > 1 - 1e-9, `axis=${axis} cylinder rotation ${cylinder.rotation} → ${dir}`)
    // 长方体柱体同样以局部 Y 为厚度方向
    const rect: [number, number][] = [[0, 0], [100, 0], [100, 60], [0, 60], [0, 0]]
    const box = generateModel([{ id: axis + 'b', points: rect, render: 'solid', height: 0.08, axis }], solidOpts).items[0]
    assert.equal(box.resourceId, BOX_RESOURCE_ID)
    const boxDir = apply(yxzMatrix(box.rotation), [0, 1, 0])
    assert.ok(dot(boxDir, expected) > 1 - 1e-9, `axis=${axis} box rotation ${box.rotation} → ${boxDir}`)
  }
  // 约定值锁定：front = [90,0,0]，side = [0,0,−90]（Rz(+90)·Y = −X，故 side 取 −90）
  assert.deepEqual(generateModel([{ id: 'f', points: ring, render: 'solid', height: 0.08, axis: 'front' }], solidOpts).items[0].rotation, [90, 0, 0])
  assert.deepEqual(generateModel([{ id: 's', points: ring, render: 'solid', height: 0.08, axis: 'side' }], solidOpts).items[0].rotation, [0, 0, -90])
})

test('solid: height = thickness, bottom at y=0 (position.y = height/2), scale.y = height', () => {
  const ring = closedRing(40, 40)
  const { items } = generateModel([{ id: 'h', points: ring, render: 'solid', height: 0.5 }], solidOpts)
  assert.equal(items.length, 1)
  assert.equal(items[0].position[1], 0.25)
  assert.equal(items[0].scale[1], 0.5)
})

test('solid: errors — non-closed → 封闭轮廓 message; polygon → explicit unsupported message', () => {
  const open: Stroke = { id: 'o', points: [[0, 0], [100, 0], [100, 100]], render: 'solid', height: 0.1 }
  assert.throws(() => generateModel([open], solidOpts), /柱体渲染需要封闭轮廓/)
  // 退化（1 点）solid 同样 400
  assert.throws(() => generateModel([{ id: 'd', points: [[0, 0]], render: 'solid', height: 0.1 }], solidOpts), /柱体渲染需要封闭轮廓/)
  // 多边形（正五边形 + 梯形）→ 人话提示
  const pentagon: [number, number][] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2
    pentagon.push([50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a)])
  }
  pentagon.push(pentagon[0])
  assert.throws(() => generateModel([{ id: 'p', points: pentagon, render: 'solid', height: 0.1 }], solidOpts), /暂不支持该轮廓形状（支持圆\/椭圆\/矩形）/)
  const trapezoid: [number, number][] = [[0, 0], [100, 0], [120, 60], [0, 60], [0, 0]]
  assert.throws(() => generateModel([{ id: 't', points: trapezoid, render: 'solid', height: 0.1 }], solidOpts), /暂不支持该轮廓形状（支持圆\/椭圆\/矩形）/)
  // height <= 0 → 明确报错
  assert.throws(() => generateModel([{ id: 'z', points: closedRing(40, 40), render: 'solid', height: 0 }], solidOpts), /柱体高度需大于 0/)
  assert.throws(() => generateModel([{ id: 'z', points: closedRing(40, 40), render: 'solid' }], solidOpts), /柱体高度需大于 0/)
})

test('solid: coexists with global lathe mode (solid strokes stay columns, others lathe)', () => {
  const ring = closedRing(40, 40)
  const profile: Stroke = { id: 'v', points: [[40, 100], [20, 0], [60, 100]] }
  const { items, closed } = generateModel(
    [
      { id: 'c', points: ring, render: 'solid', height: 0.08 },
      { id: 'c2', points: ring, render: 'solid', height: 0.08, axis: 'front' },
      profile
    ],
    { ...solidOpts, mode: 'lathe' }
  )
  assert.deepEqual(closed, [true, true, false])
  const solids = items.filter((i) => i.group.startsWith('c'))
  const discs = items.filter((i) => i.group === 'v')
  assert.equal(solids.length, 2) // 两个 solid 笔画各 1 个柱体（不绕轴）
  assert.equal(discs.length, 1) // 其余笔画照旧 lathe：单个无缝开口圆柱
  assert.deepEqual(solids[0].rotation, [0, 0, 0])
  assert.deepEqual(solids[1].rotation, [90, 0, 0])
})

test('height: rod stroke lifts all items (extrude and lathe)', () => {
  const opts: ModelOptions = { mode: 'extrude', shape: 'cylinder', size: 0.2, count: 4, heightMeters: 2 }
  const rod: Stroke = { id: 'r', points: [[0, 0], [100, 0]], height: 0.5 }
  const plain = generateModel([{ id: 'r', points: rod.points }], opts)
  const lifted = generateModel([rod], opts)
  assert.equal(lifted.items.length, plain.items.length)
  for (let i = 0; i < lifted.items.length; i++) {
    assert.equal(lifted.items[i].position[1], plain.items[i].position[1] + 0.5)
    assert.deepEqual(lifted.items[i].rotation, plain.items[i].rotation)
    assert.deepEqual(lifted.items[i].scale, plain.items[i].scale)
  }
  const lathe = generateModel([{ id: 'r', points: rod.points, height: 0.3 }], { ...opts, mode: 'lathe' })
  const lathePlain = generateModel([{ id: 'r', points: rod.points }], { ...opts, mode: 'lathe' })
  assert.equal(lathe.items.length, lathePlain.items.length)
  for (let i = 0; i < lathe.items.length; i++) {
    assert.equal(lathe.items[i].position[1], lathePlain.items[i].position[1] + 0.3)
  }
})

test('rod: lathe mode segments by RDP anchors, not resampled count points', () => {
  // 圆弧把手（模拟 curve 采样 49 点）：RDP 抽稀后锚点数应远小于 count，杆数 = 锚点数-1
  const pts: [number, number][] = []
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI
    pts.push([50 + 30 * Math.cos(a), 50 + 30 * Math.sin(a)])
  }
  const opts: ModelOptions = { mode: 'lathe', shape: 'cylinder', size: 0.2, count: 60, heightMeters: 2 }
  const { items } = generateModel([{ id: 'h', points: pts, render: 'rod' }], opts)
  const segs = items.filter((i) => i.group === 'h')
  assert.ok(segs.length > 1, 'rod 至少 2 段')
  assert.ok(segs.length < 20, `RDP 锚点应远少于 count 段（实际 ${segs.length} 段）`)
  assert.ok(segs.every((i) => i.resourceId === CYLINDER_RESOURCE_ID))
  // 极短段合并：段长不得小于杆半径（size/2 米）对应的世界长度（避免端面堆叠视觉缝）
  assert.ok(
    segs.every((i) => i.scale[1] >= 0.2 / 2),
    `无过短段（最小段长 ${Math.min(...segs.map((i) => i.scale[1])).toFixed(3)}，阈值 ${(0.2 / 2).toFixed(3)}）`
  )
})

test('golden: render/height/axis absent → byte-identical to phase-2 extrude items', () => {
  const stroke: Stroke = { id: 'g', points: [[0, 0], [100, 0], [100, 100], [0, 100]] }
  const opts: ModelOptions = { mode: 'extrude', shape: 'cylinder', size: 0.2, count: 4, heightMeters: 2 }
  // 二期黄金基线（改动前实测快照；render/height/axis 全缺省路径）
  const expected = [
    { resourceId: 10009008, position: [-0.3408182753563863, 1.9886060917854622, 0], rotation: [90.99025477459884, 90, 0], scale: [0.2, 1.3185603774549426, 0.2], group: 'g' },
    { resourceId: 10009008, position: [0.6591817246436137, 1.4886060917854622, 0], rotation: [145.10300182676812, 90, 0], scale: [0.2, 1.191457946797561, 0.2], group: 'g' },
    { resourceId: 10009008, position: [0.6591817246436135, 0.5113939082145379, 0], rotation: [145.1030018267681, -90, 0], scale: [0.2, 1.1914579467975615, 0.2], group: 'g' },
    { resourceId: 10009008, position: [-0.34081827535638654, 0.011393908214537873, 0], rotation: [90.99025477459884, -90, 0], scale: [0.2, 1.3185603774549421, 0.2], group: 'g' }
  ] as TaggedItem[]
  assert.deepEqual(generateModel([stroke], opts).items, expected)
  // 显式 render:'rod' 与缺省逐位一致（rod = 跟随全局 mode）
  assert.deepEqual(generateModel([{ ...stroke, render: 'rod' }], opts).items, expected)
  // 拍平后同样一致（不引入新字段）
  assert.deepEqual(toStructureItems(expected), toStructureItems(generateModel([stroke], opts).items))
})

test('parse: render/height/axis pass through and are validated (缺省不写)', () => {
  const ring: [number, number][] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ring.push([10 + 5 * Math.cos(a), 10 + 5 * Math.sin(a)])
  }
  ring.push(ring[0])
  const { strokes } = parseDrawModelRequest(JSON.stringify({
    strokes: [
      { id: 's1', points: [[0, 0], [10, 10]] },
      { id: 's2', points: ring, render: 'solid', height: 0.08, axis: 'front' },
      { id: 's3', points: [[0, 0], [10, 10]], render: 'rod' }
    ],
    options: { mode: 'extrude', shape: 'cylinder', size: 0.2, count: 8, heightMeters: 2 }
  }))
  // 十期（ADR-0001）：点统一为 3D [x,y,z]，旧 [x,y] 自动补 z=0；transform 透传
  assert.deepEqual(strokes[0], { id: 's1', points: [[0, 0, 0], [10, 10, 0]] })
  assert.deepEqual(strokes[1], { id: 's2', points: ring.map((p) => [p[0], p[1], 0]), render: 'solid', height: 0.08, axis: 'front' })
  assert.deepEqual(strokes[2], { id: 's3', points: [[0, 0, 0], [10, 10, 0]], render: 'rod' })
  // 3D 点原样保留 + transform 校验透传
  const t3 = parseDrawModelRequest(JSON.stringify({
    strokes: [{ id: 's4', points: [[1, 2, 3], [4, 5, 6]], transform: { position: [0, 0.1, 0], rotation: [-30, 90, 90] } }],
    options: { mode: 'extrude', shape: 'cylinder', size: 0.2, count: 8, heightMeters: 2 }
  })).strokes[0]
  assert.deepEqual(t3.points, [[1, 2, 3], [4, 5, 6]])
  assert.deepEqual(t3.transform, { position: [0, 0.1, 0], rotation: [-30, 90, 90] })
  for (const [bad, msg] of [
    [{ ...strokes[1], render: 'blob' }, /渲染方式无效/],
    [{ ...strokes[1], height: 'x' }, /高度无效/],
    [{ ...strokes[1], height: NaN }, /高度无效/],
    [{ ...strokes[1], axis: 'diagonal' }, /方向无效/]
  ] as const) {
    assert.throws(
      () => parseDrawModelRequest(JSON.stringify({ strokes: [bad], options: { mode: 'extrude', shape: 'cylinder', size: 0.2, count: 8, heightMeters: 2 } })),
      msg
    )
  }
  // 语义校验（生成期错误前置到解析期，保证调用方 writeHead 顺序下仍能回 400）
  assert.throws(
    () => parseDrawModelRequest(JSON.stringify({
      strokes: [{ id: 'o', points: [[0, 0], [10, 10], [10, 20]], render: 'solid', height: 0.1 }],
      options: { mode: 'extrude', shape: 'cylinder', size: 0.2, count: 8, heightMeters: 2 }
    })),
    /柱体渲染需要封闭轮廓/
  )
})

test('canvasHeightPx: 四期画布标定——像素→米按画布可视区高（缺省退回包络盒标定）', () => {
  // 200px 圆（直径 200px），无 canvasHeightPx：按内容包络盒（高 200px = heightMeters）→ 直径 2 米
  const ring: [number, number][] = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    ring.push([100 + 100 * Math.cos(a), 100 + 100 * Math.sin(a)])
  }
  ring.push(ring[0])
  const stroke: Stroke = { id: 'c', render: 'solid', height: 0.1, points: ring }
  const opts: ModelOptions = { mode: 'extrude', shape: 'cylinder', size: 0.03, count: 16, heightMeters: 1 }
  const legacy = generateModel([stroke], opts).items[0]
  assert.ok(Math.abs(legacy.scale[0] - 1) < 1e-9, '缺省：包络盒高 200px = 1 米 → 直径 1 米')
  // 带 canvasHeightPx（画布可视区高 500px = 1 米）→ 200px 圆 = 0.4 米直径
  const calib = generateModel([stroke], { ...opts, canvasHeightPx: 500 }).items[0]
  assert.ok(Math.abs(calib.scale[0] - 0.4) < 1e-9, `画布标定：200px/500px × 1 米 = 0.4 米（实际 ${calib.scale[0]}）`)
  // 厚度（height 米）不受标定影响
  assert.ok(Math.abs(calib.scale[1] - 0.1) < 1e-9)
  // 非法 canvasHeightPx → 400
  assert.throws(
    () => parseDrawModelRequest(JSON.stringify({
      strokes: [stroke],
      options: { ...opts, canvasHeightPx: -3 }
    })),
    /canvasHeightPx 需为正数/
  )
})

// —— 六期修复：叶片旋转副本尺寸漂移 + 防护罩外环 10 段失圆 ——

/** 电风扇叶片 40×28 扁椭圆（首尾同点闭合，与 draw-fan.js loop 同构）；ang=旋转角（弧度）。 */
function fanBlade(cx: number, cy: number, ang = 0): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const x = cx + 14 + 40 * Math.cos(a)
    const y = cy + 28 * Math.sin(a)
    const c = Math.cos(ang)
    const s = Math.sin(ang)
    pts.push([cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c])
  }
  return pts
}

/** 前端圆工具同构：N 等距点 + 首尾闭合点。 */
function toolCircle(cx: number, cy: number, r: number, n = 24): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  pts.push([pts[0][0], pts[0][1]])
  return pts
}

// 与画布实测同标定：画布高 320px = 1 米（1px = 1/320 米）
const fanOpts: ModelOptions = { mode: 'extrude', shape: 'cylinder', size: 0.03, count: 10, heightMeters: 1, canvasHeightPx: 320 }

const FAN_CX = 302
const FAN_CY = 250

// —— 缺陷 1：椭圆 solid 的 scale 用轴对齐 bbox 算，旋转副本尺寸漂移（修复前副本 0.196 vs 源 0.25，差 22%）——

test('solid: rotated ellipse copies keep rotation-invariant scale (fan blades all identical)', () => {
  const strokes: Stroke[] = [0, 120, 240].map((deg, i) => ({
    id: 'b' + i,
    points: fanBlade(FAN_CX, FAN_CY, (deg * Math.PI) / 180),
    render: 'solid' as const,
    height: 0.002,
    axis: 'side' as const
  }))
  const { items } = generateModel(strokes, fanOpts)
  assert.equal(items.length, 3)
  // 三片 scale 逐位一致（相对差 = 0 < 1%）；长轴 40px×2/320 = 0.25，短轴 28px×2/320 = 0.175
  const s0 = items[0].scale
  assert.ok(Math.abs(s0[0] - 0.25) / 0.25 < 1e-9, `长轴直径 ${s0[0]}`)
  assert.ok(Math.abs(s0[2] - 0.175) / 0.175 < 1e-9, `短轴直径 ${s0[2]}`)
  for (const item of items) {
    assert.equal(item.scale[1], 0.002)
    assert.equal(item.scale[0], s0[0]) // 三片 scale[0] 逐位相同
    assert.equal(item.scale[2], s0[2]) // 三片 scale[2] 逐位相同
  }
  // 任意旋转角（45° 等非轴线对齐角）同样不变
  const tilted = generateModel([{ id: 't', points: fanBlade(FAN_CX, FAN_CY, Math.PI / 4), render: 'solid', height: 0.002, axis: 'side' }], fanOpts).items[0]
  assert.equal(tilted.scale[0], s0[0])
  assert.equal(tilted.scale[2], s0[2])
})

test('solid: circle stays circular with rotation-invariant radii (motor not distorted)', () => {
  const motor = generateModel([
    { id: 'm', points: toolCircle(FAN_CX, FAN_CY, 12), render: 'solid', height: 0.03, axis: 'side' }
  ], fanOpts).items[0]
  // 圆：主轴直径 = bbox 直径 = 24px → 0.075 米，scale[0] == scale[2]（不随采样/浮点歪斜）
  assert.equal(motor.scale[0], motor.scale[2])
  assert.ok(Math.abs(motor.scale[0] - 0.075) / 0.075 < 1e-9, `电机直径 ${motor.scale[0]}`)
  assert.equal(motor.scale[1], 0.03)
  // 旋转 23° 的圆副本同样圆（不依赖采样对齐主轴）
  const ring = toolCircle(FAN_CX, FAN_CY, 12).map(([x, y]) => {
    const c = Math.cos(0.4)
    const s = Math.sin(0.4)
    return [FAN_CX + (x - FAN_CX) * c - (y - FAN_CY) * s, FAN_CY + (x - FAN_CX) * s + (y - FAN_CY) * c] as [number, number]
  })
  const tilted = generateModel([{ id: 'm2', points: ring, render: 'solid', height: 0.03, axis: 'side' }], fanOpts).items[0]
  assert.equal(tilted.scale[0], tilted.scale[2])
  assert.ok(Math.abs(tilted.scale[0] - 0.075) / 0.075 < 1e-9, `旋转圆直径 ${tilted.scale[0]}`)
})

test('solid: lathe-mode circle bottom regression (cup base stays a round disc)', () => {
  // 杯底：lathe 模式下圆 solid（r=27px）——主轴半径与 bbox 一致，行为不回归
  const { items } = generateModel(
    [{ id: 'base', points: toolCircle(302, 250, 27), render: 'solid', height: 0.005 }],
    { ...fanOpts, mode: 'lathe' }
  )
  assert.equal(items.length, 1)
  const item = items[0]
  assert.equal(item.resourceId, CYLINDER_RESOURCE_ID)
  assert.ok(Math.abs(item.scale[0] - 54 / 320) / (54 / 320) < 1e-9, `杯底直径 ${item.scale[0]}`) // 54px → 0.16875 米
  assert.equal(item.scale[0], item.scale[2])
  assert.equal(item.scale[1], 0.005)
  assert.equal(item.position[1], 0.0025) // 底贴 y=0
})

test('solid: rectangle keeps axis-aligned bbox scale (unchanged semantics)', () => {
  // 旋转矩形副本：矩形轮廓仍按 bbox 语义（宽/深 = 轴对齐包围盒），不进入主轴分支
  const rect: [number, number][] = [[0, 0], [100, 0], [100, 60], [0, 60], [0, 0]]
  const base = generateModel([{ id: 'r', points: rect, render: 'solid', height: 0.08 }], solidOpts).items[0]
  assert.deepEqual(base.scale, [100 / 30, 0.08, 2])
  const c = Math.cos(0.3)
  const sin = Math.sin(0.3)
  const rotated = rect.map(([x, y]) => [50 + (x - 50) * c - (y - 30) * sin, 30 + (x - 50) * sin + (y - 30) * c] as [number, number])
  const tilted = generateModel([{ id: 'r2', points: rotated, render: 'solid', height: 0.08 }], solidOpts).items[0]
  assert.equal(tilted.resourceId, BOX_RESOURCE_ID)
  // bbox 语义保留：宽/深 = 旋转后轴对齐包围盒（scale 用全局包络高标定：2/(y1−y0)）
  const x0 = Math.min(...rotated.map((p) => p[0]))
  const x1 = Math.max(...rotated.map((p) => p[0]))
  const y0 = Math.min(...rotated.map((p) => p[1]))
  const y1 = Math.max(...rotated.map((p) => p[1]))
  const scale2 = 2 / (y1 - y0)
  assert.deepEqual(tilted.scale, [(x1 - x0) * scale2, 0.08, (y1 - y0) * scale2])
})

test('solid: sphere resourceId override → 10009002 ball with uniform diameter scale', () => {
  const { items } = generateModel(
    [{ id: 'sp', points: toolCircle(100, 100, 30), render: 'solid', height: 0.1, resourceId: SPHERE_RESOURCE_ID }],
    solidOpts
  )
  assert.equal(items.length, 1)
  const item = items[0]
  assert.equal(item.resourceId, SPHERE_RESOURCE_ID)
  // 60px 圆、包络高 60px = 2 米 → 直径 2；球体等比 scale（不受 height 影响，height 仅定位）
  assert.deepEqual(item.scale, [2, 2, 2])
  assert.deepEqual(item.rotation, [0, 0, 0])
  assert.equal(item.position[1], 0.05) // y = 厚度/2 + lift(0) = 0.05
  assert.equal(item.position[2], 0)
  // 矩形轮廓 → 明确报错（球体只接受圆/椭圆）
  const rect: [number, number][] = [[0, 0], [100, 0], [100, 60], [0, 60], [0, 0]]
  assert.throws(
    () => generateModel([{ id: 'r', points: rect, render: 'solid', height: 0.1, resourceId: SPHERE_RESOURCE_ID }], solidOpts),
    /球体渲染需要圆\/椭圆轮廓/
  )
})

test('parse: sphere resourceId passes through, unknown base element rejected', () => {
  const opts = { mode: 'extrude', shape: 'cylinder', size: 0.2, count: 8, heightMeters: 2 }
  const ring = toolCircle(100, 100, 20)
  const { strokes } = parseDrawModelRequest(JSON.stringify({
    strokes: [{ id: 'sp', points: ring, render: 'solid', height: 0.1, resourceId: SPHERE_RESOURCE_ID }],
    options: opts
  }))
  assert.equal(strokes[0].resourceId, SPHERE_RESOURCE_ID)
  assert.throws(
    () => parseDrawModelRequest(JSON.stringify({
      strokes: [{ id: 'b', points: ring, render: 'solid', height: 0.1, resourceId: 10009005 }],
      options: opts
    })),
    /基础元件无效/
  )
})

// —— 七期修复：旋转副本朝向（叶片 0/120/240 辐向，angle → rotation[1]） ——

/** 与 makeRotationCopies 同构的旋转副本点：绕 (cx,cy) 旋转 θ（弧度）；k=0 为源。 */
function rotatedBladeCopy(k: number, n: number): [number, number][] {
  return fanBlade(FAN_CX, FAN_CY, (2 * Math.PI * k) / n)
}

test('solid: stroke.angle encodes canvas rotation into rotation[1] (front/up, degrees)', () => {
  // front + θ → [90, θ°, 0]：长轴（局部 X）→ (cosθ,0,−sinθ) 水平辐向、短轴（局部 Z）→ (0,−1,0)
  // 竖直、厚度（局部 Y）→ (sinθ,0,cosθ) 水平——叶片朝向（短轴即叶片高度）
  const front = generateModel([
    { id: 'f', points: fanBlade(FAN_CX, FAN_CY), render: 'solid', height: 0.002, axis: 'front', angle: (2 * Math.PI) / 3 }
  ], fanOpts).items[0]
  assert.ok(Math.abs(front.rotation[0] - 90) < 1e-6 && Math.abs(front.rotation[1] - 120) < 1e-6 && front.rotation[2] === 0, `rotation=${front.rotation}`)
  const major = apply(yxzMatrix(front.rotation), [1, 0, 0])
  const minor = apply(yxzMatrix(front.rotation), [0, 0, 1])
  const thick = apply(yxzMatrix(front.rotation), [0, 1, 0])
  assert.ok(Math.abs(major[1]) < 1e-9, `front+θ 长轴水平（${major}）`)
  assert.ok(Math.abs(minor[0]) < 1e-9 && Math.abs(minor[2]) < 1e-9 && Math.abs(Math.abs(minor[1]) - 1) < 1e-9, `短轴竖直（${minor}）`)
  assert.ok(Math.abs(thick[1]) < 1e-9, `厚度水平（${thick}）`)
  // up + θ → [0, θ°, 0]：地面椭圆绕垂直轴转 θ
  const up = generateModel([
    { id: 'u', points: fanBlade(FAN_CX, FAN_CY), render: 'solid', height: 0.002, axis: 'up', angle: Math.PI / 3 }
  ], fanOpts).items[0]
  assert.ok(Math.abs(up.rotation[0]) < 1e-9 && Math.abs(up.rotation[1] - 60) < 1e-6 && up.rotation[2] === 0, `rotation=${up.rotation}`)
  // 无 angle（源笔画缺省）→ 不引入绕 Y 旋转，旧行为不变
  const plain = generateModel([
    { id: 'p', points: fanBlade(FAN_CX, FAN_CY), render: 'solid', height: 0.002, axis: 'front' }
  ], fanOpts).items[0]
  assert.deepEqual(plain.rotation, [90, 0, 0])
  // 非整角/负角同样按度数透传
  const neg = generateModel([
    { id: 'n', points: fanBlade(FAN_CX, FAN_CY), render: 'solid', height: 0.002, axis: 'up', angle: -0.5 }
  ], fanOpts).items[0]
  assert.ok(Math.abs(neg.rotation[1] - (-0.5 * 180) / Math.PI) < 1e-9)
})

test('solid: rotated blade copies → rotations 0/120/240 around Y, scale identical (fan朝向)', () => {
  // 与 makeRotationCopies 同构：源无 angle；副本 points 绕中心转 θ 且记录 angle=θ（弧度）
  const strokes: Stroke[] = [0, 1, 2].map((k) => ({
    id: 'b' + k,
    points: rotatedBladeCopy(k, 3),
    render: 'solid' as const,
    height: 0.002,
    axis: 'front' as const,
    ...(k === 0 ? {} : { angle: (2 * Math.PI * k) / 3 })
  }))
  const { items } = generateModel(strokes, fanOpts)
  assert.equal(items.length, 3)
  const rotations = items.map((i) => i.rotation)
  assert.deepEqual(rotations[0], [90, 0, 0])
  assert.ok(Math.abs(rotations[1][1] - 120) < 1e-6, `副本1 rotation[1] ≈ 120（${rotations[1]}）`)
  assert.ok(Math.abs(rotations[2][1] - 240) < 1e-6, `副本2 rotation[1] ≈ 240（${rotations[2]}）`)
  assert.deepEqual([rotations[1][0], rotations[1][2]], [90, 0])
  assert.deepEqual([rotations[2][0], rotations[2][2]], [90, 0])
  // 三片绕 Y 两两相差 120°（任意符号/基准下仍满足辐向）
  const ys = rotations.map((r) => r[1])
  for (let k = 1; k < 3; k++) {
    assert.ok(Math.abs((((ys[k] - ys[k - 1]) % 360) + 360) % 360 - 120) < 1e-9, `Δ${k} = ${ys[k]} − ${ys[k - 1]}`)
  }
  // scale 全部一致（上轮成果不回归）：[0.25, 0.002, 0.175]
  const s0 = items[0].scale
  for (const item of items) assert.deepEqual(item.scale, s0)
  assert.ok(Math.abs(s0[0] - 0.25) / 0.25 < 1e-9 && Math.abs(s0[2] - 0.175) / 0.175 < 1e-9, `叶片尺寸 ${s0}`)
  // 朝向向量：三片长轴都在水平面（y≈0）且两两成 120°（辐向展开，不竖直）
  const majors = items.map((i) => normalize3(apply(yxzMatrix(i.rotation), [1, 0, 0])))
  for (const m of majors) assert.ok(Math.abs(m[1]) < 1e-9, `长轴水平（${m}）`)
  assert.ok(Math.abs(dot(majors[0], majors[1]) - Math.cos((2 * Math.PI) / 3)) < 1e-9)
  assert.ok(Math.abs(dot(majors[1], majors[2]) - Math.cos((2 * Math.PI) / 3)) < 1e-9)
})

test('solid: angle no-op for circle/rectangle; parse passes angle through (缺省不写/400)', () => {
  // 圆：各向同性，angle 不影响 scale/外观；side 分量不变
  const circle = generateModel([
    { id: 'm', points: toolCircle(FAN_CX, FAN_CY, 12), render: 'solid', height: 0.03, axis: 'side', angle: 0.7 }
  ], fanOpts).items[0]
  assert.equal(circle.scale[0], circle.scale[2])
  assert.deepEqual([circle.rotation[0], circle.rotation[2]], [0, -90])
  // 矩形：angle 不透写——rotation 零旋转、bbox scale 不变（语义保持）
  const rect: [number, number][] = [[0, 0], [100, 0], [100, 60], [0, 60], [0, 0]]
  const box = generateModel([{ id: 'r', points: rect, render: 'solid', height: 0.08, angle: 0.3 }], solidOpts).items[0]
  assert.deepEqual(box.rotation, [0, 0, 0])
  assert.deepEqual(box.scale, [100 / 30, 0.08, 2])
  // parse：合法数值透传；缺省不写；非数值 / NaN → 400
  const ring: [number, number][] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ring.push([10 + 5 * Math.cos(a), 10 + 5 * Math.sin(a)])
  }
  ring.push(ring[0])
  const opts = { mode: 'extrude', shape: 'cylinder', size: 0.2, count: 8, heightMeters: 2 }
  const { strokes } = parseDrawModelRequest(JSON.stringify({
    strokes: [
      { id: 'p', points: ring, render: 'solid', height: 0.08, angle: Math.PI / 3 },
      { id: 'q', points: ring, render: 'solid', height: 0.08 }
    ],
    options: opts
  }))
  assert.equal(strokes[0].angle, Math.PI / 3)
  assert.equal('angle' in strokes[1], false)
  for (const [bad, msg] of [
    [{ id: 'x', points: ring, render: 'solid', height: 0.08, angle: 'x' }, /角度无效/],
    [{ id: 'x', points: ring, render: 'solid', height: 0.08, angle: NaN }, /角度无效/]
  ] as const) {
    assert.throws(
      () => parseDrawModelRequest(JSON.stringify({ strokes: [bad], options: opts })),
      msg
    )
  }
})

// —— 十期（ADR-0001）：transform 表达旋转副本 3D 语义（绕 Z 三叶，不再绕 Y） ——

test('solid: front rotated copies use transform (rotation around Z, y offset from canvas)', () => {
  // 三片风扇叶片：源椭圆中心 (316,250) 绕 (302,250) 转 k·120°；画布 y 偏移 14·sin120° px = 12.124px
  // transform.rotation = [90-θ°, 90, 90]（绕 Z 闭式）；transform.position[1] = -dyPx/320（画布 y 向下）
  const dyM = (14 * Math.sin((2 * Math.PI) / 3)) / 320
  const strokes: Stroke[] = [
    { id: 'blade_src', points: fanBlade(FAN_CX, FAN_CY), render: 'solid' as const, height: 0.002, axis: 'front' as const, lift: 0.414625 },
    ...[1, 2].map((k) => ({
      id: 'b' + k,
      points: rotatedBladeCopy(k, 3),
      render: 'solid' as const,
      height: 0.002,
      axis: 'front' as const,
      lift: 0.414625,
      transform: {
        rotation: [90 + (k * 120), 90, 90] as [number, number, number],
        position: [0, k === 1 ? -dyM : dyM, 0] as [number, number, number]
      }
    }))
  ]
  const { items } = generateModel(strokes, fanOpts)
  assert.equal(items.length, 3)
  const src = items[0]
  // 源笔画：无 transform → 老路径（rotation [90,0,0]，y = lift 中心）
  assert.ok(src.rotation[0] === 90 && src.rotation[1] === 0 && src.rotation[2] === 0, `源 rotation=${src.rotation}`)
  assert.ok(Math.abs(src.position[1] - 0.415625) < 1e-9 && src.position[2] === 0, `源 pos=${src.position}`)
  // 副本1（θ=120°）：rotation 覆盖为 [210,90,90]；y = 中心 - dyM（画布向下 → 世界向下）；z 保持 0
  const b2 = items[1]
  assert.ok(Math.abs(b2.rotation[0] - 210) < 1e-9 && b2.rotation[1] === 90 && b2.rotation[2] === 90, `副本1 rotation=${b2.rotation}`)
  assert.ok(Math.abs(b2.position[1] - (0.415625 - dyM)) < 1e-9, `副本1 y=${b2.position[1]} 预期=${0.415625 - dyM}`)
  assert.ok(Math.abs(b2.position[2]) < 1e-12, `副本1 z 应保持 0（同一竖直平面，不绕 Y），实际 ${b2.position[2]}`)
  // 副本2（θ=240°）：y 对称向上
  const b3 = items[2]
  assert.ok(Math.abs(b3.rotation[0] - 330) < 1e-9, `副本2 rotation=${b3.rotation}`)
  assert.ok(Math.abs(b3.position[1] - (0.415625 + dyM)) < 1e-9, `副本2 y=${b3.position[1]}`)
  assert.ok(Math.abs(b3.position[2]) < 1e-12, `副本2 z 应保持 0，实际 ${b3.position[2]}`)
  // 两副本 x 对称（同一全局居中语义下位置镜像）；z 全 0 → 三片在同一竖直平面
  assert.ok(Math.abs(b2.position[0] - b3.position[0]) < 1e-9, `副本 x 应相等：${b2.position[0]} vs ${b3.position[0]}`)
  // 三片 y 呈 120° 环绕关系（中心片在中间，上下片对称偏移 dyM）
  assert.ok(b2.position[1] < src.position[1] && src.position[1] < b3.position[1], `三片高度应中-低-高排列`)
  // 长轴方向 = 位置方向（相对电机中心），三叶对称辐射：
  // 副本1 位置 240° → 长轴 (cos240°, sin240°, 0)（X-Y 竖直平面内径向）
  const major = apply(yxzMatrix(b2.rotation), [1, 0, 0])
  assert.ok(
    Math.abs(major[0] - Math.cos((4 * Math.PI) / 3)) < 1e-9 &&
    Math.abs(major[1] - Math.sin((4 * Math.PI) / 3)) < 1e-9 &&
    Math.abs(major[2]) < 1e-9,
    `副本1 长轴=${major} 预期=(cos240,sin240,0)`
  )
  // 副本2 位置 120° → 长轴 (cos120°, sin120°, 0)
  const major2 = apply(yxzMatrix(b3.rotation), [1, 0, 0])
  assert.ok(
    Math.abs(major2[0] - Math.cos((2 * Math.PI) / 3)) < 1e-9 &&
    Math.abs(major2[1] - Math.sin((2 * Math.PI) / 3)) < 1e-9 &&
    Math.abs(major2[2]) < 1e-9,
    `副本2 长轴=${major2} 预期=(cos120,sin120,0)`
  )
  // 厚度沿 Z（面朝前后）——叶片面始终面向气流方向
  const thick = apply(yxzMatrix(b2.rotation), [0, 1, 0])
  assert.ok(Math.abs(thick[0]) < 1e-9 && Math.abs(thick[1]) < 1e-9 && Math.abs(Math.abs(thick[2]) - 1) < 1e-9, `副本1 厚度=${thick} 预期=沿Z`)
})

// —— 八期修复：solid 离地抬升（电机/叶片悬浮——柱体底默认贴 y=0，罩子中心在 0.416） ——

test('solid: lift raises column above ground (position.y = thickness/2 + lift, extrude+lathe)', () => {
  // 电机：r=12px 圆 solid，thickness 0.03；lift 0.400625 → y = 0.015 + 0.400625 = 0.415625（罩子中心）
  const motor = generateModel([
    { id: 'm', points: toolCircle(FAN_CX, FAN_CY, 12), render: 'solid', height: 0.03, axis: 'side', lift: 0.400625 }
  ], fanOpts).items[0]
  assert.ok(Math.abs(motor.position[1] - 0.415625) < 1e-9, `电机 y = ${motor.position[1]}`)
  assert.equal(motor.scale[0], motor.scale[2]) // 圆各向同性不回归
  // 缺省（无 lift）→ 贴地不变：y = thickness/2
  const plain = generateModel([
    { id: 'p', points: toolCircle(FAN_CX, FAN_CY, 12), render: 'solid', height: 0.03, axis: 'side' }
  ], fanOpts).items[0]
  assert.equal(plain.position[1], 0.015)
  // lathe 共用 solidColumn：lift 同样生效；缺省 0 不破坏杯底回归（y = 0.0025）
  const latheLifted = generateModel([
    { id: 'l', points: toolCircle(302, 250, 27), render: 'solid', height: 0.005, lift: 0.2 }
  ], { ...fanOpts, mode: 'lathe' }).items[0]
  assert.ok(Math.abs(latheLifted.position[1] - (0.0025 + 0.2)) < 1e-9, `lathe 抬升 y = ${latheLifted.position[1]}`)
  // 叶片（front + angle）：lift 0.414625 → y = 0.001 + 0.414625 = 0.415625（与电机同高度）
  const blade = generateModel([
    { id: 'b', points: fanBlade(FAN_CX, FAN_CY), render: 'solid', height: 0.002, axis: 'front', lift: 0.414625 }
  ], fanOpts).items[0]
  assert.ok(Math.abs(blade.position[1] - 0.415625) < 1e-9, `叶片 y = ${blade.position[1]}`)
})

test('solid: rotated blade copies inherit lift (all at guard-center height, 0/120/240 kept)', () => {
  // 与 makeRotationCopies 同构：源无 angle；副本 points 绕中心转 θ 且记录 angle=θ；
  // 前端透传 src.lift（src.lift !== undefined → stroke.lift = src.lift），三片同 lift
  const strokes: Stroke[] = [0, 1, 2].map((k) => ({
    id: 'b' + k,
    points: rotatedBladeCopy(k, 3),
    render: 'solid' as const,
    height: 0.002,
    axis: 'front' as const,
    lift: 0.414625,
    ...(k === 0 ? {} : { angle: (2 * Math.PI * k) / 3 })
  }))
  const { items } = generateModel(strokes, fanOpts)
  assert.equal(items.length, 3)
  for (const item of items) {
    assert.ok(Math.abs(item.position[1] - 0.415625) < 1e-9, `叶片 ${item.group} y = ${item.position[1]}`)
  }
  // 上轮成果不回归：rotation 0/120/240、scale [0.25, 0.002, 0.175]
  const ys = items.map((i) => i.rotation[1])
  assert.deepEqual(items[0].rotation, [90, 0, 0])
  assert.ok(Math.abs(ys[1] - 120) < 1e-6 && Math.abs(ys[2] - 240) < 1e-6)
  const s0 = items[0].scale
  for (const item of items) assert.deepEqual(item.scale, s0)
  assert.ok(Math.abs(s0[0] - 0.25) / 0.25 < 1e-9 && Math.abs(s0[2] - 0.175) / 0.175 < 1e-9)
})

test('parse: lift passes through (缺省不写) and validated (非数值/NaN/负数 → 400)', () => {
  const ring: [number, number][] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ring.push([10 + 5 * Math.cos(a), 10 + 5 * Math.sin(a)])
  }
  ring.push(ring[0])
  const opts = { mode: 'extrude', shape: 'cylinder', size: 0.2, count: 8, heightMeters: 2 }
  const { strokes } = parseDrawModelRequest(JSON.stringify({
    strokes: [
      { id: 'p', points: ring, render: 'solid', height: 0.08, lift: 0.4 },
      { id: 'q', points: ring, render: 'solid', height: 0.08 },
      { id: 'r', points: [[0, 0], [10, 10]] }
    ],
    options: opts
  }))
  assert.equal(strokes[0].lift, 0.4)
  assert.equal('lift' in strokes[1], false) // 缺省不写
  assert.equal('lift' in strokes[2], false)
  for (const [bad, msg] of [
    [{ id: 'x', points: ring, render: 'solid', height: 0.08, lift: 'x' }, /抬升无效/],
    [{ id: 'x', points: ring, render: 'solid', height: 0.08, lift: NaN }, /抬升无效/],
    [{ id: 'x', points: ring, render: 'solid', height: 0.08, lift: -0.1 }, /抬升无效/]
  ] as const) {
    assert.throws(
      () => parseDrawModelRequest(JSON.stringify({ strokes: [bad], options: opts })),
      msg
    )
  }
})

// —— 缺陷 2：extrude 封闭平滑轮廓被压回 count+1 段，圆环只剩 10 段（十二边形感）——

test('extrude: closed smooth ring keeps ≥20 uniform segments (guard ring not squashed)', () => {
  // 防护罩外环：24 点圆 + 闭合点（r=80px）。修复前重采样 11 点 = 10 段；修复后按
  // max(抽稀点数, count×3) 弧长重采样 → 段数 ≥ 20 且段长均匀
  const { items } = generateModel([{ id: 'ring', points: toolCircle(FAN_CX, FAN_CY, 80) }], fanOpts)
  const segs = items.filter((i) => i.group === 'ring')
  assert.ok(segs.length >= 20, `环段数 ≥ 20（实际 ${segs.length}）`)
  assert.ok(segs.length !== 10, '不再退化为 10 段')
  // 每段长度接近（均匀重采样）
  const lens = segs.map((i) => i.scale[1])
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length
  for (const l of lens) {
    assert.ok(Math.abs(l - mean) / mean < 0.01, `段长均匀（${l} vs ${mean}）`)
  }
  // 确定性：两次生成逐位一致
  const again = generateModel([{ id: 'ring', points: toolCircle(FAN_CX, FAN_CY, 80) }], fanOpts)
  assert.deepEqual(again.items, items)
})

test('extrude: straight spokes stay 1 segment (17期优化), curved polylines keep count segments, closed detail preserved', () => {
  // 开放直线笔画（辐条/支架 line，2 点）→ 1 段整根杆（原为 count 段）
  const line: Stroke = { id: 'spoke', points: [[FAN_CX, FAN_CY], [FAN_CX + 80, FAN_CY]] }
  const { items } = generateModel([line], fanOpts)
  assert.equal(items.length, 1)
  // 开放折线（3+ 点非共线，抽稀后保留）→ 仍恰好 count 段
  const poly: Stroke = { id: 'poly', points: [[FAN_CX, FAN_CY], [FAN_CX + 40, FAN_CY + 10], [FAN_CX + 80, FAN_CY]] }
  const { items: polyItems } = generateModel([poly], fanOpts)
  assert.equal(polyItems.length, 10)
  // 封闭折线轮廓（矩形工具 5 点）不丢尖角：细节点数下限 = count×3
  const rect: Stroke = { id: 'rect', points: [[0, 0], [100, 0], [100, 60], [0, 60], [0, 0]] }
  const { items: rectItems } = generateModel([rect], { ...fanOpts, count: 4 })
  assert.ok(rectItems.length >= 12, `封闭折线 ≥ count×3 段（实际 ${rectItems.length}）`)
})

test('fit: keepClosedDetail opt-in only (straight open strokes stay 2 points, lathe unaffected)', () => {
  const ring = closedRing(40, 40)
  const stroke: Stroke = { id: 'c', points: ring }
  // 缺省（web-shared 预览、lathe）：仍压回 sampleCount 点
  const plain = fitStroke(stroke, 11)
  assert.ok(plain !== null)
  assert.equal(plain.points.length, 11)
  assert.equal(plain.closed, true)
  // 打开 keepClosedDetail：保留细节点数（≥ max(rdp, sampleCount×3)）
  const detailed = fitStroke(stroke, 11, { keepClosedDetail: true })
  assert.ok(detailed !== null)
  assert.ok(detailed.points.length >= 33, `封闭轮廓点数 ≥ count×3（实际 ${detailed.points.length}）`)
  assert.equal(detailed.closed, true)
  // 开放直线笔画（2 点）不细分：无论 keepClosedDetail 与否都保持 2 点（17期优化）
  const open: Stroke = { id: 'o', points: [[0, 0], [100, 0]] }
  const openDetailed = fitStroke(open, 11, { keepClosedDetail: true })
  assert.ok(openDetailed !== null)
  assert.equal(openDetailed.points.length, 2)
  const openPlain = fitStroke(open, 11)
  assert.ok(openPlain !== null)
  assert.equal(openPlain.points.length, 2)
})

// —— 十一期：层级组（group）与旋转扫掠冲突检测 ——

function ringPoints(cx: number, cy: number, r: number, n = 12): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  pts.push(pts[0])
  return pts
}

const sweepOpts: ModelOptions = { mode: 'extrude', shape: 'cylinder', size: 0.05, count: 8, heightMeters: 2, canvasHeightPx: 320 }

test('parse: group passes through (缺省不写) and validated (空串/非字符串 → 400)', () => {
  const ring = ringPoints(10, 10, 5)
  const { strokes } = parseDrawModelRequest(JSON.stringify({
    strokes: [
      { id: 'g', points: ring, render: 'solid', height: 0.02, group: 'fan' },
      { id: 's', points: [[0, 0], [10, 10]] }
    ],
    options: sweepOpts
  }))
  assert.equal(strokes[0].group, 'fan')
  assert.equal('group' in strokes[1], false) // 缺省不写（静止件）
  for (const bad of [
    { id: 'x', points: ring, render: 'solid', height: 0.02, group: '' },
    { id: 'x', points: ring, render: 'solid', height: 0.02, group: '  ' },
    { id: 'x', points: ring, render: 'solid', height: 0.02, group: 7 }
  ] as const) {
    assert.throws(
      () => parseDrawModelRequest(JSON.stringify({ strokes: [bad], options: sweepOpts })),
      /层级组无效/
    )
  }
})

test('warnings: 旋转组扫掠盘与同平面静止件重叠 → warning（自然发现物理冲突）', () => {
  // 叶片：大圆 solid front，lift 抬到 0.4m；辐条：细杆从中心到环边，同平面（z=0）
  const yPx = 0.4 / (sweepOpts.heightMeters / sweepOpts.canvasHeightPx!) // lift 0.4m → 画布 y=64
  const strokes: Stroke[] = [
    { id: 'blade', points: ringPoints(0, yPx, 50), render: 'solid', height: 0.002, axis: 'front', lift: 0.4, group: 'fan' },
    { id: 'spoke', points: [[0, yPx], [50, yPx]] }
  ]
  const { items } = generateModel(strokes, sweepOpts)
  const warnings = sweepWarnings(strokes, items)
  assert.ok(warnings.some((w) => w.includes('旋转组「fan」') && w.includes('静止笔画 #1')), `应有辐条冲突警告：${warnings.join(' | ')}`)
})

test('warnings: 静止件移出旋转平面（transform.position[2] 偏移）→ 无 warning', () => {
  const yPx = 0.4 / (sweepOpts.heightMeters / sweepOpts.canvasHeightPx!)
  const strokes: Stroke[] = [
    { id: 'blade', points: ringPoints(0, yPx, 50), render: 'solid', height: 0.002, axis: 'front', lift: 0.4, group: 'fan' },
    { id: 'spoke', points: [[0, yPx], [50, yPx]], transform: { position: [0, 0, -0.08] } } // 移到电机平面
  ]
  const { items } = generateModel(strokes, sweepOpts)
  assert.deepEqual(sweepWarnings(strokes, items), [])
})

test('warnings: 全部静止（无组）→ 无 warning；组内互检不误报', () => {
  const yPx = 0.4 / (sweepOpts.heightMeters / sweepOpts.canvasHeightPx!)
  const strokes: Stroke[] = [
    { id: 'a', points: ringPoints(0, yPx, 50), render: 'solid', height: 0.002, axis: 'front', lift: 0.4 },
    { id: 'b', points: [[0, yPx], [50, yPx]] }
  ]
  const { items } = generateModel(strokes, sweepOpts)
  assert.deepEqual(sweepWarnings(strokes, items), [])
})
