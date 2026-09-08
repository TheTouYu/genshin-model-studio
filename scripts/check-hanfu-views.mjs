#!/usr/bin/env node
/**
 * check-hanfu-views.mjs — gate for the five-view evidence chain (task assertion #8).
 *
 * Reads delivery/hanfu-cage/views/views-report.json (silhouette stats measured on
 * the real WebGL canvas at capture time) and verifies:
 *   - the five required views exist with non-trivial PNG files
 *   - each silhouette is non-empty (coverage >= 0.01)
 *   - each silhouette is fully inside the frame (>= 4px margin, not clipped)
 * Exit 0 = pass, 1 = fail.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWS_DIR = resolve(ROOT, 'delivery/hanfu-cage/views');
const REPORT = resolve(VIEWS_DIR, 'views-report.json');
const REQUIRED = ['wire-front', 'wire-side', 'wire-back', 'wire-three-quarter',
  'wire-reference-view'];
const MARGIN_PX = 4;
const MIN_COVERAGE = 0.01;

let report;
try {
  report = JSON.parse(readFileSync(REPORT, 'utf8'));
} catch (err) {
  console.log(`[FAIL] cannot read ${REPORT}: ${err.message}`);
  process.exit(1);
}

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); return ok; };

check('report schemaVersion', report.schemaVersion === 1, `got ${report.schemaVersion}`);
check('five required views', REQUIRED.every((v) => report.views?.[v]),
  `present: ${Object.keys(report.views ?? {}).join(', ')}`);

for (const name of REQUIRED) {
  const v = report.views?.[name];
  if (!v) { check(`${name} present`, false, 'missing from report'); continue; }
  const file = resolve(VIEWS_DIR, `${name}.png`);
  let bytes = 0;
  try { bytes = statSync(file).size; } catch { bytes = 0; }
  check(`${name} png`, bytes > 1000, `${bytes} bytes`);
  check(`${name} silhouette coverage`, v.coverage >= MIN_COVERAGE,
    `coverage=${v.coverage} (min ${MIN_COVERAGE})`);
  const b = v.bbox;
  const inside = Array.isArray(b) && b[0] >= MARGIN_PX && b[1] >= MARGIN_PX
    && b[2] <= v.width - MARGIN_PX && b[3] <= v.height - MARGIN_PX;
  check(`${name} not clipped`, inside,
    `bbox=${JSON.stringify(b)} frame=${v.width}x${v.height} margin>=${MARGIN_PX}px`);
  if (b) {
    const w = b[2] - b[0] + 1;
    const h = b[3] - b[1] + 1;
    console.log(`  ${name}: bbox ${w}x${h}px ratio=${(w / h).toFixed(2)} ` +
      `coverage=${v.coverage} camera=${JSON.stringify(v.camera)}`);
  }
}

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`[${c.ok ? 'PASS' : 'FAIL'}] ${c.name}: ${c.detail}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks pass -> ${REPORT}`);
process.exit(failed === 0 ? 0 : 1);
