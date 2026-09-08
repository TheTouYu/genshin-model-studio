/**
 * export-qa.ts — 导出后 QA 审计（确定性，纯 TS + 可选 .gia 回读，可单测）。
 *
 * 与 03（verify.ts）的关系：03 是「导出前」门禁（水密/焊接/法线/退化/瘦三角/面积比/预算），
 * 失败会拒绝导出；本模块是「导出后」审计——不删除产物、报告 FAIL + 明确中文原因、
 * 由 CLI 以非零退出码结束。两者独立：QA 不替代门禁，门禁失败也仍然可以跑 QA（诊断）。
 *
 * 审计清单（与 docs/input-format.md §ID 规则 / §资源速查表 对齐）：
 *   a) ID 规则：prefabId 区间（≥ 1077936129）；prefabId 命中骨架占位 ID；
 *      aux ID（definition + instance）唯一性、不得等于 prefabId、不得命中骨架占位 ID。
 *   b) 资源覆盖：每个 item.resourceId ∈ 官方资源表（src/core/resource-meta.ts）；
 *      status='未校准' 的基元单独列出（候选/待校准，不判失败）。
 *   c) 单元预算：summary.budget{requested,used,exceeded} 自洽 + 与 gate.state 一致性。
 *   d) 可回读：.gil 走 src/core/readback（readBackAssemblies/closureSummary）；
 *      .gia 走 tools/gia/gia_parser.py（若可用），不可用则 readback 标「未覆盖」。
 *   e) 产物存在性/非空/一致性（items 数 = summary.budget.used；mesh 面数 = summary.model.mesh.faces）。
 *
 * 确定性契约：相同输入 ⇒ 相同报告（无时间戳、无随机数）；报告本身不修改任何导出产物。
 * .gia 回读不污染输出——临时 JSON 写入系统临时目录并立即清理。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { readBackAssemblies, closureSummary } from '../core/readback.js'
import { RESOURCE_META, type ResourceMeta, type ResourceStatus } from '../core/resource-meta.js'
import { RESERVED_SKELETON_IDS, officialPrefabName } from '../core/official-resources.js'
import { MIN_CUSTOM_PREFAB_ID } from '../core/structure.js'

const DEFINITION_SKELETON_ID = 1077936129

export type QaUncalibrated = { resourceId: number; name: string; status: ResourceStatus; count: number; index: number }
export type QaUnknownResource = { resourceId: number | undefined; index: number }
export type QaArtifact = { path: string; exists: boolean; size: number | null }

export type ExportQaChecks = {
  id: { pass: boolean; issues: string[] }
  resources: {
    pass: boolean
    uncalibrated: QaUncalibrated[]
    unknown: QaUnknownResource[]
    issues: string[]
  }
  budget: {
    pass: boolean
    detail: { requested: number | null; used: number | null; exceeded: boolean | null; gateState: string | null }
    issues: string[]
  }
  readback: {
    pass: boolean | 'uncovered'
    detail: { gil?: Record<string, unknown>; gia?: Record<string, unknown> }
    uncoveredReason?: string
    issues: string[]
  }
  artifacts: {
    pass: boolean
    detail: { artifacts: QaArtifact[]; items: number; units: number | null; meshFaces: number | null }
    issues: string[]
  }
}

export type ExportQaResult = {
  ok: boolean
  base: string
  dir: string
  checks: ExportQaChecks
  failures: string[]
  notes: string[]
}

const KNOWN_SUFFIXES = ['.structure.json', '.summary.json', '.mesh.json', '.gil', '.gia']

function stripBase(fileName: string): string | null {
  for (const suffix of KNOWN_SUFFIXES) {
    if (fileName.endsWith(suffix)) return fileName.slice(0, -suffix.length)
  }
  return null
}

/** 仓库根目录：从本模块的 dist 位置反推（dist/src/qa → ../../.. = 仓库根）。 */
function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
}

