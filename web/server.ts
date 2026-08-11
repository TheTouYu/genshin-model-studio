/**
 * genshin-model-studio 最小网页服务器（零依赖，node:http）
 *
 *   npm run web
 *   打开 http://localhost:8787
 *
 * 端点：
 *   GET  /                            页面
 *   GET  /api/examples                示例列表（examples/*.json，含真实 item 数）
 *   GET  /api/examples/<name>         单个示例内容
 *   POST /api/export?format=gil|gia   { data: <structure.json 超集 或 GIA 嵌套输入> } → 文件字节
 *   GET  /docs?file=README.md         Markdown 文档渲染（README.md / docs/*.md）
 */
import { createServer } from 'node:http'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { resolveStructure } from '../src/core/structure.js'
import { encodeStructure } from '../src/core/encoder.js'
import { encodeGia } from '../src/gia/gia-encoder.js'

const ROOT = process.cwd()
const EXAMPLES = join(ROOT, 'examples')
const PORT = Number(process.env.PORT || 8787)

/** 文档白名单：file 参数只接受这些键（防路径穿越）。 */
const DOCS_FILES: Record<string, string> = {
  'README.md': join(ROOT, 'README.md'),
  'docs/input-format.md': join(ROOT, 'docs', 'input-format.md'),
  'docs/gia-format.md': join(ROOT, 'docs', 'gia-format.md'),
}

function send(res: import('node:http').ServerResponse, code: number, body: string | Uint8Array, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type })
  res.end(body)
}

function listExamples() {
  return readdirSync(EXAMPLES)
    .filter((f) => extname(f) === '.json' && !f.includes('.structure.') && !f.includes('.summary.'))
    .sort()
}

/** 真实 item 数：GIA 嵌套格式（model.items）与扁平 structure 格式（items）都支持。 */
function countItems(data: any): number {
  if (data && Array.isArray(data.model?.items)) return data.model.items.length
  if (data && Array.isArray(data.items)) return data.items.length
  return 0
}

/**
 * 把输入补全成 GIA 编码器要求的输入（id/unitId/filePath）。支持两种格式：
 * - GIA 嵌套格式（examples/football.json、examples/equiangular-spiral.json）：
 *   { schemaVersion, model: { name, unitId, templatePrefabId, rootTransform, items[] }, file }
 * - 扁平 structure 格式（examples/house.json 等）：
 *   { name, prefabId, templatePrefabId, position, rotation, scale, items[], filePath }
 */
function toGiaInput(data: any) {
  const model = data.model ?? {}
  const rawItems = Array.isArray(model.items) ? model.items : data.items ?? []
  const items = rawItems.map((it: any, i: number) => ({
    id: it.id ?? 1073741824 + i + 1,
    resourceId: it.resourceId,
    name: it.name ?? `装饰物_${i + 1}`,
    position: it.position ?? [0, 0, 0],
    rotation: it.rotation ?? [0, 0, 0],
    scale: it.scale ?? [1, 1, 1],
    color: it.color,
  }))
  const name = model.name || data.name || 'model'
  const rootTransform = model.rootTransform ?? {}
  return {
    schemaVersion: data.schemaVersion ?? 1,
    model: {
      name,
      unitId: model.unitId ?? data.prefabId ?? 1077936129,
      templatePrefabId: model.templatePrefabId ?? data.templatePrefabId ?? 10005018,
      rootTransform: {
        position: rootTransform.position ?? data.position ?? [0, 0, 0],
        rotation: rootTransform.rotation ?? data.rotation ?? [0, 0, 0],
        scale: rootTransform.scale ?? data.scale ?? [1, 1, 1],
      },
      items,
    },
    file: {
      filePath: data.file?.filePath ?? data.filePath ?? `{UID}-{TIME}-{LEVEL_ID}-${name}.gia`,
      gameVersion: data.file?.gameVersion ?? '6.7.0',
    },
  }
}

