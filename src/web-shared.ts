/**
 * web-shared.ts — 网页与 Vercel functions 共享的逻辑（零依赖）
 *
 * 本地 `web/server.ts` 与 serverless `api/*.ts` 都从这里复用：
 * 示例枚举、item 计数、GIA 输入补全、下载文件名、Markdown 渲染、文档页。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { fitStroke, type FittedStroke } from './draw/fitting.js'
import { generateModel, toStructureItems, SPHERE_RESOURCE_ID, CONE_RESOURCE_ID, TETRA_RESOURCE_ID, PLANE_RESOURCE_ID, MESH_RESOURCE_ID } from './draw/types.js'
import type { ModelOptions, Stroke, TaggedItem } from './draw/types.js'
import type { StructureItem } from './core/structure.js'
import { resolveStructure } from './core/structure.js'
import { checkStructure, type HealthReport } from './core/invariants.js'
import { resolveGiaScale } from './cli/gia-common.js'

export const EXAMPLES = join(process.cwd(), 'examples')

/* ==================== 二期：画线建模 /api/draw-model 共享逻辑 ==================== */

/** 笔画/点数量上限（防滥用；2026-09-06 表面面板建模：人物几千面上万装饰，放宽到 30000 笔/50 万点）。 */
export const MAX_DRAW_STROKES = 30000
export const MAX_DRAW_POINTS = 500000

/**
 * 校验并解析 /api/draw-model 请求体；非法时抛出中文 Error（调用方转 400）。
 * 入参契约（PRD §5.1）：{ strokes: Stroke[], options: ModelOptions }
 */
