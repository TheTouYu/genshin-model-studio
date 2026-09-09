#!/usr/bin/env node
/**
 * contour-model CLI：`contour-model <input.json> [--out-dir <dir>] [--name <name>]
 * [--format gil|gia|both] [--budget <N>] [--points <N>] [--views] [--no-gate]
 * [--force] [--format-txt text|json]`
 *
 * 输入 JSON（二选一）：
 *   ① 视图轮廓：{ name?, topOutline:[[x,z],…], sideProfile:[{y,widthScale,centerZ?}],
 *       points?, cap?, colorBands? }   → contourFromViews + ringsToMesh
 *   ② 直接截面环：{ name?, rings:[[[x,y,z],…],…], cap?, colorBands?, ringCountLimit? }
 *      → ringsToMesh（高级用法）
 *
 * 流程：构建轮廓环 → 蒙皮成 {vertices,faces,colors} → 写 <name>.mesh.json →
 * 面板化（02 最小单元）→ 门禁（03 verify，默认开）→ 导出（走 export-mesh 同源路径：
 * .structure.json / .gil / .gia / .summary.json，--format/--budget/--no-gate 一致）。
 * `--views` 额外生成五视角正交投影线框快照 view-{iso,front,side,top,back}.svg
 * （纯 node 实现：正交投影 + 三角填充 + 简单深度排序，确定性、无新依赖）。
 *
 * 确定性：相同输入 + 相同 opts ⇒ 相同网格/字节/SVG（无随机、无时间戳）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

import {
  ringsToMesh,
  contourFromViews,
  type LoftMesh,
  type ColorBand,
  type Vec3,
  DEFAULT_RESAMPLE_POINTS
} from '../mesh/contour-loft.js'
import {
  panelizeMesh,
  colorStringToItemColor,
  type PanelItem
} from '../mesh/panelize.js'
import { makeGiaInput, ROOT_SCALE, OVERALL_SCALE } from './gia-common.js'
import { verifyMeshExport, type MeshVerifyResult } from '../mesh/verify.js'
import { auditExport, formatQaMarkdown } from '../qa/export-qa.js'
import { resolveStructure, type StructureItem } from '../core/structure.js'
import { encodeStructure } from '../core/encoder.js'
import { encodeGia } from '../gia/gia-encoder.js'

const VERSION = '0.1.0'

type Format = 'gil' | 'gia' | 'both'
type ViewName = 'iso' | 'front' | 'side' | 'top' | 'back'

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function usage(): string {
  return [
    'Usage: contour-model <input.json> [options]',
    '',
    'Loft an arbitrary closed contour (top view + side profile, or explicit rings) into a',
    'watertight 3D mesh, panelize it to official primitives, run the verification gate,',
    'and emit .mesh.json / .structure.json / .gil / .gia / .summary.json.',
    '',
    'Options:',
    '  --out-dir <dir>    output directory (default: same directory as the input)',
    '  --name <name>      output base name (default: input name or file basename)',
    '  --format <fmt>     output formats: gil, gia, or both (default: both)',
    '  --budget <N>       face budget: mark summary when the unit count exceeds N',
    '  --points <N>       ring sample count (default: input points or 200)',
    '  --views            emit five orthographic wireframe snapshots as .svg',
    '  --no-gate          skip the verification gate (summary notes SKIPPED_GATE)',
    '  --no-qa            skip the post-export QA audit (default: run it)',
    '  --root-scale <S>   main-model scale written as GIA root (default 0.1); item data is divided by S',
    '  --overall-scale <K> overall size multiplier: root = S*K, item data unchanged (default 1)',
    '  --force            overwrite existing output files',
    '  --format-txt <f>   summary output: text (default) or json',
    '  -h, --help         display this help'
  ].join('\n')
}

type ParsedArgs = {
  input?: string
  outDir?: string
  name?: string
  format: Format
  budget: number | null
  points?: number
  views: boolean
  noGate: boolean
  qa: boolean
  force: boolean
  summaryFormat: 'text' | 'json'
  rootScale: number
  overallScale: number
  help: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    input: undefined,
    outDir: undefined,
    name: undefined,
    format: 'both',
    budget: null,
    points: undefined,
    views: false,
    noGate: false,
    qa: true,
    force: false,
    summaryFormat: 'text',
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
    else if (arg === '--name') result.name = next()
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
    } else if (arg === '--points') {
      const value = Number(next())
      if (!Number.isInteger(value) || value < 3) {
        throw new Error(`[error] --points must be an integer >= 3 (got ${value})`)
      }
      result.points = value
    } else if (arg === '--views') result.views = true
    else if (arg === '--no-gate') result.noGate = true
    else if (arg === '--no-qa') result.qa = false
    else if (arg === '--force') result.force = true
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

/* ------------------------------- 输入加载 ------------------------------- */

