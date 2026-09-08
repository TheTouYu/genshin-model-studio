#!/usr/bin/env node
/* 交卷记录 38：§5/§6.4 全字段 + 六视角结论 + IoU 叠图 + 偏差清单≥4 + visualAcceptance:pending。 */
import fs from 'node:fs';
import { report, ROOT } from './lib/l4-common.mjs';
const rec = JSON.parse(fs.readFileSync(`${ROOT}/iteration-records/38-hanfu-l4-sheets.json`, 'utf8'));
const need = ['iteration', 'stage', 'inputs', 'landmarks', 'pose', 'controlGraph', 'seam', 'anatomyReport', 'verify', 'gates', 'views', 'iouOverlay', 'deviations', 'visualAcceptance'];
const missing = need.filter((k) => rec[k] === undefined);
const viewsOk = Array.isArray(rec.views) && rec.views.length >= 6 && rec.views.every((v) => v.readImageVerdict && v.readImageVerdict.length > 8);
const overlays = rec.iouOverlay.every((p) => fs.existsSync(`${ROOT}/${p}`));
const checks = [
  { name: '§5 全字段齐备', ok: missing.length === 0, detail: missing.length ? `缺 ${missing.join(',')}` : `${need.length} 个字段齐备` },
  { name: 'iteration=38 / stage=L4', ok: rec.iteration === 38 && /L4/.test(rec.stage), detail: `${rec.iteration} / ${rec.stage}` },
  { name: '六视角（含 smooth）逐张结论', ok: viewsOk, detail: `${rec.views.length} 张，全部带 readImageVerdict` },
  { name: 'IoU 叠图落盘', ok: overlays, detail: rec.iouOverlay.join(' ') },
  { name: '偏差清单≥4', ok: rec.deviations.length >= 4, detail: `${rec.deviations.length} 条` },
  { name: 'gates L4-G1..G8 逐门', ok: rec.gates.length === 8, detail: `${rec.gates.filter((g) => g.ok).length}/${rec.gates.length} 通过` },
  { name: 'visualAcceptance=pending', ok: rec.visualAcceptance === 'pending', detail: rec.visualAcceptance },
];
report('记录 38', checks);
