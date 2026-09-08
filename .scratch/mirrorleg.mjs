import fs from 'node:fs'; import vm from 'node:vm';
const context = { Math, console }; context.window = context; vm.createContext(context);
for (const file of ['lib/ganyu-lib.js','lib/ganyu-cage-branch.js','lib/ganyu-seam-check.js','ganyu-body-cage.js']) vm.runInContext(fs.readFileSync('scripts/parts/'+file,'utf8'), context, {filename:file});
const body = context.__BODY_CAGE__; const v = body.mesh.vertices;
let maxMirror=0;
for (const p of v) { const d = Math.min(...v.map(q=>Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2]))); if(d>maxMirror) maxMirror=d; }
console.log('maxMirrorDist=',maxMirror);
// leg loops
for (const key of ['legL','legR']) {
  const br = body.branches[key]; if (!br) continue;
  console.log(key+': loop len='+br.loop.length+' rings='+br.rings.length);
}
const brL = body.branches.legL, brR = body.branches.legR;
console.log('legL ring0(=loop):', brL.rings[0].map(id=>id+':'+v[id].map(x=>+x.toFixed(3)).join(',')).join(' | '));
console.log('legR ring0(=loop):', brR.rings[0].map(id=>id+':'+v[id].map(x=>+x.toFixed(3)).join(',')).join(' | '));
