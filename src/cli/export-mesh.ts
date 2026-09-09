#!/usr/bin/env node
/**
 * export-mesh CLI：`export-mesh <input.json> [--out-dir <dir>] [--format gil|gia|both]
 * [--budget <N>] [--force] [--format-txt text|json]`
 *
 * 输入：structure.json 超集（含 mesh item：resourceId=10009019 + vertices/faces/colors）
 * 或独立 mesh JSON（{ name?, vertices, faces, colors? }）。
 *
 * 流程：网格 item 逐件确定性面板化（配对→10009003 平面 / 未配对→10009006 三棱锥 /
 * 退化→10009001 盒兜底）→ 全官方基本元件 structure → .gil / .gia 候选 + 结构回写 +
 * 机器可读摘要（单元数 / 字节 / 预算）。
 *
 * 确定性：相同输入必得相同字节（无时间戳、无随机数）。预算超限默认继续并标记 exceeded
 * （真正拦截留给 03 门禁；panelize 已留 gateCheck/stats 对接缝）。
 *
 * 输出（同目录或 --out-dir，拒绝覆盖，--force 除外）：
 *   <name>.gil                  .gil 候选
 *   <name>.gia                  .gia 候选（--format gia/both）
 *   <name>.structure.json       面板化后的规范 structure.json 超集
 *   <name>.summary.json         摘要（单元数 / 字节 / 预算 / 结构统计）
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

import { encodeStructure } from '../core/encoder.js'
import { resolveStructure, type StructureItem } from '../core/structure.js'
import { encodeGia } from '../gia/gia-encoder.js'
import {
  panelizeMesh,
  colorStringToItemColor,
  type PanelItem,
  type PanelizeStats
} from '../mesh/panelize.js'
import { makeGiaInput, MESH_RESOURCE_ID, ROOT_SCALE, OVERALL_SCALE } from './gia-common.js'
import { verifyMeshExport, type MeshVerifyResult } from '../mesh/verify.js'
import { auditExport, formatQaMarkdown } from '../qa/export-qa.js'

const VERSION = '0.1.0'

type Format = 'gil' | 'gia' | 'both'

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function usage(): string {
  return [
    'Usage: export-mesh <input.json> [options]',
    '',
    'Panelize a mesh (structure.json superset or standalone mesh JSON) into official',
    'primitives and emit .gil/.gia candidates plus a machine-readable summary.',
    '',
    'Options:',
    '  --out-dir <dir>    output directory (default: same directory as the input)',
    '  --format <fmt>     output formats: gil, gia, or both (default: both)',
    '  --budget <N>       face budget: mark summary when the unit count exceeds N',
    '  --no-gate          skip the verification gate (summary notes SKIPPED_GATE)',
    '  --max-skinny-pct <P>   skinny-triangle percentage limit (default 5)',
    '  --max-area-ratio <R>   p95/p5 area ratio limit (default 20)',
    '  --assembly         multi-shell assembly mode: open edges / cross-shell intersections',
    '                     are reported but not treated as gate failures (weld/normals/',
    '                     degenerate/skinny/areaRatio/budget stay enforced)',
    '  --no-qa            skip the post-export QA audit (default: run it)',
    '  --root-scale <S>   main-model scale written as GIA root (default 0.1); item data is divided by S',
    '  --overall-scale <K> overall size multiplier: root = S*K, item data unchanged (default 1)',
    '  --force            overwrite existing output files',
    '  --format-txt <f>   summary output: text (default) or json',
    '  -h, --help         display this help'
  ].join('\n')
}

function parseArgs(argv: string[]): {
  input?: string
  outDir?: string
  format: Format
  budget: number | null
  force: boolean
  noGate: boolean
  assembly: boolean
  maxSkinnyPct: number | null
  maxAreaRatio: number | null
  qa: boolean
  summaryFormat: 'text' | 'json'
  rootScale: number
  overallScale: number
  help: boolean
} {
  const result = {
    input: undefined as string | undefined,
    outDir: undefined as string | undefined,
    format: 'both' as Format,
    budget: null as number | null,
    force: false,
    noGate: false,
    assembly: false,
    maxSkinnyPct: null as number | null,
    maxAreaRatio: null as number | null,
    qa: true,
    summaryFormat: 'text' as 'text' | 'json',
    rootScale: ROOT_SCALE,
    overallScale: OVERALL_SCALE,
    help: false
  }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    const next = (): string => {
      const value = argv[++index]
      if (value === undefined) throw new Error(`[error] ${arg} requires a value`)
      return value
    }
    if (arg === '--out-dir') result.outDir = next()
    else if (arg === '--format') {
      const value = next()
      if (value !== 'gil' && value !== 'gia' && value !== 'both') {
        throw new Error(`[error] --format must be gil, gia, or both (got ${value})`)
      }
      result.format = value
    } else if (arg === '--budget') {
      const value = Number(next())
      if (!Number.isInteger(value) || value < 0) {
        throw new Error(`[error] --budget must be a non-negative integer (got ${value})`)
      }
      result.budget = value
    } else if (arg === '--force') result.force = true
    else if (arg === '--no-gate') result.noGate = true
    else if (arg === '--assembly') result.assembly = true
    else if (arg === '--max-skinny-pct') {
      const value = Number(next())
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`[error] --max-skinny-pct must be a non-negative number (got ${value})`)
      }
      result.maxSkinnyPct = value
    } else if (arg === '--max-area-ratio') {
      const value = Number(next())
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`[error] --max-area-ratio must be a non-negative number (got ${value})`)
      }
      result.maxAreaRatio = value
    }
    else if (arg === '--no-qa') result.qa = false
    else if (arg === '--format-txt') {
      const value = next()
      if (value !== 'text' && value !== 'json') {
        throw new Error(`[error] --format-txt must be text or json (got ${value})`)
      }
      result.summaryFormat = value
    } else if (arg === '--root-scale') {
      const value = Number(next())
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`[error] --root-scale must be a positive number (got ${value})`)
      }
      result.rootScale = value
    } else if (arg === '--overall-scale') {
      const value = Number(next())
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`[error] --overall-scale must be a positive number (got ${value})`)
      }
      result.overallScale = value
    } else if (arg === '-h' || arg === '--help') result.help = true
    else if (arg.startsWith('-')) throw new Error(`[error] unknown option: ${arg}`)
    else if (result.input !== undefined) throw new Error(`[error] unexpected argument: ${arg}`)
    else result.input = arg
  }
  return result
}

function writeNew(filePath: string, contents: string | Uint8Array, force: boolean): void {
  const absolute = path.resolve(filePath)
  if (!force && fs.existsSync(absolute)) {
    throw new Error(`[error] output already exists: ${absolute} (use --force to overwrite)`)
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, contents)
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}

/** 判断一个 item 是否为网格项（10009019 且带 vertices/faces）。 */
function isMeshItem(item: Record<string, unknown>): boolean {
  return item.resourceId === MESH_RESOURCE_ID && Array.isArray(item.vertices) && Array.isArray(item.faces)
}

