/**
 * Golden-file 测试：给定输入 → 期望输出字节（确定性）。
 *
 * - golden：tests/golden/<name>.gil.hex（与 dist 无关，直接从 examples 编码得到）
 * - 结构断言：用自有只读回读（readback.ts）断言闭包与 item round-trip
 * - 校验拒绝路径（fail-closed）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { encodeStructure } from '../src/core/encoder.js'
import { loadStructureFile, resolveStructure } from '../src/core/structure.js'
import { closureSummary, readBackAssemblies } from '../src/core/readback.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** 从编译产物位置（dist/tests）向上找项目根（含 package.json）。 */
function findRoot(dir: string): string {
  return existsSync(path.join(dir, 'package.json')) ? dir : findRoot(path.dirname(dir))
}
const ROOT = findRoot(HERE)

function example(name: string) {
  return loadStructureFile(path.join(ROOT, 'examples', `${name}.json`))
}

function goldenHex(name: string): string {
  return readFileSync(path.join(ROOT, 'tests', 'golden', `${name}.gil.hex`), 'utf8').trim()
}

function close(a: readonly number[], b: readonly number[], tolerance = 1e-4): boolean {
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= tolerance)
}

for (const name of ['house', 'box', 'simple-assembly']) {
  test(`golden: ${name}.json encodes to the golden bytes`, () => {
    const bytes = Buffer.from(encodeStructure(example(name)))
    assert.equal(bytes.toString('hex'), goldenHex(name))
  })

  test(`deterministic: ${name}.json encodes identically twice`, () => {
    const first = Buffer.from(encodeStructure(example(name))).toString('hex')
    const second = Buffer.from(encodeStructure(example(name))).toString('hex')
    assert.equal(first, second)
  })

  test(`readback: ${name}.json round-trips through the candidate`, () => {
    const structure = example(name)
    const bytes = encodeStructure(structure)
    const assemblies = readBackAssemblies(bytes)
    assert.equal(assemblies.length, 1)
    const assembly = assemblies[0]
    assert.equal(assembly.name, structure.name)
    assert.equal(assembly.prefabId, structure.prefabId)
    assert.equal(assembly.templateResourceId, structure.templatePrefabId)
    assert.equal(assembly.items.length, structure.items.length)
    for (const [index, item] of structure.items.entries()) {
      const read = assembly.items[index]
      assert.equal(read.resourceId, item.resourceId)
      assert.ok(close(read.position, item.position), `items[${index}] position`)
      assert.ok(close(read.rotation, item.rotation), `items[${index}] rotation`)
      assert.ok(close(read.scale, item.scale), `items[${index}] scale`)
      if (item.color?.enabled) {
        assert.ok(read.color?.enabled, `items[${index}] color enabled`)
        if (read.color?.enabled && item.color.enabled) {
          assert.equal(read.color.rgb, item.color.rgb, `items[${index}] color rgb`)
          assert.ok(
            Math.abs(read.color.opacity - item.color.opacity) <= 0.01,
            `items[${index}] color opacity`
          )
          assert.equal(read.color.overlay, item.color.overlay, `items[${index}] color overlay`)
        }
      } else {
        // 未配置颜色 → 骨架默认材质槽，回读为 {enabled:false}（与 genshin-ts export 语义一致）。
        assert.deepEqual(read.color, { enabled: false }, `items[${index}] color absent`)
      }
    }
  })
}

test('closure: candidate contains a complete def/inst/aux closure', () => {
  const structure = example('house')
  const closure = closureSummary(encodeStructure(structure))
  assert.equal(closure.definitions, 1)
  assert.equal(closure.instances, 1)
  assert.equal(closure.definitionAuxiliaries, structure.items.length)
  assert.equal(closure.instanceAuxiliaries, structure.items.length)
  assert.ok(closure.ownerRegistryIds.includes(structure.prefabId), 'owner registry entry')
  assert.equal(closure.complete, true)
})

test('validation: rejects prefabId below 0x40400000 range', () => {
  const input = JSON.parse(readFileSync(path.join(ROOT, 'examples', 'house.json'), 'utf8'))
  assert.throws(() => resolveStructure({ ...input, prefabId: 1073741825 }), /prefabId/)
})

test('validation: rejects empty items', () => {
  const input = JSON.parse(readFileSync(path.join(ROOT, 'examples', 'house.json'), 'utf8'))
  assert.throws(() => resolveStructure({ ...input, items: [] }), /items/)
})

test('validation: rejects malformed color', () => {
  const input = JSON.parse(readFileSync(path.join(ROOT, 'examples', 'house.json'), 'utf8'))
  const items = [...input.items]
  items[0] = { ...items[0], color: { enabled: true, rgb: 0x1000000, opacity: 100, overlay: 'overwrite' } }
  assert.throws(() => resolveStructure({ ...input, items }), /rgb/)
})

test('validation: rejects reserved skeleton placeholder aux IDs', () => {
  const input = JSON.parse(readFileSync(path.join(ROOT, 'examples', 'house.json'), 'utf8'))
  assert.throws(
    () => resolveStructure({ ...input, definitionAuxiliaryIds: [1073741828, 1073741832] }),
    /reserved skeleton placeholder/
  )
})

test('validation: rejects non-official item resourceId', () => {
  const input = JSON.parse(readFileSync(path.join(ROOT, 'examples', 'house.json'), 'utf8'))
  const items = [...input.items]
  items[0] = { ...items[0], resourceId: 123456 }
  assert.throws(() => resolveStructure({ ...input, items }), /official base resource/)
})

test('validation: rejects unknown top-level fields and phase-1 unsupported features', () => {
  const input = JSON.parse(readFileSync(path.join(ROOT, 'examples', 'house.json'), 'utf8'))
  assert.throws(() => resolveStructure({ ...input, components: [] }), /not covered in phase 1/)
  assert.throws(
    () => resolveStructure({ ...input, color: { enabled: true, rgb: 0xffffff, opacity: 100, overlay: 'overwrite' } }),
    /assembly-level color/
  )
  assert.throws(() => resolveStructure({ ...input, unknownField: 1 }), /unknown field/)
})

test('validation: defaults resolve deterministically', () => {
  const input = JSON.parse(readFileSync(path.join(ROOT, 'examples', 'house.json'), 'utf8'))
  delete input.prefabId
  delete input.definitionAuxiliaryIds
  delete input.instanceAuxiliaryIds
  const structure = resolveStructure(input)
  assert.equal(structure.prefabId, 1077936129)
  assert.deepEqual(structure.definitionAuxiliaryIds, [1073741830, 1073741832])
  assert.deepEqual(structure.instanceAuxiliaryIds, [1073741831, 1073741833])
})
