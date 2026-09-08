import fs from 'node:fs'; import vm from 'node:vm';
const c={Math,console}; c.window=c; vm.createContext(c);
for(const f of ['lib/ganyu-lib.js','lib/ganyu-cage-branch.js','lib/ganyu-seam-check.js','ganyu-body-cage.js']) vm.runInContext(fs.readFileSync('scripts/parts/'+f,'utf8'), c, {filename:f});
const v=c.__BODY_CAGE__.mesh.vertices;
// head region: neck+head = verts y>1.28, x small
const head=v.filter(p=>p[1]>1.30 && Math.abs(p[0])<0.12);
const hy=head.map(p=>p[1]);
console.log('head region y['+Math.min(...hy).toFixed(3)+','+Math.max(...hy).toFixed(3)+'] (chin~'+Math.min(...hy).toFixed(3)+' crown~'+Math.max(...hy).toFixed(3)+')');
const ys=v.map(p=>p[1]); console.log('body height='+(Math.max(...ys)-Math.min(...ys)).toFixed(3));
