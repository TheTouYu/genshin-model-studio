/**
 * gia-encoder.ts — GIA 静态模型资产编码器（structure.json 超集 → .gia）
 *
 * 零依赖 TypeScript；运行：
 *   node src/gia/gia-encoder.ts <structure.json> <output.gia>
 *   （Node ≥22.6 原生 strip types；否则用 `npx tsx` 运行）
 *
 * 依据：/tmp/gms-task-b/docs/gia-format.md（两个真实样本 等角螺线.gia / 足球.gia 破译）
 * 所有"常量样板"字段均逐字节复刻样本观察值；语义未闭合处见 docs 未闭合清单。
 */
import { readFileSync, writeFileSync } from 'node:fs'

/* ============================ protobuf wire 原语 ============================ */

function varint(value: number): Uint8Array {
  let v = value >>> 0
  const out: number[] = []
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  out.push(v)
  return Uint8Array.from(out)
}

/** 定长字符串字段 */
function fieldBytes(field: number, data: Uint8Array): Uint8Array {
  const tag = varint((field << 3) | 2)
  const len = varint(data.length)
  const out = new Uint8Array(tag.length + len.length + data.length)
  out.set(tag, 0)
  out.set(len, tag.length)
  out.set(data, tag.length + len.length)
  return out
}

/** varint 字段 */
function fieldVarint(field: number, value: number): Uint8Array {
  const tag = varint((field << 3) | 0)
  const v = varint(value)
  const out = new Uint8Array(tag.length + v.length)
  out.set(tag, 0)
  out.set(v, tag.length)
  return out
}

