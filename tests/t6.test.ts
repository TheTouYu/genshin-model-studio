/**
 * T6 摩天轮校验器单元测试：
 * - 合成完美摩天轮（环段 24 + 吊舱 6 + 支架 2 + 轴 1）→ 满分；
 * - 坏样例（缺支架/吊舱集中/支架不贴地/轮径过小）→ 扣分且带违规；
 * - 确定性：同一输入两次校验逐位一致。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { validate } from '../benchmark/tasks/T6/validator.js'
import type { StructureItem } from '../src/core/structure.js'

const CYL = 10009008

const structure = (items: StructureItem[]) => ({
  schemaVersion: 1 as const,
  name: 't6-test',
  template: '空模型',
  templatePrefabId: 10005018,
  templateInstanceId: 10005018,
  prefabId: 1077936129,
  definitionAuxiliaryIds: [] as number[],
  instanceAuxiliaryIds: [] as number[],
  position: [0, 0, 0] as const,
  rotation: [0, 0, 0] as const,
  scale: [1, 1, 1] as const,
  items
})

/** 合成完美摩天轮：轮心 (0, 1.1, 0)，半径 0.7，48 段环 ×2（竖直环 z=±0.06），6 吊舱（两环间、竖直座舱），4 斜杆（环外侧）支撑轮心，1 轴。 */
function buildPerfect(): StructureItem[] {
  const items: StructureItem[] = []
  const r = 0.7
  const y0 = 1.1
  const seg = 48
  /** 方向 → extrudeRod 圆柱旋转（局部 Y 指向该方向，与生成器约定一致）。 */
  const dirToRot = (dx: number, dy: number, dz: number): [number, number, number] => {
    const len = Math.hypot(dx, dy, dz) || 1
    const ux = dx / len
    const uy = dy / len
    const uz = dz / len
    return [Math.acos(Math.max(-1, Math.min(1, uy))) * 180 / Math.PI, Math.atan2(ux, uz) * 180 / Math.PI, 0]
  }
  const mk = (position: [number, number, number], scale: [number, number, number], rotation: [number, number, number] = [0, 0, 0]): StructureItem => ({
    resourceId: CYL, position, rotation, scale
  })
  for (const ring of [0, 1]) {
    const rz = ring === 0 ? 0 : 0.06
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * 2 * Math.PI
      const a1 = ((k + 1) / seg) * 2 * Math.PI
      const chord = 2 * r * Math.sin((a1 - a0) / 2)
      const am = (a0 + a1) / 2
      // 竖直环：z 恒定 ±rz，x-y 平面内分布；段方向 = 圆弧切线（真实 extrude 行为）
      items.push(mk(
        [r * Math.cos(am), y0 + r * Math.sin(am), rz],
        [0.02, chord, 0.02],
        dirToRot(Math.sin(am), -Math.cos(am), 0)
      ))
    }
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * 2 * Math.PI + Math.PI / 6
    const px = r * Math.cos(a)
    const py = y0 + r * Math.sin(a)
    // 轮辐杆：从轴心连到轮缘挂点（旋转骨架）
    items.push(mk([px / 2, (y0 + py) / 2, 0], [0.02, r, 0.02], dirToRot(px, py - y0, 0)))
    // 环连接横杆：轮缘处沿 z 向连接两环（z 跨度 0.12 ≥ 环间距 0.12×0.8）
    items.push(mk([px, py, 0], [0.02, 0.12, 0.02], [90, 0, 0]))
    // 竖直座舱（重力悬挂姿态），在两环之间（z=0），中心低于轮缘挂点模拟下垂
    items.push(mk([px, py - 0.1, 0], [0.08, 0.14, 0.08]))
    // 细绳索：上端接挂点附近（py+0.009），下端接触座舱顶（py−0.03，差 0.005）
    items.push(mk([px, py - 0.008, 0], [0.015, 0.034, 0.015]))
  }
  // 支架杆：四根斜杆（段序列模拟 extrude 重采样），从地面 (±0.7, 0, ±0.15) 斜撑到轮心 (0, 1.1, ±0.15)。
  // 杆位于轮环外侧（z=±0.15，环 z=±0.06）：不进入吊舱转动平面；杆顶距轮心 0.15 ≤ 0.2（轮心支撑）。
  const poleSegs = 20
  for (const side of [-0.7, 0.7]) {
    for (const pz of [-0.15, 0.15]) {
      for (let k = 0; k < poleSegs; k++) {
        const t0 = k / poleSegs
        const t1 = (k + 1) / poleSegs
        const x0 = side * (1 - t0)
        const y0s = 1.1 * t0
        const x1 = side * (1 - t1)
        const y1 = 1.1 * t1
        items.push(mk(
          [(x0 + x1) / 2, (y0s + y1) / 2, pz],
          [0.06, Math.hypot(x1 - x0, y1 - y0s), 0.06],
          dirToRot(x1 - x0, y1 - y0s, 0) // 段方向沿杆轴（斜）
        ))
      }
    }
  }
  // 轮毂：水平短轴（rotation [90,0,0]，z 向 0.3 贯穿，连接支架杆顶端，尺寸 ≥ 0.2 为轮毂横撑）
  items.push(mk([0, y0, 0], [0.08, 0.3, 0.08], [90, 0, 0]))
  return items
}

