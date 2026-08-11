/**
 * Vercel serverless function — GET /api/examples
 * 示例列表（真实 item 数）
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { exampleMeta } from '../src/web-shared.js'

export default function handler(_req: IncomingMessage, res: ServerResponse) {
  try {
    const out = exampleMeta()
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(out, null, 2))
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`examples list failed: ${(e as Error).message}`)
  }
}
