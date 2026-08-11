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
 *
 * 四期（PRD §4/§5.2）增量：
 * - render='solid' 且封闭 → 柱体渲染器：轮廓（圆/椭圆/矩形）→ 元件（10009008 圆柱 /
 *   10009001 长方体），位置 = 轮廓包围盒中心（画布 x→世界 x、画布 y→世界 z，全局
 *   归一化居中），y = height/2（柱体底贴 y=0），厚度 = stroke.height（Y 向，>0）；
 * - axis 旋转（与现有 YXZ 内旋约定一致）：up=[0,0,0]；front=[90,0,0]（局部 Y→+Z）；
 *   side=[0,0,−90]（局部 Y→+X）；
 * - stroke.height 对 rod/lathe 笔画：该笔所有 item 的 position.y += height（整体抬升）。
 */
import type { ModelOptions, Stroke, TaggedItem, TaggedItemColor } from './types.js'
import { BOX_RESOURCE_ID, CYLINDER_RESOURCE_ID } from './types.js'
import { adaptiveEpsilon, fitStroke, simplifyRdp, type FittedStroke } from './fitting.js'
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
  const strokeById = new Map<string, Stroke>()
  for (const stroke of strokes) {
    if (stroke.color !== undefined) colorById.set(stroke.id, stroke.color)
    strokeById.set(stroke.id, stroke)
  }
  const colorOf = (strokeId: string): string | undefined => colorById.get(strokeId)
  // 四期预检（PRD §5.2）：render='solid' 笔画必须封闭，否则整单 400（含退化笔画）
  for (const stroke of strokes) {
    if (stroke.render === 'solid') {
      const fit = fitted.find((f) => f.id === stroke.id) ?? null
      if (fit === null || !fit.closed) throw new Error('柱体渲染需要封闭轮廓')
    }
  }
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
        const stroke = strokeById.get(fit.id)
        if (stroke?.render === 'solid') {
          items.push(solidColumn(stroke, raw, bboxWidth, bboxHeight, scale, colorOf(fit.id)))
          continue
        }
        for (let i = 0; i + 1 < fit.points.length; i++) {
          const rod = extrudeRod(
            fit.points[i], fit.points[i + 1], toWorld, size, opts.shape, fit.id, colorOf(fit.id)
          )
          if (rod !== null) {
            liftByHeight(rod, stroke)
            items.push(rod)
          }
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
        const stroke = strokeById.get(fit.id)
        // 四期：solid 笔画在 lathe 全局模式下独立走柱体（不绕轴），其余照旧
        if (stroke?.render === 'solid') {
          items.push(solidColumn(stroke, raw, bboxWidth, bboxHeight, scale, colorOf(fit.id)))
          continue
        }
        const minX = rawMinX.get(fit.id) ?? raw.minX
        for (const point of fit.points) {
          const disc = latheDisc(point, toWorld, minX, scale, heightMeters, count, fit.id, colorOf(fit.id))
          if (disc !== null) {
            liftByHeight(disc, stroke)
            items.push(disc)
          }
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

/** 四期：stroke.height（米，沿模型 Y 抬升）作用于该笔所有 item 的 position.y；缺省 0 = 原样。 */
function liftByHeight(item: TaggedItem, stroke: Stroke | undefined): void {
  const height = stroke?.height
  if (height !== undefined && height !== 0) item.position[1] += height
}

/** 顶点转角（度）：p[i-1]→p[i]→p[i+1] 的外转角，直行 = 0°。
 * 矩形角 = 90°；正五/六边形 = 72°/60°；圆经 RDP 抽稀后 < 45°。 */
function turnAngle(pts: readonly (readonly [number, number])[], i: number): number {
  const n = pts.length
  const [ax, ay] = pts[(i - 1 + n) % n]
  const [bx, by] = pts[i]
  const [cx, cy] = pts[(i + 1) % n]
  const ux = bx - ax
  const uy = by - ay
  const vx = cx - bx
  const vy = cy - by
  const ul = Math.hypot(ux, uy)
  const vl = Math.hypot(vx, vy)
  if (ul === 0 || vl === 0) return 0
  const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (ul * vl)))
  return (Math.acos(cos) * 180) / Math.PI
}

/** 转角 ≥ 该值的顶点视为“角”；圆/椭圆抽稀后转角约 20~40°，正八边形恰 45°（含浮点误差），
 * 多边形 ≥ 60°（正六边形）——取 50° 双留余量：八边及以下归平滑曲线（圆/椭圆），六边及以上归多边形。 */
const CORNER_TURN_DEG = 50
/** 矩形角近似 90° 容差（度）。 */
const RECT_ANGLE_TOL_DEG = 15
/** 矩形对边平行容差（度）。 */
const RECT_PARALLEL_TOL_DEG = 10
/** 圆判定：宽高比上限。 */
const CIRCLE_ASPECT_MAX = 1.1
/** 圆判定：点到质心距离的相对方差上限（方差 / 平均半径²；正方形 ≈ 0.030，1.2:1 椭圆 ≈ 0.012）。 */
const CIRCLE_RADIUS_REL_VARIANCE = 0.01
/** 闭合轮廓首尾去重：首尾距离 < 对角线 × 该比例时视为重复闭合点（矩形工具常首尾同点）。 */
const CLOSURE_DEDUP_RATIO = 0.01

type RecognizedShape = 'circle' | 'ellipse' | 'rectangle'

