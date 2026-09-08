/**
 * agents-align.test.ts — AGENTS.md 铁律对齐（GIA 根缩放 + 面板化默认）测试。
 *
 * 覆盖（对应 .scratch/mesh-system/issues/09-agents-align.md）：
 * ① 共享 makeGiaInput：rootTransform.scale=[0.1,0.1,0.1]，item position/scale 均 ÷0.1（双向补偿）。
 * ② 两条 CLI（export-mesh / contour-model）对同一网格输出的 .gia 字节级一致（同一 root 语义）。
 * ③ 两条 CLI 输出的 .gia == 共享 panelizeMesh 路径（rotationMode:'normal' + normalTolerance:0.2），
 *    且 != 旧默认 panelize(mesh)（basis + 0.999）路径 → 证明 CLIs 已用统一面板化默认（铁律 #2）。
 * ④ .gia 真实 root 语义可回读（python parser 抽样：rootTransform.scale≈0.1、item.scale≈期望/0.1）。
 * ⑤ 曲面样本（coarse UV-sphere，法线变化大）：normalTolerance 0.2 下 quads 占比显著高于 0.999
 *    （防尖刺回归，铁律 #2 的「默认 0.999 会把高曲率区拆成三角尖刺」）。
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

import {
  makeGiaInput,
  ROOT_SCALE,
  GAME_VERSION,
  UNIT_ID,
  TEMPLATE_PREFAB_ID
} from '../src/cli/gia-common.js'
import { panelize, panelizeMesh, colorStringToItemColor, type PanelMesh } from '../src/mesh/panelize.js'
import { resolveStructure, type StructureItem } from '../src/core/structure.js'
import { encodeGia } from '../src/gia/gia-encoder.js'

function repoRoot(): string {
  // 编译后测试位于 dist/tests/，上溯两级到仓库根。
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
}

const ROOT = repoRoot()

/* ------------------------------ 端到端 fixture（仅生成一次，各测试共享） ------------------------------ */

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gms-agents-align-'))

const fixture = (() => {
  const contourDir = path.join(tmpRoot, 'contour')
  const exportDir = path.join(tmpRoot, 'export')
  fs.mkdirSync(contourDir, { recursive: true })
  fs.mkdirSync(exportDir, { recursive: true })

  const cli = (name: string) => path.join(ROOT, 'dist', 'src', 'cli', `${name}.js`)
  // contour-model：默认门禁（contour-foot 应 passed）+ --no-qa（本测试只关心 .gia）。
  execFileSync('node', [
    cli('contour-model'),
    'examples/contour-foot.json',
    '--name', 'align',
    '--out-dir', contourDir,
    '--force',
    '--no-qa'
  ], { cwd: ROOT, stdio: 'pipe' })

  // 把 contour-model 的 mesh.json 喂回 export-mesh：name 需一致（否则 .gia 模型名不同）。
  const mesh = JSON.parse(fs.readFileSync(path.join(contourDir, 'align.mesh.json'), 'utf8')) as PanelMesh
  fs.writeFileSync(path.join(exportDir, 'in.json'), JSON.stringify({ name: 'align', ...mesh }))
  execFileSync('node', [
    cli('export-mesh'),
    path.join(exportDir, 'in.json'),
    '--out-dir', exportDir,
    '--force',
    '--no-qa'
  ], { cwd: ROOT, stdio: 'pipe' })

  const contourGia = fs.readFileSync(path.join(contourDir, 'align.gia'))
  const exportGia = fs.readFileSync(path.join(exportDir, 'align.gia'))
  const structureItems = (JSON.parse(
    fs.readFileSync(path.join(exportDir, 'align.structure.json'), 'utf8')
  ) as { items: StructureItem[] }).items
  return { contourDir, exportDir, mesh, contourGia, exportGia, structureItems }
})()

after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

/* ------------------------------ ① 共享 makeGiaInput 根缩放 ------------------------------ */

function assertVecClose(actual: readonly number[], expected: readonly number[], eps = 1e-9): void {
  assert.equal(actual.length, expected.length, 'vector length must match')
  for (let i = 0; i < actual.length; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) < eps, `component ${i} ≈ ${expected[i]} (got ${actual[i]})`)
  }
}

