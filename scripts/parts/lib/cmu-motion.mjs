/**
 * cmu-motion.mjs — Reliable ASF/AMC parser + source-FK + retarget converter for
 * CMU Graphics Lab Motion Capture Database subject-02 files.
 *
 * Owned module for the mocap-retarget pipeline. It only depends on `three`
 * (the exact version the web app loads, three@0.160.0) for quaternion/vector
 * math. It never "copies Euler angles directly": the source skeleton is
 * reconstructed by forward kinematics and every transferred joint rotation is a
 * proper quaternion measured relative to the parent joint.
 *
 * Coordinate / convention summary
 * -------------------------------
 *  * ASF/AMC are parsed as-is (units `length` scale is preserved in ASF units
 *    during FK; the converter rescales to the target rig metre scale via a
 *    reference-bone match, never by an arbitrary constant).
 *  * The ASF root is a 6-DOF joint (TX TY TZ RX RY RZ). Every non-root bone has
 *    the DOF listed by its `dof` line (order preserved).
 *  * Bone local (rest) rotation relative to its parent =
 *        C = R_axis(ASF axis); M = R_dof(frame dof euler); R_local = C · M · C^-1 (change of basis, CMU 15-464)
 *    applied as intrinsic (body-axis) rotations in the listed order. The ASF
 *    `axis` euler defines the joint's coordinate frame; the `direction`/`length`
 *    define the bone's geometric extension (joint placement). These are kept
 *    separate as the ASF spec intends.
 *  * World FK:  R_world(bone) = R_world(parent) · R_local(bone)
 *    tail(bone) = head(bone) + R_world(bone) · (direction(bone) · length(bone))   // own worldQ moves own tail
 *    head(bone) = tail(parent)                 (head(root) = root translation)
 *  * The target rig frame is "+Y up, +Z front" with LEFT side at -X, whereas
 *    the CMU subject-02 frame has left at +X with +Y up / +Z forward. The two
 *    frames are mirror images: conversion uses the frame map F = diag(-1,1,1)
 *    applied to both rotation (conjugation F·R·F) and position (F·v).
 *
 * Retarget model
 * --------------
 * For each target joint `j` with mapped source bone group `G_j` (the last,
 * most-distal source bone of the group is the representative `d_j`):
 *    Ds(j,f) = Q_s(d_j, f) · Q_s(d_j, rest)^-1            (source world delta)
 *    Qt(j,f) = F · Ds(j,f) · F  (= mirrorFrame)          (target-frame delta)
 *    q_local(j,f) = Qt(parent(j),f)^-1 · Qt(j,f)
 * The target rig's rest world orientation is identity for every joint (it is
 * authored with zero local rotation, matching the rig's rest convention), so
 * Qt becomes the target joint's world rotation directly. This transfers the
 * source bone's world-space orientation delta to the corresponding target bone
 * and is quaternion-exact — it is NOT Euler angle copying.
 *
 * Root translation is preserved (rootMotion: 'preserved') by transferring the
 * source root translation delta scaled into the target rig metre scale, or can
 * be forced to the static pivot (rootMotion: 'in-place').
 */

import { Quaternion, Vector3, Matrix4 } from 'three';

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ *
 * Quaternion / vector helpers (three-backed)
 * ------------------------------------------------------------------ */

const AXIS_VEC = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

/** Intrinsic (body-axis) euler composition in `order` (e.g. 'XYZ' → qX·qY·qZ). */
export function eulerQuat(angles, order) {
  const ax = angles[0], ay = angles[1], az = angles[2];
  const map = { x: ax, y: ay, z: az };
  const q = new Quaternion();
  for (const a of String(order).toLowerCase()) {
    const axis = AXIS_VEC[a];
    if (!axis) continue;
    q.multiply(new Quaternion().setFromAxisAngle(axis, map[a] * DEG));
  }
  return safeQuat(q);
}

/** Quaternion from a dof channel value list using the bone's dof token order. */
export function dofQuat(values, dofTokens) {
  const q = new Quaternion();
  for (let i = 0; i < dofTokens.length; i++) {
    const tok = dofTokens[i]; // 'rx' | 'ry' | 'rz'
    const axis = tok[1];      // 'x' | 'y' | 'z'
    const val = values && values[i] !== undefined ? values[i] * DEG : 0;
    q.multiply(new Quaternion().setFromAxisAngle(AXIS_VEC[axis], val));
  }
  return safeQuat(q);
}

