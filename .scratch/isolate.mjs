
import fs from 'node:fs';
import vm from 'node:vm';
const context = { Math, console, Set, Map };
context.window = context;
vm.createContext(context);
for (const file of ['scripts/parts/lib/ganyu-lib.js','scripts/parts/lib/ganyu-cage-branch.js','scripts/parts/lib/ganyu-seam-check.js']) vm.runInContext(fs.readFileSync(file,'utf8'), context, {filename:file});
const { profileLoft, extrudePatch } = context;
const { verifyMesh } = await import('/home/h/genshin-model-studio/dist/src/mesh/verify.js');
const SKIN='#f3c9a7', CLOTH='#d9d9de';
const SIDES=8;
const path=[0.80,0.90,1.02,1.15,1.24,1.30,1.38,1.46,1.60].map(y=>[0,y,0]);
const profiles=[[0.125,0.085,0.100],[0.150,0.100,0.120],[0.120,0.082,0.082],[0.150,0.130,0.100],[0.162,0.100,0.090],[0.150,0.085,0.080],[0.050,0.050,0.048],[0.078,0.080,0.092],[0.020,0.020,0.025]];
const sections=profiles.map(p=>({rx:p[0],ryB:p[1],ryF:p[2]}));
function bv(ri,rings,angles){const o=[];for(const r of rings)for(const a of angles)o.push(ri[r]+a);return o;}
function mk(){ const m=profileLoft(path,sections,path.length-1,SIDES,(i)=>i<5?CLOTH:SKIN,{dataOnly:true,cap:'both',up:[0,0,1]}); return m; }
function mirror(m,left,right,hasCap){const map=right.loop.map(id=>{const p=m.vertices[id];let b=0,d=1e9;left.loop.forEach((lid,j)=>{const q=m.vertices[lid];const dd=Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2]);if(dd<d){b=j;d=dd;}});return b;});for(let k=1;k<right.rings.length;k++)right.rings[k].forEach((id,j)=>{const q=m.vertices[left.rings[k][map[j]]];m.vertices[id]=[-q[0],q[1],q[2]];});if(hasCap!==false){const li=left.rings[left.rings.length-1],ri2=right.rings[right.rings.length-1];const q=m.vertices[Math.max(...li)+1];m.vertices[Math.max(...ri2)+1]=[-q[0],q[1],q[2]];}}
function armRings(s){const defs=[[0.186,1.24,0.002,[1,-0.05,0],0.046,0.060,0.35],[0.215,1.235,0.001,[1,-0.08,0],0.050,0.056,0.75],[0.245,1.10,0.000,[0.35,-0.94,0],0.040,0.035,1],[0.265,0.72,0.012,[0.05,-0.999,0],0.020,0.038,1]];const out=[];for(const d of defs){out.push({c:[s*d[0],d[1],d[2]],dir:[s*d[3][0],d[3][1],d[3][2]],ru:d[4],rv:d[5],mix:d[6]});}out[out.length-1].exp=0.8;return out;}
// TRUNK ONLY
{
  const m=mk(); const g=verifyMesh(m,{budget:{requested:300,used:m.faces.length/3},maxSamples:1000});
  console.log('TRUNK only: t',m.faces.length/3,'si',g.checks.selfIntersections.intersectingPairs,'nm',g.checks.normals.invertedCount);
}
// TRUNK + ARMS
{
  const m=mk(); const ri=m.ringIdx;
  const aR=extrudePatch(m,bv(ri,[3,4],[7,0,1]),armRings(1),{axis:[0,-1,0],color:SKIN,cap:true});
  const aL=extrudePatch(m,bv(ri,[3,4],[3,4,5]),armRings(-1),{axis:[0,-1,0],color:SKIN,cap:true});
  mirror(m,aR,aL,true);
  const g=verifyMesh(m,{budget:{requested:300,used:m.faces.length/3},maxSamples:1000});
  console.log('TRUNK+ARMS: t',m.faces.length/3,'si',g.checks.selfIntersections.intersectingPairs,'nm',g.checks.normals.invertedCount);
}
// TRUNK + LEGS
{
  const m=mk(); const ri=m.ringIdx; const capIndex=SIDES*ri.length;
  function legRings(s){return [{c:[s*0.100,0.775,0.00],ru:0.090,rv:0.078,radial:true},{c:[s*0.102,0.50,0.005],ru:0.056,rv:0.048},{c:[s*0.100,0.045,0.08],ru:0.030,rv:0.038,bend:-1.25}];}
  const lR=extrudePatch(m,bv(ri,[0,1],[7,0,1]).concat([capIndex]),legRings(1),{axis:[0,-1,0],color:SKIN,cap:true});
  const lL=extrudePatch(m,bv(ri,[0,1],[3,4,5]).concat([capIndex]),legRings(-1),{axis:[0,-1,0],color:SKIN,cap:true});
  mirror(m,lR,lL,true);
  const g=verifyMesh(m,{budget:{requested:300,used:m.faces.length/3},maxSamples:1000});
  console.log('TRUNK+LEGS: t',m.faces.length/3,'si',g.checks.selfIntersections.intersectingPairs,'nm',g.checks.normals.invertedCount);
}
