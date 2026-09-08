#!/usr/bin/env node
/**
 * check-hanfu-record.mjs — gate for iteration-records/36-hanfu-cage-rebuild.json (§5 schema).
 * Verifies every required field of the task brief's record schema plus the
 * evidence blocks (views / adoption lists / deviations) and that
 * visualAcceptance stays "pending" (the user has not accepted).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'iteration-records/36-hanfu-cage-rebuild.json');

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); };

let r;
try {
  r = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (err) {
  console.log(`[FAIL] read ${FILE}: ${err.message}`);
  process.exit(1);
}

check('iteration=36', r.iteration === 36, `got ${r.iteration}`);
check('stage', typeof r.stage === 'string' && r.stage.length > 3, `got ${r.stage}`);
check('inputs', r.inputs && typeof r.inputs === 'object',
  Object.keys(r.inputs ?? {}).join(', '));
const lm = r.landmarks ?? {};
check('landmarks.count', lm.count && lm.count.front >= 20 && lm.count.side >= 20
  && lm.count.back >= 20,
  `front=${lm.count?.front} side=${lm.count?.side} back=${lm.count?.back}`);
check('landmarks.lowConfidence', Number.isInteger(lm.lowConfidence) && lm.lowConfidence > 0,
  `got ${lm.lowConfidence}`);
const pose = r.pose ?? {};
const POSE_KEYS = ['headYawDeg', 'spineArcDirection', 'spineArcAmplitudePx',
  'swordArmShoulderDeg', 'swordArmElbowDeg', 'weightLeg', 'skirtFlow', 'hairFlow'];
check('pose fields', POSE_KEYS.every((k) => pose[k] !== undefined && pose[k] !== null),
  `missing: ${POSE_KEYS.filter((k) => pose[k] === undefined || pose[k] === null).join(',') || 'none'}`);
const cg = r.controlGraph ?? {};
check('controlGraph.points', Number.isInteger(cg.points) && cg.points >= 20, `got ${cg.points}`);
check('controlGraph.faces<=300', Number.isInteger(cg.faces) && cg.faces <= 300, `got ${cg.faces}`);
const seam = r.seam ?? {};
check('seam fields', seam.openEdges === 0 && seam.seamEdges === 0 && seam.components === 1,
  `openEdges=${seam.openEdges} seamEdges=${seam.seamEdges} components=${seam.components}`);
check('anatomyReport', r.anatomyReport && typeof r.anatomyReport.pass === 'boolean',
  `pass=${r.anatomyReport?.pass}`);
check('verify block', r.verify && typeof r.verify === 'object',
  `keys=${Object.keys(r.verify ?? {}).join(',')}`);
check('gate.ok + checks[]', r.gate && Array.isArray(r.gate.checks) && r.gate.checks.length > 0
  && r.gate.checks.every((c) => typeof c.ok === 'boolean'),
  `ok=${r.gate?.ok} checks=${r.gate?.checks?.length}`);
check('visualAcceptance=pending', r.visualAcceptance === 'pending', `got ${r.visualAcceptance}`);
check('views evidence (5 views + verdict)', Array.isArray(r.views) && r.views.length >= 5
  && r.views.every((v) => typeof v.readImageVerdict === 'string' && v.readImageVerdict.length > 5),
  `${r.views?.length} views`);
check('adoption lists (two sheets)', r.adoptionList && r.adoptionList.wireframeSheet
  && r.adoptionList.whiteModelSheet
  && r.adoptionList.wireframeSheet.adopted?.length > 0
  && r.adoptionList.whiteModelSheet.adopted?.length > 0,
  `sections=${Object.keys(r.adoptionList ?? {}).join(',')}`);
check('deviations recorded', Array.isArray(r.deviations) && r.deviations.length > 0,
  `${r.deviations?.length} entries`);
check('gates G1..G5', r.gates && ['G1', 'G2', 'G3', 'G4', 'G5']
  .every((g) => r.gates[g] && typeof r.gates[g].ok === 'boolean'),
  Object.entries(r.gates ?? {}).map(([k, v]) => `${k}=${v.ok}`).join(' '));

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`[${c.ok ? 'PASS' : 'FAIL'}] ${c.name}: ${c.detail}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks pass -> ${FILE}`);
process.exit(failed === 0 ? 0 : 1);
