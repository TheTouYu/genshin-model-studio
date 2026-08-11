/**
 * 二期画线建模：核心生成模块单元测试（任务 A）。
 * 风格对齐 tests/golden.test.ts（node:test + assert/strict，纯确定性断言）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { BOX_RESOURCE_ID, CYLINDER_RESOURCE_ID, generateModel, toStructureItems } from '../src/draw/types.js'
import { detectClosed, fitStroke, resampleUniform, simplifyRdp } from '../src/draw/fitting.js'
import { catmullRom } from '../src/draw/spline.js'
import { parseDrawModelRequest } from '../src/web-shared.js'
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
  // 多笔画：各轮廓包围盒中心按画布位置映射到世界 x/z（全局归一化居中）
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
  // 全局包络 0..240 × 0..140 → s = 4/140；A 中心画布 (20,20) → 世界 x = 20s − 240s/2，z = 20s − 140s/2
  const s = 4 / 140
  assert.ok(Math.abs(ia.position[0] - (20 * s - (240 * s) / 2)) < 1e-9, 'A x')
  assert.ok(Math.abs(ia.position[2] - (20 * s - (140 * s) / 2)) < 1e-9, 'A z')
  assert.ok(Math.abs(ib.position[0] - (220 * s - (240 * s) / 2)) < 1e-9, 'B x')
  assert.ok(Math.abs(ib.position[2] - (120 * s - (140 * s) / 2)) < 1e-9, 'B z')
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
  assert.equal(discs.length, 8) // 其余笔画照旧 lathe 盘片
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
  assert.deepEqual(strokes[0], { id: 's1', points: [[0, 0], [10, 10]] }) // 缺省不写新字段
  assert.deepEqual(strokes[1], { id: 's2', points: ring, render: 'solid', height: 0.08, axis: 'front' })
  assert.deepEqual(strokes[2], { id: 's3', points: [[0, 0], [10, 10]], render: 'rod' })
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