/**
 * 加载并规范化输入：
 * - 独立 mesh JSON（{name?, vertices, faces, colors?}）→ 包成带一个 mesh item 的 structure。
 * - structure.json 超集 → 原样保留非 mesh item；mesh item 逐件面板化。
 */
function loadInput(inputPath: string): { name: string; rawItems: Record<string, unknown>[] } {
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  } catch (error) {
    const detail = error instanceof SyntaxError ? 'invalid JSON' : `cannot be read: ${String(error)}`
    throw new Error(`[error] export-mesh ${inputPath}: ${detail}`)
  }
  const root = parsed as Record<string, unknown>
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new Error('[error] export-mesh input must be a JSON object')
  }
  // 独立 mesh JSON：直接有 vertices/faces，或被 { mesh: {...} } 包裹。
  if (Array.isArray(root.vertices) && Array.isArray(root.faces)) {
    const name = typeof root.name === 'string' && root.name ? root.name : 'mesh'
    return {
      name,
      rawItems: [{ ...root, resourceId: MESH_RESOURCE_ID }]
    }
  }
  if (root.mesh && typeof root.mesh === 'object') {
    const mesh = root.mesh as Record<string, unknown>
    const name = typeof root.name === 'string' && root.name ? root.name : 'mesh'
    return {
      name,
      rawItems: [{ resourceId: MESH_RESOURCE_ID, ...mesh }]
    }
  }
  // structure.json 超集：必须有 items。
  if (!Array.isArray(root.items)) {
    throw new Error('[error] export-mesh input must be a mesh JSON or a structure.json with items')
  }
  const name = typeof root.name === 'string' && root.name ? root.name : 'mesh'
  return { name, rawItems: (root.items as unknown[]) as Record<string, unknown>[] }
}

function isMesh(mesh: Record<string, unknown>): mesh is { vertices: number[][]; faces: number[]; colors?: string[] } {
  return Array.isArray(mesh.vertices) && Array.isArray(mesh.faces)
}

