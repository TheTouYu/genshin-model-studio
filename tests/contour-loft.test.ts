/**
 * contour-loft.test.ts — 任意闭合轮廓环放样（确定性）测试。
 *
 * 覆盖：
 * - resampleClosedContour：200 点等弧长、确定性两次一致、首点保持、<3 点抛中文错。
 * - 两环圆柱（8 点 × 2 环 + cap both）→ verify 通过（水密/法线朝外）；
 *   无 cap（cap none）→ 门禁如实报开边（反例）。
 * - 脚型 contourFromViews → 网格非退化、三角数>0、颜色带生效、两次 sha256 一致。
 * - 非法 rings（长度不一 / 未闭合）→ 抛中文错。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  resampleClosedContour,
  ringsToMesh,
  contourFromViews,
  type Vec3,
  type ColorBand
} from '../src/mesh/contour-loft.js'
import { verifyMesh } from '../src/mesh/verify.js'

function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

/** 单位圆（稠密采样，闭合轮廓）。 */
function circleOutline(n = 120): number[][] {
  const pts: number[][] = []
  for (let k = 0; k < n; k++) {
    const th = (2 * Math.PI * k) / n
    pts.push([Math.cos(th), Math.sin(th)])
  }
  return pts
}

/** 把点集视为闭环，计算相邻点（含末→首）的弦长数组。 */
function cyclicChordLengths(pts: number[][]): number[] {
  const out: number[] = []
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k]
    const b = pts[(k + 1) % pts.length]
    out.push(Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  return out
}

/** 逐点总弧长（闭合折线，含末→首段）。 */
function closedPerimeter(pts: number[][]): number {
  return cyclicChordLengths(pts).reduce((a, b) => a + b, 0)
}

/// 一段非对称脚型轮廓（顺时针/逆时针均可，resample 保持绕向）。
function footOutline(): number[][] {
  const pts: number[][] = []
  const AW = 0.05
  const AL = 0.12
  for (let k = 0; k < 60; k++) {
    const th = (2 * Math.PI * k) / 60
    const f = 1 + 0.06 * Math.cos(th) - 0.05 * Math.exp(-((th - 0.7) * (th - 0.7)) / 0.08)
    pts.push([AW * Math.cos(th) * f, AL * Math.sin(th) * f])
  }
  return pts
}

test('resampleClosedContour: 200 点等弧长，弧长均匀', () => {
  const input = circleOutline()
  const total = closedPerimeter(input)
  const out = resampleClosedContour(input, 200)
  assert.equal(out.length, 200)
  // 平滑闭合曲线按弧长均匀重采样 ⇒ 相邻点（含末→首）弦长应近似相等（≈ total/200）。
  const chords = cyclicChordLengths(out).sort((a, b) => a - b)
  const min = chords[0]
  const max = chords[chords.length - 1]
  assert.ok(max / min < 1.02, `cyclic chord spread too large: min=${min} max=${max}`)
  const mean = chords.reduce((a, b) => a + b, 0) / chords.length
  assert.ok(Math.abs(mean - total / 200) < 1e-4, `mean chord ${mean} != arc step ${total / 200}`)
})

test('resampleClosedContour: 首点固定 = 输入首点', () => {
  const input = footOutline()
  const out = resampleClosedContour(input, 128)
  assert.deepEqual(out[0], input[0])
})

test('resampleClosedContour: 方向保持输入绕向（绕向不翻转）', () => {
  const input = footOutline()
  const out = resampleClosedContour(input, 64)
  // 有向面积符号应保持不变。
  const area = (pts: number[][]) => {
    let s = 0
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k]
      const b = pts[(k + 1) % pts.length]
      s += a[0] * b[1] - b[0] * a[1]
    }
    return s
  }
  assert.equal(Math.sign(area(out)), Math.sign(area(input)))
})

test('resampleClosedContour: 确定性两次一致', () => {
  const input = footOutline()
  const a = resampleClosedContour(input, 200)
  const b = resampleClosedContour(input, 200)
  assert.deepEqual(a, b)
})

test('resampleClosedContour: 少于 3 点抛中文错', () => {
  assert.throws(() => resampleClosedContour([[0, 0], [1, 1]]), /闭合轮廓至少需要 3 个点/)
})

test('resampleClosedContour: 显式闭合重复点（首尾同点）可正确处理', () => {
  const input = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]
  const out = resampleClosedContour(input, 8)
  assert.equal(out.length, 8)
  assert.deepEqual(out[0], [0, 0])
})

