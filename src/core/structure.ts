/**
 * 输入格式（structure.json 超集，PRD §6）的解析、校验与规范化。
 *
 * 字段规则对齐 genshin-ts（MIT）`src/cli/static_assembly_structure.ts`：
 * - item 白名单：resourceId / position / rotation / scale / color
 * - color：{enabled:true, rgb:0xRRGGBB, opacity:0-100, overlay:'overwrite'|'multiply'}
 *   或 {enabled:false}
 * - 自定义元件 prefabId 必须 ≥ 0x40400001（1077936129）——游戏/编辑器只认该区间，
 *   0x4000xxxx 区间的元件加载时被整体丢弃（2026-08-09 R4 空图根因，已闭合）；
 *   aux ID 无此限制，但不得落在骨架占位 ID（RESERVED_SKELETON_IDS）上。
 *
 * 一期未覆盖（显式报错，不静默忽略）：components、assembly 级 color、非官方资源 item。
 */
import fs from 'node:fs'
import { isOfficialResourceId, officialPrefabName, RESERVED_SKELETON_IDS } from './official-resources.js'

export type ItemColor =
  | { enabled: true; rgb: number; opacity: number; overlay: 'overwrite' | 'multiply' }
  | { enabled: false }

export type StructureItem = {
  resourceId: number
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: readonly [number, number, number]
  color?: ItemColor
  /** 网格（10009019）：世界坐标顶点 + 三角面索引 + 逐面颜色。 */
  vertices?: number[][]
  faces?: number[]
  colors?: string[]
}

export type ResolvedStructure = {
  schemaVersion: 1
  name: string
  template: string
  templatePrefabId: number
  templateInstanceId: number
  prefabId: number
  definitionAuxiliaryIds: readonly number[]
  instanceAuxiliaryIds: readonly number[]
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: readonly [number, number, number]
  items: readonly StructureItem[]
}

/** 自定义元件 ID 区间下限：0x40400001（游戏只认 0x40400000 区间）。 */
export const MIN_CUSTOM_PREFAB_ID = 1077936129
/** 默认 prefabId（多模型写同一地图时需显式分配，由写回适配器做占用检查）。 */
export const DEFAULT_PREFAB_ID = 1077936129
/** 默认 aux ID 起点：0x4000xxxx 区间（aux 无区间限制），避开骨架占位 1073741828/29。 */
export const DEFAULT_AUX_BASE = 1073741830
/** 一期只支持空模型宿主模板。 */
export const EMPTY_MODEL_RESOURCE_ID = 10005018
const EMPTY_MODEL_NAME = '空模型'

type JsonObject = Record<string, unknown>

function fail(field: string, message: string): never {
  throw new Error(`[error] structure.${field} ${message}`)
}

function object(field: string, value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(field, 'must be an object')
  }
  return value as JsonObject
}

function exactFields(field: string, value: JsonObject, allowed: readonly string[]): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key))
  if (unknown !== undefined) fail(field ? `${field}.${unknown}` : unknown, 'is an unknown field')
}

function finiteNumber(field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(field, 'must be a finite number')
  return value
}

function vector(
  field: string,
  value: unknown
): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    fail(field, 'must contain exactly three finite numbers')
  }
  return [
    finiteNumber(`${field}[0]`, value[0]),
    finiteNumber(`${field}[1]`, value[1]),
    finiteNumber(`${field}[2]`, value[2])
  ]
}