/** Conjugate the rotation `q` by the frame map F = diag(-1,1,1):  R' = F·R·F. */
export function mirrorQuat(q) {
  const R = new Matrix4().makeRotationFromQuaternion(q);
  const F = new Matrix4().makeScale(-1, 1, 1);
  const out = new Matrix4().multiplyMatrices(F, R).multiply(F);
  return safeQuat(new Quaternion().setFromRotationMatrix(out));
}

/** Apply the frame map F = diag(-1,1,1) to a position vector. */
export function mirrorVec(v) {
  return [-v[0], v[1], v[2]];
}

/** Unit-length guard: normalize with a hard epsilon (never NaN). */
export function safeQuat(q) {
  const len = q.length();
  if (!Number.isFinite(len) || len < 1e-9) return new Quaternion(0, 0, 0, 1);
  return q.clone().normalize();
}

export function vecFrom(arr) {
  return new Vector3(arr[0], arr[1], arr[2]);
}

/* ------------------------------------------------------------------ *
 * ASF parsing
 * ------------------------------------------------------------------ */

function splitBoneBlocks(text) {
  const blocks = [];
  const re = /\bbegin\b([\s\S]*?)\bend\b/g;
  let m;
  while ((m = re.exec(text)) !== null) blocks.push(m[1]);
  return blocks;
}

function nums(str, count) {
  const out = [];
  const re = /-?[0-9]+(?:\.[0-9]+)?(?:e[-+]?[0-9]+)?/gi;
  let m;
  while ((m = re.exec(str)) !== null) out.push(parseFloat(m[0]));
  return out.slice(0, count);
}

/**
 * Parse an ASF file text into a structured skeleton.
 * Returns { units, root, bones[], boneByName, children, order }.
 */
export function parseASF(text) {
  const lines = text.split(/\r?\n/);
  let units = { mass: 1, length: 1, angle: 'deg' };
  let root = { order: ['tx', 'ty', 'tz', 'rx', 'ry', 'rz'], axis: 'XYZ', position: [0, 0, 0], orientation: [0, 0, 0] };
  const bones = [];
  const children = new Map();
  const parentOf = new Map();

  // ---- :units ----
  const unitsRe = /\bmass\s+([0-9.eE+-]+)\s*\n([\s\S]*?)\blength\s+([0-9.eE+-]+)\s*\n([\s\S]*?)\bangle\s+(\S+)/;
  const uMatch = text.match(unitsRe);
  if (uMatch) units = { mass: parseFloat(uMatch[1]), length: parseFloat(uMatch[3]), angle: uMatch[5] };

  // ---- :root ----
  const rootBlock = text.match(/:root([\s\S]*?)(?=:bonedata|:hierarchy|$)/i);
  if (rootBlock) {
    const rb = rootBlock[1];
    const ord = rb.match(/order\s+([^\r\n]+)/i);
    if (ord) root.order = ord[1].trim().toLowerCase().split(/\s+/).filter(Boolean);
    const ax = rb.match(/axis\s+(\S+)/i);
    if (ax) root.axis = ax[1].toUpperCase();
    const pos = rb.match(/position\s+([-0-9.eE ]+)/i);
    if (pos) root.position = nums(pos[1], 3);
    const orient = rb.match(/orientation\s+([-0-9.eE ]+)/i);
    if (orient) root.orientation = nums(orient[1], 3);
  }

  // ---- :bonedata ----
  const blocks = splitBoneBlocks(text);
  for (const block of blocks) {
    const name = block.match(/\bname\s+(\S+)/)?.[1];
    if (!name) continue;
    const id = parseInt(block.match(/\bid\s+(\d+)/)?.[1] || '0', 10);
    const direction = nums(block.match(/\bdirection\s+([-0-9.eE ]+)/)?.[1] || '', 3);
    const length = parseFloat(block.match(/\blength\s+([0-9.eE+-]+)/)?.[1]);
    const axisMatch = block.match(/\baxis\s+([-0-9.eE ]+?)(XYZ|YZX|ZXY|XZY|YXZ|ZYX)\b/i);
    const axisOrder = axisMatch ? axisMatch[2].toUpperCase() : 'XYZ';
    const axis = axisMatch ? nums(axisMatch[1], 3) : [0, 0, 0];
    const dofMatch = block.match(/\bdof\s+(.+)/);
    const dof = dofMatch ? dofMatch[1].trim().toLowerCase().split(/\s+/).filter(Boolean) : [];
    const limitLines = [...block.matchAll(/^\s*\(([^)]+)\)\s*\(([^)]+)\)\s*$/gm)].map((m) => [nums(m[1], 1)[0], nums(m[2], 1)[0]]);
    const limits = dof.map((_, i) => (limitLines.length > i ? limitLines[i] : null));
    bones.push({ id, name, direction, length, axis, axisOrder, dof, dofCount: dof.length, limits, parentOfName: null });
  }

  // ---- :hierarchy ----
  const hierBlock = text.match(/:hierarchy([\s\S]*?)\bend\b/i);
  if (hierBlock) {
    for (const line of hierBlock[1].split(/\r?\n/)) {
      const tokens = line.trim().split(/\s+/).filter(Boolean);
      if (!tokens.length || tokens[0].startsWith(':')) continue;
      const parent = tokens[0].toLowerCase();
      for (const child of tokens.slice(1)) {
        parentOf.set(child.toLowerCase(), parent);
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(child.toLowerCase());
      }
    }
  }

  const boneByName = new Map(bones.map((b) => [b.name.toLowerCase(), b]));
  // attach parent name to each bone
  for (const b of bones) {
    b.parentOfName = parentOf.get(b.name.toLowerCase()) || null;
  }

  // ---- topological order (parent before child), root first ----
  const order = [];
  const visited = new Set();
  function walk(name) {
    if (visited.has(name)) return;
    visited.add(name);
    order.push(name);
    for (const c of children.get(name) || []) walk(c);
  }
  walk('root');
  for (const b of bones) {
    if (!visited.has(b.name.toLowerCase())) order.push(b.name.toLowerCase());
  }

  return {
    units,
    root,
    bones,
    boneByName,
    parentOf,
    children,
    order,
    angleType: units.angle,
    scaleUnit: units.length,
  };
}

