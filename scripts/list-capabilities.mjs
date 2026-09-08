#!/usr/bin/env node
/**
 * list-capabilities.mjs — 能力编目（发现-选择-运行）。
 *
 * 生成 `docs/capabilities.md`（人类可读）与 `docs/capabilities.json`（机器可读），
 * 覆盖三类能力：CLI（名称/命令/参数/输出）、gms 命令组（几何/组件/物理声明/工具 + part 类型）、
 * 网格验证阈值（verify.ts / panelize.ts / contour-loft.ts 默认值）。
 *
 * 单一来源约束：CLI 参数与输出以各 CLI 的 --help / 源码为准（本脚本只登记，不手写冲突）；
 * 网格阈值直接读取源码 `const DEFAULT_*` 常量，保证与实现逐字一致。
 *
 * 运行（先构建，确保 dist/resource-meta 可导入）：
 *   npm run build --silent && node scripts/list-capabilities.mjs           # 写 docs/capabilities.{md,json} 并打印 JSON
 *   node scripts/list-capabilities.mjs --check                            # 只校验（drift 则非零退出），不写
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

function readJsonUrl(url) {
  return JSON.parse(readFileSync(new URL(url), 'utf8'))
}
function readText(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8')
}

const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

/* ------------------------- 资源表（来自官方单一来源） ------------------------- */
let resourceRows = []
try {
  const mod = await import(path.join(ROOT, 'dist', 'src', 'core', 'resource-meta.js'))
  resourceRows = mod.canonicalResourceRows()
} catch {
  console.error('[error] 请先构建再运行：npm run build --silent && node scripts/list-capabilities.mjs')
  process.exit(2)
}

/* ------------------------- CLI 编目（参数/输出以 --help + 源码为准） ------------------------- */
const CLI = [
  {
    name: 'gen-model',
    command: 'npm run gen-model',
    bin: 'dist/src/cli/gen-model.js',
    params: ['<input.json> (structure.json 超集)', '--out-dir <dir>', '--force', '--format text|json', '--list-resources', '-h/--help'],
    outputs: ['<name>.gil', '<name>.summary.json'],
    source: 'src/cli/gen-model.ts',
    description: 'structure.json 超集 → .gil 候选 + 摘要；--list-resources 打印官方基础元件速查表。'
  },
  {
    name: 'export-mesh',
    command: 'npm run export-mesh',
    bin: 'dist/src/cli/export-mesh.js',
    params: ['<input.json> (mesh JSON 或 structure 超集)', '--out-dir <dir>', '--format gil|gia|both', '--budget <N>', '--no-gate', '--force', '--format-txt text|json', '-h/--help'],
    outputs: ['<name>.gil', '<name>.gia', '<name>.structure.json', '<name>.summary.json'],
    source: 'src/cli/export-mesh.ts',
    description: '面板化（配对→10009003 平面 / 未配对→10009006 / 退化→10009001 盒）→ .gil/.gia + 摘要；默认门禁。'
  },
  {
    name: 'contour-model',
    command: 'npm run contour-model',
    bin: 'dist/src/cli/contour-model.js',
    params: ['<input.json> (topOutline+sideProfile 或 rings)', '--out-dir <dir>', '--name <name>', '--format gil|gia|both', '--budget <N>', '--points <N>', '--views', '--no-gate', '--force', '--format-txt text|json', '-h/--help'],
    outputs: ['<name>.mesh.json', '<name>.structure.json', '<name>.gil', '<name>.gia', '<name>.summary.json', 'view-{iso,front,side,top,back}.svg'],
    source: 'src/cli/contour-model.ts',
    description: '任意闭合轮廓（顶视+侧视剖面或直接环）→ 蒙皮水密网格 → 面板化 → 门禁 → 导出；--views 五视角 SVG。'
  },
  {
    name: 'gen-gia',
    command: 'npm run gen-gia',
    bin: 'dist/src/gia/gia-encoder.js',
    params: ['<structure.json>', '<output.gia>'],
    outputs: ['<output.gia>'],
    source: 'src/gia/gia-encoder.ts',
    description: 'structure.json 超集 → .gia 字节（GIA 格式破译自真实样本）。'
  },
  {
    name: 'gen-resource-table',
    command: 'npm run gen-resource-table',
    bin: 'scripts/gen-resource-table.mjs',
    params: ['--write'],
    outputs: ['docs/input-format.md', 'README.md'],
    source: 'scripts/gen-resource-table.mjs',
    description: '官方基础元件资源表单一来源，生成/校验 docs/input-format.md 与 README.md 资源行。'
  },
  {
    name: 'gen-calibration',
    command: 'npm run gen-calibration',
    bin: 'scripts/gen-calibration-package.mjs',
    params: ['（无命令行参数；确定性生成校准包，可重跑）'],
    outputs: ['delivery/calibration-mesh/*/', 'delivery/calibration-mesh/MANIFEST.json'],
    source: 'scripts/gen-calibration-package.mjs',
    description: '生成网格-面片最小校准包（10009003/10009006/10009019 + 面板化示例）。'
  }
]