/** Content-Disposition 头只允许可打印 ASCII：非 ASCII 文件名用 RFC 5987 filename* 携带。 */
function attachmentName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'model'
  const encoded = encodeURIComponent(name).replace(/'/g, '%27')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

/* ============================ 最小 Markdown 渲染器（零依赖） ============================ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 行内格式（输入须已转义）：[text](url)、**bold**、`code`。 */
function inline(text: string): string {
  // 链接：只放行 http(s)/#/相对路径；其余协议（javascript: 等）保持纯文本。
  text = text.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
    const clean = url.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    const safe = /^(https?:)?\/\//.test(clean) || clean.startsWith('#') || !/^[a-z][a-z0-9+.-]*:/i.test(clean)
    return safe ? `<a href="${escapeHtml(clean)}">${label}</a>` : m
  })
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
  return text
}

/** 表格行 → <tr>；表头加 <th>。 */
function tableRow(line: string, header: boolean): string {
  const cells = line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
  const tag = header ? 'th' : 'td'
  return `<tr>${cells.map((cell) => `<${tag}>${inline(cell)}</${tag}>`).join('')}</tr>`
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s:|-]+\|$/.test(line.trim())
}

/** 渲染 Markdown（标题 / 围栏代码块 / 表格 / 链接 / 行内 code/bold / 引用 / 分隔线）。 */
function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // 围栏代码块 ```lang ... ```
    const fence = line.match(/^```(\S*)\s*$/)
    if (fence) {
      const lang = fence[1]
      const code: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(escapeHtml(lines[i]))
        i++
      }
      i++ // 跳过闭合围栏
      out.push(`<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${code.join('\n')}</code></pre>`)
      continue
    }

    // 表格：连续的 | 行，且第二行是分隔行
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = tableRow(line, true)
      i += 2
      const rows: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(tableRow(lines[i], false))
        i++
      }
      out.push(`<table><thead>${header}</thead><tbody>${rows.join('')}</tbody></table>`)
      continue
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      i++
      continue
    }

    // 引用块
    if (line.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) {
        quote.push(inline(lines[i].replace(/^>\s?/, '')))
        i++
      }
      out.push(`<blockquote>${quote.join('<br>')}</blockquote>`)
      continue
    }

    // 分隔线
    if (/^\s*---+\s*$/.test(line)) {
      out.push('<hr>')
      i++
      continue
    }

    // 列表（简单支持：- / * 无序项）
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`)
        i++
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    // 普通段落
    if (line.trim() !== '') {
      const para: string[] = []
      while (i < lines.length && lines[i].trim() !== '' && !/^```/.test(lines[i])) {
        const l = lines[i]
        if (/^(#{1,6})\s+/.test(l) || l.trim().startsWith('|') || /^\s*[-*]\s+/.test(l)) break
        para.push(inline(l))
        i++
      }
      out.push(`<p>${para.join(' ')}</p>`)
      continue
    }

    i++
  }
  return out.join('\n')
}

function docsPage(fileKey: string): string {
  const file = DOCS_FILES[fileKey] ?? DOCS_FILES['README.md']
  const source = readFileSync(file, 'utf8')
  const title = fileKey.replace(/\.md$/, '').replace(/^docs\//, '')
  const body = renderMarkdown(source)
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} — Genshin Model Studio</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: #222; line-height: 1.6; }
  pre { background: #f5f5f5; padding: 0.8rem; overflow-x: auto; border-radius: 4px; }
  code { background: #f5f5f5; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.9em; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; margin: 1rem 0; }
  th, td { border: 1px solid #ccc; padding: 0.35rem 0.7rem; text-align: left; }
  blockquote { border-left: 3px solid #ccc; margin: 1rem 0; padding: 0 0.8rem; color: #555; }
  a { color: #0366d6; }
  .back { margin: 1rem 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1.5rem 0; }
</style>
</head>
<body>
<div class="back"><a href="/">&larr; 返回编辑器</a></div>
${body}
</body>
</html>`
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
    const names = listExamples()
    const out = names.map((f) => {
      const p = join(EXAMPLES, f)
      const size = statSync(p).size
      const data = JSON.parse(readFileSync(p, 'utf8'))
      return { name: basename(f, '.json'), file: f, size, items: countItems(data) }
    })
    send(res, 200, JSON.stringify(out, null, 2), 'application/json')
    return
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/examples/')) {
    const name = decodeURIComponent(url.pathname.slice('/api/examples/'.length))
    const file = join(EXAMPLES, name.endsWith('.json') ? name : name + '.json')
    if (!file.startsWith(EXAMPLES) || extname(file) !== '.json') {
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
