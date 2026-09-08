import fs from 'node:fs'; import vm from 'node:vm';
const context={Math,console}; context.window=context; vm.createContext(context);
for (const file of ['lib/ganyu-lib.js','lib/ganyu-cage-branch.js','lib/ganyu-seam-check.js','ganyu-body-cage.js']) vm.runInContext(fs.readFileSync('scripts/parts/'+file,'utf8'), context, {filename:file});
const body=context.__BODY_CAGE__; const v=body.mesh.vertices;
// palm (left, x>0, y<0.8, the hand region x>0.24)
const palm=v.filter(p=>p[0]>0.24&&p[1]<0.80&&p[0]>0.2);
const px=palm.map(p=>p[0]), py=palm.map(p=>p[1]), pz=palm.map(p=>p[2]);
console.log('palm verts='+palm.length+'  x['+Math.min(...px).toFixed(3)+','+Math.max(...px).toFixed(3)+'] y['+Math.min(...py).toFixed(3)+','+Math.max(...py).toFixed(3)+'] z['+Math.min(...pz).toFixed(3)+','+Math.max(...pz).toFixed(3)+']');
console.log('palm width(X)='+(Math.max(...px)-Math.min(...px)).toFixed(4)+' thickness(Z)='+(Math.max(...pz)-Math.min(...pz)).toFixed(4)+' length(Y)='+(Math.max(...py)-Math.min(...py)).toFixed(4));
// mirror
let mm=0; for(const p of v){const d=Math.min(...v.map(q=>Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2]))); if(d>mm)mm=d;}
console.log('maxMirrorDist='+mm.toExponential(2));
