/**
 * benchmark runner CLI —— A/B 基准测试的运行记录与离线重算入口。
 *
 * 用法（npm run benchmark -- <cmd>）：
 *   freeze             冻结任务文件（prompt.txt / spec.md / validator.ts）并记录 sha256
 *   check              校验冻结 hash 与当前文件一致（不一致 = 任务文件被改动）
 *   score-round --round N --a-version vX --b-version vY [--rescore]
 *                      读取 runs/roundN/ 存档 → 校验提示词 hash → 按版本管线处理 →
 *                      确定性校验打分 → 写 scores.json 并更新 results.json（趋势表）
 *                      --rescore：按 results.json 中已记录的轮次全量重算（勘误流程用）
 *   report             打印 results.json 趋势表
 *
 * 客观性规则：提示词 hash 与冻结值不一致 → 该轮视为运行失败，拒绝写结果；
 * 校验器纯确定性、模型不可见；原始输出全存档（runs/roundN/*.json），可离线重算。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { TASKS, TASK_ORDER } from './tasks.js'
import { requireVersion } from './versions.js'
import { parseStructureOutput } from './parse.js'
import { repairStructure, repairStructureLight } from './repair.js'
import type { ResolvedStructure, StructureItem } from '../core/structure.js'
import type { RunArchive, RunScore, RoundSummary } from './types.js'

function findRoot(dir: string): string {
  return existsSync(join(dir, 'package.json')) ? dir : findRoot(dirname(dir))
}
const ROOT = findRoot(dirname(fileURLToPath(import.meta.url)))
const RUNS = join(ROOT, 'benchmark', 'runs')
const RESULTS_FILE = join(ROOT, 'benchmark', 'results.json')
const HASHES_FILE = join(ROOT, 'benchmark', 'tasks', 'hashes.json')

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')
const taskPath = (taskId: string, name: string): string => join(ROOT, 'benchmark', 'tasks', taskId, name)
const readText = (p: string): string => readFileSync(p, 'utf8')

type Hashes = {
  version: number
  frozenAt: string
  errata: { at: string; taskId: string; field: string; oldHash: string; newHash: string; reason: string }[]
  tasks: Record<string, { prompt: string; spec: string; validator: string }>
}

function loadHashes(): Hashes {
  return JSON.parse(readText(HASHES_FILE)) as Hashes
}

function freeze(): void {
  const now = new Date().toISOString()
  const prev = existsSync(HASHES_FILE) ? (loadHashes() as Hashes) : null
  const tasks: Hashes['tasks'] = {}
  for (const id of TASK_ORDER) {
    tasks[id] = {
      prompt: sha256(readText(taskPath(id, 'prompt.txt'))),
      spec: sha256(readText(taskPath(id, 'spec.md'))),
      validator: sha256(readText(taskPath(id, 'validator.ts')))
    }
  }
  const errata: Hashes['errata'] = prev?.errata ?? []
  if (prev) {
    for (const id of TASK_ORDER) {
      for (const field of ['prompt', 'spec', 'validator'] as const) {
        const oldHash = prev.tasks[id]?.[field]
        if (oldHash && oldHash !== tasks[id][field]) {
          errata.push({ at: now, taskId: id, field, oldHash, newHash: tasks[id][field], reason: '勘误（任务文件变更，须全量重算历史轮次）' })
        }
      }
    }
  }
  writeFileSync(HASHES_FILE, JSON.stringify({ version: 1, frozenAt: now, errata, tasks }, null, 2) + '\n')
  console.log(`freeze: ${TASK_ORDER.length} 个任务已记录 hash（${now}）`)
}

function check(): boolean {
  const hashes = loadHashes()
  let ok = true
  for (const id of TASK_ORDER) {
    for (const field of ['prompt', 'spec', 'validator'] as const) {
      const h = sha256(readText(taskPath(id, field === 'prompt' ? 'prompt.txt' : field === 'spec' ? 'spec.md' : 'validator.ts')))
      if (h !== hashes.tasks[id]?.[field]) {
        console.error(`check FAIL: ${id}.${field} 与冻结 hash 不一致`)
        ok = false
      }
    }
  }
  console.log(ok ? `check OK: ${TASK_ORDER.length} 个任务文件与冻结 hash 一致` : `check FAIL: 任务文件被改动（须走勘误流程）`)
  return ok
}

/** 对单次存档打分：解析（组件脚本交付走 itemsPath）→ 版本管线 → 校验器。返回 RunScore。 */
function scoreArchive(archive: RunArchive, versionId: string): RunScore {
  const rawFile = join(RUNS, `round${archive.round}`, `${archive.side}-${archive.taskId}-r${archive.rep}.json`)
  let structure: ResolvedStructure | null = null
  let parseNote = ''
  if (archive.itemsPath !== undefined) {
    // 组件脚本交付：核验管道生成的 items（draw-model 产物，确定性）
    try {
      const items = JSON.parse(readText(join(ROOT, archive.itemsPath))) as StructureItem[]
      structure = {
        schemaVersion: 1,
        name: `run-${archive.side}-${archive.taskId}`,
        template: '空模型',
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        prefabId: 1077936129,
        definitionAuxiliaryIds: [],
        instanceAuxiliaryIds: [],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        items
      }
    } catch (error) {
      parseNote = `items 产物缺失或非法（${archive.itemsPath}）：${(error as Error).message}`
    }
  } else {
    const parsed = parseStructureOutput(archive.raw)
    if (parsed.ok) structure = parsed.structure
    else parseNote = parsed.reason
  }

  const validator = TASKS[archive.taskId].validate
  const rawResult = structure !== null ? validator(structure) : {
    taskId: archive.taskId,
    parseOk: false,
    score: 0,
    breakdown: {},
    violations: [parseNote]
  }

  if (structure === null) {
    return {
      round: archive.round,
      side: archive.side,
      taskId: archive.taskId,
      rep: archive.rep,
      version: versionId,
      promptSha256: archive.promptSha256,
      rawFile,
      result: rawResult,
      rawScore: 0,
      fixes: [],
      unresolved: []
    }
  }

  const version = requireVersion(versionId)
  if (version.pipeline === 'repair') {
    // 复杂自由结构（结构性悬空合法）用 light 模式，避免支撑修复误伤环/吊舱等
    const mode = TASKS[archive.taskId].repairMode ?? 'full'
    const repaired = mode === 'light' ? repairStructureLight(structure.items) : repairStructure(structure.items)
    const result = validator({ ...structure, items: repaired.structure })
    return {
      round: archive.round,
      side: archive.side,
      taskId: archive.taskId,
      rep: archive.rep,
      version: versionId,
      promptSha256: archive.promptSha256,
      rawFile,
      result,
      rawScore: rawResult.score,
      fixes: repaired.fixes,
      unresolved: repaired.unresolved
    }
  }
  return {
    round: archive.round,
    side: archive.side,
    taskId: archive.taskId,
    rep: archive.rep,
    version: versionId,
    promptSha256: archive.promptSha256,
    rawFile,
    result: rawResult,
    rawScore: rawResult.score,
    fixes: [],
    unresolved: []
  }
}

