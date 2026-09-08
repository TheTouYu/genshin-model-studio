/**
 * quality-plan.ts — 缺陷分层分类器 + 依赖感知修复队列 + 沉淀记录（确定性，纯 TS，可单测）。
 *
 * 背景：把「人工复盘」升级为「机制化闭环」。一份失败导出产物（或单个诊断文件）被自动分类到
 * 缺陷维度（L1 比例/轮廓 → L2 结构/规格 → L3 拓扑/曲率 → L4 材质），并产出：
 *   - dimensions：各维度命中项（含来源 + 数值）；
 *   - repairQueue：按 L1→L2→L3→L4 排序的依赖感知修复队列（先比例后拓扑后材质），
 *     每项给「来源检查 + 数值」、「一句话最小修复 + 可调参数」、「重跑/断言」；
 *   - sedimentation：沉淀的建议规则 + 溯源（artifactHash + 来源文件）——可回溯到具体失败产物；
 *   - unclassified：无法映射项，原样输出并建议人工，绝不硬猜。
 *
 * 分类默认映射（写死在本文件注释，与 docs / ticket 对齐）：
 *   gate/verify 失败（watertight/seams/normals/degenerate/skinny/areaRatio/网格几何）→ L3 拓扑/曲率
 *   budget/ID/resources（qa.id/qa.resources/qa.budget/qa.readback/qa.artifacts/summary.budget）
 *     → L2 结构关系/规格
 *   colorBands/材质/色带相关 → L4 材质
 *   剪影/bbox/IoU/比例/宽高比（silhouette/bounds 等）→ L1 比例/轮廓
 *   无法映射 → unclassified（不硬猜，输出原样 + 建议人工）
 *
 * 确定性契约：相同 artifact + 相同 opts ⇒ 相同计划（无时间戳、无随机数）。
 * 外部副作用：不修改任何导出产物；仅由 CLI 层负责写 <id>.quality-plan.json 与追加 evolution-log。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

export type Dimension = 'L1' | 'L2' | 'L3' | 'L4' | 'unclassified'
export const DIMENSION_ORDER: Dimension[] = ['L1', 'L2', 'L3', 'L4', 'unclassified']

/** 一条缺陷证据：来源检查（如 gate.skinny / qa.budget）+ 可读文本 + 数值。 */
export type QualityIssue = {
  source: string
  text: string
  /** 数值摘要（用于 evidence 里的数值），如 "675 个 / 占比 18.75%"；无则省略。 */
  value?: string
}

/** 修复队列条目。 */
export type RepairEntry = {
  order: number
  dimension: Dimension
  evidence: string
  minimalFix: string
  verifyHint: string
}

export type QualityPlan = {
  schemaVersion: 1
  artifact: {
    path: string
    /** 关键校验和（对规范化产物集合做 sha256）。 */
    checksum: string
    sources: string[]
  }
  dimensions: {
    L1: { count: number; items: QualityIssue[] }
    L2: { count: number; items: QualityIssue[] }
    L3: { count: number; items: QualityIssue[] }
    L4: { count: number; items: QualityIssue[] }
    unclassified: QualityIssue[]
  }
  repairQueue: RepairEntry[]
  sedimentation: {
    suggestedRules: string[]
    trace: { artifactHash: string; sources: string[] }
  }
}

export type QualityPlanOptions = {
  /** 输出/计划 id（用于文件命名与日志）；缺省用 artifact 基名。 */
  id?: string
  /** 人工覆盖分类：source → dimension（如 { 'gate.skinny': 'L3', 'mesh.colorBands': 'L4' }）。 */
  map?: Record<string, Dimension>
}

/* ------------------------------ 常量与阈值 ------------------------------ */

const KNOWN_EXPORT_SUFFIXES = ['.structure.json', '.summary.json', '.mesh.json', '.qa.json', '.gil', '.gia']

/** 规格相关检查门类（L2）。 */
const QA_CHECKS = ['id', 'resources', 'budget', 'readback', 'artifacts'] as const

