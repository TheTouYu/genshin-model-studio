/**
 * scenarios.ts — 场景验证集：声明 + 断言评估 + 自动运行器（确定性，纯 TS，可单测）。
 *
 * 场景清单声明于 benchmark/scenarios/scenarios.json；每例：
 *   { id, title, route:'mesh'|'classic-stroke', command?, inputs?, assertions,
 *     status:'auto'|'manual'|'pending' }。
 *
 * 运行器：对 status='auto' 的例执行对应 CLI（contour-model / export-mesh），
 * 收集 {status: pass|fail, metrics:{units, gate, qa, bytes, sha256}}；
 * 断言不满足 → status=fail + 原因。manual/pending 如实标注，不与经典 stroke 路径冲突、
 * 不重复实现浏览器链路。
 *
 * 确定性契约：相同 manifest + 相同 outDir ⇒ 相同结果（CLI 无时间戳/随机数；
 * summary.json 绝对路径在固定 outDir 下确定），两次运行 sha256 一致。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

export type ScenarioRoute = 'mesh' | 'classic-stroke'
export type ScenarioStatus = 'auto' | 'manual' | 'pending'
export type ScenarioAssertions = {
  /** 单元数允许区间 [min,max]。 */
  unitsRange?: [number, number]
  /** 'pass'：gate.state=passed；'allow-skip'：passed 或 skipped（手动/无 gate 允许）。 */
  gate?: 'pass' | 'allow-skip'
  /** 'ok'：qa.ok=true。 */
  qa?: 'ok'
}

export type Scenario = {
  id: string
  title: string
  route: ScenarioRoute
  /** command 为 argv 数组；占位符 {input}/{name}/{outDir}/{inputDir} 由运行器替换。 */
  command?: string[]
  inputs?: string[]
  assertions: ScenarioAssertions
  status: ScenarioStatus
}

export type ScenarioMetrics = { units: number | null; gate: string | null; qa: string | null; bytes: number | null; sha256: string | null }

export type ScenarioResult = {
  id: string
  title: string
  route: ScenarioRoute
  status: 'pass' | 'fail' | 'manual' | 'pending'
  metrics: ScenarioMetrics | null
  assertions: ScenarioAssertions
  assertFailures: string[]
  reason?: string
}

export type RunScenariosOptions = {
  /** 每个 auto 例的独立输出目录根（缺省 repoRoot()/delivery/scenario-results）。 */
  outDir?: string
  /** 解析 inputs 与 CLI 相对路径的基准目录（缺省 repoRoot()）。 */
  baseDir?: string
}

/* ------------------------------ 解析清单 ------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function assertString(v: unknown, label: string): string {
  if (typeof v !== 'string' || !v) throw new Error(`[scenarios] ${label} 缺失或非字符串`)
  return v
}

/** 校验并规范化一份场景清单（出错抛中文可读错误）。 */
export function parseScenarios(json: unknown): Scenario[] {
  if (!isRecord(json)) throw new Error('[scenarios] 清单必须是 JSON 对象')
  const arr = json.scenarios
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('[scenarios] scenarios 必须是非空数组')
  const seen = new Set<string>()
  return arr.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`[scenarios] scenarios[${index}] 必须是对象`)
    const id = assertString(raw.id, `scenarios[${index}].id`)
    if (seen.has(id)) throw new Error(`[scenarios] id 重复：${id}`)
    seen.add(id)
    const title = assertString(raw.title, `scenarios[${index}].title`)
    const route = raw.route as ScenarioRoute
    if (route !== 'mesh' && route !== 'classic-stroke') {
      throw new Error(`[scenarios] scenarios[${index}].route 必须是 mesh|classic-stroke`)
    }
    const status = (raw.status as ScenarioStatus) ?? 'pending'
    if (status !== 'auto' && status !== 'manual' && status !== 'pending') {
      throw new Error(`[scenarios] scenarios[${index}].status 必须是 auto|manual|pending`)
    }
    const assertions = (raw.assertions ?? {}) as Record<string, unknown>
    const unitsRange = assertions.unitsRange
    if (unitsRange !== undefined && (!Array.isArray(unitsRange) || unitsRange.length !== 2)) {
      throw new Error(`[scenarios] scenarios[${index}].assertions.unitsRange 必须是 [min,max]`)
    }
    const gate = assertions.gate
    if (gate !== undefined && gate !== 'pass' && gate !== 'allow-skip') {
      throw new Error(`[scenarios] scenarios[${index}].assertions.gate 必须是 pass|allow-skip`)
    }
    const qa = assertions.qa
    if (qa !== undefined && qa !== 'ok') {
      throw new Error(`[scenarios] scenarios[${index}].assertions.qa 必须是 ok`)
    }
    if (status === 'auto' && !Array.isArray(raw.command)) {
      throw new Error(`[scenarios] scenarios[${index}].status=auto 必须提供 command（argv 数组）`)
    }
    const inputs = Array.isArray(raw.inputs) ? (raw.inputs as string[]) : undefined
    return {
      id,
      title,
      route,
      command: Array.isArray(raw.command) ? (raw.command as string[]) : undefined,
      inputs,
      assertions: {
        ...(unitsRange !== undefined ? { unitsRange: unitsRange as [number, number] } : {}),
        ...(gate !== undefined ? { gate: gate as 'pass' | 'allow-skip' } : {}),
        ...(qa !== undefined ? { qa: qa as 'ok' } : {})
      },
      status
    }
  })
}

