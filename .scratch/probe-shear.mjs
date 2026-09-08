import { evaluateRigVertices } from '../scripts/parts/lib/cmu-motion.mjs';
import { Vector3 } from 'three';
import fs from 'node:fs';
const sk = await import('../scripts/parts/lib/cmu-motion.mjs');
const skel = sk.parseASF(fs.readFileSync('delivery/mocap-source/cmu-02/02.asf','utf8'));
const bind = sk.computeBindPose(skel);
const RIG = JSON.parse(fs.readFileSync('delivery/motion-regression-v2/rig.json','utf8'));
const BINDING = JSON.parse(fs.readFileSync('web/draw/mocap-assets/bind-weights.json','utf8'));
const skinned = { ...RIG, vertexWeights: BINDING.vertexWeights };
const r1Mesh = JSON.parse(fs.readFileSync('delivery/body-blockout-r1/mesh.json','utf8'));
const candMesh = JSON.parse(fs.readFileSync('delivery/body-blockout-anim-r1a/mesh.json','utf8'));
const candCtl = JSON.parse(fs.readFileSync('delivery/body-blockout-anim-r1a/controls.json','utf8'));
function segTri(p,q,tri){const n=new Vector3().subVectors(tri[1],tri[0]).cross(new Vector3().subVectors(tri[2],tri[0]));const d0=new Vector3().subVectors(p,tri[0]).dot(n);const d1=new Vector3().subVectors(q,tri[0]).dot(n);if((d0>0&&d1>0)||(d0<0&&d1<0))return false;const dir=new Vector3().subVectors(q,p);const dv=new Vector3().subVectors(tri[0],p);const da=dir.dot(n);let t;if(Math.abs(da)>1e-12){t=dv.dot(n)/da;if(t<-1e-9||t>1+1e-9)return false;}else{if(Math.abs(dv.dot(n))>1e-9)return false;t=0.5;}const ip=new Vector3().copy(p).addScaledVector(dir,t);const a=new Vector3().subVectors(tri[1],tri[0]);const b=new Vector3().subVectors(tri[2],tri[0]);const c=new Vector3().subVectors(ip,tri[0]);const d00=a.dot(a),d01=a.dot(b),d11=b.dot(b),d20=c.dot(a),d21=c.dot(b);const den=d00*d11-d01*d01;if(Math.abs(den)<1e-18)return false;const u=(d11*d20-d01*d21)/den;const v=(d00*d21-d01*d20)/den;return u>=-1e-9&&v>=-1e-9&&u+v<=1+1e-9;}
const hit=(A,B)=>segTri(A[0],A[1],B)||segTri(A[1],A[2],B)||segTri(A[2],A[0],B)||segTri(B[0],B[1],A)||segTri(B[1],B[2],A)||segTri(B[2],B[0],A);
// adjacency map on candidate mesh faces
const F=candMesh.faces,T=F.length/3;const byV=new Map();
for(let t=0;t<T;t++)for(let k=0;k<3;k++){const v=F[3*t+k];if(!byV.has(v))byV.set(v,[]);byV.get(v).push(t);}
const ADJ=new Set();for(const[,ts]of byV)for(let a=0;a<ts.length;a++)for(let b=a+1;b<ts.length;b++)ADJ.add(Math.min(ts[a],ts[b])*1000+Math.max(ts[a],ts[b]));
function scan(verts,mesh,countAdjacent){
  const Fm=mesh.faces,Tm=Fm.length/3;const tris=[];
  for(let t=0;t<Tm;t++){const vs=[verts[Fm[3*t]],verts[Fm[3*t+1]],verts[Fm[3*t+2]]].map(p=>new Vector3(...p));let mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];for(const p of vs){mn[0]=Math.min(mn[0],p.x);mx[0]=Math.max(mx[0],p.x);mn[1]=Math.min(mn[1],p.y);mx[1]=Math.max(mx[1],p.y);mn[2]=Math.min(mn[2],p.z);mx[2]=Math.max(mx[2],p.z);}tris.push({vs,mn,mx});}
  let nonAdj=0,adj=0;
  for(let i=0;i<Tm;i++){const A=tris[i];for(let j=i+1;j<Tm;j++){const B=tris[j];if(A.mn[0]>B.mx[0]||B.mn[0]>A.mx[0]||A.mn[1]>B.mx[1]||B.mn[1]>A.mx[1]||A.mn[2]>B.mx[2]||B.mn[2]>A.mx[2])continue;const isAdj=ADJ.has(i*1000+j);if(!countAdjacent&&isAdj)continue;if(hit(A.vs,B.vs)){isAdj?adj++:nonAdj++;}}}
  return {nonAdj,adj};
}
// post 02_06 every 20th frame: adjacent + non-adjacent
for (const id of ['02_05','02_06','02_10']) {
  const clip=JSON.parse(fs.readFileSync('delivery/mocap-retarget/target-'+id+'.json','utf8'));
  let nonAdj=0,adj=0,frames=0;
  for(let f=0;f<clip.frameCount;f+=20){const v=evaluateRigVertices(skinned,candMesh,clip,f).vertices;const r=scan(v,candMesh,true);nonAdj+=r.nonAdj;adj+=r.adj;frames++;}
  console.log(id,'POST sampled',frames,'frames: nonAdjHits='+nonAdj,'adjacentRingHits='+adj);
}
// PRE replica for 02_06: need old retarget; approximate by rigid binding on post clip + r1 mesh won't show old alignment; build pre clip via lib on the fly
const amc=sk.parseAMC(fs.readFileSync('delivery/mocap-source/cmu-02/02_06.amc','utf8'),skel);
const frames=sk.computeFrames(skel,amc);
const plan=JSON.parse(fs.readFileSync('delivery/mocap-source/cmu-02/retarget-plan.json','utf8'));
const scale=sk.computeScale(skel,RIG,bind);
const r1Ctl=JSON.parse(fs.readFileSync('delivery/body-blockout-r1/controls.json','utf8'));
const preDirs=new Map(sk.computeTargetRestDirections(r1Mesh,r1Ctl.regions,RIG));
{const c=(ids)=>{const s=[0,0,0];for(const i of ids)for(let k=0;k<3;k++)s[k]+=r1Mesh.vertices[i][k];return s.map(v=>v/ids.length);};for(const side of['L','R']){const j=RIG.joints.find(x=>x.id==='ankle'+side).pivot;const cc=c(r1Ctl.regions['foot'+side]);const d=[cc[0]-j[0],cc[1]-j[1],cc[2]-j[2]];const l=Math.hypot(...d);preDirs.set('ankle'+side,d.map(v=>v/l));}}
const pre=sk.retargetClip({sourceFrames:frames,sourceBind:bind,skeleton:skel,rig:RIG,mapping:plan.mapping,scale,sourceMeta:{id:'02_06',fps:120},opts:{rootMotion:'preserved',restDirections:preDirs}});
let nonAdj=0,adj=0,fr=0;
for(let f=0;f<pre.frameCount;f+=20){const v=evaluateRigVertices(RIG,r1Mesh,pre,f).vertices;const r=scan(v,r1Mesh,true);nonAdj+=r.nonAdj;adj+=r.adj;fr++;}
console.log('02_06 PRE sampled',fr,'frames: nonAdjHits='+nonAdj,'adjacentRingHits='+adj);
