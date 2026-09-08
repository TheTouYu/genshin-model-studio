import fs from 'node:fs';
import crypto from 'node:crypto';
const dir='delivery/mocap-source/cmu-02';
const labels=['walk','walk','run/jog','jump, balance','punch/strike','bend over, scoop up, rise, lift arm','swordplay','swordplay','swordplay','wash self'];
const skeleton=fs.readFileSync(dir+'/02.asf','utf8');
const bones=new Map();
for(const block of skeleton.split(/\bbegin\b/).slice(1)){const name=block.match(/\bname\s+(\S+)/)?.[1];if(name){const dof=block.match(/\bdof([^\n]+)/)?.[1].trim().split(/\s+/)||[];bones.set(name,dof.length);}}
bones.set('root',6);
const clips=labels.map((label,i)=>{const id='02_'+String(i+1).padStart(2,'0'),file=id+'.amc';const bytes=fs.readFileSync(dir+'/'+file);let frames=0,seen=new Set();
const check=()=>{if(frames)for(const [name,count]of bones)if(count&&!seen.has(name))throw new Error(file+' missing '+name);};
for(const raw of bytes.toString().split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#')||line.startsWith(':'))continue;if(/^\d+$/.test(line)){check();if(Number(line)!==++frames)throw new Error(file+' frame sequence');seen=new Set();continue;}const [name,...values]=line.split(/\s+/);if(!frames||seen.has(name)||!bones.has(name)||values.length!==bones.get(name)||values.some(v=>!Number.isFinite(Number(v))))throw new Error(file+' invalid channel '+name);seen.add(name);}
check();if(!frames)throw new Error(file+' empty');return {id,file,label,fps:120,frames,durationSeconds:(frames-1)/120,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),source:'http://mocap.cs.cmu.edu/subjects/02/'+file,sourceValidated:true,retargetStatus:'pending',numericAcceptance:'pending',humanAnimationAcceptance:'pending'};});
const report={source:'CMU Graphics Lab Motion Capture Database',catalog:'http://mocap.cs.cmu.edu/search.php?subjectnumber=2',skeleton:{file:'02.asf',sha256:crypto.createHash('sha256').update(skeleton).digest('hex')},clips,acceptancePolicy:{numeric:['binding validity','geometry defects','rest reset'],human:['natural coordination','joint deformation','foot contact','combined transitions'],completion:'Both routes required; source validity is not retarget acceptance'}};
fs.writeFileSync(dir+'/manifest.json',JSON.stringify(report,null,2));console.log(JSON.stringify(clips.map(({id,label,frames,bytes})=>({id,label,frames,bytes})),null,2));
