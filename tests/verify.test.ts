/**
 * verify.test.ts — 网格验证门禁（确定性）测试。
 *
 * 覆盖：
 * - 有效样例：水密（焊接 + 端盖）圆柱 → ok=true，全部检查通过。
 * - 反例：4 段开口圆柱（无盖、顶点未跨段共享）→ watertight 不通过（开边）为正确行为；
 *   同时 seams>0（索引未焊接）。
 * - 三个故意损坏样例分别被抓：
 *     ① 裂缝（删一个三角面）→ watertight fail；
 *     ② 反向法线（翻转一个三角绕序）→ normals fail（且 watertight 仍闭合）；
 *     ③ 退化面（零面积三角）→ degenerate.count>0（并同时触发 watertight，见注释）。
 * - 瘦长三角 / 面积比超限样例。
 * - 预算：超限（requested < 单元数）→ budget.pass false + 中文失败含数字；预算内 → pass。
 * - 确定性：同 mesh 两次 gate 结果一致；输入不被修改。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  verifyMesh,
  verifyMeshExport,
  type MeshVerifyInput,
  type MeshVerifyResult
} from '../src/mesh/verify.js'
import { panelize } from '../src/mesh/panelize.js'

/** 水密（焊接 + 端盖）圆柱：底/顶环共享索引，法线朝外。 */
function watertightCylinder(segments = 8, radius = 0.5, height = 1): MeshVerifyInput {
  const vertices: number[][] = []
  const faces: number[] = []
  // 顶点 0 = 底心，1 = 顶心；2..2+s-1 = 底环；2+s..2+2s-1 = 顶环。
  vertices.push([0, 0, 0])
  vertices.push([0, height, 0])
  const bottomStart = 2
  const topStart = 2 + segments
  for (let k = 0; k < segments; k++) {
    const a = (k / segments) * 2 * Math.PI
    vertices.push([Math.cos(a) * radius, 0, Math.sin(a) * radius])
  }
  for (let k = 0; k < segments; k++) {
    const a = (k / segments) * 2 * Math.PI
    vertices.push([Math.cos(a) * radius, height, Math.sin(a) * radius])
  }
  for (let k = 0; k < segments; k++) {
    const k2 = (k + 1) % segments
    const b0 = bottomStart + k
    const b1 = bottomStart + k2
    const t0 = topStart + k
    const t1 = topStart + k2
    // 侧壁四边带：两个三角均朝外（已推导绕序）。
    faces.push(b0, t0, t1, b0, t1, b1)
    // 底盖：朝下（-Y）。
    faces.push(0, b0, b1)
    // 顶盖：朝上（+Y）。
    faces.push(1, t1, t0)
  }
  return { vertices, faces }
}

/** 4 段开口圆柱（无盖、顶点不跨段共享）→ 索引未焊接，存在开边。 */
function openCylinder(segments = 4, radius = 0.5, height = 1): MeshVerifyInput {
  const vertices: number[][] = []
  const faces: number[] = []
  for (let k = 0; k < segments; k++) {
    const a0 = (k / segments) * 2 * Math.PI
    const a1 = ((k + 1) / segments) * 2 * Math.PI
    const b = vertices.length
    vertices.push([Math.cos(a0) * radius, 0, Math.sin(a0) * radius])
    vertices.push([Math.cos(a1) * radius, 0, Math.sin(a1) * radius])
    vertices.push([Math.cos(a1) * radius, height, Math.sin(a1) * radius])
    vertices.push([Math.cos(a0) * radius, height, Math.sin(a0) * radius])
    faces.push(b, b + 1, b + 2, b, b + 2, b + 3)
  }
  return { vertices, faces }
}

/** 裂缝：从水密圆柱删除第一个三角面（其 3 条边由共享转为仅 1 次引用 → 开边）。 */
function crackMesh(): MeshVerifyInput {
  const base = watertightCylinder()
  return { vertices: base.vertices, faces: base.faces.slice(3) }
}

/** 反向法线：翻转水密圆柱第一个三角面的绕序（边集合不变 → 仍闭合）。 */
function invertedNormalMesh(): MeshVerifyInput {
  const base = watertightCylinder()
  const faces = [...base.faces]
  // 翻转第 0 个三角的绕序：(a,b,c) → (c,b,a)，交换第 0 位与第 2 位即可。
  const tmp = faces[0]
  faces[0] = faces[2]
  faces[2] = tmp
  return { vertices: base.vertices, faces }
}

