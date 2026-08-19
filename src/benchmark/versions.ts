/**
 * 版本配置：版本 = 提示词协议文件 + 确定性管线（identity / repair）。
 * 被比较的变量只有版本；两会话同一模型配置，任务提示词逐字相同（hash 校验）。
 *
 * v0 = 基线（直接生成协议 + 原样输出）
 * v1 = v0 协议 + 校验修复管线（论文"生成后跑不变量校验并自动修复"；协议文本与 v0 相同，
 *      差异只在管线——round 1 干净地测量修复管线的独立贡献）
 * v2 = 分层 2D 推理协议 + 修复管线（论文"二维是推理画布"；round 2 候选）
 * v3 = 自检清单细化协议 + 修复管线（round 3 候选，基于前两轮数据定制）
 */
import type { VersionConfig } from './types.js'

export const VERSIONS: Record<string, VersionConfig> = {
  v0: { id: 'v0', protocolFile: 'benchmark/protocols/v0-baseline.txt', pipeline: 'identity' },
  v1: { id: 'v1', protocolFile: 'benchmark/protocols/v0-baseline.txt', pipeline: 'repair' },
  v2: { id: 'v2', protocolFile: 'benchmark/protocols/v2-layer-2d.txt', pipeline: 'repair' },
  v3: { id: 'v3', protocolFile: 'benchmark/protocols/v3-selfcheck.txt', pipeline: 'repair' },
  v4: { id: 'v4', protocolFile: 'benchmark/protocols/v4-hub-rope.txt', pipeline: 'repair' },
  v5: { id: 'v5', protocolFile: 'benchmark/protocols/v5-force-analysis.txt', pipeline: 'repair' }
}

export function requireVersion(id: string): VersionConfig {
  const v = VERSIONS[id]
  if (!v) throw new Error(`未知版本 "${id}"（可用：${Object.keys(VERSIONS).join(', ')}）`)
  return v
}
