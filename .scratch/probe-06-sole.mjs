import { readFileSync } from 'node:fs';
import { parseASF, parseAMC, computeFrames, evaluateRigVertices } from '../scripts/parts/lib/cmu-motion.mjs';
import { Vector3, Quaternion } from 'three';

const asf = parseASF(readFileSync('delivery/mocap-source/cmu-02/02.asf', 'utf8'));
const amcFile = process.argv[2] || '02_06';
const clipId = process.argv[3] || '02_06';
const times = (process.argv[4] || '0.3,1.0,5.0,8.0,16.0').split(',').map(Number);
const amc = parseAMC(readFileSync('delivery/mocap-source/cmu-02/' + amcFile + '.amc', 'utf8'), asf);
const frames = computeFrames(asf, amc);
const rig = JSON.parse(readFileSync('web/draw/mocap-assets/rig.json', 'utf8'));
const mesh = JSON.parse(readFileSync('web/draw/mocap-assets/mesh.json', 'utf8'));
const clips = JSON.parse(readFileSync('web/draw/mocap-assets/clips.json', 'utf8'));
const clip = clips.clips.find(c => c.id === clipId);
const cands = JSON.parse(readFileSync('delivery/body-blockout-anim-r1a/controls.json', 'utf8'));

const soleRef = new Vector3(0, -1, 0);
function quadNormal(verts, ids) {
  const [a, b, c, d] = ids.map(i => new Vector3(...verts[i]));
  return new Vector3().subVectors(d, b).cross(new Vector3().subVectors(c, a)).normalize();
}
const sign = {};
for (const side of ['L', 'R']) {
  const rn = quadNormal(mesh.vertices, cands.regions['foot' + side]);
  sign[side] = rn.y < 0 ? 1 : -1;
}

console.log('t     frame | srcL tgtL | srcR tgtR  (deg sole tilt from flat; 0=flat)');
for (const t of times) {
  const f = Math.min(frames.length - 1, Math.round(t * clip.fps));
  const fr = frames[f];
  const row = [t.toFixed(1).padStart(5), String(f).padStart(5)];
  for (const side of ['L', 'R']) {
    const sb = side === 'L' ? 'lfoot' : 'rfoot';
    const q = fr.pose.quat.get(sb);
    const sSole = soleRef.clone().applyQuaternion(new Quaternion(q.x, q.y, q.z, q.w));
    const mSole = new Vector3(-sSole.x, sSole.y, sSole.z);
    const srcPitch = Math.atan2(Math.hypot(mSole.x, mSole.z), -mSole.y) * 180 / Math.PI;
    const ev = evaluateRigVertices(rig, mesh, clip, Math.min(clip.frameCount - 1, f));
    const nl = quadNormal(ev.vertices, cands.regions['foot' + side]).multiplyScalar(sign[side]);
    const tgtPitch = Math.atan2(Math.hypot(nl.x, nl.z), -nl.y) * 180 / Math.PI;
    row.push(srcPitch.toFixed(1).padStart(5) + ' ' + tgtPitch.toFixed(1).padStart(5));
  }
  console.log(row.join(' | '));
}
