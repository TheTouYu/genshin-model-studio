import { evaluateRigVertices } from '../scripts/parts/lib/cmu-motion.mjs';
import { Vector3 } from 'three';
import fs from 'node:fs';
const RIG = JSON.parse(fs.readFileSync('delivery/motion-regression-v2/rig.json','utf8'));
const BINDING = JSON.parse(fs.readFileSync('web/draw/mocap-assets/bind-weights.json','utf8'));
const skinned = { ...RIG, vertexWeights: BINDING.vertexWeights };
const mesh = JSON.parse(fs.readFileSync('delivery/body-blockout-anim-r1a/mesh.json','utf8'));
const ctl = JSON.parse(fs.readFileSync('delivery/body-blockout-anim-r1a/controls.json','utf8'));
const vOf = i => { for (const [r, ids] of Object.entries(ctl.regions)) if (ids.includes(i)) return r; return 'v'+i; };
const F = mesh.faces, T = F.length/3;
const byV = new Map();
for (let t=0;t<T;t++) for (let k=0;k<3;k++) { const v=F[3*t+k]; if(!byV.has(v)) byV.set(v,[]); byV.get(v).push(t); }
const ADJ = new Set();
for (const [,ts] of byV) for (let a=0;a<ts.length;a++) for (let b=a+1;b<ts.length;b++) ADJ.add(Math.min(ts[a],ts[b])*1000+Math.max(ts[a],ts[b]));
function segTri(p,q,tri){const n=new Vector3().subVectors(tri[1],tri[0]).cross(new Vector3().subVectors(tri[2],tri[0]));const d0=new Vector3().subVectors(p,tri[0]).dot(n);const d1=new Vector3().subVectors(q,tri[0]).dot(n);if((d0>0&&d1>0)||(d0<0&&d1<0))return false;const dir=new Vector3().subVectors(q,p);const dv=new Vector3().subVectors(tri[0],p);const da=dir.dot(n);let t;if(Math.abs(da)>1e-12){t=dv.dot(n)/da;if(t<-1e-9||t>1+1e-9)return false;}else{if(Math.abs(dv.dot(n))>1e-9)return false;t=0.5;}const ip=new Vector3().copy(p).addScaledVector(dir,t);const a=new Vector3().subVectors(tri[1],tri[0]);const b=new Vector3().subVectors(tri[2],tri[0]);const c=new Vector3().subVectors(ip,tri[0]);const d00=a.dot(a),d01=a.dot(b),d11=b.dot(b),d20=c.dot(a),d21=c.dot(b);const den=d00*d11-d01*d01;if(Math.abs(den)<1e-18)return false;const u=(d11*d20-d01*d21)/den;const v=(d00*d21-d01*d20)/den;return u>=-1e-9&&v>=-1e-9&&u+v<=1+1e-9;}
const hitF=(A,B)=>segTri(A[0],A[1],B)||segTri(A[1],A[2],B)||segTri(A[2],A[0],B)||segTri(B[0],B[1],A)||segTri(B[1],B[2],A)||segTri(B[2],B[0],A);
function findHits(verts, want) {
  const tris=[];for(let t=0;t<T;t++){const vs=[verts[F[3*t]],verts[F[3*t+1]],verts[F[3*t+2]]].map(p=>new Vector3(...p));tris.push(vs);}
  const out=[];
  for(let i=0;i<T;i++)for(let j=i+1;j<T;j++){
    if (ADJ.has(i*1000+j)) continue;
    const A=tris[i],B=tris[j];
    let ov=true;for(let k=0;k<3;k++){const a=[Infinity,-Infinity],b=[Infinity,-Infinity];for(const p of A){a[0]=Math.min(a[0],p.getComponent(k));a[1]=Math.max(a[1],p.getComponent(k));}for(const p of B){b[0]=Math.min(b[0],p.getComponent(k));b[1]=Math.max(b[1],p.getComponent(k));}if(a[0]>b[1]||b[0]>a[1]){ov=false;break;}}
    if(!ov) continue;
    if(hitF(A,B)){const key=[vOf(F[3*i]),vOf(F[3*j])].sort().join('|');if(key===want)out.push([i,j]);}
  }
  return out;
}
const clip = JSON.parse(fs.readFileSync('delivery/mocap-retarget/target-02_01.json','utf8'));
for (let f=0; f<clip.frameCount; f+=4) {
  const v = evaluateRigVertices(skinned, mesh, clip, f).vertices;
  const hs = findHits(v, 'upperArmL|waist');
  if (hs.length) {
    console.log('frame', f, 'upperArmL|waist hits', hs.length);
    const [i,j]=hs[0];
    for (const t of [i,j]) console.log(' tri',t,'verts',F.slice(3*t,3*t+3).map(x=>x+'('+v[x].map(y=>y.toFixed(3))+')'+':'+vOf(x)).join(' '));
    break;
  }
}