export function parseDrawModelRequest(body: string): { strokes: Stroke[]; options: ModelOptions } {
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('请求体需为 { strokes, options } 对象')
  }
  const src = data as { strokes?: unknown; options?: unknown }

  const strokes = src.strokes
  if (!Array.isArray(strokes) || strokes.length === 0) {
    throw new Error('笔画不能为空：请先在画布上画线')
  }
  if (strokes.length > MAX_DRAW_STROKES) {
    throw new Error(`笔画数量过多（最多 ${MAX_DRAW_STROKES} 笔）`)
  }
  let totalPoints = 0
  const parsed: Stroke[] = strokes.map((s: unknown, i: number) => {
    const stroke = s as { id?: unknown; points?: unknown }
    if (s === null || typeof s !== 'object' || typeof stroke.id !== 'string' || stroke.id === '') {
      throw new Error(`第 ${i + 1} 笔笔画无效：缺少字符串 id`)
    }
    if (!Array.isArray(stroke.points)) {
      throw new Error(`第 ${i + 1} 笔笔画无效：points 需为 [x, y] 数组`)
    }
    const points: [number, number, number][] = stroke.points.map((p: unknown, j: number) => {
      // 十期（ADR-0001）：点升级为 3D [x, y, z]；旧 [x, y] 自动补 z=0 兼容
      if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
        throw new Error(`第 ${i + 1} 笔第 ${j + 1} 个点无效：需为 [x, y] 或 [x, y, z] 有限数值`)
      }
      const z = p.length > 2 ? p[2] : 0
      if (!Number.isFinite(z)) throw new Error(`第 ${i + 1} 笔第 ${j + 1} 个点无效：z 需为有限数值`)
      return [p[0] as number, p[1] as number, z]
    })
    totalPoints += points.length
    if (totalPoints > MAX_DRAW_POINTS) {
      throw new Error(`笔画点总数过多（超过 ${MAX_DRAW_POINTS} 个点）`)
    }
    // 十五期：笔画级粗细（stroke.size，米，>0 覆盖全局 options.size；弧线罩铁丝用细杆）
    const size = (stroke as { size?: unknown }).size
    if (size !== undefined && (typeof size !== 'number' || !Number.isFinite(size) || size <= 0)) {
      throw new Error(`${i + 1} 笔 size 无效：需为正数米（覆盖全局杆径），当前值为 ${JSON.stringify(size)}`)
    }
    // 可选颜色（三期）："0xRRGGBB"，缺省 = 默认材质
    const color = (stroke as { color?: unknown }).color
    if (color !== undefined && (typeof color !== 'string' || !/^0x[0-9a-fA-F]{6}$/.test(color))) {
      throw new Error(`第 ${i + 1} 笔颜色无效：需为 "0xRRGGBB" 格式（如 "0xC8A87C"）`)
    }
    // 四期（PRD §4）：render/height/axis 可选透传，缺省不写（v1/v2 兼容）
    // 七期：angle（画布旋转角，弧度）可选透传，缺省不写（旋转副本专用）
    // 八期：lift（米，solid 柱体离地抬升）可选透传，缺省不写（贴地 = 既有行为）
    const render = (stroke as { render?: unknown }).render
    if (render !== undefined && render !== 'rod' && render !== 'solid') {
      throw new Error(`第 ${i + 1} 笔渲染方式无效：需为 rod 或 solid`)
    }
    const height = (stroke as { height?: unknown }).height
    if (height !== undefined && (typeof height !== 'number' || !Number.isFinite(height))) {
      throw new Error(`第 ${i + 1} 笔高度无效：需为有限数值（米）`)
    }
    const lift = (stroke as { lift?: unknown }).lift
    if (lift !== undefined && (typeof lift !== 'number' || !Number.isFinite(lift) || lift < 0)) {
      throw new Error(`第 ${i + 1} 笔抬升无效：需为非负有限数值（米）`)
    }
    const axis = (stroke as { axis?: unknown }).axis
    if (axis !== undefined && axis !== 'up' && axis !== 'front' && axis !== 'side') {
      throw new Error(`第 ${i + 1} 笔方向无效：需为 up、front 或 side`)
    }
    // 基础元件覆盖（底层拼装基础元件）：允许球体 10009002 / 圆锥 10009009 / 三棱锥 10009006 / 平面 10009003，
    // 且仅对 solid 封闭轮廓有效（球/圆锥=圆椭圆，三棱锥=三角，平面=矩形）
    const resourceId = (stroke as { resourceId?: unknown }).resourceId
    if (
      resourceId !== undefined &&
      resourceId !== SPHERE_RESOURCE_ID &&
      resourceId !== CONE_RESOURCE_ID &&
      resourceId !== MESH_RESOURCE_ID &&
      resourceId !== TETRA_RESOURCE_ID &&
      resourceId !== PLANE_RESOURCE_ID
    ) {
      throw new Error(`第 ${i + 1} 笔基础元件无效：当前支持球体 ${SPHERE_RESOURCE_ID} / 圆锥 ${CONE_RESOURCE_ID} / 三棱锥 ${TETRA_RESOURCE_ID} / 平面 ${PLANE_RESOURCE_ID} / 网格 ${MESH_RESOURCE_ID}，收到 ${JSON.stringify(resourceId)}`)
    }
    const angle = (stroke as { angle?: unknown }).angle
    if (angle !== undefined && (typeof angle !== 'number' || !Number.isFinite(angle))) {
      throw new Error(`第 ${i + 1} 笔角度无效：需为有限数值（弧度）`)
    }
    // 十期（ADR-0001）：transform 可选透传——position 偏移（米）、rotation 最终欧拉（度）
    const transform = (stroke as { transform?: unknown }).transform
    if (transform !== undefined) {
      if (transform === null || typeof transform !== 'object' || Array.isArray(transform)) {
        throw new Error(`第 ${i + 1} 笔 transform 无效：需为对象 { position?, rotation? }`)
      }
      const t = transform as { position?: unknown; rotation?: unknown }
      for (const [key, val] of [['position', t.position], ['rotation', t.rotation]] as const) {
        if (val === undefined) continue
        if (!Array.isArray(val) || val.length !== 3 || !val.every((v) => typeof v === 'number' && Number.isFinite(v))) {
          throw new Error(`第 ${i + 1} 笔 transform.${key} 无效：需为 [x, y, z] 有限数值`)
        }
      }
    }
    // 十一期：group（层级组）可选透传
    const group = (stroke as { group?: unknown }).group
    if (group !== undefined && (typeof group !== 'string' || group.trim() === '')) {
      throw new Error(`第 ${i + 1} 笔层级组无效：需为非空字符串（如 "fan"），缺省 = 静止件`)
    }
    return {
      id: stroke.id,
      points,
      ...(color === undefined ? {} : { color }),
      ...(render === undefined ? {} : { render }),
      ...(height === undefined ? {} : { height }),
      ...(lift === undefined ? {} : { lift }),
      ...(axis === undefined ? {} : { axis }),
      ...(resourceId === undefined ? {} : { resourceId }),
      ...(resourceId === MESH_RESOURCE_ID ? { mesh: (stroke as { mesh?: Stroke['mesh'] }).mesh } : {}),
      ...(size === undefined ? {} : { size }),
      ...(angle === undefined ? {} : { angle }),
      ...(transform === undefined ? {} : { transform: transform as Stroke['transform'] }),
      // 十一期：group（层级组）可选透传——非空字符串；缺省不写（静止件）
      ...(group === undefined ? {} : { group })
    }
  })

  const o = src.options as Record<string, unknown> | null
  if (o === null || typeof o !== 'object' || Array.isArray(o)) {
    throw new Error('options 需为对象')
  }
  if (o.mode !== 'extrude' && o.mode !== 'lathe') {
    throw new Error('options.mode 无效：需为 extrude 或 lathe')
  }
  if (o.shape !== 'cylinder' && o.shape !== 'box') {
    throw new Error('options.shape 无效：需为 cylinder 或 box')
  }
  if (typeof o.size !== 'number' || !Number.isFinite(o.size) || o.size <= 0) {
    throw new Error('options.size 需为正数（米）')
  }
  if (typeof o.count !== 'number' || !Number.isFinite(o.count) || o.count < 1 || o.count > 5000) {
    throw new Error('options.count 需在 1 ~ 5000 之间')
  }
  if (typeof o.heightMeters !== 'number' || !Number.isFinite(o.heightMeters) || o.heightMeters <= 0) {
    throw new Error('options.heightMeters 需为正数（米）')
  }
  if (
    o.canvasHeightPx !== undefined &&
    (typeof o.canvasHeightPx !== 'number' || !Number.isFinite(o.canvasHeightPx) || o.canvasHeightPx <= 0)
  ) {
    throw new Error('options.canvasHeightPx 需为正数（像素）')
  }
  if (
    o.canvasWidthPx !== undefined &&
    (typeof o.canvasWidthPx !== 'number' || !Number.isFinite(o.canvasWidthPx) || o.canvasWidthPx <= 0)
  ) {
    throw new Error('options.canvasWidthPx 需为正数（像素）')
  }
  const options: ModelOptions = {
    mode: o.mode,
    shape: o.shape,
    size: o.size as number,
    count: o.count as number,
    heightMeters: o.heightMeters as number
  }
  if (o.canvasHeightPx !== undefined) options.canvasHeightPx = o.canvasHeightPx as number
  if (o.canvasWidthPx !== undefined) options.canvasWidthPx = o.canvasWidthPx as number
  // 四期语义校验（PRD §5.2）：非封闭 solid / 高度 ≤ 0 / 不支持的轮廓 → 400。
  // 前置到解析期：调用方（web/server.ts、api/draw-model.ts）在 writeHead(200) 之后才调
  // drawModelResult，若让生成期抛错，catch 补 writeHead(400) 会撞 ERR_HTTP_HEADERS_SENT
  // 使进程崩溃（现存顺序缺陷，web/** api/** 禁止改动），故此处先跑一遍纯函数生成。
  validateDrawSemantics(parsed, options)
  return { strokes: parsed, options }
}

