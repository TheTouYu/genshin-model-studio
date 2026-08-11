/**
 * 二期画线建模：内部数据模型与接口契约（PRD §5.1，跨任务协调，禁止改动）。
 *
 * 函数实现见 generate.ts；此处 re-export，保持 §5.1 单一入口。
 * 坐标语义（PRD §5.2 + docs/input-format.md 速查表）由 generate.ts 保证。
 */
import type { StructureItem } from '../core/structure.js'

/** 笔画：原始画布点（像素，x 右 y 下），不做任何处理，原样保存。 */
export type Stroke = { id: string; points: ReadonlyArray<readonly [number, number]> }

/** 生成参数。 */
export type ModelOptions = {
  mode: 'extrude' | 'lathe'
  shape: 'cylinder' | 'box' // extrude 杆样式；lathe 忽略
  size: number // 米：圆柱直径 / 方杆截面边长
  count: number // 每个笔画生成的元件数（extrude=段数，lathe=盘片层数）
  heightMeters: number // 归一化后模型高度（包络盒高映射到此值）
}

/** 带内部标签的元件（导出前必须拍平，strip group）。 */
export type TaggedItem = {
  resourceId: number
  position: [number, number, number] // 米
  rotation: [number, number, number] // 度，编辑器 YXZ 内旋
  scale: [number, number, number]
  group: string // 来源笔画 id（颜色二期按组附着）
}

/** 圆柱（10009008）：零旋转轴向 = 局部 Y；scale=[截面直径, 轴向长度, 截面直径]。 */
export const CYLINDER_RESOURCE_ID = 10009008
/** 长方体（10009001）：scale=[宽, 高, 长]，长轴 = 局部 Z。 */
export const BOX_RESOURCE_ID = 10009001

export { generateModel, toStructureItems } from './generate.js'
export type { StructureItem }
