import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const LIB = fs.readFileSync('scripts/parts/lib/ganyu-lib.js', 'utf8');
const BRANCH = fs.readFileSync('scripts/parts/lib/ganyu-cage-branch.js', 'utf8');
const SEAM = fs.readFileSync('scripts/parts/lib/ganyu-seam-check.js', 'utf8');
const BODY = fs.readFileSync('scripts/parts/ganyu-body-cage.js', 'utf8');

interface Mesh { vertices: number[][]; faces: number[]; colors?: string[]; sides?: number; ringIdx?: number[] }
interface SeamReport {
  components: number; onePiece: boolean; watertight: boolean;
  seamEdges: number; openEdges: number; nonManifoldEdges: number;
}
type Ctx = {
  seamCheck: (m: Mesh) => SeamReport;
  extrudePatch: (m: Mesh, patchVerts: number[], rings: { c: number[]; r?: number }[], opts?: { axis?: number[]; color?: string; cap?: boolean }) => { loop: number[]; B: number };
  recoverBoundary: (m: Mesh, patchVerts: number[]) => { loop: number[]; rm: Set<number>; boundaryEdges: number };
};

function loadCtx(includeBody = false): Ctx {
  const ctx: Record<string, unknown> = { Math, console };
  const g = vm.createContext(ctx);
  vm.runInContext(LIB, g);
  vm.runInContext(BRANCH, g);
  vm.runInContext(SEAM, g);
  if (includeBody) {
    (ctx as Record<string, unknown>).window = ctx;
    (ctx as Record<string, unknown>).THREE = { Vector3: class { constructor(public x: number, public y: number, public z: number) {} } };
    vm.runInContext(BODY, g);
  }
  return ctx as unknown as Ctx;
}

function countDegenerate(m: Mesh): number {
  let deg = 0;
  for (let i = 0; i + 2 < m.faces.length; i += 3) {
    const a = m.vertices[m.faces[i]], b = m.vertices[m.faces[i + 1]], c = m.vertices[m.faces[i + 2]];
    if (!a || !b || !c) { deg++; continue; }
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const area = 0.5 * Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]);
    if (area < 1e-11) deg++;
  }
  return deg;
}

function assertOnePieceWatertight(rep: SeamReport, label: string) {
  assert.equal(rep.components, 1, `${label}: one connected component`);
  assert.equal(rep.openEdges, 0, `${label}: no open boundary edges`);
  assert.equal(rep.nonManifoldEdges, 0, `${label}: no non-manifold edges`);
  assert.equal(rep.seamEdges, 0, `${label}: no coincident-index seams`);
  assert.equal(rep.onePiece, true, `${label}: onePiece`);
  assert.equal(rep.watertight, true, `${label}: watertight`);
}

/** 有向环一致性：环首尾闭合、每条边界边恰出现一次、每顶点出度=入度=1。 */
function assertOrientedBoundary(ctx: Ctx, m: Mesh, patchVerts: number[]) {
  const rb = ctx.recoverBoundary(m, patchVerts);
  const loop = rb.loop;
  assert.ok(loop.length >= 4, 'boundary loop has >= 4 vertices');
  assert.equal(loop.length, rb.boundaryEdges, 'loop length equals boundary edge count (no splits)');
  // each consecutive directed edge is a distinct undirected boundary edge
  const undirected = new Set<string>();
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const k = a < b ? `${a}:${b}` : `${b}:${a}`;
    undirected.add(k);
  }
  assert.equal(undirected.size, loop.length, 'no duplicate boundary edge (simple cycle)');
  // every boundary vertex has exactly one outgoing and one incoming boundary edge
  const out = new Map<number, number>(), inDeg = new Map<number, number>();
  for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; out.set(a, b); inDeg.set(b, (inDeg.get(b) || 0) + 1); }
  for (const a of loop) { assert.equal(out.has(a), true, `vertex ${a} has an outgoing boundary edge`); assert.equal(inDeg.get(a), 1, `vertex ${a} has exactly one incoming boundary edge`); }
  return rb;
}