/* ------------------------- gms 命令组（web/index.html window.gms） ------------------------- */
const GMS_COMMANDS = {
  geometry: ['clear', 'circle', 'rect', 'line', 'curve', 'polyline', 'loop', 'undo', 'import', 'export'],
  component: ['part', 'group', 'ungroup', 'props', 'rotate', 'rotatem', 'delete'],
  physicsDeclaration: ['point', 'touches', 'link', 'floating', 'collides', 'verify', 'parts'],
  tool: ['summary', 'px2m', 'm2px', 'mode', 'list']
}
const GMS_PART_TYPES = ['ring', 'rod', 'poly', 'sphere', 'cone', 'tri', 'quad', 'disc', 'el-disc', 'arc', 'plate', 'mesh']

/* ------------------------- 网格阈值（读取源码 DEFAULT_* 常量） ------------------------- */
const CONSTANT_SOURCES = {
  'src/mesh/verify.ts': ['DEFAULT_WELD_TOL', 'DEFAULT_MIN_AREA', 'DEFAULT_SKINNY_EDGE_RATIO', 'DEFAULT_MAX_SKINNY_PCT', 'DEFAULT_MAX_AREA_RATIO', 'DEFAULT_MAX_SAMPLES'],
  'src/mesh/panelize.ts': ['DEFAULT_QUAD_THICKNESS', 'DEFAULT_TRI_THICKNESS', 'DEFAULT_BOX_THICKNESS', 'DEFAULT_MIN_AREA', 'DEFAULT_NORMAL_TOL'],
  'src/mesh/contour-loft.ts': ['DEFAULT_RESAMPLE_POINTS']
}
function sourceConstants() {
  const grouped = {}
  for (const [rel, names] of Object.entries(CONSTANT_SOURCES)) {
    const text = readText(rel)
    for (const name of names) {
      const m = new RegExp(`const\\s+${name}\\s*=\\s*([^/;\\n]+)`).exec(text)
      if (!m) throw new Error(`[capabilities] 源码缺失常量 ${name} in ${rel}`)
      grouped[`${rel}#${name}`] = m[1].trim().replace(/\s+/g, ' ')
    }
  }
  return grouped
}

const VERIFICATION_THRESHOLDS = {
  watertight: 'openEdges=0 且 nonManifold=0（每条边引用次数：2=闭合、1=开边、>2=非流形）',
  weldTolerance: sourceConstants()['src/mesh/verify.ts#DEFAULT_WELD_TOL'] ?? '2e-4',
  minArea: sourceConstants()['src/mesh/verify.ts#DEFAULT_MIN_AREA'] ?? '1e-9',
  skinnyEdgeRatio: sourceConstants()['src/mesh/verify.ts#DEFAULT_SKINNY_EDGE_RATIO'] ?? '0.08',
  maxSkinnyPct: `${sourceConstants()['src/mesh/verify.ts#DEFAULT_MAX_SKINNY_PCT'] ?? '5'}%`,
  maxAreaRatio: sourceConstants()['src/mesh/verify.ts#DEFAULT_MAX_AREA_RATIO'] ?? '20',
  quadThickness: sourceConstants()['src/mesh/panelize.ts#DEFAULT_QUAD_THICKNESS'] ?? '0.005',
  triThickness: sourceConstants()['src/mesh/panelize.ts#DEFAULT_TRI_THICKNESS'] ?? '0.002',
  boxThickness: sourceConstants()['src/mesh/panelize.ts#DEFAULT_BOX_THICKNESS'] ?? '0.0015',
  normalTolerance: sourceConstants()['src/mesh/panelize.ts#DEFAULT_NORMAL_TOL'] ?? '0.999',
  resamplePoints: sourceConstants()['src/mesh/contour-loft.ts#DEFAULT_RESAMPLE_POINTS'] ?? '200',
  degenerateMode: "'box'（默认；或 'skip' 只计数）"
}

