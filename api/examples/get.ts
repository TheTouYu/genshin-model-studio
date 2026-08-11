/**
 * Vercel serverless function — GET /api/examples/get?name=<示例名>
 * 单个示例内容（用 query 参数而非 [name] 动态路由，避免 lambda handler 文件名特殊字符问题）
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { EXAMPLES } from '../../src/web-shared.js'

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const name = url.searchParams.get('name') ?? ''
    const file = join(EXAMPLES, name.endsWith('.json') ? name : name + '.json')
    if (!file.startsWith(join(EXAMPLES)) || !file.endsWith('.json')) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('bad example name')
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(readFileSync(file))
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`example not found: ${(e as Error).message}`)
  }
}
