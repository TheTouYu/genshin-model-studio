/**
 * 基准任务注册表：五类任务（对应论文五类任务，映射到本项目域）。
 * 任务文件（prompt.txt / spec.md / validator.ts）冻结并记录 hash，优化期间不得修改。
 */
import type { TaskMeta } from './types.js'
import { validate as validateT1 } from '../../benchmark/tasks/T1/validator.js'
import { validate as validateT2 } from '../../benchmark/tasks/T2/validator.js'
import { validate as validateT3 } from '../../benchmark/tasks/T3/validator.js'
import { validate as validateT4 } from '../../benchmark/tasks/T4/validator.js'
import { validate as validateT5 } from '../../benchmark/tasks/T5/validator.js'
import { validate as validateT6 } from '../../benchmark/tasks/T6/validator.js'

export const TASKS: Record<string, TaskMeta> = {
  T1: {
    id: 'T1',
    paperRef: '精确规格小屋',
    promptFile: 'benchmark/tasks/T1/prompt.txt',
    specFile: 'benchmark/tasks/T1/spec.md',
    repeats: 1,
    validate: validateT1
  },
  T2: {
    id: 'T2',
    paperRef: '坐标旋转变换',
    promptFile: 'benchmark/tasks/T2/prompt.txt',
    specFile: 'benchmark/tasks/T2/spec.md',
    repeats: 1,
    validate: validateT2
  },
  T3: {
    id: 'T3',
    paperRef: '螺旋楼梯塔（规则推导）',
    promptFile: 'benchmark/tasks/T3/prompt.txt',
    specFile: 'benchmark/tasks/T3/spec.md',
    repeats: 1,
    validate: validateT3
  },
  T4: {
    id: 'T4',
    paperRef: '自由生成小屋',
    promptFile: 'benchmark/tasks/T4/prompt.txt',
    specFile: 'benchmark/tasks/T4/spec.md',
    repeats: 2, // 论文教训：小样本方向性，每条件重复取均值
    validate: validateT4
  },
  T5: {
    id: 'T5',
    paperRef: '重力物理',
    promptFile: 'benchmark/tasks/T5/prompt.txt',
    specFile: 'benchmark/tasks/T5/spec.md',
    repeats: 1,
    validate: validateT5
  },
  T6: {
    id: 'T6',
    paperRef: '自由生成（复杂结构，自创：摩天轮）',
    promptFile: 'benchmark/tasks/T6/prompt.txt',
    specFile: 'benchmark/tasks/T6/spec.md',
    repeats: 1,
    validate: validateT6,
    repairMode: 'light' // 环/吊舱结构性悬空合法 → 不做支撑修复
  }
}

export const TASK_ORDER: readonly string[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']