/** Per-bone DOF channel count map, including root==6. */
export function dofCounts(skeleton) {
  const m = new Map();
  for (const b of skeleton.bones) m.set(b.name.toLowerCase(), b.dofCount);
  m.set('root', skeleton.root.order.length); // 6 for CMU (TX TY TZ RX RY RZ)
  return m;
}

/* ------------------------------------------------------------------ *
 * AMC parsing
 * ------------------------------------------------------------------ */

/**
 * Parse an AMC file text. `skeleton` is from parseASF. Strictly validates:
 * contiguous frame numbers, every bone present each frame, correct channel
 * count per bone (root == root.order.length), all numeric / finite.
 * Returns { frames, fps, degree, frameCount, durationSeconds, firstFrame, lastFrame }.
 */
export function parseAMC(text, skeleton) {
  const counts = dofCounts(skeleton);
  const lines = text.split(/\r?\n/);
  const frameRe = /^\d+\s*$/;
  const frames = [];
  let degree = true;
  const fps = 120; // CMU subject-02 is 120fps; mandated by the harness.
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(':')) {
      if (/^:degrees?\b/i.test(line)) degree = true;
      if (/^:radians?\b/i.test(line)) degree = false;
      continue;
    }
    if (frameRe.test(line)) {
      const n = parseInt(line, 10);
      if (frames.length && n !== frames[frames.length - 1].frame + 1) {
        throw new Error(`AMC frame sequence break at frame ${n} (expected ${frames[frames.length - 1].frame + 1})`);
      }
      current = { frame: n, channels: new Map() };
      frames.push(current);
      continue;
    }
    const parts = line.split(/\s+/).filter(Boolean);
    const boneName = parts[0].toLowerCase();
    if (!current) throw new Error(`AMC channel '${boneName}' before any frame number`);
    const expected = counts.get(boneName);
    if (expected === undefined) throw new Error(`AMC references unknown bone '${boneName}'`);
    const values = parts.slice(1).map(Number);
    if (values.length !== expected) {
      throw new Error(`AMC bone '${boneName}' has ${values.length} channels, expected ${expected}`);
    }
    if (values.some((v) => !Number.isFinite(v))) {
      throw new Error(`AMC bone '${boneName}' has a non-finite channel value`);
    }
    current.channels.set(boneName, values);
  }

  if (!frames.length) throw new Error('AMC contains no frames');

  for (const f of frames) {
    for (const [name, count] of counts) {
      if (count && !f.channels.has(name)) throw new Error(`AMC frame ${f.frame} missing bone '${name}'`);
    }
  }

  const lastFrame = frames[frames.length - 1].frame;
  return {
    frames,
    degree,
    fps,
    frameCount: frames.length,
    durationSeconds: (frames.length - 1) / fps,
    firstFrame: frames[0].frame,
    lastFrame,
  };
}

