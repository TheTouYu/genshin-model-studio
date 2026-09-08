import fs from 'node:fs';
import * as THREE from 'three';
import '../../web/draw/motion-runtime.js';
import {verifyMesh} from '../../dist/src/mesh/verify.js';
const original=JSON.parse(fs.readFileSync('delivery/motion-regression-v2/bundle.json'));
const {regions}=JSON.parse(fs.readFileSync('delivery/body-blockout-r1/controls.json'));
const trials=[];
for(const blend of [0,.25,.5,.75,1]){
 const a=structuredClone(original);a.rig.vertexWeights=a.rig.vertexJoint.map(j=>[[j,1]]);
 for(const side of ['L','R']){const shoulder=a.rig.joints.findIndex(j=>j.id==='shoulder'+side);const spine=a.rig.joints.findIndex(j=>j.id==='spine');for(const i of regions['upperArm'+side])a.rig.vertexWeights[i]=[[shoulder,1-blend],[spine,blend]];}
 const rig=globalThis.createMotionRig(THREE,a);let failed=0;const details=[];for(const clip of a.clips)for(let t=0;t<=4;t+=.125){const posed=rig.pose(clip,t);const gate=verifyMesh(posed);if(!gate.ok){failed++;details.push({clip:clip.id,t,failures:gate.failures});}}
 trials.push({blend,failed,details});
}
fs.mkdirSync('delivery/binding-trials',{recursive:true});fs.writeFileSync('delivery/binding-trials/shoulder-weights.json',JSON.stringify(trials,null,2));console.log(trials.map(({blend,failed})=>({blend,failed})));
