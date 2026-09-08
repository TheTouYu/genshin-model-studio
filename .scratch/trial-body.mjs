
import fs from 'node:fs';
import vm from 'node:vm';
const context = { Math, console, Set, Map };
context.window = context;
vm.createContext(context);
for (const file of ['scripts/parts/lib/ganyu-lib.js','scripts/parts/lib/ganyu-cage-branch.js','scripts/parts/lib/ganyu-seam-check.js']) {
  vm.runInContext(fs.readFileSync(file,'utf8'), context, { filename: file });
}
const { profileLoft } = context;
const { extrudePatch } = context;
const SKIN='#f3c9a7', CLOTH='#d9d9de';
const SIDES = 8;
const path = [0.80,0.90,1.02,1.16,1.26,1.32,1.44,1.60].map(y=>[0,y,0]);
const profiles = [
  [0.125,0.085,0.100],[0.150,0.100,0.120],[0.120,0.082,0.082],[0.165,0.135,0.100],
  [0.180,0.105,0.092],[0.055,0.050,0.048],[0.085,0.085,0.098],[0.020,0.020,0.025]
];
const sections = profiles.map(p=>({rx:p[0],ryB:p[1],ryF:p[2]}));
const colorFn = (i)=> i<4 ? CLOTH : SKIN;
const mesh = profileLoft(path, sections, path.length-1, SIDES, colorFn, { dataOnly:true, cap:'both', up:[0,0,1] });
const ri = mesh.ringIdx;
function blockVerts(rings, angles){ const out=[]; for(const r of rings) for(const a of angles) out.push(ri[r]+a); return out; }
// limbs
function armRings(s){ return [
  {c:[s*0.184,1.240,0.00], dir:[s*1,-0.05,0], ru:0.056, rv:0.058, mix:0.55},
  {c:[s*0.235,1.000,0.00], dir:[s*0.35,-0.94,0], ru:0.042, rv:0.036, mix:1},
  {c:[s*0.260,0.720,0.012], dir:[s*0.05,-0.999,0], ru:0.020, rv:0.040, exp:0.8, mix:1}
];}
function legRings(s){ return [
  {c:[s*0.100,0.775,0.00], ru:0.090, rv:0.078, radial:true},
  {c:[s*0.102,0.50,0.005], ru:0.056, rv:0.048},
  {c:[s*0.100,0.045,0.10], ru:0.030, rv:0.038, bend:-1.25}
];}
// right arm (+X) and left arm (-X)
const armPatchR = blockVerts([3,4],[7,0,1]);
const armPatchL = blockVerts([3,4],[3,4,5]);
const armRB = extrudePatch(mesh, armPatchR, armRings(+1), {axis:[0,-1,0],color:SKIN, cap:true});
const armLB = extrudePatch(mesh, armPatchL, armRings(-1), {axis:[0,-1,0],color:SKIN, cap:true});
// mirror left arm to exact mirror of right arm
function mirrorBranch(left, right, hasCap){
  const map = right.loop.map(id=>{ const p=mesh.vertices[id]; let best=0,d=Infinity; left.loop.forEach((lid,j)=>{ const q=mesh.vertices[lid]; const dd=Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2]); if(dd<d){best=j;d=dd;} }); if(d>1e-7) throw new Error('Non-mirrored source boundary d='+d); return best; });
  mesh.vertices[right.loop[0]]; // no-op
  for (let k=1;k<right.rings.length;k++) right.rings[k].forEach((id,j)=>{ const q=mesh.vertices[left.rings[k][map[j]]]; mesh.vertices[id]=[-q[0],q[1],q[2]]; });
  if (hasCap!==false){ const li=left.rings[left.rings.length-1], rii=right.rings[right.rings.length-1]; const q=mesh.vertices[Math.max(...li)+1]; mesh.vertices[Math.max(...rii)+1]=[-q[0],q[1],q[2]]; }
}
mirrorBranch(armRB, armLB, true);
// legs
const capIndex = SIDES * ri.length; const legPatchR = blockVerts([0,1],[7,0,1]).concat([capIndex]);
const legPatchL = blockVerts([0,1],[3,4,5]).concat([capIndex]);
const legRB = extrudePatch(mesh, legPatchR, legRings(+1), {axis:[0,-1,0],color:SKIN, cap:true});
const legLB = extrudePatch(mesh, legPatchL, legRings(-1), {axis:[0,-1,0],color:SKIN, cap:true});
mirrorBranch(legRB, legLB, true);
const seam = context.seamCheck(mesh);
console.log('vertices', mesh.vertices.length, 'tris', mesh.faces.length/3);
console.log('seam', JSON.stringify({components:seam.components,openEdges:seam.openEdges,nonManifoldEdges:seam.nonManifoldEdges,seamEdges:seam.seamEdges,onePiece:seam.onePiece,watertight:seam.watertight}));
console.log('colors len', mesh.colors.length, 'faces/3', mesh.faces.length/3);
const { verifyMesh } = await import('/home/h/genshin-model-studio/dist/src/mesh/verify.js');
const gate = verifyMesh(mesh, { budget: { requested: 300, used: mesh.faces.length/3 } });
console.log('gate', JSON.stringify({ok:gate.ok, t:gate.checkedFaces, wt:gate.checks.watertight, seams:gate.checks.seams, normals:gate.checks.normals.invertedCount, deg:gate.checks.degenerate.count, skinny:gate.checks.skinny.count, skpct:gate.checks.skinny.pct, areaRatio:gate.checks.areaRatio.value, selfInt:gate.checks.selfIntersections.intersectingPairs}));
console.log('failures', JSON.stringify(gate.failures,null,1));
const ys=mesh.vertices.map(p=>p[1]); const xs=mesh.vertices.map(p=>p[0]); const zs=mesh.vertices.map(p=>p[2]);

if (gate.checks.selfIntersections.samplePairs.length){
  console.log('SELFINT SAMPLES:', JSON.stringify(gate.checks.selfIntersections.samplePairs,null,1));
}
console.log('height', (Math.max(...ys)-Math.min(...ys)).toFixed(3), 'xrange', Math.max(...xs).toFixed(3), Math.min(...xs).toFixed(3), 'zrange', Math.max(...zs).toFixed(3), Math.min(...zs).toFixed(3));
