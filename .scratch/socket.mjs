
import fs from 'node:fs';
import vm from 'node:vm';
const context = { Math, console, Set, Map };
context.window = context;
vm.createContext(context);
for (const file of ['scripts/parts/lib/ganyu-lib.js','scripts/parts/lib/ganyu-cage-branch.js','scripts/parts/lib/ganyu-seam-check.js']) vm.runInContext(fs.readFileSync(file,'utf8'), context, {filename:file});
const { profileLoft, extrudePatch } = context;
const { verifyMesh } = await import('/home/h/genshin-model-studio/dist/src/mesh/verify.js');
const SKIN='#f3c9a7', CLOTH='#d9d9de';
// 9-ring trunk w/ wide shoulder-top so a 3x3 (3-ring) socket works
const path=[0.80,0.90,1.02,1.15,1.24,1.30,1.38,1.46,1.60].map(y=>[0,y,0]);
const profiles=[[0.125,0.085,0.100],[0.150,0.100,0.120],[0.120,0.082,0.082],[0.150,0.130,0.100],[0.162,0.100,0.090],[0.150,0.085,0.080],[0.050,0.050,0.048],[0.078,0.080,0.092],[0.020,0.020,0.025]];
const sections=profiles.map(p=>({rx:p[0],ryB:p[1],ryF:p[2]}));
function run(SIDES, socketRings, armRadius){
  const m=profileLoft(path,sections,path.length-1,SIDES,(i)=>i<5?CLOTH:SKIN,{dataOnly:true,cap:'both',up:[0,0,1]});
  const ri=m.ringIdx;
  function bv(rings,angles){const o=[];for(const r of rings)for(const a of angles)o.push(ri[r]+a);return o;}
  const h=SIDES/2;
  const right=[SIDES-1,0,1], left=[h-1,h,h+1];
  function armRings(s){const defs=[[0.186,1.245,0.001,[1,-0.05,0],armRadius,armRadius+0.012,0.35],[0.215,1.235,0.001,[1,-0.08,0],armRadius+0.004,armRadius+0.008,0.75],[0.245,1.08,0.000,[0.35,-0.94,0],armRadius-0.006,armRadius-0.011,1],[0.265,0.72,0.012,[0.05,-0.999,0],armRadius-0.02,armRadius+0.004,1]];const out=[];for(const d of defs){out.push({c:[s*d[0],d[1],d[2]],dir:[s*d[3][0],d[3][1],d[3][2]],ru:d[4],rv:d[5],mix:d[6]});}out[out.length-1].exp=0.8;return out;}
  const aR=extrudePatch(m,bv(socketRings,right),armRings(1),{axis:[0,-1,0],color:SKIN,cap:true});
  const aL=extrudePatch(m,bv(socketRings,left),armRings(-1),{axis:[0,-1,0],color:SKIN,cap:true});
  function mirror(l,t,hasCap){const map=t.loop.map(id=>{const p=m.vertices[id];let b=0,d=1e9;l.loop.forEach((lid,j)=>{const q=m.vertices[lid];const dd=Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2]);if(dd<d){b=j;d=dd;}});return b;});for(let k=1;k<t.rings.length;k++)t.rings[k].forEach((id,j)=>{const q=m.vertices[l.rings[k][map[j]]];m.vertices[id]=[-q[0],q[1],q[2]];});if(hasCap!==false){const li=l.rings[l.rings.length-1],r2=t.rings[t.rings.length-1];const q=m.vertices[Math.max(...li)+1];m.vertices[Math.max(...r2)+1]=[-q[0],q[1],q[2]];}}
  mirror(aR,aL,true);
  const gate=verifyMesh(m,{budget:{requested:300,used:m.faces.length/3},maxSamples:1000});
  const seam=context.seamCheck(m);
  return {SIDES,sock:socketRings.join(''),ar:armRadius,v:m.vertices.length,t:m.faces.length/3,B:aR.B,si:gate.checks.selfIntersections.intersectingPairs,nm:gate.checks.normals.invertedCount,one:seam.onePiece};
}
console.log('== 2-ring socket ==');
for(const s of [8,10,12,14,16]) console.log(JSON.stringify(run(s,[3,4],0.044)));
console.log('== 3-ring socket ==');
for(const s of [8,10,12,14,16]) console.log(JSON.stringify(run(s,[3,4,5],0.044)));
