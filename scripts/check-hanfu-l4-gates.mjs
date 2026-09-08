#!/usr/bin/env node
/* L4-G5/G6：verifyMesh 自交=0 / 瘦三角≤5% / 面积比≤20 / 面数≤1200 / 薄片存在。 */
import { loadMesh, loadReport, verify, report } from './lib/l4-common.mjs';
const mesh = loadMesh(); const rep = loadReport();
const v = verify(mesh, { maxSamples: 200000 });
const checks = [
  { name: 'L4-G5a 自交=0', ok: v.checks.selfIntersections.intersectingPairs === 0,
    detail: `pairs=${v.checks.selfIntersections.intersectingPairs}（阈值 0）` },
  { name: 'L4-G5b 瘦三角≤5%', ok: v.checks.skinny.pct <= 5,
    detail: `${v.checks.skinny.pct}%（${v.checks.skinny.count} 个）` },
  { name: 'L4-G5c 面积比≤20', ok: v.checks.areaRatio.value <= 20,
    detail: `p95/p5=${v.checks.areaRatio.value}` },
  { name: 'L4-G6 面数≤1200', ok: rep.faces <= 1200, detail: `faces=${rep.faces}` },
  { name: '薄片存在（袖/纱/发/刃）', ok: rep.sheets.sleeve >= 2 && rep.sheets.veil >= 3 && rep.sheets.hair >= 4 && rep.sheets.blade >= 1,
    detail: `sleeve=${rep.sheets.sleeve} veil=${rep.sheets.veil} hair=${rep.sheets.hair} blade=${rep.sheets.blade}` },
];
report('L4-G5/G6 门禁', checks);