const CATALOG = {
  schemaVersion: 1,
  generatedBy: 'scripts/list-capabilities.mjs',
  tool: { name: packageJson.name, version: packageJson.version },
  cli: CLI,
  gms: { commands: GMS_COMMANDS, partTypes: GMS_PART_TYPES },
  mesh: { verificationThresholds: VERIFICATION_THRESHOLDS, resourceRows },
  scripts: Object.keys(packageJson.scripts || {})
}

/* ------------------------- 渲染 MD ------------------------- */
function section(title, body) {
  return `## ${title}\n\n${body}\n`
}
function renderMd(cat) {
  const out = []
  out.push(`# 能力编目（genshin-model-studio）\n`)
  out.push(`> 自动生成于 \`scripts/list-capabilities.mjs\`（${cat.generatedBy}）。单一来源：CLI 参数/输出以各 CLI --help 与源码为准；网格阈值直接读源码 ` + '`const DEFAULT_*`' + ` 常量，保证与实现逐字一致。\n`)

  out.push(section('CLI 命令', [
    '| 命令 | 命令名 | 参数 | 输出 | 源码 |',
    '|---|---|---|---|---|',
    ...cat.cli.map((c) => `| \`${c.name}\` | \`${c.command}\` | ${c.params.map((p) => '`' + p + '`').join(' · ')} | ${c.outputs.map((o) => '`' + o + '`').join(' · ')} | \`${c.source}\` |`)
  ].join('\n')))

  out.push(section('gms 命令组', [
    '> 浏览器内 `window.gms`：几何 / 组件 / 物理声明 / 工具。',
    '',
    '| 组 | 命令 |',
    '|---|---|',
    ...Object.entries(cat.gms.commands).map(([group, cmds]) => `| ${group} | ${cmds.map((c) => '`' + c + '`').join(', ')} |`)
  ].join('\n')))

  out.push(section('gms.part 类型', cat.gms.partTypes.map((t) => '`' + t + '`').join(' · ') + '\n'))

  out.push(section('网格验证阈值（verify.ts / panelize.ts / contour-loft.ts 默认值）', [
    '| 项 | 默认值 |',
    '|---|---|',
    ...Object.entries(cat.mesh.verificationThresholds).map(([k, v]) => `| ${k} | \`${v}\` |`)
  ].join('\n')))

  out.push(section('官方基础元件资源表', [
    '| 资源 ID | 名称 | 状态 | scale 语义 |',
    '|---|---|---|---|',
    ...cat.mesh.resourceRows.map((r) => `| ${r.resourceId} | ${r.name} | ${r.status} | ${r.scaleSemantics} |`)
  ].join('\n')))

  out.push(section('其他 scripts', cat.scripts.map((s) => '`' + s + '`').join(' · ') + '\n'))
  return out.join('\n')
}

/* ------------------------- 入口 ------------------------- */
const mdPath = path.join(ROOT, 'docs', 'capabilities.md')
const jsonPath = path.join(ROOT, 'docs', 'capabilities.json')
const md = renderMd(CATALOG)
const json = JSON.stringify(CATALOG, null, 2) + '\n'

if (process.argv.includes('--check')) {
  const drift = []
  if (!existsSync(mdPath) || readFileSync(mdPath, 'utf8') !== md) drift.push('docs/capabilities.md')
  if (!existsSync(jsonPath) || readFileSync(jsonPath, 'utf8') !== json) drift.push('docs/capabilities.json')
  if (drift.length) {
    console.error(`[error] 编目漂移：${drift.join(', ')}（重新运行 node scripts/list-capabilities.mjs）`)
    process.exit(1)
  }
  console.log('capabilities catalog up-to-date')
  process.exit(0)
}

writeFileSync(jsonPath, json)
writeFileSync(mdPath, md)
console.log(`wrote docs/capabilities.md (${md.length} bytes)`)
console.log(`wrote docs/capabilities.json (${json.length} bytes)`)
process.stdout.write(json)