/**
 * 四期语义校验：render='solid' 非封闭轮廓 / 柱体高度 ≤ 0 / 不支持的轮廓形状。
 * 纯函数：非法输入抛中文 Error（调用方转 400），合法输入无副作用。
 */
export function validateDrawSemantics(strokes: readonly Stroke[], options: ModelOptions): void {
  generateModel(strokes as Stroke[], options)
}

/** /api/draw-model 出参：已拍平 items + 逐笔拟合曲线（画布像素）+ 封闭检测。 */
export type DrawModelResult = {
  items: StructureItem[]
  strokeItemCounts: number[]
  /** 与入参 strokes 按序一一对应；退化笔画（<2 点）为 null。 */
  fitted: (FittedStroke | null)[]
  closed: boolean[]
  /** 十一期：物理合理性提示——旋转组（group 非空）扫掠盘与静止件空间重叠等。 */
  warnings: string[]
}

/**
 * 生成画线模型（本地 server.ts 与 Vercel api/draw.ts 共用）。
 * 采样点数与 generateModel 内部一致：extrude=count+1（段数=count），lathe=count（盘片层数）；
 * extrude 封闭平滑轮廓同样保留细节（与 generateModel 的 keepClosedDetail 一致）。
 */
export function drawModelResult(strokes: Stroke[], options: ModelOptions): DrawModelResult {
  const { items: tagged, closed, strokeItemCounts } = generateModel(strokes, options)
  const sampleCount =
    options.mode === 'extrude' ? Math.max(1, Math.floor(options.count)) + 1 : Math.max(1, Math.floor(options.count))
  const fitted: (FittedStroke | null)[] = strokes.map((s) =>
    fitStroke(s, sampleCount, { keepClosedDetail: options.mode === 'extrude' })
  )
  return { items: toStructureItems(tagged), fitted, closed, strokeItemCounts, warnings: sweepWarnings(strokes, tagged) }
}