function loadResults(): { rounds: RoundSummary[] } {
  if (!existsSync(RESULTS_FILE)) return { rounds: [] }
  return JSON.parse(readText(RESULTS_FILE)) as { rounds: RoundSummary[] }
}

function saveResults(data: { rounds: RoundSummary[] }): void {
  writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 2) + '\n')
}

function roundDir(round: number): string {
  return join(RUNS, `round${round}`)
}

function archiveFiles(round: number): string[] {
  return readdirSync(roundDir(round)).filter((f) => /^[AB]-T\d+-r\d+\.json$/.test(f)).sort()
}

/** 读取并校验一轮存档（可按任务子集）；提示词 hash 与冻结不一致 → 抛错（运行失败）。 */
function loadRoundArchives(round: number, taskIds: readonly string[]): RunArchive[] {
  const hashes = loadHashes()
  const files = archiveFiles(round)
  const expected = new Set<string>()
  for (const side of ['A', 'B'] as const) {
    for (const id of taskIds) {
      for (let rep = 1; rep <= TASKS[id].repeats; rep++) {
        expected.add(`${side}-${id}-r${rep}.json`)
      }
    }
  }
  const found = new Set(files)
  const missing = [...expected].filter((f) => !found.has(f))
  if (missing.length > 0) {
    throw new Error(`round${round} 存档不完整，缺少：${missing.join(', ')}`)
  }
  return files
    .filter((f) => expected.has(f))
    .map((f) => {
      const archive = JSON.parse(readText(join(roundDir(round), f))) as RunArchive
      const currentHash = sha256(readText(taskPath(archive.taskId, 'prompt.txt')))
      const frozenHash = hashes.tasks[archive.taskId]?.prompt
      if (archive.promptSha256 !== currentHash || (frozenHash !== undefined && archive.promptSha256 !== frozenHash)) {
        throw new Error(
          `round${round} ${f} 提示词 hash 不一致（存档 ${archive.promptSha256.slice(0, 12)} / 当前 ${currentHash.slice(0, 12)} / 冻结 ${frozenHash?.slice(0, 12)}）——运行失败，拒绝写结果`
        )
      }
      return archive
    })
}