/** 从导出目录或单个导出文件解析出 {dir, base}。name 可显式覆盖（CLI 集成时用）。 */
export function resolveExportSet(inputPath: string, name?: string): { dir: string; base: string } {
  const abs = path.resolve(inputPath)
  let dir = abs
  let base = name
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    const files = fs.readdirSync(abs).sort()
    const struct = files.find((f) => f.endsWith('.structure.json'))
    const summ = files.find((f) => f.endsWith('.summary.json'))
    base = name ?? stripBase(struct ?? summ ?? '') ?? undefined
    if (!base) {
      throw new Error(`[qa] 目录 ${abs} 未找到 .structure.json / .summary.json 导出产物`)
    }
  } else {
    const basename = path.basename(abs)
    const stripped = stripBase(basename)
    if (!stripped) {
      throw new Error(
        `[qa] 输入文件 ${basename} 不是导出产物（期望 .structure.json/.summary.json/.mesh.json/.gil/.gia）`
      )
    }
    base = name ?? stripped
    dir = path.dirname(abs)
  }
  return { dir, base }
}

/** 读取并解析 JSON；缺文件/坏 JSON 抛中文错误。 */
function readJson(filePath: string, label: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`[qa] ${label} 不存在：${filePath}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    const detail = error instanceof SyntaxError ? 'invalid JSON' : `cannot be read: ${String(error)}`
    throw new Error(`[qa] ${label} 读取失败：${filePath}（${detail}）`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`[qa] ${label} 必须是 JSON 对象：${filePath}`)
  }
  return parsed as Record<string, unknown>
}

function resourceMetaById(): Map<number, ResourceMeta> {
  const map = new Map<number, ResourceMeta>()
  for (const meta of RESOURCE_META) map.set(meta.resourceId, meta)
  return map
}

/** 解析可用 .gia 解析器：优先项目 .venv python，其次 PATH 上的 python3。不可用返回 null。 */
function resolvePython(): string | null {
  const root = repoRoot()
  const venv = path.join(root, '.venv', 'bin', 'python')
  if (fs.existsSync(venv)) return venv
  const venv3 = path.join(root, '.venv', 'bin', 'python3')
  if (fs.existsSync(venv3)) return venv3
  // PATH 回退：execFileSync 会自行查找；不存在则后续 catch 标记未覆盖。
  return 'python3'
}

function giaParserPath(): string {
  return path.join(repoRoot(), 'tools', 'gia', 'gia_parser.py')
}

/** 调用 .gia 解析器一次，返回当前版本对应的 item 列表 + 版本元信息。不可用抛错。 */
function readGia(
  giaPath: string,
  python: string
): {
  items: { id: number; resourceId: number }[]
  structureId: unknown
  templatePrefabId: unknown
  name: unknown
} {
  const parser = giaParserPath()
  const tmp = path.join(os.tmpdir(), `gms-qa-gia-${process.pid}.json`)
  try {
    execFileSync(python, [parser, giaPath, '--json', tmp], { stdio: 'pipe' })
    const parsed = readJson(tmp, '.gia 解析器输出')
    const versions = (parsed.versions as unknown[] | undefined) ?? []
    const current = versions[versions.length - 1] as Record<string, unknown> | undefined
    const related = new Set<number>((current?.relatedIds as number[] | undefined) ?? [])
    const items = ((parsed.items as Record<string, unknown>[] | undefined) ?? [])
      .map((it) => it.data as Record<string, unknown> | undefined)
      .filter((data): data is Record<string, unknown> => data !== undefined && related.has(data.id as number))
      .sort((a, b) => (a.id as number) - (b.id as number))
      .map((data) => ({ id: data.id as number, resourceId: data.resourceId as number }))
    const data = ((current?.data as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
    return { items, structureId: data.structureId, templatePrefabId: data.templatePrefabId, name: current?.name as unknown }
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
  }
}

function multiSetEqual(a: number[], b: number[]): boolean {
  const sortedA = [...a].sort((x, y) => x - y)
  const sortedB = [...b].sort((x, y) => x - y)
  return sortedA.length === sortedB.length && sortedA.every((v, k) => v === sortedB[k])
}

/**
 * 导出 QA 审计。inputPath 可为导出目录（含 .structure.json/.summary.json/.gil/.gia）
 * 或其中任一文件；返回机器可读结果。任一检查 FAIL ⇒ ok=false（产物保留，不改写）。
 *
 * @param opts.name 显式基名（CLI 集成用，避免同目录多套产物时误选）。
 * @param opts.python 指定 .gia 解析用的 python 解释器（缺省自动探测）。
 */
export function auditExport(
  inputPath: string,
  opts: { name?: string; python?: string } = {}
): ExportQaResult {
  const { dir, base } = resolveExportSet(inputPath, opts.name)
  const structurePath = path.join(dir, `${base}.structure.json`)
  const summaryPath = path.join(dir, `${base}.summary.json`)
  const gilPath = path.join(dir, `${base}.gil`)
  const giaPath = path.join(dir, `${base}.gia`)
  const meshPath = path.join(dir, `${base}.mesh.json`)

  const structure = readJson(structurePath, '.structure.json')
  const summary = readJson(summaryPath, '.summary.json')
  const items = ((structure.items as unknown[] | undefined) ?? []) as Record<string, unknown>[]

  const failures: string[] = []
  const notes: string[] = []

  /* ------------------------------- a) ID 规则 ------------------------------- */
  const idIssues: string[] = []
  const prefabId = structure.prefabId as number | undefined
  if (typeof prefabId !== 'number' || !Number.isSafeInteger(prefabId)) {
    idIssues.push(`ID 规则：prefabId 非安全整数（字段值 ${String(prefabId)}）`)
  } else {
    if (prefabId < MIN_CUSTOM_PREFAB_ID) {
      idIssues.push(
        `ID 规则：prefabId=${prefabId} 低于区间下限 ${MIN_CUSTOM_PREFAB_ID}（0x40400000），` +
          `游戏/编辑器会丢弃该元件导致地图为空`
      )
    }
    // 命中骨架占位 ID 会与模板替换过程冲突。prefabId=1077936129（定义骨架自然 ID）时
    // replaceVarint(old==new) 为恒等替换，故不判失败；其余命中均判失败。
    if (RESERVED_SKELETON_IDS.includes(prefabId) && prefabId !== DEFINITION_SKELETON_ID) {
      idIssues.push(
        `ID 规则：prefabId=${prefabId} 命中骨架占位 ID，会被模板替换过程破坏（见 docs/input-format.md §ID 规则）`
      )
    }
  }
  const defAux = Array.isArray(structure.definitionAuxiliaryIds)
    ? (structure.definitionAuxiliaryIds as number[])
    : []
  const instAux = Array.isArray(structure.instanceAuxiliaryIds) ? (structure.instanceAuxiliaryIds as number[]) : []
  const allAux = [...defAux, ...instAux]
  const auxCounts = new Map<number, number>()
  for (const id of allAux) auxCounts.set(id, (auxCounts.get(id) ?? 0) + 1)
  for (const [id, count] of auxCounts) {
    if (count > 1) idIssues.push(`ID 规则：aux ID=${id} 重复出现 ${count} 次（定义/实例侧冲突）`)
  }
  if (allAux.includes(prefabId as number)) {
    idIssues.push(`ID 规则：aux ID=${String(prefabId)} 等于 prefabId`)
  }
  for (const id of allAux) {
    if (RESERVED_SKELETON_IDS.includes(id)) {
      idIssues.push(`ID 规则：aux ID=${id} 命中骨架占位 ID，会被模板替换过程破坏`)
    }
  }
  failures.push(...idIssues)

  /* ------------------------------- b) 资源覆盖 ------------------------------- */
  const metaById = resourceMetaById()
  const resourceIssues: string[] = []
  const unknown: QaUnknownResource[] = []
  const uncalibratedByResource = new Map<number, QaUncalibrated>()
  items.forEach((item, index) => {
    const rid = item.resourceId as number | undefined
    if (typeof rid !== 'number' || !Number.isSafeInteger(rid)) {
      unknown.push({ resourceId: rid, index })
      resourceIssues.push(`资源覆盖：item[${index}].resourceId 缺失/非安全整数（字段值 ${String(rid)}）`)
      return
    }
    const meta = metaById.get(rid)
    if (!meta) {
      unknown.push({ resourceId: rid, index })
      resourceIssues.push(`资源覆盖：item[${index}].resourceId=${rid} 不在官方资源表（未知基元）`)
      return
    }
    if (meta.status === '未校准') {
      const existing = uncalibratedByResource.get(rid)
      if (existing) existing.count++
      else {
        uncalibratedByResource.set(rid, {
          resourceId: rid,
          name: officialPrefabName(rid) ?? String(rid),
          status: meta.status,
          count: 1,
          index
        })
      }
    }
    // 字段完整性：position 必须为 3 维有限数（scale 允许缺省为 [1,1,1]）。
    const pos = item.position
    if (!Array.isArray(pos) || pos.length !== 3 || pos.some((v) => typeof v !== 'number')) {
      resourceIssues.push(`资源覆盖：item[${index}].position 缺失/非法（resourceId=${rid}）`)
    }
  })
  const uncalibrated = [...uncalibratedByResource.values()].sort((a, b) => a.resourceId - b.resourceId)
  failures.push(...resourceIssues)

  /* ------------------------------- c) 单元预算 ------------------------------- */
  const budgetIssues: string[] = []
  const summaryBudget = (summary.budget ?? {}) as Record<string, unknown>
  const requested = typeof summaryBudget.requested === 'number' ? summaryBudget.requested : null
  const used = typeof summaryBudget.used === 'number' ? summaryBudget.used : null
  const exceeded = typeof summaryBudget.exceeded === 'boolean' ? summaryBudget.exceeded : null
  const gateState = (summary.gate as Record<string, unknown> | undefined)?.state as string | null | undefined
  if (used === null || used === undefined) {
    budgetIssues.push('单元预算：summary.budget.used 缺失或非数字')
  }
  const recomputed = requested !== null && used !== null && used > requested
  if (exceeded === null) {
    budgetIssues.push('单元预算：summary.budget.exceeded 缺失或非布尔')
  } else if (exceeded !== recomputed) {
    budgetIssues.push(
      `单元预算：summary.budget.exceeded=${exceeded} 与 used>requested（${recomputed}）不一致，` +
        `请核对 requested=${String(requested)}/used=${String(used)}`
    )
  }
  if (recomputed) {
    budgetIssues.push(`单元预算超限：需要 ${used} 个单元，预算 ${requested}，超出 ${(used ?? 0) - (requested ?? 0)}`)
    if (gateState === 'passed') {
      budgetIssues.push(`单元预算：预算超限（used>requested）但 summary.gate.state=passed，状态不一致`)
    }
  }
  failures.push(...budgetIssues)

  /* ------------------------------- d) 可回读 ------------------------------- */
  const readbackIssues: string[] = []
  const readbackDetail: { gil?: Record<string, unknown>; gia?: Record<string, unknown> } = {}
  let giaUncoveredReason: string | undefined
  const gil = fs.existsSync(gilPath) ? fs.readFileSync(gilPath) : null
  if (gil === null) {
    readbackIssues.push(`回读：.gil 不存在（${gilPath}），无法回读`)
  } else {
    try {
      const assembly = readBackAssemblies(gil)
      if (assembly.length === 0) {
        readbackIssues.push('回读：.gil 回读出 0 个 assembly')
      } else {
        const a = assembly[0]
        const closure = closureSummary(gil)
        readbackDetail.gil = {
          prefabId: a.prefabId,
          templateResourceId: a.templateResourceId,
          items: a.items.length,
          closureComplete: closure.complete
        }
        if (a.prefabId !== prefabId) {
          readbackIssues.push(
            `回读：.gil 回读 prefabId=${a.prefabId} 与 .structure.json prefabId=${String(prefabId)} 不一致`
          )
        }
        if (a.items.length !== items.length) {
          readbackIssues.push(`回读：.gil 回读 item 数 ${a.items.length} 与 .structure.json ${items.length} 不一致`)
        } else {
          const gilRes = a.items.map((it) => it.resourceId)
          const structRes = items.map((it) => it.resourceId as number)
          if (!multiSetEqual(gilRes, structRes)) {
            readbackIssues.push('回读：.gil 回读 resourceId 集合与 .structure.json 不一致')
          }
        }
      }
    } catch (error) {
      readbackIssues.push(`回读：.gil 解析失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  let giaPass: boolean | 'uncovered' = 'uncovered'
  if (!fs.existsSync(giaPath)) {
    giaUncoveredReason = '.gia 未生成（--format 可能是 gil-only），故未做回读'
  } else {
    const python = opts.python ?? resolvePython() ?? "python3"
    try {
      const gia = readGia(giaPath, python)
      const giaItems = gia.items
      readbackDetail.gia = {
        items: giaItems.length,
        idRange: giaItems.length ? [giaItems[0].id, giaItems[giaItems.length - 1].id] : null,
        resourceIds: [...new Set(giaItems.map((it) => it.resourceId))].sort((a, b) => a - b),
        structureId: gia.structureId,
        templatePrefabId: gia.templatePrefabId,
        name: gia.name
      }
      if (giaItems.length !== items.length) {
        readbackIssues.push(`回读：.gia 回读 item 数 ${giaItems.length} 与 .structure.json ${items.length} 不一致`)
      } else {
        const giaRes = giaItems.map((it) => it.resourceId)
        const structRes = items.map((it) => it.resourceId as number)
        if (!multiSetEqual(giaRes, structRes)) {
          readbackIssues.push('回读：.gia 回读 resourceId 集合与 .structure.json 不一致')
        }
      }
      giaPass = true
    } catch (error) {
      giaPass = 'uncovered'
      giaUncoveredReason = `.gia 解析器不可用/失败：${error instanceof Error ? error.message : String(error)}`
    }
  }
  failures.push(...readbackIssues)
  let readbackStatus: boolean | 'uncovered'
  if (readbackIssues.length > 0) readbackStatus = false
  else if (giaPass === 'uncovered') readbackStatus = 'uncovered'
  else readbackStatus = true
  if (readbackStatus === 'uncovered') {
    notes.push(`回读：.gia 未覆盖（${giaUncoveredReason ?? '未提供原因'}）；.gil 回读已通过`)
  }

  /* ------------------------------- e) 产物 ------------------------------- */
  const artifactIssues: string[] = []
  const expectedPaths: { path: string; label: string }[] = [
    { path: structurePath, label: 'structure' },
    { path: summaryPath, label: 'summary' }
  ]
  const out = (summary.output ?? {}) as Record<string, unknown>
  // 只期望 summary.output 声明产出的产物（gil/gia/mesh），未声明的不强行要求（如 --format gil-only）。
  if (typeof out.gil === 'string' && out.gil) expectedPaths.push({ path: gilPath, label: 'gil' })
  if (typeof out.gia === 'string' && out.gia) expectedPaths.push({ path: giaPath, label: 'gia' })
  if (typeof out.mesh === 'string' && out.mesh) expectedPaths.push({ path: meshPath, label: 'mesh' })

  const artifacts: QaArtifact[] = expectedPaths.map(({ path: p }) => {
    const exists = fs.existsSync(p)
    const size = exists ? fs.statSync(p).size : null
    return { path: p, exists, size }
  })
  for (const art of artifacts) {
    const label = path.basename(art.path)
    if (!art.exists) {
      artifactIssues.push(`产物：${label} 不存在`)
    } else if (art.size === null || art.size <= 0) {
      artifactIssues.push(`产物：${label} 为空文件`)
    }
  }
  const units = typeof used === 'number' ? used : null
  let meshFaces: number | null = null
  if (out.mesh && fs.existsSync(meshPath)) {
    const mesh = readJson(meshPath, '.mesh.json')
    const faces = mesh.faces as number[] | undefined
    if (Array.isArray(faces)) {
      meshFaces = faces.length % 3 === 0 ? faces.length / 3 : null
    }
  }
  // 一致性：structure.items.length === budget.used（单元数）。
  if (units !== null && items.length !== units) {
    artifactIssues.push(
      `产物：.structure.json items=${items.length} 与 summary.budget.used=${units} 不一致`
    )
  }
  const summaryMeshFaces = (summary.model as Record<string, unknown> | undefined)?.mesh as
    | Record<string, unknown>
    | undefined
  if (meshFaces !== null && summaryMeshFaces?.faces !== undefined && summaryMeshFaces.faces !== meshFaces) {
    artifactIssues.push(`产物：.mesh.json 面数=${meshFaces} 与 summary.model.mesh.faces=${String(summaryMeshFaces.faces)} 不一致`)
  }
  failures.push(...artifactIssues)

  const checks: ExportQaChecks = {
    id: { pass: idIssues.length === 0, issues: idIssues },
    resources: { pass: resourceIssues.length === 0, uncalibrated, unknown, issues: resourceIssues },
    budget: {
      pass: budgetIssues.length === 0,
      detail: { requested, used, exceeded, gateState: gateState ?? null },
      issues: budgetIssues
    },
    readback: { pass: readbackStatus, detail: readbackDetail, uncoveredReason: giaUncoveredReason, issues: readbackIssues },
    artifacts: {
      pass: artifactIssues.length === 0,
      detail: { artifacts, items: items.length, units, meshFaces },
      issues: artifactIssues
    }
  }

  if (uncalibrated.length) {
    const names = uncalibrated.map((u) => `${u.name}(${u.resourceId})×${u.count}`)
    notes.push(`资源覆盖：存在 ${uncalibrated.length} 类未校准基元（候选/待校准）：${names.join('、')}`)
  }

  const ok = failures.length === 0
  return { ok, base, dir, checks, failures, notes }
}

