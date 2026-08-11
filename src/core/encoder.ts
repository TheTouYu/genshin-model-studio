/**
 * 编码器：structure.json 超集 → .gil 候选（只编码，不写回真实地图）。
 *
 * 候选 = 最小新地图骨架（maps:create 同构：root 1/2/34/39/40/41 + 空 4/8/27
 * + 最小 root 6/10 容器）+ 静态元件闭包（root 4 定义 + root 8 实例 + root 27
 * 双侧装饰物 + root 6 页签登记）。编码步骤与 genshin-ts（MIT）
 * `src/cli/gil_static_assemblies.ts` 的官方模板分支逐一对齐：
 *   buildCustomDefinitionRecord / buildOfficialPrefabRecord / buildAuxiliaryRecord
 *   → addPackedIds / setInstanceDefinition / setColor / registerPrefab → buildFile。
 *
 * 确定性：相同输入必得相同字节（无时间戳、无随机数；占位 mapId/playerId 固定）。
 */
import { buildFile, encodeVarint } from './binary.js'
import {
  emitWireMessage as emit,
  nthWireField as nth,
  parseWireMessage as parse,
  wireMessage as message,
  type WireField
} from './wire.js'
import {
  buildAuxiliaryRecord,
  buildCustomDefinitionRecord,
  buildOfficialPrefabRecord,
  resolveItemResourceId,
  type PrefabTransform
} from './official-resources.js'
import type { ItemColor, ResolvedStructure } from './structure.js'

/** 候选文件头（与 maps:create 新建地图一致，真实编辑器观察：schema 1 / 0x0326 / 2 / 0x0679）。 */
export const CANDIDATE_HEADER = { schema: 1, headTag: 0x0326, fileType: 2, tailTag: 0x0679 } as const
/** 候选文件占位地图 ID（候选不是真实地图；写回时由 genshin-ts 适配器合并进真实地图）。 */
export const CANDIDATE_MAP_ID = 1073741825
/** 候选文件触碰的顶层 root（与 genshin-ts 闭包写回一致）。 */
export const TOUCHED_TOP_LEVEL_FIELDS = [4, 6, 8, 27] as const

const TEXT = new TextEncoder()

function float32(value: number): Uint8Array {
  const result = Buffer.alloc(4)
  result.writeFloatLE(value)
  return result
}

function vector(values: readonly number[], sparse: boolean): Uint8Array {
  return emit(
    values.flatMap((value, index) =>
      sparse && value === 0 ? [] : [{ number: index + 1, wire: 5, value: float32(value) }]
    )
  )
}

/** 最小 root 6：编辑器新图首次保存才有完整 records；占位用"未分类页签"聚合 record。 */
export function minimalFolderRoot6(): Uint8Array {
  const rootTab = emit([
    { number: 1, wire: 2, value: TEXT.encode('root') },
    { number: 3, wire: 0, value: 1 }
  ])
  const tab = emit([
    { number: 1, wire: 2, value: TEXT.encode('未分类页签') },
    { number: 3, wire: 0, value: 2 }
  ])
  const record = emit([
    { number: 1, wire: 0, value: 4 },
    { number: 2, wire: 2, value: rootTab },
    { number: 3, wire: 2, value: tab }
  ])
  return emit([{ number: 1, wire: 2, value: record }])
}

/** 最小新地图骨架 payload（maps:create 同构；占位字段固定以保确定性）。 */
export function buildSkeletonPayload(mapName: string): Uint8Array {
  return emit([
    { number: 1, wire: 0, value: CANDIDATE_MAP_ID },
    { number: 2, wire: 2, value: TEXT.encode(mapName) },
    { number: 4, wire: 2, value: new Uint8Array() },
    { number: 8, wire: 2, value: new Uint8Array() },
    { number: 27, wire: 2, value: new Uint8Array() },
    { number: 34, wire: 0, value: 1 },
    { number: 39, wire: 0, value: 0 },
    { number: 40, wire: 0, value: 0 },
    { number: 41, wire: 0, value: 1 },
    { number: 6, wire: 2, value: minimalFolderRoot6() },
    { number: 10, wire: 2, value: emit([{ number: 7, wire: 0, value: 1 }]) }
  ])
}

