/**
 * 最小回读：从 .gil 候选解析静态元件闭包（身份/Transform/装饰物/颜色）。
 *
 * 抽取自 genshin-ts（MIT）`src/cli/static_assembly/export.ts` 与
 * `src/cli/static_assembly/map_index.ts` 的只读语义，用于：
 * - 编码后自检（候选与输入一致）；
 * - 闭包正确性证明（def/inst/aux 数量、packed 引用闭合）。
 */
import { parseGilFile } from './binary.js'
import {
  collectWireVarints,
  nthWireField,
  packedWireIds,
  parseWireMessage as parse,
  printableWireText as printable,
  wireRecordId as recordId,
  wireRecords as records,
  type WireField
} from './wire.js'
import type { ItemColor } from './structure.js'

export type ReadBackItem = {
  resourceId: number
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: readonly [number, number, number]
  color?: ItemColor
}

export type ReadBackAssembly = {
  name: string
  prefabId: number
  /** 模板资源 ID：主定义记录 field 2（如空模型 10005018）。 */
  templateResourceId: number
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: readonly [number, number, number]
  items: readonly ReadBackItem[]
}

export type ClosureSummary = {
  definitions: number
  instances: number
  definitionAuxiliaries: number
  instanceAuxiliaries: number
  ownerRegistryIds: readonly number[]
  complete: boolean
}

function firstVarint(fields: readonly WireField[] | undefined, number: number): number | undefined {
  const field = fields?.find((item) => item.number === number && item.wire === 0)
  return typeof field?.value === 'number' ? field.value : undefined
}

function floatVector(data: Uint8Array): [number, number, number] {
  const values = [0, 0, 0]
  for (const field of parse(data) ?? []) {
    if (field.wire === 5 && field.number >= 1 && field.number <= 3) {
      values[field.number - 1] = Buffer.from(field.value as Uint8Array).readFloatLE(0)
    }
  }
  return values as [number, number, number]
}

function transformOwner(record: Uint8Array, ownerFieldNumber: number): Uint8Array | undefined {
  const fields = parse(record)
  if (!fields) return undefined
  const owner = fields.find(
    (field) =>
      field.wire === 2 &&
      field.number === ownerFieldNumber &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 1
      )
  )
  return owner?.value as Uint8Array | undefined
}

function readTransform(record: Uint8Array, ownerFieldNumber: number): {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
} {
  const owner = transformOwner(record, ownerFieldNumber)
  if (!owner) return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
  const ownerFields = parse(owner)
  const transform = ownerFields?.find((field) => field.number === 11 && field.wire === 2)
  if (!transform) return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
  const transformFields = parse(transform.value as Uint8Array)
  const position = transformFields?.find((field) => field.number === 1 && field.wire === 2)
  const rotation = transformFields?.find((field) => field.number === 2 && field.wire === 2)
  const scale = transformFields?.find((field) => field.number === 3 && field.wire === 2)
  return {
    position: position ? floatVector(position.value as Uint8Array) : [0, 0, 0],
    rotation: rotation ? floatVector(rotation.value as Uint8Array) : [0, 0, 0],
    scale: scale ? floatVector(scale.value as Uint8Array) : [1, 1, 1]
  }
}

function readColor(record: Uint8Array): ItemColor | undefined {
  for (const field of parse(record) ?? []) {
    if (field.wire !== 2 || field.number !== 5) continue
    const entry = parse(field.value as Uint8Array)
    if (!entry) continue
    if (firstVarint(entry, 1) !== 22) continue
    const config = entry.find((item) => item.number === 32 && item.wire === 2)
    if (!config) continue
    const color = parse(config.value as Uint8Array)
    if (!color) continue
    if (!color.some((item) => item.number === 1 && item.wire === 0 && item.value === 1)) {
      return { enabled: false }
    }
    const rgb = firstVarint(color, 5)
    const opacity = color.find((item) => item.number === 4 && item.wire === 5)
    const overlay = firstVarint(color, 6)
    if (rgb === undefined || !opacity) continue
    return {
      enabled: true,
      rgb,
      opacity: Buffer.from(opacity.value as Uint8Array).readFloatLE(0),
      overlay: overlay === 6701 ? 'multiply' : 'overwrite'
    }
  }
  return undefined
}