/** 封闭圆柱管：nRings 环 × sides 角，两端扇形盖 → 闭合。作为 extrudePatch 的“体/面片夹具”。 */
function makeTube(nRings: number, sides: number, rTop: number, rBot: number): Mesh {
  const vertices: number[][] = [], faces: number[] = [], ringIdx: number[] = [];
  for (let r = 0; r < nRings; r++) {
    ringIdx.push(vertices.length);
    const t = r / (nRings - 1), rad = rTop + (rBot - rTop) * t;
    for (let j = 0; j < sides; j++) { const a = j / sides * Math.PI * 2; vertices.push([Math.cos(a) * rad, t, Math.sin(a) * rad]); }
  }
  for (let r = 0; r < nRings - 1; r++) for (let j = 0; j < sides; j++) {
    const n = (j + 1) % sides, A = ringIdx[r] + j, B = ringIdx[r] + n, C = ringIdx[r + 1] + n, D = ringIdx[r + 1] + j;
    faces.push(A, B, C, A, C, D);
  }
  const c0 = vertices.length; vertices.push([0, 0, 0]);
  for (let j = 0; j < sides; j++) { const n = (j + 1) % sides; faces.push(c0, ringIdx[0] + n, ringIdx[0] + j); }
  const c1 = vertices.length; vertices.push([0, 1, 0]);
  for (let j = 0; j < sides; j++) { const n = (j + 1) % sides; faces.push(c1, ringIdx[nRings - 1] + j, ringIdx[nRings - 1] + n); }
  return { vertices, faces, colors: faces.map(() => '#ccc'), sides, ringIdx };
}

function blockVerts(m: Mesh, rings: number[], angles: number[]): number[] {
  const out: number[] = [];
  const ri = m.ringIdx!;
  for (const r of rings) for (const a of angles) out.push(ri[r] + a);
  return out;
}

/* ------------------------- body (ganyu-body-cage.js) ------------------------- */

test('ganyu body: single manifold watertight mesh with arms and two legs', () => {
  const ctx = loadCtx(true);
  const mesh = (ctx as unknown as { __BODY_CAGE__: { mesh: Mesh; scale: { height: number; front: string } } }).__BODY_CAGE__.mesh;
  const rep = ctx.seamCheck(mesh);
  assertOnePieceWatertight(rep, 'ganyu body');
  assert.equal(countDegenerate(mesh), 0, 'no degenerate triangles');

  const ys = mesh.vertices.map(p => p[1]);
  const h = Math.max(...ys) - Math.min(...ys);
  assert.ok(h > 1.5 && h < 1.7, `height ~1.60 m (got ${h.toFixed(3)})`);
  // limbs extend the silhouette beyond the bare trunk (arms at |x|>0.20, legs reach near ground)
  const xs = mesh.vertices.map(p => p[0]);
  assert.ok(Math.max(...xs.map(Math.abs)) > 0.25, 'arms extend laterally beyond torso width');
  assert.ok(Math.min(...ys) < 0.05, 'legs reach down toward the ground');
  // front faces +Z
  assert.equal((ctx as unknown as { __BODY_CAGE__: { scale: { front: string } } }).__BODY_CAGE__.scale.front, '+Z');
  assert.ok(mesh.vertices.length > 300 && mesh.faces.length / 3 > 600, 'mesh has trunk + 4 limbs (coarse but populated)');
});

/* ------------------------- patch fixture (closed tube) ------------------------- */

test('extrudePatch grows a continuous watertight branch from a closed tube', () => {
  const ctx = loadCtx();
  const m = makeTube(6, 8, 0.5, 0.5);
  assertOnePieceWatertight(ctx.seamCheck(m), 'closed tube fixture');
  const patchVerts = blockVerts(m, [2, 3, 4], [0, 1, 2]); // 2-band × 2-quad disk patch
  const before = m.faces.length / 3;
  const res = ctx.extrudePatch(m, patchVerts, [
    { c: [0.62, 0.5, 0.0], r: 0.16 },
    { c: [0.9, 0.5, 0.0], r: 0.12 },
    { c: [1.1, 0.5, 0.0], r: 0.08 },
  ], { axis: [1, 0, 0], color: '#ff0000' });
  const rep = ctx.seamCheck(m);
  assertOnePieceWatertight(rep, 'tube + extruded branch');
  assert.equal(countDegenerate(m), 0, 'no degenerate triangles after extrudePatch');
  assert.ok(m.faces.length / 3 > before, 'extrusion added surface area');
  assert.equal(res.B, 8, '2-band × 2-quad rim recovers an 8-vertex oriented boundary');
});

