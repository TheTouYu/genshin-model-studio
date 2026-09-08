/**
 * 官方基础元件资源表——单一权威语义元数据。
 *
 * 名称（元件列）以 `official-resources.ts` 的 OFFICIAL_PREFAB_NAMES 为准（本文件只
 * 通过 `officialPrefabName` 取用，不重复登记）；本文件补充两列语义（scale 语义 /
 * 零旋转局部基）、状态列（已闭合 / 未校准）与 README 速查表的简短语义。
 *
 * 单一来源约束：任何资源表/文档只允许从这里生成或校验，禁止在三处文档里手抄冲突。
 * - `docs/input-format.md §资源速查表`（5 列）
 * - `README.md §资源速查表（初稿）`（3 列，缩短版）
 * - `src/cli/gen-model.ts --list-resources`（命令行版）
 *
 * 语义未能游戏内验证的项（未校准）不得当作「已闭合」写入主干文档；闭合需先在
 * docs/calibration-mesh-elements.md 记录对照结论。
 */
import { officialPrefabName } from './official-resources.js'

/** 状态列取值：已闭合 = 游戏/编辑器对照通过；已闭合* = 带脚注；未校准 = 仅登记，未验证视觉语义。 */
export type ResourceStatus = '已闭合' | '已闭合*' | '未校准'

export interface ResourceMeta {
  /** 官方基础元件资源 ID。 */
  resourceId: number
  /** scale=[1,1,1] 语义（docs/input-format.md 第 3 列）。 */
  scaleSemantics: string
  /** 零旋转局部基（docs/input-format.md 第 4 列）。 */
  localBasis: string
  /** 状态列（docs/input-format.md 第 5 列）。 */
  status: ResourceStatus
  /** README 速查表（3 列）第 3 列的简短语义。 */
  readmeSemantics: string
}

/** 规范资源行：ID / 名称 / 语义固定列。名称由官方名表解析，须全覆盖。 */
export interface ResourceRow {
  resourceId: number
  name: string
  scaleSemantics: string
  localBasis: string
  status: ResourceStatus
  readmeSemantics: string
}

/** 资源语义元数据表：ID 升序，与 docs 资源表一一对应（10009007 不存在，故跳过）。 */
export const RESOURCE_META: readonly ResourceMeta[] = [
  {
    resourceId: 10005018,
    scaleSemantics: '无可见几何',
    localBasis: '作为宿主保存局部原点',
    status: '已闭合',
    readmeSemantics: '宿主模板，无可见几何'
  },
  {
    resourceId: 10009001,
    scaleSemantics: '`1×1×1`（边长 1 米，半尺寸 0.5）',
    localBasis: 'X/Y/Z 对应三条边；`scale=[宽, 高, 长]`，长轴=局部 Z',
    status: '已闭合',
    readmeSemantics: '1×1×1；scale=[宽,高,长]，长轴=Z'
  },
  {
    resourceId: 10009002,
    scaleSemantics: '直径 1（统一设计语言）',
    localBasis: '—',
    status: '已闭合*',
    readmeSemantics: '直径 1'
  },
  {
    resourceId: 10009003,
    scaleSemantics: '`1×1`',
    localBasis: '—',
    status: '未校准',
    readmeSemantics: '1×1（未校准）'
  },
  {
    resourceId: 10009004,
    scaleSemantics:
      '高 1，底面正三角形**外接圆直径 1**（外接半径 0.5，边长 0.866）',
    localBasis: '高度轴 Y；底面 XZ；一个顶点朝 `-Z`',
    status: '已闭合',
    readmeSemantics: '高 1，底面外接圆直径 1；顶点朝 -Z'
  },
  {
    resourceId: 10009005,
    scaleSemantics:
      '高 1，底面正五边形**外接圆直径 1**（外接半径 0.5，边长 0.588，顶点到对边距离 0.905）',
    localBasis: '高度轴 Y；底面 XZ；一个顶点朝 `-Z`',
    status: '已闭合',
    readmeSemantics: '高 1，底面外接圆直径 1；顶点朝 -Z'
  },
  {
    resourceId: 10009006,
    scaleSemantics: '—',
    localBasis: '—',
    status: '未校准',
    readmeSemantics: '未校准'
  },
  {
    resourceId: 10009008,
    scaleSemantics: '截面直径 1',
    localBasis: '**零旋转轴向 Y（竖直）**；`scale=[截面直径, 轴向长度, 截面直径]`',
    status: '已闭合',
    readmeSemantics: '截面直径 1；零旋转轴向 Y'
  },
  {
    resourceId: 10009009,
    scaleSemantics: '—',
    localBasis: '—',
    status: '未校准',
    readmeSemantics: '未校准'
  },
  {
    resourceId: 10009010,
    scaleSemantics: '—',
    localBasis: '—',
    status: '未校准',
    readmeSemantics: '未校准'
  },
  {
    resourceId: 10009011,
    scaleSemantics: '—',
    localBasis: '—',
    status: '未校准',
    readmeSemantics: '未校准'
  },
  {
    resourceId: 10009012,
    scaleSemantics: '截面直径 1；轴向长 = `scale.y`（空心，无顶盖/底盖 openEnded）',
    localBasis: '**零旋转轴向 Y（竖直）**；`scale=[截面直径, 轴向长, 截面直径]`',
    status: '未校准',
    readmeSemantics: '截面直径 1；空心无盖底'
  },
  {
    resourceId: 10009019,
    scaleSemantics: '几何由 `vertices/faces/colors` 承载（世界坐标）；`scale` 无尺寸语义',
    localBasis: '顶点即世界坐标（`position/rotation` 忽略，非变换语义）',
    status: '未校准',
    readmeSemantics: '由顶点+面承载（世界坐标）'
  }
]

/** 由官方名表 + 本体语义元数据合成规范资源行（名称取官方注册，保证不漂移）。 */
export function canonicalResourceRows(): ResourceRow[] {
  return RESOURCE_META.map((meta) => {
    const name = officialPrefabName(meta.resourceId)
    if (name === undefined) {
      throw new Error(
        `[resource-meta] resource ${meta.resourceId} 未在 official-resources.ts 登记名称；` +
          `资源表单一来源被破坏，请同步登记`
      )
    }
    return { ...meta, name }
  })
}
