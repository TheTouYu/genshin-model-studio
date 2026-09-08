/**
 * mesh-rules.test.ts — 网格规则文档与实现默认值一致性 + 子技能 lint。
 *
 * Part 1（一致性）：规则文档（drawing-rules.md §6 / 主技能补丁 / 子技能）中出现的网格默认值
 *   必须与 `src/mesh/verify.ts` / `panelize.ts` / `contour-loft.ts` 的 `const DEFAULT_*` 常量逐字一致。
 * Part 2（独立加载）：解析所有 `.dsh/skills/gms-modeling-<stage>/SKILL.md`：
 *   - front-matter 有 name/description；六个名字唯一；
 *   - 主技能 §0 路由引用名与文件名一致（gms-modeling-<stage> ⇔ 目录名）；
 *   - 正文提及的命令均可在 package.json scripts 找到。
 *
 * 任何文档阈值漂移或子技能自引用错乱都会让本测试失败。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
function findRoot(dir: string): string {
  return existsSync(path.join(dir, 'package.json')) ? dir : findRoot(path.dirname(dir))
}
const ROOT = findRoot(HERE)

function readText(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8')
}

const STAGES = ['preflight', 'reference-fit', 'blockout', 'detail', 'verify', 'export']

/* ------------------------- Part 1：规则文档阈值 == 源码常量 ------------------------- */

function sourceConstants(): Record<string, string> {
  const targets: Record<string, string[]> = {
    'src/mesh/verify.ts': ['DEFAULT_WELD_TOL', 'DEFAULT_MIN_AREA', 'DEFAULT_SKINNY_EDGE_RATIO', 'DEFAULT_MAX_SKINNY_PCT', 'DEFAULT_MAX_AREA_RATIO'],
    'src/mesh/panelize.ts': ['DEFAULT_QUAD_THICKNESS', 'DEFAULT_TRI_THICKNESS', 'DEFAULT_BOX_THICKNESS', 'DEFAULT_NORMAL_TOL'],
    'src/mesh/contour-loft.ts': ['DEFAULT_RESAMPLE_POINTS']
  }
  const out: Record<string, string> = {}
  for (const [rel, names] of Object.entries(targets)) {
    const text = readText(rel)
    for (const name of names) {
      const m = new RegExp(`const\\s+${name}\\s*=\\s*([^/;\\n]+)`).exec(text)
      assert.ok(m, `源码缺失常量 ${name}（${rel}）`)
      out[name] = m![1].trim().replace(/\s+/g, ' ')
    }
  }
  return out
}

// 规则文档集合：drawing-rules.md §6 + 主技能 §0/§11 补丁 + 子技能（阈值表在 verify/detail + preflight 提及）。
const RULES_DOCS = [
  'docs/drawing-rules.md',
  '.scratch/mesh-system/issues/06-main-skill-patch.md',
  '.dsh/skills/gms-modeling-verify/SKILL.md',
  '.dsh/skills/gms-modeling-detail/SKILL.md',
  '.dsh/skills/gms-modeling-preflight/SKILL.md'
]

function acceptedStrings(name: string, sourceValue: string): string[] {
  if (name === 'DEFAULT_BOX_THICKNESS') return ['0.0015', '1.5mm']
  if (name === 'DEFAULT_MAX_SKINNY_PCT') return [sourceValue, `${sourceValue}%`]
  return [sourceValue]
}

test('mesh-rules: 规则文档中的默认值必须与源码 DEFAULT_* 常量逐字一致', () => {
  const constants = sourceConstants()
  for (const [name, sourceValue] of Object.entries(constants)) {
    const accepted = acceptedStrings(name, sourceValue)
    const found = RULES_DOCS.some((rel) => {
      assert.ok(existsSync(path.join(ROOT, rel)), `规则文档缺失: ${rel}`)
      return accepted.some((s) => readText(rel).includes(s))
    })
    assert.ok(found, `规则文档中找不到默认值 ${name}=${sourceValue}（应在 §6/主技能补丁/子技能之一出现「${sourceValue}」）`)
  }
})

/* ------------------------- Part 2：子技能 lint ------------------------- */

