import { parseASF, parseAMC, computeBindPose, computeFrames, computeScale, evaluateRigVertices } from '../scripts/parts/lib/cmu-motion.mjs';
import fs from 'node:fs';
import { Quaternion, Vector3 } from 'three';
const sk = parseASF(fs.readFileSync('delivery/mocap-source/cmu-02/02.asf','utf8'));
const amc = parseAMC(fs.readFileSync('delivery/mocap-source/cmu-02/02_01.amc','utf8'), sk);
const frames = computeFrames(sk, amc);
const rig = JSON.parse(fs.readFileSync('web/draw/mocap-assets/rig.json','utf8'));
const mesh = JSON.parse(fs.readFileSync('web/draw/mocap-assets/mesh.json','utf8'));
const controls = JSON.parse(fs.readFileSync('delivery/body-blockout-anim-r1a/controls.json','utf8'));
const t = JSON.parse(fs.readFileSync('delivery/mocap-retarget/target-02_01.json','utf8'));
let eL=0,eR=0; const sole=new Vector3(0,-1,0);
const nrm=(v,ids)=>{const n=new Vector3();for(let k=0;k<4;k++){const a=v[ids[k]],b=v[ids[(k+1)%4]];n.x+=(a[1]-b[1])*(a[2]+b[2]);n.y+=(a[2]-b[2])*(a[0]+b[0]);n.z+=(a[0]-b[0])*(a[1]+b[1]);}return n.normalize();};
for(let f=0;f<frames.length;f+=10){
  const v=evaluateRigVertices(rig,mesh,t,f).vertices;
  const sl=nrm(v,controls.regions.footL); if(sl.y>0)sl.negate();
  const sr=nrm(v,controls.regions.footR); if(sr.y>0)sr.negate();
  const qL=frames[f].pose.quat.get('lfoot'), qR=frames[f].pose.quat.get('rfoot');
  const sL=sole.clone().applyQuaternion(new Quaternion(qL.x,qL.y,qL.z,qL.w));
  const sR=sole.clone().applyQuaternion(new Quaternion(qR.x,qR.y,qR.z,qR.w));
  eL=Math.max(eL,sl.angleTo(new Vector3(-sL.x,sL.y,sL.z))*180/Math.PI);
  eR=Math.max(eR,sr.angleTo(new Vector3(-sR.x,sR.y,sR.z))*180/Math.PI);
}
console.log('sole err L(deg)=',eL.toFixed(3),'R=',eR.toFixed(3));
const sLh=[],sRh=[],tL=[],tR=[];
for(let f=0;f<frames.length;f++){
  sLh.push(Math.min(frames[f].pose.head.get('lfoot').y,frames[f].pose.head.get('ltoes').y));
  sRh.push(Math.min(frames[f].pose.head.get('rfoot').y,frames[f].pose.head.get('rtoes').y));
  const v=evaluateRigVertices(rig,mesh,t,f).vertices;
  tL.push(Math.min(...controls.regions.footL.map(i=>v[i][1])));
  tR.push(Math.min(...controls.regions.footR.map(i=>v[i][1])));
}
console.log('src minL frame',sLh.indexOf(Math.min(...sLh)),'minR frame',sRh.indexOf(Math.min(...sRh)));
console.log('target minL frame',tL.indexOf(Math.min(...tL)),'minR frame',tR.indexOf(Math.min(...tR)));
console.log('tLmin−tRmin =',(Math.min(...tL)-Math.min(...tR)).toFixed(4));
// per-foot own-minimum source comparison scaled
const scale=computeScale(sk,{joints:rig.joints},computeBindPose(sk));
console.log('src minL−minR scaled =',((Math.min(...sLh)-Math.min(...sRh))*scale).toFixed(4));
