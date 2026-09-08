
import fs from 'node:fs';
import vm from 'node:vm';
const context = { Math, console, Set, Map };
context.window = context;   // window.gms + window.__BODY_CAGE__
context.THREE = { Vector3: class { constructor(x,y,z){this.x=x;this.y=y;this.z=z;} } };
vm.createContext(context);
// load lib + branch + seam, then the body cage with SIDES patched to 8
for (const file of ['scripts/parts/lib/ganyu-lib.js','scripts/parts/lib/ganyu-cage-branch.js','scripts/parts/lib/ganyu-seam-check.js']) vm.runInContext(fs.readFileSync(file,'utf8'), context, {filename:file});
let body = fs.readFileSync('scripts/parts/ganyu-body-cage.js','utf8');
body = body.replace('var SIDES = 16;', 'var SIDES = 8;');
// The patch angle sets were tuned for 16; map to 8-side equivalents below after load.
// Run it (may throw if patch indices are invalid for 8 sides)
try {
  vm.runInContext(body, context, {filename:'ganyu-body-cage.js'});
  const mesh = context.__BODY_CAGE__.mesh;
  const { verifyMesh } = await import('/home/h/genshin-model-studio/dist/src/mesh/verify.js');
  const seam = context.seamCheck(mesh);
  const gate = verifyMesh(mesh,{budget:{requested:300,used:mesh.faces.length/3},maxSamples:1000});
  console.log('EXISTING SIDES=8 -> v',mesh.vertices.length,'t',mesh.faces.length/3,'one',seam.onePiece,'si',gate.checks.selfIntersections.intersectingPairs,'nm',gate.checks.normals.invertedCount,'deg',gate.checks.degenerate.count);
} catch(e){ console.log('EXISTING SIDES=8 THREW:', e.message); }
