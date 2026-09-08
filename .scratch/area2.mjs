import fs from 'node:fs'; import vm from 'node:vm';
const c={Math,console}; c.window=c; vm.createContext(c);
for(const f of ['lib/ganyu-lib.js','lib/ganyu-cage-branch.js','lib/ganyu-seam-check.js','ganyu-body-cage.js']) vm.runInContext(fs.readFileSync('scripts/parts/'+f,'utf8'), c, {filename:f});
const v=c.__BODY_CAGE__.mesh.vertices, f=c.__BODY_CAGE__.mesh.faces;
const areas=[];
for(let i=0;i<f.length;i+=3){const a=v[f[i]],b=v[f[i+1]],d=v[f[i+2]];const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],w=[d[0]-a[0],d[1]-a[1],d[2]-a[2]];const ar=0.5*Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]);areas.push({fc:i/3,ar,cen:[(a[0]+b[0]+d[0])/3,(a[1]+b[1]+d[1])/3,(a[2]+b[2]+d[2])/3]});}
const s=[...areas].sort((a,b)=>a.ar-b.ar); const n=s.length;
const p5=s[Math.floor(n*0.05)].ar, p95=s[Math.floor(n*0.95)].ar;
console.log('n='+n+' p5='+p5.toExponential(4)+' p95='+p95.toExponential(4)+' ratio='+(p95/p5).toFixed(2));
console.log('--- 15 LARGEST faces (source) ---');
s.slice(-15).forEach(x=>console.log('  fc'+x.fc+' ar='+x.ar.toExponential(3)+' cen='+x.cen.map(q=>+q.toFixed(3)).join(',')));
console.log('--- 6 smallest ---');
s.slice(0,6).forEach(x=>console.log('  fc'+x.fc+' ar='+x.ar.toExponential(3)+' cen='+x.cen.map(q=>+q.toFixed(3)).join(',')));
