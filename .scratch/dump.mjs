
import fs from 'node:fs';
import vm from 'node:vm';
const context = { Math, console, Set, Map };
context.window = context;
vm.createContext(context);
for (const file of ['scripts/parts/lib/ganyu-lib.js','scripts/parts/lib/ganyu-cage-branch.js','scripts/parts/lib/ganyu-seam-check.js']) vm.runInContext(fs.readFileSync(file,'utf8'), context, {filename:file});
const { profileLoft, extrudePatch } = context;
const SKIN='#f3c9a7', CLOTH='#d9d9de';
const SIDES=8;
const path=[0.80,0.90,1.02,1.15,1.24,1.30,1.38,1.46,1.60].map(y=>[0,y,0]);
const profiles=[[0.125,0.085,0.100],[0.150,0.100,0.120],[0.120,0.082,0.082],[0.150,0.130,0.100],[0.162,0.100,0.090],[0.150,0.085,0.080],[0.050,0.050,0.048],[0.078,0.080,0.092],[0.020,0.020,0.025]];
const sections=profiles.map(p=>({rx:p[0],ryB:p[1],ryF:p[2]}));
const m=profileLoft(path,sections,path.length-1,SIDES,(i)=>i<5?CLOTH:SKIN,{dataOnly:true,cap:'both',up:[0,0,1]});
const ri=m.ringIdx;
function bv(rings,angles){const o=[];for(const r of rings)for(const a of angles)o.push(ri[r]+a);return o;}
function armRings(s){const defs=[[0.186,1.24,0.002,[1,-0.05,0],0.046,0.060,0.35],[0.215,1.235,0.001,[1,-0.08,0],0.050,0.056,0.75],[0.245,1.10,0.000,[0.35,-0.94,0],0.040,0.035,1],[0.265,0.72,0.012,[0.05,-0.999,0],0.020,0.038,1]];const out=[];for(const d of defs){out.push({c:[s*d[0],d[1],d[2]],dir:[s*d[3][0],d[3][1],d[3][2]],ru:d[4],rv:d[5],mix:d[6]});}out[out.length-1].exp=0.8;return out;}
const patch=bv([3,4],[7,0,1]);
const res=extrudePatch(m,patch,armRings(1),{axis:[0,-1,0],color:SKIN,cap:true});
console.log('B', res.B, 'loop', JSON.stringify(res.loop));
console.log('--- socket (loop) verts in order ---');
for(const id of res.loop){ const p=m.vertices[id]; console.log(' loop', JSON.stringify([+p[0].toFixed(4),+p[1].toFixed(4),+p[2].toFixed(4)])); }
console.log('--- generated rings in order ---');
for(let k=1;k<res.rings.length;k++){ console.log('ring'+k+':'); for(const id of res.rings[k]){const p=m.vertices[id];console.log('   ', JSON.stringify([+p[0].toFixed(4),+p[1].toFixed(4),+p[2].toFixed(4)]));} }
// Also dump which faces are self-intersecting within arm root: compute all arm faces indices
console.log('patch verts', JSON.stringify(patch));
