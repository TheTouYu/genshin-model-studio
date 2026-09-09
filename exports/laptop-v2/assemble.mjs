// assemble.mjs —— v2 拼装（数值序）→ work.json / items.json / summary.json
//
// 为什么不用 scripts/run-gms-parts.sh 的内置拼装：它按 `sorted(glob(part*.json))` 的**字典序**拼
// （part1, part10, part11, part12, part13, part2, ...），item 顺序与 spec-v2.json 的生成顺序错位，
// 独立 AABB 复算无法逐件对位（实测 2026-09-08：items[83] 是脚垫而非 key_r0c4_r）。
// 本脚本按数值序 part1..partN 拼装，POST /api/draw-model，落盘 work.json/items.json/summary.json。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = '/home/h/genshin-model-studio'
const OUT = join(ROOT, 'exports/laptop-v2')
const URL = 'http://localhost:8787/api/draw-model'

const num = (f) => Number((f.match(/part(\d+)\.json$/) || [])[1] || 0)
const files = readdirSync(join(OUT, 'parts')).filter((f) => /^part\d+\.json$/.test(f)).sort((a, b) => num(a) - num(b))
const works = files.map((f) => JSON.parse(readFileSync(join(OUT, 'parts', f), 'utf8')))
const strokes = []
const seen = new Set()
let dup = 0
for (const w of works) {
  for (const s of w.strokes) {
    if (seen.has(s.id)) { s.id = `${s.id}_x${dup++}` }
    seen.add(s.id)
    strokes.push(s)
  }
}
const composed = { version: 3, strokes, options: works[0].options }
writeFileSync(join(OUT, 'work.json'), JSON.stringify(composed))
const res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(composed) })
if (!res.ok) { console.error('POST /api/draw-model FAILED', res.status, await res.text()); process.exit(1) }
const items = (await res.json()).items
writeFileSync(join(OUT, 'items.json'), JSON.stringify(items))
const hist = {}
for (const it of items) hist[it.resourceId] = (hist[it.resourceId] || 0) + 1
const summary = { ok: true, strokes: strokes.length, items: items.length, parts: works.length, resources: hist }
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log('ASSEMBLE:', JSON.stringify(summary))
if (strokes.length !== items.length) { console.error('STROKE/ITEM 数量不等 —— 有笔画未生成元件'); process.exit(1) }