function color(field: string, value: unknown): ItemColor {
  const source = object(field, value)
  if (source.enabled === false) {
    exactFields(field, source, ['enabled'])
    return { enabled: false }
  }
  exactFields(field, source, ['enabled', 'rgb', 'opacity', 'overlay'])
  if (source.enabled !== true) fail(`${field}.enabled`, 'must be true or false')
  // rgb 支持整数（0xRRGGBB 十进制）或 "0xRRGGBB" 字符串（JSON 无十六进制字面量）。
  let rgb: number
  if (typeof source.rgb === 'string' && /^0x[0-9a-fA-F]{1,6}$/.test(source.rgb)) {
    rgb = Number.parseInt(source.rgb.slice(2), 16)
  } else {
    rgb = source.rgb as number
  }
  if (!Number.isInteger(rgb) || rgb < 0 || rgb > 0xffffff) {
    fail(
      `${field}.rgb`,
      'must be an integer from 0x000000 to 0xFFFFFF, or a "0xRRGGBB" hex string'
    )
  }
  const opacity = finiteNumber(`${field}.opacity`, source.opacity)
  if (opacity < 0 || opacity > 100) fail(`${field}.opacity`, 'must be from 0 to 100')
  if (source.overlay !== 'overwrite' && source.overlay !== 'multiply') {
    fail(`${field}.overlay`, 'must be overwrite or multiply')
  }
  return {
    enabled: true,
    rgb,
    opacity,
    overlay: source.overlay
  }
}

function item(field: string, value: unknown): StructureItem {
  const source = object(field, value)
  exactFields(field, source, ['resourceId', 'position', 'rotation', 'scale', 'color'])
  if (!Number.isSafeInteger(source.resourceId) || (source.resourceId as number) < 0) {
    fail(`${field}.resourceId`, 'must be a non-negative safe integer')
  }
  if (!isOfficialResourceId(source.resourceId as number)) {
    fail(
      `${field}.resourceId`,
      `${source.resourceId} is not an official base resource ID; ` +
        'phase 1 only supports official base resources ([1e7, 1e9)); ' +
        'custom element references are not covered yet'
    )
  }
  return {
    resourceId: source.resourceId as number,
    position: vector(`${field}.position`, source.position),
    ...(source.rotation === undefined
      ? { rotation: [0, 0, 0] as const }
      : { rotation: vector(`${field}.rotation`, source.rotation) }),
    ...(source.scale === undefined
      ? { scale: [1, 1, 1] as const }
      : { scale: vector(`${field}.scale`, source.scale) }),
    ...(source.color === undefined ? {} : { color: color(`${field}.color`, source.color) })
  }
}

function resolveTemplate(value: unknown): {
  template: string
  templatePrefabId: number
  templateInstanceId: number
} {
  if (value === undefined) {
    return { template: EMPTY_MODEL_NAME, templatePrefabId: EMPTY_MODEL_RESOURCE_ID, templateInstanceId: EMPTY_MODEL_RESOURCE_ID }
  }
  if (typeof value === 'number') {
    if (!isOfficialResourceId(value)) {
      fail('template', `template resource ID ${value} is not official ([1e7, 1e9))`)
    }
    const name = officialPrefabName(value)
    if (value !== EMPTY_MODEL_RESOURCE_ID && name === undefined) {
      fail('template', `unknown official template resource ID ${value}`)
    }
    return {
      template: name ?? EMPTY_MODEL_NAME,
      templatePrefabId: value,
      templateInstanceId: value
    }
  }
  if (typeof value === 'string') {
    if (value !== EMPTY_MODEL_NAME) {
      fail('template', `phase 1 only supports template "${EMPTY_MODEL_NAME}" (10005018)`)
    }
    return {
      template: EMPTY_MODEL_NAME,
      templatePrefabId: EMPTY_MODEL_RESOURCE_ID,
      templateInstanceId: EMPTY_MODEL_RESOURCE_ID
    }
  }
  fail('template', 'must be a string template name or an official resource ID')
}

function resolveAuxiliaryIds(
  field: string,
  value: unknown,
  count: number,
  side: (index: number) => number
): readonly number[] {
  if (value === undefined) {
    return Array.from({ length: count }, (_, index) => side(index))
  }
  if (!Array.isArray(value) || value.length !== count) {
    fail(field, `must be an array of ${count} non-negative safe integers`)
  }
  return value.map((entry, index) => {
    if (!Number.isSafeInteger(entry) || (entry as number) < 0) {
      fail(`${field}[${index}]`, 'must be a non-negative safe integer')
    }
    return entry as number
  })
}

