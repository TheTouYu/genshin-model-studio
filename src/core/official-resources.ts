/**
 * 官方基础元件资源表 + root 4/8/27 记录骨架生成器。
 *
 * 抽取自 genshin-ts（MIT）`src/cli/official_prefabs.ts`，语义保持一致。
 *
 * 骨架字节来自真实编辑器保存快照（BoxPrefabExp 1073741860）：
 * - after-add-many.gil（root 8 长方体/空模型官方引用实例）
 * - after-place-custom-sphere.gil（root 4 球体自定义定义）
 * - after-aux-custom-sphere.gil（root 27 装饰物 def/inst 两侧）
 * 形状由 resID 决定，11 个元件记录同构；唯一差异是空模型（10005018）多一个
 * f5 槽20（{f29:空}），故单独使用一个骨架常量。
 *
 * 一期能力边界：仅"空模型模板 + 官方基础元件 + Transform + 颜色"。
 */
import { emitWireMessage as emit, parseWireMessage as parse, type WireField } from './wire.js'

export const OFFICIAL_RESOURCE_MIN = 10_000_000
export const OFFICIAL_RESOURCE_MAX = 1_000_000_000

/** 官方基础元件资源 ID 判定：ID 落在 [1e7, 1e9) 即官方 resID（真实样本 1000900x/10005018）。 */
export function isOfficialResourceId(id: number): boolean {
  return Number.isSafeInteger(id) && id >= OFFICIAL_RESOURCE_MIN && id < OFFICIAL_RESOURCE_MAX
}

const OFFICIAL_PREFAB_NAMES: Readonly<Record<number, string>> = {
  10009001: '长方体',
  10009002: '球体',
  10009003: '平面',
  10009004: '三棱柱',
  10009005: '五棱柱',
  10009006: '三棱锥',
  10009008: '圆柱',
  10009009: '圆锥',
  10009010: '线框长方体',
  10009011: '线框圆柱',
  10009012: '开口薄壁圆柱',
  10009019: '网格',
  10005018: '空模型'
}

/** 已由真实编辑器快照验证名字的官方 resID 表；未知 resID 返回 undefined。 */
export function officialPrefabName(resourceId: number): string | undefined {
  return OFFICIAL_PREFAB_NAMES[resourceId]
}

export type PrefabTransform = {
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: readonly [number, number, number]
}