function loadScenariosFile(manifestPath: string): Scenario[] {
  const abs = path.resolve(manifestPath)
  if (!fs.existsSync(abs)) throw new Error(`[scenarios] 清单不存在：${abs}`)
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(abs, 'utf8'))
  } catch (error) {
    const detail = error instanceof SyntaxError ? 'invalid JSON' : `cannot be read: ${String(error)}`
    throw new Error(`[scenarios] 清单读取失败：${abs}（${detail}）`)
  }
  return parseScenarios(parsed)
}

/* ------------------------------ 子路径/哈希 ------------------------------ */

function sha256(data: Uint8Array | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)
  return createHash('sha256').update(buf).digest('hex')
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' ? v : null
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/* ------------------------------ 单例运行 ------------------------------ */

function evalAssertions(scenario: Scenario, metrics: ScenarioMetrics): string[] {
  const failures: string[] = []
  const a = scenario.assertions
  if (a.unitsRange) {
    const [lo, hi] = a.unitsRange
    const u = metrics.units
    if (u === null) failures.push(`units 缺失，无法按 [${lo},${hi}] 断言`)
    else if (u < lo || u > hi) failures.push(`units=${u} 不在 [${lo},${hi}]`)
  }
  if (a.gate) {
    const g = metrics.gate
    if (g === null) failures.push('gate.state 缺失，无法断言')
    else if (a.gate === 'pass' && g !== 'passed') failures.push(`gate=${g}，期望 passed`)
    else if (a.gate === 'allow-skip' && g !== 'passed' && g !== 'skipped') failures.push(`gate=${g}，期望 passed|skipped`)
  }
  if (a.qa) {
    const q = metrics.qa
    if (q === null) failures.push('qa 缺失（未生成 .qa.json），无法断言 ok')
    else if (a.qa === 'ok' && q !== 'ok') failures.push(`qa=${q}，期望 ok`)
  }
  return failures
}