/** 解析并规范化输入；所有缺省字段补默认值，非法输入抛错（fail-closed）。 */
export function resolveStructure(source: unknown): ResolvedStructure {
  const root = object('', source)
  exactFields('', root, [
    '$schema',
    'schemaVersion',
    'name',
    'template',
    'prefabId',
    'definitionAuxiliaryIds',
    'instanceAuxiliaryIds',
    'position',
    'rotation',
    'scale',
    'color',
    'components',
    'items'
  ])
  if (root.$schema !== undefined && typeof root.$schema !== 'string') {
    fail('$schema', 'must be a string')
  }
  if (root.schemaVersion !== undefined && root.schemaVersion !== 1) {
    fail('schemaVersion', 'must be 1')
  }
  if (root.components !== undefined) {
    fail('components', 'is not covered in phase 1 (followMotion/basicMotion/tabBar)')
  }
  if (root.color !== undefined) {
    fail(
      'color',
      'assembly-level color is not covered in phase 1; use per-item color instead'
    )
  }
  if (typeof root.name !== 'string' || !root.name) fail('name', 'must be a non-empty string')
  const name = root.name as string
  const template = resolveTemplate(root.template)
  if (!Array.isArray(root.items) || root.items.length === 0) {
    fail('items', 'must contain at least one item')
  }
  const items = (root.items as unknown[]).map((value, index) => item(`items[${index}]`, value))
  let prefabId = DEFAULT_PREFAB_ID
  if (root.prefabId !== undefined) {
    if (!Number.isSafeInteger(root.prefabId) || (root.prefabId as number) < 0) {
      fail('prefabId', 'must be a non-negative safe integer')
    }
    prefabId = root.prefabId as number
  }
  if (prefabId < MIN_CUSTOM_PREFAB_ID) {
    fail(
      'prefabId',
      `${prefabId} is below the custom prefab ID range (>= ${MIN_CUSTOM_PREFAB_ID}, 0x40400000); ` +
        'such prefabs are dropped by the game and the map opens empty'
    )
  }
  const definitionAuxiliaryIds = resolveAuxiliaryIds(
    'definitionAuxiliaryIds',
    root.definitionAuxiliaryIds,
    items.length,
    (index) => DEFAULT_AUX_BASE + 2 * index
  )
  const instanceAuxiliaryIds = resolveAuxiliaryIds(
    'instanceAuxiliaryIds',
    root.instanceAuxiliaryIds,
    items.length,
    (index) => DEFAULT_AUX_BASE + 2 * index + 1
  )
  const allIds = [...definitionAuxiliaryIds, ...instanceAuxiliaryIds]
  const duplicates = allIds.filter((id, index) => allIds.indexOf(id) !== index)
  if (duplicates.length) {
    fail('auxiliaryIds', `duplicate aux IDs: ${[...new Set(duplicates)].join(', ')}`)
  }
  if (allIds.includes(prefabId)) {
    fail('auxiliaryIds', `aux ID must not equal prefabId ${prefabId}`)
  }
  for (const id of allIds) {
    if (RESERVED_SKELETON_IDS.includes(id)) {
      fail(
        'auxiliaryIds',
        `aux ID ${id} is a reserved skeleton placeholder ID and would be corrupted by ` +
          `template replacement; pick another ID (see docs/input-format.md)`
      )
    }
  }
  return {
    schemaVersion: 1,
    name,
    ...template,
    prefabId,
    definitionAuxiliaryIds,
    instanceAuxiliaryIds,
    position: root.position === undefined ? [0, 0, 0] : vector('position', root.position),
    rotation: root.rotation === undefined ? [0, 0, 0] : vector('rotation', root.rotation),
    scale: root.scale === undefined ? [1, 1, 1] : vector('scale', root.scale),
    items
  }
}

/** 读取并解析输入 JSON 文件。 */
export function loadStructureFile(filePath: string): ResolvedStructure {
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    const detail =
      error instanceof SyntaxError ? 'invalid JSON' : `cannot be read: ${String(error)}`
    throw new Error(`[error] structure ${filePath}: ${detail}`)
  }
  return resolveStructure(parsed)
}
