/**
 * Vercel serverless function — POST /api/draw-model
 * 画线建模：strokes + options → { items(已拍平), fitted, closed }
 * 与本地 web/server.ts 共用 src/web-shared.ts 的 parseDrawModelRequest / drawModelResult。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { drawModelResult, parseDrawModelRequest } from '../src/web-shared.js'

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
      const { strokes, options } = parseDrawModelRequest(body)
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(drawModelResult(strokes, options)))
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end((e as Error).message)
    }
  })
}