/// 两环圆柱：底/顶环（圆，CCW），cap both → 水密。
function cylinderRings(segments = 8, radius = 0.5, height = 1): Vec3[][] {
  const bottom: Vec3[] = []
  const top: Vec3[] = []
  for (let k = 0; k < segments; k++) {
    const a = (k / segments) * 2 * Math.PI
    bottom.push([Math.cos(a) * radius, 0, Math.sin(a) * radius])
    top.push([Math.cos(a) * radius, height, Math.sin(a) * radius])
  }
  return [bottom, top]
}

test('ringsToMesh: 两环圆柱 + cap both → 水密、法线朝外（verify 通过）', () => {
  const rings = cylinderRings()
  const mesh = ringsToMesh(rings, { cap: 'both' })
  assert.equal(mesh.vertices.length > 0, true)
  assert.equal(mesh.faces.length % 3, 0)
  assert.equal(mesh.faces.length / 3, 2 * 8 * 1 + 2 * 8) // 侧壁 16 + 两盖各 8
  const r = verifyMesh(mesh)
  assert.equal(r.ok, true)
  assert.equal(r.checks.watertight.pass, true)
  assert.equal(r.checks.watertight.openEdges, 0)
  assert.equal(r.checks.normals.pass, true)
  assert.deepEqual(r.failures, [])
})

test('ringsToMesh: 无 cap 为开放管面 → 门禁如实报开边（反例）', () => {
  const rings = cylinderRings()
  const mesh = ringsToMesh(rings, { cap: 'none' })
  const r = verifyMesh(mesh)
  assert.equal(r.checks.watertight.pass, false)
  assert.ok(r.checks.watertight.openEdges > 0, 'open tube must report open edges')
  assert.ok(r.failures.some((f) => f.includes('水密性未通过')))
})

test('contourFromViews: 脚型 → 网格非退化、三角数>0、颜色带生效、两次 sha256 一致', () => {
  const outline = footOutline()
  const profile = [
    { y: 0.0, widthScale: 1.0, centerZ: 0.0 },
    { y: 0.02, widthScale: 0.95, centerZ: 0.01 },
    { y: 0.05, widthScale: 0.7, centerZ: -0.01 },
    { y: 0.09, widthScale: 0.5, centerZ: -0.03 }
  ]
  const rings = contourFromViews(outline, profile, { points: 48 })
  assert.equal(rings.length, 4)
  assert.equal(rings[0].length, 48)

  const bands: ColorBand[] = [
    { t0: 0.0, t1: 0.5, color: '0xE5484D' },
    { t0: 0.5, t1: 1.0, color: '0xFACC15' }
  ]
  const mesh = ringsToMesh(rings, { cap: 'both', colorBands: bands })

  // 非退化：顶点/面非空。
  assert.ok(mesh.vertices.length > 0)
  assert.ok(mesh.faces.length > 0)
  assert.equal(mesh.faces.length % 3, 0)
  // 颜色带生效：颜色数组长度 = 三角数。
  assert.ok(mesh.colors)
  assert.equal(mesh.colors!.length, mesh.faces.length / 3)
  assert.ok(mesh.colors!.every((c) => c.startsWith('0x')))
  // 确定性：同输入两跑 sha256 一致。
  const run = (m: typeof mesh) => sha256Hex(JSON.stringify(m))
  assert.equal(run(mesh), run(ringsToMesh(contourFromViews(outline, profile, { points: 48 }), { cap: 'both', colorBands: bands })))
})

test('ringsToMesh: 环长不一致且未设置 points → 抛中文错', () => {
  const rings: Vec3[][] = [
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
    [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]]
  ]
  assert.throws(() => ringsToMesh(rings), /长度不一致/)
})

test('ringsToMesh: 环点不足 3（未闭合） → 抛中文错', () => {
  const rings: Vec3[][] = [
    [[0, 0, 0], [1, 0, 0]],
    [[0, 0, 1], [1, 0, 1]]
  ]
  assert.throws(() => ringsToMesh(rings), /至少需要 3 个点/)
})

test('ringsToMesh: 环数超 ringCountLimit → 抛中文错', () => {
  const a: Vec3[] = [[0, 0, 0], [1, 0, 0], [0, 1, 0]]
  const b: Vec3[] = [[0, 0, 1], [1, 0, 1], [0, 1, 1]]
  const c: Vec3[] = [[0, 0, 2], [1, 0, 2], [0, 1, 2]]
  assert.throws(() => ringsToMesh([a, b, c], { ringCountLimit: 2 }), /超过上限 2/)
})
