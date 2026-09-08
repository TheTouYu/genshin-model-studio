import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load() {
  const c = vm.createContext({ Math, Set, Map, console });
  vm.runInContext(fs.readFileSync('scripts/parts/lib/ganyu-anatomy-cage.js', 'utf8'), c);
  return c;
}

test('anatomy graph exposes semantic shoulder controls and stable edge graph', () => {
  const c = load();
  const graph = c.createAnatomyControlGraph();
  for (const id of ['clavicleL','acromionL','axillaFrontL','axillaBackL','upperArmRootL','clavicleR','acromionR','upperArmRootR']) {
    assert.equal(graph.points[id].length, 3, id);
  }
  assert.ok(graph.edges.some((e:any[]) => e[0] === 'clavicleL' && e[1] === 'acromionL'));
  assert.ok(graph.edges.some((e:any[]) => e[0] === 'acromionL' && e[1] === 'upperArmRootL'));
  assert.deepEqual(Array.from(c.anatomyControlPoint(graph, 'acromionL')), [-0.205, 1.235, 0.005]);
});

test('anatomy cage stays under the rough-blockout budget and emits wireframe provenance', () => {
  const c = load();
  const cage = c.buildAnatomyCage(c.createAnatomyControlGraph(), { sides: 6, targetFaces: 300 });
  assert.equal(cage.stage, 'control-cage');
  assert.equal(cage.stats.controlPoints, Object.keys(cage.graph.points).length);
  assert.ok(cage.stats.faces <= 300, String(cage.stats.faces));
  assert.equal(cage.stats.withinBudget, true);
  const wire = c.cageWireframe(cage);
  assert.equal(wire.points.length, cage.stats.controlPoints);
  assert.equal(wire.edges.length, cage.stats.edges);
  assert.equal(wire.faces.length, cage.mesh.faces.length);
  assert.equal(cage.provenance.generatedFrom, 'semantic anatomy control graph');
});

test('moving acromion changes shoulder span without changing graph topology', () => {
  const c = load();
  const graph = c.createAnatomyControlGraph();
  const before = c.buildAnatomyCage(graph, { sides: 6 });
  const beforePoint = c.anatomyControlPoint(graph, 'acromionL');
  c.moveAnatomyControlPoint(graph, 'acromionL', [-0.04, 0, 0]);
  const after = c.buildAnatomyCage(graph, { sides: 6 });
  assert.equal(graph.edges.length, before.graph.edges.length);
  assert.equal(c.anatomyControlPoint(graph, 'acromionL')[0], beforePoint[0] - 0.04);
  assert.notDeepEqual(after.mesh.vertices, before.mesh.vertices);
  assert.equal(after.stats.faces, before.stats.faces);
});

test('cage density is independent from semantic control points', () => {
  const c = load();
  const graph = c.createAnatomyControlGraph();
  const coarse = c.buildAnatomyCage(graph, { sides: 4 });
  const elevated = c.buildAnatomyCage(graph, { sides: 12 });
  assert.equal(coarse.stats.controlPoints, elevated.stats.controlPoints);
  assert.equal(coarse.stats.edges, elevated.stats.edges);
  assert.ok(elevated.stats.faces > coarse.stats.faces);
  assert.deepEqual(JSON.parse(JSON.stringify(c.cageWireframe(coarse).points)), JSON.parse(JSON.stringify(c.cageWireframe(elevated).points)));
});

test('structural report rejects a collapsed shoulder and accepts the semantic default', () => {
  const c = load();
  const graph = c.createAnatomyControlGraph();
  const good = c.anatomyStructureReport(graph);
  assert.equal(good.pass, true, JSON.stringify(good));
  assert.ok(good.measurements.shoulderWidth > good.measurements.upperArmWidth);
  c.moveAnatomyControlPoint(graph, 'acromionL', { pos: [-0.03, 1.16, 0] });
  const bad = c.anatomyStructureReport(graph);
  assert.equal(bad.checks.shoulderWiderThanArm, false);
  assert.equal(bad.pass, false);
});

