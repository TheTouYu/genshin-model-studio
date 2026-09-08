/**
 * capabilities.test.ts — 能力编目一致性（发现-选择-运行可信）。
 *
 * 约束：
 * - package.json scripts 中列出的 CLI 必须在编目（docs/capabilities.json）里登记。
 * - 编目引用的源码文件必须存在；编目的网格阈值必须与源码 `const DEFAULT_*` 常量一致。
 * - 编目的 gms 命令必须在 web/index.html 的 `window.gms = {…}` 里真实存在。
 * - 编目的 gms.part 类型必须在 web/index.html 的 `const TYPES = […]` 里真实存在。
 *
 * 任何编目与真实接口漂移（改了 CLI 忘了入目录、改阈值没同步、删了 gms 命令）都会让本测试失败。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
function findRoot(dir: string): string {
  return existsSync(path.join(dir, 'package.json')) ? dir : findRoot(path.dirname(dir))
}
const ROOT = findRoot(HERE)

function readText(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8')
}

const packageJson = JSON.parse(readText('package.json'))
interface CatalogCli {
  name: string
  command: string
  bin: string
  params: string[]
  outputs: string[]
  source: string
  description: string
}
interface Catalog {
  schemaVersion: number
  generatedBy: string
  tool: { name: string; version: string }
  cli: CatalogCli[]
  gms: { commands: Record<string, string[]>; partTypes: string[] }
  mesh: { verificationThresholds: Record<string, string> }
  scripts: string[]
}

// 官方 CLI 脚本（由 package.json bin + scripts 定义，需在编目里登记）。
const CLI_SCRIPT_NAMES = ['gen-model', 'export-mesh', 'contour-model', 'gen-gia', 'gen-resource-table', 'gen-calibration']

/** 从源码提取所有 `const NAME` 值。 */
function sourceConstants(): Record<string, string> {
  const targets: Record<string, string[]> = {
    'src/mesh/verify.ts': ['DEFAULT_WELD_TOL', 'DEFAULT_MIN_AREA', 'DEFAULT_SKINNY_EDGE_RATIO', 'DEFAULT_MAX_SKINNY_PCT', 'DEFAULT_MAX_AREA_RATIO', 'DEFAULT_MAX_SAMPLES'],
    'src/mesh/panelize.ts': ['DEFAULT_QUAD_THICKNESS', 'DEFAULT_TRI_THICKNESS', 'DEFAULT_BOX_THICKNESS', 'DEFAULT_MIN_AREA', 'DEFAULT_NORMAL_TOL'],
    'src/mesh/contour-loft.ts': ['DEFAULT_RESAMPLE_POINTS']
  }
  const out: Record<string, string> = {}
  for (const [rel, names] of Object.entries(targets)) {
    const text = readText(rel)
    for (const name of names) {
      const m = new RegExp(`const\\s+${name}\\s*=\\s*([^/;\\n]+)`).exec(text)
      assert.ok(m, `源码缺失常量 ${name}（${rel}）`)
      out[`${rel}#${name}`] = m![1].trim().replace(/\s+/g, ' ')
    }
  }
  return out
}

/** 从 web/index.html 提取 window.gms 的方法键。 */
function gmsMethodKeys(): Set<string> {
  const text = readText('web/index.html')
  const set = new Set<string>()
  for (const m of text.matchAll(/\n\s+([a-zA-Z0-9]+):\s*gms[A-Za-z]+/g)) set.add(m[1])
  return set
}

/** 从 web/index.html 提取 gms.part 类型（const TYPES = […]）。 */
function partTypes(): string[] {
  const text = readText('web/index.html')
  const m = /const\s+TYPES\s*=\s*\[([^\]]+)\]/.exec(text)
  assert.ok(m, 'web/index.html 缺 const TYPES')
  return m![1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean)
}

test('capabilities: docs/capabilities.json 存在且 schemaVersion 正确', () => {
  assert.ok(existsSync(path.join(ROOT, 'docs', 'capabilities.json')), 'docs/capabilities.json 缺失（请先运行 npm run capabilities）')
  const cat: Catalog = JSON.parse(readText('docs/capabilities.json'))
  assert.equal(cat.schemaVersion, 1)
  assert.equal(cat.generatedBy, 'scripts/list-capabilities.mjs')
})