/** 格式化人类可读的 qa.md 报告（无时间戳，确定性）。 */
export function formatQaMarkdown(result: ExportQaResult): string {
  const lines: string[] = []
  lines.push(`# 导出 QA 报告 — ${result.base}`)
  lines.push('')
  lines.push(`- 目录：${result.dir}`)
  lines.push(`- 结论：**${result.ok ? '通过' : '失败'}**`)
  lines.push('')
  const status = (pass: boolean) => (pass ? '✅' : '❌')
  lines.push(`## ID 规则 — ${status(result.checks.id.pass)}`)
  if (result.checks.id.issues.length) for (const i of result.checks.id.issues) lines.push(`- ${i}`)
  else lines.push('- 通过')
  lines.push('')
  lines.push(`## 资源覆盖 — ${status(result.checks.resources.pass)}`)
  if (result.checks.resources.issues.length) for (const i of result.checks.resources.issues) lines.push(`- ${i}`)
  if (result.checks.resources.uncalibrated.length) {
    lines.push('- 未校准基元（候选/待校准，不判失败）：')
    for (const u of result.checks.resources.uncalibrated) {
      lines.push(`  - ${u.name}(${u.resourceId}) status=${u.status}（出现 ${u.count} 次，首例 item[${u.index}]）`)
    }
  }
  if (!result.checks.resources.issues.length && !result.checks.resources.uncalibrated.length) lines.push('- 通过')
  lines.push('')
  lines.push(`## 单元预算 — ${status(result.checks.budget.pass)}`)
  const b = result.checks.budget
  lines.push(`- requested=${String(b.detail.requested)} used=${String(b.detail.used)} exceeded=${String(b.detail.exceeded)} gate=${String(b.detail.gateState)}`)
  if (b.issues.length) for (const i of b.issues) lines.push(`- ${i}`)
  lines.push('')
  lines.push(`## 可回读 — ${result.checks.readback.pass === true ? '✅' : result.checks.readback.pass === 'uncovered' ? '⚠️ 未覆盖' : '❌'}`)
  if (result.checks.readback.pass === 'uncovered') {
    lines.push(`- 未覆盖：${result.checks.readback.uncoveredReason ?? '未提供原因'}`)
  } else {
    if (result.checks.readback.detail.gil) {
      const g = result.checks.readback.detail.gil
      lines.push(`- .gil：prefabId=${String(g.prefabId)} items=${String(g.items)} template=${String(g.templateResourceId)} closureComplete=${String(g.closureComplete)}`)
    }
    if (result.checks.readback.detail.gia) {
      const g = result.checks.readback.detail.gia
      lines.push(`- .gia：items=${String(g.items)} idRange=${JSON.stringify(g.idRange)} resources=${JSON.stringify(g.resourceIds)} structureId=${String(g.structureId)}`)
    }
    if (result.checks.readback.issues.length) for (const i of result.checks.readback.issues) lines.push(`- ${i}`)
    if (!result.checks.readback.issues.length) lines.push('- 通过')
  }
  lines.push('')
  lines.push(`## 产物 — ${status(result.checks.artifacts.pass)}`)
  for (const a of result.checks.artifacts.detail.artifacts) {
    const pathName = a.size === null ? a.path : `${path.basename(a.path)} (${a.size} bytes)`
    lines.push(`- ${a.exists ? (a.size && a.size > 0 ? '✅' : '⚠️ 空') : '❌ 缺失'} ${pathName}`)
  }
  lines.push(`- 一致性：items=${result.checks.artifacts.detail.items} units=${String(result.checks.artifacts.detail.units)} meshFaces=${String(result.checks.artifacts.detail.meshFaces)}`)
  if (result.checks.artifacts.issues.length) for (const i of result.checks.artifacts.issues) lines.push(`- ${i}`)
  lines.push('')
  if (result.failures.length) {
    lines.push('## 失败汇总')
    for (const f of result.failures) lines.push(`- ${f}`)
    lines.push('')
  }
  if (result.notes.length) {
    lines.push('## 备注')
    for (const n of result.notes) lines.push(`- ${n}`)
    lines.push('')
  }
  return lines.join('\n')
}
