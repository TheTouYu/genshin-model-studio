/**
 * export-qa.test.ts — 导出后 QA 审计 + 多视角 contact sheet 的确定性测试。
 *
 * 覆盖（node:test 风格）：
 * - 好样例（水密圆柱 → panelize → encode → 写导出目录）→ auditExport ok=true，各 check 齐全；
 * - 人为制造：prefabId 低于区间 / prefabId 命中骨架占位 → ID 规则 FAIL（中文原因可读）；
 * - 人为制造：预算超限（summary.budget 与 gate.state 不一致）→ 单元预算 FAIL；
 * - 人为制造：资源缺覆盖（item.resourceId 不在官方表）→ 资源覆盖 FAIL；
 * - contact sheet：合成 fixture 网格 → PNG 存在、非空、尺寸/格数确定、两次运行 sha256 一致。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

import { auditExport, type ExportQaResult } from '../src/qa/export-qa.js'
import { panelize, colorStringToItemColor, type PanelItem } from '../src/mesh/panelize.js'
import { resolveStructure, type StructureItem } from '../src/core/structure.js'
import { encodeStructure } from '../src/core/encoder.js'
import { encodeGia } from '../src/gia/gia-encoder.js'

function repoRoot(): string {
  // 编译后测试位于 dist/tests/，上溯两级到仓库根。
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/** 水密焊接圆柱（与 verify.test 同构），作为 QA 好样例网格。 */
function watertightCylinder(segments = 8, radius = 0.5, height = 1): { vertices: number[][]; faces: number[] } {
  const vertices: number[][] = []
  const faces: number[] = []
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
    faces.push(b0, t0, t1, b0, t1, b1)
    faces.push(0, b0, b1)
    faces.push(1, t1, t0)
  }
  return { vertices, faces }
}

function toStructureItem(item: PanelItem) {
  const color = colorStringToItemColor(item.color)
  return {
    resourceId: item.resourceId,
    position: item.position,
    rotation: item.rotation,
    scale: item.scale,
    ...(color === undefined ? {} : { color })
  }
}

function makeGiaInput(name: string, items: readonly StructureItem[]) {
  const giaItems = items.map((it, idx) => ({
    id: 1073741824 + idx + 1,
    resourceId: it.resourceId,
    position: [...it.position],
    rotation: [...it.rotation],
    scale: [...it.scale],
    ...(it.color === undefined ? {} : { color: it.color, name: `item_${idx + 1}` })
  }))
  return {
    schemaVersion: 1,
    model: { name, unitId: 1077936129, templatePrefabId: 10005018, rootTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [0.1, 0.1, 0.1] }, items: giaItems },
    file: { filePath: `${name}.gia`, gameVersion: '6.7.0' }
  }
}

/** 构建一个完整导出目录（structure/gil/gia/mesh/summary）。 */
function buildFixture(mesh: { vertices: number[][]; faces: number[] }, name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gms-export-qa-'))
  const { items } = panelize(mesh)
  const structItems = items.map(toStructureItem)
  const structure = resolveStructure({ name, template: '空模型', items: structItems })
  const gil = encodeStructure(structure)
  const gia = encodeGia(makeGiaInput(name, structure.items))
  const structurePath = path.join(dir, `${name}.structure.json`)
  const gilPath = path.join(dir, `${name}.gil`)
  const giaPath = path.join(dir, `${name}.gia`)
  const meshPath = path.join(dir, `${name}.mesh.json`)
  const summaryPath = path.join(dir, `${name}.summary.json`)
  fs.writeFileSync(structurePath, JSON.stringify(structure, null, 2) + '\n')
  fs.writeFileSync(gilPath, gil)
  fs.writeFileSync(giaPath, gia)
  fs.writeFileSync(meshPath, JSON.stringify(mesh) + '\n')
  const summary = {
    schemaVersion: 1,
    kind: 'genshin-model-studio.export-mesh.summary',
    model: { name, mesh: { faces: mesh.faces.length / 3, quads: 0, tris: 0, degenerate: 0, units: items.length } },
    output: { structure: structurePath, gil: gilPath, gia: giaPath, mesh: meshPath, summary: summaryPath },
    budget: { requested: null, used: items.length, exceeded: false },
    gate: { invoked: true, state: 'passed', ok: true, checkedFaces: mesh.faces.length / 3, failures: [], checks: {} }
  }
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n')
  return { dir, name, structure, items, structurePath, summaryPath, gilPath, giaPath, meshPath }
}