/** 拓扑/曲率相关 gate 检查（L3）。 */
const GATE_TOPO_CHECKS = ['watertight', 'seams', 'normals', 'degenerate', 'skinny', 'areaRatio'] as const

/* ------------------------------ 小工具 ------------------------------ */

function sha256(data: Uint8Array | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)
  return createHash('sha256').update(buf).digest('hex')
}

function readJson(filePath: string, label: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) throw new Error(`[quality-plan] ${label} 不存在：${filePath}`)
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    const detail = error instanceof SyntaxError ? 'invalid JSON' : `cannot be read: ${String(error)}`
    throw new Error(`[quality-plan] ${label} 读取失败：${filePath}（${detail}）`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`[quality-plan] ${label} 必须是 JSON 对象：${filePath}`)
  }
  return parsed as Record<string, unknown>
}

/** 去掉已知导出后缀得到基名；非导出产物返回 null。 */
function stripBase(fileName: string): string | null {
  for (const suffix of KNOWN_EXPORT_SUFFIXES) {
    if (fileName.endsWith(suffix)) return fileName.slice(0, -suffix.length)
  }
  return null
}

function repoRoot(): string {
  // 编译后位于 dist/src/qa/ → 上溯四级到仓库根。
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
}

/* ------------------------------ 输入解析 ------------------------------ */

type ResolvedArtifact = { dir: string; base: string; explicitFile?: string }

/** 解析 --artifact 为 {dir, base}：目录（导出集）或单个导出文件。 */
export function resolveArtifact(inputPath: string): ResolvedArtifact {
  const abs = path.resolve(inputPath)
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    const files = fs.readdirSync(abs).sort()
    const struct = files.find((f) => f.endsWith('.structure.json'))
    const summ = files.find((f) => f.endsWith('.summary.json'))
    const base = stripBase(struct ?? summ ?? '') ?? undefined
    if (!base) throw new Error(`[quality-plan] 目录 ${abs} 未找到 .structure.json / .summary.json 导出产物`)
    return { dir: abs, base }
  }
  const basename = path.basename(abs)
  const stripped = stripBase(basename)
  if (!stripped) {
    throw new Error(
      `[quality-plan] 输入文件 ${basename} 不是导出产物（期望 .structure.json/.summary.json/.mesh.json/.qa.json/.gil/.gia）`
    )
  }
  return { dir: path.dirname(abs), base: stripped, explicitFile: abs }
}

/* ------------------------------ 证据抽取 ------------------------------ */

/** 从 summary.gate 的每个检查项重建一条缺陷（来源 + 数值 + 可读中文）。 */
function issuesFromGateChecks(gate: Record<string, unknown>): QualityIssue[] {
  const checks = (gate.checks ?? {}) as Record<string, unknown>
  const issues: QualityIssue[] = []
  const push = (source: string, text: string, value?: string) => {
    if (text) issues.push({ source, text, ...(value ? { value } : {}) })
  }

  for (const key of GATE_TOPO_CHECKS) {
    const c = checks[key] as Record<string, unknown> | undefined
    if (!c) continue
    switch (key) {
      case 'watertight':
        if (c.pass === false) {
          const open = Number(c.openEdges ?? 0)
          const non = Number(c.nonManifold ?? 0)
          push('gate.watertight', `水密性未通过：开边 ${open} 条、非流形边 ${non} 条`, `${open}/${non}`)
        }
        break
      case 'seams':
        if (c.pass === false) {
          const n = Number(c.seamCount ?? 0)
          push('gate.seams', `存在未焊接顶点：${n} 处`, `${n} 处`)
        }
        break
      case 'normals':
        if (c.pass === false) {
          const n = Number(c.invertedCount ?? 0)
          push('gate.normals', `存在 ${n} 个朝内的法线面`, `${n} 个`)
        }
        break
      case 'degenerate':
        if (Number(c.count ?? 0) > 0) {
          const n = Number(c.count)
          push('gate.degenerate', `存在 ${n} 个退化面`, `${n} 个`)
        }
        break
      case 'skinny':
        if (c.pass === false) {
          const n = Number(c.count ?? 0)
          const pct = Number(c.pct ?? 0)
          push('gate.skinny', `瘦长三角 ${n} 个，占比 ${pct}%（阈值 ≤ 5%）`, `${n} 个 / ${pct}%`)
        }
        break
      case 'areaRatio':
        if (c.pass === false) {
          const v = Number(c.value ?? 0)
          push('gate.areaRatio', `面积比率 p95/p5 = ${v}（阈值 ≤ 20）`, `p95/p5=${v}`)
        }
        break
      default:
        break
    }
  }

  const budgetCheck = checks.budget as Record<string, unknown> | undefined
  if (budgetCheck && budgetCheck.pass === false) {
    const requested = budgetCheck.requested === null ? null : Number(budgetCheck.requested)
    const used = Number(budgetCheck.used ?? 0)
    const exceeded = Number(used) - (requested ?? 0)
    const text =
      requested === null
        ? `预算判定失败：需要 ${used} 个单元`
        : `单元预算超限：需要 ${used} 个单元，预算 ${requested}，超出 ${exceeded}`
    push('gate.budget', text, `used=${used} / requested=${String(requested)}`)
  }
  return issues
}

