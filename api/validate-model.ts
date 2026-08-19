/**
 * Vercel serverless function — POST /api/validate-model
 * 结构健康校验（+ 可选保守修复）：structure → { ok, violations[], fixes[], unresolved[], items }
 * 论文范式（ADR-0003 提案 b）：生成后跑不变量校验并自动修复，修复不了的如实报告。
 * 与本地 web/server.ts 共用 src/web-shared.ts 的 validateModelResult。
 *
 * 挂载路径注意：@vercel/node 的挂载路径 = 文件名（与 draw-model.ts 同理）。
 */
export const config = { path: '/api/validate-model' }

import type { IncomingMessage, ServerResponse } from 'node:http'
import { validateModelResult } from '../src/web-shared.js'

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
      const result = validateModelResult(body) // 先校验（可能抛错），再写响应头
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(result))
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end((e as Error).message)
    }
  })
}
