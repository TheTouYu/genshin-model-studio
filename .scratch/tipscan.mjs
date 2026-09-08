import fs from 'node:fs';
import vm from 'node:vm';
import { verifyMesh } from '../dist/src/mesh/verify.js';
// Try different crotch tip Y values by patching ganyu-body-cage.js source
const src = fs.readFileSync('scripts/parts/ganyu-body-cage.js', 'utf8');
for (const tipY of [0.855, 0.88, 0.90, 0.92, 0.94]) {
  // patch the tip line in source: "mesh.vertices[SIDES * path.length][1] = 0.855;"
  const patched = src.replace(/mesh.vertices[SIDES * path.length][1] = [0-9.]+;/, 'mesh.vertices[SIDES * path.length][1] = ' + tipY + ';');
  const context = { Math, console };
  context.window = context; vm.createContext(context);
  for (const file of ['lib/ganyu-lib.js', 'lib/ganyu-cage-branch.js', 'lib/ganyu-seam-check.js', 'ganyu-body-cage.js']) {
    if (file === 'ganyu-body-cage.js') vm.runInContext(patched, context, {filename:file}); else vm.runInContext(fs.readFileSync('scripts/parts/'+file,'utf8'), context, {filename:file});
  }
  const mesh = context.__BODY_CAGE__.mesh;
  const res = verifyMesh(mesh, { maxSamples: 100000 });
  const ip = res.checks.selfIntersections.intersectingPairs;
  const seam = context.seamCheck(mesh);
  console.log('tipY=' + tipY + ' intersectingPairs=' + ip + ' watertight=' + seam.watertight + ' onePiece=' + seam.onePiece + ' verts=' + mesh.vertices.length + ' faces=' + mesh.faces.length/3);
}