/** 官方空模板的槽40.f50 为空；创建装饰物时补入 packed f501 ID 列表。 */
function addPackedIds(
  record: Uint8Array,
  ids: readonly number[],
  ownerFieldNumber: number
): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] invalid prefab record')
  const owner = fields.find((field) => {
    if (field.number !== ownerFieldNumber || field.wire !== 2) return false
    return message(field).some(
      (child) => child.number === 1 && child.wire === 0 && child.value === 40
    )
  })
  if (!owner) throw new Error('[error] prefab decoration slot 40 not found')
  const ownerFields = message(owner)
  const f50 = nth(ownerFields, 50)
  const f50Fields = message(f50)
  if (f50Fields.some((field) => field.number === 501)) {
    throw new Error('[error] prefab decoration slot already has packed field 501')
  }
  f50Fields.push({
    number: 501,
    wire: 2,
    value: Buffer.concat(ids.map((id) => Buffer.from(encodeVarint(id))))
  })
  f50.value = emit(f50Fields)
  owner.value = emit(ownerFields)
  return emit(fields)
}

/** 官方引用实例转自定义实例：f2 从 {1:resID,2:1} 改为 {1:root4 definition ID}。 */
function setInstanceDefinition(record: Uint8Array, definitionId: number): Uint8Array {
  const fields = parse(record)
  if (!fields) throw new Error('[error] invalid prefab instance record')
  const relation = nth(fields, 2)
  if (relation.wire !== 2) throw new Error('[error] prefab instance relation is not a message')
  relation.value = emit([{ number: 1, wire: 0, value: definitionId }])
  return emit(fields)
}

function colorFields(color: ItemColor): WireField[] {
  if (!color.enabled) {
    return [
      { number: 3, wire: 0, value: 0xffffffff },
      { number: 4, wire: 5, value: float32(100) },
      { number: 5, wire: 0, value: 0xffffff },
      { number: 6, wire: 0, value: 6700 }
    ]
  }
  if (!Number.isInteger(color.rgb) || color.rgb < 0 || color.rgb > 0xffffff) {
    throw new Error('[error] color rgb must be an integer from 0x000000 to 0xFFFFFF')
  }
  if (!Number.isFinite(color.opacity) || color.opacity < 0 || color.opacity > 100) {
    throw new Error('[error] color opacity must be from 0 to 100')
  }
  const alpha = Math.round((color.opacity / 100) * 255)
  const argb = ((alpha << 24) | color.rgb) >>> 0
  const opacity = Math.fround((alpha / 255) * 100)
  return [
    { number: 1, wire: 0, value: 1 },
    { number: 3, wire: 0, value: argb },
    { number: 4, wire: 5, value: float32(opacity) },
    { number: 5, wire: 0, value: color.rgb },
    { number: 6, wire: 0, value: color.overlay === 'multiply' ? 6701 : 6700 }
  ]
}

/** 装饰物颜色写入 aux 的材质槽（f5 槽22.f32）：f1=1、f3=ARGB、f4=透明度 float、f5=RGB、f6=6700/6701。 */
function setColor(record: Uint8Array, color: ItemColor): Uint8Array {
  let changed = 0
  const rewrite = (data: Uint8Array): Uint8Array => {
    const fields = parse(data)
    if (!fields) return data
    return emit(
      fields.map((field) => {
        if (field.number === 32 && field.wire === 2) {
          const existing = parse(field.value as Uint8Array)
          if (existing?.some((child) => child.number === 3)) {
            changed++
            const unknown = existing.filter((child) => ![1, 3, 4, 5, 6].includes(child.number))
            return { ...field, value: emit([...colorFields(color), ...unknown]) }
          }
        }
        if (
          field.wire !== 2 ||
          field.number === 501 ||
          printable(field.value as Uint8Array) !== undefined
        )
          return field
        return { ...field, value: rewrite(field.value as Uint8Array) }
      })
    )
  }
  const result = rewrite(record)
  if (changed !== 1) throw new Error(`[error] expected one color field 32, changed ${changed}`)
  return result
}

function printable(data: Uint8Array): string | undefined {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data)
    return text && [...text].every((char) => /\P{C}/u.test(char)) ? text : undefined
  } catch {
    return undefined
  }
}

/**
 * 官方模板源页签注册：在"未分类页签"组追加 {100, prefabId}（自定义元件）与
 * {400, prefabId}（官方引用实例）——与编辑器真实样本一致（轮 4/轮 6）。
 */
