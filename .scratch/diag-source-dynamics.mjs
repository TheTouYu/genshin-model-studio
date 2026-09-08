/** diag-source-dynamics.mjs — source root trajectory + foot contact dynamics for all clips. */
import fs from 'node:fs';
import path from 'node:path';
import { parseASF, parseAMC, computeBindPose, computeFrames } from '../scripts/parts/lib/cmu-motion.mjs';
import { Vector3 } from 'three';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'delivery/mocap-source/cmu-02');
const sk = parseASF(fs.readFileSync(path.join(SRC, '02.asf'), 'utf8'));
const bind = computeBindPose(sk);
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));

for (const rec of manifest.clips) {
  const amc = parseAMC(fs.readFileSync(path.join(SRC, rec.file), 'utf8'), sk);
  const frames = computeFrames(sk, amc);
  // source lowest foot point per frame: min over lfoot/ltoes/rfoot/rtoes TAIL (toe tips) and lfoot/rfoot HEAD(ankle) — ankle is above; also estimate heel = ankle - 0.15*forward? just use toe tails + ankles
  const minY = [], rootY = [], rootX = [], rootZ = [];
  for (const f of frames) {
    const p = f.pose;
    let m = 1e9;
    for (const b of ['lfoot', 'ltoes', 'rfoot', 'rtoes']) {
      const t = p.tail.get(b); if (t) m = Math.min(m, t.y);
      const h = p.head.get(b); if (h) m = Math.min(m, h.y);
    }
    minY.push(m);
    const r = p.head.get('root'); rootY.push(r.y); rootX.push(r.x); rootZ.push(r.z);
  }
  const gmin = Math.min(...minY), gmax = Math.max(...minY);
  const rmin = Math.min(...rootY), rmax = Math.max(...rootY);
  const xz = Math.hypot(rootX[rootX.length - 1] - rootX[0], rootZ[rootZ.length - 1] - rootZ[0]);
  // fraction of frames near ground (support-like)
  const nearG = minY.filter(y => y < gmin + 1.0).length; // within 1 ASF unit (~4.6cm)
  console.log(rec.id.padEnd(6), rec.label.slice(0, 24).padEnd(24),
    'frames', String(frames.length).padStart(5),
    'footMin', gmin.toFixed(2), 'footMax', gmax.toFixed(2),
    'rootY[', rmin.toFixed(2), ',', rmax.toFixed(2), '] drift', (rootY[rootY.length - 1] - rootY[0]).toFixed(2),
    'rootXZ travel', xz.toFixed(1),
    'nearGround%', (100 * nearG / frames.length).toFixed(0));
}
