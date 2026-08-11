/**
 * Vercel serverless function — GET /docs?file=...
 * Markdown 文档页渲染
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { DOCS_FILES, docsPage } from '../src/web-shared.js'

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const fileKey = url.searchParams.get('file') ?? 'README.md'
    if (!(fileKey in DOCS_FILES)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`unknown doc file: ${fileKey}`)
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(docsPage(fileKey))
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`docs render failed: ${(e as Error).message}`)
  }
}