function scoreRound(round: number, versionA: string, versionB: string, taskIds: readonly string[] = TASK_ORDER): void {
  const archives = loadRoundArchives(round, taskIds)
  const scores: RunScore[] = []
  for (const arch of archives) {
    const v = arch.side === 'A' ? versionA : versionB
    scores.push(scoreArchive(arch, v))
  }

  const mean = (list: RunScore[]): number => list.reduce((s, r) => s + r.result.score, 0) / list.length
  const meanRaw = (list: RunScore[]): number => list.reduce((s, r) => s + r.rawScore, 0) / list.length

  const tasks: RoundSummary['tasks'] = {}
  const summaryLines: string[] = []
  let allBetter = true
  const failing: string[] = []
  for (const id of taskIds) {
    const aList = scores.filter((s) => s.side === 'A' && s.taskId === id)
    const bList = scores.filter((s) => s.side === 'B' && s.taskId === id)
    const a = mean(aList)
    const b = mean(bList)
    tasks[id] = {
      A: { score: a, reps: aList.map((s) => s.result.score) },
      B: { score: b, reps: bList.map((s) => s.result.score) },
      aRaw: meanRaw(aList),
      bRaw: meanRaw(bList)
    }
    const better = b >= a - 1e-9
    if (!better) {
      allBetter = false
      failing.push(id)
    }
    summaryLines.push(
      `${id}  A=${a.toFixed(4)} (raw ${tasks[id].aRaw.toFixed(4)})  B=${b.toFixed(4)} (raw ${tasks[id].bRaw.toFixed(4)})  ${better ? '✓' : '✗ B<A'}`
    )
  }
  const adoptReason = allBetter
    ? `${taskIds.length}/${taskIds.length} 任务 B≥A，采纳候选版本`
    : `未采纳：${failing.join(', ')} B < A`

  const rounds = loadResults()
  const roundSummary: RoundSummary = { round, versionA, versionB, adopted: allBetter, adoptReason, tasks }
  const idx = rounds.rounds.findIndex((r) => r.round === round)
  if (idx >= 0) rounds.rounds[idx] = roundSummary
  else rounds.rounds.push(roundSummary)
  rounds.rounds.sort((p, q) => p.round - q.round)
  saveResults(rounds)
  writeFileSync(join(roundDir(round), 'scores.json'), JSON.stringify({ round, versionA, versionB, scores }, null, 2) + '\n')

  console.log(`round${round}: A=${versionA} B=${versionB}`)
  for (const line of summaryLines) console.log(`  ${line}`)
  console.log(`  采纳判定：${adoptReason}`)
}

/** 勘误流程：按 results.json 记录的历史版本全量重算所有轮次（论文方法学：修正后全部离线重算）。 */
function rescoreAll(): void {
  const rounds = loadResults()
  if (rounds.rounds.length === 0) {
    console.error('rescore: results.json 中没有已记录轮次')
    process.exit(1)
  }
  for (const r of rounds.rounds) {
    console.log(`rescore round${r.round} (A=${r.versionA} B=${r.versionB})…`)
    scoreRound(r.round, r.versionA, r.versionB, Object.keys(r.tasks))
  }
  console.log('rescore 完成：全部轮次已按当前校验器/管线重算')
}

