/**
 * 资源表单一来源一致性测试（防再漂移）。
 *
 * 权威来源：`src/core/official-resources.ts`（名称）+ `src/core/resource-meta.ts`（语义/状态）。
 * 约束：docs/input-format.md 与 README.md 的资源表必须与权威一致——
 *   - 名称一致（元件列）；
 *   - 状态一致（「未校准」不得被标成「已闭合」）；
 *   - 资源 ID 集合不缺失、不超出。
 * 任何文档手抄或误标（如把未校准项标成已闭合）都会让本测试失败。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { canonicalResourceRows } from '../src/core/resource-meta.js'
import { officialPrefabName } from '../src/core/official-resources.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
function findRoot(dir: string): string {
  return existsSync(path.join(dir, 'package.json')) ? dir : findRoot(path.dirname(dir))
}
const ROOT = findRoot(HERE)

const rows = canonicalResourceRows()
const canonicalById = new Map(rows.map((r) => [String(r.resourceId), r]))

function normalize(s: string): string {
  return s.replace(/`/g, '').replace(/\s+/g, '')
}

/** 解析 input-format.md 的 5 列资源表数据行；README 的 3 列资源表数据行。 */
function parseDocRows(file: string): Map<string, { name: string; status?: string; combined?: boolean }> {
  const text = readFileSync(path.join(ROOT, file), 'utf8')
  const result = new Map<string, { name: string; status?: string; combined?: boolean }>()
  for (const line of text.split('\n')) {
    const m = /^\|\s*`?(\d+)(\/\d+)?`?\s*\|/.exec(line.trim())
    if (!m) continue
    const cells = line.trim().slice(1, -1).split('|').map((c) => c.trim())
    if (cells.length < 2) continue
    const id = m[1]
    if (m[2]) {
      // README 合并行（10009010/11）：同时覆盖两个 id；名称合并压缩，不逐 ID 比对。
      const suffix = m[2].slice(1)
      const second = m[1].slice(0, m[1].length - suffix.length) + suffix
      for (const gid of [m[1], second]) {
        result.set(gid, { name: cells[1], combined: true })
      }
      continue
    }
    result.set(id, { name: cells[1], status: cells.length >= 5 ? cells[4] : undefined })
  }
  return result
}

test('resource-table: official-resources 登记 10009012 / 10009019 名称', () => {
  assert.equal(officialPrefabName(10009012), '开口薄壁圆柱')
  assert.equal(officialPrefabName(10009019), '网格')
})

test('resource-table: 权威名称与官方名表逐一一致（无未登记资源）', () => {
  for (const row of rows) {
    const name = officialPrefabName(row.resourceId)
    assert.notEqual(name, undefined, `resource ${row.resourceId} 未在 official-resources.ts 登记`)
    assert.equal(row.name, name, `resource ${row.resourceId} 名称不一致`)
  }
})

test('resource-table: docs/input-format.md 资源行与权威一致（ID 集 / 名称 / 状态）', () => {
  const doc = parseDocRows('docs/input-format.md')
  const extraIds = [...doc.keys()].filter((k) => !canonicalById.has(k))
  assert.deepEqual(extraIds, [], 'docs/input-format.md 含权威表之外的资源行')
  for (const row of rows) {
    const id = String(row.resourceId)
    assert.ok(doc.has(id), `docs/input-format.md 缺少资源行 ${id}`)
    assert.equal(
      normalize(doc.get(id)!.name),
      normalize(row.name),
      `docs/input-format.md ${id} 名称不一致`
    )
    assert.equal(
      normalize(doc.get(id)!.status ?? ''),
      normalize(row.status),
      `docs/input-format.md ${id} 状态不一致（未校准不得标成已闭合）`
    )
  }
})

test('resource-table: README.md 资源行与权威一致（ID 集 / 名称）', () => {
  const doc = parseDocRows('README.md')
  const extraIds = [...doc.keys()].filter((k) => !canonicalById.has(k))
  assert.deepEqual(extraIds, [], 'README.md 含权威表之外的资源行')
  for (const row of rows) {
    const id = String(row.resourceId)
    assert.ok(doc.has(id), `README.md 缺少资源行 ${id}`)
    if (!doc.get(id)!.combined) {
      assert.equal(
        normalize(doc.get(id)!.name),
        normalize(row.name),
        `README.md ${id} 名称不一致`
      )
    }
  }
})

test('resource-table: 10009012 / 10009019 已登记且未校准（防误标已闭合）', () => {
  for (const id of [10009012, 10009019]) {
    const row = canonicalById.get(String(id))!
    assert.equal(row.name, id === 10009012 ? '开口薄壁圆柱' : '网格')
    assert.equal(row.status, '未校准', `resource ${id} 未游戏内验证，不得标成已闭合`)
  }
})