/**
 * 十一期：旋转组 vs 静止件扫掠冲突检测（自然发现物理不合理）。
 *
 * 模型：组（group 非空）内取“水平半径最大”的 item 作为扫掠盘（风扇叶片）——
 * 盘 = 圆心（组内位置平均）+ 半径 R（该 item 到圆心水平距离 + 水平半轴）；
 * 盘厚度 = 该 item 的 z 半轴（min(scale)/2，front/side 件的厚度/细轴沿 Z）。
 * 静止件（无组）用 AABB（position ± scale/2）近似，z 半轴同样取 min(scale)/2。
 * 若静止件 z 范围与盘厚重叠、且其水平 AABB 与圆相交 → 旋转时会发生碰撞，报 warning。
 * 注：近似提示器（忽略 rotation 对 AABB 的影响），只求抓住明显共面/穿插，不做裁决。
 */
export function sweepWarnings(strokes: Stroke[], items: TaggedItem[]): string[] {
  const idxById = new Map<string, number>()
  strokes.forEach((s, i) => idxById.set(s.id, i))
  const groupOfStroke = new Map<string, string | undefined>()
  strokes.forEach((s) => groupOfStroke.set(s.id, s.group))
  // 组（group 非空笔画）→ 组内 items；其余为静止件
  const groups = new Map<string, TaggedItem[]>()
  const staticItems: TaggedItem[] = []
  for (const it of items) {
    const g = groupOfStroke.get(it.group)
    if (g) {
      const arr = groups.get(g)
      if (arr) arr.push(it)
      else groups.set(g, [it])
    } else {
      staticItems.push(it)
    }
  }
  const warnings: string[] = []
  for (const [g, members] of groups) {
    // 组旋转中心 ≈ 组内 item 位置平均
    let cxp = 0, cyp = 0
    for (const it of members) { cxp += it.position[0]; cyp += it.position[1] }
    cxp /= members.length; cyp /= members.length
    // 扫掠盘：水平半径最大的 item（风扇叶片）
    let diskR = 0
    let diskZ = 0
    let diskHalf = 0
    for (const it of members) {
      const hz = Math.hypot(it.position[0] - cxp, it.position[1] - cyp) + Math.max(it.scale[0], it.scale[1]) / 2
      if (hz > diskR) {
        diskR = hz
        diskZ = it.position[2]
        diskHalf = Math.min(it.scale[0], it.scale[1], it.scale[2]) / 2 // 厚度/细轴沿 Z 的近似
      }
    }
    const dz0 = diskZ - diskHalf
    const dz1 = diskZ + diskHalf
    const seen = new Set<string>()
    for (const it of staticItems) {
      const s = Math.min(it.scale[0], it.scale[1], it.scale[2]) / 2
      if (it.position[2] + s < dz0 || it.position[2] - s > dz1) continue // z 不重叠
      // 水平 AABB（position ± scale/2，忽略 rotation 的近似）与圆的最短距离
      const hx = it.scale[0] / 2, hy = it.scale[1] / 2
      const dx = Math.max(0, Math.max(it.position[0] - hx - cxp, cxp - (it.position[0] + hx)))
      const dy = Math.max(0, Math.max(it.position[1] - hy - cyp, cyp - (it.position[1] + hy)))
      if (Math.hypot(dx, dy) >= diskR + 0.005) continue
      if (seen.has(it.group)) continue
      seen.add(it.group)
      warnings.push(
        `旋转组「${g}」的扫掠盘与静止笔画 #${idxById.get(it.group)} 空间重叠（组旋转时会碰撞）：` +
        `把静止件移出该平面（如 transform.position[2] 前后偏移），或将其并入旋转组`
      )
    }
  }
  return warnings
}

