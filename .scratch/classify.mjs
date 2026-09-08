
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
function build(socketRings, armK, trunkSegs, chestRx, shRx, armRx, armMix){
  const profiles=[
    [0.125,0.085,0.100],[0.150,0.100,0.120],[0.120,0.082,0.082],
    [chestRx,0.130,0.100],[shRx,0.100,0.090],[0.050,0.050,0.048],
    [0.085,0.085,0.098],[0.020,0.020,0.025]
  ];
  const sections=profiles.map(p=>({rx:p[0],ryB:p[1],ryF:p[2]}));
  const mesh=profileLoft(path,sections,trunkSegs, SIDES,(i)=>i<4?CLOTH:SKIN,{dataOnly:true,cap:'both',up:[0,0,1]});
  if(trunkSegs!==path.length-1){ return {err:'only support segs=7'}; }
  const ri=mesh.ringIdx;
  function bv(rings,angles){const o=[];for(const r of rings)for(const a of angles)o.push(ri[r]+a);return o;}
  // arm rings builder: K rings from shoulder->elbow->hand
  function armRings(s){ const out=[];
    const stations=[ [armRx,1.235,0.00, [s*1,-0.05,0], 0.056,0.058, armMix],
                     [armRx+0.03, 1.10, 0.00, [s*0.6,-0.80,0], 0.048,0.042, 1],
                     [armRx+0.055, 0.97, 0.00, [s*0.35,-0.94,0], 0.040,0.035, 1],
                     [armRx+0.07, 0.72, 0.012,[s*0.05,-0.999,0], 0.020,0.040, 1] ];
    const take = armK===4? [0,1,2,3] : armK===3? [0,2,3] : [0,3];
    for(const i of take){ const st=stations[i]; out.push({c:[st[0],st[1],st[2]], dir:st[3].map(x=>x*s>=0?st[3][0]/s:st[3][0]), ru:st[4], rv:st[5], mix:st[6], ...(i===3?{exp:0.8}:{})}); }
    // fix dir sign for s=-1 handled by caller rounding; simpler: compute per side
    return out;
  }
  // NOTE: armRings above computes dir with st[3][0]/s hack; handle s outside instead
  function armRingsS(s){ const out=[];
    const defs=[
      [armRx,1.235,0, 0.056,0.058,armMix, [1,-0.05,0]],
      [armRx+0.03,1.10,0, 0.048,0.042,1, [0.6,-0.80,0]],
      [armRx+0.055,0.97,0, 0.040,0.035,1, [0.35,-0.94,0]],
      [armRx+0.07,0.72,0.012, 0.020,0.040,1, [0.05,-0.999,0]]
    ];
    const take = armK===4?[0,1,2,3]:armK===3?[0,2,3]:[0,3];
    for(const i of take){ const d=defs[i]; out.push({c:[s*d[0],d[1],d[2]], dir:[s*d[6][0],d[6][1],d[6][2]], ru:d[3], rv:d[4], mix:d[5], ...(i===3?{exp:0.8}:{})}); }
    return out;
  }
  const armPR=bv(socketRings,[7,0,1]), armPL=bv(socketRings,[3,4,5]);
  const aR=extrudePatch(mesh,armPR,armRingsS(1),{axis:[0,-1,0],color:SKIN,cap:true});
  const tAfterArmR=mesh.faces.length/3;
  const aL=extrudePatch(mesh,armPL,armRingsS(-1),{axis:[0,-1,0],color:SKIN,cap:true});
  const tAfterArmL=mesh.faces.length/3;
  function mirror(left,right,hasCap){const map=right.loop.map(id=>{const p=mesh.vertices[id];let b=0,d=1e9;left.loop.forEach((lid,j)=>{const q=mesh.vertices[lid];const dd=Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2]);if(dd<d){b=j;d=dd;}});if(d>1e-7)throw new Error('nm d='+d);return b;});for(let k=1;k<right.rings.length;k++)right.rings[k].forEach((id,j)=>{const q=mesh.vertices[left.rings[k][map[j]]];mesh.vertices[id]=[-q[0],q[1],q[2]];});if(hasCap!==false){const li=left.rings[left.rings.length-1],ri2=right.rings[right.rings.length-1];const q=mesh.vertices[Math.max(...li)+1];mesh.vertices[Math.max(...ri2)+1]=[-q[0],q[1],q[2]];}}
  mirror(aR,aL,true);
  const capIndex=SIDES*ri.length;
  const legPR=bv([0,1],[7,0,1]).concat([capIndex]), legPL=bv([0,1],[3,4,5]).concat([capIndex]);
  function legRings(s){return [
    {c:[s*0.100,0.775,0.00], ru:0.090, rv:0.078, radial:true},
    {c:[s*0.102,0.50,0.005], ru:0.056, rv:0.048},
    {c:[s*0.100,0.045,0.08], ru:0.030, rv:0.038, bend:-1.25}
  ];}
  const lR=extrudePatch(mesh,legPR,legRings(1),{axis:[0,-1,0],color:SKIN,cap:true});
  const lL=extrudePatch(mesh,legPL,legRings(-1),{axis:[0,-1,0],color:SKIN,cap:true});
  mirror(lR,lL,true);
  const seam=context.seamCheck(mesh);
  const gate=verifyMesh(mesh,{budget:{requested:300,used:mesh.faces.length/3}});
  return {v:mesh.vertices.length,t:mesh.faces.length/3,armRK:tAfterArmR,armLK:tAfterArmL,si:gate.checks.selfIntersections.intersectingPairs,ar:gate.checks.areaRatio.value,sk:gate.checks.skinny.count,skp:gate.checks.skinny.pct,nm:gate.checks.normals.invertedCount,deg:gate.checks.degenerate.count,ok:gate.ok};
}
function row(label,r){ console.log(label.padEnd(22), JSON.stringify(r)); }
row('socket[3,4] K3 base', build([3,4],3,7,0.160,0.170,0.195,0.55));
row('socket[3,4,5] K3', build([3,4,5],3,7,0.160,0.170,0.195,0.55));
row('socket[3,4,5] K4', build([3,4,5],4,7,0.160,0.170,0.195,0.55));
row('socket[3,4] K4', build([3,4],4,7,0.160,0.170,0.195,0.55));
row('socket[3,4] K4 armRx.21', build([3,4],4,7,0.160,0.170,0.210,0.55));

