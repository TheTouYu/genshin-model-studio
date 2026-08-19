/**
 * benchmark 解析器：从模型输出文本中提取 structure.json 超集。
 *
 * 容错（论文解析器教训：过严会误杀合法输出，如 JSON 对象格式/代码块围栏/多余文字）：
 * - 去掉 markdown 代码块围栏；
 * - 花括号配平扫描提取 JSON 对象；
 * - 容忍尾逗号（模型常见产物）；
 * - 缺 name 补默认；items 为空允许（评分交给校验器记 0 分）。
 * 其余字段仍走 src/core/structure.ts 的 fail-closed 校验（数据契约不可放宽）。
 */
import type { ResolvedStructure } from '../core/structure.js'
import { DEFAULT_PREFAB_ID, EMPTY_MODEL_RESOURCE_ID, resolveStructure } from '../core/structure.js'
// 空模型模板名（structure.ts 内部常量，未导出；此处与官方资源 ID 对应）
const EMPTY_MODEL_NAME = '空模型'

export type ParseResult =
  | { ok: true; structure: ResolvedStructure }
  | { ok: false; reason: string }

function stripFences(text: string): string {
  return text.replace(/```[a-zA-Z]*\s*/g, '').replace(/```/g, '')
}

/** 花括号配平：找到第一个 '{'，返回配平后的子串（含嵌套与字符串字面量保护）。 */
function extractBalancedObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** 容忍尾逗号：",}" 与 ",]" → "}" 与 "]"（仅当先前解析失败时使用）。 */
function fixTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, '$1')
}

function tryParse(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** 缺 name 补默认；items 为空时手工构造（resolveStructure 要求 items ≥ 1）。 */
function resolveLenient(source: Record<string, unknown>): ResolvedStructure {
  const withName = typeof source.name === 'string' && source.name !== '' ? source : { ...source, name: 'benchmark' }
  if (!Array.isArray(withName.items) || (withName.items as unknown[]).length === 0) {
    const resolved = resolveStructure({
      ...withName,
      items: [{ resourceId: 10009001, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }]
    })
    return {
      ...resolved,
      template: EMPTY_MODEL_NAME,
      templatePrefabId: EMPTY_MODEL_RESOURCE_ID,
      templateInstanceId: EMPTY_MODEL_RESOURCE_ID,
      prefabId: DEFAULT_PREFAB_ID,
      definitionAuxiliaryIds: [],
      instanceAuxiliaryIds: [],
      items: []
    }
  }
  return resolveStructure(withName)
}

/** 从模型输出文本解析 structure.json 超集；全部候选失败返回原因。 */
export function parseStructureOutput(text: string): ParseResult {
  const candidates: string[] = []
  const noFence = stripFences(text).trim()
  candidates.push(noFence)
  const balanced = extractBalancedObject(noFence)
  if (balanced !== null && balanced !== noFence) candidates.push(balanced)
  candidates.push(fixTrailingCommas(noFence))
  if (balanced !== null) candidates.push(fixTrailingCommas(balanced))

  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue
    seen.add(candidate)
    const parsed = tryParse(candidate)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue
    try {
      return { ok: true, structure: resolveLenient(parsed as Record<string, unknown>) }
    } catch (error) {
      return { ok: false, reason: `字段校验失败：${(error as Error).message}` }
    }
  }
  return { ok: false, reason: '未找到合法 JSON 对象（structure.json 超集）' }
}
