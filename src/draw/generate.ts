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
import { BOX_RESOURCE_ID, CYLINDER_RESOURCE_ID, OPEN_CYLINDER_RESOURCE_ID } from './types.js'
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
  // 四期标定：优先按画布可视区高（canvasHeightPx 像素 = heightMeters 米）——
  // 画布上画多大，模型就是多大；缺省退回旧行为（内容包络盒高 = heightMeters）
  const canvasPx = opts.canvasHeightPx
  const canvasScale =
    Number.isFinite(canvasPx) && (canvasPx as number) > 0 ? heightMeters / (canvasPx as number) : null
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
    // canvasScale 非空时（四期画布标定）：每像素 = heightMeters / 画布高 米，与画布视觉一致
    const scale =
      canvasScale !== null
        ? canvasScale
        : bboxHeight > 0
          ? heightMeters / bboxHeight
          : heightMeters / Math.max(bboxWidth, 1e-9)
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
        // 五期：solid 用自身包围盒定位（全局 bbox 会让柱体偏离 lathe 母线轴/悬浮）
        if (stroke?.render === 'solid') {
          const sRaw = rawBounds([stroke as Stroke])
          const sBh = sRaw !== null ? Math.max(sRaw.maxY - sRaw.minY, 0) : bboxHeight
          // x 用全局包围盒（对齐 lathe 母线轴），z 用自身包围盒（贴母线底）
          items.push(solidColumn(stroke, raw, bboxWidth, bboxHeight, scale, colorOf(fit.id), sRaw ?? raw))
          continue
        }
        // 五期：显式 rod 在 lathe 全局模式下走杆（不车削）——把手/辐条等非旋转体元素。
        // 杆按 RDP 简化锚点逐段生成（保留笔画折线特征）；用重采样点会把曲线碎成 count 段小杆。
        if (stroke?.render === 'rod') {
          let anchors = simplifyRdp(stroke.points, adaptiveEpsilon(stroke.points))
          // 合并过短段（段长 < 杆半径像素）——短杆端面与长杆相邻会堆叠成视觉接缝（视觉模型实测发现）
          // 杆半径(px) = size(米) / scale(米/px) / 2；scale 来自画布标定或 bbox 标定
          const minSegPx = Math.max(size / scale / 2, 2)
          if (anchors.length > 2) {
            const kept: [number, number][] = [[anchors[0][0], anchors[0][1]]]
            for (let i = 1; i < anchors.length - 1; i++) {
              const prev = kept[kept.length - 1]
              const d = Math.hypot(anchors[i][0] - prev[0], anchors[i][1] - prev[1])
              if (d >= minSegPx) kept.push([anchors[i][0], anchors[i][1]])
            }
            kept.push([anchors[anchors.length - 1][0], anchors[anchors.length - 1][1]])
            anchors = kept
          }
          for (let i = 0; i + 1 < anchors.length; i++) {
            const rod = extrudeRod(
              anchors[i], anchors[i + 1], toWorld, size, opts.shape, fit.id, colorOf(fit.id)
            )
            if (rod !== null) {
              liftByHeight(rod, stroke)
              items.push(rod)
            }
          }
          continue
        }
        const minX = rawMinX.get(fit.id) ?? raw.minX
        // 五期：等高度归并后取最宽半径 → 单个开口薄壁圆柱（无缝闭合旋转体；
        // 48 条 BOX 壳条有棱有缝已弃用；实心盘片叠成实心柱更早弃用）
        const layers = sampleByHeight(fit.points, count)
        const rMax = Math.max(...layers.map((p) => (p[0] - minX) * scale))
        if (rMax > 0) {
          // 壳高 = 笔画自身 bbox 高（全局 maxY 会被其他笔画抬高；层心范围比全高短一个步长）
          const sRaw = rawBounds([stroke as Stroke])
          const shellH = sRaw !== null ? (sRaw.maxY - sRaw.minY) * scale : (raw.maxY - raw.minY) * scale
          const wall: TaggedItem = {
            resourceId: OPEN_CYLINDER_RESOURCE_ID,
            position: [toWorld(minX, 0)[0], shellH / 2, 0], // 轴心居中、母线底贴 y=0
            rotation: [0, 0, 0], // 轴向 Y 零旋转
            scale: [2 * rMax, shellH, 2 * rMax], // 直径 = 2×最宽半径
            group: fit.id,
            ...(colorOf(fit.id) === undefined ? {} : { color: itemColor(colorOf(fit.id)) })
          }
          liftByHeight(wall, stroke)
          items.push(wall)
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
/** 椭圆判定：相对方差上限（60×42 椭圆 ≈ 0.059；三角/五角星等 > 0.1）。 */
const ELLIPSE_RADIUS_REL_VARIANCE = 0.1
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
    // 角 = 转角 50°~160°：160°+ 的近直线点（椭圆抽稀/首尾拼接的边缘效应）不算角；
    // 圆/椭圆抽稀后转角约 20~40°，正多边形 ≥ 60°——50° 阈值区分平滑曲线与多边形
    const t = turnAngle(pts, i)
    if (t > CORNER_TURN_DEG && t < 160) corners.push(i)
  }
  // 矩形优先：四角近似 90°、对边平行（角点顺序绕轮廓一周）
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
  }
  // 非矩形（含角数 1~3：椭圆抽稀后长轴两端常各留一个高转角点，如 109°/167°）→
  // 用半径方差判圆/椭圆（不依赖转角；三角/五角星等半径方差大 → 拒绝）
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
  // 圆/椭圆要求平滑（角数 ≤ 2；椭圆长轴两端各留一个高转角点）：多边形（≥ 3 角）拒绝
  const smooth = corners.length <= 2
  if (smooth && meanR > 0 && aspect < CIRCLE_ASPECT_MAX && varR < CIRCLE_RADIUS_REL_VARIANCE * meanR * meanR) {
    return 'circle'
  }
  if (smooth && meanR > 0 && varR < ELLIPSE_RADIUS_REL_VARIANCE * meanR * meanR) {
    return 'ellipse'
  }
  throw new Error('暂不支持该轮廓形状（支持圆/椭圆/矩形）')
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
  color?: string,
  zRaw: { minY: number; maxY: number } = raw // 五期：z 定位用的包围盒（lathe 下传自身，贴母线底/轴平面）
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
  const zBboxH = Math.max(zRaw.maxY - zRaw.minY, 0)
  const centerZ = ((minY + maxY) / 2 - zRaw.minY) * scale - (zBboxH * scale) / 2
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

/**
 * 五期：lathe 母线等高度归并——每层取该 y 邻域的最大 x。
 * 水平渐变段（y 恒定）归并为单层，避免弧长采样把渐变段叠成底部台阶。
 */
function sampleByHeight(points: CanvasPoint[], count: number): CanvasPoint[] {
  const minY = Math.min(...points.map((p) => p[1]))
  const maxY = Math.max(...points.map((p) => p[1]))
  const layers: CanvasPoint[] = []
  const step = (maxY - minY) / count
  for (let i = 0; i < count; i++) {
    const y = maxY - step * (i + 0.5)
    let bestX = -Infinity
    for (const [x, py] of points) {
      if (Math.abs(py - y) <= step / 2 + 1e-9 && x > bestX) bestX = x
    }
    if (bestX > -Infinity) layers.push([bestX, y])
  }
  return layers
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