/** 退化面：在水密圆柱上追加一个零面积（共线）三角；该三角也引入 3 条开边。 */
function degenerateMesh(): MeshVerifyInput {
  const base = watertightCylinder()
  const vertices = [...base.vertices]
  const b = vertices.length
  vertices.push([5, 5, 0])
  vertices.push([6, 5, 0])
  vertices.push([7, 5, 0])
  return { vertices, faces: [...base.faces, b, b + 1, b + 2] }
}

/** 单个瘦长三角：minE/maxE < 0.08（也引入开边，作非闭合信息项）。 */
function skinnyMesh(): MeshVerifyInput {
  return {
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 0.01]
    ],
    faces: [0, 1, 2]
  }
}

/** 面积比超限：一大一小两个三角形，p95/p5 >> 20。 */
function areaRatioMesh(): MeshVerifyInput {
  return {
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0], // 面积 ~0.5
      [10, 10, 0],
      [10.001, 10, 0],
      [10, 10, 0.001] // 面积 ~5e-7
    ],
    faces: [0, 1, 2, 3, 4, 5]
  }
}

test('watertight cylinder: gate ok with all checks passing', () => {
  const mesh = watertightCylinder()
  const r = verifyMesh(mesh)
  assert.equal(r.ok, true)
  assert.equal(r.checkedFaces, 32)
  assert.equal(r.checks.watertight.pass, true)
  assert.equal(r.checks.watertight.openEdges, 0)
  assert.equal(r.checks.watertight.nonManifold, 0)
  assert.equal(r.checks.seams.pass, true)
  assert.equal(r.checks.seams.seamCount, 0)
  assert.equal(r.checks.normals.pass, true)
  assert.equal(r.checks.normals.invertedCount, 0)
  assert.equal(r.checks.degenerate.count, 0)
  assert.equal(r.checks.skinny.pass, true)
  assert.equal(r.checks.areaRatio.pass, true)
  assert.equal(r.checks.budget.pass, true)
  assert.deepEqual(r.failures, [])
})

test('open cylinder (no cap, unwelded): watertight fails (open edges) — expected negative', () => {
  const mesh = openCylinder()
  const r = verifyMesh(mesh)
  assert.equal(r.ok, false)
  assert.equal(r.checks.watertight.pass, false)
  assert.ok(r.checks.watertight.openEdges > 0, 'open cylinder must report open edges')
  // 索引未跨段共享 → 重复顶点被近邻检测抓住。
  assert.ok(r.checks.seams.seamCount > 0, 'open cylinder has unwelded duplicate vertices')
  assert.ok(r.failures.some((f) => f.includes('水密性未通过')))
  assert.ok(r.failures.some((f) => f.includes('未焊接顶点')))
})

test('crack (delete one triangle): watertight fails with open edges', () => {
  const r = verifyMesh(crackMesh())
  assert.equal(r.checks.watertight.pass, false)
  assert.ok(r.checks.watertight.openEdges >= 3, `expected >=3 open edges, got ${r.checks.watertight.openEdges}`)
  assert.ok(r.failures.some((f) => f.includes('水密性未通过')))
})

test('inverted normal (flip one winding): normals fail but watertight still closed', () => {
  const r = verifyMesh(invertedNormalMesh())
  assert.equal(r.checks.normals.pass, false)
  assert.ok(r.checks.normals.invertedCount >= 1, 'flipped face must be counted inward')
  assert.equal(r.checks.watertight.pass, true, 'winding flip keeps edge set unchanged → still closed')
  assert.ok(r.failures.some((f) => f.includes('朝内的法线面')))
})

test('degenerate face: zero-area triangle counted (also triggers watertight — documented)', () => {
  const r = verifyMesh(degenerateMesh())
  assert.ok(r.checks.degenerate.count > 0, 'zero-area triangle must be counted')
  assert.equal(r.checks.degenerate.pass, false)
  assert.ok(r.failures.some((f) => f.includes('退化面')))
  // 追加的零面积三角是孤立面，其另一边无配对 → 同时引入开边（如实说明）。
  assert.equal(r.checks.watertight.pass, false)
})

test('skinny triangle: minE/maxE < 0.08 counted and fails pct threshold', () => {
  const r = verifyMesh(skinnyMesh())
  assert.ok(r.checks.skinny.count >= 1, 'must detect the skinny triangle')
  assert.equal(r.checks.skinny.pass, false)
  assert.ok(r.failures.some((f) => f.includes('瘦长三角')))
})