/** 从 summary.gate.failures（原始文本）兜底抽取（当 gate.checks 缺失时）。 */
function issuesFromGateFailures(failures: unknown[]): QualityIssue[] {
  const issues: QualityIssue[] = []
  for (const f of failures) {
    if (typeof f !== 'string') continue
    issues.push({ source: 'gate.failure', text: f })
  }
  return issues
}

/** 从 qa.json 的五个检查抽取缺陷（每个 issue 一条证据）。 */
function issuesFromQa(qa: Record<string, unknown>): QualityIssue[] {
  const checks = (qa.checks ?? {}) as Record<string, unknown>
  const issues: QualityIssue[] = []
  for (const name of QA_CHECKS) {
    const c = checks[name] as Record<string, unknown> | undefined
    if (!c) continue
    const arr = Array.isArray(c.issues) ? (c.issues as unknown[]) : []
    for (const issue of arr) {
      if (typeof issue !== 'string') continue
      issues.push({ source: `qa.${name}`, text: issue })
    }
  }
  return issues
}

/** 从 summary.budget 判定超限。 */
function issuesFromSummaryBudget(summary: Record<string, unknown>): QualityIssue[] {
  const b = (summary.budget ?? {}) as Record<string, unknown>
  const used = b.used
  const requested = b.requested
  const exceeded = b.exceeded
  if (typeof used === 'number' && typeof requested === 'number' && exceeded === true) {
    return [
      {
        source: 'summary.budget',
        text: `单元预算超限：需要 ${used} 个单元，预算 ${requested}，超出 ${used - requested}`,
        value: `used=${used} / requested=${requested}`
      }
    ]
  }
  return []
}

/** 从 mesh.json 检测色带（材质）异常：colors 数 ≠ 面数。 */
function issuesFromMesh(mesh: Record<string, unknown>): QualityIssue[] {
  const faces = mesh.faces
  const colors = mesh.colors
  if (!Array.isArray(faces) || faces.length % 3 !== 0) return []
  const faceCount = faces.length / 3
  if (Array.isArray(colors) && colors.length !== faceCount) {
    return [
      {
        source: 'mesh.colorBands',
        text: `色带数量 ${colors.length} 与面数 ${faceCount} 不一致（色带分配异常）`,
        value: `colors=${colors.length} / faces=${faceCount}`
      }
    ]
  }
  return []
}