/* ------------------------------------------------------------------ *
 * Forward kinematics
 * ------------------------------------------------------------------ */

/**
 * Compute a single world pose. `channels` is a Map<boneName, number[]> with the
 * channel values for this frame (root included).
 * Returns { head, tail, quat } world Maps (ASF units, CMU frame).
 */
export function computeWorldPose(skeleton, channels) {
  const head = new Map();
  const tail = new Map();
  const quat = new Map();

  const rootCh = channels.get('root') || [];
  const rootOrder = skeleton.root.order;
  const val = {};
  rootOrder.forEach((tok, i) => { val[tok] = rootCh[i] || 0; });
  const rootPos = new Vector3(
    skeleton.root.position[0] + (val.tx || 0),
    skeleton.root.position[1] + (val.ty || 0),
    skeleton.root.position[2] + (val.tz || 0),
  );
  const rootQuat = eulerQuat([val.rx || 0, val.ry || 0, val.rz || 0], skeleton.root.axis || 'XYZ');
  head.set('root', rootPos);
  tail.set('root', rootPos.clone());
  quat.set('root', rootQuat);

  for (const name of skeleton.order) {
    if (name === 'root') continue;
    const bone = skeleton.boneByName.get(name);
    const parent = bone.parentOfName;
    if (!parent) throw new Error(`FK: bone '${name}' has no parent`);
    const parentQuat = quat.get(parent);
    if (!parentQuat) throw new Error(`FK: parent '${parent}' of '${name}' not resolved`);
    const boneHead = parent === 'root' ? head.get('root').clone() : (tail.get(parent) ? tail.get(parent).clone() : head.get(parent).clone());
    head.set(name, boneHead);

    const axisQ = eulerQuat(bone.axis, bone.axisOrder.toUpperCase().split(''));
    const dofQ = dofQuat(channels.get(name), bone.dof);
    const localQ = new Quaternion().multiplyQuaternions(axisQ, dofQ).multiply(axisQ.clone().invert()); // C*M*C^-1 change of basis
    const worldQ = new Quaternion().multiplyQuaternions(parentQuat, localQ);
    quat.set(name, safeQuat(worldQ));

    const dirLen = vecFrom(bone.direction).multiplyScalar(bone.length);
    const tailPos = boneHead.clone().add(dirLen.applyQuaternion(worldQ)); // own worldQ so own rotation moves its own tail
    tail.set(name, tailPos);
  }

  return { head, tail, quat };
}

/** Rest (bind) pose: identity DOF for every bone. */
export function computeBindPose(skeleton) {
  const channels = new Map();
  for (const [name, count] of dofCounts(skeleton)) {
    channels.set(name, new Array(count).fill(0));
  }
  return computeWorldPose(skeleton, channels);
}

/** Per-frame world poses for a whole AMC record. */
export function computeFrames(skeleton, amc) {
  return amc.frames.map((f) => ({ frame: f.frame, pose: computeWorldPose(skeleton, f.channels) }));
}

function rotationOrderFromDof(orderTokens) {
  const s = orderTokens.filter((t) => /^r[xyz]$/.test(t)).map((t) => t[1].toUpperCase()).join('');
  return s || 'XYZ';
}

/* ------------------------------------------------------------------ *
 * Retarget to the 15-node inspection rig
 * ------------------------------------------------------------------ */

/** Source world delta for a mapped group; representative = last (distal-most) bone. */
export function sourceDelta(sourceFrame, sourceBind, skeleton, group) {
  const rep = group[group.length - 1].toLowerCase();
  const qf = sourceFrame.quat.get(rep);
  const qb = sourceBind.quat.get(rep);
  if (!qf || !qb) throw new Error(`sourceDelta: unknown source bone '${rep}'`);
  return new Quaternion().multiplyQuaternions(qf, qb.clone().invert());
}