test('extrudePatch rings span a uniform full circle (fix: no clustered planar fins)', () => {
  const ctx = loadCtx();
  const m = makeTube(6, 8, 0.5, 0.5);
  const patchVerts = blockVerts(m, [2, 3, 4], [0, 1, 2]);
  const vBefore = m.vertices.length;
  ctx.extrudePatch(m, patchVerts, [
    { c: [0.62, 0.5, 0.0], r: 0.16 },
    { c: [0.9, 0.5, 0.0], r: 0.12 },
  ], { axis: [1, 0, 0], color: '#ff0000' });
  const B = 8;
  const ring1 = m.vertices.slice(vBefore, vBefore + B); // first generated ring
  // basis for axis [1,0,0]: u = [0,0,1], v = [0,-1,0]
  const u: number[] = [0, 0, 1], vv: number[] = [0, -1, 0], c: number[] = [0.62, 0.5, 0.0];
  const angles = ring1.map(p => Math.atan2((p[1] - c[1]) * vv[1] + (p[2] - c[2]) * vv[2], (p[1] - c[1]) * u[1] + (p[2] - c[2]) * u[2]))
    .sort((a, b) => a - b);
  // max cyclic gap between consecutive ring vertices -> uniform circle (π/4) not a narrow cluster (≈2π)
  let maxGap = 0;
  for (let i = 0; i < angles.length; i++) { const n = (i + 1) % angles.length; const gap = n === 0 ? (angles[0] + 2 * Math.PI) - angles[i] : angles[n] - angles[i]; maxGap = Math.max(maxGap, gap); }
  assert.ok(maxGap < Math.PI / 2, `ring vertices uniformly span full circle (maxGap=${maxGap.toFixed(3)} rad)`);
});

test('extrudePatch keeps the color array aligned with faces after removing the patch (fix: no color spill)', () => {
  const ctx = loadCtx();
  const m = makeTube(6, 8, 0.5, 0.5);
  const patchVerts = blockVerts(m, [2, 3, 4], [0, 1, 2]);
  ctx.extrudePatch(m, patchVerts, [{ c: [0.62, 0.5, 0.0], r: 0.16 }], { axis: [1, 0, 0], color: '#ff0000' });
  assert.equal(m.colors!.length, m.faces.length / 3, 'colors array is re-indexed to match the rebuilt faces');
  let red = 0;
  for (let i = 0; i < m.faces.length / 3; i++) { assert.ok(m.colors![i] === '#ccc' || m.colors![i] === '#ff0000', `face ${i} color is a valid trunk or branch color`); if (m.colors![i] === '#ff0000') red++; }
  assert.equal(red, 8 * 2 + 8, 'branch wall (8 quads=2 tris) + cap fan (8 tris) all carry the branch color');
});

test('recoverBoundary returns an oriented simple loop on the tube fixture', () => {
  const ctx = loadCtx();
  const m = makeTube(6, 8, 0.5, 0.5);
  const patchVerts = blockVerts(m, [2, 3, 4], [0, 1, 2]);
  const rb = assertOrientedBoundary(ctx, m, patchVerts);
  assert.equal(rb.boundaryEdges > 0, true);
});

test('extrudePatch rejects a non-disk patch (no allowInterior bypass)', () => {
  const ctx = loadCtx();
  const m = makeTube(6, 8, 0.5, 0.5);
  // two disjoint 2x2 disks -> combined boundary is not a single simple cycle
  const patchA = blockVerts(m, [1, 2, 3], [0, 1]);
  const patchB = blockVerts(m, [3, 4, 5], [4, 5]);
  const union = [...new Set([...patchA, ...patchB])];
  assert.throws(() => ctx.recoverBoundary(m, union), /not a simple loop/i);
});

test('extrudePatch rejects a patch covering the whole surface (no boundary)', () => {
  const ctx = loadCtx();
  const m = makeTube(3, 8, 0.5, 0.5);
  const all = m.vertices.map((_, i) => i);
  assert.throws(() => ctx.recoverBoundary(m, all), /not a disk|no boundary/i);
});

/* ------------------------- seam detector is not weakened ------------------------- */

test('seamCheck still flags coincident-coordinate seams (detector not weakened)', () => {
  const ctx = loadCtx();
  // two triangles occupy identical coordinates but use different vertex indices
  const mesh: Mesh = {
    vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0]],
    faces: [0, 1, 2, 3, 4, 5],
  };
  const rep = ctx.seamCheck(mesh);
  assert.ok(rep.seamEdges > 0, 'coincident-coordinate seams are still reported');
  assert.equal(rep.onePiece, false);
});

