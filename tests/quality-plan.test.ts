/**
 * quality-plan.test.ts — 缺陷分层分类器 + 场景验证集的确定性测试（node:test）。
 *
 * 覆盖：
 * 1) 分类与修复队列：合成 gate 失败 bundle（水密 + 瘦三角 + 预算超限 + 色带异常）→
 *    分类到 L3/L3/L2/L4 正确；队列顺序 L2→L3→L4（L1 无则跳过）；minimalFix/verifyHint 非空；
 *    trace 字段齐全；unclassified 不硬猜。
 * 2) 场景集：清单解析（5 例、字段齐全）；run-scenarios 对 auto 例可跑（最小 fixture，快速）；
 *    断言不满足输出 fail + 原因；确定性（两次运行 sha256 一致）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildQualityPlan, classifyIssue, resolveArtifact, hashArtifact, type QualityIssue } from '../src/qa/quality-plan.js'
import { parseScenarios, runScenariosFromFile, runScenarios, type Scenario } from '../src/qa/scenarios.js'

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
}

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

/** 写一个最小导出集到临时目录，返回目录路径。 */
function writeBundle(): { dir: string; name: string } {
  const dir = tmpDir('quality-plan-bundle-')
  const name = 'bundle'
  // 合成：gate.watertight 失败 + gate.skinny 失败 + summary.budget 超限 + mesh.colorBands 异常。
  const summary = {
    schemaVersion: 1,
    budget: { requested: 10, used: 576, exceeded: true },
    gate: {
      invoked: true,
      state: 'failed',
      ok: false,
      checkedFaces: 1152,
      failures: ['水密性未通过：开边 2 条、非流形边 0 条'],
      checks: {
        watertight: { pass: false, openEdges: 2, nonManifold: 0, samplePositions: [] },
        seams: { pass: true, seamCount: 0, samplePositions: [] },
        normals: { pass: true, invertedCount: 0, sampleFaces: [] },
        degenerate: { count: 0, pass: true },
        skinny: { count: 9, pct: 12.5, pass: false },
        areaRatio: { value: 8, pass: true },
        budget: { requested: 10, used: 576, exceeded: true, pass: false }
      }
    }
  }
  // mesh：faces=3 个三角、colors 只有 2 个 → 色带异常。
  const mesh = { vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], faces: [0, 1, 2, 1, 2, 3, 2, 0, 3], colors: ['#ff0000', '#00ff00'] }
  fs.writeFileSync(path.join(dir, `${name}.summary.json`), JSON.stringify(summary))
  fs.writeFileSync(path.join(dir, `${name}.mesh.json`), JSON.stringify(mesh))
  return { dir, name }
}

test('quality-plan：合成 gate 失败 bundle → L3/L3/L2/L4 分类正确且队列 L2→L3→L4', () => {
  const { dir } = writeBundle()
  const plan = buildQualityPlan(dir, { id: 'bundle' })

  // 分类归属。
  assert.equal(plan.dimensions.L1.count, 0, 'L1 无命中')
  assert.equal(plan.dimensions.L2.count, 1, '预算超限 → L2')
  assert.equal(plan.dimensions.L3.count, 2, '水密 + 瘦三角 → L3')
  assert.equal(plan.dimensions.L4.count, 1, '色带异常 → L4')
  assert.equal(plan.dimensions.unclassified.length, 0, '无未分类误报')

  // 队列顺序：L1 缺失则 L2 最前，其次 L3，最后 L4。
  const dims = plan.repairQueue.map((e) => e.dimension)
  assert.deepEqual(dims, ['L2', 'L3', 'L3', 'L4'], '队列按 L1→L2→L3→L4（无 L1）升序')

  // order 从 1 递增。
  plan.repairQueue.forEach((e, i) => assert.equal(e.order, i + 1))
  // 每项 minimalFix / verifyHint 非空。
  for (const e of plan.repairQueue) {
    assert.ok(e.minimalFix.length > 0, 'minimalFix 非空')
    assert.ok(e.verifyHint.length > 0, 'verifyHint 非空')
  }
  // 关键来源被正确标注。
  const budgetEntry = plan.repairQueue.find((e) => e.dimension === 'L2')
  assert.ok(budgetEntry, '存在 L2 预算项')
  assert.match(budgetEntry.evidence, /预算|超限/)
  const l4Entry = plan.repairQueue.find((e) => e.dimension === 'L4')
  assert.ok(l4Entry, '存在 L4 色带项')
  assert.match(l4Entry.evidence, /colorBands|色带|材质/)

  // trace 字段齐全。
  assert.ok(plan.sedimentation.trace.artifactHash.length > 0, 'trace.artifactHash 非空')
  assert.ok(plan.sedimentation.trace.sources.includes('bundle.summary.json'), 'trace.sources 含 summary.json')
  assert.ok(plan.sedimentation.trace.sources.includes('bundle.mesh.json'), 'trace.sources 含 mesh.json')
  assert.ok(plan.sedimentation.suggestedRules.length > 0, 'suggestedRules 非空')
  // artifact 校验和与 trace 一致。
  assert.equal(plan.artifact.checksum, plan.sedimentation.trace.artifactHash)
})