/**
 * 四期柱体轮廓识别（PRD §5.2 表格）：
 * 抽稀（RDP，保留尖角）→ 顶点转角统计：
 * - 恰 4 角且角 ≈ 90°、对边平行 → 矩形；4 角但非矩形 → 其他形状抛错；
 * - 3 角或 ≥ 5 角 → 多边形，一期不支持抛错；
 * - 平滑闭合曲线 → 圆（点到质心距离相对方差 < 阈值且宽高比 < 1.1）否则椭圆。
 */
function recognizeShape(points: readonly (readonly [number, number])[]): RecognizedShape {
  let pts = simplifyRdp(points, adaptiveEpsilon(points))
  if (pts.length > 2) {
    // 首尾重复的闭合点合并（矩形工具输出常首尾同点）
    const first = pts[0]
    const last = pts[pts.length - 1]
    const dist = Math.hypot(first[0] - last[0], first[1] - last[1])
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of pts) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    const diag = Math.hypot(maxX - minX, maxY - minY)
    if (diag > 0 && dist < diag * CLOSURE_DEDUP_RATIO) pts = pts.slice(0, -1)
  }
  const n = pts.length
  const corners: number[] = []
  for (let i = 0; i < n; i++) {
    if (turnAngle(pts, i) > CORNER_TURN_DEG) corners.push(i)
  }
  if (corners.length === 4) {
    // 矩形候选：四角近似 90°、对边平行（角点顺序绕轮廓一周）
    const side = (k: number): [number, number] => {
      const [ax, ay] = pts[corners[k]]
      const [bx, by] = pts[corners[(k + 1) % 4]]
      return [bx - ax, by - ay]
    }
    const rightAngles = (() => {
      for (let k = 0; k < 4; k++) {
        const [ux, uy] = side((k + 3) % 4) // 进入该角的边（反方向）
        const [vx, vy] = side(k) // 离开该角的边
        const ul = Math.hypot(ux, uy)
        const vl = Math.hypot(vx, vy)
        if (ul === 0 || vl === 0) return false
        const angle = (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (ul * vl)))) * 180) / Math.PI
        if (Math.abs(angle - 90) > RECT_ANGLE_TOL_DEG) return false
      }
      return true
    })()
    const parallel = (() => {
      const cosTol = Math.cos((RECT_PARALLEL_TOL_DEG * Math.PI) / 180)
      for (const [k, l] of [[0, 2], [1, 3]] as const) {
        const [ux, uy] = side(k)
        const [vx, vy] = side(l)
        const ul = Math.hypot(ux, uy)
        const vl = Math.hypot(vx, vy)
        if (ul === 0 || vl === 0) return false
        if (Math.abs((ux * vx + uy * vy) / (ul * vl)) < cosTol) return false
      }
      return true
    })()
    if (rightAngles && parallel) return 'rectangle'
    throw new Error('暂不支持该轮廓形状（支持圆/椭圆/矩形）')
  }
  if (corners.length !== 0) {
    // 三角/五边及以上 → 一期不支持
    throw new Error('暂不支持该轮廓形状（支持圆/椭圆/矩形）')
  }
  // 平滑闭合曲线 → 圆 / 椭圆
  let cx = 0
  let cy = 0
  for (const [x, y] of pts) {
    cx += x
    cy += y
  }
  cx /= n
  cy /= n
  let meanR = 0
  let varR = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of pts) {
    const r = Math.hypot(x - cx, y - cy)
    meanR += r
    varR += r * r
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  meanR /= n
  varR = varR / n - meanR * meanR
  const w = maxX - minX
  const h = maxY - minY
  const aspect = Math.min(w, h) > 0 ? Math.max(w, h) / Math.min(w, h) : Infinity
  if (meanR > 0 && aspect < CIRCLE_ASPECT_MAX && varR < CIRCLE_RADIUS_REL_VARIANCE * meanR * meanR) {
    return 'circle'
  }
  return 'ellipse'
}

/**
 * 四期柱体渲染器（PRD §5.2）：封闭轮廓 → 实体柱体。
 * 位置 = 轮廓包围盒中心（画布 x→世界 x、画布 y→世界 z），y = 厚度/2（底贴 y=0）；
 * 厚度 = stroke.height（>0）；scale：[圆] = [直径, 厚度, 直径]，[椭圆/矩形] = [宽, 厚度, 深]。
 */
function solidColumn(
  stroke: Stroke,
  raw: { minX: number; minY: number; maxX: number; maxY: number },
  rawBboxWidth: number,
  rawBboxHeight: number,
  scale: number,
  color?: string
): TaggedItem {
  const thickness = stroke.height ?? 0
  if (!(thickness > 0)) throw new Error('柱体高度需大于 0（米）')
  const shape = recognizeShape(stroke.points)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of stroke.points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  const width = (maxX - minX) * scale
  const depth = (maxY - minY) * scale
  // 包围盒中心：x = 画布 x 中心 → 世界 x（全局居中）；z = 画布 y 中心 → 世界 z（全局居中）
  const centerX = ((minX + maxX) / 2 - raw.minX) * scale - (rawBboxWidth * scale) / 2
  const centerZ = ((minY + maxY) / 2 - raw.minY) * scale - (rawBboxHeight * scale) / 2
  const axis = stroke.axis ?? 'up'
  const rotation: Vec3 =
    axis === 'front' ? [90, 0, 0] : axis === 'side' ? [0, 0, -90] : [0, 0, 0]
  const scale3: Vec3 = shape === 'circle' ? [width, thickness, width] : [width, thickness, depth]
  return {
    resourceId: shape === 'rectangle' ? BOX_RESOURCE_ID : CYLINDER_RESOURCE_ID,
    position: [centerX, thickness / 2, centerZ],
    rotation,
    scale: scale3,
    group: stroke.id,
    ...(color === undefined ? {} : { color: itemColor(color) })
  }
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