function registerPrefab(top6: WireField[], prefabId: number): void {
  const entries = [
    emit([
      { number: 1, wire: 0, value: 100 },
      { number: 2, wire: 0, value: prefabId }
    ]),
    emit([
      { number: 1, wire: 0, value: 400 },
      { number: 2, wire: 0, value: prefabId }
    ])
  ]
  for (const topField of top6) {
    if (topField.number !== 1 || topField.wire !== 2) continue
    const record = message(topField)
    for (const child of record) {
      if (child.number !== 3 || child.wire !== 2) continue
      const group = message(child)
      if (!group.some((field) => field.number === 1 && field.wire === 2)) continue
      for (const entry of entries) group.push({ number: 5, wire: 2, value: entry })
      child.value = emit(group)
      topField.value = emit(record)
      return
    }
  }
  // 无命名组：创建最小页签组（与 registerEntity 语义一致）。
  const group = emit([
    { number: 1, wire: 2, value: TEXT.encode('未分类页签') },
    { number: 3, wire: 0, value: 2 },
    ...entries.map((entry) => ({ number: 5, wire: 2, value: entry }))
  ])
  const record = emit([
    { number: 1, wire: 0, value: 3 },
    {
      number: 2,
      wire: 2,
      value: emit([
        { number: 1, wire: 2, value: TEXT.encode('root') },
        { number: 3, wire: 0, value: 1 }
      ])
    },
    { number: 3, wire: 2, value: group }
  ])
  top6.push({ number: 1, wire: 2, value: record })
}

/**
 * 编码：规范化 structure → .gil 候选字节。
 * 闭包 = root 4 定义（1 条，模板=空模型）+ root 8 实例（1 条，引用定义）+ root 27
 * 装饰物（定义侧/实例侧各 items.length 条）+ root 6 页签登记（{100}/{400}）。
 */
export function encodeStructure(structure: ResolvedStructure): Uint8Array {
  const payload = buildSkeletonPayload(structure.name)
  const top = parse(payload)
  if (!top) throw new Error('[error] malformed skeleton payload')

  const top4 = message(nth(top, 4))
  const top6 = message(nth(top, 6))
  const top8 = message(nth(top, 8))
  const top27 = message(nth(top, 27))
  const top4Records = top4
    .filter((field) => field.number === 1)
    .map((field) => field.value as Uint8Array)

  const sceneTransform: PrefabTransform = {
    position: structure.position,
    rotation: structure.rotation,
    scale: structure.scale
  }

  // root 4：自定义元件定义（宿主模板 = 空模型官方资源）。
  let definition = buildCustomDefinitionRecord({
    id: structure.prefabId,
    resourceId: structure.templatePrefabId,
    name: structure.name,
    transform: sceneTransform
  })
  definition = addPackedIds(definition, structure.definitionAuxiliaryIds, 6)
  top4.push({ number: 1, wire: 2, value: definition })

  // root 8：官方引用实例 → 自定义实例（f2 引用定义 ID）。
  let instance = buildOfficialPrefabRecord({
    id: structure.prefabId,
    resourceId: structure.templatePrefabId,
    name: structure.name,
    transform: sceneTransform
  })
  instance = setInstanceDefinition(instance, structure.prefabId)
  instance = addPackedIds(instance, structure.instanceAuxiliaryIds, 5)
  top8.push({ number: 1, wire: 2, value: instance })

  // root 27：装饰物（definition-side + instance-side 各一条）。
  for (const [index, item] of structure.items.entries()) {
    const resourceId = resolveItemResourceId(top4Records, item.resourceId)
    const transform: PrefabTransform = {
      position: item.position,
      rotation: item.rotation,
      scale: item.scale
    }
    const name = `装饰物_${index + 1}`
    let definitionAuxiliary = buildAuxiliaryRecord({
      id: structure.definitionAuxiliaryIds[index],
      resourceId,
      ownerId: structure.prefabId,
      name,
      transform
    })
    if (item.color) definitionAuxiliary = setColor(definitionAuxiliary, item.color)
    top27.push({ number: 1, wire: 2, value: definitionAuxiliary })
    let instanceAuxiliary = buildAuxiliaryRecord({
      id: structure.instanceAuxiliaryIds[index],
      resourceId,
      ownerId: structure.prefabId,
      name,
      transform,
      definitionAuxiliaryId: structure.definitionAuxiliaryIds[index]
    })
    if (item.color) instanceAuxiliary = setColor(instanceAuxiliary, item.color)
    top27.push({ number: 2, wire: 2, value: instanceAuxiliary })
  }

  // root 6：页签登记（未分类页签追加 {100}/{400} 条目）。
  registerPrefab(top6, structure.prefabId)

  nth(top, 4).value = emit(top4)
  nth(top, 6).value = emit(top6)
  nth(top, 8).value = emit(top8)
  nth(top, 27).value = emit(top27)
  return buildFile(emit(top), CANDIDATE_HEADER)
}
