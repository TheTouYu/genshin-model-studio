import fs from 'node:fs';
import crypto from 'node:crypto';
const mesh=JSON.parse(fs.readFileSync('delivery/body-blockout-r1/mesh.json','utf8'));
const {regions}=JSON.parse(fs.readFileSync('delivery/body-blockout-r1/controls.json','utf8'));
const center=ids=>ids.reduce((p,i)=>p.map((v,k)=>v+mesh.vertices[i][k]/ids.length),[0,0,0]);
const joints=[{id:'root',parent:null,pivot:[0,.8,0]}];
const bind=Array(mesh.vertices.length).fill(0);
const add=(id,parent,pivot,ids=[])=>{const index=joints.length;joints.push({id,parent,pivot});ids.forEach(i=>bind[i]=index);return index;};
add('spine','root',[0,1,0],[...regions.waist,...regions.chest,...regions.shoulder,...regions.neck]);
add('neck','spine',center(regions.neck),[...regions.jaw,...regions.head,...regions.crown,112]);
for(const side of ['L','R']){
 const s=side==='L'?-1:1;
 const shoulder=add('shoulder'+side,'spine',[s*.18,1.25,0],regions['upperArm'+side]);
 const elbow=add('elbow'+side,'shoulder'+side,center(regions['elbow'+side]),regions['elbow'+side].concat(regions['wrist'+side]));
 add('wrist'+side,'elbow'+side,center(regions['wrist'+side]),regions['palm'+side]);
 add('hip'+side,'root',[s*.075,.8,0],regions['thigh'+side]);
 add('knee'+side,'hip'+side,center(regions['knee'+side]),regions['knee'+side].concat(regions['ankle'+side]));
 add('ankle'+side,'knee'+side,center(regions['ankle'+side]),regions['foot'+side]);
}
const clips=joints.slice(1).map(j=>({id:j.id+'-sweep',duration:4,loop:true,tracks:[{joint:j.id,axis:j.id.startsWith('shoulder')?'z':'x',unit:'radians',interpolation:'linear',keys:[[0,0],[1,j.id.startsWith('shoulder')?(j.id.endsWith('L')?-.3:.3):-.3],[2,0],[3,.15],[4,0]]}]}));
const track=(joint,axis,amplitude,phase=1)=>({joint,axis,unit:'radians',interpolation:'linear',keys:[[0,0],[1,amplitude*phase],[2,0],[3,-amplitude*phase],[4,0]]});
const common=(id,tracks)=>clips.push({id,duration:4,loop:true,category:'common-motion',tracks});
common('head-look', [track('neck','y',.4)]);
common('head-nod', [track('neck','x',.25)]);
common('bow', [track('spine','x',.3),track('neck','x',.12)]);
common('torso-turn', [track('spine','y',.25),track('neck','y',.15)]);
common('side-bend', [track('spine','z',.2),track('neck','z',.1)]);
common('arm-raise', [track('shoulderL','z',.4,-1),track('shoulderR','z',.4)]);
common('elbow-curl', [track('elbowL','x',.5,-1),track('elbowR','x',.5,-1),track('wristL','x',.2),track('wristR','x',.2)]);
common('squat-study', [track('hipL','x',.3,-1),track('hipR','x',.3,-1),track('kneeL','x',.5),track('kneeR','x',.5),track('ankleL','x',.2,-1),track('ankleR','x',.2,-1),track('spine','x',.1)]);
common('walk-in-place-study', [track('hipL','x',.25),track('hipR','x',.25,-1),track('kneeL','x',.2,-1),track('kneeR','x',.2),track('ankleL','x',.12),track('ankleR','x',.12,-1),track('shoulderL','x',.2,-1),track('shoulderR','x',.2),track('elbowL','x',.1),track('elbowR','x',.1,-1),track('spine','y',.08),track('neck','y',.04,-1)]);
const rig={schemaVersion:2,units:'meters',coordinateSystem:'+Y up +Z front',binding:'rigid per-region, inspection prototype',joints,vertexJoint:bind,sourceSha256:crypto.createHash('sha256').update(JSON.stringify(mesh)).digest('hex')};
const assets={schemaVersion:1,mesh,rig,clips,invariants:{vertices:113,triangles:222,restExact:true,topologyFixed:true,boneLengthFixed:true,staticToleranceMeters:0,pivotToleranceMeters:1e-9},limitations:['No blend weights yet','Not anatomical range-of-motion certification','Not game skeleton export']};
for(const out of ['delivery/motion-regression-v2','web/draw/motion-assets']){fs.mkdirSync(out,{recursive:true});for(const [name,data]of Object.entries({mesh,rig,clips,bundle:assets}))fs.writeFileSync(out+'/'+name+'.json',JSON.stringify(data,null,2));}
console.log(JSON.stringify({joints:joints.length,clips:clips.length,vertices:mesh.vertices.length,sourceSha256:rig.sourceSha256}));