test('areaRatio: p95/p5 exceeds threshold', () => {
  const r = verifyMesh(areaRatioMesh())
  assert.ok(r.checks.areaRatio.value > 20, `expected large ratio, got ${r.checks.areaRatio.value}`)
  assert.equal(r.checks.areaRatio.pass, false)
  assert.ok(r.failures.some((f) => f.includes('面积比率')))
})

test('budget: exceeding requested units fails gate with numbers in Chinese failure', () => {
  const mesh = watertightCylinder()
  const { stats } = panelize(mesh)
  const used = stats.budget.used
  const requested = used - 1
  const r = verifyMesh(mesh, { budget: { requested, used } })
  assert.equal(r.checks.budget.exceeded, true)
  assert.equal(r.checks.budget.pass, false)
  assert.equal(r.checks.budget.requested, requested)
  assert.equal(r.checks.budget.used, used)
  const msg = r.failures.find((f) => f.includes('预算超限'))
  assert.ok(msg, 'must produce a budget failure message')
  assert.ok(msg!.includes(String(requested)), 'message must include the requested budget number')
  assert.ok(msg!.includes(String(used)), 'message must include the used number')
})

test('budget: within requested passes', () => {
  const mesh = watertightCylinder()
  const { stats } = panelize(mesh)
  const used = stats.budget.used
  const r = verifyMesh(mesh, { budget: { requested: used, used } })
  assert.equal(r.checks.budget.exceeded, false)
  assert.equal(r.checks.budget.pass, true)
})

test('verifyMeshExport: single mesh aggregates geometry + global budget', () => {
  const mesh = watertightCylinder()
  const { stats } = panelize(mesh)
  const used = stats.budget.used
  const r = verifyMeshExport([mesh], [used], used)
  assert.equal(r.ok, true)
  assert.equal(r.checks.budget.used, used)
  assert.equal(r.checks.watertight.pass, true)
})

test('determinism: same mesh twice → identical result, input not mutated', () => {
  const mesh = watertightCylinder()
  const snapshot = JSON.stringify(mesh)
  const a = verifyMesh(mesh)
  const b = verifyMesh(mesh)
  assert.deepEqual(a, b)
  assert.equal(JSON.stringify(mesh), snapshot, 'verify must not mutate the input mesh')
})

test('determinism: batch aggregation stable', () => {
  const mesh = watertightCylinder()
  const { stats } = panelize(mesh)
  const used = stats.budget.used
  const a = verifyMeshExport([mesh], [used], used)
  const b = verifyMeshExport([mesh], [used], used)
  assert.deepEqual(a, b)
})

/* ---------------- 凹闭合体法线：全局质心点积误报 → 有向边一致性 + 连通分量有符号体积 ---------------- */

/**
 * 凹闭合体（方形圆环）：正确外绕（所有有向共享边相反、有符号体积>0、水密），
 * 但全局质心点积会把它误报为「朝内」（旧算法在凹面处判假朝内）。
 */
function concaveRingMesh(): MeshVerifyInput {
  return {
    vertices: [
      [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1],
      [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1],
      [0.4, 0, 0.4], [0.6, 0, 0.4], [0.6, 0, 0.6], [0.4, 0, 0.6],
      [0.4, 1, 0.4], [0.6, 1, 0.4], [0.6, 1, 0.6], [0.4, 1, 0.6]
    ],
    faces: [
      0, 1, 9, 0, 9, 8, 1, 2, 10, 1, 10, 9, 2, 3, 11, 2, 11, 10, 3, 0, 8, 3, 8, 11,
      13, 5, 4, 12, 13, 4, 14, 6, 5, 13, 14, 5, 15, 7, 6, 14, 15, 6, 12, 4, 7, 15, 12, 7,
      0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
      13, 12, 8, 9, 13, 8, 14, 13, 9, 10, 14, 9, 15, 14, 10, 11, 15, 10, 12, 15, 11, 8, 12, 11
    ]
  }
}

function flipFace(mesh: MeshVerifyInput, faceIndex: number): MeshVerifyInput {
  const faces = [...mesh.faces]
  const b = faceIndex * 3
  const tmp = faces[b]
  faces[b] = faces[b + 2]
  faces[b + 2] = tmp
  return { vertices: mesh.vertices, faces }
}

