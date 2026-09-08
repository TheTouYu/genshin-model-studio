/**
 * gen-anim-candidate-mesh.mjs — Derive the animation candidate mesh from the
 * user-approved static baseline delivery/body-blockout-r1 (113v / 222t).
 *
 * Evidence-driven minimal local modifications (topology UNCHANGED — same vertex
 * count, same face indices, same regions; baseline files never touched):
 *
 *  1. FOOT PLATES y 0.035 -> 0.075 (8 vertices: footL/footR plates)
 *     Rationale: under ANY rotation-only retarget, the sole-normal tracking
 *     error is bounded below by |angle(u_target, sole_target) - angle(u_source, sole_source)|
 *     = |65.9deg - 75.9deg| = 10.0deg (r1, toe-centroid primary). The source
 *     ankle joint sits 4.3cm above its sole; the r1 ankle pivot sits 8.5cm above
 *     the plate. Raising the plate to 0.075 makes ankle->sole 4.5cm ~= source
 *     4.3cm and reduces the structural residual to 0.8deg, so BOTH the foot
 *     direction AND the sole normal can track the source exactly.
 *
 *  2. PALM PLATES reoriented from horizontal (normal +-Y) to vertical blades
 *     (normal +-X, palm facing the body) (8 vertices: palmL/palmR).
 *     Rationale: a real palm normal is perpendicular to the hand/finger
 *     direction; the source T-pose hand has angle(u, palm_n) = 90deg while the
 *     r1 horizontal plate has angle(u_t, n_t) = 6.3deg — an 83.8deg structural
 *     twist mismatch that no rotation-only retarget can resolve (grips/props
 *     would be rotated ~90deg). The vertical blade gives ~96deg ~= 90deg
 *     (6.3deg residual).
 *
 * Invariants verified: vertex/face counts, face indices untouched, watertight
 * (every edge shared by exactly 2 faces), left/right mirror symmetry,
 * non-target vertices bit-identical, region ids unchanged.
 * Output: delivery/body-blockout-anim-r1a/{mesh.json,controls.json,candidate.json}
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const BASE = path.join(ROOT, 'delivery/body-blockout-r1');
const OUT = path.join(ROOT, 'delivery/body-blockout-anim-r1a');

const mesh = JSON.parse(fs.readFileSync(path.join(BASE, 'mesh.json'), 'utf8'));
const controls = JSON.parse(fs.readFileSync(path.join(BASE, 'controls.json'), 'utf8'));
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const before = mesh.vertices.map(v => [...v]);
const changed = [];

// ---- 1. foot plates: y 0.035 -> 0.075 --------------------------------------
const FOOT_Y = { from: 0.035, to: 0.075 };
for (const side of ['footL', 'footR']) {
  for (const i of controls.regions[side]) {
    const v = mesh.vertices[i];
    if (Math.abs(v[1] - FOOT_Y.from) < 1e-9) {
      v[1] = FOOT_Y.to;
      changed.push({ vertex: i, region: side, before: [...before[i]], after: [...v] });
    }
  }
}

// ---- 2. palm plates: horizontal -> vertical blade (palm faces the body) ----
// Keep each plate centre fixed; the long axis (was +x/-x extent 7.6cm) becomes
// the along-arm direction (down-outward unit u, from wrist pivot to old plate
// centre); the short axis stays +-z (3.6cm). Loop order preserved so face
// winding/topology are untouched.
// Palm loop orders: the mesh's RIGHT-side rings flip the z pattern
// (wristRring = [z-, z+, z+, z-] vs wristLring = [z+, z-, z-, z+]) to keep
// outward winding under mirroring. The reoriented palm plates must follow the
// same convention or the ring->plate connecting quads fold and self-intersect
// (4 rest-pose crossings when the identity order was used on the right side).
const PALM_ORDER = { L: [0, 1, 2, 3], R: [1, 0, 3, 2] };
for (const [side, wristId] of [['palmL', 'wristL'], ['palmR', 'wristR']]) {
  const ids = controls.regions[side];
  const old = ids.map(i => [...mesh.vertices[i]]);
  const centre = [0, 1, 2].map(k => old.reduce((s, v) => s + v[k], 0) / old.length);
  const wrist = { L: [-0.3, 0.76, 0], R: [0.3, 0.76, 0] }[side.slice(-1)];
  const u = [centre[0] - wrist[0], centre[1] - wrist[1], centre[2] - wrist[2]];
  const ul = Math.hypot(...u); u[0] /= ul; u[1] /= ul; u[2] /= ul;
  // half-extents measured from the original quad: long 7.6/2, short 3.6/2
  const a = Math.abs(old[0][0] - old[2][0]) / 2; // along-arm half extent
  const b = Math.abs(old[0][2] - old[1][2]) / 2; // z half extent
  // canonical L loop: [near+z, near-z, far-z, far+z]; near = toward wrist
  const near = [centre[0] - u[0] * a, centre[1] - u[1] * a, centre[2] - u[2] * a];
  const far = [centre[0] + u[0] * a, centre[1] + u[1] * a, centre[2] + u[2] * a];
  const base = [[near[0], near[1], near[2] + b], [near[0], near[1], near[2] - b], [far[0], far[1], far[2] - b], [far[0], far[1], far[2] + b]];
  const nw = PALM_ORDER[side.slice(-1)].map(k => base[k]);
  ids.forEach((i, k) => { mesh.vertices[i] = nw[k].map(x => Math.round(x * 1e6) / 1e6); changed.push({ vertex: i, region: side, before: [...before[i]], after: [...mesh.vertices[i]] }); });
}

// ---- invariants -------------------------------------------------------------
const inv = {};
inv.vertexCount = mesh.vertices.length;
inv.faceCount = mesh.faces.length / 3;
inv.vertexCountUnchanged = mesh.vertices.length === before.length;
inv.facesUntouched = true; // we never touched mesh.faces
// watertight: every undirected edge shared by exactly 2 triangles
const edgeKey = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
const edgeCount = new Map();
for (let f = 0; f < mesh.faces.length; f += 3) {
  const tri = [mesh.faces[f], mesh.faces[f + 1], mesh.faces[f + 2]];
  for (let k = 0; k < 3; k++) {
    const key = edgeKey(tri[k], tri[(k + 1) % 3]);
    edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
  }
}
inv.watertight = [...edgeCount.values()].every(c => c === 2);
inv.edgeCount = edgeCount.size;
// mirror symmetry: mirror L<->R by -x on paired regions
{
  const pairs = [['footL', 'footR'], ['palmL', 'palmR'], ['ankleL', 'ankleR'], ['kneeL', 'kneeR'], ['thighL', 'thighR'], ['upperArmL', 'upperArmR'], ['elbowL', 'elbowR'], ['wristL', 'wristR']];
  let maxAsym = 0;
  for (const [rl, rr] of pairs) {
    // pair by (z asc, y asc, x): L side x asc, R side x DESC (x mirrors sign)
    const zy = (p, q) => p[2] - q[2] || p[1] - q[1];
    const Ls = controls.regions[rl].map(i => mesh.vertices[i]).sort((p, q) => zy(p, q) || p[0] - q[0]);
    const Rs = controls.regions[rr].map(i => mesh.vertices[i]).sort((p, q) => zy(p, q) || q[0] - p[0]);
    Ls.forEach((v, k) => { maxAsym = Math.max(maxAsym, Math.hypot(v[0] + Rs[k][0], v[1] - Rs[k][1], v[2] - Rs[k][2])); });
  }
  inv.mirrorMaxAsymmetry = maxAsym;
}
// non-target vertices identical
inv.nonTargetIdentical = before.every((v, i) => changed.some(c => c.vertex === i) ? true : JSON.stringify(v) === JSON.stringify(mesh.vertices[i]));
// rest self-intersections (non-adjacent triangle pairs) — must be 0; this exact
// check caught the right-palm loop-order fold (4 crossings) when the identity
// z-order was used on the mirrored side.
{
  const T = mesh.faces.length / 3;
  const tris = [];
  for (let t = 0; t < T; t++) tris.push([0, 1, 2].map((k) => mesh.vertices[mesh.faces[3 * t + k]]));
  const byV = new Map();
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { const v = mesh.faces[3 * t + k]; if (!byV.has(v)) byV.set(v, []); byV.get(v).push(t); }
  const ADJ = new Set();
  for (const [, ts] of byV) for (let a = 0; a < ts.length; a++) for (let b = a + 1; b < ts.length; b++) ADJ.add(Math.min(ts[a], ts[b]) * 1000 + Math.max(ts[a], ts[b]));
  const seg = (p, q, tri) => {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const n = crs(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
    const d0 = dot(sub(p, tri[0]), n), d1 = dot(sub(q, tri[0]), n);
    if ((d0 > 0 && d1 > 0) || (d0 < 0 && d1 < 0)) return false;
    const dir = sub(q, p), da = dot(dir, n);
    let t;
    if (Math.abs(da) > 1e-12) { t = dot(sub(tri[0], p), n) / da; if (t < -1e-9 || t > 1 + 1e-9) return false; }
    else { if (Math.abs(dot(sub(tri[0], p), n)) > 1e-9) return false; t = 0.5; }
    const ip = [p[0] + dir[0] * t, p[1] + dir[1] * t, p[2] + dir[2] * t];
    const a = sub(tri[1], tri[0]), b = sub(tri[2], tri[0]), c = sub(ip, tri[0]);
    const d00 = dot(a, a), d01 = dot(a, b), d11 = dot(b, b), d20 = dot(c, a), d21 = dot(c, b);
    const den = d00 * d11 - d01 * d01;
    if (Math.abs(den) < 1e-18) return false;
    const u = (d11 * d20 - d01 * d21) / den, v = (d00 * d21 - d01 * d20) / den;
    return u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9;
  };
  let hits = 0;
  for (let i = 0; i < T; i++) for (let j = i + 1; j < T; j++) {
    if (ADJ.has(i * 1000 + j)) continue;
    const A = tris[i], B = tris[j];
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of [...A, ...B]) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    if (lo[0] < -Infinity + 1) continue;
    // cheap bbox test
    let ok = true;
    for (let k = 0; k < 3; k++) { if (Math.max(...[...A, ...B].map(p => p[k])) - Math.min(...[...A, ...B].map(p => p[k])) > 1) { ok = false; break; } }
    if (!ok) continue;
    if (seg(A[0], A[1], B) || seg(A[1], A[2], B) || seg(A[2], A[0], B) || seg(B[0], B[1], A) || seg(B[1], B[2], A) || seg(B[2], B[0], A)) hits++;
  }
  inv.restSelfIntersections = hits;
}

// ---- write -------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'mesh.json'), JSON.stringify(mesh, null, 1));
// controls: same regions; keep everything else from baseline for tool compat, patch vertices list if present
if (Array.isArray(controls.vertices)) {
  controls.vertices = controls.vertices.map((v, i) => (changed.some(c => c.vertex === i) ? [...mesh.vertices[i]] : v));
}
fs.writeFileSync(path.join(OUT, 'controls.json'), JSON.stringify(controls, null, 1));

const candidate = {
  schemaVersion: 1,
  id: 'body-blockout-anim-r1a',
  baseline: { dir: 'delivery/body-blockout-r1', meshSha256: sha256(path.join(BASE, 'mesh.json')), controlsSha256: sha256(path.join(BASE, 'controls.json')), vertexCount: before.length, faceCount: mesh.faces.length / 3 },
  rationale: [
    'Foot plates y 0.035->0.075: r1 ankle pivot is 8.5cm above the sole plate while the CMU subject-02 ankle joint sits 4.3cm above its sole; with toe-centroid primary the structural sole residual is 10.0deg and with whole-plate centroid 36.5deg (the reported constant toes-up). At 0.075 the ankle->sole height is 4.5cm and the structural residual drops to 0.8deg, letting direction AND sole both track the source.',
    'Palm plates horizontal->vertical blade (palm faces body): a real palm normal is perpendicular to the hand direction (source T-pose angle 90deg); the horizontal plate gives 6.3deg -> 83.8deg structural twist mismatch (grips/props would roll ~90deg). Vertical blade: 96deg, residual 6.3deg.',
  ],
  diffs: changed,
  invariants: inv,
};
fs.writeFileSync(path.join(OUT, 'candidate.json'), JSON.stringify(candidate, null, 1));
console.log(JSON.stringify({ out: OUT, changed: changed.length, invariants: inv }, null, 2));
