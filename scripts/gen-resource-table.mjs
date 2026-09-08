#!/usr/bin/env node
/**
 * gen-resource-table.mjs — 官方基础元件资源表单一来源，生成/校验三处文档资源行。
 *
 * 用途：让 `src/core/official-resources.ts`（名称）+ `src/core/resource-meta.ts`（语义）
 * 成为唯一权威，把分散的 `docs/input-format.md` / `README.md` 资源表收敛回同一来源，
 * 杜绝手抄漂移（尤其「未校准项被标成已闭合」）。
 *
 * 运行（先构建，确保 dist 是最新）：
 *   npm run build --silent && node scripts/gen-resource-table.mjs            # 校验（drift 则非零退出）
 *   npm run build --silent && node scripts/gen-resource-table.mjs --write   # 同步（仅插入缺失行，升序；不改既有行/表头/脚注）
 *
 * 约束：只为缺失 resID 在升序位置插入规范行；不改动任何既有行、表头、分隔行、脚注、
 * 「状态/已闭合/未校准」列与周边注释。README 的「10009010/11」合并行视为同时覆盖
 * 10009010 与 10009011（不拆分、不删除）。幂等：连续两次 --write 结果一致。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const DIST = new URL('../dist/src/core/resource-meta.js', import.meta.url)
let rows
try {
  rows = (await import(DIST.href)).canonicalResourceRows()
} catch {
  console.error('[error] 请先构建再运行：npm run build --silent && node scripts/gen-resource-table.mjs')
  process.exit(2)
}
rows = [...rows].sort((a, b) => a.resourceId - b.resourceId)

const INPUT_FORMAT = new URL('../docs/input-format.md', import.meta.url)
const README = new URL('../README.md', import.meta.url)

/** input-format.md 规范行（5 列：resID / 元件 / scale 语义 / 零旋转局部基 / 状态）。 */
function inputRow(r) {
  return `| \`${r.resourceId}\` | ${r.name} | ${r.scaleSemantics} | ${r.localBasis} | ${r.status} |`
}
/** README 规范行（3 列：resID / 元件 / 尺寸语义）。 */
function readmeRow(r) {
  return `| ${r.resourceId} | ${r.name} | ${r.readmeSemantics} |`
}

/** 数据行判定：单独 ID 或合并 ID（如 10009010/11）。返回捕获的 { id, suffix }。 */
function matchRow(line) {
  const m = /^\|\s*`?(\d+)`?(\/\d+)?\s*\|/.exec(line.trim())
  if (!m) return null
  return { id: m[1], suffix: m[2] ? m[2].slice(1) : null }
}

/** 展开合并 ID 单元格为若干独立 ID：'10009010/11' → ['10009010','10009011']。 */
function expandIds(id, suffix) {
  if (suffix === null) return [id]
  const second = id.slice(0, id.length - suffix.length) + suffix
  return [id, second]
}

function dataRowIndexes(lines) {
  const idx = []
  lines.forEach((line, i) => {
    if (matchRow(line)) idx.push(i)
  })
  return idx
}

function normalize(s) {
  return s.replace(/`/g, '').replace(/\s+/g, '')
}

/** `--write`：只为缺失 resID 在升序位置插入规范行；不改既有行。 */
function syncTable(text, makeRow, fileLabel) {
  const lines = text.split('\n')
  const idx = dataRowIndexes(lines)
  const present = new Set()
  const presentName = new Map()
  for (const i of idx) {
    const { id, suffix } = matchRow(lines[i])
    const cells = lines[i].slice(1, -1).split('|').map((c) => c.trim())
    for (const gid of expandIds(id, suffix)) {
      present.add(gid)
      presentName.set(gid, cells[1])
    }
  }
  const missing = rows.filter((r) => !present.has(String(r.resourceId)))
  let inserted = 0
  for (const r of missing) {
    const id = String(r.resourceId)
    // 找到第一个 resID > id 的数据行，在其前插入。
    const currentIdx = dataRowIndexes(lines)
    let insertAt = currentIdx.length ? currentIdx[currentIdx.length - 1] + 1 : lines.length
    for (const li of currentIdx) {
      const mr = matchRow(lines[li])
      if (mr && Number(mr.id) > Number(id)) {
        insertAt = li
        break
      }
    }
    lines.splice(insertAt, 0, makeRow(r))
    inserted++
  }
  if (inserted === 0) {
    console.log(`${fileLabel}: 已同步（无缺失行）`)
  } else {
    console.log(`${fileLabel}: 插入缺失行 ${missing.map((r) => r.resourceId).join(', ')}`)
  }
  return lines.join('\n')
}

/** `--check`：校验每行名称（与状态列，若为 5 列表）与权威一致；不修改文件。 */
function checkTable(text, fileLabel) {
  const lines = text.split('\n')
  const present = new Set() // 单独 id
  const rowsInfo = new Map() // id → { name, status?, combined? }
  for (const i of dataRowIndexes(lines)) {
    const { id, suffix } = matchRow(lines[i])
    const cells = lines[i].slice(1, -1).split('|').map((c) => c.trim())
    for (const gid of expandIds(id, suffix)) {
      present.add(gid)
      rowsInfo.set(gid, { name: cells[1], combined: suffix !== null, status: cells.length >= 5 ? cells[4] : undefined })
    }
  }
  const canonicalIds = new Set(rows.map((r) => String(r.resourceId)))
  const problems = []
  for (const r of rows) {
    const id = String(r.resourceId)
    if (!present.has(id)) {
      problems.push(`${fileLabel}: 缺少资源行 ${id}（${r.name}）`)
      continue
    }
    const info = rowsInfo.get(id)
    if (info && !info.combined && normalize(info.name) !== normalize(r.name)) {
      problems.push(`${fileLabel}: ${id} 名称不一致：文档「${info.name}」vs 权威「${r.name}」`)
    }
    if (info && info.status !== undefined) {
      const docStatus = info.status
      if (normalize(docStatus) !== normalize(r.status)) {
        problems.push(`${fileLabel}: ${id} 状态不一致：文档「${docStatus}」vs 权威「${r.status}」（未校准不得标成已闭合）`)
      }
    }
  }
  const unknown = [...present].filter((id) => !canonicalIds.has(id))
  for (const id of unknown) problems.push(`${fileLabel}: 文档含权威表之外的数据行 ${id}`)
  return problems
}

const writeMode = process.argv.includes('--write')

if (writeMode) {
  const input = readFileSync(INPUT_FORMAT, 'utf8')
  const readme = readFileSync(README, 'utf8')
  writeFileSync(INPUT_FORMAT, syncTable(input, inputRow, 'docs/input-format.md'), 'utf8')
  writeFileSync(README, syncTable(readme, readmeRow, 'README.md'), 'utf8')
} else {
  const input = readFileSync(INPUT_FORMAT, 'utf8')
  const readme = readFileSync(README, 'utf8')
  const problems = [...checkTable(input, 'docs/input-format.md'), ...checkTable(readme, 'README.md')]
  if (problems.length) {
    console.error(problems.join('\n'))
    console.error(`[fail] 资源表与权威来源存在 ${problems.length} 处漂移（未校准项不得标成已闭合）`)
    process.exit(1)
  }
  console.log('资源表三处与权威来源一致：docs/input-format.md + README.md + official-resources.ts')
}