test('shared makeGiaInput: rootTransform.scale=[0.1,0.1,0.1] + item position/scale ÷0.1', () => {
  const items: StructureItem[] = [
    { resourceId: 10009003, position: [0.5, 0.2, 0.3], rotation: [10, 20, 30], scale: [0.8, 0.4, 0.6] },
    { resourceId: 10009006, position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
  ]
  assert.equal(ROOT_SCALE, 0.1, 'ROOT_SCALE must be 0.1 (AGENTS 铁律 #1)')
  const gia = makeGiaInput('align-unit', items)
  assert.equal(gia.schemaVersion, 1)
  assert.equal(gia.model.unitId, UNIT_ID)
  assert.equal(gia.model.templatePrefabId, TEMPLATE_PREFAB_ID)
  assert.equal(gia.file.gameVersion, GAME_VERSION)
  // rootTransform.scale 单一表达 root=0.1
  assert.deepEqual(gia.model.rootTransform.scale, [0.1, 0.1, 0.1])
  assert.deepEqual(gia.model.rootTransform.position, [0, 0, 0])
  // item 位置与缩放同乘 1/0.1（双向补偿，÷0.1）
  assertVecClose(gia.model.items[0].position, [5, 2, 3])
  assertVecClose(gia.model.items[0].scale, [8, 4, 6])
  assertVecClose(gia.model.items[1].position, [0, 1, 0])
  assertVecClose(gia.model.items[1].scale, [10, 10, 10])
})

/* ------------------------------ ② 两条 CLI .gia 字节一致 ------------------------------ */

test('both CLIs emit byte-identical .gia for the same mesh (same root semantics)', () => {
  assert.ok(fixture.contourGia.length > 0, 'contour-model must emit .gia')
  assert.ok(fixture.exportGia.length > 0, 'export-mesh must emit .gia')
  assert.equal(fixture.contourGia.length, fixture.exportGia.length, '.gia must have equal byte length')
  assert.deepEqual(fixture.contourGia, fixture.exportGia, '.gia must be byte-identical across the two CLIs')
})

/* ------------------------------ ③ CLI 使用的面板化默认 = panelizeMesh ------------------------------ */

test('CLI .gia matches the shared panelizeMesh path and differs from the old panelize(mesh) path', () => {
  const mesh = fixture.mesh
  const toItem = (it: ReturnType<typeof panelizeMesh>['items'][number]) => ({
    resourceId: it.resourceId,
    position: it.position,
    rotation: it.rotation,
    scale: it.scale,
    ...(it.color === undefined ? {} : { color: colorStringToItemColor(it.color) })
  })
  // 共享面板化默认（rotationMode:'normal' + normalTolerance:0.2）。
  const shared = resolveStructure({ name: 'align', template: '空模型', items: panelizeMesh(mesh).items.map(toItem) })
  const sharedGia = encodeGia(makeGiaInput('align', shared.items))
  assert.ok(
    Buffer.from(sharedGia).equals(fixture.exportGia),
    'CLI .gia must equal the shared panelizeMesh encodeGia output'
  )

  // 旧默认（basis + 0.999）：旋转公式不同 → .gia 不同 → 证明 CLI 并非用旧默认。
  const legacy = resolveStructure({ name: 'align', template: '空模型', items: panelize(mesh).items.map(toItem) })
  const legacyGia = encodeGia(makeGiaInput('align', legacy.items))
  assert.ok(
    !Buffer.from(legacyGia).equals(fixture.exportGia),
    'CLI .gia must NOT equal the legacy panelize(mesh) output'
  )
})

/* ------------------------------ ④ .gia 真实 root 语义回读（抽样） ------------------------------ */

test('.gia root semantics read back: rootTransform.scale≈0.1, items[0].scale≈期望/0.1', () => {
  const python = path.join(ROOT, '.venv', 'bin', 'python')
  const parser = path.join(ROOT, 'tools', 'gia', 'gia_parser.py')
  assert.ok(fs.existsSync(python), '.venv python must exist (gia parser reader)')
  assert.ok(fs.existsSync(parser), 'tools/gia/gia_parser.py must exist')
  const parsedPath = path.join(tmpRoot, 'parsed.json')
  execFileSync(python, [parser, path.join(fixture.exportDir, 'align.gia'), '--json', parsedPath], { stdio: 'pipe' })
  const parsed = JSON.parse(fs.readFileSync(parsedPath, 'utf8'))
  const cur = (parsed.versions as { data: { rootTransform: { scale: number[] } } }[]).at(-1)!
  const rootScale = cur.data.rootTransform.scale
  // sample assertion: rootTransform.scale ≈ 0.1 (float32)
  for (const s of rootScale) assert.ok(Math.abs(s - 0.1) < 1e-6, `rootTransform.scale ≈ 0.1 (got ${s})`)

  const it0 = (parsed.items as { data: { values: { type: number; transform?: { position: number[]; scale: number[] } }[] } }[])[0]
  const tr = it0.data.values.find((v) => v.type === 1)?.transform
  assert.ok(tr, 'items[0] must carry a transform record')
  // items[0].scale ≈ structure items[0].scale / 0.1 (sampled on [0])
  const expectScale0 = fixture.structureItems[0].scale[0] / 0.1
  assert.ok(Math.abs(tr!.scale[0] - expectScale0) < 1e-6, `items[0].scale[0]≈期望/0.1 (got ${tr!.scale[0]})`)
  // items[0].position[0] ≈ structure items[0].position[0] / 0.1
  const expectPos0 = fixture.structureItems[0].position[0] / 0.1
  assert.ok(Math.abs(tr!.position[0] - expectPos0) < 1e-6, `items[0].position[0]≈期望/0.1 (got ${tr!.position[0]})`)
})

/* ------------------------------ ⑤ 面板化默认：0.2 vs 0.999 防尖刺 ------------------------------ */

/** coarse UV-sphere（法线变化大）：每个四边形非平面，相邻三角法线差异显著。 */
function uvSphere(seg = 8, rings = 4): PanelMesh {
  const vertices: number[][] = []
  const faces: number[] = []
  for (let r = 0; r <= rings; r++) {
    const phi = (Math.PI * r) / rings
    const y = Math.cos(phi)
    const s = Math.sin(phi)
    for (let g = 0; g < seg; g++) {
      const th = (2 * Math.PI * g) / seg
      vertices.push([s * Math.cos(th), y, s * Math.sin(th)])
    }
  }
  const idx = (r: number, g: number) => r * seg + (g % seg)
  for (let r = 0; r < rings; r++) {
    for (let g = 0; g < seg; g++) {
      const a = idx(r, g)
      const b = idx(r, g + 1)
      const c = idx(r + 1, g + 1)
      const d = idx(r + 1, g)
      faces.push(a, b, c, a, c, d)
    }
  }
  return { vertices, faces }
}

function quadRatio(stats: { quads: number; tris: number }): number {
  return stats.tris + stats.quads === 0 ? 0 : stats.quads / (stats.quads + stats.tris)
}

test('panelize default: normalTolerance 0.2 keeps high-curvature faces as quads (0.999 spikes them)', () => {
  const mesh = uvSphere()
  // 共享默认（panelizeMesh = rotationMode:'normal' + normalTolerance:0.2）：全部四边形，无尖刺。
  const def = panelizeMesh(mesh)
  assert.equal(def.stats.quads, 24, '0.2: all high-curvature faces pair into quads')
  assert.equal(def.stats.tris, 0, '0.2: zero spike tris')
  assert.equal(quadRatio(def.stats), 1)

  // panelizeMesh 恰好等价于显式 { rotationMode:'normal', normalTolerance:0.2 }。
  const explicit = panelize(mesh, { rotationMode: 'normal', normalTolerance: 0.2 })
  assert.deepEqual(def, explicit, 'panelizeMesh must lock rotationMode:\'normal\' + normalTolerance:0.2')

  // 旧默认 0.999（basis + normalTolerance:0.999）：高曲率区被拆成三角尖刺（tris>0），quads 占比显著更低。
  const strict = panelize(mesh, { rotationMode: 'normal', normalTolerance: 0.999 })
  assert.ok(strict.stats.tris > 0, '0.999 must produce spike tris on high-curvature faces')
  assert.ok(quadRatio(strict.stats) < quadRatio(def.stats) - 0.2, '0.2 quads ratio must be significantly higher than 0.999')
  assert.ok(quadRatio(strict.stats) < 0.9, '0.999 quads ratio must be well below 1 (spikes present)')
})