test('quality-plan：无法映射 → unclassified，不硬猜', () => {
  const dir = tmpDir('quality-plan-unclassified-')
  const summary = { gate: { state: 'failed', failures: ['一个完全无法归类的奇怪问题'] } }
  fs.writeFileSync(path.join(dir, 'bundle.summary.json'), JSON.stringify(summary))
  const plan = buildQualityPlan(dir)
  assert.equal(plan.dimensions.unclassified.length, 1)
  const entry = plan.repairQueue.find((e) => e.dimension === 'unclassified')
  assert.ok(entry, 'unclassified 出现在队列尾部')
  assert.match(entry.minimalFix, /人工判别/)
  assert.equal(entry.verifyHint, '人工确认分类后重跑对应检查')
})

test('quality-plan：classifyIssue 手工 --map 覆盖 + 关键词规则', () => {
  assert.equal(classifyIssue('gate.skinny', '瘦长三角占比高'), 'L3')
  assert.equal(classifyIssue('qa.budget', '单元预算超限'), 'L2')
  assert.equal(classifyIssue('mesh.colorBands', '色带数量与面数不一致'), 'L4')
  assert.equal(classifyIssue('manifest.silhouette', '剪影 IoU 0.65'), 'L1')
  assert.equal(classifyIssue('weird.check', '完全未知'), 'unclassified')
  // 人工覆盖优先。
  assert.equal(classifyIssue('gate.skinny', '瘦长三角', { 'gate.skinny': 'L2' }), 'L2')
})

test('quality-plan：hashArtifact 与 resolveArtifact 确定性', () => {
  const { dir } = writeBundle()
  const files = ['bundle.summary.json']
  const h1 = hashArtifact(dir, files)
  const h2 = hashArtifact(dir, files)
  assert.equal(h1, h2, '相同输入哈希一致')
  const resolved = resolveArtifact(dir)
  assert.equal(resolved.base, 'bundle')
})

test('scenarios：manifest 解析（真实清单 5 例、字段齐全）', () => {
  const manifestPath = path.join(repoRoot(), 'benchmark/scenarios/scenarios.json')
  const manifest = parseScenarios(JSON.parse(fs.readFileSync(manifestPath, 'utf8')))
  assert.equal(manifest.length, 5, '共 5 例')
  for (const s of manifest) {
    assert.ok(s.id && s.title, 'id/title 存在')
    assert.ok(s.route === 'mesh' || s.route === 'classic-stroke', 'route 合法')
    assert.ok(['auto', 'manual', 'pending'].includes(s.status), 'status 合法')
    assert.ok(s.assertions, 'assertions 存在')
  }
  const auto = manifest.filter((s) => s.status === 'auto')
  assert.ok(auto.length >= 2, '至少 2 例 auto')
  for (const s of auto) {
    assert.ok(Array.isArray(s.command) && s.command.length > 0, 'auto 例有 command')
    assert.ok(Array.isArray(s.inputs) && s.inputs.length > 0, 'auto 例有 inputs')
    assert.ok(s.assertions.gate, 'auto 例有 gate 断言')
  }
  const ids = manifest.map((s) => s.id)
  assert.equal(new Set(ids).size, 5, 'id 唯一')
})

