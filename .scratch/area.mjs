import fs from 'node:fs'; import vm from 'node:vm';
const context = { Math, console }; context.window = context; vm.createContext(context);
for (const file of ['lib/ganyu-lib.js','lib/ganyu-cage-branch.js','lib/ganyu-seam-check.js','ganyu-body-cage.js']) vm.runInContext(fs.readFileSync('scripts/parts/'+file,'utf8'), context, {filename:file});
const mesh = context.__BODY_CAGE__.mesh; const v = mesh.vertices; const f = mesh.faces;
const areas = [];
for (let i=0;i<f.length;i+=3){
  const a=v[f[i]],b=v[f[i+1]],c=v[f[i+2]];
  const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], w=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  const ar=0.5*Math.hypot(u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]);
  areas.push({fc:i/3, ar, cen:[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3]});
}
const sorted=areas.sort((a,b)=>a.ar-b.ar);
const n=sorted.length;
const p5=sorted[Math.floor(n*0.05)].ar, p95=sorted[Math.floor(n*0.95)].ar;
console.log('n='+n+' p5='+p5.toFixed(6)+' p95='+p95.toFixed(6)+' ratio='+(p95/p5).toFixed(2));
console.log('--- 12 smallest triangles ---');
sorted.slice(0,12).forEach(x=>console.log('fc'+x.fc+' ar='+x.ar.toExponential(3)+' cen='+x.cen.map(q=>+q.toFixed(3)).join(',')));
console.log('--- 8 largest triangles ---');
sorted.slice(-8).forEach(x=>console.log('fc'+x.fc+' ar='+x.ar.toFixed(5)+' cen='+x.cen.map(q=>+q.toFixed(3)).join(',')));
