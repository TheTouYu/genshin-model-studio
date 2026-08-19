/**
 * T4 自由生成四腿桌 —— 论文「自由生成小屋」对应（无真值，结构不变量评分）。
 * 校验方式（论文 Test-Invariants 在本项目域的对应物）：
 * 贴地 / 桌面存在 / 净空 / 四象限支撑 / 对称 / 比例 / 无穿模 / 结构健康。
 * 无真值 → 不变量全部由确定性几何计算，与模型无关。
 */
import type { ResolvedStructure } from '../../../src/core/structure.js'
import type { ValidationResult } from '../../../src/benchmark/types.js'
import {
  aabb,
  aabbOverlapVolume,
  bottomY,
  canonicalizeAll,
  topY
} from '../../../src/benchmark/geo.js'

type CItem = ReturnType<typeof canonicalizeAll>[number]

/** 腿 = 竖直长条（y 向 ≥ 0.3 且 ≥ 2×水平向）且贴地（底 ≤ 0.05）。 */
function isLeg(c: CItem): boolean {
  return (
    c.axisAligned &&
    c.scale[1] >= 0.3 &&
    c.scale[1] >= 2 * Math.max(c.scale[0], c.scale[2]) &&
    bottomY(c) <= 0.05
  )
}

/** 桌面 = 水平平板（y 向 ≤ 0.25、水平向 ≥ 0.6）且离地 ≥ 0.3。 */
function isDesk(c: CItem): boolean {
  return (
    c.axisAligned &&
    c.scale[1] <= 0.25 &&
    c.scale[0] >= 0.6 &&
    c.scale[2] >= 0.6 &&
    bottomY(c) >= 0.3
  )
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

export function validate(structure: ResolvedStructure): ValidationResult {
  const can = canonicalizeAll(structure.items)
  const violations: string[] = []

  // 结构健康：轴对齐 / 正尺度 / 不入地
  let healthy = 1
  for (const c of can) {
    if (!c.axisAligned) {
      violations.push(`非轴对齐元件：${JSON.stringify(c)}`)
      healthy = 0
    }
    if (c.scale.some((s) => s <= 0)) {
      violations.push(`非正尺度：${JSON.stringify(c)}`)
      healthy = 0
    }
    if (bottomY(c) < -0.01) {
      violations.push(`元件入地（底 y=${bottomY(c).toFixed(3)}）：${JSON.stringify(c)}`)
      healthy = 0
    }
  }

  const legs = can.filter(isLeg)
  const desks = can.filter(isDesk)
  const extras = can.filter((c) => !isLeg(c) && !isDesk(c))

  // 贴地：所有腿底 ≈ 0
  const legsGrounded = legs.filter((l) => bottomY(l) <= 0.01).length
  const groundScore = legs.length > 0 ? legsGrounded / legs.length : 0
  if (legs.some((l) => bottomY(l) > 0.01)) violations.push(`有腿不贴地（底 y>0.01）`)

  // 腿数量（要求 ≥ 4）
  const legScore = clamp01(legs.length / 4)
  if (legs.length < 4) violations.push(`腿数量 ${legs.length} < 4`)

  // 桌面存在
  const desk = desks.length > 0 ? desks[0] : null
  const deskScore = desk !== null ? (desks.length === 1 ? 1 : 0.5) : 0
  if (desk === null) violations.push('没有桌面（水平平板，长宽 ≥ 0.6 米）')
  if (desks.length > 1) violations.push(`桌面数量 ${desks.length} > 1`)

  // 净空：桌面底面离地 ≥ 0.5
  let clearScore = 0
  if (desk !== null) {
    clearScore = clamp01(bottomY(desk) / 0.5)
    if (bottomY(desk) < 0.5) violations.push(`桌面下净空 ${bottomY(desk).toFixed(3)} < 0.5`)
  }

  // 支撑：四象限各有一腿（腿心在象限内）且腿顶贴桌面底
  let supportScore = 0
  if (desk !== null && legs.length > 0) {
    const db = aabb(desk)
    const cx = desk.position[0]
    const cz = desk.position[2]
    const quadrants = [0, 1, 2, 3].map((q) => {
      const wantX = (q & 1) === 0 ? cx : cx // x 侧：左半/右半
      const wantZ = (q & 2) === 0 ? cz : cz
      return legs.some(
        (l) =>
          (q & 1 ? l.position[0] >= cx : l.position[0] < cx) &&
          (q & 2 ? l.position[2] >= cz : l.position[2] < cz) &&
          Math.abs(topY(l) - bottomY(desk)) <= 0.05
      )
    })
    const quadScore = quadrants.filter(Boolean).length / 4
    const touch = legs.filter((l) => Math.abs(topY(l) - bottomY(desk)) <= 0.05).length
    const touchScore = touch / legs.length
    supportScore = 0.5 * quadScore + 0.5 * touchScore
    for (let q = 0; q < 4; q++) {
      if (!quadrants[q]) violations.push(`桌面第 ${q + 1} 象限无腿支撑`)
    }
    if (touch < legs.length) violations.push(`有腿未顶到桌面底面（${legs.length - touch} 条）`)
  }

  // 对称：腿两两关于桌面中心镜像
  let symmetryScore = 0
  if (desk !== null && legs.length > 0) {
    const cx = desk.position[0]
    const cz = desk.position[2]
    const used = new Array(legs.length).fill(false)
    let pairs = 0
    for (let i = 0; i < legs.length; i++) {
      if (used[i]) continue
      for (let j = i + 1; j < legs.length; j++) {
        if (used[j]) continue
        const mirror = Math.abs(2 * cx - legs[i].position[0] - legs[j].position[0]) <= 0.05 &&
          Math.abs(2 * cz - legs[i].position[2] - legs[j].position[2]) <= 0.05
        if (mirror) {
          pairs++
          used[i] = used[j] = true
          break
        }
      }
    }
    symmetryScore = pairs / Math.max(1, Math.floor(legs.length / 2))
    if (pairs < Math.floor(legs.length / 2)) violations.push(`对称腿对 ${pairs}/${Math.floor(legs.length / 2)}`)
  }

  // 比例：腿在桌面外缘内
  let ratioScore = 0
  if (desk !== null && legs.length > 0) {
    const db = aabb(desk)
    const ok = legs.filter(
      (l) =>
        Math.abs(l.position[0] - desk!.position[0]) <= (db.max[0] - db.min[0]) / 2 + 0.05 &&
        Math.abs(l.position[2] - desk!.position[2]) <= (db.max[2] - db.min[2]) / 2 + 0.05 &&
        l.scale[0] <= db.max[0] - db.min[0] + 0.05 &&
        l.scale[2] <= db.max[2] - db.min[2] + 0.05
    ).length
    ratioScore = ok / legs.length
    if (ok < legs.length) violations.push(`有腿超出桌面外缘或截面过大`)
  }

  // 无穿模：腿间不重叠；腿不穿透桌面（腿顶 − 桌底 ≤ 0.02）
  let noClipScore = 1
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      if (aabbOverlapVolume(legs[i], legs[j]) > 1e-9) {
        noClipScore = 0
        violations.push(`腿 ${i + 1} 与腿 ${j + 1} 互相穿模`)
      }
    }
    if (desk !== null && topY(legs[i]) - bottomY(desk) > 0.02) {
      noClipScore = 0
      violations.push(`腿 ${i + 1} 穿透桌面`)
    }
  }

  // 多余元件惩罚（不静默，如实记录）
  const extraPenalty = Math.min(1, extras.length / 3) * 0.1
  for (const e of extras) violations.push(`多余元件：${JSON.stringify(e)}`)

  const score = clamp01(
    0.12 * legScore +
      0.15 * deskScore +
      0.15 * clearScore +
      0.2 * supportScore +
      0.1 * symmetryScore +
      0.1 * ratioScore +
      0.08 * groundScore +
      0.05 * noClipScore +
      0.05 * healthy -
      extraPenalty
  )

  return {
    taskId: 'T4',
    parseOk: true,
    score,
    breakdown: {
      腿数量: legs.length,
      桌面: desk !== null ? 1 : 0,
      净空: Number(clearScore.toFixed(3)),
      四象限支撑: Number(supportScore.toFixed(3)),
      对称: Number(symmetryScore.toFixed(3)),
      比例: Number(ratioScore.toFixed(3)),
      贴地: Number(groundScore.toFixed(3)),
      无穿模: noClipScore,
      健康: healthy,
      多余元件: extras.length,
      score: Number(score.toFixed(4))
    },
    violations
  }
}
