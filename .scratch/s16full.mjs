
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
function build(rings, armK, legK, armR){
  const path=rings.map(p=>[0,p,0]);
  // 8 control pts: pelvis,hip,waist,chest,shoulder,shTop,head,crown
  const ctrl = rings.length===8? [[0.125,0.085,0.100],[0.150,0.100,0.120],[0.120,0.082,0.082],[0.150,0.130,0.100],[0.162,0.100,0.090],[0.150,0.085,0.080],[0.078,0.080,0.092],[0.020,0.020,0.025]]
    : [[0.125,0.085,0.100],[0.150,0.100,0.120],[0.120,0.082,0.082],[0.162,0.100,0.090],[0.078,0.080,0.092],[0.020,0.020,0.025]];
  const sections=ctrl.map(p=>({rx:p[0],ryB:p[1],ryF:p[2]}));
  const m=profileLoft(path,sections,rings.length-1,SIDES,(i)=>i<Math.floor(rings.length*0.6)?CLOTH:SKIN,{dataOnly:true,cap:'both',up:[0,0,1]});
  const ri=m.ringIdx;
  function bv(rings2,angles){const o=[];for(const r of rings2)for(const a of angles)o.push(ri[r]+a);return o;}
  const h=SIDES/2;
  const right=[SIDES-1,0,1], left=[h-1,h,h+1];
  function armRings(s){const defs=[];
    defs.push([0.186,1.245,0.001,[1,-0.05,0],armR,armR+0.012,0.35]);
    defs.push([0.215,1.235,0.001,[1,-0.08,0],armR+0.004,armR+0.006,0.75]);
    const elbow=[0.245,1.08,0.000,[0.35,-0.94,0],armR-0.006,armR-0.011,1];
    const hand=[0.265,0.72,0.012,[0.05,-0.999,0],armR-0.02,armR+0.004,1];
    if(armK>=4){defs.push(elbow);defs.push(hand);} else if(armK===3){defs.push(elbow);} else {defs.push(elbow);}
    const out=[];for(const d of defs){out.push({c:[s*d[0],d[1],d[2]],dir:[s*d[3][0],d[3][1],d[3][2]],ru:d[4],rv:d[5],mix:d[6]});}
    if(armK>=4) out[out.length-1].exp=0.8;
    return out;
  }
  const socket=[3,4];
  const aR=extrudePatch(m,bv(socket,right),armRings(1),{axis:[0,-1,0],color:SKIN,cap:true});
  const aL=extrudePatch(m,bv(socket,left),armRings(-1),{axis:[0,-1,0],color:SKIN,cap:true});
  function mirror(l,t,hasCap){const map=t.loop.map(id=>{const p=m.vertices[id];let b=0,d=1e9;l.loop.forEach((lid,j)=>{const q=m.vertices[lid];const dd=Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2]);if(dd<d){b=j;d=dd;}});return b;});for(let k=1;k<t.rings.length;k++)t.rings[k].forEach((id,j)=>{const q=m.vertices[l.rings[k][map[j]]];m.vertices[id]=[-q[0],q[1],q[2]];});if(hasCap!==false){const li=l.rings[l.rings.length-1],r2=t.rings[t.rings.length-1];const q=m.vertices[Math.max(...li)+1];m.vertices[Math.max(...r2)+1]=[-q[0],q[1],q[2]];}}
  mirror(aR,aL,true);
  const capIndex=SIDES*ri.length;
  const legPR=bv([0,1],right).concat([capIndex]),legPL=bv([0,1],left).concat([capIndex]);
  function legRings(s){const d=[[0.100,0.775,0.00,0.088,0.075,true],[0.102,0.50,0.005,0.055,0.047,false],[0.100,0.27,0.045,0.036,0.032,false],[0.100,0.045,0.10,0.030,0.038,false]];const out=[];const n=Math.min(legK,4);for(let i=0;i<n;i++){const x=d[i];out.push({c:[s*x[0],x[1],x[2]],ru:x[3],rv:x[4],...(x[5]?{radial:true}:{}),...(i===3?{bend:-1.25}:{})});}return out;}
  const lR=extrudePatch(m,legPR,legRings(1),{axis:[0,-1,0],color:SKIN,cap:true});
  const lL=extrudePatch(m,legPL,legRings(-1),{axis:[0,-1,0],color:SKIN,cap:true});
  mirror(lR,lL,true);
  const gate=verifyMesh(m,{budget:{requested:300,used:m.faces.length/3},maxSamples:1000});
  const seam=context.seamCheck(m);
  return {rings:rings.length,armK,legK,v:m.vertices.length,t:m.faces.length/3,B:aR.B,Bl:lR.B,si:gate.checks.selfIntersections.intersectingPairs,nm:gate.checks.normals.invertedCount,deg:gate.checks.degenerate.count,one:seam.onePiece,ar:gate.checks.areaRatio.value,sk:gate.checks.skinny.count,skp:gate.checks.skinny.pct};
}
function row(l,o){console.log(l.padEnd(26),JSON.stringify(o));}
const rings8=[0.80,0.90,1.02,1.15,1.24,1.30,1.44,1.60];
row('S16 8ring armK4 legK4', build(rings8,4,4,0.044));
row('S16 8ring armK3 legK4', build(rings8,3,4,0.044));
row('S16 8ring armK4 legK3', build(rings8,4,3,0.044));
row('S16 6ring armK4 legK3', build([0.80,0.95,1.15,1.30,1.44,1.60],4,3,0.044));
