import fs from 'node:fs';
import vm from 'node:vm';
const context = { Math, console };
context.window = context;
vm.createContext(context);
for (const file of ['lib/ganyu-lib.js', 'lib/ganyu-cage-branch.js', 'lib/ganyu-seam-check.js', 'ganyu-body-cage.js']) {
  vm.runInContext(fs.readFileSync('scripts/parts/' + file, 'utf8'), context, { filename: file });
}
const body = context.__BODY_CAGE__;
const mesh = body.mesh; const v = mesh.vertices;
const branches = body.branches;
for (const key of ['armL','legL']) {
  const br = branches[key];
  console.log('==== ' + key + ': loop len=' + br.loop.length + ' rings=' + br.rings.length + ' ====');
  // ring0 = loop (boundary), ring1 = first generated
  const r0 = br.rings[0], r1 = br.rings[1];
  console.log('ring0 (boundary) coords (angular j):');
  r0.forEach((id, j) => { const p=v[id]; console.log('  j'+j+' id'+id+' '+p.map(x=>x.toFixed(4)).join(',')); });
  console.log('ring1 (first generated) coords:');
  r1.forEach((id, j) => { const p=v[id]; console.log('  j'+j+' id'+id+' '+p.map(x=>x.toFixed(4)).join(',')); });
  // bounding box of loop
  const xs=r0.map(id=>v[id][0]), ys=r0.map(id=>v[id][1]), zs=r0.map(id=>v[id][2]);
  console.log('loop bbox x['+Math.min(...xs).toFixed(4)+','+Math.max(...xs).toFixed(4)+'] y['+Math.min(...ys).toFixed(4)+','+Math.max(...ys).toFixed(4)+'] z['+Math.min(...zs).toFixed(4)+','+Math.max(...zs).toFixed(4)+']');
  // loop centroid
  const cx=xs.reduce((a,b)=>a+b)/r0.length, cy=ys.reduce((a,b)=>a+b)/r0.length, cz=zs.reduce((a,b)=>a+b)/r0.length;
  console.log('loop centroid', [cx,cy,cz].map(x=>x.toFixed(4)).join(','));
  console.log('ring1 centroid', [r1.reduce((a,id)=>a+v[id][0],0)/r1.length, r1.reduce((a,id)=>a+v[id][1],0)/r1.length, r1.reduce((a,id)=>a+v[id][2],0)/r1.length].map(x=>x.toFixed(4)).join(','));
  console.log();
}
// also dump the arm ring centers and leg ring centers
console.log('=== control rings armRings(1) & legRings(1) ===');
console.log('arm:', JSON.stringify(body.controls.arms.map(r=>({c:r.c.map(x=>+x.toFixed(3)),ru:r.ru,rv:r.rv,b:r.bend}))));
console.log('leg:', JSON.stringify(body.controls.legs.map(r=>({c:r.c.map(x=>+x.toFixed(3)),ru:r.ru,rv:r.rv,b:r.bend}))));
