
import fs from 'node:fs';
import vm from 'node:vm';
const context = { Math, console, Set, Map };
context.window = context;
vm.createContext(context);
for (const file of ['scripts/parts/lib/ganyu-lib.js','scripts/parts/lib/ganyu-cage-branch.js','scripts/parts/lib/ganyu-seam-check.js']) vm.runInContext(fs.readFileSync(file,'utf8'), context, {filename:file});
const { profileLoft, extrudePatch } = context;
const { verifyMesh } = await import('/home/h/genshin-model-studio/dist/src/mesh/verify.js');
const SKIN='#f3c9a7', CLOTH='#d9d9de';
const SIDES=16;
function build(ringDefs, socketRings, armK, legK){
  const path=ringDefs.map(p=>[0,p[0],0]);
  const sections=ringDefs.map(p=>({rx:p[1],ryB:p[2],ryF:p[3]}));
  const m=profileLoft(path,sections,ringDefs.length-1,SIDES,(i)=>i<Math.floor(ringDefs.length*0.55)?CLOTH:SKIN,{dataOnly:true,cap:'both',up:[0,0,1]});
  const ri=m.ringIdx;
  function bv(rings,angles){const o=[];for(const r of rings)for(const a of angles)o.push(ri[r]+a);return o;}
  const h=SIDES/2, right=[SIDES-1,0,1], left=[h-1,h,h+1];
  function armRings(s){const defs=[
    [0.186,1.245,0.001,[1,-0.05,0],0.044,0.056,0.35],
    [0.215,1.235,0.001,[1,-0.08,0],0.048,0.050,0.75],
    [0.245,1.08,0.000,[0.35,-0.94,0],0.038,0.033,1],
    [0.265,0.72,0.012,[0.05,-0.999,0],0.024,0.040,1]
  ];
    const out=[];for(const d of defs.slice(0,armK)){const o={c:[s*d[0],d[1],d[2]],dir:[s*d[3][0],d[3][1],d[3][2]],ru:d[4],rv:d[5],mix:d[6]};out.push(o);}if(armK>=4)out[out.length-1].exp=0.8;return out;}
  const aR=extrudePatch(m,bv(socketRings,right),armRings(1),{axis:[0,-1,0],color:SKIN,cap:true});
  const aL=extrudePatch(m,bv(socketRings,left),armRings(-1),{axis:[0,-1,0],color:SKIN,cap:true});
  function mirror(l,t,hasCap){const map=t.loop.map(id=>{const p=m.vertices[id];let b=0,d=1e9;l.loop.forEach((lid,j)=>{const q=m.vertices[lid];const dd=Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2]);if(dd<d){b=j;d=dd;}});return b;});for(let k=1;k<t.rings.length;k++)t.rings[k].forEach((id,j)=>{const q=m.vertices[l.rings[k][map[j]]];m.vertices[id]=[-q[0],q[1],q[2]];});if(hasCap!==false){const li=l.rings[l.rings.length-1],r2=t.rings[t.rings.length-1];const q=m.vertices[Math.max(...li)+1];m.vertices[Math.max(...r2)+1]=[-q[0],q[1],q[2]];}}
  mirror(aR,aL,true);
  const capIndex=SIDES*ri.length;
  const legPR=bv([0,1],right).concat([capIndex]),legPL=bv([0,1],left).concat([capIndex]);
  function legRings(s){const d=[[0.100,0.775,0.00,0.088,0.075,true],[0.102,0.50,0.005,0.055,0.047,false],[0.100,0.27,0.045,0.036,0.032,false],[0.100,0.045,0.10,0.030,0.038,false]];const out=[];for(let i=0;i<legK;i++){const x=d[i];out.push({c:[s*x[0],x[1],x[2]],ru:x[3],rv:x[4],...(x[5]?{radial:true}:{}),...(i===3?{bend:-1.25}:{})});}return out;}
  const lR=extrudePatch(m,legPR,legRings(1),{axis:[0,-1,0],color:SKIN,cap:true});
  const lL=extrudePatch(m,legPL,legRings(-1),{axis:[0,-1,0],color:SKIN,cap:15});
  mirror(lR,lL,true);
  const gate=verifyMesh(m,{budget:{requested:300,used:m.faces.length/3},maxSamples:1000});
  const seam=context.seamCheck(m);
  return {rings:ringDefs.length,socket:+socketRings.join(''),armK,legK,v:m.vertices.length,t:m.faces.length/3,si:gate.checks.selfIntersections.intersectingPairs,nm:gate.checks.normals.invertedCount,deg:gate.checks.degenerate.count,one:seam.onePiece,ar:gate.checks.areaRatio.value,sk:gate.checks.skinny.count,skp:gate.checks.skinny.pct};
}
function row(l,o){console.log(l.padEnd(28),JSON.stringify(o));}
const R8=[[0.80,0.125,0.085,0.100],[0.90,0.150,0.100,0.120],[1.02,0.120,0.082,0.082],[1.15,0.150,0.130,0.100],[1.24,0.162,0.100,0.090],[1.30,0.150,0.085,0.080],[1.44,0.078,0.080,0.092],[1.60,0.020,0.020,0.025]];
const R7=[[0.80,0.125,0.085,0.100],[0.90,0.150,0.100,0.120],[1.02,0.120,0.082,0.082],[1.16,0.150,0.130,0.100],[1.25,0.162,0.100,0.090],[1.44,0.078,0.080,0.092],[1.60,0.020,0.020,0.025]];
row('R8 sock34 aK4 lK4', build(R8,[3,4],4,4));
row('R8 sock34 aK4 lK3', build(R8,[3,4],4,3));
row('R8 sock34 aK3 lK4', build(R8,[3,4],3,4));
row('R8 sock23 aK4 lK4', build(R8,[2,3],4,4));
row('R8 sock45 aK4 lK4', build(R8,[4,5],4,4));
row('R7 sock23 aK4 lK4', build(R7,[2,3],4,4));