export const DOCS_FILES: Record<string, string> = {
  'README.md': join(process.cwd(), 'README.md'),
  'docs/input-format.md': join(process.cwd(), 'docs', 'input-format.md'),
  'docs/gia-format.md': join(process.cwd(), 'docs', 'gia-format.md'),
}

export function listExamples(): string[] {
  return readdirSync(EXAMPLES)
    .filter((f) => extname(f) === '.json' && !f.includes('.structure.') && !f.includes('.summary.'))
    .sort()
}

/** 真实 item 数：GIA 嵌套格式（model.items）与扁平 structure 格式（items）都支持。 */
export function countItems(data: any): number {
  if (data && Array.isArray(data.model?.items)) return data.model.items.length
  if (data && Array.isArray(data.items)) return data.items.length
  return 0
}

/**
 * 把输入补全成 GIA 编码器要求的输入（id/unitId/filePath）。支持两种格式：
 * - GIA 嵌套格式（examples/football.json、examples/equiangular-spiral.json）：
 *   { schemaVersion, model: { name, unitId, templatePrefabId, rootTransform, items[] }, file }
 * - 扁平 structure 格式（examples/house.json 等）：
 *   { name, prefabId, templatePrefabId, position, rotation, scale, items[], filePath }
 *
 * 缩放参数（用户需求 2026-09-09，网页「主模型缩放 / 整体缩放率」）：
 *   传了 data.rootScale 或 data.overallScale 时启用共享 root 语义（src/cli/gia-common.ts）——
 *   rootTransform.scale = 主模型缩放 S × 整体缩放率 K，item position/scale 均 ÷S。
 *   不传时保持历史行为（用 rootTransform.scale / data.scale，缺省 [1,1,1]，item 原样）。
 */
export function toGiaInput(data: any) {
  const model = data.model ?? {}
  const rawItems = Array.isArray(model.items) ? model.items : data.items ?? []
  const scaleOpts =
    typeof data.rootScale === 'number' || typeof data.overallScale === 'number'
      ? resolveGiaScale({ rootScale: data.rootScale, overallScale: data.overallScale })
      : null
  const items = rawItems.map((it: any, i: number) => ({
    id: it.id ?? 1073741824 + i + 1,
    resourceId: it.resourceId,
    name: it.name ?? `装饰物_${i + 1}`,
    position: (it.position ?? [0, 0, 0]).map((v: number) => (scaleOpts ? v / scaleOpts.rootScale : v)),
    rotation: it.rotation ?? [0, 0, 0],
    scale: (it.scale ?? [1, 1, 1]).map((v: number) => (scaleOpts ? v / scaleOpts.rootScale : v)),
    color: it.color,
  }))
  const name = model.name || data.name || 'model'
  const rootTransform = model.rootTransform ?? {}
  return {
    schemaVersion: data.schemaVersion ?? 1,
    model: {
      name,
      unitId: model.unitId ?? data.prefabId ?? 1077936129,
      templatePrefabId: model.templatePrefabId ?? data.templatePrefabId ?? 10005018,
      rootTransform: {
        position: rootTransform.position ?? data.position ?? [0, 0, 0],
        rotation: rootTransform.rotation ?? data.rotation ?? [0, 0, 0],
        scale: scaleOpts
          ? [scaleOpts.rootTransformScale, scaleOpts.rootTransformScale, scaleOpts.rootTransformScale]
          : rootTransform.scale ?? data.scale ?? [1, 1, 1],
      },
      items,
    },
    file: {
      filePath: data.file?.filePath ?? data.filePath ?? `{UID}-{TIME}-{LEVEL_ID}-${name}.gia`,
      gameVersion: data.file?.gameVersion ?? '6.7.0',
    },
  }
}

