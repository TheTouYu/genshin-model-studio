/**
 * Vercel serverless function — POST /api/export?format=gil|gia
 * 导出 .gil 候选或 .gia 文件（复用本地 web/server.ts 同一逻辑）
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolveStructure } from '../src/core/structure.js'
import { encodeStructure } from '../src/core/encoder.js'
import { encodeGia } from '../src/gia/gia-encoder.js'
import { toGiaInput, attachmentName } from '../src/web-shared.js'

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('method not allowed')
    return
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    try {
      const { data }: { data: any } = JSON.parse(body)
      const format = new URL(req.url ?? '/', 'http://localhost').searchParams.get('format') || 'gil'
      let bytes, filename, contentType
      if (format === 'gia') {
        bytes = encodeGia(toGiaInput(data))
        filename = `${data.model?.name ?? data.name ?? 'model'}.gia`
        contentType = 'application/octet-stream'
      } else {
        const resolved = resolveStructure(data)
        bytes = encodeStructure(resolved)
        filename = `${resolved.name}.gil`
        contentType = 'application/octet-stream'
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Disposition': attachmentName(filename),
        'Content-Length': bytes.length,
      })
      res.end(Buffer.from(bytes))
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`导出失败: ${(e as Error).message}`)
    }
  })
}
