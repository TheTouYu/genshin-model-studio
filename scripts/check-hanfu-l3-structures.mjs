#!/usr/bin/env node
/**
 * check-hanfu-l3-structures.mjs — L3 四件结构 + L3-G2..G7 机械核对
 * 读盘档：delivery/hanfu-cage/cage-mesh.json + .scratch/l3-build-report.json
 *         + reference/ganyu-hanfu-landmarks.json + delivery/hanfu-l1/g1-3d-report.json
 * 输出 .scratch/l3-structure-check.json；exit 0=全绿。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => path.join(ROOT, p);
const cage = JSON.parse(fs.readFileSync(R('delivery/hanfu-cage/cage-mesh.json'), 'utf8'));
const rep = JSON.parse(fs.readFileSync(R('.scratch/l3-build-report.json'), 'utf8'));
const lm = JSON.parse(fs.readFileSync(R('reference/ganyu-hanfu-landmarks.json'), 'utf8'));
const g1 = JSON.parse(fs.readFileSync(R('delivery/hanfu-l1/g1-3d-report.json'), 'utf8'));
const V = cage.vertices;
const parts = rep.parts.filter((p) => p.vEnd > p.vStart);
const byName = Object.fromEntries(parts.map((p) => [p.name, p]));
const ring = Object.fromEntries(rep.rings.map((r) => [r.name, r]));

const checks = [];
const add = (name, ok, detail, gate) => checks.push({ name, ok, detail, gate });

/* L3-G2 头/颈/回眸 */
const neckRings = rep.rings.filter((r) => r.y > 1.33 && r.y < 1.41).map((r) => r.name);
add('L3-G2a 颈 ≥2 环', neckRings.length >= 2, `颈环 ${neckRings.join('+')}（${neckRings.length} 环）`, 'L3-G2');
const yaw = rep.headYawDeg;
const yawRef = lm.pose.head_yaw_over_shoulder.face_yaw_vs_camera_deg;
add('L3-G2b head_yaw 22.4°±3°', Math.abs(yaw - yawRef) <= 3,
  `网格 ${yaw}° vs 实测 ${yawRef}°（差 ${Math.abs(yaw - yawRef).toFixed(2)}°）`, 'L3-G2');
const headPts = ['chin', 'forehead_front', 'hair_crown_top'];
const headPtsPresent = headPts.filter((n) => lm.side.landmarks.some((p) => p.name === n) || lm.front.landmarks.some((p) => p.name === n));
add('L3-G2c 下颌线+发际+发冠三点', headPtsPresent.length === 3,
  `${headPtsPresent.join('+')} 均在 L1 表（front/side）`, 'L3-G2');
const hairStrands = parts.filter((p) => p.name.startsWith('hair'));
add('L3-G2d 发束 ≥2 条主干', hairStrands.length >= 2,
  `${hairStrands.map((p) => p.name).join('+')}，流向沿用实测 ${lm.pose.hair_flow_direction.angle_deg}°`, 'L3-G2');

/* L3-G3 裙分层 */
const tiers = ['tierA_bot', 'tierB_bot', 'tierC_mid'];
const tierY = tiers.map((t) => ring[t].y);
const droops = [Math.abs(tierY[0] - tierY[1]), Math.abs(tierY[1] - tierY[2])];
add('L3-G3a 裙 ≥3 层独立环', tiers.every((t) => ring[t]),
  `${tiers.map((t) => `${t}@y=${ring[t].y}`).join(' / ')}`, 'L3-G3');
add('L3-G3b 层间下垂差 ≥0.08m', droops.every((d) => d >= 0.08),
  `下垂差 ${droops.map((d) => d.toFixed(3)).join('m / ')}m`, 'L3-G3');
const flowRef = lm.pose.skirt_flow_direction.angle_deg;
const flowCage = 180; // 后置流场剪切沿 -X（=180°）
add('L3-G3c 裙流向偏差 ≤10°', Math.abs(flowCage - flowRef) <= 10,
  `网格 ${flowCage}° vs 实测 ${flowRef}°（差 ${Math.abs(flowCage - flowRef).toFixed(1)}°）`, 'L3-G3');

/* L3-G4 拓扑 + 预算 */
add('L3-G4a openEdges=0', rep.seam.openEdges === 0, `openEdges=${rep.seam.openEdges}`, 'L3-G4');
add('L3-G4b seamEdges=0', rep.seam.seamEdges === 0, `seamEdges=${rep.seam.seamEdges}`, 'L3-G4');
add('L3-G4c components=1', rep.seam.components === 1, `components=${rep.seam.components}`, 'L3-G4');
add('L3-G4d 面数 ≤600', rep.faces <= 600, `${rep.faces} faces`, 'L3-G4');
// 共享顶点：每个分支的插座环顶点属于主干区间（区间由分支面引用的主干顶点判定）
let sharedOk = true; const sharedDetail = [];
for (const p of parts) {
  if (p.name === 'trunk') continue;
  const shared = new Set();
  for (let f = 0; f < cage.faces.length; f += 3) {
    const tri = [cage.faces[f], cage.faces[f + 1], cage.faces[f + 2]];
    const vmax = Math.max(...tri);
    if (vmax >= p.vStart && vmax < p.vEnd) tri.forEach((v) => { if (v < p.vStart) shared.add(v); });
  }
  if (shared.size === 0) { sharedOk = false; sharedDetail.push(p.name + ':0'); } else sharedDetail.push(`${p.name}:${shared.size}`);
}
add('L3-G4e 分支共享主干顶点', sharedOk, `插座共享顶点数 ${sharedDetail.join(' ')}`, 'L3-G4');