/** 运行单个 auto 场景；返回结果。 */
export function runScenario(scenario: Scenario, opts: RunScenariosOptions = {}): ScenarioResult {
  const base = opts.baseDir ?? repoRoot()
  const outRoot = opts.outDir ?? path.join(repoRoot(), 'delivery', 'scenario-results')

  const baseResult: ScenarioResult = {
    id: scenario.id,
    title: scenario.title,
    route: scenario.route,
    status: 'pending',
    metrics: null,
    assertions: scenario.assertions,
    assertFailures: []
  }

  if (scenario.status !== 'auto') {
    return {
      ...baseResult,
      status: scenario.status,
      reason: scenario.status === 'manual' ? '手动标定（未自动运行）' : '待实现（依赖浏览器/经典 stroke 链路）'
    }
  }

  const command = scenario.command
  if (!command) return { ...baseResult, status: 'fail', reason: 'auto 例缺少 command' }

  // 解析输入与输出目录。
  const input = scenario.inputs?.[0] ? path.resolve(base, scenario.inputs[0]) : undefined
  const outDir = path.resolve(outRoot, scenario.id)
  const name = scenario.id

  // 替换占位符。
  const argv = command.map((tok) =>
    tok
      .replaceAll('{input}', input ?? '')
      .replaceAll('{inputDir}', input ? path.dirname(input) : '')
      .replaceAll('{name}', name)
      .replaceAll('{outDir}', outDir)
  )

  // 清空并重建该例输出目录（保证覆写、确定性）。
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })

  const run = spawnSync(argv[0], argv.slice(1), { cwd: base, encoding: 'utf8' })
  const exitCode = run.status

  // 收集指标。
  const summaryPath = path.join(outDir, `${name}.summary.json`)
  const qaPath = path.join(outDir, `${name}.qa.json`)
  let metrics: ScenarioMetrics = { units: null, gate: null, qa: null, bytes: null, sha256: null }

  if (fs.existsSync(summaryPath)) {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as Record<string, unknown>
    const budget = (summary.budget ?? {}) as Record<string, unknown>
    const gate = (summary.gate ?? {}) as Record<string, unknown>
    metrics = {
      units: numberOrNull(budget.used),
      gate: stringOrNull(gate.state),
      qa: null,
      bytes: null,
      sha256: sha256(fs.readFileSync(summaryPath))
    }
  }
  if (fs.existsSync(qaPath)) {
    const qa = JSON.parse(fs.readFileSync(qaPath, 'utf8')) as Record<string, unknown>
    metrics.qa = qa.ok === true ? 'ok' : 'failed'
  }
  // bytes：outDir 下导出产物字节数合计（确定性）。
  const artifactBytes = fs
    .readdirSync(outDir)
    .filter((f) => /\.(gil|gia|structure\.json|summary\.json|mesh\.json)$/.test(f))
    .reduce((n, f) => n + (fs.statSync(path.join(outDir, f)).size || 0), 0)
  metrics.bytes = artifactBytes

  const assertFailures = evalAssertions(scenario, metrics)

  if (exitCode !== 0) {
    return {
      ...baseResult,
      status: 'fail',
      metrics,
      reason: `command 以 ${exitCode} 退出：\n${(run.stderr ?? '').slice(0, 600)}`,
      assertFailures: [...assertFailures, `command exit=${exitCode}`]
    }
  }
  if (assertFailures.length > 0) {
    return { ...baseResult, status: 'fail', metrics, reason: '断言未满足', assertFailures }
  }
  return { ...baseResult, status: 'pass', metrics, assertFailures }
}

/** 运行整份清单；返回逐例结果。 */
export function runScenarios(manifest: Scenario[], opts: RunScenariosOptions = {}): ScenarioResult[] {
  return manifest.map((s) => runScenario(s, opts))
}

export function runScenariosFromFile(manifestPath: string, opts: RunScenariosOptions = {}): ScenarioResult[] {
  const manifest = loadScenariosFile(manifestPath)
  // 指令与输入相对路径均以仓库根为基准（default baseDir），保持 CLI 可解析 dist/ 与 examples/。
  return runScenarios(manifest, opts)
}

/* ------------------------------ 结果格式化 ------------------------------ */

export function formatScenarioMarkdown(results: ScenarioResult[]): string {
  const lines: string[] = []
  lines.push('# 场景验证集结果')
  lines.push('')
  const label = (s: string) => (s === 'pass' ? '✅' : s === 'fail' ? '❌' : s === 'manual' ? '🧑‍🔧' : '⏳')
  lines.push('| 场景 | 状态 | route | 单元 | gate | qa | bytes | sha256 |')
  lines.push('|---|---|---|---|---|---|---|---|')
  for (const r of results) {
    const m = r.metrics
    const cmd = m
      ? `${m.units ?? '-'} | ${m.gate ?? '-'} | ${m.qa ?? '-'} | ${m.bytes ?? '-'} | ${(m.sha256 ?? '-').slice(0, 12)}`
      : '- | - | - | - | -'
    lines.push(`| ${r.id} — ${r.title} | ${label(r.status)} | ${r.route} | ${cmd}`)
  }
  lines.push('')
  for (const r of results) {
    if (r.status === 'fail' && r.assertFailures.length) {
      lines.push(`## ${r.id} 失败原因`)
      for (const f of r.assertFailures) lines.push(`- ${f}`)
      lines.push('')
    }
    if (r.reason && r.status !== 'pass') {
      lines.push(`## ${r.id} 说明`)
      lines.push(`- ${r.reason}`)
      lines.push('')
    }
  }
  return lines.join('\n')
}
