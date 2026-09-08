import fs from 'fs'; import vm from 'vm';
const lib = fs.readFileSync('scripts/parts/lib/ganyu-lib.js','utf8');
const br  = fs.readFileSync('scripts/parts/lib/ganyu-cage-branch.js','utf8');
const seam= fs.readFileSync('scripts/parts/lib/ganyu-seam-check.js','utf8');
const ctx = { console, Math, THREE:{Vector3:class{constructor(x,y,z){this.x=x;this.y=y;this.z=z;}}} };
vm.createContext(ctx); vm.runInContext(lib,ctx); vm.runInContext(br,ctx); vm.runInContext(seam,ctx); ctx.window=ctx;
const SIDES=16;
const path=[[0,0.80,0],[0,0.92,0],[0,1.04,0],[0,1.16,0],[0,1.28,0],[0,1.36,0],[0,1.44,0],[0,1.52,0],[0,1.60,0]];
const sections=[{rx:0.14,ryF:0.10,cyF:0.01,ryB:0.10,cyB:-0.01},{rx:0.16,ryF:0.11,cyF:0.02,ryB:0.11,cyB:-0.02},{rx:0.12,ryF:0.09,cyF:0.01,ryB:0.09,cyB:-0.01},{rx:0.17,ryF:0.13,cyF:0.03,ryB:0.11,cyB:-0.02},{rx:0.20,ryF:0.11,cyF:0.02,ryB:0.11,cyB:-0.015},{rx:0.06,ryF:0.055,cyF:0.005,ryB:0.055,cyB:-0.006},{rx:0.095,ryF:0.10,cyF:0.01,ryB:0.11,cyB:-0.015},{rx:0.090,ryF:0.095,cyF:0.01,ryB:0.10,cyB:-0.015},{rx:0.05,ryF:0.06,cyF:0,ryB:0.06,cyB:-0.016}];
const m=ctx.profileLoft(path,sections,8,SIDES,()=>'#fff',{dataOnly:true,cap:'both',up:[0,0,1]});
const ri=m.ringIdx; function blockVerts(rings,angles){const out=[];for(const r of rings)for(const a of angles)out.push(ri[r]+a);return out;}
const armL=blockVerts([2,3,4],[15,0,1]),armR=blockVerts([2,3,4],[7,8,9]);
const legL=blockVerts([0,1],[15,0,1,2]),legR=blockVerts([0,1],[6,7,8,9]);
function armSpecs(s){return[{c:[s*0.205,1.08,0.02],r:0.072},{c:[s*0.225,0.97,0.03],r:0.052},{c:[s*0.225,0.84,0.04],r:0.046},{c:[s*0.225,0.75,0.05],r:0.040},{c:[s*0.225,0.68,0.07],r:0.058},{c:[s*0.225,0.64,0.09],r:0.034}];}
function legSpecs(s){return[{c:[s*0.105,0.66,0.01],r:0.092},{c:[s*0.105,0.48,0.01],r:0.070},{c:[s*0.105,0.30,0.005],r:0.056},{c:[s*0.105,0.13,0.00],r:0.046},{c:[s*0.105,0.05,0.02],r:0.058},{c:[s*0.105,0.015,0.12],r:0.050},{c:[s*0.105,0.005,0.20],r:0.034}];}
const r1=ctx.extrudePatch(m,armL,armSpecs(+1),{color:'#f3c9a7',axis:[0,-1,0]});
const r2=ctx.extrudePatch(m,armR,armSpecs(-1),{color:'#f3c9a7',axis:[0,-1,0]});
const r3=ctx.extrudePatch(m,legL,legSpecs(+1),{color:'#9aa2ab',axis:[0,-1,0]});
const r4=ctx.extrudePatch(m,legR,legSpecs(-1),{color:'#9aa2ab',axis:[0,-1,0]});
const rep=ctx.seamCheck(m);
console.log('arms B',r1.B,r2.B,'legs B',r3.B,r4.B);
console.log('seam',JSON.stringify(rep));
const xs=m.vertices.map(p=>p[0]),ys=m.vertices.map(p=>p[1]),zs=m.vertices.map(p=>p[2]);
console.log('height',(Math.max(...ys)-Math.min(...ys)).toFixed(3),'ymin',Math.min(...ys).toFixed(3),'ymax',Math.max(...ys).toFixed(3));
let obj='# body\n'; for(const p of m.vertices) obj+='v '+p[0]+' '+p[1]+' '+p[2]+'\n'; for(let i=0;i<m.faces.length;i+=3) obj+='f '+(m.faces[i]+1)+' '+(m.faces[i+1]+1)+' '+(m.faces[i+2]+1)+'\n';
fs.writeFileSync(new URL('./body3.obj', import.meta.url), obj);
console.log('verts',m.vertices.length,'tris',m.faces.length/3);