/** 收集 artifact 对应的来源文件（存在才收）。返回 {files: string[]} 与各数据。 */
function collectSources(dirs: ResolvedArtifact): { files: string[]; summary?: Record<string, unknown>; qa?: Record<string, unknown>; mesh?: Record<string, unknown> } {
  const { dir, base } = dirs
  const summaryPath = path.join(dir, `${base}.summary.json`)
  const qaPath = path.join(dir, `${base}.qa.json`)
  const meshPath = path.join(dir, `${base}.mesh.json`)
  const files: string[] = []
  let summary: Record<string, unknown> | undefined
  let qa: Record<string, unknown> | undefined
  let mesh: Record<string, unknown> | undefined
  if (fs.existsSync(summaryPath)) {
    summary = readJson(summaryPath, '.summary.json')
    files.push(path.basename(summaryPath))
  }
  if (fs.existsSync(qaPath)) {
    qa = readJson(qaPath, '.qa.json')
    files.push(path.basename(qaPath))
  }
  if (fs.existsSync(meshPath)) {
    mesh = readJson(meshPath, '.mesh.json')
    files.push(path.basename(meshPath))
  }
  // 单文件输入：仍解析其所在目录的完整导出集，但也保留该文件本身。
  if (dirs.explicitFile) {
    const basename = path.basename(dirs.explicitFile)
    if (basename.endsWith('.qa.json') && !qa) {
      qa = readJson(dirs.explicitFile, '.qa.json')
      files.push(basename)
    } else if (basename.endsWith('.summary.json') && !summary) {
      summary = readJson(dirs.explicitFile, '.summary.json')
      files.push(basename)
    } else if (basename.endsWith('.mesh.json') && !mesh) {
      mesh = readJson(dirs.explicitFile, '.mesh.json')
      files.push(basename)
    }
  }
  return { files, summary, qa, mesh }
}

/** 计算校验和：对来源文件做 `rel:contentSha256` 排序拼接后再 sha256。 */
export function hashArtifact(dir: string, files: string[]): string {
  if (files.length === 0) return sha256('')
  const parts = files
    .map((f) => {
      const p = path.join(dir, f)
      const content = fs.existsSync(p) ? fs.readFileSync(p) : Buffer.from('')
      return `${f}:${sha256(content)}`
    })
    .sort()
  return sha256(parts.join('\n'))
}

/* ------------------------------ 分类 ------------------------------ */

const L3_SOURCE_RE =
  /watertight|seams\b|normals|degenerate|skinny|arearatio|mesh\.geom|gate\.(watertight|seams|normals|degenerate|skinny|arearatio)/i
const L2_SOURCE_RE =
  /qa\.(id|resources|budget|readback|artifacts)|summary\.budget|gate\.budget|structure\.items|qa\.resources\.uncalibrated/i
const L4_SOURCE_RE = /colorband|material/i
const L1_SOURCE_RE = /silhouette|silh|bbox|bound|iou|aspect/i

const L3_TEXT_RE = /水密|开边|非流形|未焊接|法线|退化面|瘦长三角|瘦三角|面积比率|拓扑|曲率/i
const L2_TEXT_RE = /预算|超限|ID规则|资源覆盖|未校准|回读|产物|骨架占位|一致/i
const L4_TEXT_RE = /色带|材质|颜色|color/i
const L1_TEXT_RE = /剪影|宽高比|bbox|iou|轮廓|比例/i

/** 分类：先人工覆盖（source 精确），再按 source 前缀，最后按文本关键词兜底；都无法映射 → unclassified。 */
export function classifyIssue(source: string, text: string, map?: Record<string, Dimension>): Dimension {
  if (map && map[source]) return map[source]
  const s = String(source ?? '')
  const t = String(text ?? '')
  if (L1_SOURCE_RE.test(s) || (!L1_SOURCE_RE.test(s) && L1_TEXT_RE.test(t) && !L3_TEXT_RE.test(t))) return 'L1'
  if (L4_SOURCE_RE.test(s) || (!L4_SOURCE_RE.test(s) && L4_TEXT_RE.test(t))) return 'L4'
  if (L3_SOURCE_RE.test(s) || (!L3_SOURCE_RE.test(s) && L3_TEXT_RE.test(t))) return 'L3'
  if (L2_SOURCE_RE.test(s) || (!L2_SOURCE_RE.test(s) && L2_TEXT_RE.test(t))) return 'L2'
  return 'unclassified'
}

