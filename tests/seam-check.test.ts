import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('scripts/parts/lib/ganyu-seam-check.js', 'utf8');
const context: { seamCheck?: (mesh: Mesh) => SeamReport; connectedComponents?: (mesh: Mesh) => number; Math: typeof Math } = { Math };
vm.createContext(context);
vm.runInContext(source, context);

interface Mesh { vertices: number[][]; faces: number[] }
interface SeamReport { components: number; onePiece: boolean; watertight: boolean; seamEdges: number; openEdges: number; nonManifoldEdges: number }

function box(x: number): Mesh {
  const v = [[x, 0, 0], [x + 1, 0, 0], [x + 1, 1, 0], [x, 1, 0], [x, 0, 1], [x + 1, 0, 1], [x + 1, 1, 1], [x, 1, 1]];
  const f = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 4, 0, 3, 4, 3, 7];
  return { vertices: v, faces: f };
}

test('seamCheck rejects disconnected closed components', () => {
  const a = box(0), b = box(3);
  const mesh = { vertices: a.vertices.concat(b.vertices), faces: a.faces.concat(b.faces.map(i => i + a.vertices.length)) };
  assert.equal(context.connectedComponents!(mesh), 2);
  const report = context.seamCheck!(mesh);
  assert.equal(report.watertight, true);
  assert.equal(report.components, 2);
  assert.equal(report.onePiece, false);
});

test('seamCheck accepts a connected closed mesh', () => {
  const report = context.seamCheck!(box(0));
  assert.equal(report.components, 1);
  assert.equal(report.nonManifoldEdges, 0);
  assert.equal(report.onePiece, true);
});

test('seamCheck rejects a connected non-manifold attachment', () => {
  const a = box(0);
  const mesh = { vertices: a.vertices, faces: a.faces.concat(a.faces.slice(0, 3)) };
  const report = context.seamCheck!(mesh);
  assert.equal(report.components, 1);
  assert.ok(report.nonManifoldEdges > 0);
  assert.equal(report.onePiece, false);
});

test('connectedComponents ignores unused isolated vertices', () => {
  const mesh = { vertices: box(0).vertices.concat([[99, 99, 99]]), faces: box(0).faces };
  assert.equal(context.connectedComponents!(mesh), 1);
});
