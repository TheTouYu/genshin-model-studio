import fs from 'node:fs';
import vm from 'node:vm';
import { verifyMesh } from '../dist/src/mesh/verify.js';
const src = fs.readFileSync('scripts/parts/ganyu-body-cage.js', 'utf8');
// Add tip index (SIDES*path.length) into both leg patches
const patched = src
  .replace("var legL = blockVerts([0, 1], [15, 0, 1, 2]);", "var legL = blockVerts([0, 1], [15, 0, 1, 2]).concat([SIDES*path.length]);")
  .replace("var legR = blockVerts([0, 1], [6, 7, 8, 9]);", "var legR = blockVerts([0, 1], [6, 7, 8, 9]).concat([SIDES*path.length]);");
const context = { Math, console }; context.window = context; vm.createContext(context);
for (const file of ['lib/ganyu-lib.js', 'lib/ganyu-cage-branch.js', 'lib/ganyu-seam-check.js', 'ganyu-body-cage.js']) {
  vm.runInContext(file==='ganyu-body-cage.js'?patched:fs.readFileSync('scripts/parts/'+file,'utf8'), context, {filename:file});
}
const mesh = context.__BODY_CAGE__.mesh;
try {
  const res = verifyMesh(mesh, { maxSamples: 100000 });
  console.log('intersectingPairs=' + res.checks.selfIntersections.intersectingPairs);
  console.log('watertight=' + res.checks.watertight.pass + ' normals=' + res.checks.normals.pass + ' degenerate=' + res.checks.degenerate.count + ' skinny=' + res.checks.skinny.pass + ' areaRatio=' + res.checks.areaRatio.value);
  const seam = context.seamCheck(mesh);
  console.log('seam: open='+seam.openEdges+' nonmanifold='+seam.nonManifoldEdges+' seams='+seam.seamEdges+' components='+seam.components);
  console.log('verts=' + mesh.vertices.length + ' faces=' + mesh.faces.length/3);
  // mirror check
  let maxMirror = 0;
  for (const p of mesh.vertices) {
    const d = Math.min(...mesh.vertices.map(q=>Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2])));
    if (d>maxMirror) maxMirror=d;
  }
  console.log('maxMirrorDist=' + maxMirror);
} catch (e) {
  console.log('THREW: ' + e.message);
}
