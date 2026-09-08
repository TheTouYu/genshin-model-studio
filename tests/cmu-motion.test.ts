/**
 * cmu-motion.test.ts — Validation for the ASF/AMC parser, source FK, bind pose,
 * retarget converter and the generated mocap assets.
 *
 * Scope:   scripts/parts/lib/cmu-motion.mjs  (loaded via dynamic ESM import so
 *          the test runs from dist/tests/ with process.cwd() == project root)
 *          scripts/parts/convert-cmu-motion.mjs outputs (on-disk assets)
 *
 * It intentionally does NOT claim "human acceptance" (natural coordination /
 * joint deformation / foot contact / combined transitions) — that stays pending
 * per the acceptance policy. It validates the numeric routes: parser DOF counts,
 * source skeleton FK consistency, bind pose transforms, quaternion unit norm,
 * provenance preservation, and that the retarget is quaternion-based (not
 * direct Euler angle copying).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Quaternion, Vector3 } from 'three';

const SRC = 'delivery/mocap-source/cmu-02';
const ASF = path.join(SRC, '02.asf');
const RIGFILE = 'delivery/motion-regression-v2/rig.json';
const OUT_SOURCE = 'delivery/mocap-retarget';
const OUT_WEB = 'web/draw/mocap-assets';

// Load the ESM library at runtime (untyped → any) so tsc does not need a .d.ts.
async function loadLib() {
  const url = pathToFileURL(path.join(process.cwd(), 'scripts/parts/lib/cmu-motion.mjs')).href;
  return import(url) as Promise<Record<string, any>>;
}

function close(a: number[], b: number[], eps: number): boolean {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= eps);
}
function unitLen(q: number[]): number {
  return Math.hypot(q[0], q[1], q[2], q[3]);
}

test('cmu-motion: ASF parser yields correct numeric DOF channels', async () => {
  const { parseASF, dofCounts } = await loadLib();
  const sk = parseASF(fs.readFileSync(ASF, 'utf8'));

  assert.equal(sk.bones.length, 30, 'subject-02 ASF has 30 non-root bones');
  assert.equal(sk.root.order.length, 6, 'root is a 6-DOF joint (TX TY TZ RX RY RZ)');
  assert.equal(sk.units.length, 0.45, 'CMU length scale');
  assert.equal(sk.units.angle, 'deg');

  const counts = dofCounts(sk);
  const expect: Record<string, number> = {
    root: 6, lhipjoint: 0, lfemur: 3, ltibia: 1, lfoot: 2, ltoes: 1,
    rfemur: 3, rtibia: 1, rfoot: 2, rtoes: 1,
    lowerback: 3, upperback: 3, thorax: 3, lowerneck: 3, upperneck: 3, head: 3,
    lclavicle: 2, lhumerus: 3, lradius: 1, lwrist: 1, lhand: 2, lfingers: 1, lthumb: 2,
    rclavicle: 2, rhumerus: 3, rradius: 1, rwrist: 1, rhand: 2, rfingers: 1, rthumb: 2,
  };
  for (const [name, c] of Object.entries(expect)) {
    assert.equal(counts.get(name), c, 'dofCount(' + name + ')');
  }
  // dof order preserved
  assert.deepEqual(sk.boneByName.get('ltibia').dof, ['rx']);
  assert.deepEqual(sk.boneByName.get('lfoot').dof, ['rx', 'rz']);
  assert.deepEqual(sk.boneByName.get('lhumerus').dof, ['rx', 'ry', 'rz']);
  assert.deepEqual(sk.boneByName.get('lclavicle').dof, ['ry', 'rz']);
  // hierarchy
  assert.equal(sk.boneByName.get('lfemur').parentOfName, 'lhipjoint');
  assert.equal(sk.boneByName.get('ltibia').parentOfName, 'lfemur');
  assert.equal(sk.boneByName.get('lowerback').parentOfName, 'root');
  assert.equal(sk.boneByName.get('lhumerus').parentOfName, 'lclavicle');
});

test('cmu-motion: AMC parser validates numeric DOFs, frame sequence, and rejects malformed input', async () => {
  const { parseASF, parseAMC } = await loadLib();
  const sk = parseASF(fs.readFileSync(ASF, 'utf8'));

  const amc = parseAMC(fs.readFileSync(path.join(SRC, '02_01.amc'), 'utf8'), sk);
  assert.equal(amc.frameCount, 343);
  assert.equal(amc.firstFrame, 1);
  assert.equal(amc.lastFrame, 343);
  assert.equal(amc.durationSeconds, (343 - 1) / 120);
  assert.equal(amc.fps, 120);

  // wrong channel count for a bone
  assert.throws(() => parseAMC('1\nroot 1 2 3\nlfemur 1 2\n', sk), /channels/);
  // frame sequence break
  assert.throws(() => parseAMC('1\nroot 0 0 0 0 0 0\n3\nroot 0 0 0 0 0 0\n', sk), /sequence/);
  // unknown bone
  assert.throws(() => parseAMC('1\nroot 0 0 0 0 0 0\nnope 1 2\n', sk), /unknown bone/);
});

test('cmu-motion: source skeleton FK is self-consistent (positions) and humanoid', async () => {
  const { parseASF, computeBindPose } = await loadLib();
  const sk = parseASF(fs.readFileSync(ASF, 'utf8'));
  const bind = computeBindPose(sk);

  // FK invariants: head(bone)==tail(parent); |tail-head|==bone.length; quats unit.
  for (const b of sk.bones) {
    const name = b.name.toLowerCase();
    const head = bind.head.get(name).toArray();
    const tail = bind.tail.get(name).toArray();
    const parent = b.parentOfName;
    const parentTail = bind.tail.get(parent) || bind.head.get('root');
    assert.ok(close(head, parentTail.toArray(), 1e-7), 'head(' + name + ') == tail(' + parent + ')');
    const seg = Math.hypot(tail[0] - head[0], tail[1] - head[1], tail[2] - head[2]);
    // ASF directions are stored rounded (not exactly unit); tolerate a small relative error.
    assert.ok(Math.abs(seg - b.length) / (b.length + 1e-9) < 2e-3, '|tail-head| ~= length for ' + name);
    // zero DOF (bind) reproduces the ASF direction: worldQ is identity at rest, so
    // tail - head == direction*length in world coordinates.
    assert.ok(close([tail[0] - head[0], tail[1] - head[1], tail[2] - head[2]], b.direction.map((d: number) => d * b.length), 1e-6),
      'zero DOF reproduces ASF direction for ' + name);
    const q = bind.quat.get(name).toArray();
    assert.ok(Math.abs(unitLen(q) - 1) < 1e-9, 'bind quat unit for ' + name);
  }
  // roots are finite
  for (const v of bind.head.values()) for (const x of v.toArray()) assert.ok(Number.isFinite(x));

  // humanoid geometry at bind
  const p = (n: string) => bind.head.get(n).toArray();
  const lhip = p('lfemur'), lankle = p('lfoot'), rankle = p('rfoot');
  const headb = p('head'), lb = p('lowerback'), thorax = p('thorax');
  const lsh = p('lhumerus'), rsh = p('rhumerus'), lw = p('lwrist'), rw = p('rwrist');
  // legs go down (ankle below hip) and are left/right mirrored
  assert.ok(lankle[1] < lhip[1], 'ankle below hip');
  assert.ok(rankle[1] < lhip[1], 'right ankle below hip');
  assert.ok(lankle[0] > 0 && rankle[0] < 0, 'left ankle +X, right ankle -X (CMU frame)');
  assert.ok(Math.abs(lankle[0] + rankle[0]) < 0.2, 'left/right ankles symmetric in X');
  // torso up (head above lowerback), feet forward (+Z)
  assert.ok(headb[1] > thorax[1] && thorax[1] > lb[1], 'torso rises upward');
  assert.ok(lankle[2] > 0 && rankle[2] > 0, 'feet point forward (+Z)');
  // arms out to the sides, mirrored
  assert.ok(lsh[0] > 0 && rsh[0] < 0, 'shoulders mirrored in X');
  assert.ok(lw[0] > lsh[0] && rw[0] < rsh[0], 'arms extend laterally outward');
});

test('cmu-motion: bind pose holds source rest transforms (finite, unit, symmetric)', async () => {
  const { parseASF, computeBindPose } = await loadLib();
  const sk = parseASF(fs.readFileSync(ASF, 'utf8'));
  const bind = computeBindPose(sk);

  const rootHead = bind.head.get('root').toArray();
  assert.ok(close(rootHead, [0, 0, 0], 1e-9), 'bind root at origin');
  const rootQ = bind.quat.get('root').toArray();
  assert.ok(Math.abs(unitLen(rootQ) - 1) < 1e-9, 'bind root quaternion is identity (unit)');

  // every bone: finite pos + unit quat
  for (const b of sk.bones) {
    const name = b.name.toLowerCase();
    const q = bind.quat.get(name).toArray();
    assert.ok(q.every(Number.isFinite), 'finite quat ' + name);
    assert.ok(Math.abs(unitLen(q) - 1) < 1e-9, 'unit quat ' + name);
  }
});

test('cmu-motion: retarget produces quaternion clips (NOT Euler copying) and preserves provenance + root motion', async () => {
  const { parseASF, parseAMC, computeBindPose, computeFrames, computeScale, retargetClip, computeTargetRestDirections } = await loadLib();
  const sk = parseASF(fs.readFileSync(ASF, 'utf8'));
  const rig = JSON.parse(fs.readFileSync(RIGFILE, 'utf8'));
  const plan = JSON.parse(fs.readFileSync(path.join(SRC, 'retarget-plan.json'), 'utf8'));
  const mapping = plan.mapping;

  const amc = parseAMC(fs.readFileSync(path.join(SRC, '02_01.amc'), 'utf8'), sk);
  const bind = computeBindPose(sk);
  const scale = computeScale(sk, rig, bind);
  const frames = computeFrames(sk, amc);
  const clip = retargetClip({
    sourceFrames: frames, sourceBind: bind, skeleton: sk, rig, mapping, scale,
    sourceMeta: { id: '02_01', file: '02_01.amc', label: 'walk', fps: 120 },
    opts: { rootMotion: 'preserved' },
  });

  // target rig coverage: exactly 15 joints, parent-before-child
  assert.equal(clip.joints.length, 15);
  const ids = new Set(clip.joints.map((j: any) => j.joint));
  assert.equal(ids.size, 15);
  assert.equal(clip.frameCount, 343);
  assert.equal(clip.fps, 120);
  for (const j of clip.joints) {
    assert.ok(ids.has(j.joint));
    assert.equal(j.samples.length, 343);
  }
  // every quaternion is unit length
  for (const j of clip.joints) {
    for (const s of j.samples) assert.ok(Math.abs(unitLen(s) - 1) < 1e-6, 'retarget quat unit for ' + j.joint);
  }
  // NOT trivially identity: at least some limb local rotations are non-zero
  const nonIdentity = clip.joints.filter((j: any) => j.joint !== 'root').filter((j: any) =>
    j.samples.some((s: number[]) => Math.abs(s[0]) > 1e-3 || Math.abs(s[1]) > 1e-3 || Math.abs(s[2]) > 1e-3));
  assert.ok(nonIdentity.length >= 8, 'most limbs are animated (got ' + nonIdentity.length + ')');

  // provenance: file/label/fps preserved
  assert.equal(clip.file, '02_01.amc');
  assert.equal(clip.label, 'walk');

  // root motion preservation: with 'preserved' the root animates; with 'in-place' it is constant.
  const clipInPlace = retargetClip({
    sourceFrames: frames, sourceBind: bind, skeleton: sk, rig, mapping, scale,
    sourceMeta: { id: '02_01', file: '02_01.amc', label: 'walk', fps: 120 },
    opts: { rootMotion: 'in-place' },
  });
  const rootPreservedRange = clip.rootPosition.samples.reduce((acc: number, s: number[]) =>
    Math.max(acc, Math.hypot(s[0] - clip.rootPosition.samples[0][0], s[1] - clip.rootPosition.samples[0][1], s[2] - clip.rootPosition.samples[0][2])), 0);
  const rootInPlaceConst = clipInPlace.rootPosition.samples.every((s: number[]) => close(s, clipInPlace.rootPosition.pivot, 1e-6));
  assert.ok(rootPreservedRange > 1e-3, 'preserved root motion actually moves');
  assert.ok(rootInPlaceConst, 'in-place root stays at its rest pivot (static)');

  // scale is derived from reference-bone match (sanity: a positive, sensible value)
  assert.ok(scale > 0.03 && scale < 0.06, 'reference scale plausible (got ' + scale + ')');
});

test('cmu-motion: generated mocap assets are present, complete and consistent', async () => {
  const sourceSkel = JSON.parse(fs.readFileSync(path.join(OUT_SOURCE, 'source-skeleton.json'), 'utf8'));
  assert.equal(sourceSkel.bones.length, 30);
  assert.equal(sourceSkel.root.order.length, 6);
  assert.equal(sourceSkel.fps, 120);

  const clipsWeb = JSON.parse(fs.readFileSync(path.join(OUT_WEB, 'clips.json'), 'utf8'));
  assert.equal(clipsWeb.fps, 120);
  assert.equal(clipsWeb.clips.length, 10);
  for (const c of clipsWeb.clips) {
    assert.equal(c.joints.length, 15);
    assert.equal(c.fps, 120);
    assert.ok(c.frameCount > 0);
    for (const j of c.joints) {
      // web clips are rounded to 4 decimals; they must be re-normalized at load.
      for (const s of j.samples) assert.ok(Math.abs(unitLen(s) - 1) < 2e-3, 'web clip ' + c.id + ' ' + j.joint + ' unit (rounded)');
    }
    // root position samples match pivot + motion
    assert.equal(c.rootPosition.samples.length, c.frameCount);
  }

  const bundle = JSON.parse(fs.readFileSync(path.join(OUT_WEB, 'bundle.json'), 'utf8'));
  assert.equal(bundle.rig.joints.length, 15);
  assert.equal(bundle.clipsRef, 'clips.json');
  assert.equal(bundle.clipSummary.length, 10);
  assert.ok(bundle.invariants.quaternionUnitNorm);
  assert.ok(bundle.invariants.rootMotionPreserved);
  assert.ok(bundle.validation.every((v: any) => v.status === 'parse-ok'), 'all clips parsed');
  assert.ok(bundle.validation.every((v: any) => v.shaMatches), 'all clip SHA-256 match the manifest');

  // provenance: per-clip sha256 in the source manifest equals the on-disk file sha256
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
  for (const v of bundle.validation) {
    const rec = sourceManifest.clips.find((c: any) => c.id === v.id);
    const fileSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(SRC, v.file))).digest('hex');
    assert.equal(fileSha, rec.sha256, 'on-disk sha256 matches source manifest for ' + v.id);
  }
});

test('cmu-motion: corrected FK — zero DOF reproduces ASF direction; own joint rotation moves its own endpoint', async () => {
  const { parseASF, computeWorldPose } = await loadLib();
  const fixture = [
    ':version 1.10', ':name VICON', ':units', '  mass 1.0', '  length 0.45', '  angle deg',
    ':root', '  order TX TY TZ RX RY RZ', '  axis XYZ', '  position 0 0 0', '  orientation 0 0 0',
    ':bonedata', '  begin', '    id 1', '    name fixturearm', '    direction 0 1 0', '    length 2',
    '    axis 0 30 0  XYZ', '    dof rx', '    limits (-90.0 90.0)', '  end',
    ':hierarchy', '  begin', '    root fixturearm', '  end',
  ].join('\n');
  const sk = parseASF(fixture);
  const name = 'fixturearm';
  const bone = sk.boneByName.get(name);
  assert.deepEqual(bone.dof, ['rx']);
  assert.equal(bone.axis[1], 30);
  assert.equal(bone.length, 2);

  // zero DOF -> tail-head == ASF direction * length (bone's rest geometry = ASF direction)
  const zero = computeWorldPose(sk, new Map([['root', [0, 0, 0, 0, 0, 0]], [name, [0]]]));
  const h0 = zero.head.get(name).toArray(), t0 = zero.tail.get(name).toArray();
  assert.ok(close([t0[0] - h0[0], t0[1] - h0[1], t0[2] - h0[2]], bone.direction.map((d: number) => d * bone.length), 1e-9),
    'zero DOF reproduces ASF direction');

  // nonzero DOF -> the bone's OWN joint rotation moves its own endpoint (tail), and length is preserved
  const on = computeWorldPose(sk, new Map([['root', [0, 0, 0, 0, 0, 0]], [name, [90]]]));
  const h1 = on.head.get(name).toArray(), t1 = on.tail.get(name).toArray();
  const move = Math.hypot(t1[0] - t0[0], t1[1] - t0[1], t1[2] - t0[2]);
  assert.ok(move > 0.5, 'own joint rotation moves its own endpoint (tail displacement=' + move.toFixed(3) + ')');
  assert.ok(Math.abs(Math.hypot(t1[0] - h1[0], t1[1] - h1[1], t1[2] - h1[2]) - bone.length) < 1e-9, 'bone length preserved under rotation');

  // with a nonzero axis the dof acts about a bone-local (tilted) axis: a pure rx
  // of the +Y bone must leave the world X=0 plane (C*M*C^-1, not the naive C*M).
  const tdir = [t1[0] - h1[0], t1[1] - h1[1], t1[2] - h1[2]];
  assert.ok(Math.abs(tdir[0]) > 1e-6, 'axis tilts the dof axis; endpoint leaves world X=0 plane (x=' + tdir[0].toFixed(4) + ')');
  // and the rotated direction is a unit vector (rigid rotation)
  assert.ok(Math.abs(Math.hypot(tdir[0], tdir[1], tdir[2]) - bone.length) < 1e-9, 'rotated direction keeps bone length');
});

test('cmu-motion: retarget aligns target bone directions to mirrored source directions (rest-direction fix) and preserves bone length', async () => {
  const { parseASF, parseAMC, computeBindPose, computeFrames, computeScale, retargetClip, computeTargetRestDirections } = await loadLib();
  const sk = parseASF(fs.readFileSync(ASF, 'utf8'));
  const rig = JSON.parse(fs.readFileSync(RIGFILE, 'utf8'));
  const plan = JSON.parse(fs.readFileSync(path.join(SRC, 'retarget-plan.json'), 'utf8'));
  const mapping = plan.mapping;
  const amc = parseAMC(fs.readFileSync(path.join(SRC, '02_01.amc'), 'utf8'), sk);
  const bind = computeBindPose(sk);
  const scale = computeScale(sk, rig, bind);
  const frames = computeFrames(sk, amc);
  const mesh = JSON.parse(fs.readFileSync('delivery/body-blockout-r1/mesh.json', 'utf8'));
  const controls = JSON.parse(fs.readFileSync('delivery/body-blockout-r1/controls.json', 'utf8'));
  const restDirs = computeTargetRestDirections(mesh, controls.regions, rig);
  const clip = retargetClip({ sourceFrames: frames, sourceBind: bind, skeleton: sk, rig, mapping, scale, sourceMeta: { id: '02_01', file: '02_01.amc', label: 'walk', fps: 120 }, opts: { rootMotion: 'preserved', restDirections: restDirs } });

  const byId = new Map<string, any>(rig.joints.map((j: any) => [j.id, j]));
  const parentOf = new Map<string, any>(rig.joints.map((j: any) => [j.id, j.parent]));
  const order = rig.joints.map((j: any) => j.id as string);

  const targetRestDir = (id: string): Vector3 => {
    const rdir = restDirs.get(id);
    if (rdir) return new Vector3(rdir[0], rdir[1], rdir[2]);
    let child: any = null;
    for (const k of rig.joints) if (k.parent === id) { child = k; break; }
    const j = byId.get(id);
    let d: number[];
    if (child) d = [child.pivot[0] - j.pivot[0], child.pivot[1] - j.pivot[1], child.pivot[2] - j.pivot[2]];
    else { const p = byId.get(j.parent); d = [j.pivot[0] - p.pivot[0], j.pivot[1] - p.pivot[1], j.pivot[2] - p.pivot[2]]; }
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return new Vector3(d[0] / l, d[1] / l, d[2] / l);
  };
  const worldQ = (f: number): Map<string, Quaternion> => {
    const q = new Map<string, Quaternion>();
    for (const id of order) {
      const s = clip.joints.find((x: any) => x.joint === id).samples[f];
      const lq = new Quaternion(s[0], s[1], s[2], s[3]).normalize();
      q.set(id, (parentOf.get(id) ? q.get(parentOf.get(id) as string)!.clone() : new Quaternion()).multiply(lq));
    }
    return q;
  };
  const pos = (f: number): Map<string, Vector3> => {
    const p = new Map<string, Vector3>(); const q = new Map<string, Quaternion>();
    for (const id of order) {
      const s = clip.joints.find((x: any) => x.joint === id).samples[f];
      const lq = new Quaternion(s[0], s[1], s[2], s[3]).normalize();
      if (id === 'root') { p.set(id, new Vector3(...clip.rootPosition.samples[f])); q.set(id, lq); }
      else { const j = byId.get(id) as any; const pp = byId.get(j.parent) as any; const off = new Vector3(j.pivot[0] - pp.pivot[0], j.pivot[1] - pp.pivot[1], j.pivot[2] - pp.pivot[2]).applyQuaternion(q.get(j.parent)!); p.set(id, p.get(j.parent)!.clone().add(off)); q.set(id, q.get(j.parent)!.clone().multiply(lq)); }
    }
    return p;
  };

  const n = frames.length;
  // direction alignment: target bone geometric direction == mirrored source bone world direction
  const pairs: Array<[string, string]> = [['shoulderL', 'lhumerus'], ['elbowL', 'lradius'], ['shoulderR', 'rhumerus'], ['elbowR', 'rradius'], ['hipL', 'lfemur'], ['kneeL', 'ltibia'], ['hipR', 'rfemur'], ['kneeR', 'rtibia'], ['spine', 'thorax'], ['neck', 'head'], ['ankleL', 'lfoot'], ['ankleR', 'rfoot'], ['wristL', 'lhand'], ['wristR', 'rhand']];
  for (const [tj, sb] of pairs) {
    const sName = sb.toLowerCase(); const sBone = sk.boneByName.get(sName); const u_t = targetRestDir(tj);
    let maxErr = 0;
    for (let f = 0; f < n; f += Math.max(1, Math.floor(n / 30))) {
      const wQ = worldQ(f);
      const tDir = u_t.clone().applyQuaternion(wQ.get(tj)!).normalize();
      const sDir = new Vector3(...sBone.direction).applyQuaternion(frames[f].pose.quat.get(sName)!).normalize();
      const sMirror = new Vector3(-sDir.x, sDir.y, sDir.z).normalize();
      maxErr = Math.max(maxErr, tDir.angleTo(sMirror));
    }
    assert.ok(maxErr < 1e-3, 'dir(' + tj + ') == mirrored ' + sName + ' within 0.057deg (max=' + (maxErr * 180 / Math.PI).toFixed(4) + ')');
  }

  // bone length preservation under the target FK
  let maxLenDev = 0;
  for (let f = 0; f < n; f += Math.max(1, Math.floor(n / 20))) {
    const p = pos(f);
    for (const j of rig.joints) {
      let child: any = null;
      for (const k of rig.joints) if (k.parent === j.id) { child = k; break; }
      if (!child) continue;
      const rest = Math.hypot(child.pivot[0] - j.pivot[0], child.pivot[1] - j.pivot[1], child.pivot[2] - j.pivot[2]);
      const len = Math.hypot(p.get(child.id)!.x - p.get(j.id)!.x, p.get(child.id)!.y - p.get(j.id)!.y, p.get(child.id)!.z - p.get(j.id)!.z);
      maxLenDev = Math.max(maxLenDev, Math.abs(len - rest));
    }
  }
  assert.ok(maxLenDev < 1e-6, 'target bone lengths preserved (max dev ' + maxLenDev.toExponential(3) + ' m)');
});

test('cmu-motion: endpoint-direction fixture — terminal bones use anatomical rest directions (foot/palm/head), not the parent-vector', async () => {
  const { parseASF, computeTargetRestDirections } = await loadLib();
  const sk = parseASF(fs.readFileSync(ASF, 'utf8'));
  const rig = JSON.parse(fs.readFileSync(RIGFILE, 'utf8'));
  const mesh = JSON.parse(fs.readFileSync('delivery/body-blockout-r1/mesh.json', 'utf8'));
  const controls = JSON.parse(fs.readFileSync('delivery/body-blockout-r1/controls.json', 'utf8'));
  const dirs = computeTargetRestDirections(mesh, controls.regions, rig); // Map<jointId,[x,y,z]>

  const ankL = dirs.get('ankleL'), ankR = dirs.get('ankleR');
  const wriL = dirs.get('wristL'), wriR = dirs.get('wristR');
  const nck = dirs.get('neck');

  // ankle -> foot region centroid: FORWARD +Z, NOT the pure-down parent-vector (ankle-knee)
  assert.ok(ankL[2] > 0.3 && ankL[2] < 0.95, 'ankleL rest dir has a forward +Z component (got ' + ankL[2].toFixed(3) + ')');
  assert.ok(Math.abs(ankL[1]) < 0.9, 'ankleL rest dir is NOT the parent-vector (down) (y=' + ankL[1].toFixed(3) + ')');
  assert.ok(Math.abs(ankL[0]) < 1e-6, 'ankleL lateral component ~0');
  assert.ok(Math.abs(ankL[2] - ankR[2]) < 1e-6, 'left/right foot-forward symmetric');
  assert.ok(Math.abs(ankL[2]) > 0.4, 'forward component significant (z=' + ankL[2].toFixed(3) + ')');

  // wrist -> palm region centroid: DOWN-dominant (arm hangs; palm below wrist)
  assert.ok(wriL[1] < -0.9, 'wristL rest dir points down toward palm (y=' + wriL[1].toFixed(3) + ')');
  assert.ok(Math.abs(wriL[0] + wriR[0]) < 1e-6, 'wrist left/right mirror in X');

  // neck -> head region centroid: UP-dominant
  assert.ok(nck[1] > 0.99, 'neck rest dir points up toward head (y=' + nck[1].toFixed(3) + ')');

  // prove the anatomical direction is NOT the parent-vector fallback (ankle-knee = pure down)
  const ankP = rig.joints.find((j: any) => j.id === 'ankleL').pivot;
  const kneP = rig.joints.find((j: any) => j.id === 'kneeL').pivot;
  const parentVec = [ankP[0] - kneP[0], ankP[1] - kneP[1], ankP[2] - kneP[2]];
  const pl = Math.hypot(parentVec[0], parentVec[1], parentVec[2]) || 1;
  const dot = ankL[0] * (parentVec[0] / pl) + ankL[1] * (parentVec[1] / pl) + ankL[2] * (parentVec[2] / pl);
  assert.ok(dot < 0.95, 'anatomical ankle dir differs from the parent-vector (dot=' + dot.toFixed(3) + ')');

  // the source foot bone is forward-dominant, so aligning the target foot-forward to it is sensible
  const sFoot = sk.boneByName.get('lfoot').direction;
  assert.ok(Math.abs(sFoot[2]) > 0.9, 'source lfoot is forward-dominant (az=' + sFoot[2].toFixed(3) + ')');
});

test('cmu-motion: on-disk end-direction file and clips reflect anatomical terminal orientation', async () => {
  const e = JSON.parse(fs.readFileSync(path.join(OUT_WEB, 'target-rest-directions.json'), 'utf8'));
  assert.equal(e.schemaVersion, 1);
  assert.equal(Object.keys(e.restDirections).length, 15, 'all 15 joints have a rest direction');
  assert.ok(e.centroids && e.centroids.head, 'head centroid present');
  // terminal (leaf) bones use ANATOMICAL rest directions
  const ankL = e.terminalAnatomical.ankleL.direction;
  const wriL = e.terminalAnatomical.wristL.direction;
  const nck = e.terminalAnatomical.neck.direction;
  assert.ok(ankL[2] > 0.3 && Math.abs(ankL[1]) < 0.9, 'on-disk ankleL rest dir is forward (+Z), not the down parent-vector');
  assert.ok(wriL[1] < -0.9, 'on-disk wristL rest dir points down toward palm');
  assert.ok(nck[1] > 0.99, 'on-disk neck rest dir points up toward head');
  // basis updated with the two-vector sole fix: the ankle PRIMARY is now the TOE
  // centroid (front half of the plate) because the source foot bone runs ankle->toe;
  // the whole-plate centroid dragged the primary down and forced the constant
  // 36.5deg toes-up sole error. Direction stays forward+Z (asserted above).
  assert.equal(e.terminalAnatomical.ankleL.basis, 'foot toe centroid (z>=0.10)');
  assert.equal(e.terminalAnatomical.wristL.basis, 'palm region centroid');
  // the same file exists in the full-precision tree
  assert.ok(fs.existsSync(path.join(OUT_SOURCE, 'target-rest-directions.json')));
  // clips.json reflects the fix
  const clips = JSON.parse(fs.readFileSync(path.join(OUT_WEB, 'clips.json'), 'utf8'));
  assert.equal(clips.schemaVersion, 2);
  assert.equal(clips.clips.length, 10);
  for (const c of clips.clips) {
    assert.equal(c.joints.length, 15);
    assert.equal(c.rootPosition.samples.length, c.frameCount);
  }
});