test('capabilities: package.json scripts 中的官方 CLI 都在编目里登记', () => {
  const cat: Catalog = JSON.parse(readText('docs/capabilities.json'))
  const catalogNames = new Set(cat.cli.map((c) => c.name))
  for (const name of CLI_SCRIPT_NAMES) {
    assert.ok(catalogNames.has(name), `CLI ${name} 未在编目登记（编目目前: ${[...catalogNames].join(', ')}）`)
    assert.ok(packageJson.scripts[name], `package.json 缺 script ${name}`)
  }
})

test('capabilities: 编目 CLI 引用的源码文件与命令都存在且一致', () => {
  const cat: Catalog = JSON.parse(readText('docs/capabilities.json'))
  for (const c of cat.cli) {
    assert.ok(existsSync(path.join(ROOT, c.source)), `编目 CLI ${c.name} 引用的源码不存在: ${c.source}`)
    // command 必须以可执行脚本体出现（要么是 npm run 脚本，要么是可运行 node/mjs）。
    const scriptCmd = c.command.replace(/^npm run\s+/, '')
    assert.ok(packageJson.scripts[scriptCmd] || existsSync(path.join(ROOT, c.command)), `编目 CLI ${c.name} 的 command 无法运行: ${c.command}`)
    assert.ok(c.params.length > 0 || c.outputs.length > 0, `编目 CLI ${c.name} 未登记参数或输出`)
    assert.ok(c.outputs.length > 0, `编目 CLI ${c.name} 未登记输出`)
  }
})

test('capabilities: 网格阈值与源码 DEFAULT_* 常量逐字一致', () => {
  const cat: Catalog = JSON.parse(readText('docs/capabilities.json'))
  const constants = sourceConstants()
  const map: Record<string, string> = {
    weldTolerance: 'src/mesh/verify.ts#DEFAULT_WELD_TOL',
    minArea: 'src/mesh/verify.ts#DEFAULT_MIN_AREA',
    skinnyEdgeRatio: 'src/mesh/verify.ts#DEFAULT_SKINNY_EDGE_RATIO',
    maxSkinnyPct: 'src/mesh/verify.ts#DEFAULT_MAX_SKINNY_PCT',
    maxAreaRatio: 'src/mesh/verify.ts#DEFAULT_MAX_AREA_RATIO',
    quadThickness: 'src/mesh/panelize.ts#DEFAULT_QUAD_THICKNESS',
    triThickness: 'src/mesh/panelize.ts#DEFAULT_TRI_THICKNESS',
    boxThickness: 'src/mesh/panelize.ts#DEFAULT_BOX_THICKNESS',
    normalTolerance: 'src/mesh/panelize.ts#DEFAULT_NORMAL_TOL',
    resamplePoints: 'src/mesh/contour-loft.ts#DEFAULT_RESAMPLE_POINTS'
  }
  for (const [key, srcKey] of Object.entries(map)) {
    const expected = constants[srcKey]
    const actual = String(cat.mesh.verificationThresholds[key]).replace(/%$/, '')
    assert.equal(actual, expected, `编目阈值 ${key} 与源码常量不一致（源码 ${srcKey}=${expected}，编目=${cat.mesh.verificationThresholds[key]}）`)
  }
})

test('capabilities: 编目 gms 命令在 web/index.html 真实存在', () => {
  const cat: Catalog = JSON.parse(readText('docs/capabilities.json'))
  const keys = gmsMethodKeys()
  for (const [group, cmds] of Object.entries(cat.gms.commands)) {
    for (const c of cmds) {
      assert.ok(keys.has(c), `编目 gms 命令 ${c}（${group}）在 web/index.html 缺失`)
    }
  }
})

test('capabilities: 编目 gms.part 类型在 web/index.html 真实存在', () => {
  const cat: Catalog = JSON.parse(readText('docs/capabilities.json'))
  const types = partTypes()
  for (const t of cat.gms.partTypes) {
    assert.ok(types.includes(t), `编目 gms.part 类型 ${t} 不在 web/index.html const TYPES 里（实际: ${types.join(',')}）`)
  }
  assert.deepEqual(cat.gms.partTypes, types, '编目 part 类型与 web/index.html TYPES 不一致')
})