function report(): void {
  const { rounds } = loadResults()
  if (rounds.length === 0) {
    console.log('results.json 暂无轮次')
    return
  }
  for (const r of rounds) {
    const taskIds = Object.keys(r.tasks)
    const header = `轮次  A版本  B版本  采纳  ` + taskIds.map((t) => `${t}:A→B`).join('  ')
    console.log(header)
    const cells = taskIds.map((t) => {
      const e = r.tasks[t]
      return `${e.A.score.toFixed(2)}→${e.B.score.toFixed(2)}`
    }).join('  ')
    console.log(`r${r.round}   ${r.versionA}    ${r.versionB}    ${r.adopted ? '是' : '否'}   ${cells}`)
    console.log(`    ${r.adoptReason}`)
  }
}

/**
 * 归档命令：把一次模型输出（原始文本文件）写成 runs/roundN/{side}-{taskId}-r{rep}.json，
 * promptSha256 自动取冻结 hash（防止转录错误破坏客观性校验）。
 * 用法：archive --round N --side A --task T1 --rep 1 --version v0 --raw-file <path>
 */
function archive(): void {
  const round = Number(arg('--round'))
  const side = arg('--side')
  const task = arg('--task')
  const rep = Number(arg('--rep') ?? '1')
  const version = arg('--version')
  const rawFile = arg('--raw-file')
  if (!Number.isInteger(round) || (side !== 'A' && side !== 'B') || !TASKS[task ?? ''] || !Number.isInteger(rep) || rep < 1 || !version || !rawFile) {
    console.error('用法：archive --round N --side A|B --task Tn --rep K --version vX --raw-file <path>')
    process.exit(1)
  }
  requireVersion(version)
  const hashes = loadHashes()
  const frozen = hashes.tasks[task as string]?.prompt
  if (!frozen) {
    console.error(`archive: 任务 ${task} 未冻结（先运行 freeze）`)
    process.exit(1)
  }
  const raw = readFileSync(rawFile, 'utf8')
  const archive: RunArchive = {
    round,
    side,
    taskId: task as string,
    rep,
    version,
    protocolFile: requireVersion(version).protocolFile,
    promptFile: TASKS[task as string].promptFile,
    promptSha256: frozen,
    raw
  }
  const dir = roundDir(round)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const out = join(dir, `${side}-${task}-r${rep}.json`)
  writeFileSync(out, JSON.stringify(archive, null, 2) + '\n')
  console.log(`archive: ${out}（promptSha256=${frozen.slice(0, 12)}…）`)
}

const [, , command, ...args] = process.argv
function arg(name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function main(): void {
  if (!existsSync(RUNS)) mkdirSync(RUNS, { recursive: true })
  if (!existsSync(join(ROOT, 'benchmark', 'tasks'))) {
    console.error('benchmark/tasks 目录不存在')
    process.exit(1)
  }
  if (command === 'freeze') {
    freeze()
  } else if (command === 'check') {
    if (!check()) process.exit(1)
  } else if (command === 'archive') {
    archive()
  } else if (command === 'score-round') {
    if (args.includes('--rescore')) {
      rescoreAll()
      return
    }
    const round = Number(arg('--round'))
    const a = arg('--a-version')
    const b = arg('--b-version')
    if (!Number.isInteger(round) || !a || !b) {
      console.error('用法：score-round --round N --a-version vX --b-version vY [--tasks T6[,T7]] [--rescore]')
      process.exit(1)
    }
    requireVersion(a)
    requireVersion(b)
    if (!existsSync(roundDir(round))) {
      console.error(`round${round} 存档目录不存在（${roundDir(round)}）`)
      process.exit(1)
    }
    const taskArg = arg('--tasks')
    const taskIds = taskArg === undefined ? TASK_ORDER : taskArg.split(',').map((t) => t.trim()).filter((t) => t in TASKS)
    if (taskIds.length === 0) {
      console.error(`--tasks 无有效任务（可用：${TASK_ORDER.join(',')}）`)
      process.exit(1)
    }
    scoreRound(round, a, b, taskIds)
  } else if (command === 'report') {
    report()
  } else {
    console.log('用法：freeze | check | score-round --round N --a-version vX --b-version vY [--rescore] | report')
    process.exit(1)
  }
}

main()