/** Target-rig reference scale (source ASF units → target metres) via hip→ankle. */
export function computeScale(skeleton, rig, bindSource, refLeft = 'hipL') {
  const tHip = vecFrom(rig.joints.find((j) => j.id === refLeft).pivot);
  const tAnkle = vecFrom(rig.joints.find((j) => j.id === refLeft.replace('hip', 'ankle')).pivot);
  const sHip = bindSource.head.get('lfemur');
  const sAnkle = bindSource.head.get('lfoot');
  if (!sHip || !sAnkle) throw new Error('computeScale: reference source bones not found');
  const targetLen = tHip.distanceTo(tAnkle);
  const sourceLen = sHip.distanceTo(sAnkle);
  if (sourceLen < 1e-9) throw new Error('computeScale: degenerate source reference length');
  return targetLen / sourceLen;
}

/**
 * Retarget a single clip into the target rig's local quaternions.
 */
export function retargetClip({ sourceFrames, sourceBind, skeleton, rig, mapping, scale, sourceMeta = {}, opts = {} }) {
  const rootMotion = opts.rootMotion || 'preserved';
  const joints = rig.joints;
  const parentOf = new Map(joints.map((j) => [j.id, j.parent]));

  const targetOrder = joints.map((j) => j.id); // input order already parent-before-child
  const rootRestPivot = vecFrom(joints.find((j) => j.id === 'root').pivot);
  const frameCount = sourceFrames.length;
  const fps = sourceMeta.fps || 120;

  const perJointSamples = new Map();
  const rootPosSamples = [];
  // Anchor root motion to the clip's first frame so the character starts at the
  // rig pivot instead of at the (arbitrary) absolute capture position. Preserves
  // the relative root trajectory across the clip.
  const srcRoot0 = sourceFrames[0].pose.head.get('root');

  // ---- source->target REST-DIRECTION alignment per mapped bone ----
  // The source ASF rest is a T-pose (arms horizontal, e.g. humerus direction
  // (1,0,0)) while the target rig rest is an A-pose (arms down). Transferring the
  // source world-rotation DELTA alone would rotate the target's down-arm by the
  // source's ~90deg swing and fold it. So align each target bone's rest direction
  // to the (mirrored) source rest direction with a FIXED per-bone quaternion A_j,
  // and build the target world rotation as  Qt(j,f) = mirror(delta) * A_j. This
  // yields  Qt(j,f) * u_t(j) == mirror(source bone world direction at f).
  const jointByIdR = new Map(joints.map((j) => [j.id, j]));
  // Optional explicit terminal (leaf) rest directions. For leaf bones like ankle
  // (foot region points forward +Z), wrist (palm points along the arm), neck
  // (head centroid) the pivot-based parent-vector fallback below is anatomically
  // WRONG, so the caller may supply anatomical target-rest directions
  // (Map<jointId, [x,y,z]>, normalized). Fallback = child-child vector, or
  // parent-vector for a leaf, or +Y for root.
  const restDirections = opts.restDirections || null;
  // Optional TWO-VECTOR rest frames (Map<jointId,{primary,secondary}> from
  // computeTargetRestFrames). When present, each A_j is built with
  // alignTwoVectors so the target bone's primary direction AND its secondary
  // (sole/palm/sagittal) both match the mirrored source at rest — the twist
  // about the primary is pinned instead of left free. This is what removes the
  // constant 36.5deg toes-up sole error on the feet and the 83.8deg palm twist.
  const restFrames = opts.restFrames || null;
  const targetRestDir = (id) => {
    if (restDirections && restDirections.get(id)) return restDirections.get(id);
    let child = null;
    for (const k of joints) if (k.parent === id) { child = k; break; }
    const j = jointByIdR.get(id);
    let d;
    if (child) {
      d = [child.pivot[0] - j.pivot[0], child.pivot[1] - j.pivot[1], child.pivot[2] - j.pivot[2]];
    } else if (j.parent) {
      const p = jointByIdR.get(j.parent);
      d = [j.pivot[0] - p.pivot[0], j.pivot[1] - p.pivot[1], j.pivot[2] - p.pivot[2]];
    } else {
      d = [0, 1, 0];
    }
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    return [d[0] / len, d[1] / len, d[2] / len];
  };
  const alignA = new Map();
  for (const id of targetOrder) {
    if (id === 'root') { alignA.set(id, new Quaternion()); continue; }
    const group = mapping[id];
    if (!group) { alignA.set(id, new Quaternion()); continue; }
    const sName = group[group.length - 1].toLowerCase();
    const sBone = skeleton.boneByName.get(sName);
    if (!sBone) { alignA.set(id, new Quaternion()); continue; }
    const u_t = restFrames && restFrames.get(id) ? restFrames.get(id).primary : targetRestDir(id);
    // source rest direction in WORLD (bind world quat applied; equals the raw
    // ASF direction whenever the bind pose world rotations are identity, which
    // holds for subject-02).
    const sBindQ = sourceBind.quat.get(sName) || new Quaternion();
    const u_s_world = vecFrom(sBone.direction).applyQuaternion(sBindQ).toArray();
    if (restFrames && restFrames.get(id)) {
      const n_t = restFrames.get(id).secondary;
      const n_s_world = sourceRestSecondary(id);
      alignA.set(id, alignTwoVectors(u_t, n_t, mirrorVec(u_s_world), mirrorVec(n_s_world)));
    } else {
      alignA.set(id, new Quaternion().setFromUnitVectors(vecFrom(u_t), vecFrom(mirrorVec(u_s_world))));
    }
  }

  for (let f = 0; f < frameCount; f++) {
    const sf = sourceFrames[f].pose;
    const Qt = new Map();
    for (const id of targetOrder) {
      let delta;
      if (id === 'root') {
        const qf = sf.quat.get('root');
        const qb = sourceBind.quat.get('root');
        delta = new Quaternion().multiplyQuaternions(qf, qb.clone().invert());
      } else {
        const group = mapping[id] || null;
        delta = group ? sourceDelta(sf, sourceBind, skeleton, group) : new Quaternion();
      }
      Qt.set(id, mirrorQuat(delta).multiply(alignA.get(id) || new Quaternion()));
    }
    for (const id of targetOrder) {
      const parent = parentOf.get(id);
      const qWorld = Qt.get(id);
      const qParentWorld = parent ? Qt.get(parent) : new Quaternion();
      const qLocal = new Quaternion().multiplyQuaternions(qParentWorld.clone().invert(), qWorld);
      if (!perJointSamples.has(id)) perJointSamples.set(id, []);
      perJointSamples.get(id).push([qLocal.x, qLocal.y, qLocal.z, qLocal.w]);
    }
    let rootPosVec;
    if (rootMotion === 'in-place') {
      rootPosVec = rootRestPivot.clone();
    } else {
      const srcRootFrame = sf.head.get('root');
      const deltaV = srcRootFrame.clone().sub(srcRoot0);
      const scaled = deltaV.multiplyScalar(scale);
      rootPosVec = rootRestPivot.clone().add(vecFrom(mirrorVec(scaled.toArray())));
    }
    rootPosSamples.push(rootPosVec.toArray());
  }

  const jointsOut = [...targetOrder].map((id) => ({ joint: id, samples: perJointSamples.get(id) }));

  return {
    id: sourceMeta.id || null,
    file: sourceMeta.file || null,
    label: sourceMeta.label || null,
    fps,
    frameCount,
    durationSeconds: (frameCount - 1) / fps,
    rootMotion,
    joints: jointsOut,
    rootPosition: { pivot: rootRestPivot.toArray(), unit: 'meters', samples: rootPosSamples },
    perFrameLocal: perJointSamples,
  };
}

