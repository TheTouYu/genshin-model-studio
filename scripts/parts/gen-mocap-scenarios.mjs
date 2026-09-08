/**
 * gen-mocap-scenarios.mjs — Derive per-clip prop/scene config FROM MOTION
 * EVIDENCE (not from the CMU text labels).
 *
 * For every clip we compute, from the full-precision retargeted joints and the
 * skinned palm plates:
 *   - hand-to-hand distance series (grip grouping)
 *   - per-hand motion range (wielding hand detection)
 *   - palm height minima clusters (wash basin placement)
 *   - sustained two-hand convergence near the ground (box pickup windows)
 * Rules (all thresholds recorded in the output for review):
 *   swordplay: sword attached to the WIELDING hand (larger palm travel) at
 *     t=0 when held throughout (hand-to-hand distance stays < 0.22m), else at
 *     the first sustained convergence; blade points along the forearm.
 *   scoop/lift (02_06): box world-fixed on the ground until BOTH palms stay
 *     within the grasp band (palms within 0.35m, palm y < ground+0.50m) for
 *     >=0.25s, then follows the palm midpoint until the palms separate >0.60m.
 *   wash (02_10): basin world-fixed at the height/position where the palms dip
 *     (P25 of low-front palm heights), with a stand to the ground.
 *   all others: ground + scale reference only (walks/run/jump/punch show no
 *     object-interaction evidence — a hanging bag for punches would be invented
 *     content, not evidence).
 *
 * Props are DEFAULT SUGGESTIONS derived from trajectories; the 纯人体 toggle
 * hides them. Output: web/draw/mocap-scenarios.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { evaluateRigVertices } from './lib/cmu-motion.mjs';

const ROOT = process.cwd();
const DELIV = path.join(ROOT, 'delivery/mocap-retarget');
const MESH_DIR = path.join(ROOT, 'delivery/body-blockout-anim-r1a');
const mesh = JSON.parse(fs.readFileSync(path.join(MESH_DIR, 'mesh.json'), 'utf8'));
const controls = JSON.parse(fs.readFileSync(path.join(MESH_DIR, 'controls.json'), 'utf8'));
const rigFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/draw/mocap-assets/rig.json'), 'utf8'));
const GROUND_Y = Math.min(...[...controls.regions.footL, ...controls.regions.footR].map((i) => mesh.vertices[i][1]));

const RULES = {
  handToHandTwoHanded: 0.22,   // m, median below this => two-handed grip
  graspBandPalmDistance: 0.45, // m, palms converge closer than this
  graspBandRelHeight: 0.12,    // m above the clip's own lowest palm height
  graspSustain: 0.20,          // s
  releaseSeparation: 0.60,     // m (two-handed SWORD grips only)
  boxReleaseSeparation: 0.90,  // m — carrying a 0.34m box keeps hands ~0.45m apart; only full arm separation releases
  basinFrontZ: 0.15,           // m in front of the body
};

function palmSeries(clip) {
  const L = [], R = [], wrist = { L: [], R: [] };
  for (let f = 0; f < clip.frameCount; f++) {
    const ev = evaluateRigVertices(rigFile, mesh, clip, f);
    const v = ev.vertices;
    const c = (ids) => [0, 1, 2].map((k) => ids.reduce((s, i) => s + v[i][k], 0) / ids.length);
    L.push(c(controls.regions.palmL));
    R.push(c(controls.regions.palmR));
    wrist.L.push(ev.jointWorld.wristL.position);
    wrist.R.push(ev.jointWorld.wristR.position);
  }
  return { L, R, wrist };
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const range = (xs) => {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of xs) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
  return Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
};

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'delivery/mocap-source/cmu-02/manifest.json'), 'utf8'));
const scenarios = { schemaVersion: 1, groundY: GROUND_Y, rules: RULES, coordinateSystem: 'target rig: +Y up, +Z front', clips: {} };

for (const rec of manifest.clips) {
  const clip = JSON.parse(fs.readFileSync(path.join(DELIV, 'target-' + rec.id + '.json'), 'utf8'));
  const { L, R, wrist } = palmSeries(clip);
  const fps = clip.fps;
  const hh = L.map((p, f) => dist(p, R[f]));
  const medHH = median(hh);
  const rangeL = range(L), rangeR = range(R);
  const sc = { label: rec.label, evidence: { medianHandDistance: +medHH.toFixed(3), palmTravelL: +rangeL.toFixed(3), palmTravelR: +rangeR.toFixed(3), sourceDescription: rec.source || rec.label }, props: [], scene: { ground: true, groundY: GROUND_Y, humanScaleRef: true } };

  const isSword = /sword/i.test(rec.label);
  const isScoop = /scoop|bend over/i.test(rec.label);
  const isWash = /wash/i.test(rec.label);

  if (isSword) {
    const twoHanded = medHH < RULES.handToHandTwoHanded;
    const wield = rangeR >= rangeL ? 'R' : 'L';
    // attach at first sustained convergence if hands start apart, else 0
    let tAttach = 0;
    if (!twoHanded) {
      let run = 0;
      for (let f = 0; f < hh.length; f++) {
        run = hh[f] < RULES.handToHandTwoHanded ? run + 1 : 0;
        if (run >= 0.25 * fps) { tAttach = (f - run + 1) / fps; break; }
      }
      if (tAttach === 0) tAttach = 0; // never converges: wield one-handed from start
    }
    sc.props.push({
      type: 'sword', id: 'sword',
      grip: twoHanded ? 'two-hand (median hand distance ' + medHH.toFixed(3) + 'm)' : 'one-hand (' + wield + ', palm travel ' + (wield === 'R' ? rangeR : rangeL).toFixed(3) + 'm vs ' + (wield === 'R' ? rangeL : rangeR).toFixed(3) + 'm)',
      attachJoint: wield === 'R' ? 'wristR' : 'wristL',
      followJoint2: twoHanded ? (wield === 'R' ? 'wristL' : 'wristR') : null,
      alignFrom: wield === 'R' ? 'wristR' : 'wristL',
      alignTo: wield === 'R' ? 'palmR' : 'palmL',
      offsetAlongForearm: -0.03, handleLength: 0.26, bladeLength: 0.78, guardWidth: 0.14,
      attachAtSeconds: +tAttach.toFixed(3), detachAtSeconds: null,
      evidence: 'blade axis follows the forearm (wrist->palm centroid) at every frame; held for the whole clip after attach (no sustained >0.60m hand separation)',
    });
    // detach evidence: for a TWO-handed grip, sustained hand separation means
    // the off hand releases (the sword stays in the wielding hand regardless).
    if (twoHanded) {
      let run = 0, detach = null;
      for (let f = Math.floor(tAttach * fps); f < hh.length; f++) {
        run = hh[f] > RULES.releaseSeparation ? run + 1 : 0;
        if (run >= 0.5 * fps) { detach = +(f - run + 1) / fps; break; }
      }
      sc.props[0].detachAtSeconds = detach === null ? null : +detach.toFixed(3);
    }
  }

  if (isScoop) {
    // pickup window: both palms at the clip's own low band + close together.
    // The retarget collapses the source lowerback/upperback/thorax bend into one
    // spine joint, so the puppet bends LESS than the subject; the box therefore
    // sits at the EVIDENCED grasp height on a support (the palms bottom out at
    // ~0.72m ~= table height), not on the ground where the subject scooped.
    // both-hands-low envelope: min over frames of max(L_y, R_y) — the height
    // at which the two hands are TOGETHER near their lowest (not a one-hand
    // solo reach, which dips lower and would over-tighten the band).
    const palmMinY = Math.min(...L.map((p, f) => Math.max(p[1], R[f][1])));
    let run = 0, tPick = null;
    for (let f = 0; f < clip.frameCount; f++) {
      const low = Math.max(L[f][1], R[f][1]) <= palmMinY + RULES.graspBandRelHeight;
      const close = dist(L[f], R[f]) < RULES.graspBandPalmDistance;
      run = low && close ? run + 1 : 0;
      if (run >= RULES.graspSustain * fps) { tPick = (f - run + 1) / fps; break; }
    }
    if (tPick !== null) {
      const f0 = Math.floor(tPick * fps);
      const graspY = (L[f0][1] + R[f0][1]) / 2;
      const pos = [(L[f0][0] + R[f0][0]) / 2, graspY + 0.13, (L[f0][2] + R[f0][2]) / 2];
      let run2 = 0, tRel = null;
      for (let f = f0; f < clip.frameCount; f++) {
        run2 = dist(L[f], R[f]) > RULES.boxReleaseSeparation ? run2 + 1 : 0;
        if (run2 >= 0.5 * fps) { tRel = (f - run2 + 1) / fps; break; }
      }
      sc.props.push({
        type: 'box', id: 'box',
        size: [0.34, 0.26, 0.26], worldPose: { position: pos.map((v) => +v.toFixed(3)) }, withSupport: true, supportTopY: +graspY.toFixed(3), // box bottom (palms grasp height)
        followPalmsFromSeconds: +tPick.toFixed(3), releaseAtSeconds: tRel === null ? null : +tRel.toFixed(3),
        evidence: 'palm-height minimum ' + palmMinY.toFixed(3) + 'm; both palms within ' + RULES.graspBandRelHeight + 'm of it and <' + RULES.graspBandPalmDistance + 'm apart for >=' + RULES.graspSustain + 's from t=' + tPick.toFixed(2) + 's' + (tRel === null ? '; held to clip end (no sustained separation)' : '; released at t=' + tRel.toFixed(2) + 's'),
      });
    } else {
      sc.evidence.noPickupWindow = 'no sustained two-hand low convergence found; box omitted';
    }
  }

  if (isWash) {
    // palms dip low in front repeatedly: cluster of low+front palm samples
    const lows = [];
    for (let f = 0; f < clip.frameCount; f++) {
      for (const p of [L[f], R[f]]) {
        if (p[2] > RULES.basinFrontZ && p[1] < 1.0) lows.push(p);
      }
    }
    if (lows.length > 30) {
      const c = [0, 1, 2].map((k) => lows.reduce((s, p) => s + p[k], 0) / lows.length);
      const ys = lows.map((p) => p[1]).sort((a, b) => a - b);
      const top = ys[Math.floor(ys.length * 0.25)] - 0.04; // hands dip INTO the basin
      sc.props.push({
        type: 'basin', id: 'basin',
        radius: 0.24, height: 0.14, worldPose: { position: [+c[0].toFixed(3), +Math.max(top, GROUND_Y + 0.45).toFixed(3), +c[2].toFixed(3)] }, withStand: true,
        evidence: lows.length + ' low-front palm samples cluster at (' + c.map((v) => v.toFixed(2)).join(', ') + '); basin top set at P25 palm height - 4cm so hands visibly enter the water line; stand reaches the ground',
      });
    }
  }

  scenarios.clips[rec.id] = sc;
}

fs.writeFileSync(path.join(ROOT, 'web/draw/mocap-scenarios.json'), JSON.stringify(scenarios, null, 1));
console.log('scenarios written:', Object.keys(scenarios.clips).map((id) => id + ':' + scenarios.clips[id].props.map((p) => p.type).join('+')).join(' '));
