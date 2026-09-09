/**
 * gia-common.ts — 网格导出链共享的 GIA 构造约定（根缩放补偿 + 模型常量）。
 *
 * AGENTS.md 铁律 #1：真实尺寸 = root × 数据（root 同时乘位置与缩放）；root=0.1 → 空模型 0.1；
 * 改 root 必须「位置与缩放同乘 1/root」双向补偿。export-mesh 与 contour-model 两条 CLI
 * 共用本模块，保证它们对同一网格输出同一 root 语义（rootTransform.scale + item 补偿）。
 *
 * AGENTS.md 铁律 #2：曲面项目用 10009003 平面（不是 10009001 盒）；面板化默认
 * { rotationMode:'normal', normalTolerance:0.2 }（见 panelize.ts 的 panelizeMesh）。
 */

import type { StructureItem } from '../core/structure.js'

/** GIA 文件声明的游戏版本。 */
export const GAME_VERSION = '6.7.0'
/** 模型单元 ID（definition skeleton 自然 ID）。 */
export const UNIT_ID = 1077936129
/** 模板 prefab ID（空模型模板 10005018）。 */
export const TEMPLATE_PREFAB_ID = 10005018
/** 网格 item 的 resourceId（10009019 中间网格；正式导出必须走面板化，见铁律 #6）。 */
export const MESH_RESOURCE_ID = 10009019

/**
 * GIA 根缩放（AGENTS 铁律 #1）。
 *
 * 空模型初始尺寸 = 根配置常量 500 × rootTransform.scale（格式文档 f7[6] 记录 500.0）。
 * root=0.1 → 空模型 0.1×0.1×0.1（游戏实测）；旧约定 0.0002 是"要得到 0.1 需 scale=0.1/500"
 * 的历史取巧，已被铁律 #1 取代（真实尺寸语义由 root 单一表达，不再用 500 缩放）。
 * 游戏内 root 同时乘到位置与缩放 → 数据侧以 ÷ROOT_SCALE 双向补偿，真实尺寸保持不变。
 */
export const ROOT_SCALE = 0.1

/**
 * 整体缩放率默认值（用户需求 2026-09-09：网页两个参数中的第二个）。
 *
 * 语义（与用户实测公式一致）：
 *   实际写入 rootTransform.scale = 主模型缩放 S × 整体缩放率 K
 *   装饰物数据侧一律 ÷S（position 与 scale 同时除，root 在游戏内会乘回）
 *   → 游戏内真实尺寸 = 建模尺寸 × K；主模型:装饰物 比例只由 S 决定（K 不改变比例）。
 * 例：S=0.1,K=1 → root 0.1、装饰物 ×10、真实尺寸=建模尺寸；
 *     S=0.1,K=2 → root 0.2、装饰物仍 ×10 → 整体放大 2 倍；
 *     S=0.2,K=1 → root 0.2、装饰物 ×5 → 整体尺寸不变、主模型相对更大。
 */
export const OVERALL_SCALE = 1

/** 网页 / CLI 可调的 GIA 缩放参数。 */
export type GiaScaleOptions = {
  /** 主模型缩放 S（默认 ROOT_SCALE=0.1）：控制主模型与装饰物的大小比例，不影响整体尺寸。 */
  rootScale?: number
  /** 整体缩放率 K（默认 1）：只改实际主模型缩放、不动装饰物数据 → 整体尺寸 ×K，比例不变。 */
  overallScale?: number
}

/** 校验并解析缩放参数 → 实际 root 缩放值（S×K）。非法值抛错（网页侧会被 /api/export 转成 400）。 */
export function resolveGiaScale(opts?: GiaScaleOptions): {
  rootScale: number
  overallScale: number
  rootTransformScale: number
} {
  const rootScale = opts?.rootScale ?? ROOT_SCALE
  const overallScale = opts?.overallScale ?? OVERALL_SCALE
  if (!Number.isFinite(rootScale) || rootScale <= 0) {
    throw new Error(`[gia] 主模型缩放必须为正数（got ${String(opts?.rootScale)}）`)
  }
  if (!Number.isFinite(overallScale) || overallScale <= 0) {
    throw new Error(`[gia] 整体缩放率必须为正数（got ${String(opts?.overallScale)}）`)
  }
  return { rootScale, overallScale, rootTransformScale: rootScale * overallScale }
}

/** makeGiaInput 返回的 GIA 结构输入（可被 encodeGia 直接消费）。 */
export type GiaInput = {
  schemaVersion: 1
  model: {
    name: string
    unitId: number
    templatePrefabId: number
    rootTransform: { position: number[]; rotation: number[]; scale: number[] }
    items: {
      id: number
      resourceId: number
      position: number[]
      rotation: number[]
      scale: number[]
      color?: StructureItem['color']
      name?: string
    }[]
  }
  file: { filePath: string; gameVersion: string }
}

/**
 * 把一张已 resolve 的 structure 的 items 包成 GIA 模型输入。
 *
 * 关键补偿（铁律 #1）：rootTransform.scale = [S×K, S×K, S×K]，
 * 且每个 item 的 position/scale 均 ÷S（root 在游戏内会再次乘回，故真实尺寸 ×K）。
 * S=主模型缩放（默认 0.1）、K=整体缩放率（默认 1）；不传 opts 时与历史行为字节级一致。
 * 确保 export-mesh / contour-model 输出同一 root 语义（字节级一致，除非模型名/ID 不同）。
 */
export function makeGiaInput(name: string, items: readonly StructureItem[], opts?: GiaScaleOptions): GiaInput {
  const { rootScale, rootTransformScale } = resolveGiaScale(opts)
  const giaItems = items.map((it, idx) => ({
    id: 1073741824 + idx + 1,
    resourceId: it.resourceId,
    position: [...it.position.map((v: number) => v / rootScale)],
    rotation: [...it.rotation],
    scale: [...it.scale.map((v: number) => v / rootScale)],
    ...(it.color === undefined ? {} : { color: it.color, name: `item_${idx + 1}` })
  }))
  return {
    schemaVersion: 1,
    model: {
      name,
      unitId: UNIT_ID,
      templatePrefabId: TEMPLATE_PREFAB_ID,
      rootTransform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [rootTransformScale, rootTransformScale, rootTransformScale]
      },
      items: giaItems
    },
    file: { filePath: `${name}.gia`, gameVersion: GAME_VERSION }
  }
}