/** Target rig bone rest directions/lengths (derived from pivots; for documentation). */
export function rigRestDirections(rig) {
  const jointById = new Map(rig.joints.map((j) => [j.id, j]));
  const dirs = {};
  for (const j of rig.joints) {
    let child = null;
    for (const k of rig.joints) if (k.parent === j.id) { child = k; break; }
    let dir;
    if (child) {
      dir = [child.pivot[0] - j.pivot[0], child.pivot[1] - j.pivot[1], child.pivot[2] - j.pivot[2]];
    } else if (j.parent) {
      const p = jointById.get(j.parent);
      dir = [j.pivot[0] - p.pivot[0], j.pivot[1] - p.pivot[1], j.pivot[2] - p.pivot[2]];
    } else {
      dir = [0, 1, 0];
    }
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    dirs[j.id] = { direction: [dir[0] / len, dir[1] / len, dir[2] / len], length: len };
  }
  return dirs;
}

/**
 * Compute per-joint target REST DIRECTIONS (normalized), using anatomical
 * region-centroid vectors for TERMINAL (leaf) bones so the retarget aligns the
 * mesh's actual terminal direction, not a parent-vector continuation:
 *   ankleL/R <- foot region centroid   (mesh foot points forward +Z)
 *   wristL/R <- palm region centroid   (hand/palm along the arm)
 *   neck     <- head region centroid   (head+jaw+crown)
 * Non-leaf bones use the child-child pivot vector; other leaves fall back to the
 * parent-vector. mesh has .vertices (arrays), regions is controls.json regions.
 * Returns Map<jointId, [x,y,z]>.
 */