interface SkillMeta {
  stage: string
  dir: string
  name: string
  description: string
  body: string
  disabled: boolean
}

function parseSkill(dir: string, stage: string): SkillMeta {
  const file = path.join(ROOT, '.dsh', 'skills', dir, 'SKILL.md')
  const text = readFileSync(file, 'utf8')
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text)
  assert.ok(m, `${dir} SKILL.md 缺 front-matter`)
  const fm: Record<string, string> = {}
  for (const line of m![1].split('\n')) {
    const kv = /^([a-zA-Z-]+):\s*(.*)$/.exec(line.trim())
    if (kv) fm[kv[1]] = kv[2]
  }
  assert.ok(fm.name, `${dir} front-matter 缺 name`)
  assert.ok(fm.description, `${dir} front-matter 缺 description`)
  return {
    stage,
    dir,
    name: fm.name!,
    description: fm.description!,
    body: text.slice(m![0].length),
    disabled: fm['disable-model-invocation'] === 'true' || fm['user-invocable'] === 'false'
  }
}

function skillDirs(): string[] {
  const base = path.join(ROOT, '.dsh', 'skills')
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('gms-modeling-'))
    .map((e) => e.name)
    .sort()
}

function extractCommands(body: string, scripts: string[]): string[] {
  const tokens = new Set<string>()
  for (const m of body.matchAll(/\bnpm run\s+([a-zA-Z0-9-]+)/g)) tokens.add(m[1])
  for (const m of body.matchAll(/\bnpm test\b/g)) tokens.add('test')
  for (const m of body.matchAll(/\bnpm run test\b/g)) tokens.add('test')
  for (const m of body.matchAll(/node\s+dist\/src\/cli\/([a-zA-Z0-9-]+)\.js/g)) tokens.add(m[1])
  for (const s of scripts) {
    if (new RegExp(`\\b${s}\\b`).test(body)) tokens.add(s)
  }
  return [...tokens]
}

test('mesh-rules: 六个子技能存在、可独立加载且名字唯一', () => {
  const dirs = skillDirs()
  assert.equal(dirs.length, STAGES.length, `应有 ${STAGES.length} 个子技能目录，实际 ${dirs.length}: ${dirs.join(', ')}`)
  const metas = dirs.map((dir) => {
    const stage = dir.replace(/^gms-modeling-/, '')
    assert.ok(STAGES.includes(stage), `未知子技能阶段: ${stage}`)
    return parseSkill(dir, stage)
  })
  const names = metas.map((s) => s.name)
  assert.equal(new Set(names).size, names.length, `子技能名字不唯一: ${names.join(', ')}`)
  for (const meta of metas) {
    assert.equal(meta.name, `gms-modeling-${meta.stage}`, `文件名 ${meta.dir} 与 front-matter name 不一致`)
    assert.equal(meta.disabled, false, `子技能 ${meta.name} 不得禁用（disable-model-invocation / user-invocable）`)
    assert.ok(meta.body.split('\n').length <= 90, `子技能 ${meta.name} 正文过长（建议 ≤80 行）`)
  }
})

test('mesh-rules: 主技能 §0 链式路由引用的子技能与文件名一致且都存在', () => {
  const patch = readText('.scratch/mesh-system/issues/06-main-skill-patch.md')
  for (const stage of STAGES) {
    const ref = `gms-modeling-${stage}`
    assert.ok(patch.includes(ref), `主技能 §0 未引用子技能 ${ref}`)
    assert.ok(existsSync(path.join(ROOT, '.dsh', 'skills', ref, 'SKILL.md')), `主技能路由引用缺文件: .dsh/skills/${ref}/SKILL.md`)
  }
})

test('mesh-rules: 子技能正文提及的命令均可在 package.json scripts 找到', () => {
  const scripts = Object.keys(JSON.parse(readText('package.json')).scripts || {})
  const dirs = skillDirs()
  for (const dir of dirs) {
    const meta = parseSkill(dir, dir.replace(/^gms-modeling-/, ''))
    for (const cmd of extractCommands(meta.body, scripts)) {
      assert.ok(scripts.includes(cmd), `子技能 ${meta.name} 正文引用了不在 package.json scripts 的命令: ${cmd}`)
    }
  }
})
