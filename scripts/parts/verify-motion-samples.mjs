import fs from 'node:fs';
import crypto from 'node:crypto';
import {verifyMesh} from '../../dist/src/mesh/verify.js';
const dir=process.argv[2]||'delivery/motion-regression-v2';
const a=JSON.parse(fs.readFileSync(dir+'/bundle.json'));
const samples=JSON.parse(fs.readFileSync(dir+'/samples.json'));
if(samples.bundleSha256!==crypto.createHash('sha256').update(JSON.stringify(a)).digest('hex'))throw new Error('Stale full bundle samples');
if(samples.sourceSha256!==a.rig.sourceSha256||samples.rigVersion!==a.rig.schemaVersion)throw new Error('Stale motion samples');
const results=samples.samples.map(s=>{const gate=verifyMesh({...a.mesh,vertices:s.vertices});const moved=s.vertices.filter((p,i)=>p.some((x,k)=>Math.abs(x-a.mesh.vertices[i][k])>1e-7)).length;return {clip:s.clip,time:s.time,moved,ok:gate.ok,failures:gate.failures};});
const invariantFailures=[];
for(const s of samples.samples){
 const clip=a.clips.find(c=>c.id===s.clip);
 if(!clip)throw new Error('Unknown sampled clip');
 const affected=new Set(clip.tracks.map(t=>t.joint));for(const j of a.rig.joints)if(affected.has(j.parent))affected.add(j.id);
 s.vertices.forEach((p,i)=>{if(!affected.has(a.rig.joints[a.rig.vertexJoint[i]].id)&&p.some((x,k)=>Math.abs(x-a.mesh.vertices[i][k])>1e-7))invariantFailures.push({clip:s.clip,time:s.time,vertex:i,reason:'unrelated vertex moved'});});
 a.rig.joints.forEach((j,i)=>{if(!j.parent)return;const k=a.rig.joints.findIndex(x=>x.id===j.parent);const distance=(u,v)=>Math.hypot(...u.map((x,d)=>x-v[d]));if(Math.abs(distance(s.joints[i],s.joints[k])-distance(j.pivot,a.rig.joints[k].pivot))>1e-7)invariantFailures.push({clip:s.clip,time:s.time,reason:'bone length changed'});});
}
const coverage=a.rig.joints.filter(j=>j.parent).map(j=>({joint:j.id,axes:[...new Set(a.clips.flatMap(c=>c.tracks.filter(t=>t.joint===j.id).map(t=>t.axis)))],clips:a.clips.filter(c=>c.tracks.some(t=>t.joint===j.id)).map(c=>c.id)}));
const report={coverage,visualAcceptance:false,invariantFailures,resetExact:samples.resetExact,samples:results.length,passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok),deletionAllowed:results.every(r=>r.ok)&&samples.resetExact&&invariantFailures.length===0};
fs.writeFileSync(dir+'/verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({samples:report.samples,passed:report.passed,failed:report.failed.length,invariantFailures:invariantFailures.length,uncovered:coverage.filter(c=>!c.clips.length),deletionAllowed:report.deletionAllowed}));