/** Content-Disposition 头只允许可打印 ASCII：非 ASCII 文件名用 RFC 5987 filename* 携带。 */
export function attachmentName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'model'
  const encoded = encodeURIComponent(name).replace(/'/g, '%27')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

/* ============================ 最小 Markdown 渲染器（零依赖） ============================ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_m, code: string) => `<code>${escapeHtml(code)}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
      const clean = url.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      const safe = /^(https?:)?\/\//.test(clean) || clean.startsWith('#') || !/^[a-z][a-z0-9+.-]*:/i.test(clean)
      return safe ? `<a href="${escapeHtml(clean)}">${label}</a>` : escapeHtml(label)
    })
}

function tableRow(line: string, header: boolean): string {
  const cells = line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())
  const tag = header ? 'th' : 'td'
  return `<tr>${cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`
}

function isTableSeparator(line: string): boolean {
  return /^\|?[\s:|-]+\|?$/.test(line.trim()) && line.includes('-') && line.trim().replace(/[\s|:-]/g, '') === ''
}

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // 围栏代码块 ```lang ... ```
    const fence = line.match(/^```(\S*)\s*$/)
    if (fence) {
      const lang = fence[1]
      const code: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(escapeHtml(lines[i]))
        i++
      }
      i++ // 跳过闭合围栏
      out.push(`<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${code.join('\n')}</code></pre>`)
      continue
    }

    // 表格：连续的 | 行，且第二行是分隔行
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = tableRow(line, true)
      i += 2
      const rows: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(tableRow(lines[i], false))
        i++
      }
      out.push(`<table><thead>${header}</thead><tbody>${rows.join('')}</tbody></table>`)
      continue
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      i++
      continue
    }

    // 引用块
    if (line.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) {
        quote.push(inline(lines[i].replace(/^>\s?/, '')))
        i++
      }
      out.push(`<blockquote>${quote.join('<br>')}</blockquote>`)
      continue
    }

    // 分隔线
    if (/^\s*---+\s*$/.test(line)) {
      out.push('<hr>')
      i++
      continue
    }

    // 列表（简单支持：- / * 无序项）
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`)
        i++
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    // 普通段落
    if (line.trim() !== '') {
      const para: string[] = []
      while (i < lines.length && lines[i].trim() !== '' && !/^```/.test(lines[i])) {
        const l = lines[i]
        if (/^(#{1,6})\s+/.test(l) || l.trim().startsWith('|') || /^\s*[-*]\s+/.test(l)) break
        para.push(inline(l))
        i++
      }
      out.push(`<p>${para.join(' ')}</p>`)
      continue
    }

    i++
  }
  return out.join('\n')
}

export function docsPage(fileKey: string): string {
  const file = DOCS_FILES[fileKey] ?? DOCS_FILES['README.md']
  const source = readFileSync(file, 'utf8')
  const title = fileKey.replace(/\.md$/, '').replace(/^docs\//, '')
  const body = renderMarkdown(source)
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} — Genshin Model Studio</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: #222; line-height: 1.6; }
  pre { background: #f5f5f5; padding: 0.8rem; overflow-x: auto; border-radius: 4px; }
  code { background: #f5f5f5; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.9em; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; margin: 1rem 0; }
  th, td { border: 1px solid #ccc; padding: 0.35rem 0.7rem; text-align: left; }
  blockquote { border-left: 3px solid #ccc; margin: 1rem 0; padding: 0 0.8rem; color: #555; }
  a { color: #0366d6; }
  .back { margin: 1rem 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1.5rem 0; }
</style>
</head>
<body>
<div class="back"><a href="/">&larr; 返回编辑器</a></div>
${body}
</body>
</html>`
}

/** 枚举示例元数据（示例列表用） */
export function exampleMeta(): { name: string; file: string; size: number; items: number }[] {
  return listExamples().map((f) => {
    const p = join(EXAMPLES, f)
    const size = statSync(p).size
    const data = JSON.parse(readFileSync(p, 'utf8')) as any
    return { name: basename(f, '.json'), file: f, size, items: countItems(data) }
  })
}

/* ==================== 三期：结构健康校验 /api/validate-model 共享逻辑 ==================== */

/**
 * 校验并解析 /api/validate-model 请求体；非法时抛出中文 Error（调用方转 400）。
 * 入参契约：{ structure: <structure.json 超集>, repair?: boolean }
 * 输出：{ ok, violations[], fixes[], unresolved[], items }——确定性诊断，模型不可见。
 * 论文范式（ADR-0003 提案 b）：生成后跑不变量校验并自动修复，修复不了的如实报告。
 */
export function validateModelResult(body: string): HealthReport & { parseOk: true } {
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('请求体需为 { structure, repair } 对象')
  }
  const src = data as { structure?: unknown; repair?: unknown }
  if (src.structure === undefined) throw new Error('缺少 structure 字段（structure.json 超集）')
  const structure = resolveStructure(src.structure)
  const repair = src.repair === true
  const report = checkStructure(structure.items, repair)
  return { ...report, parseOk: true }
}
