/**
 * protobuf 风格 wire 消息解析/编码。
 *
 * 抽取自 genshin-ts（MIT）`src/cli/static_assembly/wire.ts`，语义保持一致。
 * wire 类型：0 = varint、1 = 64 位、2 = length-delimited、5 = 32 位。
 */
import { encodeVarint, readVarint } from './binary.js'

export type WireField = {
  number: number
  wire: number
  value: number | Uint8Array
}

const UTF8 = new TextDecoder('utf-8', { fatal: true })

export function parseWireMessage(data: Uint8Array): WireField[] | undefined {
  const fields: WireField[] = []
  let offset = 0
  while (offset < data.length) {
    const key = readVarint(data, offset)
    if (!key || key.value >> 3 === 0) return undefined
    offset = key.next
    const number = key.value >> 3
    const wire = key.value & 7
    if (wire === 0) {
      const value = readVarint(data, offset)
      if (!value) return undefined
      fields.push({ number, wire, value: value.value })
      offset = value.next
    } else if (wire === 1 || wire === 5) {
      const width = wire === 1 ? 8 : 4
      if (offset + width > data.length) return undefined
      fields.push({ number, wire, value: data.slice(offset, offset + width) })
      offset += width
    } else if (wire === 2) {
      const length = readVarint(data, offset)
      if (!length || length.next + length.value > data.length) return undefined
      fields.push({ number, wire, value: data.slice(length.next, length.next + length.value) })
      offset = length.next + length.value
    } else return undefined
  }
  return fields
}

export function emitWireMessage(fields: readonly WireField[]): Uint8Array {
  const parts: Uint8Array[] = []
  for (const field of fields) {
    parts.push(encodeVarint((field.number << 3) | field.wire))
    if (field.wire === 0) parts.push(encodeVarint(field.value as number))
    else if (field.wire === 2) {
      const value = field.value as Uint8Array
      parts.push(encodeVarint(value.length), value)
    } else parts.push(field.value as Uint8Array)
  }
  return Buffer.concat(parts.map((part) => Buffer.from(part)))
}

export function wireMessage(field: WireField): WireField[] {
  if (field.wire !== 2) throw new Error(`[error] field ${field.number} is not length-delimited`)
  const result = parseWireMessage(field.value as Uint8Array)
  if (!result) throw new Error(`[error] field ${field.number} is not a protobuf-like message`)
  return result
}

export function nthWireField(
  fields: readonly WireField[],
  number: number,
  occurrence = 1
): WireField {
  const result = fields.filter((field) => field.number === number)[occurrence - 1]
  if (!result) throw new Error(`[error] missing field ${number}[${occurrence}]`)
  return result
}

export function wireRecordId(record: Uint8Array): number | undefined {
  const first = parseWireMessage(record)?.[0]
  return first?.number === 1 && first.wire === 0 ? (first.value as number) : undefined
}

export function wireRecords(
  top: readonly WireField[],
  topNumber: number,
  recordNumber: number
): Uint8Array[] {
  return wireMessage(nthWireField(top, topNumber))
    .filter((field) => field.number === recordNumber && field.wire === 2)
    .map((field) => field.value as Uint8Array)
}

export function printableWireText(data: Uint8Array): string | undefined {
  try {
    const text = UTF8.decode(data)
    return text && [...text].every((char) => /\P{C}/u.test(char)) ? text : undefined
  } catch {
    return undefined
  }
}

/** 从记录中递归查找 packed 字段 501（装饰物 aux ID 列表）。 */
export function packedWireIds(record: Uint8Array): number[] {
  const fields = parseWireMessage(record)
  if (!fields) throw new Error('[error] invalid record')
  for (const field of fields) {
    if (field.number === 501 && field.wire === 2) {
      const ids: number[] = []
      let offset = 0
      const value = field.value as Uint8Array
      while (offset < value.length) {
        const decoded = readVarint(value, offset)
        if (!decoded) throw new Error('[error] malformed packed field 501')
        ids.push(decoded.value)
        offset = decoded.next
      }
      return ids
    }
    if (
      field.wire === 2 &&
      field.number !== 501 &&
      printableWireText(field.value as Uint8Array) === undefined
    ) {
      try {
        return packedWireIds(field.value as Uint8Array)
      } catch {
        // Continue searching sibling fields.
      }
    }
  }
  throw new Error('[error] packed field 501 not found')
}

/** 递归收集消息内全部 varint 字段值（跳过 packed 501）。 */
export function collectWireVarints(data: Uint8Array): number[] {
  const fields = parseWireMessage(data)
  if (!fields) return []
  return fields.flatMap((field) => {
    if (field.wire === 0) return [field.value as number]
    return field.wire === 2 && field.number !== 501
      ? collectWireVarints(field.value as Uint8Array)
      : []
  })
}

/** 递归收集消息内全部可打印 UTF-8 文本。 */
export function collectWireTexts(data: Uint8Array): string[] {
  const fields = parseWireMessage(data)
  if (!fields) return []
  return fields.flatMap((field) => {
    if (field.wire !== 2) return []
    const text = printableWireText(field.value as Uint8Array)
    return text === undefined ? collectWireTexts(field.value as Uint8Array) : [text]
  })
}
