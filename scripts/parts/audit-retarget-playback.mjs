import fs from 'node:fs';
import * as THREE from 'three';
import '../../web/draw/motion-runtime.js';
import {verifyMesh} from '../../dist/src/mesh/verify.js';
const a=JSON.parse(fs.readFileSync('delivery/motion-regression-v2/bundle.json'));
const {clips}=JSON.parse(fs.readFileSync('web/draw/mocap-assets/clips.json'));
const rig=globalThis.createMotionRig(THREE,a);
const report=[];const step=Number(process.argv[2]||12);
for(const clip of clips){const failures=[];let count=0,maxPairs=0;for(let f=0;f<clip.frameCount;f+=step){const p=rig.poseMocap(clip,f/clip.fps,true);const gate=verifyMesh(p);count++;if(!gate.ok){maxPairs=Math.max(maxPairs,gate.checks.selfIntersections.intersectingPairs);failures.push({frame:f,failures:gate.failures});}}report.push({id:clip.id,sampled:count,failed:failures.length,maxPairs,failures});}
fs.writeFileSync('delivery/mocap-retarget/playback-audit.json',JSON.stringify({frameStep:step,humanAcceptanceReady:false,clips:report},null,2));console.log(report.map(({id,sampled,failed,maxPairs})=>({id,sampled,failed,maxPairs})));