// —— 骨架常量（真实快照提取，模板内可替换值见下方 SKELETON_*）——
// root 8 官方引用实例：长方体（1077936130，resID 10009001，10 能力槽）。
// 结构：f1=实例ID、f2={1:resID,2:1}（官方标记）、f5 槽 1/13/14/38/40/111/61/62/19/52
// （槽1.f11.f1=名字）、f6×15 节点树（槽1.f11=transform）、f7×6 组件、f8=resID。
const INSTANCE_SKELETON_CUBOID = '088280808204120708a9f3e20410012a0f08015a0b0a09e995bfe696b9e4bd932a0b080db2010620ffffffff0f2a16080eba01110a0f1a0d4d50416374696f6e47726f75702a0a08268203050d0000803f2a0508289203002a05086fea05002a05083d8a04002a05083e9204002a050813e201002a050834f20300322a08015a260a0a0d80fb6e401d6466c6c012001a0f0d0000803f150000803f1d0000803fa81fffffffff0f320408026200320408036a003206080472020801320808057a040801100132050806820100324208078a013d0d00007a441d0000fa4320012801320510c2c7ee0445cdcccc3d4dcdcccc3d55cdcccc3d5dcdcccc3d65cdcccc3d6dcdcccc3d75cdcccc3d7dcdcccc3d320a08089201050801a81f013235080baa01300a2e0a0b47495f526f6f744e6f646512001a00b21f0ce4b8ade5bf83e58e9fe782b9c01f01ca1f08526f6f744e6f64653208080cb20103a81f0132050810d2010032050811da010032070813ea0102080132050814f201003218081682021318ffffffff0f250000c84228ffffff0730ac343a6508121001e2015e4a25180120012a0032003d0000803f420052005801ba1f0ce58f97e587bbe789b9e69588d81f0d5228180120012a0032003d0000803f420052005801ba1f0fe8a2abe587bbe58092e789b9e69588d81f0d5a0b47495f526f6f744e6f64653a06080110015a003a06080310016a003a0708131001ea01003a07080610018201003a07080e1001c2010040a9f3e204'
// 空模型（1077936138，resID 10005018）：在槽19与槽52之间多一个 f5 槽20（{f29:空}）。
const INSTANCE_SKELETON_EMPTY = '088a808082041207089ad4e20410012a0f08015a0b0a09e7a9bae6a8a1e59e8b2a0b080db2010620ffffffff0f2a16080eba01110a0f1a0d4d50416374696f6e47726f75702a0a08268203050d0000803f2a0508289203002a05086fea05002a05083d8a04002a05083e9204002a050813e201002a050814ea01002a050834f20300322a08015a260a0a0dc8f3e1401d253615c112001a0f0d0000803f150000803f1d0000803fa81fffffffff0f320408026200320408036a003206080472020801320808057a040801100132050806820100324208078a013d0d00007a441d0000fa4320012801320510c2c7ee0445cdcccc3d4dcdcccc3d55cdcccc3d5dcdcccc3d65cdcccc3d6dcdcccc3d75cdcccc3d7dcdcccc3d320a08089201050801a81f013235080baa01300a2e0a0b47495f526f6f744e6f646512001a00b21f0ce4b8ade5bf83e58e9fe782b9c01f01ca1f08526f6f744e6f64653208080cb20103a81f0132050810d2010032050811da010032070813ea0102080132050814f201003218081682021318ffffffff0f250000c84228ffffff0730ac343a6508121001e2015e4a25180120012a0032003d0000803f420052005801ba1f0ce58f97e587bbe789b9e69588d81f0d5228180120012a0032003d0000803f420052005801ba1f0fe8a2abe587bbe58092e789b9e69588d81f0d5a0b47495f526f6f744e6f64653a06080110015a003a06080310016a003a0708131001ea01003a07080610018201003a07080e1001c20100409ad4e204'
// root 4 自定义元件定义（球体 1077936129，resID 10009002）。
// 结构：f1=定义ID、f2=resID（直接 varint）、f6×8 槽（槽1.f11.f1=名字，缺槽19/52）、
// f7×15 节点树（槽1.f11=transform）、f8×6 组件、f10=1。
const DEFINITION_SKELETON = '08818080820410aaf3e204320c08015a080a06e79083e4bd93320b080db2010620ffffffff0f3216080eba01110a0f1a0d4d50416374696f6e47726f7570320a08268203050d0000803f320508289203003205086fea05003205083d8a04003205083e9204003a2a08015a260a0a0da007a2401d6366c6c012001a0f0d0000803f150000803f1d0000803fa81fffffffff0f3a04080262003a0408036a003a060804720208013a0808057a04080110013a0508068201003a4208078a013d0d00007a441d0000fa4320012801320510c2c7ee0445cdcccc3d4dcdcccc3d55cdcccc3d5dcdcccc3d65cdcccc3d6dcdcccc3d75cdcccc3d7dcdcccc3d3a0a08089201050801a81f013a35080baa01300a2e0a0b47495f526f6f744e6f646512001a00b21f0ce4b8ade5bf83e58e9fe782b9c01f01ca1f08526f6f744e6f64653a08080cb20103a81f013a050810d201003a050811da01003a070813ea010208013a050814f201003a18081682021318ffffffff0f250000c84228ffffff0730ac34426508121001e2015e4a25180120012a0032003d0000803f420052005801ba1f0ce58f97e587bbe789b9e69588d81f0d5228180120012a0032003d0000803f420052005801ba1f0fe8a2abe587bbe58092e789b9e69588d81f0d5a0b47495f526f6f744e6f64654206080110015a004206080310016a00420708131001ea01004207080610018201004207080e1001c201005001'
// root 27 装饰物（definition-side 1073741828 / instance-side 1073741829，元件资源 10009002，
// 宿主元件定义 1077936130，名字"装饰物_1"）。结构：f1=aux ID、f2=元件资源 ID、
// f3=1（仅定义侧）、f4 槽1（名字）/槽40（f50.f502=宿主定义ID）/槽111、f5 槽1（transform）
// /槽5/槽2/槽22（材质）、f11 空（仅定义侧）、f12={1:定义侧 aux ID}（仅实例侧）。
const AUX_SKELETON_DEFINITION = '08848080800410aaf3e2041801221108015a0d0a0be8a385e9a5b0e789a95f31220c0828920307b01f82808082042205086fea05002a2308015a1f0a0a0de22ae0401db087163f12001a0f0d0000803f150000003f1d0000803f2a0808057a04080110012a04080262002a18081682021318ffffffff0f250000c84228ffffff0730ac345a00'
const AUX_SKELETON_INSTANCE = '08858080800410aaf3e204221108015a0d0a0be8a385e9a5b0e789a95f31220c0828920307b01f8a808082042205086fea05002a2308015a1f0a0a0de22ae0401db087163f12001a0f0d0000803f150000003f1d0000803f2a0808057a04080110012a04080262002a18081682021318ffffffff0f250000c84228ffffff0730ac346206088480808004'

