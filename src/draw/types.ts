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
 *   'up'=竖直（局部 Y，零旋转）/ 'front'=绕 X 转 90°（轴向 +Z）/ 'side'=绕 Z 转 −90°（轴向 +X）。 */
export type Stroke = {
  id: string
  points: ReadonlyArray<readonly [number, number]>
  color?: string
  render?: 'rod' | 'solid'
  height?: number
  axis?: 'up' | 'front' | 'side'
}

/** 生成参数。 */
export type ModelOptions = {
  mode: 'extrude' | 'lathe'
  shape: 'cylinder' | 'box' // extrude 杆样式；lathe 忽略
  size: number // 米：圆柱直径 / 方杆截面边长
  count: number // 每个笔画生成的元件数（extrude=段数，lathe=盘片层数）
  heightMeters: number // 归一化后模型高度（包络盒高映射到此值）
  canvasHeightPx?: number // 四期标定：画布可视区高（像素）。缺省 → 按内容包络盒标定（旧行为）
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
/** 长方体（10009001）：scale=[宽, 高, 长]，长轴 = 局部 Z。 */
export const BOX_RESOURCE_ID = 10009001

export { generateModel, toStructureItems } from './generate.js'
export type { StructureItem }