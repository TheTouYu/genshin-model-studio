import fs from 'node:fs';
import vm from 'node:vm';
const context = { Math, console };
context.window = context;
vm.createContext(context);
for (const file of ['lib/ganyu-lib.js', 'lib/ganyu-cage-branch.js', 'lib/ganyu-seam-check.js', 'ganyu-body-cage.js']) {
  vm.runInContext(fs.readFileSync('scripts/parts/' + file, 'utf8'), context, { filename: file });
}
const body = context.__BODY_CAGE__; const mesh = body.mesh; const v = mesh.vertices;
function newell(loop){
  let x=0,y=0,z=0;
  for(let i=0;i<loop.length;i++){
    const a=v[loop[i]], b=v[loop[(i+1)%loop.length]];
    x+=(a[1]-b[1])*(a[2]+b[2]); y+=(a[2]-b[2])*(a[0]+b[0]); z+=(a[0]-b[0])*(a[1]+b[1]);
  }
  const l=Math.hypot(x,y,z);
  return [x/l,y/l,z/l];
}
for(const key of ['armL','armR','legL','legR']){
  const br=body.branches[key];
  const n=newell(br.loop);
  // centroid
  const c=br.loop.map(id=>v[id]);
  const cx=c.reduce((s,p)=>s+p[0],0)/c.length, cy=c.reduce((s,p)=>s+p[1],0)/c.length, cz=c.reduce((s,p)=>s+p[2],0)/c.length;
  console.log(key, 'loop normal='+n.map(x=>x.toFixed(3)).join(','), ' centroid='+[cx,cy,cz].map(x=>x.toFixed(3)).join(','));
  // signed area / orientation sign
  let area=0; for(let i=0;i<br.loop.length;i++){const a=v[br.loop[i]],b=v[br.loop[(i+1)%br.loop.length]]; area+=a[0]*b[1]-b[0]*a[1];}
  console.log('   planar-proj-area(+X view sign)~', area.toFixed(5), ' looplen', br.loop.length);
}
