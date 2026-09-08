/** diag-retarget.mjs — quantify twist/sole errors of the CURRENT retarget alignment. */
import fs from 'node:fs';
import path from 'node:path';
import { parseASF, parseAMC, computeBindPose, computeFrames, computeScale, computeTargetRestDirections, mirrorQuat, mirrorVec } from '../scripts/parts/lib/cmu-motion.mjs';
import { Quaternion, Vector3, Matrix4 } from 'three';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'delivery/mocap-source/cmu-02');
const sk = parseASF(fs.readFileSync(path.join(SRC, '02.asf'), 'utf8'));
console.log('root.orientation =', sk.root.orientation, 'axis =', sk.root.axis, 'position =', sk.root.position);
const bind = computeBindPose(sk);
// verify bind worldQ ~ identity for all bones
let maxDev = 0;
for (const [n, q] of bind.quat) { const e = new Quaternion(); maxDev = Math.max(maxDev, q.angleTo(e)); }
console.log('max bind worldQ angle to identity =', (maxDev * 180 / Math.PI).toFixed(4), 'deg');

const rig = JSON.parse(fs.readFileSync(path.join(ROOT, 'delivery/motion-regression-v2/rig.json'), 'utf8'));
const mesh = JSON.parse(fs.readFileSync(path.join(ROOT, 'delivery/body-blockout-r1/mesh.json'), 'utf8'));
const controls = JSON.parse(fs.readFileSync(path.join(ROOT, 'delivery/body-blockout-r1/controls.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(SRC, 'retarget-plan.json'), 'utf8'));
const restDirs = computeTargetRestDirections(mesh, controls.regions, rig);

// mesh sanity: foot region min y (sole), vertex count
const footIds = [...controls.regions.footL];
let minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
for (const i of footIds) { const v = mesh.vertices[i]; minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]); minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]); }
console.log('mesh footL region: n =', footIds.length, 'y in [', minY.toFixed(4), ',', maxY.toFixed(4), '] z in [', minZ.toFixed(4), ',', maxZ.toFixed(4), ']');
console.log('mesh vertices =', mesh.vertices.length, 'faces =', mesh.faces.length / 3);
const mapping = plan.mapping;
console.log('mapping =', JSON.stringify(mapping, null, 0));

// anatomical secondary axes (target frame + source bone-local==rest world)
const SECONDARY = {
  ankleL: [0, -1, 0], ankleR: [0, -1, 0],   // sole down
  wristL: null, wristR: null,               // filled below from mesh palm normal
  neck: [0, 0, 1], spine: [0, 0, 1], root: [0, 0, 1],
  shoulderL: [0, 0, 1], shoulderR: [0, 0, 1], elbowL: [0, 0, 1], elbowR: [0, 0, 1],
  hipL: [0, 0, 1], hipR: [0, 0, 1], kneeL: [0, 0, 1], kneeR: [0, 0, 1],
};
// palm normal from mesh (wrist -> palm plane): use palm centroid - wrist pivot, cross with finger dir... simple: down axis of hand
{
  const palmC = ids => ids.reduce((p, i) => p.add(new Vector3(...mesh.vertices[i])), new Vector3()).multiplyScalar(1 / ids.length);
  const pcL = palmC(controls.regions.palmL), pcR = palmC(controls.regions.palmR);
  const wL = new Vector3(...rig.joints.find(j => j.id === 'wristL').pivot);
  const wR = new Vector3(...rig.joints.find(j => j.id === 'wristR').pivot);
  console.log('palmL centroid', pcL.toArray().map(v => v.toFixed(3)), 'wristL pivot', wL.toArray());
  console.log('palmR centroid', pcR.toArray().map(v => v.toFixed(3)), 'wristR pivot', wR.toArray());
}

// per-joint current A_j + secondary error
console.log('\n=== CURRENT single-vector alignment A_j: constant secondary-axis error at rest ===');
const A = new Map();
for (const j of rig.joints) {
  const id = j.id;
  if (id === 'root') { A.set(id, new Quaternion()); continue; }
  const group = mapping[id];
  const sName = group ? group[group.length - 1].toLowerCase() : null;
  const u_t = new Vector3(...restDirs.get(id));
  const u_s = mirrorVec(sName ? sk.boneByName.get(sName).direction : [0, 1, 0]);
  const a = new Quaternion().setFromUnitVectors(u_t, new Vector3(...u_s).normalize());
  A.set(id, a);
  const sec = SECONDARY[id];
  if (sec && sName) {
    const n_t = new Vector3(...sec);
    // current: Qt(rest)*n_t = A*n_t ; correct: mirror(n_s_local) where n_s_local = bind.quat(sName)^-1 * n_s_world_rest
    const nsLocal = n_t.clone().applyQuaternion(bind.quat.get(sName).clone().invert()); // rest world == target frame axes (+Y up +Z fwd? source world +Y up +Z fwd yes)
    const nCorrect = nsLocal.applyQuaternion(mirrorQuat(bind.quat.get(sName))); // = mirror(rest world dir of that local axis)
    const nNow = n_t.clone().applyQuaternion(a);
    const ang = nNow.angleTo(nCorrect) * 180 / Math.PI;
    console.log(id.padEnd(10), '<-', sName.padEnd(10), 'u_t=[' + u_t.toArray().map(v => v.toFixed(3)).join(',') + '] u_s=[' + u_s.map(v => v.toFixed(3)).join(',') + '] secondary err = ' + ang.toFixed(2) + 'deg');
  }
}

