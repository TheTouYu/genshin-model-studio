/**
 * 二期画线建模：元件生成（渲染器层，PRD §5.2 坐标语义）+ 拍平导出。
 *
 * 坐标语义（依据 docs/input-format.md）：
 * - 归一化：全部笔画原始点包络盒 → 保持宽高比、高 = heightMeters 米；
 *   y 向上（画布 y 翻转）、最低点贴 y=0、水平居中 x=0、z=0 平面。
 * - extrude：每段一个杆（圆柱 10009008 / 长方体 10009001），轴向对齐线段，
 *   位置 = 段中点。
 *   - 圆柱零旋转轴向 = 局部 Y（速查表 10009008），scale=[直径, 段长, 直径]；
 *   - 长方体长轴 = 局部 Z（速查表 10009001），scale=[边长, 边长, 段长]；
 *   - 旋转 = 编辑器 YXZ 内旋 R=Ry(β)·Rx(α)·Rz(γ)（docs 坐标语义），取 γ=0：
 *     R·(0,1,0) = (sinβ·sinα, cosα, cosβ·sinα) ⇒ 圆柱 α=acos(dy), β=atan2(dx,dz)
 *     R·(0,0,1) = (sinβ·cosα, −sinα, cosβ·cosα) ⇒ 方杆 α=asin(−dy), β=atan2(dx,dz)
 * - lathe：旋转轴 = 归一化前笔画包围盒左边缘（raw minX），半径 = (x − minX)×scale；
 *   按采样点高度叠放圆盘（10009008，轴向 Y 零旋转），盘厚 = 总高 / count，
 *   scale.x/z = 直径 = 2r。
 */
import type { ModelOptions, Stroke, TaggedItem, TaggedItemColor } from './types.js'
import { BOX_RESOURCE_ID, CYLINDER_RESOURCE_ID } from './types.js'
import { fitStroke, type FittedStroke } from './fitting.js'
import type { StructureItem } from '../core/structure.js'

export type GenerateResult = { items: TaggedItem[]; closed: boolean[] }

type Vec3 = [number, number, number]
type CanvasPoint = readonly [number, number]
/** 画布 → 世界映射（归一化，z=0）。 */
type ToWorld = (x: number, y: number) => Vec3

const DEG = 180 / Math.PI

function rawBounds(strokes: readonly Stroke[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of strokes) {
    for (const [x, y] of stroke.points) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY }
}

/**
 * 按 PRD §5.1 契约生成元件。closed[i] 与 strokes[i] 一一对应；
 * 退化笔画（点数不足 / 零长度）不产生元件但 closed 仍按序给出。
 */
export function generateModel(strokes: Stroke[], opts: ModelOptions): GenerateResult {
  const count = Math.max(1, Math.floor(opts.count))
  const heightMeters = opts.heightMeters > 0 ? opts.heightMeters : 1
  const size = opts.size > 0 ? opts.size : 0.1

  // 拟合（画布像素空间，阈值语义与分辨率解耦）
  const closed: boolean[] = []
  const fitted: FittedStroke[] = []
  const minPoints = opts.mode === 'extrude' ? 2 : 1
  for (const stroke of strokes) {
    const sampleCount = opts.mode === 'extrude' ? count + 1 : count // 段数 → 点 = 段数+1
    const fit = fitStroke(stroke, sampleCount)
    closed.push(fit !== null ? fit.closed : false)
    if (fit !== null && fit.points.length >= minPoints) fitted.push(fit)
  }

  const raw = rawBounds(strokes)
  // 笔画颜色按 id 查表（PRD §9：stroke.color 存在 → 透传到该笔所有 TaggedItem）
  const colorById = new Map<string, string>()
  for (const stroke of strokes) {
    if (stroke.color !== undefined) colorById.set(stroke.id, stroke.color)
  }
  const colorOf = (strokeId: string): string | undefined => colorById.get(strokeId)
  const items: TaggedItem[] = []
  if (raw !== null && fitted.length > 0) {
    const bboxWidth = Math.max(raw.maxX - raw.minX, 0)
    const bboxHeight = Math.max(raw.maxY - raw.minY, 0)
    // 保持宽高比：仅按包络盒高映射到 heightMeters（高度退化为 0 时改用宽度兜底）
    const scale = bboxHeight > 0 ? heightMeters / bboxHeight : heightMeters / Math.max(bboxWidth, 1e-9)
    const toWorld: ToWorld = (x, y) => [
      (x - raw.minX) * scale - (bboxWidth * scale) / 2, // 水平居中 x=0
      (raw.maxY - y) * scale, // y 上、最低点贴 y=0
      0
    ]

    if (opts.mode === 'extrude') {
      for (const fit of fitted) {
        for (let i = 0; i + 1 < fit.points.length; i++) {
          const rod = extrudeRod(
            fit.points[i], fit.points[i + 1], toWorld, size, opts.shape, fit.id, colorOf(fit.id)
          )
          if (rod !== null) items.push(rod)
        }
      }
    } else {
      // lathe：旋转轴 = 归一化前各笔画包围盒左边缘（raw minX）
      const rawMinX = new Map<string, number>()
      for (const stroke of strokes) {
        if (stroke.points.length > 0 && !rawMinX.has(stroke.id)) {
          rawMinX.set(stroke.id, Math.min(...stroke.points.map((p) => p[0])))
        }
      }
      for (const fit of fitted) {
        const minX = rawMinX.get(fit.id) ?? raw.minX
        for (const point of fit.points) {
          const disc = latheDisc(point, toWorld, minX, scale, heightMeters, count, fit.id, colorOf(fit.id))
          if (disc !== null) items.push(disc)
        }
      }
    }
  }
  return { items, closed }
}