export function computeTargetRestDirections(mesh, regions, rig) {
  const jointById = new Map(rig.joints.map((j) => [j.id, j]));
  const centroid = (ids) => ids.reduce((p, i) => p.add(new Vector3(...mesh.vertices[i])), new Vector3(0, 0, 0)).multiplyScalar(1 / ids.length);
  // Ankle PRIMARY = TOE centroid (foot vertices at z >= 0.10, i.e. the front half
  // of the plate), NOT the whole-plate centroid: the source foot bone runs
  // ankle->TOE (ASF lfoot direction is forward-dominant), so the primary must
  // point at the toe for the direction match to be anatomical. The whole-plate
  // centroid drags the primary down ~-14deg and forces a constant sole error.
  const toe = (side) => centroid(regions['foot' + side].filter((i) => mesh.vertices[i][2] >= 0.10));
  const footC = { L: toe('L'), R: toe('R') };
  const palmC = { L: centroid(regions.palmL), R: centroid(regions.palmR) };
  const headC = centroid([...regions.head, ...regions.jaw, ...regions.crown]);
  const dirs = new Map();
  for (const j of rig.joints) {
    let child = null;
    for (const k of rig.joints) if (k.parent === j.id) { child = k; break; }
    let d;
    if (child) {
      d = [child.pivot[0] - j.pivot[0], child.pivot[1] - j.pivot[1], child.pivot[2] - j.pivot[2]];
    } else {
      const side = /^ankle([LR])$/.test(j.id) ? j.id.slice(-1) : null;
      if (side) { const c = footC[side]; d = [c.x - j.pivot[0], c.y - j.pivot[1], c.z - j.pivot[2]]; }
      else if (/^wrist[LR]$/.test(j.id)) { const c = palmC[j.id.slice(-1)]; d = [c.x - j.pivot[0], c.y - j.pivot[1], c.z - j.pivot[2]]; }
      else if (j.id === 'neck') { d = [headC.x - j.pivot[0], headC.y - j.pivot[1], headC.z - j.pivot[2]]; }
      else if (j.parent) { const p = jointById.get(j.parent); d = [j.pivot[0] - p.pivot[0], j.pivot[1] - p.pivot[1], j.pivot[2] - p.pivot[2]]; }
      else { d = [0, 1, 0]; }
    }
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    dirs.set(j.id, [d[0] / len, d[1] / len, d[2] / len]);
  }
  return dirs;
}

/**
 * Per-joint anatomical SECONDARY directions (normalized, orthogonalized against
 * the primary). A single-vector alignment (setFromUnitVectors) fixes the primary
 * but leaves the TWIST about it completely unconstrained — that is the root
 * cause of the constant toes-up sole error (36.5deg) on the feet and the 83.8deg
 * palm twist on the hands. The secondary pins that twist:
 *   ankleL/R  -> sole normal   (0,-1,0)   (plate faces the ground at rest)
 *   wristL/R  -> palm normal   (+/-1,0,0) (palm faces the body at rest)
 *   everyone else -> +Z (the sagittal reference the source secondaries use)
 * Returns Map<jointId, {primary:[x,y,z], secondary:[x,y,z]}>.
 */
export function computeTargetRestFrames(mesh, regions, rig) {
  const primary = computeTargetRestDirections(mesh, regions, rig);
  const frames = new Map();
  for (const j of rig.joints) {
    let s = [0, 0, 1];
    if (/^ankle[LR]$/.test(j.id)) s = [0, -1, 0];
    else if (/^wristL$/.test(j.id)) s = [1, 0, 0];
    else if (/^wristR$/.test(j.id)) s = [-1, 0, 0];
    const u = vecFrom(primary.get(j.id));
    const sv = vecFrom(s);
    const proj = sv.clone().sub(u.clone().multiplyScalar(sv.dot(u)));
    if (proj.lengthSq() < 1e-10) proj.set(0, 0, 1).sub(u.clone().multiplyScalar(u.z));
    frames.set(j.id, { primary: primary.get(j.id), secondary: proj.normalize().toArray() });
  }
  return frames;
}

