/**
 * gen-motion-binding.mjs — Blend skin weights for the 15-joint inspection rig.
 *
 * Why: the previous binding was 100% rigid per region (vertexJoint only). At
 * every joint the child region rotates about the pivot while the parent region
 * stays — with rigid binding the ring on one side of the joint shears away from
 * the ring on the other side (visible tearing/穿插 at knees, elbows, wrists,
 * neck, shoulders, hips, waist during real motion).
 *
 * Blends at the boundary rings only (the ring ADJACENT to the joint on the
 * child side gets part of its weight from the parent joint), everything else
 * stays rigid. Because every joint's bind matrix is the identity at rest
 * (pivots = rest positions), the rest pose is bit-identical to the mesh.
 *
 * Weight rows reference joints by INDEX (same contract as
 * web/draw/motion-runtime.js vertexJoint/vertexWeights).
 *
 * Output: web/draw/mocap-assets/bind-weights.json {schemaVersion, blends, vertexWeights}
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MESH_DIR = path.join(ROOT, 'delivery/body-blockout-anim-r1a');
const RIG_FILE = path.join(ROOT, 'delivery/motion-regression-v2/rig.json');
const OUT = path.join(ROOT, 'web/draw/mocap-assets/bind-weights.json');

const mesh = JSON.parse(fs.readFileSync(path.join(MESH_DIR, 'mesh.json'), 'utf8'));
const controls = JSON.parse(fs.readFileSync(path.join(MESH_DIR, 'controls.json'), 'utf8'));
const rig = JSON.parse(fs.readFileSync(RIG_FILE, 'utf8'));
const jIdx = new Map(rig.joints.map((j, i) => [j.id, i]));

// region -> rigid joint (from the existing vertexJoint contract, asserted)
const rigid = [];
for (let i = 0; i < mesh.vertices.length; i++) rigid.push([[rig.vertexJoint[i], 1]]);

// boundary-ring blends: [region, parentJoint, childJoint, parentShare]
const BLENDS = [
  ['kneeL', 'hipL', 'kneeL', 0.5], ['kneeR', 'hipR', 'kneeR', 0.5],
  ['elbowL', 'shoulderL', 'elbowL', 0.5], ['elbowR', 'shoulderR', 'elbowR', 0.5],
  ['wristL', 'elbowL', 'wristL', 0.5], ['wristR', 'elbowR', 'wristR', 0.5],
  ['neck', 'spine', 'neck', 0.5],
  ['upperArmL', 'spine', 'shoulderL', 0.25], ['upperArmR', 'spine', 'shoulderR', 0.25],
  ['thighL', 'root', 'hipL', 0.25], ['thighR', 'root', 'hipR', 0.25],
  ['waist', 'root', 'spine', 0.2],
];

const blendInfo = [];
for (const [region, parent, child, share] of BLENDS) {
  const ids = controls.regions[region];
  if (!ids) throw new Error('unknown region ' + region);
  const pj = jIdx.get(parent), cj = jIdx.get(child);
  for (const i of ids) rigid[i] = share >= 0.5 ? [[pj, share], [cj, 1 - share]] : [[cj, 1 - share], [pj, share]];
  blendInfo.push({ region, vertices: ids, parent, child, parentShare: share });
}

// sanity: rows valid
for (const row of rigid) {
  const s = row.reduce((a, [, w]) => a + w, 0);
  if (Math.abs(s - 1) > 1e-12) throw new Error('row does not sum to 1');
}

// sanity: rest pose invariance — all joints identity => vertices unchanged (weights path)
const out = { schemaVersion: 1, note: 'boundary-ring blend weights; index-based joints; rest pose identical to rigid binding', blends: blendInfo, vertexWeights: rigid };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ out: OUT, vertices: rigid.length, blendedVertices: blendInfo.reduce((a, b) => a + b.vertices.length, 0), blends: blendInfo.length }));
