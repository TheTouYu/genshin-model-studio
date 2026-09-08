#!/usr/bin/env node
/**
 * export-qa CLI：对一个导出目录（含 .structure.json/.summary.json/.gil/.gia）做「导出后」QA 审计。
 *
 * 用法：
 *   export-qa <导出目录或导出文件> [--out-dir <dir>] [--name <base>] [--json]
 *
 * 行为：
 *   - 读取导出产物，逐项审计（ID 规则 / 资源覆盖 / 单元预算 / 可回读 / 产物）。
 *   - 写出 <base>.qa.json（机器可读）+ <base>.qa.md（人读，无时间戳）。
 *   - 任一检查 FAIL ⇒ ok=false、进程退出码 1（产物保留，不删除）。
 *   - `--json`：把 QA 结果以 JSON 追加写到 stdout（否则打人读摘要）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { auditExport, formatQaMarkdown } from '../dist/src/qa/export-qa.js'

function usage() {
  return [
    'Usage: export-qa <export-dir|export-file> [options]',
    '',
    'Post-export QA audit for a mesh export (structure/summary/gil/gia).',
    '',
    'Options:',
    '  --out-dir <dir>    output directory for <base>.qa.json/.qa.md (default: input dir)',
    '  --name <base>      output base name (default: auto-discovered from export set)',
    '  --json             also print the QA result as JSON to stdout',
    '  -h, --help         display this help'
  ].join('\n')
}

function parseArgs(argv) {
  const result = { input: undefined, outDir: undefined, name: undefined, json: false, help: false }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (value === undefined) throw new Error(`[error] ${arg} requires a value`)
      return value
    }
    if (arg === '--out-dir') result.outDir = next()
    else if (arg === '--name') result.name = next()
    else if (arg === '--json') result.json = true
    else if (arg === '-h' || arg === '--help') result.help = true
    else if (arg.startsWith('-')) throw new Error(`[error] unknown option: ${arg}`)
    else if (result.input !== undefined) throw new Error(`[error] unexpected argument: ${arg}`)
    else result.input = arg
  }
  return result
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage() + '\n')
    return
  }
  if (!args.input) throw new Error('[error] missing <export-dir|export-file> (see --help)')

  const result = auditExport(path.resolve(args.input), { name: args.name })
  const outDir = path.resolve(args.outDir ?? result.dir)
  fs.mkdirSync(outDir, { recursive: true })
  const base = args.name ?? result.base
  const qaJsonPath = path.join(outDir, `${base}.qa.json`)
  const qaMdPath = path.join(outDir, `${base}.qa.md`)
  fs.writeFileSync(qaJsonPath, JSON.stringify(result, null, 2) + '\n')
  fs.writeFileSync(qaMdPath, formatQaMarkdown(result) + '\n')

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } else {
    process.stdout.write(`model=${result.base}\n`)
    process.stdout.write(`qa=${result.ok ? 'ok' : 'failed'}\n`)
    process.stdout.write(`id=${result.checks.id.pass ? 'pass' : 'fail'}\n`)
    process.stdout.write(`resources=${result.checks.resources.pass ? 'pass' : 'fail'}${
      result.checks.resources.uncalibrated.length ? ` (${result.checks.resources.uncalibrated.length} uncalibrated)` : ''
    }\n`)
    process.stdout.write(`budget=${result.checks.budget.pass ? 'pass' : 'fail'}\n`)
    process.stdout.write(`readback=${result.checks.readback.pass === true ? 'pass' : result.checks.readback.pass === 'uncovered' ? 'uncovered' : 'fail'}\n`)
    process.stdout.write(`artifacts=${result.checks.artifacts.pass ? 'pass' : 'fail'}\n`)
    process.stdout.write(`qa.json=${qaJsonPath}\n`)
    process.stdout.write(`qa.md=${qaMdPath}\n`)
  }

  if (!result.ok) {
    process.stderr.write(`[qa] 导出 QA 未通过（产物已保留）：\n${result.failures.map((f) => `  - ${f}`).join('\n')}\n`)
    process.exitCode = 1
  }
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}
