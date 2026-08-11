/**
 * Vercel serverless function — POST /api/draw-model
 * 画线建模：strokes + options → { items(已拍平), fitted, closed }
 * 与本地 web/server.ts 共用 src/web-shared.ts 的 parseDrawModelRequest / drawModelResult。
 *
 * 挂载路径注意：@vercel/node 的挂载路径 = 文件名（本文件命名为 draw-model.ts 才能挂到
 * 前端 fetch 的 /api/draw-model；文件名若为 draw.ts 则挂 /api/draw，线上 404）。
 * 下方 config 仅作同值双保险（当前 CLI 58.4.4 的构建器只读取 architecture/useWebApi/
 * maxDuration/regions/runtime，不读取 path，产物路径以文件名为准）。
 */
export const config = { path: '/api/draw-model' }

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