/**
 * Minimal rotation taking frame (u1,n1) to frame (u2,n2): first the unique
 * shortest rotation mapping u1->u2, then a twist about u2 so the secondary n1
 * (rotated along) lands on n2 within the plane perpendicular to u2. Both
 * secondaries are projected into that plane, so they only ever pin the twist,
 * never fight the primary.
 */
export function alignTwoVectors(u1, n1, u2, n2) {
  const U1 = vecFrom(u1).normalize(), N1 = vecFrom(n1).normalize();
  const U2 = vecFrom(u2).normalize(), N2 = vecFrom(n2).normalize();
  const A0 = new Quaternion().setFromUnitVectors(U1, U2);
  const a = N1.clone().applyQuaternion(A0);
  a.sub(U2.clone().multiplyScalar(a.dot(U2)));
  const b = N2.clone().sub(U2.clone().multiplyScalar(N2.dot(U2)));
  const q = new Quaternion();
  if (a.lengthSq() > 1e-12 && b.lengthSq() > 1e-12) {
    a.normalize(); b.normalize();
    const cross = new Vector3().crossVectors(a, b);
    const angle = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
    if (cross.lengthSq() > 1e-12) q.setFromAxisAngle(cross.normalize(), angle);
  }
  return q.multiply(A0);
}

/**
 * Anatomical SECONDARY direction per target joint, expressed in SOURCE-world at
 * rest (the source T-pose): feet soles and palms face DOWN (+/-Y world), every
 * other bone keeps the sagittal +Z reference. Mirrored by the caller.
 */
export function sourceRestSecondary(jointId) {
  if (/^ankle[LR]$/.test(jointId)) return [0, -1, 0];
  if (/^wrist[LR]$/.test(jointId)) return [0, -1, 0];
  return [0, 0, 1];
}

/**
 * Reference skin evaluator for the 15-joint rig (same math as
 * web/draw/motion-runtime.js, usable in Node): local quats from a clip's joint
 * samples, world rotation = parent-chain product, world position = parent pos +
 * parentQ * (pivot - parentPivot); vertex = SUM_j w_j * (Q_j * (v - pivot_j) +
 * pos_j). Weights = rig.vertexWeights when present, else rigid rig.vertexJoint.
 * Bind pose = rest pivots with identity rotations, so identity inputs return the
 * mesh vertices exactly.
 */
export function evaluateRigVertices(rig, mesh, clip, frame) {
  const joints = rig.joints;
  const byJoint = new Map(clip.joints.map((x) => [x.joint, x.samples[frame]]));
  const byId = new Map(joints.map((j) => [j.id, j]));
  const q = new Map(); const p = new Map();
  for (const j of joints) {
    const s = byJoint.get(j.id);
    const lq = s ? new Quaternion(s[0], s[1], s[2], s[3]).normalize() : new Quaternion();
    const pq = j.parent ? q.get(j.parent).clone() : new Quaternion();
    q.set(j.id, pq.multiply(lq));
    if (!j.parent) {
      const rp = clip.rootPosition && clip.rootPosition.samples ? clip.rootPosition.samples[frame] : j.pivot;
      p.set(j.id, vecFrom(rp));
    } else {
      const pj = byId.get(j.parent);
      const off = vecFrom([j.pivot[0] - pj.pivot[0], j.pivot[1] - pj.pivot[1], j.pivot[2] - pj.pivot[2]]).applyQuaternion(q.get(j.parent));
      p.set(j.id, p.get(j.parent).clone().add(off));
    }
  }
  // weight rows reference joints by INDEX (same contract as web/draw/motion-runtime.js)
  const weights = rig.vertexWeights || mesh.vertices.map((_, i) => [[rig.vertexJoint[i], 1]]);
  const verts = mesh.vertices.map((v, i) => {
    const out = new Vector3(0, 0, 0);
    for (const [jIdx, w] of weights[i]) {
      const j = joints[jIdx];
      out.add(vecFrom(v).sub(vecFrom(j.pivot)).applyQuaternion(q.get(j.id)).add(p.get(j.id)).multiplyScalar(w));
    }
    return [out.x, out.y, out.z];
  });
  return { vertices: verts, jointWorld: Object.fromEntries([...q.keys()].map((id) => [id, { quat: q.get(id).toArray(), position: p.get(id).toArray() }])) };
}