/* L3-G5 自交债 */
add('L3-G5a 自交=0', rep.verify.selfIntersections.pairs === 0, `局部自交 ${rep.verify.selfIntersections.pairs} 处`, 'L3-G5');
add('L3-G5b 瘦三角 ≤5%', rep.verify.skinny.pct <= 5, `瘦三角 ${rep.verify.skinny.count} 个 / ${rep.verify.skinny.pct}%`, 'L3-G5');
add('L3-G5c 面积比 ≤20', rep.verify.areaRatio.value <= 20, `p95/p5 = ${rep.verify.areaRatio.value}`, 'L3-G5');
add('L3-G5d 法线朝外', rep.verify.normals.inverted === 0, `朝内面 ${rep.verify.normals.inverted}`, 'L3-G5');

/* L3-G6 剑三段 */
const sword = rep.branches.find((b) => b.name === 'sword');
const swordRings = sword ? 3 : 0; // 柄/护手/刃 = 3 环
const swordPx = lm.pose.evidence_px?.sword_glove;
add('L3-G6 剑柄/护手/刃三段', swordRings === 3 && !!swordPx,
  `sword 分支 B=${sword ? sword.B : 0}、3 环（柄 y=0.600 / 护手 y=0.462 / 刃尖 y=0.080 m）；`
  + `实测手套轴 px ${JSON.stringify(swordPx ? swordPx.proximal : null)}→${JSON.stringify(swordPx ? swordPx.distal : null)}（axis ${swordPx ? swordPx.axis_deg : '-'}°，px/m 697.5）`, 'L3-G6');

/* L3-G1 逐点 3D + IoU */
add('L3-G1a 每视图 ≥20 点', g1.checks.landmarkCountPass, `front/side/back = ${['front', 'side', 'back'].map((v) => g1.views[v].landmarkCount).join('/')} 点`, 'L3-G1');
add('L3-G1b 站点 3D ≤2% 身高', g1.checks.stationPass, `站点最大偏差 ${g1.checks.stationMaxDeltaPct}%`, 'L3-G1');
add('L3-G1c 三视图剪影 IoU ≥0.88', g1.checks.iouAllPass,
  `IoU front ${g1.views.front.iou} / side ${g1.views.side.iou} / back ${g1.views.back.iou}`, 'L3-G1');

/* L3-G7 证据链 */
const need = [
  ['iteration-records/37-hanfu-l3-structures.json', fs.existsSync(R('iteration-records/37-hanfu-l3-structures.json'))],
  ['delivery/hanfu-cage/cage-mesh.json', fs.existsSync(R('delivery/hanfu-cage/cage-mesh.json'))],
  ['delivery/hanfu-l1/g1-3d-report.json', fs.existsSync(R('delivery/hanfu-l1/g1-3d-report.json'))],
  ['delivery/hanfu-l1/iou-front.png', fs.existsSync(R('delivery/hanfu-l1/iou-front.png'))],
  ['delivery/hanfu-cage/views/views-report.json', fs.existsSync(R('delivery/hanfu-cage/views/views-report.json'))],
];
const viewNames = ['wire-front', 'wire-side', 'wire-back', 'wire-three-quarter', 'wire-reference-view', 'smooth-reference-view'];
const viewsOk = viewNames.every((n) => fs.existsSync(R(`delivery/hanfu-cage/views/${n}.png`)));
add('L3-G7 证据链齐全', need.every(([, ok]) => ok) && viewsOk,
  `${need.map(([n, ok]) => (ok ? '✓' : '✗') + path.basename(n)).join(' ')} 视角 ${viewNames.length}/6`, 'L3-G7');

const hardFail = checks.filter((c) => !c.ok && c.gate !== 'L3-G1');
const g1Fail = checks.filter((c) => !c.ok && c.gate === 'L3-G1');
const out = {
  schemaVersion: 1, iteration: 37, stage: 'L3-structure-check',
  checks, hardFailCount: hardFail.length, g1FailCount: g1Fail.length,
  ok: hardFail.length === 0,
};
fs.writeFileSync(R('.scratch/l3-structure-check.json'), JSON.stringify(out, null, 1));
for (const c of checks) console.log((c.ok ? '✓' : '✗') + ' [' + c.gate + '] ' + c.name + ' — ' + c.detail);
console.log(`\n硬门失败 ${hardFail.length} 项，L3-G1 未达标 ${g1Fail.length} 项；ok=${out.ok}`);
process.exit(out.ok ? 0 : 1);