function reverseAllFaces(mesh: MeshVerifyInput): MeshVerifyInput {
  const faces = [...mesh.faces]
  for (let i = 0; i < faces.length; i += 3) {
    const tmp = faces[i]
    faces[i] = faces[i + 2]
    faces[i + 2] = tmp
  }
  return { vertices: mesh.vertices, faces }
}

test('concave closed ring (correctly outward): normals pass — global-centroid false positive fixed', () => {
  const r = verifyMesh(concaveRingMesh())
  assert.equal(r.checks.watertight.pass, true)
  assert.equal(r.checks.normals.pass, true)
  assert.equal(r.checks.normals.invertedCount, 0)
  // 绕序与自交相互独立：一致/正确绕序并不代表无自交，双向都不做推断。
  assert.equal(r.checks.selfIntersections.pass, true)
  assert.equal(r.ok, true)
})

test('concave ring + flip one face: winding inconsistency detected (directed-edge), watertight still closed', () => {
  const r = verifyMesh(flipFace(concaveRingMesh(), 0))
  // 翻面不改变边集合 → 仍水密闭合。
  assert.equal(r.checks.watertight.pass, true)
  assert.equal(r.checks.normals.pass, false)
  assert.ok(r.checks.normals.invertedCount >= 1, 'flipped face must be counted as inverted')
  assert.ok(r.failures.some((f) => f.includes('朝内的法线面')))
})

test('concave ring + reverse all faces: fully-inward component detected via signed volume', () => {
  const r = verifyMesh(reverseAllFaces(concaveRingMesh()))
  assert.equal(r.checks.watertight.pass, true)
  assert.equal(r.checks.normals.pass, false)
  assert.ok(r.checks.normals.invertedCount > 0, 'whole reversed component must be counted')
})

test('self-intersection is distinct from winding: crossing triangles flag selfInter, not normals', () => {
  // 两个非相邻三角，三角 B 的边穿过三角 A 内部（几何自交）；但两者无绕序关联。
  const mesh: MeshVerifyInput = {
    vertices: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [0.3, -1, 0.3], [0.3, 1, 0.3], [0.3, 1, 0.31]],
    faces: [0, 1, 2, 3, 4, 5]
  }
  const r = verifyMesh(mesh)
  assert.equal(r.checks.selfIntersections.pass, false)
  assert.ok(r.checks.selfIntersections.intersectingPairs >= 1)
  // 绕序与自交相互独立：一致绕序不能证明无自交，反之亦然。
  assert.ok(r.failures.some((f) => f.includes('局部自交')))
})

/* ---------------- 有符号体积：平移不变性 + 逐分量尺度（局部原点 / 局部 diag） ---------------- */

function translateMesh(mesh: MeshVerifyInput, d: [number, number, number]): MeshVerifyInput {
  return { vertices: mesh.vertices.map((p) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]]), faces: [...mesh.faces] }
}
function scaleMesh(mesh: MeshVerifyInput, s: number): MeshVerifyInput {
  return { vertices: mesh.vertices.map((p) => [p[0] * s, p[1] * s, p[2] * s]), faces: [...mesh.faces] }
}
function mergeMeshes(a: MeshVerifyInput, b: MeshVerifyInput): MeshVerifyInput {
  const off = a.vertices.length
  return { vertices: [...a.vertices, ...b.vertices], faces: [...a.faces, ...b.faces.map((i) => i + off)] }
}

test('translation invariance: correctly-wound ring far from origin still passes normals (local-origin volume)', () => {
  const r = verifyMesh(translateMesh(concaveRingMesh(), [1e8, 1e8, 1e8]))
  assert.equal(r.checks.watertight.pass, true)
  assert.equal(r.checks.normals.pass, true)
  assert.equal(r.checks.normals.invertedCount, 0)
})

test('translation invariance: reversed ring far from origin still detected as inverted (local-origin volume)', () => {
  const r = verifyMesh(reverseAllFaces(translateMesh(concaveRingMesh(), [1e8, 1e8, 1e8])))
  assert.equal(r.checks.watertight.pass, true)
  assert.equal(r.checks.normals.pass, false)
  assert.equal(r.checks.normals.invertedCount, 32)
})

