import fs from 'node:fs'; import vm from 'node:vm';
const c={Math,console}; c.window=c; vm.createContext(c);
for(const f of ['lib/ganyu-lib.js','lib/ganyu-cage-branch.js','lib/ganyu-seam-check.js','ganyu-body-cage.js']) vm.runInContext(fs.readFileSync('scripts/parts/'+f,'utf8'), c, {filename:f});
const body=c.__BODY_CAGE__; const v=body.mesh.vertices; const f=body.mesh.faces;
const P=body.branches.palmL;
// band quad j = {ring2[j],ring2[j+1],ring3[j+1],ring3[j]}
const r2=P.rings[2], r3=P.rings[3];
// helper: grow a finger from band quad j along dir
function growFinger(j, len, r0, r1, dir, color, nmix){
  const block=[r2[j], r2[(j+1)%8], r3[(j+1)%8], r3[j]];
  // block centroid
  let cx=0,cy=0,cz=0; block.forEach(id=>{cx+=v[id][0];cy+=v[id][1];cz+=v[id][2];}); cx/=4;cy/=4;cz/=4;
  const rings=[];
  const n=3;
  rings.push({c:[cx-dir[0]*len*0.33, cy+dir[1]*len*0.33, cz+dir[2]*len*0.33], ru:r0, rv:r0, mix:0.5});
  rings.push({c:[cx-dir[0]*len*0.66, cy+dir[1]*len*0.66, cz+dir[2]*len*0.66], ru:(r0+r1)/2, rv:(r0+r1)/2, mix:1});
  rings.push({c:[cx-dir[0]*len, cy+dir[1]*len, cz+dir[2]*len], ru:r1, rv:r1, mix:1});
  const res=c.extrudePatch(body.mesh, block, rings, {axis:dir, color:color});
  return res;
}
// Test: grow a crude middle finger from quad j=3 (X~0.27)
try {
  const res = growFinger(3, 0.08, 0.0075, 0.0055, [0,-1,0], '#f3c9a7');
  console.log('finger grown from quad3, B='+res.B+' rings='+res.rings.length);
  const seam=c.seamCheck(body.mesh);
  console.log('after 1 finger: open='+seam.openEdges+' nonmanifold='+seam.nonManifoldEdges+' seams='+seam.seamEdges+' components='+seam.components+' onePiece='+seam.onePiece+' watertight='+seam.watertight);
  console.log('verts='+body.mesh.vertices.length+' faces='+body.mesh.faces.length/3);
} catch(e){ console.log('THREW: '+e.message); }