function buildStructureItems(rawItems: Record<string, unknown>[]): {
  items: StructureItem[]
  stats: PanelizeStats[]
  meshes: { vertices: number[][]; faces: number[]; colors?: string[] }[]
} {
  const statsList: PanelizeStats[] = []
  const meshes: { vertices: number[][]; faces: number[]; colors?: string[] }[] = []
  const outItems: StructureItem[] = []
  for (const raw of rawItems) {
    if (isMeshItem(raw)) {
      const mesh = isMesh(raw) ? raw : { vertices: raw.vertices as number[][], faces: raw.faces as number[] }
      const result = panelizeMesh(mesh)
      statsList.push(result.stats)
      meshes.push(mesh)
      if (result.items.length === 0) {
        throw new Error('[error] export-mesh: mesh item produced zero official units')
      }
      for (const item of result.items) {
        outItems.push(toStructureItem(item))
      }
    } else {
      outItems.push(raw as unknown as StructureItem)
    }
  }
  return { items: outItems, stats: statsList, meshes }
}

function toStructureItem(item: PanelItem): StructureItem {
  const color = colorStringToItemColor(item.color)
  return {
    resourceId: item.resourceId,
    position: item.position,
    rotation: item.rotation,
    scale: item.scale,
    ...(color === undefined ? {} : { color })
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (!args.input) throw new Error('[error] missing <input.json> (see --help)')

  const inputPath = path.resolve(args.input)
  const inputBytes = fs.readFileSync(inputPath)
  const inputSha256 = sha256(inputBytes)
  const { name, rawItems } = loadInput(inputPath)
  const { items, stats, meshes } = buildStructureItems(rawItems)

  const meshUnits = stats.reduce((n, s) => n + s.budget.used, 0)
  const requested = args.budget
  const used = meshUnits
  const exceeded = requested !== null && used > requested

  // 汇总面板化统计（可能有多个 mesh item：平滑合并到单个摘要）。
  const meshSummary: PanelizeStats = stats.reduce(
    (acc, s) => ({
      faces: acc.faces + s.faces,
      quads: acc.quads + s.quads,
      tris: acc.tris + s.tris,
      degenerate: acc.degenerate + s.degenerate,
      budget: { requested, used, exceeded }
    }),
    { faces: 0, quads: 0, tris: 0, degenerate: 0, budget: { requested, used, exceeded } }
  )

  const structure = resolveStructure({ name, template: '空模型', items })

  const outDir = path.resolve(args.outDir ?? path.dirname(inputPath))
  const base = path.join(outDir, name)
  const gilPath = `${base}.gil`
  const giaPath = `${base}.gia`
  const structurePath = `${base}.structure.json`
  const summaryPath = `${base}.summary.json`

  // 门禁：默认开启；--no-gate 跳过（summary 注明 SKIPPED_GATE）。先跑 panelize 拿 stats，
  // 以「面板化单元数」为准与 --budget 比较（复用 02 gateCheck/stats 对接缝）。
  // 无 mesh item 的输入没有可校验几何，门禁无事可做（不拦截）。
  const gateRan = !args.noGate && meshes.length > 0
  const gate: MeshVerifyResult | null = gateRan
    ? verifyMeshExport(meshes, stats.map((s) => s.budget.used), requested, {
        assembly: args.assembly,
        ...(args.maxSkinnyPct === null ? {} : { maxSkinnyPct: args.maxSkinnyPct }),
        ...(args.maxAreaRatio === null ? {} : { maxAreaRatio: args.maxAreaRatio })
      })
    : null

  const meshModel = {
    faces: meshSummary.faces,
    quads: meshSummary.quads,
    tris: meshSummary.tris,
    degenerate: meshSummary.degenerate
  }

  // 门禁失败：拒绝产出 .gil/.gia/.structure.json，但仍写 .summary.json（诊断）并报中文错误。
  if (gate && !gate.ok) {
    const summary = {
      schemaVersion: 1,
      kind: 'genshin-model-studio.export-mesh.summary',
      tool: { name: 'genshin-model-studio', version: VERSION },
      input: { file: inputPath, sha256: inputSha256 },
      model: {
        name: structure.name,
        template: structure.template,
        templatePrefabId: structure.templatePrefabId,
        prefabId: structure.prefabId,
        itemCount: structure.items.length,
        resources: structure.items.map((item) => item.resourceId),
        mesh: meshModel
      },
      output: { summary: summaryPath },
      budget: { requested, used, exceeded },
      gate: {
        panelizeGateCheck: 'available-seam',
        invoked: true,
        state: 'failed',
        ok: gate.ok,
        checkedFaces: gate.checkedFaces,
        failures: gate.failures,
        checks: gate.checks
      }
    }
    writeNew(summaryPath, prettyJson(summary), args.force)
    throw new Error(
      `[gate] 网格验证未通过（已拒绝导出 .gil/.gia）:\n${gate.failures.map((f) => `  - ${f}`).join('\n')}`
    )
  }

  const gilCandidate = encodeStructure(structure)
  if (args.format === 'gil' || args.format === 'both') writeNew(gilPath, gilCandidate, args.force)
  let giaCandidate: Uint8Array | null = null
  if (args.format === 'gia' || args.format === 'both') {
    giaCandidate = encodeGia(
      makeGiaInput(name, structure.items, { rootScale: args.rootScale, overallScale: args.overallScale })
    )
    writeNew(giaPath, giaCandidate, args.force)
  }

  writeNew(structurePath, prettyJson(structure), args.force)

  const summaryGate = gate
    ? {
        panelizeGateCheck: 'available-seam',
        invoked: true,
        state: 'passed',
        ok: gate.ok,
        checkedFaces: gate.checkedFaces,
        failures: gate.failures,
        checks: gate.checks
      }
    : args.noGate
      ? { panelizeGateCheck: 'available-seam', invoked: false, state: 'skipped', reason: 'SKIPPED_GATE' }
      : { panelizeGateCheck: 'available-seam', invoked: false, state: 'skipped', reason: 'NO_MESH' }

  const summary = {
    schemaVersion: 1,
    kind: 'genshin-model-studio.export-mesh.summary',
    tool: { name: 'genshin-model-studio', version: VERSION },
    input: { file: inputPath, sha256: inputSha256 },
    model: {
      name: structure.name,
      template: structure.template,
      templatePrefabId: structure.templatePrefabId,
      prefabId: structure.prefabId,
      itemCount: structure.items.length,
      resources: structure.items.map((item) => item.resourceId),
      mesh: meshModel
    },
    output: {
      ...(args.format === 'gil' || args.format === 'both'
        ? { gil: gilPath, gilSize: gilCandidate.length, gilSha256: sha256(gilCandidate) }
        : {}),
      ...(args.format === 'gia' || args.format === 'both'
        ? { gia: giaPath, giaSize: giaCandidate?.length ?? 0, giaSha256: sha256(giaCandidate ?? new Uint8Array()) }
        : {}),
      structure: structurePath,
      summary: summaryPath
    },
    budget: { requested, used, exceeded },
    gate: summaryGate
  }
  writeNew(summaryPath, prettyJson(summary), args.force)

  if (args.summaryFormat === 'json') {
    process.stdout.write(prettyJson(summary))
  } else {
    console.log(`model=${structure.name}`)
    console.log(`template=${structure.template} (${structure.templatePrefabId})`)
    console.log(`prefabId=${structure.prefabId}`)
    console.log(`items=${structure.items.length}`)
    console.log(`resources=${structure.items.map((item) => item.resourceId).join(',')}`)
    console.log(`mesh=${JSON.stringify(meshSummary)}`)
    console.log(`budget=${JSON.stringify(summary.budget)}`)
    for (const key of ['gil', 'gia'] as const) {
      const out = summary.output as Record<string, unknown>
      if (out[key]) {
        const size = out[`${key}Size`]
        const hash = out[`${key}Sha256`]
        console.log(`${key}=${String(out[key])} (${String(size)} bytes) sha256=${String(hash)}`)
      }
    }
    console.log(`structure=${structurePath}`)
    console.log(`summary=${summaryPath}`)
  }

  // 导出后 QA 审计（默认开启；--no-qa 关闭）。QA 独立於 gate：--no-gate 不改变 QA。
  if (args.qa) {
    try {
      const qa = auditExport(outDir, { name })
      const qaJsonPath = path.join(outDir, `${name}.qa.json`)
      const qaMdPath = path.join(outDir, `${name}.qa.md`)
      writeNew(qaJsonPath, prettyJson(qa), true)
      writeNew(qaMdPath, formatQaMarkdown(qa) + '\n', true)
      console.log(`qa=${qa.ok ? 'ok' : 'failed'}`)
      console.log(`qa.json=${qaJsonPath}`)
      console.log(`qa.md=${qaMdPath}`)
      if (!qa.ok) {
        // 产物已保留；仅报审计失败 + 非零退出码。
        process.stderr.write(
          `[qa] 导出 QA 未通过（产物已保留）：\n${qa.failures.map((f) => `  - ${f}`).join('\n')}\n`
        )
        process.exitCode = 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`[qa] 审计执行失败：${message}\n`)
      process.exitCode = 1
    }
  }
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}
