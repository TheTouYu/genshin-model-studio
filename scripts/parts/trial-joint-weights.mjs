import fs from 'node:fs';
import * as THREE from 'three';
import '../../web/draw/motion-runtime.js';
import {verifyMesh} from '../../dist/src/mesh/verify.js';
const base=JSON.parse(fs.readFileSync('delivery/motion-regression-v2/bundle.json'));const {regions}=JSON.parse(fs.readFileSync('delivery/body-blockout-r1/controls.json'));const {clips}=JSON.parse(fs.readFileSync('web/draw/mocap-assets/clips.json'));
const trials=[];
for(const weight of [0,.25,.5,.75]){const a=structuredClone(base);a.rig.vertexWeights=a.rig.vertexJoint.map(j=>[[j,1]]);const set=(region,child,parent)=>{const c=a.rig.joints.findIndex(j=>j.id===child),p=a.rig.joints.findIndex(j=>j.id===parent);for(const v of regions[region])a.rig.vertexWeights[v]=[[c,1-weight],[p,weight]];};for(const s of ['L','R']){set('elbow'+s,'elbow'+s,'shoulder'+s);set('wrist'+s,'wrist'+s,'elbow'+s);set('knee'+s,'knee'+s,'hip'+s);set('ankle'+s,'ankle'+s,'knee'+s);}const rig=globalThis.createMotionRig(THREE,a);const rows=[];for(const c of clips.slice(0,3)){let pairs=0,failed=0,n=0;for(let f=0;f<c.frameCount;f+=12){const gate=verifyMesh(rig.poseMocap(c,f/120,true));n++;if(!gate.ok)failed++;pairs+=gate.checks.selfIntersections.intersectingPairs;}rows.push({id:c.id,n,failed,pairs});}trials.push({weight,rows});if(weight===.5)fs.writeFileSync('delivery/binding-trials/blended-candidate.json',JSON.stringify(a,null,2));}
fs.writeFileSync('delivery/binding-trials/joint-weight-results.json',JSON.stringify(trials,null,2));console.log(JSON.stringify(trials));
