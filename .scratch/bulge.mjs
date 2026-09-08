
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
const path=[0.80,0.90,1.02,1.15,1.23,1.30,1.42,1.60].map(y=>[0,y,0]);
function build(trunkSegs, armMix0, rootY, extY, chestRx, shRx){
  const profiles=[[0.125,0.085,0.100],[0.150,0.100,0.120],[0.120,0.082,0.082],[chestRx,0.130,0.100],[shRx,0.100,0.090],[0.050,0.050,0.048],[0.085,0.085,0.098],[0.020,0.020,0.025]];
  const sections=profiles.map(p=>({rx:p[0],ryB:p[1],ryF:p[2]}));
  const mesh=profileLoft(path,sections,trunkSegs,SIDES,(i)=>i<4?CLOTH:SKIN,{dataOnly:true,cap:'both',up:[0,0,1]});
  const ri=mesh.ringIdx;
  function bv(rings,angles){const o=[];for(const r of rings)for(const a of angles)o.push(ri[r]+a);return o;}
  // horizontal-shoulder bulge then descend to palm+cap
  function armRings(s){return [
    {c:[s*0.186,rootY,0.001], dir:[s*1,-0.06,0], ru:0.046, rv:0.064, mix:armMix0},
    {c:[s*0.232,rootY-0.008,0.001], dir:[s*1,-0.08,0], ru:0.050, rv:0.058, mix:0.80},
    {c:[s*0.252,extY,0.000], dir:[s*0.30,-0.95,0], ru:0.040, rv:0.035, mix:1},
    {c:[s*0.268,0.72,0.012], dir:[s*0.05,-0.999,0], ru:0.020, rv:0.040, exp:0.8, mix:1}
  ];}
  const armPR=bv([3,4],[7,0,1]),armPL=bv([3,4],[3,4,5]);
  const aR=extrudePatch(mesh,armPR,armRings(1),{axis:[0,-1,0],color:SKIN,cap:true});
  const aL=extrudePatch(mesh,armPL,armRings(-1),{axis:[0,-1,0],color:SKIN,cap:true});
  function mirror(left,right,hasCap){const map=right.loop.map(id=>{const p=mesh.vertices[id];let b=0,d=1e9;left.loop.forEach((lid,j)=>{const q=mesh.vertices[lid];const dd=Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2]);if(dd<d){b=j;d=dd;}});return b;});for(let k=1;k<right.rings.length;k++)right.rings[k].forEach((id,j)=>{const q=mesh.vertices[left.rings[k][map[j]]];mesh.vertices[id]=[-q[0],q[1],q[2]];});if(hasCap!==false){const li=left.rings[left.rings.length-1],ri2=right.rings[right.rings.length-1];const q=mesh.vertices[Math.max(...li)+1];mesh.vertices[Math.max(...ri2)+1]=[-q[0],q[1],q[2]];}}
  mirror(aR,aL,true);
  const capIndex=SIDES*ri.length;
  const legPR=bv([0,1],[7,0,1]).concat([capIndex]),legPL=bv([0,1],[3,4,5]).concat([capIndex]);
  function legRings(s){return [{c:[s*0.100,0.775,0.00],ru:0.090,rv:0.078,radial:true},{c:[s*0.102,0.50,0.005],ru:0.056,rv:0.048},{c:[s*0.100,0.045,0.08],ru:0.030,rv:0.038,bend:-1.25}];}
  const lR=extrudePatch(mesh,legPR,legRings(1),{axis:[0,-1,0],color:SKIN,cap:true});
  const lL=extrudePatch(mesh,legPL,legRings(-1),{axis:[0,-1,0],color:SKIN,cap:true});
  mirror(lR,lL,true);
  const seam=context.seamCheck(mesh);
  const gate=verifyMesh(mesh,{budget:{requested:300,used:mesh.faces.length/3},maxSamples:1000});
  return {v:mesh.vertices.length,t:mesh.faces.length/3,one:seam.onePiece,si:gate.checks.selfIntersections.intersectingPairs,ar:gate.checks.areaRatio.value,sk:gate.checks.skinny.count,skp:gate.checks.skinny.pct,nm:gate.checks.normals.invertedCount,deg:gate.checks.degenerate.count,ok:gate.ok};
}
function row(l,o){console.log(l.padEnd(26),JSON.stringify(o));}
row('bulge mix0.30 extY1.10', build(7,0.30,1.240,1.10,0.160,0.170));
row('bulge mix0.30 extY1.14', build(7,0.30,1.240,1.14,0.160,0.170));
row('bulge mix0.20 extY1.10', build(7,0.20,1.240,1.10,0.160,0.170));
row('bulge mix0.30 chest.14 sh.18', build(7,0.30,1.240,1.10,0.140,0.180));
