/**
 * panelize.test.ts — 网格 → 最小单元面板化（确定性）测试。
 *
 * 覆盖：
 * - 4 段开口圆柱：4 侧壁四边形配对 → 4 个 10009003 平面单元（无盖 → 0 三棱锥）。
 * - 未配对三角 → 10009006 三棱锥压扁三角。
 * - 退化面 → 10009001 盒兜底（默认 1.5mm）或 'skip'（只计数）。
 * - 颜色逐面透传。
 * - 门禁 seam（gateCheck 回调收到 stats）。
 * - 两次运行字节一致（确定性）；golden 快照（structure.json）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import {
  panelize,
  colorStringToItemColor,
  PLANE_RESOURCE_ID,
  TETRA_RESOURCE_ID,
  BOX_RESOURCE_ID,
  type PanelMesh,
  type PanelItem
} from '../src/mesh/panelize.js'
import { resolveStructure } from '../src/core/structure.js'
import { encodeStructure } from '../src/core/encoder.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
function findRoot(dir: string): string {
  return existsSync(path.join(dir, 'package.json')) ? dir : findRoot(path.dirname(dir))
}
const ROOT = findRoot(HERE)

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/** 4 段开口圆柱：每段一个四边形（两三角），顶点不跨段共享（无端盖）。 */
function cylinderMesh(segments = 4, radius = 0.5, height = 1.0): PanelMesh {
  const vertices: number[][] = []
  const faces: number[] = []
  const colors: string[] = []
  for (let k = 0; k < segments; k++) {
    const a0 = (k / segments) * 2 * Math.PI
    const a1 = ((k + 1) / segments) * 2 * Math.PI
    const b = vertices.length
    vertices.push([Math.cos(a0) * radius, 0, Math.sin(a0) * radius])
    vertices.push([Math.cos(a1) * radius, 0, Math.sin(a1) * radius])
    vertices.push([Math.cos(a1) * radius, height, Math.sin(a1) * radius])
    vertices.push([Math.cos(a0) * radius, height, Math.sin(a0) * radius])
    const col = k % 2 === 0 ? '0xE5484D' : '0xFACC15'
    faces.push(b, b + 1, b + 2, b, b + 2, b + 3)
    colors.push(col, col)
  }
  return { vertices, faces, colors }
}

/** 单个孤立三角形（不与任何三角配对）→ 三棱锥。 */
function loneTriangle(): PanelMesh {
  return {
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [0.5, 0, 1]
    ],
    faces: [0, 1, 2],
    colors: ['0x12A594']
  }
}

/** 退化面（三点共线，面积≈0）→ 盒兜底。 */
function degenerateMesh(): PanelMesh {
  return {
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0]
    ],
    faces: [0, 1, 2],
    colors: ['0xE5484D']
  }
}

/** 把一个网格面板化后直接构建 ResolvedStructure（对齐 CLI 的 structure 组装）。 */
function buildStructure(name: string, mesh: PanelMesh): ReturnType<typeof resolveStructure> {
  const { items } = panelize(mesh)
  return resolveStructure({
    name,
    template: '空模型',
    items: items.map((it: PanelItem) => ({
      resourceId: it.resourceId,
      position: it.position,
      rotation: it.rotation,
      scale: it.scale,
      ...(it.color === undefined ? {} : { color: colorStringToItemColor(it.color) })
    }))
  })
}

test('cylinder: 4-seg open cylinder panelizes to 4 planes, 0 tetra, 0 degenerate', () => {
  const mesh = cylinderMesh()
  const { items, stats } = panelize(mesh)
  assert.equal(stats.faces, 8)
  assert.equal(stats.quads, 4)
  assert.equal(stats.tris, 0)
  assert.equal(stats.degenerate, 0)
  assert.equal(items.length, 4)
  assert.ok(items.every((it) => it.resourceId === PLANE_RESOURCE_ID))
})

test('cylinder: each panel carries the per-face color (first triangle of the pair)', () => {
  const mesh = cylinderMesh()
  const { items } = panelize(mesh)
  const expected = ['0xE5484D', '0xFACC15', '0xE5484D', '0xFACC15']
  items.forEach((it, index) => assert.equal(it.color, expected[index]))
})

test('lone triangle: unpaired triangle panelizes to a squeezed tetra (10009006)', () => {
  const mesh = loneTriangle()
  const { items, stats } = panelize(mesh)
  assert.equal(stats.faces, 1)
  assert.equal(stats.quads, 0)
  assert.equal(stats.tris, 1)
  assert.equal(items.length, 1)
  assert.equal(items[0].resourceId, TETRA_RESOURCE_ID)
  assert.equal(items[0].color, '0x12A594')
})

test('degenerate face: zero-area triangle → box (10009001) by default, recorded', () => {
  const mesh = degenerateMesh()
  const { items, stats } = panelize(mesh)
  assert.equal(stats.degenerate, 1)
  assert.equal(items.length, 1)
  assert.equal(items[0].resourceId, BOX_RESOURCE_ID)
  // 默认盒厚 1.5mm。
  assert.ok(Math.abs(items[0].scale[1] - 0.0015) < 1e-9)
})

test('degenerate face: skip mode records but emits nothing', () => {
  const mesh = degenerateMesh()
  const { items, stats } = panelize(mesh, { degenerate: 'skip' })
  assert.equal(stats.degenerate, 1)
  assert.equal(items.length, 0)
})

test('panelize: budget used equals items length; exceeded false when no requested', () => {
  const mesh = cylinderMesh()
  const { items, stats } = panelize(mesh)
  assert.equal(stats.budget.used, items.length)
  assert.equal(stats.budget.exceeded, false)
  assert.equal(stats.budget.requested, null)
})

