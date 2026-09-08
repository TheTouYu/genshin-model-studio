#!/usr/bin/env node
/* L4-G1/G2：阶段剪影 IoU（front/back≥0.85、side≥0.78）+ 站点 3D 误差≤2% 身高。 */
import { loadG1, report } from './lib/l4-common.mjs';
const g = loadG1();
const v = g.views; const c = g.checks;
const minPts = Math.min(v.front.landmarkCount, v.side.landmarkCount, v.back.landmarkCount);
const checks = [
  { name: 'L4-G1a IoU front≥0.85', ok: v.front.iou >= 0.85, detail: `${v.front.iou}` },
  { name: 'L4-G1b IoU back≥0.85', ok: v.back.iou >= 0.85, detail: `${v.back.iou}` },
  { name: 'L4-G1c IoU side≥0.78', ok: v.side.iou >= 0.78, detail: `${v.side.iou}` },
  { name: 'L4-G2 站点 3D≤2%', ok: (c.stationMaxDeltaPct ?? 99) <= 2, detail: `${c.stationMaxDeltaPct}%` },
  { name: '逐点计数 ≥20/视图', ok: minPts >= 20, detail: `min=${minPts}` },
];
report('L4-G1/G2 剪影与逐点', checks);