type InputRoot = {
  name?: string
  topOutline?: number[][]
  sideProfile?: { y: number; widthScale: number; centerZ?: number }[]
  rings?: number[][][]
  points?: number
  cap?: 'none' | 'first' | 'last' | 'both'
  colorBands?: ColorBand[]
  ringCountLimit?: number
}

function loadInput(inputPath: string): InputRoot {
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  } catch (error) {
    const detail = error instanceof SyntaxError ? 'invalid JSON' : `cannot be read: ${String(error)}`
    throw new Error(`[error] contour-model ${inputPath}: ${detail}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('[error] contour-model input must be a JSON object')
  }
  return parsed as InputRoot
}

/* ------------------------------- 蒙皮 ------------------------------- */

function buildMesh(input: InputRoot, pointsOverride?: number): LoftMesh {
  const points = pointsOverride ?? input.points ?? DEFAULT_RESAMPLE_POINTS
  const cap = input.cap ?? 'none'
  const colorBands = input.colorBands
  if (Array.isArray(input.rings) && input.rings.length > 0) {
    return ringsToMesh(input.rings as Vec3[][], { points, cap, colorBands, ringCountLimit: input.ringCountLimit })
  }
  if (Array.isArray(input.topOutline) && Array.isArray(input.sideProfile)) {
    const rings = contourFromViews(input.topOutline, input.sideProfile, { points })
    return ringsToMesh(rings, { points, cap, colorBands })
  }
  throw new Error('[error] 输入需含 topOutline+sideProfile，或直接提供 rings')
}

/* ------------------------------- 导出链（export-mesh 同源） ------------------------------- */

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

/* ------------------------------- 五视角 SVG ------------------------------- */

const LIGHT = (() => {
  const v = [0.42, 0.8, 0.46]
  const l = Math.hypot(...v)
  return [v[0] / l, v[1] / l, v[2] / l]
})()

function cross3(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function dot3(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function shadeColor(hex: string, k: number): string {
  const m = /^0x([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return '#c7c7ce'
  const rgb = parseInt(m[1], 16)
  const clamp = (x: number) => Math.round(Math.min(255, Math.max(0, x)))
  const r = clamp(((rgb >> 16) & 0xff) * k)
  const g = clamp(((rgb >> 8) & 0xff) * k)
  const b = clamp((rgb & 0xff) * k)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function projectVertex(v: number[], view: ViewName): [number, number, number] {
  const x = v[0]
  const y = v[1]
  const z = v[2]
  switch (view) {
    case 'front':
      return [x, -y, z]
    case 'back':
      return [-x, -y, -z]
    case 'side':
      return [z, -y, x]
    case 'top':
      return [x, -z, y]
    case 'iso':
    default: {
      const u = (x - z) * 0.866
      const vv = -y - (x + z) * 0.5
      const d = (x + z) * 0.5 - y
      return [u, vv, d]
    }
  }
}

/** 纯 node 正交投影 + 三角填充 + 简单深度排序（确定性）。 */
export function renderViewSvg(
  vertices: number[][],
  faces: number[],
  colors: string[] | undefined,
  view: ViewName
): string {
  type Tri = { pts: [number, number][]; depth: number; fill: string }
  const tris: Tri[] = []

  const colorOf = (fi: number): string | undefined => (colors ? colors[fi] : undefined)

  for (let i = 0; i + 2 < faces.length; i += 3) {
    const a = faces[i]
    const b = faces[i + 1]
    const c = faces[i + 2]
    const va = vertices[a]
    const vb = vertices[b]
    const vc = vertices[c]
    if (!va || !vb || !vc) continue
    const pa = projectVertex(va, view)
    const pb = projectVertex(vb, view)
    const pc = projectVertex(vc, view)
    const depth = (pa[2] + pb[2] + pc[2]) / 3

    // 剔除近零面积的退化面。
    const area = Math.abs((pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]))
    if (area < 1e-12) continue

    const normal = cross3(
      [vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]],
      [vc[0] - va[0], vc[1] - va[1], vc[2] - va[2]]
    )
    const nl = Math.hypot(...normal)
    const bright = nl < 1e-12 ? 0.7 : 0.42 + 0.58 * Math.max(0, dot3(normal.map((n) => n / nl), LIGHT))
    const fill = shadeColor(colorOf(i / 3) ?? '0xC7C7CE', bright)

    tris.push({ pts: [[pa[0], pa[1]], [pb[0], pb[1]], [pc[0], pc[1]]], depth, fill })
  }

  if (tris.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"></svg>\n'
  }

  tris.sort((p, q) => p.depth - q.depth)

  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (const tri of tris) {
    for (const [u, v] of tri.pts) {
      if (u < minU) minU = u
      if (u > maxU) maxU = u
      if (v < minV) minV = v
      if (v > maxV) maxV = v
    }
  }
  const pad = Math.max(maxU - minU, maxV - minV) * 0.06 || 1
  const width = maxU - minU + pad * 2
  const height = maxV - minV + pad * 2
  const vb = `${minU - pad} ${minV - pad} ${width} ${height}`

  const polys: string[] = []
  for (const tri of tris) {
    const pts = tri.pts.map(([u, v]) => u.toFixed(4) + ',' + v.toFixed(4)).join(' ')
    polys.push(`  <polygon points="${pts}" fill="${tri.fill}" stroke="rgba(30,30,35,0.55)" stroke-width="0.35"/>`)
  }

  // 以固定像素尺寸展示（viewBox 仍用米制坐标，内容按比例缩放，无变形）。
  const PIX = 480
  const scale = PIX / Math.max(width, height)
  const displayW = width * scale
  const displayH = height * scale
  const bg = `<rect x="${(minU - pad).toFixed(4)}" y="${(minV - pad).toFixed(4)}" width="${width.toFixed(4)}" height="${height.toFixed(4)}" fill="#f2f2f4"/>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${displayW.toFixed(0)}" height="${displayH.toFixed(0)}" viewBox="${vb}">\n` +
    bg +
    '\n' +
    polys.join('\n') +
    '\n</svg>\n'
  )
}

