#!/usr/bin/env node
/**
 * gen-model CLI：`gen-model <input.json> [--out-dir <dir>] [--force] [--format text|json]`
 *
 * 输出（同目录或 --out-dir，拒绝覆盖已有文件，--force 除外）：
 *   <name>.gil              .gil 候选（最小新地图骨架 + 静态元件闭包）
 *   <name>.structure.json   规范化后的 structure.json 超集（可回灌、可读）
 *   <name>.summary.json     摘要（ID 计划、字节数、SHA-256、回读状态）
 *
 * 附加：`gen-model --list-resources` 打印官方基础元件速查表。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

import { encodeStructure, TOUCHED_TOP_LEVEL_FIELDS } from '../core/encoder.js'
import { closureSummary, readBackAssemblies } from '../core/readback.js'
import { loadStructureFile, resolveStructure } from '../core/structure.js'
import { canonicalResourceRows } from '../core/resource-meta.js'

const VERSION = '0.1.0'

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function usage(): string {
  return [
    'Usage: gen-model <input.json> [options]',
    '',
    'Generate a .gil candidate (static assembly closure) from a structure.json superset.',
    '',
    'Options:',
    '  --out-dir <dir>    output directory (default: same directory as the input)',
    '  --force            overwrite existing output files',
    '  --format <fmt>     summary output: text (default) or json',
    '  --list-resources   print the official base resource quick table and exit',
    '  -h, --help         display this help'
  ].join('\n')
}

function resourceSemantics(row: ReturnType<typeof canonicalResourceRows>[number]): string {
  if (row.status === '未校准') {
    return row.scaleSemantics === '—'
      ? '未校准（一期仅登记，可编码不保证视觉语义）'
      : `${row.scaleSemantics}；未校准`
  }
  return `${row.scaleSemantics}（${row.status}）`
}

function listResources(): void {
  console.log('官方基础元件速查表（详细语义见 docs/input-format.md §资源速查表）')
  console.log('')
  for (const row of canonicalResourceRows()) {
    console.log(`  ${row.resourceId}  ${row.name}  ${resourceSemantics(row)}`)
  }
}

function parseArgs(argv: string[]): {
  input?: string
  outDir?: string
  force: boolean
  format: 'text' | 'json'
  help: boolean
  listResources: boolean
} {
  const result = {
    input: undefined as string | undefined,
    outDir: undefined as string | undefined,
    force: false,
    format: 'text' as 'text' | 'json',
    help: false,
    listResources: false
  }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    const next = (): string => {
      const value = argv[++index]
      if (value === undefined) throw new Error(`[error] ${arg} requires a value`)
      return value
    }
    if (arg === '--out-dir') result.outDir = next()
    else if (arg === '--force') result.force = true
    else if (arg === '--format') {
      const value = next()
      if (value !== 'text' && value !== 'json') {
        throw new Error(`[error] --format must be text or json (got ${value})`)
      }
      result.format = value
    } else if (arg === '--list-resources') result.listResources = true
    else if (arg === '-h' || arg === '--help') result.help = true
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

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (args.listResources) {
    listResources()
    return
  }
  if (!args.input) throw new Error('[error] missing <input.json> (see --help)')

  const inputPath = path.resolve(args.input)
  const inputBytes = fs.readFileSync(inputPath)
  const inputSha256 = sha256(inputBytes)
  const structure = loadStructureFile(inputPath)

  // 编码 → 候选。
  const candidate = encodeStructure(structure)

  // 编码后自检：回读候选，断言与输入一致。
  const assemblies = readBackAssemblies(candidate)
  if (assemblies.length !== 1) {
    throw new Error(`[error] readback expected 1 assembly, found ${assemblies.length}`)
  }
  const assembly = assemblies[0]
  const closure = closureSummary(candidate)
  if (!closure.complete) {
    throw new Error(`[error] candidate closure incomplete: ${JSON.stringify(closure)}`)
  }
  if (assembly.name !== structure.name || assembly.prefabId !== structure.prefabId) {
    throw new Error('[error] readback name/prefabId mismatch')
  }
  if (assembly.items.length !== structure.items.length) {
    throw new Error('[error] readback item count mismatch')
  }
  for (const [index, item] of structure.items.entries()) {
    const read = assembly.items[index]
    if (read.resourceId !== item.resourceId) {
      throw new Error(`[error] readback items[${index}].resourceId mismatch`)
    }
  }

  const outDir = path.resolve(args.outDir ?? path.dirname(inputPath))
  const base = path.join(outDir, structure.name)
  const gilPath = `${base}.gil`
  const structurePath = `${base}.structure.json`
  const summaryPath = `${base}.summary.json`
  writeNew(gilPath, candidate, args.force)
  writeNew(structurePath, prettyJson(structure), args.force)

  const summary = {
    schemaVersion: 1,
    kind: 'genshin-model-studio.gen-model.summary',
    tool: { name: 'genshin-model-studio', version: VERSION },
    input: { file: inputPath, sha256: inputSha256 },
    model: {
      name: structure.name,
      template: structure.template,
      templatePrefabId: structure.templatePrefabId,
      prefabId: structure.prefabId,
      definitionAuxiliaryIds: [...structure.definitionAuxiliaryIds],
      instanceAuxiliaryIds: [...structure.instanceAuxiliaryIds],
      itemCount: structure.items.length,
      resources: structure.items.map((item) => item.resourceId),
      transform: {
        position: [...structure.position],
        rotation: [...structure.rotation],
        scale: [...structure.scale]
      }
    },
    output: {
      gil: gilPath,
      gilSize: candidate.length,
      gilSha256: sha256(candidate),
      structure: structurePath,
      summary: summaryPath
    },
    closure: {
      touchedTopLevelFields: [...TOUCHED_TOP_LEVEL_FIELDS],
      definitions: closure.definitions,
      instances: closure.instances,
      definitionAuxiliaries: closure.definitionAuxiliaries,
      instanceAuxiliaries: closure.instanceAuxiliaries,
      ownerRegistryIds: closure.ownerRegistryIds
    },
    readback: {
      name: assembly.name,
      prefabId: assembly.prefabId,
      templateResourceId: assembly.templateResourceId,
      itemCount: assembly.items.length
    },
    evidenceBoundary: {
      structuralInspection: true,
      templateCompatibility: 'not-proven',
      editorOrGameValidation: 'not-performed',
      writeback: 'not-performed'
    }
  }
  writeNew(summaryPath, prettyJson(summary), args.force)

  if (args.format === 'json') {
    process.stdout.write(prettyJson(summary))
  } else {
    console.log(`model=${structure.name}`)
    console.log(`template=${structure.template} (${structure.templatePrefabId})`)
    console.log(`prefabId=${structure.prefabId}`)
    console.log(
      `definitionAuxiliaryIds=${structure.definitionAuxiliaryIds.join(',')}`
    )
    console.log(`instanceAuxiliaryIds=${structure.instanceAuxiliaryIds.join(',')}`)
    console.log(`items=${structure.items.length}`)
    console.log(`resources=${structure.items.map((item) => item.resourceId).join(',')}`)
    console.log(`candidate=${gilPath} (${candidate.length} bytes) sha256=${sha256(candidate)}`)
    console.log(`structure=${structurePath}`)
    console.log(`summary=${summaryPath}`)
    console.log(
      `readback=ok (assembly=${assembly.name}, items=${assembly.items.length}, ` +
        `closure=${closure.complete ? 'complete' : 'incomplete'})`
    )
    console.log('compatibility=not-proven; editorOrGameValidation=not-performed; writeback=not-performed')
  }
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}
