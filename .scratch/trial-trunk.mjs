
import fs from 'node:fs';
import vm from 'node:vm';
const context = { Math, console, Set, Map };
context.window = context;
vm.createContext(context);
for (const file of ['scripts/parts/lib/ganyu-lib.js','scripts/parts/lib/ganyu-cage-branch.js','scripts/parts/lib/ganyu-seam-check.js']) {
  vm.runInContext(fs.readFileSync(file,'utf8'), context, { filename: file });
}
const profileLoft = context.profileLoft;
const SIDES = 8;
const path = [0.80,0.90,1.02,1.16,1.26,1.32,1.44,1.60].map(y=>[0,y,0]);
const profiles = [
  [0.125,0.085,0.100],
  [0.150,0.100,0.120],
  [0.120,0.082,0.082],
  [0.165,0.135,0.100],
  [0.180,0.105,0.092],
  [0.055,0.050,0.048],
  [0.085,0.085,0.098],
  [0.020,0.020,0.025]
];
const sections = profiles.map(p=>({rx:p[0],ryB:p[1],ryF:p[2]}));
const mesh = profileLoft(path, sections, path.length-1, SIDES, ()=>'#d9d9de', { dataOnly:true, cap:'both', up:[0,0,1] });
const ri = mesh.ringIdx;
console.log('vertices', mesh.vertices.length, 'tris', mesh.faces.length/3, 'sides', mesh.sides, 'rings', ri.length);
console.log('ring ys:', ri.map((b,i)=>+mesh.vertices[b][1].toFixed(3)));
console.log('ring0 x-extents:', mesh.vertices.slice(ri[0],ri[0]+SIDES).map(p=>[+p[0].toFixed(3),+p[2].toFixed(3)]));
console.log('ring indices:', ri);
// seam + verify (gates)
const seam = context.seamCheck(mesh);
console.log('seam', JSON.stringify(seam));
