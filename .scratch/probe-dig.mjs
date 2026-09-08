import { evaluateRigVertices } from '../scripts/parts/lib/cmu-motion.mjs';
import fs from 'node:fs';
const rig = JSON.parse(fs.readFileSync('web/draw/mocap-assets/rig.json','utf8'));
const mesh = JSON.parse(fs.readFileSync('web/draw/mocap-assets/mesh.json','utf8'));
const controls = JSON.parse(fs.readFileSync('delivery/body-blockout-anim-r1a/controls.json','utf8'));
const groundY = 0.075;
const sk = await import('../scripts/parts/lib/cmu-motion.mjs').then(m=>m.parseASF(fs.readFileSync('delivery/mocap-source/cmu-02/02.asf','utf8')));
const lib = await import('../scripts/parts/lib/cmu-motion.mjs');
for (const id of ['02_01','02_03','02_04','02_06','02_07']) {
  const clip = JSON.parse(fs.readFileSync('delivery/mocap-retarget/target-'+id+'.json','utf8'));
  const amc = lib.parseAMC(fs.readFileSync('delivery/mocap-source/cmu-02/'+id+'.amc','utf8'), sk);
  const frames = lib.computeFrames(sk, amc);
  const srcMin = frames.map(f=>Math.min(f.pose.head.get('lfoot').y,f.pose.head.get('ltoes').y,f.pose.head.get('rfoot').y,f.pose.head.get('rtoes').y));
  const clipMin = Math.min(...srcMin);
  let digs = [], sup = 0;
  for (let f=0; f<clip.frameCount; f++) {
    const v = evaluateRigVertices(rig, mesh, clip, f).vertices;
    const m = Math.min(...controls.regions.footL.map(i=>v[i][1]), ...controls.regions.footR.map(i=>v[i][1]));
    if (groundY - m > 0.012) digs.push({f, d: +(groundY-m).toFixed(3), swing: srcMin[f] > clipMin+1.0});
    if (srcMin[f] <= clipMin+1.0) sup++;
  }
  const swingDigs = digs.filter(d=>d.swing).length;
  console.log(id, 'frames='+clip.frameCount, 'deepDigs(>12mm)='+digs.length, 'ofWhichSwingPhase='+swingDigs, 'maxDig='+Math.max(0,...digs.map(d=>d.d)).toFixed(3));
}