import fs from 'node:fs'; import vm from 'node:vm';
const c={Math,console}; c.window=c; vm.createContext(c);
for(const f of ['lib/ganyu-lib.js','lib/ganyu-cage-branch.js','lib/ganyu-seam-check.js','ganyu-body-cage.js']) vm.runInContext(fs.readFileSync('scripts/parts/'+f,'utf8'), c, {filename:f});
const mesh=c.__BODY_CAGE__.mesh; const v=mesh.vertices;
// head chin = lowest head vert (head rings y>1.28, x<0.12) - use ring8 jaw region
const head=v.filter(p=>p[1]>1.30&&Math.abs(p[0])<0.13); const hy=head.map(p=>p[1]);
const jaw=v.filter(p=>p[1]>1.28&&p[1]<1.45&&Math.abs(p[0])<0.10&&p[2]>0.05); // front jaw
console.log('HEAD chin(min head y)='+Math.min(...hy).toFixed(4)+' crown='+Math.max(...hy).toFixed(4)+' headH='+(Math.max(...hy)-Math.min(...hy)).toFixed(4));
// foot bend: scan leg rings
console.log('--- foot (right leg, x<0 lowest rings) ---');
const footRings=v.filter(p=>p[0]<-0.09&&p[1]<0.12);
const fz=footRings.map(p=>p[2]), fy=footRings.map(p=>p[1]);
console.log('foot z['+Math.min(...fz).toFixed(3)+','+Math.max(...fz).toFixed(3)+'] len='+(Math.max(...fz)-Math.min(...fz)).toFixed(3)+' sole(minY)='+Math.min(...fy).toFixed(4));
// palm (main thread confirmed already); left hand verts
const palm=v.filter(p=>p[0]>0.24&&p[1]<0.80&&p[1]>0.60);
console.log('PALM verts='+palm.length);
// verifyMirror
let mm=0; for(const p of v){const d=Math.min(...v.map(q=>Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2]))); if(d>mm)mm=d;}
console.log('maxMirror='+mm.toExponential(2));