/** float32 字段（LE） */
function fieldFloat(field: number, value: number): Uint8Array {
  const tag = varint((field << 3) | 5)
  const buf = new ArrayBuffer(4)
  new DataView(buf).setFloat32(0, Math.fround(value), true)
  const out = new Uint8Array(tag.length + 4)
  out.set(tag, 0)
  out.set(new Uint8Array(buf), tag.length)
  return out
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

/** 空消息 */
function emptyMsg(): Uint8Array {
  return new Uint8Array(0)
}

/** 从 hex 构造字节（复刻样本常量样板） */
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/**
 * 模型级变量样板（样本全部版本逐字节一致，f7[1..14] / f8[0..5]）：
 * 来自 等角螺线.gia / 足球.gia 当前版本基线（out/f78-baseline.json）。
 * 语义未闭合：type 7 为配置记录（含资源 10200002 与 8 个 0.1 浮点）、
 * type 11 为根节点声明（GI_RootNode / 中心原点 / RootNode）、type 18 为特效
 * （受击特效 / 被击倒特效，f28.507=13）等。见 docs/gia-format.md 未闭合清单。
 */
const F7_BOILERPLATE_HEX = [
  '08026200', '08036a00', '080472020801', '08057a0408011001', '0806820100',
  '08078a013d0d00007a441d0000fa4320012801320510c2c7ee0445cdcccc3d4dcdcccc3d55cdcccc3d5dcdcccc3d65cdcccc3d6dcdcccc3d75cdcccc3d7dcdcccc3d',
  '08089201050801a81f01', '080baa01300a2e0a0b47495f526f6f744e6f646512001a00b21f0ce4b8ade5bf83e58e9fe782b9c01f01ca1f08526f6f744e6f6465',
  '080cb20103a81f01', '0810d20100', '0811da0100', '0813ea01020801', '0814f20100',
  '081682021318ffffffff0f250000c84228ffffff0730ac34'
]
const F8_BOILERPLATE_HEX = [
  '08121001e2015e4a25180120012a0032003d0000803f420052005801ba1f0ce58f97e587bbe789b9e69588d81f0d5228180120012a0032003d0000803f420052005801ba1f0fe8a2abe587bbe58092e789b9e69588d81f0d5a0b47495f526f6f744e6f6465',
  '080110015a00', '080310016a00', '08131001ea0100', '08061001820100', '080e1001c20100'
]

/** f7[0]：模型根节点 Transform {1:1, 11:{1:pos, 2:rot, 3:scale, 501:-1}} */
function rootTransformRecord(t: { position: number[]; rotation: number[]; scale: number[] }): Uint8Array {
  const t11 = concat(
    fieldBytes(1, vec3Msg([t.position[0] ?? 0, t.position[1] ?? 0, t.position[2] ?? 0], false)),
    fieldBytes(2, vec3Msg([t.rotation[0] ?? 0, t.rotation[1] ?? 0, t.rotation[2] ?? 0], false)),
    fieldBytes(3, vec3Msg([t.scale[0] ?? 1, t.scale[1] ?? 1, t.scale[2] ?? 1], true)),
    fieldVarint(501, 4294967295)
  )
  return concat(fieldVarint(1, 1), fieldBytes(11, t11))
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

/* ============================ 消息构建（复刻样本 wire 形态） ============================ */

/** GraphUnit.Id {2: class, 3: type, 4: id} */
function msgId(class_: number, type: number, id: number): Uint8Array {
  return concat(fieldVarint(2, class_), fieldVarint(3, type), fieldVarint(4, id))
}

/** Vec3 {1:x, 2:y, 3:z}；value=0 的轴省略（样本观察） */
function vec3Msg(v: [number, number, number], alwaysAll: boolean): Uint8Array {
  const parts: Uint8Array[] = []
  if (alwaysAll || v[0] !== 0) parts.push(fieldFloat(1, v[0]))
  if (alwaysAll || v[1] !== 0) parts.push(fieldFloat(2, v[1]))
  if (alwaysAll || v[2] !== 0) parts.push(fieldFloat(3, v[2]))
  return concat(...parts)
}

/** 变换记录 {1: type=1, 11: {1: pos, 2: rot, 3: scale}} */
function transformRecord(pos: number[], rot: number[], scl: number[]): Uint8Array {
  const t = concat(
    fieldBytes(1, vec3Msg([pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0], false)),
    fieldBytes(2, vec3Msg([rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0], false)),
    fieldBytes(3, vec3Msg([scl[0] ?? 1, scl[1] ?? 1, scl[2] ?? 1], true))
  )
  return concat(fieldVarint(1, 1), fieldBytes(11, t))
}

/** 颜色记录 {1: type=22, 32: {1:1, 3:0xFF000000|rgb, 4:100.0, 5:rgb, 6:6700}} */
function colorRecord(color: { enabled?: boolean; rgb?: number; opacity?: number }): Uint8Array {
  const rgb = (color.rgb ?? 0xffffff) & 0xffffff
  const opacity = color.opacity ?? 100
  const c32 = concat(
    fieldVarint(1, color.enabled === false ? 0 : 1),
    fieldVarint(3, 0xff000000 | rgb),
    fieldFloat(4, opacity),
    fieldVarint(5, rgb),
    fieldVarint(6, 6700) // 样本常量；语义未闭合（见文档）
  )
  return concat(fieldVarint(1, 22), fieldBytes(32, c32))
}

/** item 字段-5 值记录（每条独立）：transform(1), float(5), guid(2), color(22) —— 顺序固定 */
function itemValueRecords(pos: number[], rot: number[], scl: number[], color: {
  enabled?: boolean; rgb?: number; opacity?: number
}): Uint8Array[] {
  const floatRec = concat(fieldVarint(1, 5), fieldBytes(15, concat(fieldVarint(1, 1), fieldVarint(2, 1))))
  const guidRec = concat(fieldVarint(1, 2), fieldBytes(12, emptyMsg()))
  return [transformRecord(pos, rot, scl), floatRec, guidRec, colorRecord(color)]
}

/** item 字段-4 记录（每条独立）：name(1), structure(40), empty(111) —— 顺序固定 */
function itemDefRecords(name: string, unitId: number): Uint8Array[] {
  const nameRec = concat(
    fieldVarint(1, 1),
    fieldBytes(11, concat(fieldBytes(1, utf8(name))))
  )
  const structRec = concat(
    fieldVarint(1, 40),
    fieldBytes(50, concat(fieldVarint(502, unitId)))
  )
  const emptyRec = concat(fieldVarint(1, 111), fieldBytes(93, emptyMsg()))
  return [nameRec, structRec, emptyRec]
}

/** item 数据 f21: {1: {1:id, 2:resourceId, 3:1, 4*:defs, 5*:values, 11:{}}} */
function itemData(item: Item, unitId: number, index: number): Uint8Array {
  const name = item.name ?? `装饰物_${index + 1}`
  const f211 = concat(
    fieldVarint(1, item.id),
    fieldVarint(2, item.resourceId),
    fieldVarint(3, 1),
    ...itemDefRecords(name, unitId).map((rec) => fieldBytes(4, rec)),
    ...itemValueRecords(item.position, item.rotation, item.scale, item.color ?? {}).map((rec) => fieldBytes(5, rec)),
    fieldBytes(11, emptyMsg())
  )
  return concat(fieldBytes(1, f211))
}

/** 版本记录 f11.1.6 八条（每条独立，顺序固定，逐字节复刻样本） */
function versionRecords(name: string, itemIds: number[]): Uint8Array[] {
  const nameRec = concat(
    fieldVarint(1, 1),
    fieldBytes(11, concat(fieldBytes(1, utf8(name))))
  )
  const type13 = concat(fieldVarint(1, 13), fieldBytes(22, concat(fieldVarint(4, 4294967295))))
  const type14 = concat(
    fieldVarint(1, 14),
    fieldBytes(23, concat(fieldBytes(1, concat(fieldBytes(3, utf8('MPActionGroup'))))))
  )
  const type38 = concat(fieldVarint(1, 38), fieldBytes(48, concat(fieldFloat(1, 1.0))))
  // 40: 打包 varint 列表（无 tag 的 packed repeated）
  const packed = concat(...itemIds.map((id) => varint(id)))
  const type40 = concat(fieldVarint(1, 40), fieldBytes(50, concat(fieldBytes(501, packed))))
  const type111 = concat(fieldVarint(1, 111), fieldBytes(93, emptyMsg()))
  const type61 = concat(fieldVarint(1, 61), fieldBytes(65, emptyMsg()))
  const type62 = concat(fieldVarint(1, 62), fieldBytes(66, emptyMsg()))
  return [nameRec, type13, type14, type38, type40, type111, type61, type62]
}

/** 版本 GraphUnit {1:id, 2:relatedIds*, 3:name, 5:which=1, 11:data} */
function versionUnit(model: Model): Uint8Array {
  const itemIds = model.items.map((it) => it.id)
  const root = model.rootTransform ?? { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
  const f111 = concat(
    fieldVarint(1, model.unitId),
    fieldVarint(2, model.templatePrefabId),
    ...versionRecords(model.name, itemIds).map((rec) => fieldBytes(6, rec)),
    fieldBytes(7, rootTransformRecord(root)),
    ...F7_BOILERPLATE_HEX.map((h) => fieldBytes(7, fromHex(h))),
    ...F8_BOILERPLATE_HEX.map((h) => fieldBytes(8, fromHex(h))),
    fieldVarint(10, 1)
  )
  const f11 = concat(fieldBytes(1, f111))
  return concat(
    fieldBytes(1, msgId(1, 1, model.unitId)),
    ...itemIds.map((id) => fieldBytes(2, msgId(1, 14, id))),
    fieldBytes(3, utf8(model.name)),
    fieldVarint(5, 1),
    fieldBytes(11, f11)
  )
}

/** accessory GraphUnit {1:id, 3:name, 5:which=28, 21:data} */
function accessoryUnit(item: Item, unitId: number, index: number): Uint8Array {
  return concat(
    fieldBytes(1, msgId(1, 14, item.id)),
    fieldBytes(3, utf8(item.name ?? `装饰物_${index + 1}`)),
    fieldVarint(5, 28),
    fieldBytes(21, itemData(item, unitId, index))
  )
}

/** Root {1: graph*, 2: accessories*, 3: filePath, 5: gameVersion} */
function rootPayload(model: Model, file: FileMeta): Uint8Array {
  return concat(
    fieldBytes(1, versionUnit(model)),
    ...model.items.map((it, i) => fieldBytes(2, accessoryUnit(it, model.unitId, i))),
    fieldBytes(3, utf8(file.filePath)),
    fieldBytes(5, utf8(file.gameVersion))
  )
}

/** 容器：BE32×5 头 + payload + BE32 尾（与样本/GIL 相同约定） */
function buildContainer(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + 24)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, payload.length + 20, false) // leftSize
  dv.setUint32(4, 1, false)                   // schema
  dv.setUint32(8, 0x0326, false)              // headTag
  dv.setUint32(12, 3, false)                  // fileType
  dv.setUint32(16, payload.length, false)     // protoSize
  out.set(payload, 20)
  dv.setUint32(out.length - 4, 0x0679, false) // tailTag
  return out
}

/* ============================ 输入定义与入口 ============================ */

interface Item {
  id: number
  resourceId: number
  position: number[]
  rotation: number[]
  scale: number[]
  color?: { enabled?: boolean; rgb?: number; opacity?: number; overlay?: string }
  name?: string
}
interface Model {
  name: string
  unitId: number
  templatePrefabId: number
  items: Item[]
  /** 模型根节点 Transform（样本默认 (-3,1,0) / scale 0.25，为编辑器默认放置） */
  rootTransform?: { position: number[]; rotation: number[]; scale: number[] }
}
interface FileMeta {
  filePath: string
  gameVersion: string
}
interface StructureInput {
  schemaVersion: number
  model: Model
  file: FileMeta
}

function validate(input: StructureInput): void {
  if (input.schemaVersion !== 1) throw new Error('schemaVersion must be 1')
  const m = input.model
  if (!m || !Array.isArray(m.items) || m.items.length === 0) throw new Error('model.items required')
  if (!Number.isInteger(m.unitId)) throw new Error('model.unitId required')
  if (!Number.isInteger(m.templatePrefabId)) m.templatePrefabId = 10005018
  const ids = new Set(m.items.map((it) => it.id))
  if (ids.size !== m.items.length) throw new Error('item ids must be unique')
  for (const it of m.items) {
    if (!Number.isInteger(it.resourceId)) throw new Error(`item ${it.id}: resourceId required`)
    if (!Array.isArray(it.position) || !Array.isArray(it.rotation) || !Array.isArray(it.scale)) {
      throw new Error(`item ${it.id}: position/rotation/scale arrays required`)
    }
  }
  if (!input.file?.filePath) throw new Error('file.filePath required ({UID}-{TIME}-{LEVEL_ID}-\\name.gia)')
  if (!input.file.gameVersion) input.file.gameVersion = '6.7.0'
}

export function encodeGia(input: StructureInput): Uint8Array {
  validate(input)
  return buildContainer(rootPayload(input.model, input.file))
}

function main(): void {
  const [inPath, outPath] = process.argv.slice(2)
  if (!inPath || !outPath) {
    console.error('usage: node gia-encoder.ts <structure.json> <output.gia>')
    process.exit(2)
  }
  const input = JSON.parse(readFileSync(inPath, 'utf8')) as StructureInput
  const bytes = encodeGia(input)
  writeFileSync(outPath, bytes)
  console.log(`wrote ${outPath} (${bytes.length} bytes)`)
}

if (/gia-encoder\.(ts|js)$/.test(process.argv[1] ?? '')) main()