/** stroke.color（"0xRRGGBB"）→ TaggedItem 颜色槽；无 color → undefined（不写 = 默认材质）。 */
function itemColor(color: string | undefined): TaggedItemColor | undefined {
  return color === undefined
    ? undefined
    : { enabled: true, rgb: color, opacity: 100, overlay: 'overwrite' }
}

/** extrude 单段杆：轴向对齐线段，位置 = 段中点。 */
function extrudeRod(
  a: CanvasPoint,
  b: CanvasPoint,
  toWorld: ToWorld,
  size: number,
  shape: ModelOptions['shape'],
  group: string,
  color?: string
): TaggedItem | null {
  const wa = toWorld(a[0], a[1])
  const wb = toWorld(b[0], b[1])
  const dx = wb[0] - wa[0]
  const dy = wb[1] - wa[1]
  const dz = wb[2] - wa[2]
  const length = Math.hypot(dx, dy, dz)
  if (length === 0) return null
  const ux = dx / length
  const uy = dy / length
  const uz = dz / length
  // R = Ry(β)·Rx(α)·Rz(γ)，取 γ=0；推导见文件头注释。
  let alphaRad: number
  let betaRad: number
  let scale: Vec3
  if (shape === 'box') {
    alphaRad = Math.asin(-uy) // R·(0,0,1) 的 y 分量 = −sinα
    scale = [size, size, length] // 方杆：长轴 = 局部 Z
  } else {
    alphaRad = Math.acos(uy) // R·(0,1,0) 的 y 分量 = cosα
    scale = [size, length, size] // 圆柱：轴向 = 局部 Y
  }
  betaRad = Math.atan2(ux, uz)
  return {
    resourceId: shape === 'box' ? BOX_RESOURCE_ID : CYLINDER_RESOURCE_ID,
    position: [(wa[0] + wb[0]) / 2, (wa[1] + wb[1]) / 2, 0],
    rotation: [alphaRad * DEG, betaRad * DEG, 0],
    scale,
    group,
    ...(color === undefined ? {} : { color: itemColor(color) })
  }
}

/** lathe 单层盘片：以采样点高度叠放，scale.x/z = 直径 = 2r。 */
function latheDisc(
  point: CanvasPoint,
  toWorld: ToWorld,
  axisMinX: number,
  scale: number,
  heightMeters: number,
  count: number,
  group: string,
  color?: string
): TaggedItem | null {
  const radius = (point[0] - axisMinX) * scale // 半径 = (x − minX) × 归一化比例
  if (radius <= 0) return null
  const world = toWorld(point[0], point[1])
  // 盘心恒在旋转轴上（toWorld(axisMinX) 的世界 x），否则各层圆心随半径偏移、碗身歪斜
  return {
    resourceId: CYLINDER_RESOURCE_ID,
    position: [toWorld(axisMinX, 0)[0], world[1], 0],
    rotation: [0, 0, 0], // 轴向 Y 零旋转
    scale: [2 * radius, heightMeters / count, 2 * radius],
    group,
    ...(color === undefined ? {} : { color: itemColor(color) })
  }
}

/** TaggedItem.color → StructureItem.color：rgb 字符串转数值，写全字段（PRD §9 拍平规则）。 */
function structureColor(color: TaggedItemColor): NonNullable<StructureItem['color']> {
  const rgb = /^0x[0-9a-fA-F]{1,6}$/.test(color.rgb) ? Number.parseInt(color.rgb.slice(2), 16) : NaN
  if (Number.isNaN(rgb)) {
    throw new Error(`[draw] invalid stroke color "${color.rgb}" (expected "0xRRGGBB")`)
  }
  return { enabled: true, rgb, opacity: 100, overlay: 'overwrite' }
}

/** 拍平：strip group 等内部字段；item 有 color → 写全字段，无 color → 不写（默认材质，一期语义）。 */
export function toStructureItems(items: readonly TaggedItem[]): StructureItem[] {
  return items.map(({ resourceId, position, rotation, scale, color }) => ({
    resourceId,
    position,
    rotation,
    scale,
    ...(color === undefined ? {} : { color: structureColor(color) })
  }))
}