test('good export: QA ok with all checks present and readback covered', () => {
  const mesh = watertightCylinder()
  const { dir } = buildFixture(mesh, 'cyl-good')
  const result = auditExport(dir)
  assert.equal(result.ok, true, `expected ok, failures=${JSON.stringify(result.failures)}`)
  assert.ok(result.checks.id.pass, 'ID rules must pass on good export')
  assert.deepEqual(result.checks.id.issues, [])
  assert.ok(result.checks.resources.pass, 'resources must pass (known base resources)')
  assert.ok(result.checks.budget.pass, 'budget must pass when requested=null')
  assert.ok(result.checks.artifacts.pass, 'artifacts must all exist and be non-empty')
  assert.notEqual(result.checks.readback.pass, 'uncovered', 'readback should be covered (.gil + .gia verified)')
  assert.equal(result.checks.readback.pass, true)
  assert.equal(result.failures.length, 0)
  // 字段齐全性。
  assert.ok(result.checks.id.issues !== undefined)
  assert.ok(Array.isArray(result.checks.resources.uncalibrated))
  assert.ok(result.checks.budget.detail)
  assert.ok(result.checks.artifacts.detail.artifacts.length >= 4)
})

test('ID rule: prefabId below range fails with readable Chinese reason', () => {
  const mesh = watertightCylinder()
  const { dir, structurePath } = buildFixture(mesh, 'cyl-lower')
  const structure = JSON.parse(fs.readFileSync(structurePath, 'utf8'))
  structure.prefabId = 1073741828 // 低于区间下限 1077936129
  fs.writeFileSync(structurePath, JSON.stringify(structure, null, 2) + '\n')
  const result = auditExport(dir)
  assert.equal(result.ok, false)
  assert.equal(result.checks.id.pass, false)
  const msg = result.checks.id.issues.find((i) => i.includes('ID 规则') && i.includes('低于区间下限'))
  assert.ok(msg, `must produce a prefab-range failure, got ${JSON.stringify(result.checks.id.issues)}`)
  assert.ok(msg!.includes('1073741828'))
  assert.ok(result.failures.some((f) => f.includes('ID 规则')))
})

test('ID rule: prefabId hits skeleton placeholder fails', () => {
  const mesh = watertightCylinder()
  const { dir, structurePath } = buildFixture(mesh, 'cyl-skel')
  const structure = JSON.parse(fs.readFileSync(structurePath, 'utf8'))
  structure.prefabId = 1077936138 // 在区间内但命中骨架占位 ID（≠ 默认定义 ID）
  fs.writeFileSync(structurePath, JSON.stringify(structure, null, 2) + '\n')
  const result = auditExport(dir)
  assert.equal(result.ok, false)
  assert.equal(result.checks.id.pass, false)
  const msg = result.checks.id.issues.find((i) => i.includes('命中骨架占位 ID'))
  assert.ok(msg, `must produce a skeleton-placement failure, got ${JSON.stringify(result.checks.id.issues)}`)
})

