import fs from 'node:fs'; import vm from 'node:vm';
const context={Math,console}; context.window=context; vm.createContext(context);
for (const file of ['lib/ganyu-lib.js','lib/ganyu-cage-branch.js','lib/ganyu-seam-check.js','ganyu-body-cage.js']) vm.runInContext(fs.readFileSync('scripts/parts/'+file,'utf8'), context, {filename:file});
const v=context.__BODY_CAGE__.mesh.vertices;
// left palm disc: x>0.24, y in [0.60,0.75] (below wrist 0.775)
const disc=v.filter(p=>p[0]>0.24&&p[1]<0.755&&p[1]>0.62);
const dx=disc.map(p=>p[0]), dy=disc.map(p=>p[1]), dz=disc.map(p=>p[2]);
console.log('palm DISC verts='+disc.length);
if(disc.length){console.log('  width(X)='+(Math.max(...dx)-Math.min(...dx)).toFixed(4)+' len(Y)='+(Math.max(...dy)-Math.min(...dy)).toFixed(4)+' thick(Z)='+(Math.max(...dz)-Math.min(...dz)).toFixed(4));}
// full left hand (incl wrist) 
const hand=v.filter(p=>p[0]>0.24&&p[1]<0.80);
const hx=hand.map(p=>p[0]), hz=hand.map(p=>p[2]);
console.log('hand verts='+hand.length+' fullWidth(X)='+(Math.max(...hx)-Math.min(...hx)).toFixed(4)+' fullThick(Z)='+(Math.max(...hz)-Math.min(...hz)).toFixed(4));
