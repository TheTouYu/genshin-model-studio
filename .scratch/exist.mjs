
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
// 9-ring trunk with wide shoulder-top so socket can be 3x3
const path=[0.80,0.90,1.02,1.15,1.24,1.30,1.38,1.46,1.60].map(y=>[0,y,0]);
const profiles=[[0.125,0.085,0.100],[0.150,0.100,0.120],[0.120,0.082,0.082],[0.150,0.130,0.100],[0.162,0.100,0.090],[0.150,0.085,0.080],[0.050,0.050,0.048],[0.078,0.080,0.092],[0.020,0.020,0.025]];
const sections=profiles.map(p=>({rx:p[0],ryB:p[1],ryF:p[2]}));
const mesh=profileLoft(path,sections,path.length-1,SIDES,(i)=>i<5?CLOTH:SKIN,{dataOnly:true,cap:'both',up:[0,0,1]});
const ri=mesh.ringIdx;
function bv(rings,angles){const o=[];for(const r of rings)for(const a of angles)o.push(ri[r]+a);return o;}
// replicate existing 8-station arm (scaled). armK selects how many stations (0..7)
function armRings(s,armK){
  const defs=[
    [0.186,1.238,0.002,[1,-0.08,0],0.046,0.064,0.30],
    [0.212,1.235,0.002,[1,-0.08,0],0.048,0.062,0.58],
    [0.232,1.228,0.001,[1,-0.10,0],0.050,0.058,0.80],
    [0.250,1.195,0.000,[0.75,-0.66,0],0.050,0.048,1],
    [0.270,1.075,-0.006,[0.30,-0.93,0],0.039,0.034,1],
    [0.279,0.950,0.000,[0.10,-0.995,0],0.038,0.031,1],
    [0.287,0.820,0.008,[0.05,-0.999,0],0.027,0.024,1],
    [0.290,0.775,0.010,[0.05,-0.999,0],0.026,0.025,1]
  ];
  const take=armK; // number of stations to use (1..8)
  const out=[];
  for(let i=0;i<take;i++){const d=defs[i];out.push({c:[s*d[0],d[1],d[2]],dir:[s*d[3][0],d[3][1],d[3][2]],ru:d[4],rv:d[5],mix:d[6]});}
  return out;
}
function build(armK, socketRings){
  // re-loft a fresh mesh each time
  const m2=profileLoft(path,sections,path.length-1,SIDES,(i)=>i<5?CLOTH:SKIN,{dataOnly:true,cap:'both',up:[0,0,1]});
  const r2=m2.ringIdx;
  function b2(rings,angles){const o=[];for(const r of rings)for(const a of angles)o.push(r2[r]+a);return o;}
  const armPR=b2(socketRings,[7,0,1]),armPL=b2(socketRings,[3,4,5]);
  const aR=extrudePatch(m2,armPR,armRings(1,armK),{axis:[0,-1,0],color:SKIN,cap:true});
  const aL=extrudePatch(m2,armPL,armRings(-1,armK),{axis:[0,-1,0],color:SKIN,cap:true});
  function mirror(left,right,hasCap){const map=right.loop.map(id=>{const p=m2.vertices[id];let b=0,d=1e9;left.loop.forEach((lid,j)=>{const q=m2.vertices[lid];const dd=Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2]);if(dd<d){b=j;d=dd;}});return b;});for(let k=1;k<right.rings.length;k++)right.rings[k].forEach((id,j)=>{const q=m2.vertices[left.rings[k][map[j]]];m2.vertices[id]=[-q[0],q[1],q[2]];});if(hasCap!==false){const li=left.rings[left.rings.length-1],ri2=right.rings[right.rings.length-1];const q=m2.vertices[Math.max(...li)+1];m2.vertices[Math.max(...ri2)+1]=[-q[0],q[1],q[2]];}}
  mirror(aR,aL,true);
  const capIndex=SIDES*r2.length;
  const legPR=b2([0,1],[7,0,1]).concat([capIndex]),legPL=b2([0,1],[3,4,5]).concat([capIndex]);
  function legRings(s){return [{c:[s*0.100,0.775,0.00],ru:0.090,rv:0.078,radial:true},{c:[s*0.102,0.50,0.005],ru:0.056,rv:0.048},{c:[s*0.100,0.045,0.08],ru:0.030,rv:0.038,bend:-1.25}];}
  const lR=extrudePatch(m2,legPR,legRings(1),{axis:[0,-1,0],color:SKIN,cap:true});
  const lL=extrudePatch(m2,legPL,legRings(-1),{axis:[0,-1,0],color:SKIN,cap:true});
  mirror(lR,lL,true);
  const seam=context.seamCheck(m2);
  const gate=verifyMesh(m2,{budget:{requested:300,used:m2.faces.length/3},maxSamples:1000});
  return {v:m2.vertices.length,t:m2.faces.length/3,armB:aR.B,si:gate.checks.selfIntersections.intersectingPairs,ar:gate.checks.areaRatio.value,sk:gate.checks.skinny.count,skp:gate.checks.skinny.pct,nm:gate.checks.normals.invertedCount,deg:gate.checks.degenerate.count,one:seam.onePiece};
}
function row(l,o){console.log(l.padEnd(24),JSON.stringify(o));}
row('K3 socket[3,4]', build(3,[3,4]));
row('K4 socket[3,4]', build(4,[3,4]));
row('K5 socket[3,4]', build(5,[3,4]));
row('K8 socket[3,4]', build(8,[3,4]));
row('K8 socket[3,4,5]', build(8,[3,4,5]));
