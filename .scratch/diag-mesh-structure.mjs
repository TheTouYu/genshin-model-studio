/** diag-mesh-structure.mjs — full region/joint/adjacency map of blockout r1. */
import fs from 'node:fs';
const ROOT = process.cwd();
const mesh = JSON.parse(fs.readFileSync(ROOT + '/delivery/body-blockout-r1/mesh.json', 'utf8'));
const controls = JSON.parse(fs.readFileSync(ROOT + '/delivery/body-blockout-r1/controls.json', 'utf8'));
const rig = JSON.parse(fs.readFileSync(ROOT + '/delivery/motion-regression-v2/rig.json', 'utf8'));
const jointName = ['root','spine','neck','shoulderL','elbowL','wristL','hipL','kneeL','ankleL','shoulderR','elbowR','wristR','hipR','kneeR','ankleR'];

// region -> joint index consistency
const regionVerts = new Map();
for (const [r, ids] of Object.entries(controls.regions)) { regionVerts.set(r, ids); }
let mismatch = 0;
for (const [r, ids] of regionVerts) {
  const joints = new Set(ids.map(i => rig.vertexJoint[i]));
  if (joints.size !== 1) { console.log('region', r, 'spans joints', [...joints].map(j => jointName[j])); mismatch++; }
}
console.log('regions with mixed joints:', mismatch);
console.log('\nregion -> joint -> vertices:');
for (const [r, ids] of regionVerts) {
  const j = jointName[rig.vertexJoint[ids[0]]];
  const ys = ids.map(i => mesh.vertices[i][1]);
  console.log(r.padEnd(10), '->', j.padEnd(9), 'n=' + String(ids.length).padStart(2), 'y[', Math.min(...ys).toFixed(3), ',', Math.max(...ys).toFixed(3), ']', 'ids:', ids.join(','));
}
// structural angles: ankle->toe-centroid, ankle->plate-centroid, wrist->palm
const V = i => mesh.vertices[i];
const centroid = ids => { const s = [0,0,0]; ids.forEach(i => { for (let k=0;k<3;k++) s[k]+=V(i)[k]; }); return s.map(v => v/ids.length); };
const norm = v => { const l = Math.hypot(...v); return v.map(x => x/l); };
const angle = (a,b) => Math.acos(Math.max(-1, Math.min(1, a[0]*b[0]+a[1]*b[1]+a[2]*b[2]))) * 180/Math.PI;
const ankleL = rig.joints.find(j=>j.id==='ankleL').pivot;
const plateL = controls.regions.footL;
const toeL = plateL.filter(i => V(i)[2] >= 0.10);
const heelL = plateL.filter(i => V(i)[2] < 0.10);
console.log('\nfootL plate verts:', plateL.map(i=>V(i).join(',')).join(' | '));
console.log('toe verts:', toeL.length, 'heel verts:', heelL.length);
const cToe = centroid(toeL), cPlate = centroid(plateL);
console.log('ankleL pivot', ankleL, 'toeCentroid', cToe.map(v=>v.toFixed(3)), 'plateCentroid', cPlate.map(v=>v.toFixed(3)));
console.log('dir ankle->toeCentroid  ', norm([cToe[0]-ankleL[0], cToe[1]-ankleL[1], cToe[2]-ankleL[2]]).map(v=>v.toFixed(3)), 'pitch', Math.atan2(cToe[1]-ankleL[1], cToe[2]-ankleL[2]).toFixed(1)*180/Math.PI, 'deg');
console.log('dir ankle->plateCentroid', norm([cPlate[0]-ankleL[0], cPlate[1]-ankleL[1], cPlate[2]-ankleL[2]]).map(v=>v.toFixed(3)));
// source foot dir for comparison (hardcode from earlier): (0.0887,-0.2437,0.9658) pitch -14.1deg, source angle(u,n)=75.9
const srcU = [0.0886837, -0.243657, 0.965798];
const srcAngle = angle(srcU, [0,-1,0]);
console.log('source lfoot angle(u,sole) =', srcAngle.toFixed(1), 'deg');
for (const [nm, c] of [['toeCentroid', cToe], ['plateCentroid', cPlate]]) {
  const u = norm([c[0]-ankleL[0], c[1]-ankleL[1], c[2]-ankleL[2]]);
  console.log('r1 ' + nm + ': angle(u,sole)=', angle(u,[0,-1,0]).toFixed(1), '-> structural residual vs source =', Math.abs(angle(u,[0,-1,0]) - srcAngle).toFixed(1), 'deg');
}
// candidate: plate raised to 0.075
for (const plateY of [0.055, 0.065, 0.075, 0.085]) {
  const cToe2 = [cToe[0], plateY, cToe[2]];
  const u2 = norm([0, plateY - ankleL[1], cToe[2] - ankleL[2]]);
  console.log('candidate plateY=' + plateY, ': angle(u,sole)=', angle(u2,[0,-1,0]).toFixed(1), 'residual', Math.abs(angle(u2,[0,-1,0]) - srcAngle).toFixed(1), 'deg; ankle->sole', (ankleL[1]-plateY).toFixed(3), 'm');
}
// wrist structural
const wristL = rig.joints.find(j=>j.id==='wristL').pivot;
const cPalm = centroid(controls.regions.palmL);
const uW = norm([cPalm[0]-wristL[0], cPalm[1]-wristL[1], cPalm[2]-wristL[2]]);
console.log('\nwristL->palmCentroid dir', uW.map(v=>v.toFixed(3)), 'angle(u, down)=', angle(uW,[0,-1,0]).toFixed(1), 'deg');
console.log('palm plate normal is +-Y (horizontal plate); source T-pose hand: palm-down, angle(u_s, palm_n)=90deg');
// candidate palm: vertical plate (normal +X inward): plane contains u=(0,-1,0) and z
// vertices currently: x in [-0.348,-0.272], y=0.670, z in [-0.018,0.018]
// candidate: keep x center -0.31, y span becomes [0.63, 0.71]? along arm dir: down-out
console.log('\nfull vertex list (y desc) with region+joint:');
const regionOf = new Map(); for (const [r, ids] of Object.entries(controls.regions)) ids.forEach(i => regionOf.set(i, r));
mesh.vertices.forEach((v, i) => {
  if (i % 1 === 0) {
    const r = regionOf.get(i) || '?';
    console.log(String(i).padStart(3), jointName[rig.vertexJoint[i]].padEnd(9), (r+'').padEnd(10), v.map(x => x.toFixed(4)).join(', '));
  }
});
