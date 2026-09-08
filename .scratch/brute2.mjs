import fs from 'node:fs'; import vm from 'node:vm';
const context={Math,console}; context.window=context; vm.createContext(context);
// load sources with branches to get vtag
const bctx={Math,console}; bctx.window=bctx; vm.createContext(bctx);
for (const file of ['lib/ganyu-lib.js','lib/ganyu-cage-branch.js','lib/ganyu-seam-check.js','ganyu-body-cage.js']) vm.runInContext(fs.readFileSync('scripts/parts/'+file,'utf8'), bctx, {filename:file});
const body=bctx.__BODY_CAGE__; const mesh=body.mesh; const v=mesh.vertices; const f=mesh.faces;
// vtag
const vtag=new Array(v.length).fill(null);
const ri=mesh.ringIdx; const sides=16; const trunkRings=ri.length;
for(let r=0;r<trunkRings;r++)for(let j=0;j<sides;j++)vtag[ri[r]+j]='trunkR'+r;
for(let i=0;i<v.length;i++){if(vtag[i]===null&&v[i][1]<0.9)vtag[i]='trunkCap?';if(vtag[i]===null&&v[i][1]>1.5)vtag[i]='trunkCap?';}
for(const key of Object.keys(body.branches)){const br=body.branches[key]; br.rings.forEach((ring,k)=>ring.forEach(id=>{vtag[id]=key+'R'+k;}));}
// brute force, report first folding pairs with centroids + first-vertex tags
const EPS=1e-12;
function sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function segHit(p0,p1,v0,v1,v2){const e1=sub(v1,v0),e2=sub(v2,v0),d=sub(p1,p0),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<EPS)return false;const inv=1/det,s=sub(p0,v0),u=inv*dot(s,h);if(u<=0||u>=1)return false;const q=cross(s,e1),vv=inv*dot(d,q);if(vv<=0||u+vv>=1)return false;const t=inv*dot(e2,q);return t>0&&t<1;}
function triHit(ia,ib){const A=[v[ia[0]],v[ia[1]],v[ia[2]]],B=[v[ib[0]],v[ib[1]],v[ib[2]]];for(let i=0;i<3;i++){const j=(i+1)%3;if(segHit(A[i],A[j],B[0],B[1],B[2]))return true;if(segHit(B[i],B[j],A[0],A[1],A[2]))return true;}return false;}
function share(ia,ib){return ia.some(x=>ib.includes(x));}
function cen(k){const a=v[f[k*3]],b=v[f[k*3+1]],c=v[f[k*3+2]];return [(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];}
const n=f.length/3; let count=0;
for(let i=0;i<n;i++){const ia=[f[i*3],f[i*3+1],f[i*3+2]];for(let j=i+1;j<n;j++){const ib=[f[j*3],f[j*3+1],f[j*3+2]];if(share(ia,ib))continue;if(triHit(ia,ib)){count++;const c1=cen(i),c2=cen(j);console.log('['+i+']'+vtag[f[i*3]]+' cen='+c1.map(x=>+x.toFixed(3)).join(',')+'  ['+j+']'+vtag[f[j*3]]+' cen='+c2.map(x=>+x.toFixed(3)).join(','));}}}
console.log('total=',count);