test('per-component scale: small reversed component in multi-scale mesh is detected via per-component epsilon', () => {
  // 大环外绕（体积 ≈ 0.96）+ 小环全反向（体积 ≈ 0.96×0.001³ ≈ 1e-9，远小于全局包围盒体积容差）。
  // 旧全局 volEps（≈1e-8）会漏检这个小反向件；逐分量 volEps（≈1e-17）会检出 → 这是逐分量容差的回归。
  const big = concaveRingMesh()
  const small = reverseAllFaces(translateMesh(scaleMesh(concaveRingMesh(), 0.001), [2, 2, 2]))
  const combined = mergeMeshes(big, small)
  const r = verifyMesh(combined, { weldTolerance: 1e-6 })
  assert.equal(r.checks.watertight.pass, true)
  assert.equal(r.checks.normals.pass, false)
  assert.equal(r.checks.normals.invertedCount, 32) // 小环 32 个面全部朝内
})

/* ---------------- 自交：单顶点共享跨面 / 共面重叠 / 相邻与远距不误报 ---------------- */

test('selfIntersections: two triangles sharing one vertex can still cross elsewhere (detected)', () => {
  // 仅共享单顶点（顶点 0），三角 B 的边穿过三角 A 内部；共享边≠相邻，须继续测几何。
  const mesh: MeshVerifyInput = {
    vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0.3, 0.3, 1], [0.3, 0.3, -1]],
    faces: [0, 1, 2, 0, 3, 4]
  }
  const r = verifyMesh(mesh)
  assert.equal(r.checks.selfIntersections.pass, false)
  assert.ok(r.checks.selfIntersections.intersectingPairs >= 1)
  assert.ok(r.failures.some((f) => f.includes('局部自交')))
})

test('selfIntersections: coplanar non-adjacent overlap is detected (2D overlap)', () => {
  // 两共面（z=0）三角、不共享顶点，平面投影重叠 → 视为自交。
  const mesh: MeshVerifyInput = {
    vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0.5, 0, 0], [1.5, 0, 0], [0.5, 1, 0]],
    faces: [0, 1, 2, 3, 4, 5]
  }
  const r = verifyMesh(mesh)
  assert.equal(r.checks.selfIntersections.pass, false)
  assert.ok(r.checks.selfIntersections.intersectingPairs >= 1)
})

test('selfIntersections: adjacent coplanar triangles of a flat quad are NOT flagged (no false positive)', () => {
  const mesh: MeshVerifyInput = {
    vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    faces: [0, 1, 2, 0, 2, 3]
  }
  const r = verifyMesh(mesh)
  assert.equal(r.checks.selfIntersections.pass, true)
  assert.equal(r.checks.selfIntersections.intersectingPairs, 0)
})

test('selfIntersections: far-apart non-intersecting triangles are NOT flagged (grid culling correct)', () => {
  const mesh: MeshVerifyInput = {
    vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [10, 0, 0], [11, 0, 0], [10, 1, 0]],
    faces: [0, 1, 2, 3, 4, 5]
  }
  const r = verifyMesh(mesh)
  assert.equal(r.checks.selfIntersections.pass, true)
  assert.equal(r.checks.selfIntersections.intersectingPairs, 0)
})

test('assembly mode: open shells become notes (not failures) but weld/normals stay hard', () => {
  // 裂缝网格 = 水密圆柱少一个面：开边存在、无未焊接顶点、法线一致。
  const cracked = crackMesh()
  const strict = verifyMesh(cracked)
  assert.equal(strict.ok, false, 'strict mode rejects open shells')
  assert.equal(strict.checks.watertight.pass, false)

  const assembly = verifyMesh(cracked, { assembly: true })
  assert.equal(assembly.checks.watertight.pass, false, 'open edges are still reported')
  assert.ok(
    (assembly.notes ?? []).some((n) => n.includes('装配模式') && n.includes('开边')),
    'assembly mode must explain the exemption in notes'
  )
  assert.equal(
    assembly.failures.some((f) => f.includes('水密性未通过')),
    false,
    'watertight must not be a failure in assembly mode'
  )
  assert.equal(assembly.ok, true, 'cracked shell passes in assembly mode')
})

test('assembly mode does NOT relax hard checks (unwelded vertices still fail)', () => {
  const r = verifyMesh(openCylinder(), { assembly: true })
  assert.ok(r.checks.seams.seamCount > 0)
  assert.equal(r.ok, false, 'seams remain a hard failure')
  assert.ok(r.failures.some((f) => f.includes('未焊接顶点')))
})
