#!/usr/bin/env node
/**
 * quality-plan.mjs — 缺陷分层分类器 CLI（npm script `quality-plan`）。
 *
 * 用法：`node scripts/quality-plan.mjs --artifact <dir|file> --id <id> [--id <id2>…]
 *        [--map source=dimension…]`
 *
 * 输入：
 *   --artifact <dir|file>   导出目录（含 .summary.json/.qa.json/.mesh.json…）或单个
 *                           qa.json / summary.json（gate 诊断）/ mesh.json。
 *   --id <id>               输出/计划 id（可重复：对每个 id 生成一份计划文件）。
 *   --map key=dimension     人工覆盖分类（如 gate.skinny=L3、mesh.colorBands=L4）。
 *
 * 输出：
 *   <id>.quality-plan.json  机器可读计划（dimensions / repairQueue / sedimentation）。
 *   追加 .scratch/mesh-system/log/evolution-log.md（日期/来源/维度/建议规则/校验和）。
 *
 * 确定性：相同 artifact + 相同 opts ⇒ 相同计划（无时间戳、无随机数）。
 * evolution-log 条目含日期是产品要求；计划 JSON 本身不含时间戳。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildQualityPlan, formatEvolutionLogEntry } from '../dist/src/qa/quality-plan.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOG_PATH = path.join(repoRoot, '.scratch', 'mesh-system', 'log', 'evolution-log.md')

function usage() {
  return [
    'Usage: node scripts/quality-plan.mjs --artifact <dir|file> --id <id> [options]',
    '',
    'Classify a failed export artifact into defect dimensions (L1 比例/L2 结构/L3 拓扑/L4 材质),',
    'produce a dependency-aware repair queue, and sediment suggested rules into the evolution log.',
    '',
    'Options:',
    '  --artifact <dir|file>   export directory or single qa.json / summary.json / mesh.json',
    '  --id <id>               output id (repeatable -> one plan per id)',
    '  --map key=dimension     manual classification override (repeatable)',
    '  -h, --help              show this help',
    ''
  ].join('\n')
}

function parseArgs(argv) {
  const args = { artifact: undefined, ids: [], map: {}, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`[quality-plan] ${arg} 需要一个值`)
      return v
    }
    if (arg === '--artifact') args.artifact = next()
    else if (arg === '--id') args.ids.push(next())
    else if (arg === '--map') {
      const kv = next()
      const eq = kv.indexOf('=')
      if (eq < 1) throw new Error(`[quality-plan] --map 期望 key=dimension（得到 ${kv}）`)
      const key = kv.slice(0, eq)
      const dim = kv.slice(eq + 1)
      if (!['L1', 'L2', 'L3', 'L4'].includes(dim)) {
        throw new Error(`[quality-plan] --map 维度必须是 L1|L2|L3|L4（得到 ${dim}）`)
      }
      args.map[key] = dim
    } else if (arg === '-h' || arg === '--help') args.help = true
    else throw new Error(`[quality-plan] 未知选项：${arg}`)
  }
  return args
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2) + '\n'
}

function localDate() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (!args.artifact) throw new Error('[quality-plan] 缺少 --artifact（见 --help）')
  const ids = args.ids.length ? args.ids : [path.basename(args.artifact)]

  const plan = buildQualityPlan(args.artifact, { id: ids[0], map: args.map })
  const date = localDate()

  for (const id of ids) {
    const outPath = path.join(process.cwd(), `${id}.quality-plan.json`)
    fs.writeFileSync(outPath, prettyJson(plan))
    console.log(`plan=${outPath}`)
    console.log(`checksum=${plan.artifact.checksum}`)
    const dims = plan.dimensions
    console.log(`dimensions=L1:${dims.L1.count} L2:${dims.L2.count} L3:${dims.L3.count} L4:${dims.L4.count} unclassified:${dims.unclassified.length}`)
    console.log(`repairQueue=${plan.repairQueue.length}`)
    console.log(`suggestedRules=${plan.sedimentation.suggestedRules.length}`)
  }

  // 追加沉淀记录（每个 id 一条，含日期与溯源，保证可回溯）。
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
  let existing = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf8') : ''
  if (existing && !existing.endsWith('\n\n')) existing = existing.endsWith('\n') ? existing + '\n' : existing + '\n\n'
  const entry = ids.map((id) => formatEvolutionLogEntry(id, plan, date)).join('')
  fs.appendFileSync(LOG_PATH, entry)
  console.log(`log=${LOG_PATH}`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
