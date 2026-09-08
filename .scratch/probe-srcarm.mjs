import { parseASF, parseAMC, computeBindPose, computeFrames, computeScale } from '../scripts/parts/lib/cmu-motion.mjs';
import fs from 'node:fs';
const sk = parseASF(fs.readFileSync('delivery/mocap-source/cmu-02/02.asf','utf8'));
const bind = computeBindPose(sk);
const amc = parseAMC(fs.readFileSync('delivery/mocap-source/cmu-02/02_01.amc','utf8'), sk);
const frames = computeFrames(sk, amc);
const RIG = JSON.parse(fs.readFileSync('delivery/motion-regression-v2/rig.json','utf8'));
const scale = computeScale(sk, RIG, bind);
// target torso half-width at chest/waist from candidate mesh
const mesh = JSON.parse(fs.readFileSync('delivery/body-blockout-anim-r1a/mesh.json','utf8'));
const ctl = JSON.parse(fs.readFileSync('delivery/body-blockout-anim-r1a/controls.json','utf8'));
const halfW = r => Math.max(...ctl.regions[r].map(i => Math.abs(mesh.vertices[i][0])));
const halfD = r => Math.max(...ctl.regions[r].map(i => Math.abs(mesh.vertices[i][2])));
console.log('torso halfW waist/chest', halfW('waist').toFixed(3), halfW('chest').toFixed(3), 'halfD', halfD('waist').toFixed(3), halfD('chest').toFixed(3));
// source elbow (lradius head = elbow joint) x/y/z relative to source root at bind, mirrored, scaled
for (const f of [0, 40, 80, 120, 160, 200]) {
  const elbow = frames[f].pose.head.get('lradius');
  const shoulder = frames[f].pose.head.get('lhumerus');
  const spine = frames[f].pose.head.get('thorax');
  const rel = p => [-(p.x - spine.x) * scale, (p.y - spine.y) * scale, (p.z - spine.z) * scale];
  const e = rel(elbow), s = rel(shoulder);
  console.log('f'+f, 'shoulder(relThorax)', s.map(v=>v.toFixed(3)).join(','), 'elbow(relThorax)', e.map(v=>v.toFixed(3)).join(','));
}