// dynamic check over walk: source foot sole world dir vs current-retarget target sole dir
const amc = parseAMC(fs.readFileSync(path.join(SRC, '02_01.amc'), 'utf8'), sk);
const frames = computeFrames(sk, amc);
const v3 = a => new Vector3(...a);
console.log('\n=== walk (02_01) foot dynamics: sole-normal angle error (current retarget) & source foot pitch ===');
// source sole local = bind-local (0,-1,0) for lfoot; target sole rest = (0,-1,0)
const lfootBindQ = bind.quat.get('lfoot');
const soleLocalS = new Vector3(0, -1, 0).applyQuaternion(lfootBindQ.clone().invert());
const aAnkL = A.get('ankleL');
let maxSoleErr = 0, sumSoleErr = 0, n = 0;
const rows = [];
for (let f = 0; f < frames.length; f += 12) {
  const sf = frames[f].pose;
  const delta = sf.quat.get('lfoot').clone().multiply(lfootBindQ.clone().invert());
  const Qt = mirrorQuat(delta).multiply(aAnkL);
  const tgtSole = new Vector3(0, -1, 0).applyQuaternion(Qt);
  const srcSoleM = soleLocalS.clone().applyQuaternion(sf.quat.get('lfoot')); // world
  const srcSoleMirror = new Vector3(-srcSoleM.x, srcSoleM.y, srcSoleM.z);
  const err = tgtSole.angleTo(srcSoleMirror) * 180 / Math.PI;
  // source foot pitch: angle of foot dir vs horizontal
  const footDir = v3(sk.boneByName.get('lfoot').direction).applyQuaternion(sf.quat.get('lfoot'));
  const pitch = Math.atan2(footDir.y, Math.hypot(footDir.x, footDir.z)) * 180 / Math.PI;
  maxSoleErr = Math.max(maxSoleErr, err); sumSoleErr += err; n++;
  if (f % 60 === 0) rows.push({ f, err: err.toFixed(2), srcPitch: pitch.toFixed(1), srcToeY: null });
}
console.log('sole-normal error vs source: max =', maxSoleErr.toFixed(2), 'deg, mean =', (sumSoleErr / n).toFixed(2), 'deg, frames sampled =', n);

// root/ground: source root->ankle vertical at frame0 vs target geometry
const scale = computeScale(sk, rig, bind);
console.log('\nscale =', scale.toFixed(6));
{
  const sf = frames[0].pose;
  const rk = sf.head.get('root');
  const ank = sf.head.get('lfoot');
  console.log('frame0 src root y =', rk.y.toFixed(2), 'src lfoot(ankle) head y =', ank.y.toFixed(2), 'delta =', (rk.y - ank.y).toFixed(2), 'scaled =', ((rk.y - ank.y) * scale).toFixed(4));
  // target rig: root pivot y 0.8, ankle rest y 0.12 -> delta 0.68
  console.log('target root->ankle vertical =', (0.8 - 0.12).toFixed(4));
  // source hipjoint bone length
  const hj = sk.boneByName.get('lhipjoint');
  console.log('lhipjoint dir', hj.direction, 'len', hj.length.toFixed(3), 'scaled len', (hj.length * scale).toFixed(4));
}
// source lfoot bone direction & length
const lf = sk.boneByName.get('lfoot');
console.log('\nlfoot raw direction =', lf.direction, 'length =', lf.length.toFixed(3), 'scaled len =', (lf.length * scale).toFixed(4), 'm');
const lt = sk.boneByName.get('ltoes');
console.log('ltoes raw direction =', lt.direction, 'length =', lt.length.toFixed(3), 'scaled len =', (lt.length * scale).toFixed(4), 'm');
console.log('\nu_t ankleL =', restDirs.get('ankleL'), ' ankleR =', restDirs.get('ankleR'));
console.log('u_t wristL =', restDirs.get('wristL'), ' neck =', restDirs.get('neck'), ' spine =', restDirs.get('spine'));
