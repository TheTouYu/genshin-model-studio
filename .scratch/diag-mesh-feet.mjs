/** diag-mesh-feet.mjs — inspect blockout mesh feet/legs + measure current-retarget ground contact. */
import fs from 'node:fs';
import path from 'node:path';
import { parseASF, parseAMC, computeBindPose, computeFrames, computeScale, computeTargetRestDirections, mirrorQuat, mirrorVec } from '../scripts/parts/lib/cmu-motion.mjs';
import { Quaternion, Vector3, Matrix4 } from 'three';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'delivery/mocap-source/cmu-02');
const mesh = JSON.parse(fs.readFileSync(path.join(ROOT, 'delivery/body-blockout-r1/mesh.json'), 'utf8'));
const controls = JSON.parse(fs.readFileSync(path.join(ROOT, 'delivery/body-blockout-r1/controls.json'), 'utf8'));
const rig = JSON.parse(fs.readFileSync(path.join(ROOT, 'delivery/motion-regression-v2/rig.json'), 'utf8'));
console.log('regions:', Object.keys(controls.regions).join(', '));
// all vertices y<0.3 (feet + lower legs)
console.log('\nvertices with y < 0.30:');
mesh.vertices.forEach((v, i) => { if (v[1] < 0.30) console.log(String(i).padStart(3), v.map(x => x.toFixed(4)).join(', ')); });
// palm region vertices
console.log('\npalmL vertices:');
controls.regions.palmL.forEach(i => console.log(String(i).padStart(3), mesh.vertices[i].map(x => x.toFixed(4)).join(', ')));
console.log('\nhead/crown/jaw counts:', controls.regions.head.length, controls.regions.crown.length, controls.regions.jaw.length);

//ASF thumbs
const sk = parseASF(fs.readFileSync(path.join(SRC, '02.asf'), 'utf8'));
for (const n of ['lthumb', 'lhand', 'lwrist', 'lfingers', 'lradius']) {
  const b = sk.boneByName.get(n);
  console.log(n.padEnd(9), 'dir', b.direction.map(x => x.toFixed(3)).join(','), 'len', b.length.toFixed(2), 'axis', b.axis, b.axisOrder, 'dof', b.dof.join(' '));
}

// ---- current-retarget ground contact measurement (replicating runtime skinning) ----
const bind = computeBindPose(sk);
const scale = computeScale(sk, rig, bind);
const plan = JSON.parse(fs.readFileSync(path.join(SRC, 'retarget-plan.json'), 'utf8'));
const restDirs = computeTargetRestDirections(mesh, controls.regions, rig);
const mapping = plan.mapping;
const amc = parseAMC(fs.readFileSync(path.join(SRC, '02_01.amc'), 'utf8'), sk);
const frames = computeFrames(sk, amc);

// build A_j as converter does
const A = new Map();
for (const j of rig.joints) {
  if (j.id === 'root') { A.set(j.id, new Quaternion()); continue; }
  const group = mapping[j.id];
  if (!group) { A.set(j.id, new Quaternion()); continue; }
  const sName = group[group.length - 1].toLowerCase();
  const u_t = new Vector3(...restDirs.get(j.id));
  const u_s = new Vector3(...mirrorVec(sk.boneByName.get(sName).direction)).normalize();
  A.set(j.id, new Quaternion().setFromUnitVectors(u_t, u_s));
}
const parentOf = new Map(rig.joints.map(j => [j.id, j.parent]));
const order = rig.joints.map(j => j.id);
const vJ = rig.vertexJoint;

function pose(f) {
  const sf = frames[f].pose;
  const Qt = new Map();
  for (const id of order) {
    let delta;
    if (id === 'root') delta = sf.quat.get('root').clone().multiply(bind.quat.get('root').clone().invert());
    else { const group = mapping[id]; const rep = group[group.length - 1].toLowerCase(); delta = sf.quat.get(rep).clone().multiply(bind.quat.get(rep).clone().invert()); }
    Qt.set(id, mirrorQuat(delta).multiply(A.get(id)));
  }
  const local = new Map();
  for (const id of order) {
    const p = parentOf.get(id);
    local.set(id, p ? Qt.get(p).clone().invert().multiply(Qt.get(id)) : Qt.get(id));
  }
  // world joint positions
  const pos = new Map(); const wq = new Map();
  const srcRoot0 = frames[0].pose.head.get('root');
  const rp = new Vector3(...frames[f].pose.head.get('root').toArray()).sub(srcRoot0).multiplyScalar(scale);
  const rootP = new Vector3(0, 0.8, 0).add(new Vector3(...mirrorVec(rp.toArray())));
  for (const id of order) {
    const j = rig.joints.find(x => x.id === id);
    if (!parentOf.get(id)) { pos.set(id, rootP.clone()); wq.set(id, local.get(id).clone()); }
    else {
      const pp = pos.get(parentOf.get(id)), pq = wq.get(parentOf.get(id));
      const off = new Vector3(j.pivot[0] - rig.joints.find(x => x.id === parentOf.get(id)).pivot[0], j.pivot[1] - rig.joints.find(x => x.id === parentOf.get(id)).pivot[1], j.pivot[2] - rig.joints.find(x => x.id === parentOf.get(id)).pivot[2]).applyQuaternion(pq);
      pos.set(id, pp.clone().add(off)); wq.set(id, pq.clone().multiply(local.get(id)));
    }
  }
  // skin
  const out = mesh.vertices.map((p, i) => {
    const j = vJ[i];
    const m = new Matrix4().compose(pos.get(order[j]), wq.get(order[j]), new Vector3(1, 1, 1));
    const inv = new Matrix4().compose(new Vector3(...rig.joints[j].pivot), new Quaternion(), new Vector3(1, 1, 1)).invert();
    return new Vector3(...p).applyMatrix4(m.multiply(inv));
  });
  return { pos, wq, out };
}

let gMin = 1e9, gMax = -1e9;
const rows = [];
for (let f = 0; f < frames.length; f += 6) {
  const { out } = pose(f);
  let minFoot = 1e9;
  for (let i = 0; i < out.length; i++) if (vJ[i] === 8 || vJ[i] === 14) minFoot = Math.min(minFoot, out[i].y);
  gMin = Math.min(gMin, minFoot); gMax = Math.max(gMax, minFoot);
  if (f % 30 === 0) rows.push('f' + String(f).padStart(4) + ' minFootY=' + minFoot.toFixed(4));
}
console.log('\n=== current retarget walk foot min Y ===');
console.log(rows.join('\n'));
console.log('global min foot Y =', gMin.toFixed(4), 'max of per-frame min =', gMax.toFixed(4));
