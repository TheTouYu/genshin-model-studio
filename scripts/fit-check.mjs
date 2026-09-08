#!/usr/bin/env node
/**
 * fit-check：把手工参考关键点（reference/ganyu-landmarks.json 风格）换算成世界坐标，
 * 与网格几何做数值对照。只做数值对照，不做图像分割，也不判定是否通过。
 *
 * 用法：node scripts/fit-check.mjs <mesh.json> [landmarks.json] [--chin 1.4] [--knee 0.515] ...
 * 纵向关键点映射：--<landmarkName> <worldY>（如 --chin 1.4 --knee 0.515）
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const meshPath = args[0] && !args[0].startsWith('--') ? args[0] : null;
const lmPath = args[1] && !args[1].startsWith('--') ? args[1] : 'reference/ganyu-landmarks.json';
if (!meshPath) {
  console.error('usage: node scripts/fit-check.mjs <mesh.json> [landmarks.json] [--<name> <worldY> ...]');
  process.exit(2);
}
const mesh = JSON.parse(fs.readFileSync(meshPath, 'utf8'));
const lm = JSON.parse(fs.readFileSync(lmPath, 'utf8'));
const overrides = {};
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) overrides[args[i].slice(2)] = Number(args[i + 1]);

const pxPerMeter = (lm.scale.bottomPixel - lm.scale.topPixel) / lm.scale.heightMeters;
const yOf = (px) => lm.scale.heightMeters - (px - lm.scale.topPixel) / pxPerMeter;
const band = (y, w = 0.012) => mesh.vertices.filter((p) => Math.abs(p[1] - y) <= w);
const widthAt = (y) => {
  const b = band(y);
  return b.length ? Math.max(...b.map((p) => p[0])) - Math.min(...b.map((p) => p[0])) : null;
};

const out = { mesh: meshPath, landmarks: lmPath, pxPerMeter, provisional: lm.scale.status === 'provisional', comparisons: [] };
for (const view of ['front', 'side']) {
  for (const l of lm[view]?.landmarks ?? []) {
    const worldY = yOf(l.pixel[1]);
    const uncertaintyM = (l.uncertaintyPx ?? 0) / pxPerMeter;
    const override = overrides[l.name];
    const entry = { view, name: l.name, referencePixelY: l.pixel[1], referenceWorldY: worldY, uncertaintyM };
    if (override !== undefined) {
      entry.meshWorldY = override;
      entry.deltaM = worldY - override;
    } else {
      const w = widthAt(worldY);
      if (w !== null) entry.meshWidthAtReferenceHeight = w;
    }
    out.comparisons.push(entry);
  }
}
console.log(JSON.stringify(out, null, 2));