/* ------------------------------ 修复建议 ------------------------------ */

function minimalFixFor(source: string, dimension: Dimension): string {
  switch (source) {
    case 'gate.watertight':
      return '焊接重复顶点或补齐开边/封口使每边恰被 2 三角共享；可调参数 weldTolerance（默认 2e-4）'
    case 'gate.seams':
      return '按容差焊接近邻顶点消除重复位置；可调参数 weldTolerance'
    case 'gate.normals':
      return '统一绕序后重算法线（computeVertexNormals）；无参数'
    case 'gate.degenerate':
      return '剔除/合并面积<minArea 的退化面；可调参数 minArea（默认 1e-9）'
    case 'gate.skinny':
      return '提升环分辨率（points）或改进盖扇三角剖分，使瘦长三角占比降到阈值内；可调参数 points / maxSkinnyPct（默认 5%）'
    case 'gate.areaRatio':
      return '均衡面大小，避免微小面与大面共存；可调参数 maxAreaRatio（默认 20）'
    case 'gate.budget':
    case 'summary.budget':
    case 'qa.budget':
      return '降低 --budget，或减小分辨率/简化形体使单元数 ≤ 预算；可调参数 budget / points / ringCountLimit'
    case 'qa.id':
      return '修正 prefabId 落在 [1077936129, …) 且不命中骨架占位 ID，并保证 aux ID 唯一；可调参数 prefabId'
    case 'qa.resources':
      return '改用官方资源表内的 resourceId，未校准基元先校准；可调参数 resourceId'
    case 'qa.readback':
      return '检查 .gil/.gia 编码，使回读 item 数与资源集合与 .structure.json 一致；可调参数 readback'
    case 'qa.artifacts':
      return '补齐缺失/空产物，并保证 items 数 = budget.used；可调参数 out / items'
    case 'mesh.colorBands':
      return '校正色带分配（colors 数组长度 = 面数）；可调参数 colorBands'
    default:
      if (dimension === 'L1') {
        return '调整 topOutline/sideProfile 或比例/宽高参数（如 foot_length/forefoot_width/instep_height）；可调参数按参考对象'
      }
      if (dimension === 'unclassified') {
        return '需人工判别（无法自动给出最小修复）'
      }
      return '按对象形体参数做定向调整；可调参数按参考对象'
  }
}

function verifyHintFor(dimension: Dimension): string {
  switch (dimension) {
    case 'L1':
      return '重跑参考拟合并断言剪影 IoU / 宽高比达标'
    case 'L2':
      return '重跑 export-mesh/contour-model（含 --budget/QA），断言 qa.ok=true'
    case 'L3':
      return '重跑 export-mesh/contour-model，断言该拓扑检查项 gate=passed'
    case 'L4':
      return '重跑 contour-model，断言色带生效且颜色正常'
    default:
      return '人工确认分类后重跑对应检查'
  }
}

/* ------------------------------ 沉淀规则 ------------------------------ */

function buildRules(items: QualityIssue[]): string[] {
  const rules: string[] = []
  const push = (r: string) => {
    if (!rules.includes(r)) rules.push(r)
  }
  for (const it of items) {
    const dim = classifyIssue(it.source, it.text)
    if (dim === 'L3') {
      push('L3 拓扑/曲率缺陷（如水密/瘦三角/面积比）→ 应把 points/盖扇剖分调到能过 maxSkinnyPct 的档位，而非绕过门禁')
    } else if (dim === 'L2') {
      push('L2 结构/规格缺陷（ID/资源/预算/回读/产物）→ 在切形体前先定 budget 与资源档位，导出后用 qa.json 预检')
    } else if (dim === 'L4') {
      push('L4 材质/色带异常 → 先修形体拓扑，再校 colors 数 = 面数，禁止用材质掩盖形体错误')
    } else if (dim === 'L1') {
      push('L1 比例/轮廓异常 → 优先调参考拟合并提高剪影 IoU，再进入网格拓扑')
    } else {
      push('存在未能自动分类的缺陷 → 人工归类后再纳入修复队列')
    }
  }
  return rules
}