// 骨架中可替换的模板常量（同一骨架内唯一出现或全部都需要替换）。
const SKELETON_INSTANCE_ID = 1077936130
const SKELETON_INSTANCE_EMPTY_ID = 1077936138
const SKELETON_INSTANCE_RESOURCE_ID = 10009001
const SKELETON_INSTANCE_EMPTY_RESOURCE_ID = 10005018
const SKELETON_DEFINITION_ID = 1077936129
const SKELETON_DEFINITION_RESOURCE_ID = 10009002
const SKELETON_AUX_ID = 1073741828
const SKELETON_AUX_INSTANCE_ID = 1073741829
const SKELETON_AUX_RESOURCE_ID = 10009002
const SKELETON_AUX_OWNER_ID = 1077936130
const SKELETON_AUX_INSTANCE_OWNER_ID = 1077936138

/** 骨架占位 ID 集合：用户提供的 prefabId/aux ID 落在其中会被模板替换过程破坏，校验时拒绝。 */
export const RESERVED_SKELETON_IDS: readonly number[] = [
  SKELETON_INSTANCE_ID,
  SKELETON_INSTANCE_EMPTY_ID,
  SKELETON_DEFINITION_ID,
  SKELETON_AUX_ID,
  SKELETON_AUX_INSTANCE_ID,
  SKELETON_AUX_OWNER_ID,
  SKELETON_AUX_INSTANCE_OWNER_ID,
  SKELETON_INSTANCE_RESOURCE_ID,
  SKELETON_INSTANCE_EMPTY_RESOURCE_ID,
  SKELETON_DEFINITION_RESOURCE_ID,
  SKELETON_AUX_RESOURCE_ID
]

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

/** 递归替换 varint（跳过 packed 501，与 static-assemblies 模板替换语义一致）。 */
function replaceVarint(data: Uint8Array, oldValue: number, newValue: number): Uint8Array {
  const fields = parse(data)
  if (!fields) return data
  return emit(
    fields.map((field) => {
      if (field.wire === 0 && field.value === oldValue) return { ...field, value: newValue }
      if (field.wire !== 2 || field.number === 501) return field
      const nested = replaceVarint(field.value as Uint8Array, oldValue, newValue)
      return Buffer.from(nested).equals(Buffer.from(field.value as Uint8Array))
        ? field
        : { ...field, value: nested }
    })
  )
}

/** 在指定 owner 槽（{1:1, 11:{1:名字}}）中替换 UTF-8 名字。 */
function replaceName(data: Uint8Array, ownerFieldNumber: number, name: string): Uint8Array {
  const fields = parse(data)
  if (!fields) throw new Error('[error] malformed skeleton record')
  const owner = fields.find(
    (field) =>
      field.wire === 2 &&
      field.number === ownerFieldNumber &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 1
      )
  )
  if (!owner) throw new Error(`[error] skeleton name slot ${ownerFieldNumber} not found`)
  const ownerFields = parse(owner.value as Uint8Array)
  if (!ownerFields) throw new Error('[error] malformed skeleton name slot')
  const f11 = ownerFields.find((field) => field.number === 11 && field.wire === 2)
  if (!f11) throw new Error('[error] skeleton name field 11 not found')
  const f11Fields = parse(f11.value as Uint8Array)
  if (!f11Fields) throw new Error('[error] malformed skeleton name field 11')
  const nameField = f11Fields.find((field) => field.number === 1 && field.wire === 2)
  if (!nameField) throw new Error('[error] skeleton name field 11.1 not found')
  nameField.value = TEXT.encode(name)
  f11.value = emit(f11Fields)
  owner.value = emit(ownerFields)
  return emit(fields)
}

/** 重写 owner 槽的 transform（{1:1, 11:{1:位置,2:旋转,3:缩放}}），保留 f11 内其他字段。 */
function setTransform(
  data: Uint8Array,
  transform: PrefabTransform,
  ownerFieldNumber: number
): Uint8Array {
  const fields = parse(data)
  if (!fields) throw new Error('[error] invalid skeleton transform record')
  const owner = fields.find(
    (field) =>
      field.wire === 2 &&
      field.number === ownerFieldNumber &&
      parse(field.value as Uint8Array)?.some(
        (child) => child.number === 1 && child.wire === 0 && child.value === 1
      )
  )
  if (!owner) throw new Error(`[error] skeleton transform owner ${ownerFieldNumber} not found`)
  const ownerFields = parse(owner.value as Uint8Array)
  if (!ownerFields) throw new Error('[error] malformed skeleton transform owner')
  const transformField = ownerFields.find((field) => field.number === 11 && field.wire === 2)
  if (!transformField) throw new Error('[error] skeleton transform field 11 not found')
  const existing = (parse(transformField.value as Uint8Array) ?? []).filter(
    (field) => ![1, 2, 3].includes(field.number)
  )
  transformField.value = emit([
    { number: 1, wire: 2, value: vector(transform.position, true) },
    { number: 2, wire: 2, value: vector(transform.rotation, true) },
    { number: 3, wire: 2, value: vector(transform.scale, false) },
    ...existing
  ])
  owner.value = emit(ownerFields)
  return emit(fields)
}

