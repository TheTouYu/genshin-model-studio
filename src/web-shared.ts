/**
 * web-shared.ts — 网页与 Vercel functions 共享的逻辑（零依赖）
 *
 * 本地 `web/server.ts` 与 serverless `api/*.ts` 都从这里复用：
 * 示例枚举、item 计数、GIA 输入补全、下载文件名、Markdown 渲染、文档页。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname, basename } from 'node:path'

export const EXAMPLES = join(process.cwd(), 'examples')

export const DOCS_FILES: Record<string, string> = {
  'README.md': join(process.cwd(), 'README.md'),
  'docs/input-format.md': join(process.cwd(), 'docs', 'input-format.md'),
  'docs/gia-format.md': join(process.cwd(), 'docs', 'gia-format.md'),
}

export function listExamples(): string[] {
  return readdirSync(EXAMPLES)
    .filter((f) => extname(f) === '.json' && !f.includes('.structure.') && !f.includes('.summary.'))
    .sort()
}

/** 真实 item 数：GIA 嵌套格式（model.items）与扁平 structure 格式（items）都支持。 */
export function countItems(data: any): number {
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
export function toGiaInput(data: any) {
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
export function attachmentName(name: string): string {
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

function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_m, code: string) => `<code>${escapeHtml(code)}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
      const clean = url.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      const safe = /^(https?:)?\/\//.test(clean) || clean.startsWith('#') || !/^[a-z][a-z0-9+.-]*:/i.test(clean)
      return safe ? `<a href="${escapeHtml(clean)}">${label}</a>` : escapeHtml(label)
    })
}

function tableRow(line: string, header: boolean): string {
  const cells = line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())
  const tag = header ? 'th' : 'td'
  return `<tr>${cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`
}

function isTableSeparator(line: string): boolean {
  return /^\|?[\s:|-]+\|?$/.test(line.trim()) && line.includes('-') && line.trim().replace(/[\s|:-]/g, '') === ''
}

export function renderMarkdown(source: string): string {
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

export function docsPage(fileKey: string): string {
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

/** 枚举示例元数据（示例列表用） */
export function exampleMeta(): { name: string; file: string; size: number; items: number }[] {
  return listExamples().map((f) => {
    const p = join(EXAMPLES, f)
    const size = statSync(p).size
    const data = JSON.parse(readFileSync(p, 'utf8')) as any
    return { name: basename(f, '.json'), file: f, size, items: countItems(data) }
  })
}