test('panelize: gateCheck seam receives stats (对接 03 门禁)', () => {
  const mesh = cylinderMesh()
  let seen = false
  const result = panelize(mesh, {
    gateCheck: (stats) => {
      seen = true
      assert.equal(stats.quads, 4)
    }
  })
  assert.equal(seen, true)
  assert.equal(result.stats.quads, 4)
})

test('panelize: invalid faces (length not multiple of 3) is rejected fail-closed', () => {
  const mesh: PanelMesh = { vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [0, 1, 0, 0] }
  assert.throws(() => panelize(mesh), /faces/)
})

test('determinism: panelize output is byte-identical across two runs', () => {
  const a = panelize(cylinderMesh())
  const b = panelize(cylinderMesh())
  assert.deepEqual(a, b)
})

test('determinism: structure + encode produce identical sha256 twice', () => {
  const s1 = buildStructure('cylinder', cylinderMesh())
  const s2 = buildStructure('cylinder', cylinderMesh())
  assert.deepEqual(s1, s2)
  const g1 = sha256Hex(Buffer.from(encodeStructure(s1)))
  const g2 = sha256Hex(Buffer.from(encodeStructure(s2)))
  assert.equal(g1, g2)
})

test('golden: cylinder-panelized structure snapshot', () => {
  const goldenPath = path.join(ROOT, 'tests', 'golden', 'cylinder-panelized.structure.json')
  assert.ok(existsSync(goldenPath), `golden snapshot missing: ${goldenPath}`)
  const golden = JSON.parse(readFileSync(goldenPath, 'utf8'))
  const actual = buildStructure('cylinder', cylinderMesh())
  assert.deepEqual(actual, golden)
})

/* ---------------- 颜色格式兼容：#RRGGBB（网页）/ #RGB / 0xRRGGBB ---------------- */

test('colorStringToItemColor: accepts webpage #RRGGBB and converts to 0xRRGGBB integer', () => {
  assert.deepEqual(colorStringToItemColor('#C8A87C'), {
    enabled: true,
    rgb: 0xc8a87c,
    opacity: 100,
    overlay: 'overwrite'
  })
  assert.deepEqual(colorStringToItemColor('#E5484D'), {
    enabled: true,
    rgb: 0xe5484d,
    opacity: 100,
    overlay: 'overwrite'
  })
  assert.equal(colorStringToItemColor('#000000')?.rgb, 0x000000)
})

test('colorStringToItemColor: supports lowercase hex and #RGB shorthand', () => {
  // 3 位简写按 CSS 展开（#F00 → #FF0000）。
  assert.equal(colorStringToItemColor('#F00')?.rgb, 0xff0000)
  assert.equal(colorStringToItemColor('#0f0')?.rgb, 0x00ff00)
  assert.equal(colorStringToItemColor('#000')?.rgb, 0x000000)
  assert.equal(colorStringToItemColor('#aBc')?.rgb, 0xaabbcc)
  assert.equal(colorStringToItemColor('#c8a87c')?.rgb, 0xc8a87c)
})

test('colorStringToItemColor: preserves existing 0xRRGGBB (1-6 hex) behavior', () => {
  assert.deepEqual(colorStringToItemColor('0xE5484D'), {
    enabled: true,
    rgb: 0xe5484d,
    opacity: 100,
    overlay: 'overwrite'
  })
  // 既有 1–6 位十六进制仍有效（高位置零）。
  assert.equal(colorStringToItemColor('0xFF')?.rgb, 0x0000ff)
  assert.equal(colorStringToItemColor('0x0')?.rgb, 0x000000)
  assert.equal(colorStringToItemColor('0xFFFFFF')?.rgb, 0xffffff)
})

test('colorStringToItemColor: returns undefined for undefined (default material)', () => {
  assert.equal(colorStringToItemColor(undefined), undefined)
})

test('colorStringToItemColor: rejects invalid inputs (fail-closed)', () => {
  const invalid = [
    '',
    '#GGG',
    '#GGGGGG',
    '#12345',
    '#12',
    '0x',
    '0xGGGGGG',
    '0xFFFFFFF',
    '0xGG',
    ' red',
    'red',
    'rgb(1,2,3)'
  ]
  for (const bad of invalid) {
    assert.throws(() => colorStringToItemColor(bad), /invalid color/, `should reject ${JSON.stringify(bad)}`)
  }
})

test('end-to-end: mesh with webpage #RRGGBB colors panelizes, converts, and encodes', () => {
  const mesh: PanelMesh = {
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1]
    ],
    faces: [0, 1, 2, 0, 2, 3],
    colors: ['#C8A87C', '#C8A87C']
  }
  const { items } = panelize(mesh)
  assert.equal(items.length, 1) // 一个配对成的 10009003 平面（y=0 平面四边形）。
  const color = colorStringToItemColor(items[0].color)
  assert.equal(color?.rgb, 0xc8a87c)
  // structure 解析接收转换后的整数 rgb，并确定性编码（export-mesh 同路径）。
  const structure = buildStructure('web-color', mesh)
  const itemColor = structure.items[0].color as { enabled: true; rgb: number } | undefined
  assert.equal(itemColor?.rgb, 0xc8a87c)
  assert.ok(Buffer.from(encodeStructure(structure)).length > 0)
})

test('end-to-end: invalid # color in mesh colors fails closed at structure build', () => {
  const mesh: PanelMesh = {
    vertices: [[0, 0, 0], [1, 0, 0], [0.5, 0, 1]],
    faces: [0, 1, 2],
    colors: ['#ZZZ']
  }
  const { items } = panelize(mesh)
  assert.throws(() => items.map((it) => colorStringToItemColor(it.color)), /invalid color/)
})
