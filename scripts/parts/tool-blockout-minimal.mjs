#!/usr/bin/env node
/*
 * tool-blockout-minimal — 构建并验证极简一体人体 blockout，产出到 delivery/blockout-minimal。
 * 用法：node scripts/parts/tool-blockout-minimal.mjs [--sides 8] [--armK 3] [--legK 3] [--out delivery/blockout-minimal]
 *
 * 输出：mesh.json（原始顶点/三角面索引/逐面颜色）、work.json（预览兼容）、controls.json、
 *       report.json（实测计数 + seamCheck + verify 门禁逐项，含失败项，不做任何 gate 绕过）。
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyMesh } from '../../dist/src/mesh/verify.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const root = process.cwd();
const LIB = path.join(root, 'scripts/parts/lib');
const PARTS = path.join(root, 'scripts/parts');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && process.argv[i + 1] !== undefined) return +process.argv[i + 1];
  return def;
}
const opts = { sides: arg('sides', 8), armK: arg('armK', 3), legK: arg('legK', 3) };
function argStr(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def; }
const out = argStr('out', 'delivery/blockout-minimal');

const sources = {};
const context = { Math, console, Set, Map };
context.window = context;
vm.createContext(context);
for (const file of ['lib/ganyu-lib.js', 'lib/ganyu-cage-branch.js', 'lib/ganyu-seam-check.js', 'lib/ganyu-blockout-minimal.js']) {
  const p = path.join('scripts/parts', file);
  const source = fs.readFileSync(p, 'utf8');
  sources[p] = hash(source);
  vm.runInContext(source, context, { filename: file });
}

const cage = context.buildBlockoutMinimal(opts);
const mesh = cage.mesh;
const seam = context.seamCheck(mesh);
const gate = verifyMesh(mesh, { budget: { requested: 300, used: mesh.faces.length / 3 }, maxSamples: 8 });

// 预览 work.json（与 build-body-cage 同构，供浏览侧加载）。
const work = { version: 3, strokes: [{ id: 'blockout-minimal', points: [[208, 460]], render: 'rod', resourceId: 10009019, mesh }], options: { mode: 'extrude', shape: 'cylinder', size: 0.01, count: 10, heightMeters: 1, canvasHeightPx: 460, canvasWidthPx: 416 } };

const report = {
  checkpoint: 'blockout-minimal',
  config: opts,
  fingerprints: {
    sources,
    mesh: hash(JSON.stringify(mesh)),
    geometryNanometres: hash(JSON.stringify({ vertices: mesh.vertices.map(p => p.map(x => Math.round(x * 1e9))), faces: mesh.faces, colors: mesh.colors })),
    verifier: hash(fs.readFileSync(path.join(root, 'dist/src/mesh/verify.js')))
  },
  stage: cage.stage,
  topology: cage.topology,
  componentsExpected: cage.componentsExpected,
  metrics: cage.metrics,
  scale: cage.scale,
  referenceFit: cage.referenceFit,
  seam: {
    components: seam.components,
    openEdges: seam.openEdges,
    nonManifoldEdges: seam.nonManifoldEdges,
    seamEdges: seam.seamEdges,
    onePiece: seam.onePiece,
    watertight: seam.watertight
  },
  gate: {
    ok: gate.ok,
    checkedFaces: gate.checkedFaces,
    watertight: gate.checks.watertight,
    seams: gate.checks.seams,
    normals: gate.checks.normals,
    degenerate: gate.checks.degenerate,
    skinny: gate.checks.skinny,
    areaRatio: gate.checks.areaRatio,
    budget: gate.checks.budget,
    selfIntersections: gate.checks.selfIntersections,
    failures: gate.failures
  },
  limitations: [
    '<=300-tri clean (zero self-intersection) human is not achievable with the shared-vertex branch tools at this resolution: SIDES must be >=16 to make shoulder-root sockets planar, which raises total faces well above 300 (see tool sweep).',
    'This draft targets <=300 tris and therefore reports nonzero shoulder self-intersections (see gate.selfIntersections) — it is a visual-iteration cage, not a final export gate pass.',
    'wrist/ankle are compressed into a single band (no dedicated ring); no fingers (per spec); chest/waist/front-back sections preserved as control sections.',
    'referenceFit: not fitted; proportions are a soft manual skeleton, no reference landmark overlay.'
  ],
  visualAcceptance: 'pending-browser-capture',
  gameAcceptance: 'pending',
  exportAllowed: false // draft only — no gate bypass / no export
};

fs.mkdirSync(out, { recursive: true });
for (const [suffix, value] of [['mesh', mesh], ['work', work], ['controls', cage.controls], ['report', report]]) {
  fs.writeFileSync(path.join(out, 'blockout-minimal.' + suffix + '.json'), JSON.stringify(value, null, 2) + '\n');
}
// 简短清单
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ model: 'ganyu-blockout-minimal', config: opts, out, metrics: cage.metrics, seam: report.seam, gateOk: gate.ok, failures: gate.failures }, null, 2) + '\n');

console.log(JSON.stringify({ out, config: opts, metrics: cage.metrics, seam: report.seam, gate: { ok: gate.ok, watertight: gate.checks.watertight.pass, seams: gate.checks.seams.pass, normals: gate.checks.normals.invertedCount, degenerate: gate.checks.degenerate.count, skinny: gate.checks.skinny, areaRatio: gate.checks.areaRatio.value, selfIntersections: gate.checks.selfIntersections.intersectingPairs, budget: gate.checks.budget }, failures: gate.failures }, null, 2));
