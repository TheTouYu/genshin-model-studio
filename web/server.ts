/**
 * genshin-model-studio 本地网页服务器（零依赖，node:http）
 *
 *   npm run web
 *   打开 http://localhost:8787
 *
 * Vercel 部署版使用 api/*.ts serverless functions（同一套共享逻辑 src/web-shared.ts）。
 * 端点与 serverless 版一一对应：
 *   GET  /                       页面
 *   GET  /api/examples           示例列表
 *   GET  /api/examples/<name>    单个示例
 *   POST /api/export?format=gil|gia    导出文件
 *   GET  /docs?file=...          文档页（Markdown 渲染）
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveStructure } from '../src/core/structure.js'
import { encodeStructure } from '../src/core/encoder.js'
import { encodeGia } from '../src/gia/gia-encoder.js'
import {
  DOCS_FILES,
  exampleMeta,
  toGiaInput,
  attachmentName,
  docsPage,
} from '../src/web-shared.js'

const ROOT = process.cwd()
const PORT = Number(process.env.PORT || 8787)

function send(res: import('node:http').ServerResponse, code: number, body: string | Uint8Array, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type })
  res.end(body)
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (req.method === 'GET' && url.pathname === '/') {
    send(res, 200, readFileSync(join(ROOT, 'web', 'index.html')), 'text/html; charset=utf-8')
    return
  }
  if (req.method === 'GET' && url.pathname === '/docs') {
    try {
      const fileKey = url.searchParams.get('file') ?? 'README.md'
      if (!(fileKey in DOCS_FILES)) {
        send(res, 404, `unknown doc file: ${fileKey}`)
        return
      }
      send(res, 200, docsPage(fileKey), 'text/html; charset=utf-8')
    } catch (e) {
      send(res, 500, `docs render failed: ${(e as Error).message}`)
    }
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/examples') {
    send(res, 200, JSON.stringify(exampleMeta(), null, 2), 'application/json')
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/examples/get') {
    const name = url.searchParams.get('name') ?? ''
    const file = join(ROOT, 'examples', name.endsWith('.json') ? name : name + '.json')
    if (!file.startsWith(join(ROOT, 'examples')) || !file.endsWith('.json')) {
      send(res, 400, 'bad example name')
      return
    }
    send(res, 200, readFileSync(file), 'application/json')
    return
  }
  if (req.method === 'POST' && url.pathname === '/api/export') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        const { data }: { data: any } = JSON.parse(body)
        const format = url.searchParams.get('format') || 'gil'
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
        send(res, 400, `导出失败: ${(e as Error).message}`)
      }
    })
    return
  }
  send(res, 404, 'not found')
})

server.listen(PORT, () => {
  console.log(`genshin-model-studio web: http://localhost:${PORT}`)
})