test('budget: exceeded with inconsistent gate.state fails (readback still accepted)', () => {
  const mesh = watertightCylinder()
  const { dir, summaryPath, items } = buildFixture(mesh, 'cyl-budget')
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
  summary.budget = { requested: 10, used: items.length, exceeded: true }
  summary.gate = { invoked: true, state: 'passed', ok: true, checkedFaces: mesh.faces.length / 3, failures: [], checks: {} }
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n')
  const result = auditExport(dir)
  assert.equal(result.ok, false)
  assert.equal(result.checks.budget.pass, false)
  const exceed = result.checks.budget.issues.find((i) => i.includes('预算超限'))
  assert.ok(exceed, `must report budget exceeded, got ${JSON.stringify(result.checks.budget.issues)}`)
  assert.ok(exceed!.includes(String(items.length)), 'must include used number')
  assert.ok(exceed!.includes('10'), 'must include requested number')
  assert.ok(
    result.checks.budget.issues.some((i) => i.includes('状态不一致')),
    'must flag gate passed while budget exceeded'
  )
})

test('resources: unknown resource fails coverage and lists uncalibrated separately', () => {
  const mesh = watertightCylinder()
  const { dir, structurePath } = buildFixture(mesh, 'cyl-res')
  const structure = JSON.parse(fs.readFileSync(structurePath, 'utf8'))
  structure.items[0].resourceId = 10009099 // 不在官方资源表
  fs.writeFileSync(structurePath, JSON.stringify(structure, null, 2) + '\n')
  const result = auditExport(dir)
  assert.equal(result.ok, false)
  assert.equal(result.checks.resources.pass, false)
  const msg = result.checks.resources.issues.find((i) => i.includes('不在官方资源表'))
  assert.ok(msg, `must report unknown resource, got ${JSON.stringify(result.checks.resources.issues)}`)
  assert.ok(result.checks.resources.uncalibrated.length >= 0)
  assert.ok(Array.isArray(result.checks.resources.uncalibrated))
})

/* ------------------------------- contact sheet ------------------------------- */

/** 轻量 PNG IHDR 解析：返回 {width, height}。 */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < 8; i++) assert.equal(bytes[i], sig[i], 'PNG signature')
  assert.equal(String.fromCharCode(...bytes.slice(12, 16)), 'IHDR')
  const readU32 = (offset: number) =>
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  return { width: readU32(16), height: readU32(20) }
}

test('contact sheet: deterministic PNG, non-empty, expected grid size', () => {
  const repo = repoRoot()
  const python = path.join(repo, '.venv', 'bin', 'python')
  const script = path.join(repo, 'scripts', 'render-contact-sheet.py')
  assert.ok(fs.existsSync(python), '.venv python must exist')
  assert.ok(fs.existsSync(script), 'render-contact-sheet.py must exist')

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gms-contact-sheet-'))
  const mesh = watertightCylinder()
  const meshPath = path.join(dir, 'fixture.mesh.json')
  const outPath = path.join(dir, 'fixture.contact.png')
  fs.writeFileSync(meshPath, JSON.stringify(mesh) + '\n')

  execFileSync(python, [script, meshPath, '--out', outPath, '--cell', '200'], { stdio: 'pipe' })
  assert.ok(fs.existsSync(outPath), 'contact sheet PNG must be written')
  const first = fs.readFileSync(outPath)
  assert.ok(first.length > 0, 'PNG must be non-empty')
  const size = pngSize(first)
  const cols = 4
  const rows = Math.ceil(8 / cols)
  const cell = 200
  const labelH = 26
  const margin = 12
  const gap = 8
  const expectW = margin * 2 + cols * cell + gap * (cols - 1)
  const expectH = margin * 2 + rows * (cell + labelH) + gap * (rows - 1) + labelH
  assert.equal(size.width, expectW, 'contact sheet width matches grid')
  assert.equal(size.height, expectH, 'contact sheet height matches grid')

  // 再次运行 → sha256 一致（确定性：无时间戳、无随机）。
  execFileSync(python, [script, meshPath, '--out', outPath, '--cell', '200'], { stdio: 'pipe' })
  const second = fs.readFileSync(outPath)
  assert.equal(sha256(first), sha256(second), 'two runs must produce byte-identical PNG')
})
