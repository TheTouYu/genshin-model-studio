import fs from 'fs'; import vm from 'vm';
const lib = fs.readFileSync('scripts/parts/lib/ganyu-lib.js','utf8');
const seam = fs.readFileSync('scripts/parts/lib/ganyu-seam-check.js','utf8');
const ctx = { console, Math, THREE:{Vector3:class{constructor(x,y,z){this.x=x;this.y=y;this.z=z;}}} };
vm.createContext(ctx); vm.runInContext(lib,ctx); vm.runInContext(seam,ctx); ctx.window=ctx;
function norm(v){ const l=Math.hypot(v[0],v[1],v[2]); return l>1e-9?[v[0]/l,v[1]/l,v[2]/l]:[0,1,0]; }
function rot(v,axis,ang){ if(!ang) return v.slice(); const c=Math.cos(ang),s=Math.sin(ang); const d=axis[0]*v[0]+axis[1]*v[1]+axis[2]*v[2]; const q=[axis[1]*v[2]-axis[2]*v[1],axis[2]*v[0]-axis[0]*v[2],axis[0]*v[1]-axis[1]*v[0]]; return [v[0]*c+q[0]*s+axis[0]*d*(1-c), v[1]*c+q[1]*s+axis[1]*d*(1-c), v[2]*c+q[2]*s+axis[2]*d*(1-c)]; }
function extrudePatch(mesh, patchVerts, ringSpecs, opts){
  opts=opts||{}; const v=mesh.vertices, colors=mesh.colors||(mesh.colors=[]); const pset=new Set(patchVerts);
  const rm=new Set();
  for(let t=0;t<mesh.faces.length/3;t++){ const a=mesh.faces[t*3],b=mesh.faces[t*3+1],c=mesh.faces[t*3+2]; if(pset.has(a)&&pset.has(b)&&pset.has(c)) rm.add(t); }
  if(!rm.size) throw new Error('extrudePatch: no triangles');
  const dir=new Set(); rm.forEach(ti=>{ const a=mesh.faces[ti*3],b=mesh.faces[ti*3+1],c=mesh.faces[ti*3+2]; [[a,b],[b,c],[c,a]].forEach(([x,y])=>dir.add(x+'_'+y)); });
  const out=new Map(); dir.forEach(ke=>{ const [a,b]=ke.split('_').map(Number); if(!dir.has(b+'_'+a)) out.set(a,b); });
  const start=[...out.keys()][0]; const loop=[start]; let cur=start;
  for(let k=0;k<out.size;k++){ const nxt=out.get(cur); if(nxt==null) throw new Error('disconnect'); if(nxt===start) break; loop.push(nxt); cur=nxt; }
  if(loop.length!==out.size) throw new Error('not simple loop');
  const B=loop.length; const hc=[0,0,0]; for(let j=0;j<B;j++){ hc[0]+=v[loop[j]][0];hc[1]+=v[loop[j]][1];hc[2]+=v[loop[j]][2]; } hc[0]/=B;hc[1]/=B;hc[2]/=B;
  const axis=norm(opts.axis||[0,-1,0]);
  const nf=[]; for(let t=0;t<mesh.faces.length/3;t++){ if(!rm.has(t)) nf.push(mesh.faces[t*3],mesh.faces[t*3+1],mesh.faces[t*3+2]); }
  const ringIds=[loop.slice()];
  for(let k=0;k<ringSpecs.length;k++){ const rs=ringSpecs[k]; const ids=[]; for(let j=0;j<B;j++){ const p=v[loop[j]]; const radial=[p[0]-hc[0],p[1]-hc[1],p[2]-hc[2]]; const q=rot(radial,axis,rs.twist||0); const s=rs.s==null?1:rs.s; const c=rs.c||[0,0,0]; ids.push(v.length); v.push([c[0]+q[0]*s,c[1]+q[1]*s,c[2]+q[2]*s]); } ringIds.push(ids); }
  const color=opts.color||'#b8c4d8';
  for(let k=0;k<ringIds.length-1;k++){ const A=ringIds[k],N=ringIds[k+1]; for(let j=0;j<B;j++){ const n=(j+1)%B,a=A[j],b=A[n],c=N[n],d=N[j]; nf.push(a,b,c,a,c,d); colors.push(color,color); } }
  if(opts.cap!==false){ const last=ringIds[ringIds.length-1]; const cy=[0,0,0]; for(let j=0;j<B;j++){ cy[0]+=v[last[j]][0];cy[1]+=v[last[j]][1];cy[2]+=v[last[j]][2]; } cy[0]/=B;cy[1]/=B;cy[2]/=B; const ci=v.length; v.push(cy); for(let j=0;j<B;j++){ const n=(j+1)%B; nf.push(ci,last[j],last[n]); colors.push(color); } }
  mesh.faces=nf; return {loop:loop.slice(),B};
}
const SIDES=16;
const path=[[0,0.80,0],[0,0.92,0],[0,1.04,0],[0,1.16,0],[0,1.28,0],[0,1.36,0],[0,1.44,0],[0,1.52,0],[0,1.60,0]];
const sections=[{rx:0.14,ryF:0.10,cyF:0.01,ryB:0.10,cyB:-0.01},{rx:0.16,ryF:0.11,cyF:0.02,ryB:0.11,cyB:-0.02},{rx:0.12,ryF:0.09,cyF:0.01,ryB:0.09,cyB:-0.01},{rx:0.17,ryF:0.13,cyF:0.03,ryB:0.11,cyB:-0.02},{rx:0.20,ryF:0.11,cyF:0.02,ryB:0.11,cyB:-0.015},{rx:0.06,ryF:0.055,cyF:0.005,ryB:0.055,cyB:-0.006},{rx:0.095,ryF:0.10,cyF:0.01,ryB:0.11,cyB:-0.015},{rx:0.090,ryF:0.095,cyF:0.01,ryB:0.10,cyB:-0.015},{rx:0.05,ryF:0.06,cyF:0,ryB:0.06,cyB:-0.016}];
const m=ctx.profileLoft(path,sections,8,SIDES,()=>'#fff',{dataOnly:true,cap:'both',up:[0,0,1]});
const ri=m.ringIdx;
function blockVerts(rings,angles){ const out=[]; for(const r of rings) for(const a of angles){ out.push(ri[r]+a); } return out; }
const armL=blockVerts([2,3,4],[15,0,1]), armR=blockVerts([2,3,4],[7,8,9]);
const legL=blockVerts([0,1],[15,0,1]), legR=blockVerts([0,1],[7,8,9]);
function armSpecs(sign){ return [{c:[sign*0.20,1.06,0.03],s:0.72},{c:[sign*0.205,0.96,0.03],s:0.60},{c:[sign*0.205,0.82,0.035],s:0.54},{c:[sign*0.205,0.74,0.04],s:0.44},{c:[sign*0.205,0.67,0.06],s:0.62}]; }
function legSpecs(sign){ return [{c:[sign*0.10,0.62,0.02],s:0.90},{c:[sign*0.10,0.46,0.01],s:0.72},{c:[sign*0.10,0.30,0.01],s:0.62},{c:[sign*0.10,0.13,0.00],s:0.54},{c:[sign*0.10,0.05,0.05],s:0.70}]; }
extrudePatch(m,armL,armSpecs(+1),{color:'#f3c9a7',axis:[0,-1,0]});
extrudePatch(m,armR,armSpecs(-1),{color:'#f3c9a7',axis:[0,-1,0]});
extrudePatch(m,legL,legSpecs(+1),{color:'#9aa2ab',axis:[0,-1,0]});
extrudePatch(m,legR,legSpecs(-1),{color:'#9aa2ab',axis:[0,-1,0]});
console.log('seam', JSON.stringify(ctx.seamCheck(m)));
let obj='# body\n'; for(const p of m.vertices) obj+='v '+p[0]+' '+p[1]+' '+p[2]+'\n'; for(let i=0;i<m.faces.length;i+=3) obj+='f '+(m.faces[i]+1)+' '+(m.faces[i+1]+1)+' '+(m.faces[i+2]+1)+'\n';
fs.writeFileSync(new URL('./body.obj', import.meta.url), obj);
console.log('wrote obj verts',m.vertices.length,'tris',m.faces.length/3);