// --- classify all self-intersection pairs for a chosen config ---
const cfg = build([3,4],4,7,0.160,0.170,0.195,0.55);
console.log('cfg', JSON.stringify(cfg));
// rebuild with maxSamples to capture all pairs
function build2(socketRings,armK,trunkSegs,chestRx,shRx,armRx,armMix,maxSamples){
  const profiles=[[0.125,0.085,0.100],[0.150,0.100,0.120],[0.120,0.082,0.082],[chestRx,0.130,0.100],[shRx,0.100,0.090],[0.050,0.050,0.048],[0.085,0.085,0.098],[0.020,0.020,0.025]];
  const sections=profiles.map(p=>({rx:p[0],ryB:p[1],ryF:p[2]}));
  const mesh=profileLoft(path,sections,trunkSegs,SIDES,(i)=>i<4?CLOTH:SKIN,{dataOnly:true,cap:'both',up:[0,0,1]});
  const ri=mesh.ringIdx;
  function bv(rings,angles){const o=[];for(const r of rings)for(const a of angles)o.push(ri[r]+a);return o;}
  function armRingsS(s){const out=[];const defs=[[armRx,1.235,0,0.056,0.058,armMix,[1,-0.05,0]],[armRx+0.03,1.10,0,0.048,0.042,1,[0.6,-0.80,0]],[armRx+0.055,0.97,0,0.040,0.035,1,[0.35,-0.94,0]],[armRx+0.07,0.72,0.012,0.020,0.040,1,[0.05,-0.999,0]]];const take=armK===4?[0,1,2,3]:armK===3?[0,2,3]:[0,3];for(const i of take){const d=defs[i];out.push({c:[s*d[0],d[1],d[2]],dir:[s*d[6][0],d[6][1],d[6][2]],ru:d[3],rv:d[4],mix:d[5],...(i===3?{exp:0.8}:{})});}return out;}
  const armPR=bv(socketRings,[7,0,1]),armPL=bv(socketRings,[3,4,5]);
  const aR=extrudePatch(mesh,armPR,armRingsS(1),{axis:[0,-1,0],color:SKIN,cap:true});
  const aL=extrudePatch(mesh,armPL,armRingsS(-1),{axis:[0,-1,0],color:SKIN,cap:true});
  function mirror(left,right,hasCap){const map=right.loop.map(id=>{const p=mesh.vertices[id];let b=0,d=1e9;left.loop.forEach((lid,j)=>{const q=mesh.vertices[lid];const dd=Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2]);if(dd<d){b=j;d=dd;}});return b;});for(let k=1;k<right.rings.length;k++)right.rings[k].forEach((id,j)=>{const q=mesh.vertices[left.rings[k][map[j]]];mesh.vertices[id]=[-q[0],q[1],q[2]];});if(hasCap!==false){const li=left.rings[left.rings.length-1],ri2=right.rings[right.rings.length-1];const q=mesh.vertices[Math.max(...li)+1];mesh.vertices[Math.max(...ri2)+1]=[-q[0],q[1],q[2]];}}
  mirror(aR,aL,true);
  const capIndex=SIDES*ri.length;
  const legPR=bv([0,1],[7,0,1]).concat([capIndex]),legPL=bv([0,1],[3,4,5]).concat([capIndex]);
  function legRings(s){return [{c:[s*0.100,0.775,0.00],ru:0.090,rv:0.078,radial:true},{c:[s*0.102,0.50,0.005],ru:0.056,rv:0.048},{c:[s*0.100,0.045,0.08],ru:0.030,rv:0.038,bend:-1.25}];}
  const lR=extrudePatch(mesh,legPR,legRings(1),{axis:[0,-1,0],color:SKIN,cap:true});
  const lL=extrudePatch(mesh,legPL,legRings(-1),{axis:[0,-1,0],color:SKIN,cap:true});
  mirror(lR,lL,true);
  const gate=verifyMesh(mesh,{budget:{requested:300,used:mesh.faces.length/3},maxSamples:2000});
  return gate;
}
const g = build2([3,4],4,7,0.160,0.170,0.195,0.55,2000);
const sp=g.checks.selfIntersections.samplePairs;
console.log('total pairs', g.checks.selfIntersections.intersectingPairs, 'sampled', sp.length);
// classify by region: side(sign x of centroid), band of y
function region(p){ const x=p.positionA[0], y=p.positionA[1], z=p.positionA[2]; const s=Math.abs(x)<0.02?'C':(x>0?'R':'L'); const yb=y<0.2?'foot':y<0.9?'leg/hip':y<1.2?'torso/arm':y<1.34?'shoulder/neck':'head'; return s+'|'+yb+'|('+x.toFixed(2)+','+y.toFixed(2)+','+z.toFixed(2)+')'; }
const hist={};
for(const p of sp){ const k=region(p); hist[k]=(hist[k]||0)+1; }
const keys=Object.keys(hist).sort((a,b)=>b.localeCompare(a));
console.log('--- pairs by region (first 40) ---');
for(const k of keys.slice(0,40)) console.log(hist[k], k);
