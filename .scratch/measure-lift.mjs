import { parseASF, parseAMC, computeBindPose, computeFrames, computeScale, evaluateRigVertices } from '../scripts/parts/lib/cmu-motion.mjs';
import fs from 'node:fs';
const sk = parseASF(fs.readFileSync('delivery/mocap-source/cmu-02/02.asf','utf8'));
const rig = JSON.parse(fs.readFileSync('web/draw/mocap-assets/rig.json','utf8'));
const mesh = JSON.parse(fs.readFileSync('web/draw/mocap-assets/mesh.json','utf8'));
const bind = computeBindPose(sk); const scale = computeScale(sk, rig, bind);
const controls = JSON.parse(fs.readFileSync('delivery/body-blockout-anim-r1a/controls.json','utf8'));
for (const id of ['02_01','02_03']) {
  const amc = parseAMC(fs.readFileSync('delivery/mocap-source/cmu-02/'+id+'.amc','utf8'), sk);
  const frames = computeFrames(sk, amc);
  // source per-foot min head y among foot bones (lfoot/ltoes vs rfoot/rtoes)
  const sL=[],sR=[];
  for (const f of frames){
    let l=Infinity,r=Infinity;
    for (const b of ['lfoot','ltoes']) l=Math.min(l,f.pose.head.get(b).y);
    for (const b of ['rfoot','rtoes']) r=Math.min(r,f.pose.head.get(b).y);
    sL.push(l); sR.push(r);
  }
  const clip = JSON.parse(fs.readFileSync('web/draw/mocap-assets/clips.json','utf8')).clips.find(c=>c.id===id);
  const fL=[],fR=[];
  for (let f=0;f<clip.frameCount;f++){
    const v=evaluateRigVertices(rig,mesh,clip,f).vertices;
    fL.push(Math.min(...controls.regions.footL.map(i=>v[i][1])));
    fR.push(Math.min(...controls.regions.footR.map(i=>v[i][1])));
  }
  const rng=a=>Math.max(...a)-Math.min(...a);
  console.log(id,
    'source lift L(m)='+(rng(sL)*scale).toFixed(3), 'R(m)='+(rng(sR)*scale).toFixed(3),
    '| target lift L='+rng(fL).toFixed(3),'R='+rng(fR).toFixed(3),
    '| target minFootY='+Math.min(...fL,...fR).toFixed(4),'groundY=0.075');
}