test('extrudeRing still refuses an interior full-ring branch without allowInterior', () => {
  const ctx = loadCtx();
  const m = makeTube(6, 8, 0.5, 0.5);
  assert.throws(() => (ctx as unknown as { extrudeRing: (m: Mesh, r: number, o: object) => void }).extrudeRing(m, 3, { seg: 2, dir: [1, 0, 0], length: 0.2 }), /full-ring branch requires an open boundary ring/i);
});

test('body controls preserve exact bilateral symmetry and volumetric feet', () => {
  const ctx = loadCtx(true) as unknown as {__BODY_CAGE__: {mesh: Mesh}};
  const m = ctx.__BODY_CAGE__.mesh;
  for (const p of m.vertices) {
    const mirrorDistance = Math.min(...m.vertices.map(q => Math.hypot(p[0]+q[0], p[1]-q[1], p[2]-q[2])));
    assert.ok(mirrorDistance < 1e-8, 'every vertex has an exact reflected partner');
  }
  const forefoot = m.vertices.filter(p => p[0] > 0 && p[2] > 0.15 && p[1] < 0.08);
  assert.ok(forefoot.length >= 8);
  const thickness = Math.max(...forefoot.map(p => p[1])) - Math.min(...forefoot.map(p => p[1]));
  assert.ok(thickness >= 0.035, 'forefoot has at least 35 mm vertical thickness');
  const front = m.vertices.filter(p => Math.abs(p[1]-1.16) < 1e-8 && Math.abs(p[0]) < 0.01);
  assert.ok(Math.max(...front.map(p => p[2])) > -Math.min(...front.map(p => p[2])), 'chest protrudes toward world +Z');
  assert.equal(m.colors!.length, m.faces.length/3);
  const edges = new Map<string, number>();
  for (let i=0;i<m.faces.length;i+=3) for(let j=0;j<3;j++) {
    const a=m.faces[i+j], b=m.faces[i+(j+1)%3], key=[Math.min(a,b),Math.max(a,b)].join(':');
    edges.set(key,(edges.get(key)||0)+(a<b?1:-1));
  }
  assert.ok([...edges.values()].every(n=>n===0), 'shared edges have opposite directed winding');
});

test('body grows a flat palm disc from the wrist (shared boundary, one piece)', () => {
  const ctx = loadCtx(true) as unknown as Ctx & {__BODY_CAGE__: {mesh: Mesh}};
  const m = ctx.__BODY_CAGE__.mesh;
  // left hand region (wrist + palm disc), world +X side, below forearm
  const left = m.vertices.filter(p => p[0] > 0 && Math.abs(p[0]) > 0.24 && p[1] < 0.80 && p[1] > 0.58);
  assert.ok(left.length >= 8, 'palm/hand region populated');
  // palm disc = flat rings below the wrist ring (wrist y~0.775, disc y<0.755)
  const disc = left.filter(p => p[1] < 0.755);
  assert.ok(disc.length >= 6, 'palm disc rings present');
  const discWidth = Math.max(...disc.map(p=>p[0])) - Math.min(...disc.map(p=>p[0]));
  const discThick = Math.max(...disc.map(p=>p[2])) - Math.min(...disc.map(p=>p[2]));
  const handLen = Math.max(...left.map(p=>p[1])) - Math.min(...left.map(p=>p[1]));
  assert.ok(discWidth > 0.05, 'palm width ~0.085 (got ' + discWidth.toFixed(4) + ')');
  assert.ok(discThick < 0.06, 'palm disc is thin/not a fat slab (thick ' + discThick.toFixed(4) + ')');
  assert.ok(discWidth > 2 * discThick, 'palm is a wide flat disc (w ' + discWidth.toFixed(3) + ' vs t ' + discThick.toFixed(3) + ')');
  assert.ok(handLen > 0.05, 'palm length ~0.09 (got ' + handLen.toFixed(4) + ')');
  // palm shares the wrist boundary => still one watertight component, no coincident seam
  const rep = ctx.seamCheck(m);
  assert.equal(rep.components, 1, 'palm keeps one connected component');
  assert.equal(rep.watertight, true, 'palm keeps watertight');
  assert.equal(rep.seamEdges, 0, 'palm shares the wrist boundary (no coincident-index seam)');
});