test('scenarios：run-scenarios 对 auto 例可跑（最小 fixture）+ 确定性', () => {
  const outDir = tmpDir('scenarios-run-')
  const manifest: Scenario[] = [
    {
      id: 'basic-cylinder',
      title: '基础圆柱（fixture）',
      route: 'mesh',
      command: ['node', 'dist/src/cli/contour-model.js', '{input}', '--points', '24', '--name', '{name}', '--out-dir', '{outDir}', '--force'],
      inputs: ['benchmark/scenarios/inputs/cylinder.json'],
      assertions: { unitsRange: [1, 200], gate: 'pass', qa: 'ok' },
      status: 'auto'
    },
    {
      id: 'cup-manual',
      title: '水杯（手动）',
      route: 'mesh',
      assertions: {},
      status: 'manual'
    }
  ]
  const results = runScenarios(manifest, { outDir, baseDir: repoRoot() })
  const cyl = results.find((r) => r.id === 'basic-cylinder')
  const cup = results.find((r) => r.id === 'cup-manual')
  assert.ok(cyl && cyl.metrics, 'cyl 结果与指标应存在')
  assert.ok(cup, 'cup 结果应存在')

  assert.equal(cyl.status, 'pass', '圆柱 fixture 应 pass')
  assert.equal(cyl.metrics.units, 48, '圆柱 48 单元')
  assert.equal(cyl.metrics.gate, 'passed')
  assert.equal(cyl.metrics.qa, 'ok')
  assert.ok(cyl.metrics.bytes !== null && cyl.metrics.bytes > 0, 'bytes 非空')
  assert.ok(cyl.metrics.sha256 !== null && cyl.metrics.sha256.length > 0, 'sha256 非空')
  assert.equal(cup.status, 'manual', 'manual 例不自动运行')
  assert.equal(cup.metrics, null)

  // 确定性：再次运行 → sha256 一致。
  const results2 = runScenarios(manifest, { outDir, baseDir: repoRoot() })
  const cyl2 = results2.find((r) => r.id === 'basic-cylinder')
  assert.ok(cyl2 && cyl2.metrics, 'cyl2 结果与指标应存在')
  assert.equal(cyl2.metrics.sha256, cyl.metrics.sha256, '两次运行 sha256 一致')
})

test('scenarios：断言不满足 → status=fail + 原因', () => {
  const outDir = tmpDir('scenarios-fail-')
  const manifest: Scenario[] = [
    {
      id: 'basic-cylinder',
      title: '基础圆柱（fixture，故意错断言）',
      route: 'mesh',
      command: ['node', 'dist/src/cli/contour-model.js', '{input}', '--points', '24', '--name', '{name}', '--out-dir', '{outDir}', '--force'],
      inputs: ['benchmark/scenarios/inputs/cylinder.json'],
      assertions: { unitsRange: [1000, 2000], gate: 'pass', qa: 'ok' },
      status: 'auto'
    }
  ]
  const results = runScenarios(manifest, { outDir, baseDir: repoRoot() })
  assert.equal(results[0].status, 'fail')
  assert.equal(results[0].reason, '断言未满足')
  assert.ok(results[0].assertFailures.some((f) => /units=48/.test(f)), 'fail 原因含实际单元数')
})

test('scenarios：runScenariosFromFile 走真实清单且确定性', () => {
  const outDir = tmpDir('scenarios-file-')
  const manifestPath = path.join(repoRoot(), 'benchmark/scenarios/scenarios.json')
  const r1 = runScenariosFromFile(manifestPath, { outDir, baseDir: repoRoot() })
  const r2 = runScenariosFromFile(manifestPath, { outDir, baseDir: repoRoot() })

  const byId = (rs: ReturnType<typeof runScenariosFromFile>, id: string) => {
    const found = rs.find((x) => x.id === id)
    assert.ok(found, `${id} 结果存在`)
    assert.ok(found.metrics, `${id} 指标存在`)
    return { status: found.status, metrics: found.metrics }
  }
  const foot1 = byId(r1, 'contour-foot')
  const cyl1 = byId(r1, 'basic-cylinder')
  assert.equal(foot1.status, 'pass')
  assert.equal(cyl1.status, 'pass')

  const foot2 = byId(r2, 'contour-foot')
  const cyl2 = byId(r2, 'basic-cylinder')
  assert.equal(foot2.metrics.sha256, foot1.metrics.sha256, 'contour-foot 两次 sha256 一致')
  assert.equal(cyl2.metrics.sha256, cyl1.metrics.sha256, 'basic-cylinder 两次 sha256 一致')
})
