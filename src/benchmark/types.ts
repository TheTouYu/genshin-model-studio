/**
 * benchmark 共享类型：A/B 基准测试体系的统一数据结构。
 *
 * 设计原则（论文方法学）：
 * - 校验器全部纯确定性、与模型无关、可离线重算（rescore 模式）；
 * - 输出统一 JSON：{score, breakdown, violations, parse_ok}；
 * - 解析失败记 0 分并注明原因。
 */
import type { ResolvedStructure } from '../core/structure.js'

/** 统一校验结果：score ∈ [0,1] 为任务头条指标；breakdown 为命名子分；violations 为可读违规清单。 */
export type ValidationResult = {
  taskId: string
  parseOk: boolean
  score: number
  breakdown: Record<string, number | string | boolean>
  violations: string[]
}

/** 版本 = 提示词协议文件 + 确定性管线（identity=原样 / repair=校验修复）。 */
export type VersionConfig = {
  id: string
  protocolFile: string
  pipeline: 'identity' | 'repair'
}

/** 单次运行存档（runs/roundN/{side}-{taskId}-r{rep}.json）。 */
export type RunArchive = {
  round: number
  side: 'A' | 'B'
  taskId: string
  rep: number
  version: string
  protocolFile: string
  promptFile: string
  promptSha256: string
  raw: string
  /** 组件脚本交付（复杂任务）：模型写脚本 → 管道生成 items.json；存在时核验走 itemsPath。 */
  scriptFile?: string
  itemsPath?: string
  /** 网页渲染截图目录（供人工核验）。 */
  viewsDir?: string
}

/** 单次运行得分（含原始结构对照分，用于 A/B 差距归因）。 */
export type RunScore = {
  round: number
  side: 'A' | 'B'
  taskId: string
  rep: number
  version: string
  promptSha256: string
  rawFile: string
  result: ValidationResult
  /** 未过管线（原样输出）的得分，仅诊断用，不参与采纳判定。 */
  rawScore: number
  /** 管线修复/未解决违规记录（repair 管线时非空）。 */
  fixes: string[]
  unresolved: string[]
}

/** 任务元数据：提示词/规格文件冻结 hash；repeats>1 表示每条件多次取均值（论文教训：小样本方向性）。 */
export type TaskMeta = {
  id: string
  paperRef: string
  promptFile: string
  specFile: string
  repeats: number
  validate: (structure: ResolvedStructure) => ValidationResult
  /** 修复管线模式：full=含支撑修复（精确/简单任务）；light=仅贴地/轴对齐/去重（复杂自由结构，结构性悬空合法）。 */
  repairMode?: 'full' | 'light'
}

/** 单轮 A/B 汇总（results.json）。 */
export type RoundSummary = {
  round: number
  versionA: string
  versionB: string
  adopted: boolean
  adoptReason: string
  tasks: Record<
    string,
    {
      A: { score: number; reps: number[] }
      B: { score: number; reps: number[] }
      aRaw: number
      bRaw: number
    }
  >
}
