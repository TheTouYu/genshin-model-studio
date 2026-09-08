import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const sources = {};
import { verifyMesh } from '../dist/src/mesh/verify.js';

const out = process.argv[2] || 'delivery/r0-toes';
const name = process.argv[3] || 'body-r2';
if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid checkpoint name');
const context = { Math, console };
context.window = context;
vm.createContext(context);
for (const file of ['lib/ganyu-lib.js', 'lib/ganyu-cage-branch.js', 'lib/ganyu-seam-check.js', 'ganyu-body-cage.js']) {
  const sourcePath = path.join('scripts/parts', file);
  const source = fs.readFileSync(sourcePath, 'utf8');
  sources[sourcePath] = hash(source);
  vm.runInContext(source, context, { filename: file });
}
const body = context.__BODY_CAGE__;
const mesh = body.mesh;
const work = { version: 3, strokes: [{ id: name, points: [[208, 460]], render: 'rod', resourceId: 10009019, mesh }], options: { mode: 'extrude', shape: 'cylinder', size: 0.01, count: 10, heightMeters: 1, canvasHeightPx: 460, canvasWidthPx: 416 } };
const report = { checkpoint: name, fingerprints: { sources, mesh: hash(JSON.stringify(mesh)), geometryNanometres: hash(JSON.stringify({ vertices: mesh.vertices.map(p => p.map(x => Math.round(x * 1e9))), faces: mesh.faces, colors: mesh.colors })), verifier: hash(fs.readFileSync('dist/src/mesh/verify.js')) }, stage: body.stage, referenceFit: body.referenceFit, metrics: body.metrics, scale: body.scale, seam: context.seamCheck(mesh), gate: verifyMesh(mesh), visualAcceptance: 'pending', gameAcceptance: 'pending' };
fs.mkdirSync(out, { recursive: true });
for (const [suffix, value] of [['mesh', mesh], ['work', work], ['controls', body.controls], ['report', report]]) {
  fs.writeFileSync(path.join(out, name + '.' + suffix + '.json'), JSON.stringify(value, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
