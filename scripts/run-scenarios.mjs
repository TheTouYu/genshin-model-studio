#!/usr/bin/env node
/**
 * run-scenarios.mjs — 场景验证集运行器（npm script `run-scenarios`）。
 *
 * 用法：`node scripts/run-scenarios.mjs [--scenarios <path.json>] [--out-dir <dir>]`
 *
 * 读取 benchmark/scenarios/scenarios.json（或 --scenarios 指定），对每个 status='auto'
 * 的例执行对应 CLI（contour-model / export-mesh），收集
 * {status: pass|fail, metrics:{units, gate, qa, bytes, sha256}}，断言不满足 → fail + 原因；
 * manual/pending 如实标注。结果写 delivery/scenario-results/results.json + results.md。
 *
 * 确定性：相同 manifest + 相同 outDir ⇒ 相同结果（CLI 无时间戳/随机数；summary.json 在固定
 * outDir 下绝对路径确定），两次运行 sha256 一致。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runScenariosFromFile, formatScenarioMarkdown } from '../dist/src/qa/scenarios.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_MANIFEST = path.join(repoRoot, 'benchmark', 'scenarios', 'scenarios.json')
const DEFAULT_OUT = path.join(repoRoot, 'delivery', 'scenario-results')

function parseArgs(argv) {
  const args = { scenarios: DEFAULT_MANIFEST, outDir: DEFAULT_OUT, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`[run-scenarios] ${arg} 需要一个值`)
      return v
    }
    if (arg === '--scenarios') args.scenarios = next()
    else if (arg === '--out-dir') args.outDir = next()
    else if (arg === '-h' || arg === '--help') args.help = true
    else throw new Error(`[run-scenarios] 未知选项：${arg}`)
  }
  return args
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2) + '\n'
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(['Usage: node scripts/run-scenarios.mjs [--scenarios <path>] [--out-dir <dir>]', ''].join('\n'))
    return
  }

  const results = runScenariosFromFile(args.scenarios, { outDir: args.outDir })
  fs.mkdirSync(args.outDir, { recursive: true })
  const jsonPath = path.join(args.outDir, 'results.json')
  const mdPath = path.join(args.outDir, 'results.md')
  fs.writeFileSync(jsonPath, prettyJson(results))
  fs.writeFileSync(mdPath, formatScenarioMarkdown(results) + '\n')

  // 控制台摘要。
  const summary = results.map((r) => `${r.id}:${r.status}`).join(' ')
  console.log(`results=${jsonPath}`)
  console.log(`md=${mdPath}`)
  console.log(summary)

  // 任一失败 → 非零退出码（供 CI 判断），但产物保留。
  if (results.some((r) => r.status === 'fail')) process.exitCode = 1
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
