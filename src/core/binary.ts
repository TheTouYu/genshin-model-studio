/**
 * GIL 二进制编码原语（varint / 文件头 / 文件拼装）。
 *
 * 抽取自 genshin-ts（MIT）`src/injector/binary.ts`，语义保持一致：
 * - readVarint / encodeVarint：protobuf 风格 32 位 varint
 * - buildFile：20 字节头 + payload + 4 字节尾 tag 的 .gil 文件容器
 */
export function readVarint(
  buf: Uint8Array,
  offset: number
): { value: number; next: number } | null {
  let val = 0
  let shift = 0
  let cur = offset
  while (cur < buf.length && shift < 64) {
    const byte = buf[cur++]
    val |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return { value: val, next: cur }
    shift += 7
  }
  return null
}

export function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = []
  let v = value >>> 0
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  bytes.push(v)
  return Uint8Array.from(bytes)
}

export function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>>
    0
  )
}

export type GilFileHeader = {
  schema: number
  headTag: number
  fileType: number
  tailTag: number
}

/** 拼装 .gil 文件：uint32(4) 总长 + uint32 头字段 + payload + uint32 尾 tag。 */
export function buildFile(payload: Uint8Array, header: GilFileHeader): Uint8Array {
  const buffer = Buffer.alloc(payload.length + 24)
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  view.setUint32(0, payload.length + 20, false)
  view.setUint32(4, header.schema, false)
  view.setUint32(8, header.headTag, false)
  view.setUint32(12, header.fileType, false)
  view.setUint32(16, payload.length, false)
  Buffer.from(payload).copy(buffer, 20)
  view.setUint32(buffer.length - 4, header.tailTag, false)
  return buffer
}

/** 解析 .gil 文件容器，返回头与 payload（20 字节头之后、尾 tag 之前）。 */
export function parseGilFile(bytes: Uint8Array): { header: GilFileHeader; payload: Uint8Array } {
  if (bytes.length < 24) throw new Error('[error] invalid GIL size')
  return {
    header: {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4)
    },
    payload: bytes.slice(20, -4)
  }
}
