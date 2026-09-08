#!/usr/bin/env node
/* 合同断言 cmd cwd 无关：每条 measure.cmd 为绝对路径且目标存在。 */
import fs from 'node:fs';
import { report, ROOT } from './lib/l4-common.mjs';
const file = '/home/h/.dsh/graded-state/session-2ae811d4-9e22-4e6e-aa26-d354e8b9004b.closedloop.json';
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const as = (j.cost && j.cost.assertions) || [];
const cmds = as.map((s) => (s.measure && s.measure.cmd) || '').filter(Boolean);
const abs = cmds.every((c) => /\/home\/h\/genshin-model-studio\//.test(c));
const targets = cmds.map((c) => (c.match(/(\/home\/h\/genshin-model-studio\/[^\s'"]+)/) || [])[1]).filter(Boolean);
const missing = targets.filter((t) => !fs.existsSync(t));
const checks = [
  { name: '每条 cmd 含绝对路径', ok: abs, detail: `${cmds.length} 条断言` },
  { name: '目标文件存在', ok: missing.length === 0, detail: missing.length ? `缺 ${missing.join(',')}` : `${targets.length} 个目标齐备` },
  { name: '不含相对路径 cmd', ok: cmds.every((c) => !/^node scripts\//.test(c) && !/^\.venv/.test(c)), detail: '全部绝对路径' },
];
report('合同断言 cwd 无关', checks);