function definitionName(record: Uint8Array): string | undefined {
  const f6 = parse(record)?.find((field) => field.number === 6 && field.wire === 2)
  if (!f6) return undefined
  const f11 = parse(f6.value as Uint8Array)?.find((field) => field.number === 11 && field.wire === 2)
  if (!f11) return undefined
  const name = parse(f11.value as Uint8Array)?.find(
    (field) => field.number === 1 && field.wire === 2
  )
  return name ? printable(name.value as Uint8Array) : undefined
}

/** 回读全部静态元件闭包（与 genshin-ts exportStaticAssemblies 同构）。 */
export function readBackAssemblies(bytes: Uint8Array): ReadBackAssembly[] {
  const { payload } = parseGilFile(bytes)
  const top = parse(payload)
  if (!top) throw new Error('[error] malformed GIL payload')
  const definitions = records(top, 4, 1)
  const instances = records(top, 8, 1)
  const auxiliaryById = new Map<number, Uint8Array>()
  for (const record of [...records(top, 27, 1), ...records(top, 27, 2)]) {
    const id = recordId(record)
    if (id !== undefined) auxiliaryById.set(id, record)
  }
  const result: ReadBackAssembly[] = []
  for (const definition of definitions) {
    const prefabId = recordId(definition)
    if (prefabId === undefined) continue
    let packed: number[] = []
    try {
      packed = packedWireIds(definition)
    } catch {
      // Definitions without a packed field 501 have no decoration items.
    }
    if (!packed.length) continue
    const name = definitionName(definition)
    const templateResourceId = firstVarint(parse(definition), 2)
    if (!name || templateResourceId === undefined) continue
    const instance = instances.find((record) => recordId(record) === prefabId)
    if (!instance) continue
    const main = readTransform(instance, 6)
    const items: ReadBackItem[] = []
    for (const auxiliaryId of packed) {
      const auxiliary = auxiliaryById.get(auxiliaryId)
      if (!auxiliary) throw new Error(`[error] missing auxiliary record ${auxiliaryId}`)
      const itemResource = firstVarint(parse(auxiliary), 2)
      if (itemResource === undefined)
        throw new Error(`[error] auxiliary record ${auxiliaryId} has no resource ID`)
      const transform = readTransform(auxiliary, 5)
      const color = readColor(auxiliary)
      items.push({ resourceId: itemResource, ...transform, ...(color ? { color } : {}) })
    }
    result.push({ name, prefabId, templateResourceId, ...main, items })
  }
  return result.sort((a, b) => a.prefabId - b.prefabId)
}

/** 闭包摘要：def/inst/aux 计数 + owner 登记，用于闭包完整性证明。 */
export function closureSummary(bytes: Uint8Array): ClosureSummary {
  const { payload } = parseGilFile(bytes)
  const top = parse(payload)
  if (!top) throw new Error('[error] malformed GIL payload')
  const definitions = records(top, 4, 1)
  const instances = records(top, 8, 1)
  const definitionAuxiliaries = records(top, 27, 1)
  const instanceAuxiliaries = records(top, 27, 2)
  const root6 = nthWireField(top, 6)
  const ownerRegistryIds = [...new Set(collectWireVarints(root6.value as Uint8Array))].sort(
    (a, b) => a - b
  )
  const definitionId = recordId(definitions[0])
  const complete =
    definitions.length === 1 &&
    instances.length === 1 &&
    definitionAuxiliaries.length === instanceAuxiliaries.length &&
    definitionId !== undefined &&
    ownerRegistryIds.includes(definitionId)
  return {
    definitions: definitions.length,
    instances: instances.length,
    definitionAuxiliaries: definitionAuxiliaries.length,
    instanceAuxiliaries: instanceAuxiliaries.length,
    ownerRegistryIds,
    complete
  }
}