const VIEW_ORDER: ViewName[] = ['iso', 'front', 'side', 'top', 'back']

/* ------------------------------- 主流程 ------------------------------- */

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
  const input = loadInput(inputPath)
  const name = args.name ?? input.name ?? path.basename(inputPath, '.json')

  const mesh = buildMesh(input, args.points)
  const meshBytes = Buffer.from(prettyJson(mesh))
  const meshSha256 = sha256(meshBytes)

  const outDir = path.resolve(args.outDir ?? path.dirname(inputPath))
  const base = path.join(outDir, name)
  const meshPath = `${base}.mesh.json`
  const structurePath = `${base}.structure.json`
  const gilPath = `${base}.gil`
  const giaPath = `${base}.gia`
  const summaryPath = `${base}.summary.json`

  // 1) 形状证据：mesh.json 与（可选）五视角 SVG —— 始终写出。
  writeNew(meshPath, meshBytes, args.force)

  const viewPaths: string[] = []
  if (args.views) {
    for (const view of VIEW_ORDER) {
      const svg = renderViewSvg(mesh.vertices, mesh.faces, mesh.colors, view)
      const vp = path.join(outDir, `view-${view}.svg`)
      writeNew(vp, svg, args.force)
      viewPaths.push(vp)
    }
  }

  // 2) 面板化 → 单元数；门禁默认开启（--no-gate 跳过）。
  const { items, stats } = panelizeMesh(mesh)
  const requested = args.budget
  const used = stats.budget.used
  const exceeded = requested !== null && used > requested

  const gateRan = !args.noGate
  const gate: MeshVerifyResult | null = gateRan
    ? verifyMeshExport([mesh], [used], requested)
    : null

  const meshModel = {
    faces: stats.faces,
    quads: stats.quads,
    tris: stats.tris,
    degenerate: stats.degenerate,
    units: used
  }

  // 门禁失败：拒绝产出 .structure/.gil/.gia，但仍写 .summary.json（诊断）+ 上报中文错误。
  if (gate && !gate.ok) {
    const summary = buildSummary({
      schemaVersion: 1,
      kind: 'genshin-model-studio.contour-model.summary',
      input: { file: inputPath, sha256: inputSha256 },
      name,
      mesh: meshModel,
      meshPath,
      meshSha256,
      viewPaths,
      budget: { requested, used, exceeded },
      gate: {
        invoked: true,
        state: 'failed',
        ok: gate.ok,
        checkedFaces: gate.checkedFaces,
        failures: gate.failures,
        checks: gate.checks
      },
      output: { structure: null, gil: null, gia: null, summary: summaryPath },
      force: args.force
    })
    // 已在 buildSummary 内写出 summary；这里只抛出。
    throw new Error(`[gate] 轮廓网格验证未通过（已拒绝导出 .structure/.gil/.gia）:\n${gate.failures.map((f) => `  - ${f}`).join('\n')}`)
  }

  // 3) 导出（走 export-mesh 同源路径）。
  const structure = resolveStructure({
    name,
    template: '空模型',
    items: items.map(toStructureItem)
  })
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

  const summaryGate: SummaryGate = gateRan
    ? {
        invoked: true,
        state: 'passed',
        ok: gate!.ok,
        checkedFaces: gate!.checkedFaces,
        failures: gate!.failures,
        checks: gate!.checks
      }
    : { invoked: false, state: 'skipped', reason: 'SKIPPED_GATE' }

  const summary = buildSummary({
    schemaVersion: 1,
    kind: 'genshin-model-studio.contour-model.summary',
    input: { file: inputPath, sha256: inputSha256 },
    name,
    mesh: meshModel,
    meshPath,
    meshSha256,
    viewPaths,
    budget: { requested, used, exceeded },
    gate: summaryGate,
    output: {
      structure: structurePath,
      gil: args.format === 'gia' ? null : gilPath,
      gia: args.format === 'gil' ? null : giaPath,
      summary: summaryPath
    },
    force: args.force
  })

  if (args.summaryFormat === 'json') {
    process.stdout.write(prettyJson(summary))
  } else {
    console.log(`model=${name}`)
    console.log(`mesh=${meshPath} (${meshBytes.length} bytes) sha256=${meshSha256}`)
    console.log(`mesh=${JSON.stringify(meshModel)}`)
    console.log(`budget=${JSON.stringify(summary.budget)}`)
    console.log(`gate=${summaryGate.state}`)
    if (summaryGate.state === 'passed') console.log(`gateChecks=${JSON.stringify((summaryGate as { checks: MeshVerifyResult['checks'] }).checks)}`)
    const out = summary.output as Record<string, string | null>
    for (const key of ['gil', 'gia'] as const) {
      if (out[key]) {
        const size = (key === 'gil' ? gilCandidate : giaCandidate)?.length ?? 0
        console.log(`${key}=${out[key]} (${size} bytes)`)
      }
    }
    if (out.structure) console.log(`structure=${out.structure}`)
    console.log(`summary=${summaryPath}`)
    if (viewPaths.length) console.log(`views=${viewPaths.join(',')}`)
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

type SummaryGate = {
  invoked: boolean
  state: 'passed' | 'failed' | 'skipped'
  ok?: boolean
  checkedFaces?: number
  failures?: string[]
  checks?: MeshVerifyResult['checks']
  reason?: string
}

function buildSummary(args: {
  schemaVersion: 1
  kind: string
  input: { file: string; sha256: string }
  name: string
  mesh: { faces: number; quads: number; tris: number; degenerate: number; units: number }
  meshPath: string
  meshSha256: string
  viewPaths: string[]
  budget: { requested: number | null; used: number; exceeded: boolean }
  gate: SummaryGate
  output: { structure: string | null; gil: string | null; gia: string | null; summary: string }
  force: boolean
}): Record<string, unknown> {
  const summary = {
    schemaVersion: 1,
    kind: args.kind,
    tool: { name: 'genshin-model-studio', version: VERSION },
    input: args.input,
    model: { name: args.name, mesh: args.mesh },
    output: {
      mesh: args.meshPath,
      meshSha256: args.meshSha256,
      ...(args.output.structure ? { structure: args.output.structure } : {}),
      ...(args.output.gil ? { gil: args.output.gil } : {}),
      ...(args.output.gia ? { gia: args.output.gia } : {}),
      ...(args.viewPaths.length ? { views: args.viewPaths } : {}),
      summary: args.output.summary
    },
    budget: args.budget,
    gate: args.gate
  }
  writeNew(args.output.summary, prettyJson(summary), args.force)
  return summary
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}
