/**
 * reference-fit.test.ts — 参考图拟合通用管线（确定性）测试。
 *
 * 覆盖（全部经 CLI 调用 scripts/reference-fit.py）：
 * - --make-fixture 生成确定性"脚型"合成样张（front/side/gt）。
 * - 提取输出文件齐全（manifest/rings/rings-ellipse/color_bands/overlays/summary）。
 * - rings 结构字段齐全且与 fixture 一致（环数=16、points=64、带数=3、面积≈πab、IoU≈1）。
 * - 无时间戳字段；同一输入两次运行 sha256 字节一致（无随机）。
 *
 * 依赖项目 .venv（含 pillow/numpy）；既有测试不受影响。
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = process.cwd()
const PY = path.join(REPO, '.venv', 'bin', 'python')
const SCRIPT = path.join(REPO, 'scripts', 'reference-fit.py')

const FRONT = 'fixture-front.png'
const SIDE = 'fixture-side.png'
const GT = 'fixture-front-gt.png'
const EXPECTED_AREA = Math.PI * 88 * 150 // a=88,b=150（make_fixture 参数）
const RING_COUNT = 16
const POINTS = 64
const BANDS = 3

let fixtureDir: string | null = null

function getFixtureDir(): string {
  if (!fixtureDir) {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-fixture-'))
    run(['--make-fixture', fixtureDir])
  }
  return fixtureDir
}

function run(args: string[]): string {
  return execFileSync(PY, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8' })
}

function extractInto(outDir: string): string {
  const f = getFixtureDir()
  return run([
    '--front', path.join(f, FRONT),
    '--side', path.join(f, SIDE),
    '--gt-mask', path.join(f, GT),
    '--out-dir', outDir,
    '--points', String(POINTS),
    '--color-bands', String(BANDS),
    '--name', 'fixture',
  ])
}

function sha256Of(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

after(() => {
  if (fixtureDir) fs.rmSync(fixtureDir, { recursive: true, force: true })
})

test('reference-fit: --make-fixture 生成确定性样张（front/side/gt）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-fixture-gen-'))
  const out = JSON.parse(run(['--make-fixture', dir]))
  for (const key of ['front', 'side', 'gt']) {
    assert.ok(out[key] && fs.existsSync(out[key]), `${key} 文件存在: ${out[key]}`)
  }
  assert.ok(out.params.expected_area > 0, 'expected_area 为正')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('reference-fit: 提取输出文件齐全 + stdout 摘要值正确', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-out-files-'))
  const res = JSON.parse(extractInto(out))
  const files = [
    'manifest.json', 'rings.json', 'rings-ellipse.json', 'color_bands.json',
    'summary.json', 'overlay-front.png', 'overlay-side.png',
  ]
  for (const name of files) {
    assert.ok(fs.existsSync(path.join(out, name)), `${name} 存在`)
  }
  assert.equal(res.rings.count, RING_COUNT, '环数 = 16')
  assert.equal(res.rings.points, POINTS, '每环点数 = 64')
  assert.equal(res.rings.hasTopOutline, false, '无顶视 → 省略 topOutline')
  assert.equal(res.bands, BANDS, '色带数 = 3')
  assert.ok(res.iou !== null && res.iou > 0.9, `IoU=${res.iou} 应 > 0.9`)
  fs.rmSync(out, { recursive: true, force: true })
})

test('reference-fit: rings 结构字段齐全且与 fixture 一致（面积/点数/带数）', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-out-struct-'))
  extractInto(out)
  const rings = JSON.parse(fs.readFileSync(path.join(out, 'rings.json'), 'utf8'))
  // 04 接口 form① 字段：sideProfile（含 y/widthScale/centerZ），points，colorBands；无顶视 → 省略 topOutline。
  assert.ok(Array.isArray(rings.sideProfile) && rings.sideProfile.length === RING_COUNT)
  assert.equal(rings.points, POINTS)
  assert.equal(rings.cap, 'both')
  assert.ok(Array.isArray(rings.colorBands) && rings.colorBands.length === BANDS)
  for (const lv of rings.sideProfile) {
    assert.ok(typeof lv.y === 'number' && lv.y >= 0)
    assert.ok(typeof lv.widthScale === 'number' && lv.widthScale > 0 && lv.widthScale <= 1)
    assert.ok(typeof lv.centerZ === 'number' && Number.isFinite(lv.centerZ))
  }
  assert.ok(!('topOutline' in rings), '无顶视时 rings.json 不写 topOutline')

  const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'))
  const frontView = summary.views.find((v: { role: string }) => v.role === 'front')
  assert.ok(frontView, 'summary 记录 front 视图')
  const areaPx = frontView.maskAreaPx
  assert.ok(
    Math.abs(areaPx - EXPECTED_AREA) / EXPECTED_AREA < 0.05,
    `mask 面积 ${areaPx} 应在 ±5% 内接近 πab=${EXPECTED_AREA.toFixed(1)}`,
  )
  assert.equal(summary.bands.count, BANDS, 'summary 带数 = 3')
  assert.equal(summary.rings.points, POINTS)
  assert.ok(summary.iou.computed && summary.iou.value > 0.9, 'summary IoU 已计算且 ≈1')
  fs.rmSync(out, { recursive: true, force: true })
})

test('reference-fit: 无时间戳字段 + 两次运行 sha256 字节一致（无随机）', () => {
  const outA = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-out-detA-'))
  const outB = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-out-detB-'))
  extractInto(outA)
  extractInto(outB)

  const compareFiles = [
    'rings.json', 'rings-ellipse.json', 'manifest.json', 'summary.json', 'color_bands.json',
  ]
  for (const name of compareFiles) {
    const a = sha256Of(path.join(outA, name))
    const b = sha256Of(path.join(outB, name))
    assert.equal(a, b, `${name} 两次运行 sha256 一致`)
  }
  assert.equal(
    sha256Of(path.join(outA, 'overlay-front.png')),
    sha256Of(path.join(outB, 'overlay-front.png')),
    'overlay-front.png 两次运行字节一致',
  )

  // 无时间戳键。
  const stampRe = /"(timestamp|generatedAt|createdAt|modifiedAt|date|time)"/
  for (const name of ['manifest.json', 'summary.json', 'rings.json', 'color_bands.json']) {
    const text = fs.readFileSync(path.join(outA, name), 'utf8')
    assert.ok(!stampRe.test(text), `${name} 不含时间戳键`)
  }
  fs.rmSync(outA, { recursive: true, force: true })
  fs.rmSync(outB, { recursive: true, force: true })
})