/* ------------------------------ 主入口 ------------------------------ */

export function buildQualityPlan(inputPath: string, opts: QualityPlanOptions = {}): QualityPlan {
  const resolved = resolveArtifact(inputPath)
  const { files, summary, qa, mesh } = collectSources(resolved)

  // 汇总证据（顺序固定，保证确定性）。
  const issues: QualityIssue[] = []
  if (summary) {
    const gate = (summary.gate ?? {}) as Record<string, unknown>
    const gateChecks = gate.checks as Record<string, unknown> | undefined
    if (gateChecks) issues.push(...issuesFromGateChecks(gate))
    else if (Array.isArray(gate.failures)) issues.push(...issuesFromGateFailures(gate.failures))
    issues.push(...issuesFromSummaryBudget(summary))
  }
  if (qa) issues.push(...issuesFromQa(qa))
  if (mesh) issues.push(...issuesFromMesh(mesh))

  // 分类。
  const byDim: Record<Dimension, QualityIssue[]> = { L1: [], L2: [], L3: [], L4: [], unclassified: [] }
  const seen = new Set<string>()
  for (const it of issues) {
    // 按文本去重：同一缺陷可能从多个来源（gate.checks / gate.failures / summary.budget / qa.budget）
    // 报告，保留首次出现的来源以避免重复计数。
    const key = it.text
    if (seen.has(key)) continue
    seen.add(key)
    const dim = classifyIssue(it.source, it.text, opts.map)
    byDim[dim].push(it)
  }

  // 修复队列：L1→L2→L3→L4，unclassified 殿后；同维度按出现顺序。
  const queue: RepairEntry[] = []
  let order = 1
  for (const dim of DIMENSION_ORDER) {
    for (const it of byDim[dim]) {
      queue.push({
        order: order++,
        dimension: dim,
        evidence: `${it.source}：${it.text}`,
        minimalFix: minimalFixFor(it.source, dim),
        verifyHint: verifyHintFor(dim)
      })
    }
  }

  const checksum = hashArtifact(resolved.dir, files)
  const sources = files.map((f) => f).sort()

  return {
    schemaVersion: 1,
    artifact: { path: resolved.dir, checksum, sources },
    dimensions: {
      L1: { count: byDim.L1.length, items: byDim.L1 },
      L2: { count: byDim.L2.length, items: byDim.L2 },
      L3: { count: byDim.L3.length, items: byDim.L3 },
      L4: { count: byDim.L4.length, items: byDim.L4 },
      unclassified: byDim.unclassified
    },
    repairQueue: queue,
    sedimentation: {
      suggestedRules: buildRules(issues),
      trace: { artifactHash: checksum, sources }
    }
  }
}

/* ------------------------------ 沉淀日志文本 ------------------------------ */

/** 生成 evolution-log 追加条目（含日期与溯源）。 */
export function formatEvolutionLogEntry(id: string, plan: QualityPlan, date: string): string {
  const dims = plan.dimensions
  const dimSummary = (['L1', 'L2', 'L3', 'L4'] as const)
    .map((d) => `${d}=${dims[d].count}`)
    .join(' ')
  const uncal = dims.unclassified.length ? ` unclassified=${dims.unclassified.length}` : ''
  return [
    `## ${date} — ${id}`,
    `- 来源：${plan.artifact.path}（checksum ${plan.artifact.checksum.slice(0, 12)}）`,
    `- 维度计数：${dimSummary}${uncal}`,
    '- 建议规则：',
    ...plan.sedimentation.suggestedRules.map((r) => `  - ${r}`),
    '- 校验和：' + plan.artifact.checksum,
    ''
  ].join('\n')
}