/** 支架杆段特征（用于坏样例构造）。 */
const isPoleSeg = (it: StructureItem): boolean => it.scale[0] === 0.06 && it.scale[1] < 0.1 && it.scale[2] === 0.06

test('T6: 完美摩天轮满分', () => {
  const r = validate(structure(buildPerfect()))
  assert.equal(r.score, 1.0, JSON.stringify(r.violations))
  assert.equal(r.violations.length, 0)
})

test('T6: 缺支架 → 低分且轮心无法确定', () => {
  const bad = buildPerfect().filter((it) => !isPoleSeg(it)) // 去掉支架杆
  const r = validate(structure(bad))
  assert.ok(r.score < 0.4, `实际 ${r.score}`)
  assert.ok(r.violations.some((v) => v.includes('支架')))
})

test('T6: 支架不贴地 → 支架分降低', () => {
  const bad = buildPerfect().map((it) =>
    isPoleSeg(it) ? { ...it, position: [it.position[0], it.position[1] + 0.2, it.position[2]] as [number, number, number] } : it
  )
  const r = validate(structure(bad))
  assert.ok(r.score < 0.4, `实际 ${r.score}`)
  assert.ok(r.violations.some((v) => v.includes('支架')))
})

test('T6: 吊舱集中（仅 2 个相邻）→ 均布扣分', () => {
  const perfect = buildPerfect()
  const pods = perfect.filter((it) => it.scale[1] === 0.14 && it.scale[0] === 0.08)
  const rest = perfect.filter((it) => !(it.scale[1] === 0.14 && it.scale[0] === 0.08))
  const keep = [pods[0], pods[1]] // 只剩两个相邻吊舱
  const r = validate(structure([...rest, ...keep]))
  assert.ok(r.score < 0.9, `实际 ${r.score}`)
  assert.ok(r.violations.some((v) => v.includes('吊舱')))
})

test('T6: 轮径过小 → 比例扣分', () => {
  const bad = buildPerfect().map((it) => {
    const d = Math.hypot(it.position[0], it.position[2])
    if (d > 0.3) {
      const f = 0.25 / d
      return { ...it, position: [it.position[0] * f, it.position[1], it.position[2] * f] as [number, number, number] }
    }
    return it
  })
  const r = validate(structure(bad))
  assert.ok(r.score < 0.9, `实际 ${r.score}`)
})

test('T6: 确定性（两次校验逐位一致）', () => {
  const s = structure(buildPerfect())
  assert.deepEqual(validate(s), validate(s))
})
