#!/usr/bin/env node
/**
 * Gate for reference/ganyu-hanfu-landmarks.json (task assertion #1).
 * Schema v1 + >=20 landmarks per view + pose fields + front-clothing rule.
 * Exit 0 = pass, 1 = fail. Paths resolve from this file (runner cwd is /home/h).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'reference/ganyu-hanfu-landmarks.json');
const IMAGE_SIZE = [2184, 1230];
const POSE_FIELDS = [
  'head_yaw_over_shoulder', 'spine_arc_direction', 'spine_arc_amplitude',
  'sword_arm_shoulder_angle', 'sword_arm_elbow_angle', 'weight_leg',
  'skirt_flow_direction', 'hair_flow_direction',
];
const FRONT_CLOTHING = new Set([
  'chest_gem', 'corset_top_center', 'corset_bottom_center', 'waist_center',
  'waist_belt_center', 'sash_gem', 'hem_bottom_center', 'hem_left', 'hem_right',
  'wrist_left', 'wrist_right', 'hand_left', 'hand_right',
  'shoulder_left', 'shoulder_right',
]);

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok, detail });
  return ok;
};

let data;
try {
  data = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (err) {
  console.log(`[FAIL] read ${FILE}: ${err.message}`);
  process.exit(1);
}

check('schemaVersion=1', data.schemaVersion === 1, `got ${data.schemaVersion}`);
check('imageSize', JSON.stringify(data.imageSize) === JSON.stringify(IMAGE_SIZE),
  `got ${JSON.stringify(data.imageSize)} want ${JSON.stringify(IMAGE_SIZE)}`);
check('method/status present', typeof data.method === 'string' && data.method.length > 20
  && typeof data.status === 'string', `status=${data.status}`);
check('coordinateConvention', typeof data.coordinateConvention === 'string'
  && data.coordinateConvention.length > 10, `${String(data.coordinateConvention).slice(0, 60)}...`);
const sc = data.scale ?? {};
check('scale fields', typeof sc.heightMeters === 'number' && sc.heightMeters > 1
  && Number.isInteger(sc.topPixel) && Number.isInteger(sc.bottomPixel)
  && sc.bottomPixel > sc.topPixel && sc.excludes === 'horns and ahoge',
  `heightMeters=${sc.heightMeters} top=${sc.topPixel} bottom=${sc.bottomPixel} excludes="${sc.excludes}"`);

for (const view of ['front', 'side', 'back']) {
  const v = data[view] ?? {};
  const lms = Array.isArray(v.landmarks) ? v.landmarks : [];
  check(`${view}.centerX`, typeof v.centerX === 'number', `got ${v.centerX}`);
  check(`${view}.count>=20`, lms.length >= 20, `got ${lms.length}`);
  const names = new Set();
  let bad = null;
  for (const lm of lms) {
    if (typeof lm.name !== 'string' || !Array.isArray(lm.pixel) || lm.pixel.length !== 2
      || !lm.pixel.every((n) => Number.isFinite(n))
      || !Number.isFinite(lm.uncertaintyPx) || lm.uncertaintyPx <= 0) {
      bad = lm; break;
    }
    const [x, y] = lm.pixel;
    if (x < 0 || x >= IMAGE_SIZE[0] || y < 0 || y >= IMAGE_SIZE[1]) { bad = lm; break; }
    if (names.has(lm.name)) { bad = lm; break; }
    names.add(lm.name);
  }
  check(`${view}.landmarks well-formed`, bad === null,
    bad ? `bad entry ${JSON.stringify(bad).slice(0, 120)}` : `${lms.length} entries in-bounds, unique`);
  if (view === 'front') {
    const clothing = lms.filter((lm) => FRONT_CLOTHING.has(lm.name));
    const okRule = clothing.length > 0 && clothing.every((lm) => lm.confidence === 'low'
      && lm.uncertaintyPx === 2 * lm.baseUncertaintyPx);
    check('front clothing rule', okRule,
      `${clothing.length} clothing points, each confidence=low and uncertaintyPx=2x base`);
  }
}

const pose = data.pose ?? {};
for (const f of POSE_FIELDS) {
  check(`pose.${f}`, pose[f] !== undefined, pose[f] === undefined ? 'missing' : 'present');
}
const hys = pose.head_yaw_over_shoulder ?? {};
check('pose.head_yaw has px+angle evidence',
  Array.isArray(hys.eye_line_px) && Number.isFinite(hys.eye_line_deg)
  && Number.isFinite(hys.value_deg),
  `value=${hys.value_deg} eyeLine=${hys.eye_line_deg}`);

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`[${c.ok ? 'PASS' : 'FAIL'}] ${c.name}: ${c.detail}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks pass -> ${FILE}`);
process.exit(failed === 0 ? 0 : 1);
