import fs from 'node:fs';
import vm from 'node:vm';
import { verifyMesh } from '../dist/src/mesh/verify.js';

const context = { Math, console };
context.window = context;
vm.createContext(context);
for (const file of ['lib/ganyu-lib.js', 'lib/ganyu-cage-branch.js', 'lib/ganyu-seam-check.js', 'ganyu-body-cage.js']) {
  vm.runInContext(fs.readFileSync('scripts/parts/' + file, 'utf8'), context, { filename: file });
}
const body = context.__BODY_CAGE__;
const mesh = body.mesh;
const branches = body.branches;
const v = mesh.vertices;
const ringIdx = mesh.ringIdx;
const sides = 16;
const trunkRings = ringIdx.length;
const vtag = new Array(v.length).fill(null);
for (let r = 0; r < trunkRings; r++) for (let j = 0; j < sides; j++) vtag[ringIdx[r]+j] = 'trunkR'+r;
for (let i=0;i<v.length;i++){ if(vtag[i]===null && v[i][1] < 0.9) vtag[i]='trunkCap'; if(vtag[i]===null && v[i][1] > 1.5) vtag[i]='trunkCap'; }
for (const key of Object.keys(branches)) {
  const br = branches[key];
  br.rings.forEach((ring, k) => { ring.forEach(id => { vtag[id] = key+'R'+k; }); });
}
const res = verifyMesh(mesh, { maxSamples: 100000 });
console.log('intersectingPairs =', res.checks.selfIntersections.intersectingPairs);
console.log('samplePairs len =', res.checks.selfIntersections.samplePairs.length);
const pairs = res.checks.selfIntersections.samplePairs;
const byPart = {};
for (const p of pairs) {
  const ta = vtag[mesh.faces[p.faceA*3]], tb = vtag[mesh.faces[p.faceB*3]];
  const key = (ta||'?') + ' <-> ' + (tb||'?');
  byPart[key] = (byPart[key]||0)+1;
}
console.log('\n=== by face-part tag ===');
Object.entries(byPart).sort((a,b)=>b[1]-a[1]).forEach(([k,n])=>console.log(n, k));
console.log('\n=== pairs: faceA[tag] posA | faceB[tag] posB ===');
for (const p of pairs) {
  const ta = vtag[mesh.faces[p.faceA*3]], tb = vtag[mesh.faces[p.faceB*3]];
  console.log('#'+p.faceA+' ['+ta+'] '+p.positionA.map(x=>x.toFixed(3)).join(',')+'  |  #'+p.faceB+' ['+tb+'] '+p.positionB.map(x=>x.toFixed(3)).join(','));
}
fs.writeFileSync('delivery/r0-toes/analysis.json', JSON.stringify({vtag, pairs}, null, 1));
