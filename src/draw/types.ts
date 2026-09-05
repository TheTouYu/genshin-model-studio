/**
 * 二期画线建模：内部数据模型与接口契约（PRD §5.1，跨任务协调，禁止改动）。
 *
 * 函数实现见 generate.ts；此处 re-export，保持 §5.1 单一入口。
 * 坐标语义（PRD §5.2 + docs/input-format.md 速查表）由 generate.ts 保证。
 */
import type { StructureItem } from '../core/structure.js'

/** 笔画：原始画布点（像素，x 右 y 下），不做任何处理，原样保存。
 * color 可选：笔画颜色 "0xRRGGBB"（作品 JSON v2；无 color = 默认材质，兼容 v1）。
 * 四期（作品 JSON v3，PRD §4）：
 * - render：'solid' = 柱体渲染（需封闭轮廓）；'rod' 或缺省 = 跟随全局 mode
 *   （extrude=杆 / lathe=旋转，二者同义）；
 * - height：米，沿模型 Y 抬升（rod 笔画所有 item 的 position.y += height）；
 *   render='solid' 时兼作柱体厚度（Y 向，必须 > 0），柱体底贴 y=0（position.y = 厚度/2）；
 * - axis：柱体轴向（仅 render='solid' 有效），缺省 'up'；
 *   'up'=竖直（局部 Y，零旋转）/ 'front'=绕 X 转 90°（轴向 +Z）/ 'side'=绕 Z 转 −90°（轴向 +X）。
 * - angle：画布旋转角（弧度，可选）。gms.rotate / UI 旋转复制在副本笔画上记录绕
 *   旋转中心的角度 θ（源笔画缺省不写 = 0）；solidColumn 把 θ 编码进元件 rotation[1]
 *   （绕 Y，角度制），使椭圆/圆 solid 的朝向随旋转副本辐向展开（风扇叶片 0/120/240）。
 *   圆各向同性无外观影响；矩形不消费（保持轴对齐 bbox 语义）。
 * - lift：米，可选。柱体（render='solid'）离地抬升：solidColumn 的 position.y =
 *   厚度/2 + lift（柱体底不再贴 y=0，而是抬到 lift 高度）。extrude 与 lathe 共用
 *   solidColumn，两模式都生效；缺省不写 = 0（贴地，既有行为）。杆笔画不消费
 *   （杆的离地抬升用 height）。gms.rotate / UI 旋转复制把 lift 透传给副本
 *   （风扇叶片旋转副本需与源同高度）。
 * - resourceId：可选，仅对 render='solid' 的圆轮廓有效——覆盖默认圆柱/长方体，
 *   目前支持 10009002（球体，scale=[D,D,D]）与 10009009（圆锥，scale=[D,H,D]）。
 *   底层拼装基础元件（球体/圆锥/圆柱/长方体等）统一走同一笔画管线。 */
export type Stroke = {
  id: string
  points: ReadonlyArray<readonly [number, number] | readonly [number, number, number]>
  color?: string
  render?: 'rod' | 'solid'
  height?: number
  axis?: 'up' | 'front' | 'side'
  angle?: number
  lift?: number
  /** 十期（ADR-0001）：整体变换——position 偏移（米，叠加在点集默认位置）；rotation 最终欧拉（度，覆盖 axis/angle 编码）。 */
  transform?: Transform
  /** 十一期：层级组——同组笔画视为一个旋转单元（组旋转/复制时一起动）；静止件不设组。 */
  group?: string
  /** 基础元件覆盖（可选）：10009002 = 球体（仅 solid 圆轮廓）。 */
  resourceId?: number
}

/** 笔画整体变换（ADR-0001）：形状（点集）与摆放（变换）分离。 */
export type Transform = {
  position?: [number, number, number]
  rotation?: [number, number, number]
}
/** 生成参数。 */
export type ModelOptions = {
  mode: 'extrude' | 'lathe'
  shape: 'cylinder' | 'box' // extrude 杆样式；lathe 忽略
  size: number // 米：圆柱直径 / 方杆截面边长
  count: number // 每个笔画生成的元件数（extrude=段数，lathe=盘片层数）
  heightMeters: number // 归一化后模型高度（包络盒高映射到此值）
  canvasHeightPx?: number // 四期标定：画布可视区高（像素）。缺省 → 按内容包络盒标定（旧行为）
  canvasWidthPx?: number // 十六期：画布可视区宽（像素）。配合 canvasHeightPx 固定世界原点（x 以画布中心）——根治外挂件/主体互相漂移
  currentColor?: string // 当前选中色 "0xRRGGBB"（新笔画默认色）；生成侧不消费，由前端新建笔画时落为 stroke.color
}

/** 颜色槽（PRD §9 三期）：rgb 为 "0xRRGGBB" 字符串，拍平时转数值写 StructureItem.color。 */
export type TaggedItemColor = { enabled: true; rgb: string; opacity: number; overlay: 'overwrite' }

/** 带内部标签的元件（导出前必须拍平，strip group）。 */
export type TaggedItem = {
  resourceId: number
  position: [number, number, number] // 米
  rotation: [number, number, number] // 度，编辑器 YXZ 内旋
  scale: [number, number, number]
  group: string // 来源笔画 id
  color?: TaggedItemColor // 来源笔画有 color 时透传（无 = 默认材质，不写）
}

/** 圆柱（10009008）：零旋转轴向 = 局部 Y；scale=[截面直径, 轴向长度, 截面直径]。 */
export const CYLINDER_RESOURCE_ID = 10009008
/** 开口薄壁圆柱（10009012，五期旋转成型）：同圆柱语义，但空心无顶盖/底盖（openEnded，无缝闭合）。 */
export const OPEN_CYLINDER_RESOURCE_ID = 10009012
/** 球体（10009002）：直径 1（统一设计语言），scale=1 = 外接圆直径 1。 */
export const SPHERE_RESOURCE_ID = 10009002
/** 圆锥（10009009）：截面直径 1、高 1（预览几何合理猜测，未校准；尖端 +Y）。 */
export const CONE_RESOURCE_ID = 10009009
/** 长方体（10009001）：scale=[宽, 高, 长]，长轴 = 局部 Z。 */
export const BOX_RESOURCE_ID = 10009001

export { generateModel, toStructureItems } from './generate.js'
export type { StructureItem }