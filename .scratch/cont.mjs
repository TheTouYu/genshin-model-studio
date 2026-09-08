import fs from 'node:fs'; import vm from 'node:vm';
const c={Math,console}; c.window=c; vm.createContext(c);
for(const f of ['lib/ganyu-lib.js','lib/ganyu-cage-branch.js','lib/ganyu-seam-check.js','ganyu-body-cage.js']) vm.runInContext(fs.readFileSync('scripts/parts/'+f,'utf8'), c, {filename:f});
const v=c.__BODY_CAGE__.mesh.vertices; const f=c.__BODY_CAGE__.mesh.faces;
function norm(i){const a=v[f[i*3]],b=v[f[i*3+1]],d=v[f[i*3+2]];const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],w=[d[0]-a[0],d[1]-a[1],d[2]-a[2]];const nx=u[1]*w[2]-u[2]*w[1],ny=u[2]*w[0]-u[0]*w[2],nz=u[0]*w[1]-u[1]*w[0];const l=Math.hypot(nx,ny,nz)||1;return [nx/l,ny/l,nz/l];}
function cen(i){const a=v[f[i*3]],b=v[f[i*3+1]],d=v[f[i*3+2]];return [(a[0]+b[0]+d[0])/3,(a[1]+b[1]+d[1])/3,(a[2]+b[2]+d[2])/3];}
// adjacency via shared edges
const edgeFace=new Map();
for(let i=0;i<f.length/3;i++){const ia=[f[i*3],f[i*3+1],f[i*3+2]];for(let k=0;k<3;k++){const a=ia[k],b=ia[(k+1)%3],key=a<b?a+':'+b:b+':'+a;if(!edgeFace.has(key))edgeFace.set(key,[]);edgeFace.get(key).push(i);}}
// front-mid trunk faces (z>0.03 front, y 0.8-1.35), compute max dihedral with neighbors
const frontMid=[];
for(let i=0;i<f.length/3;i++){const cc=cen(i);if(cc[2]>0.03&&cc[1]>0.78&&cc[1]<1.35)frontMid.push(i);}
let maxCrease=0, creaseAt=null;
for(const i of frontMid){const ni=norm(i);const ia=[f[i*3],f[i*3+1],f[i*3+2]];
  for(let k=0;k<3;k++){const a=ia[k],b=ia[(k+1)%3],key=a<b?a+':'+b:b+':'+a;for(const j of (edgeFace.get(key)||[])){if(j<=i)continue;const nj=norm(j);const dot=Math.max(-1,Math.min(1,ni[0]*nj[0]+ni[1]*nj[1]+ni[2]*nj[2]));const ang=Math.acos(dot)*180/Math.PI;if(ang>maxCrease&&ang<179){maxCrease=ang;creaseAt=[i,j,cen(i),cen(j)];}}}
}
console.log('front-mid(+Z, y0.78-1.35) max dihedral crease='+maxCrease.toFixed(1)+' deg at faces '+creaseAt?.[0]+','+creaseAt?.[1]);
console.log('  centroids:', JSON.stringify(creaseAt?.[2]?.map(x=>+x.toFixed(2))), JSON.stringify(creaseAt?.[3]?.map(x=>+x.toFixed(2))));
// crotch front (z>0.02, y 0.75-0.92)
const crotch=[]; for(let i=0;i<f.length/3;i++){const cc=cen(i);if(cc[2]>0.02&&cc[1]>0.74&&cc[1]<0.93)crotch.push(i);}
let m2=0,at2=null;
for(const i of crotch){const ni=norm(i);const ia=[f[i*3],f[i*3+1],f[i*3+2]];for(let k=0;k<3;k++){const a=ia[k],b=ia[(k+1)%3],key=a<b?a+':'+b:b+':'+a;for(const j of (edgeFace.get(key)||[])){if(j<=i)continue;const njj=norm(j);const dot=Math.max(-1,Math.min(1,ni[0]*njj[0]+ni[1]*njj[1]+ni[2]*njj[2]));const ang=Math.acos(dot)*180/Math.PI;if(ang>m2&&ang<179){m2=ang;at2=[cen(i),cen(j)];}}}}
console.log('crotch-front(+Z, y0.74-0.93) max dihedral='+m2.toFixed(1)+' deg at '+JSON.stringify(at2?.map(x=>x.map(q=>+q.toFixed(2)))));