/**
 * 生成官方元件记录（root 8 官方引用实例与 root 5 官方直引实体共用同一骨架）：
 * f1=ID、f2={1:resID,2:1}、f5×10 能力槽（槽1=名字）、f6×15 节点树、f7×6 组件、f8=resID。
 */
export function buildOfficialPrefabRecord(params: {
  id: number
  resourceId: number
  name: string
  transform: PrefabTransform
}): Uint8Array {
  const emptyModel = params.resourceId === 10005018
  let record: Uint8Array = Buffer.from(
    emptyModel ? INSTANCE_SKELETON_EMPTY : INSTANCE_SKELETON_CUBOID,
    'hex'
  )
  record = replaceVarint(
    record,
    emptyModel ? SKELETON_INSTANCE_EMPTY_ID : SKELETON_INSTANCE_ID,
    params.id
  )
  record = replaceVarint(
    record,
    emptyModel ? SKELETON_INSTANCE_EMPTY_RESOURCE_ID : SKELETON_INSTANCE_RESOURCE_ID,
    params.resourceId
  )
  record = replaceName(record, 5, params.name)
  return setTransform(record, params.transform, 6)
}

/** 生成 root 4 自定义元件定义：f1=定义ID、f2=resID、f6×8 槽（槽1=名字）、f7×15、f8×6、f10=1。 */
export function buildCustomDefinitionRecord(params: {
  id: number
  resourceId: number
  name: string
  transform: PrefabTransform
}): Uint8Array {
  let record: Uint8Array = replaceVarint(
    Buffer.from(DEFINITION_SKELETON, 'hex'),
    SKELETON_DEFINITION_ID,
    params.id
  )
  record = replaceVarint(record, SKELETON_DEFINITION_RESOURCE_ID, params.resourceId)
  record = replaceName(record, 6, params.name)
  return setTransform(record, params.transform, 7)
}

/**
 * 生成 root 27 装饰物记录。definition-side 与 instance-side 共用骨架；
 * 传 definitionAuxiliaryId（实例侧）时写入 f12.f1 回链并省略 f3=1。
 * f2 写入的是元件"资源 ID"（官方元件=resID；自定义元件=其 root 4 定义的 f2）。
 */
export function buildAuxiliaryRecord(params: {
  id: number
  resourceId: number
  ownerId: number
  name: string
  transform: PrefabTransform
  definitionAuxiliaryId?: number
}): Uint8Array {
  const instanceSide = params.definitionAuxiliaryId !== undefined
  let record: Uint8Array = Buffer.from(
    instanceSide ? AUX_SKELETON_INSTANCE : AUX_SKELETON_DEFINITION,
    'hex'
  )
  record = replaceVarint(
    record,
    instanceSide ? SKELETON_AUX_INSTANCE_ID : SKELETON_AUX_ID,
    params.id
  )
  if (instanceSide) record = replaceVarint(record, SKELETON_AUX_ID, params.definitionAuxiliaryId!)
  record = replaceVarint(record, SKELETON_AUX_RESOURCE_ID, params.resourceId)
  const ownerTemplateId = instanceSide ? SKELETON_AUX_INSTANCE_OWNER_ID : SKELETON_AUX_OWNER_ID
  record = replaceVarint(record, ownerTemplateId, params.ownerId)
  record = replaceName(record, 4, params.name)
  return setTransform(record, params.transform, 5)
}

/**
 * 解析装饰物 item 引用的元件资源 ID：item.resourceId 命中 root 4 本地定义
 * （自定义元件）时取其 f2（继承的官方 resID）；否则原样返回（官方 resID 或未知 ID）。
 * 一期候选没有本地定义，官方 resID 原样返回。
 */
export function resolveItemResourceId(
  definitions: readonly Uint8Array[],
  resourceId: number
): number {
  if (isOfficialResourceId(resourceId)) return resourceId
  for (const record of definitions) {
    const fields = parse(record)
    if (
      !fields?.some(
        (field) => field.number === 1 && field.wire === 0 && field.value === resourceId
      )
    )
      continue
    const resource = fields.find((field) => field.number === 2 && field.wire === 0)
    return typeof resource?.value === 'number' ? resource.value : resourceId
  }
  return resourceId
}
