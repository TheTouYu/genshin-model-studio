import fs from 'node:fs'; import vm from 'node:vm';
const c={Math,console}; c.window=c; vm.createContext(c);
for(const f of ['lib/ganyu-lib.js','lib/ganyu-cage-branch.js','lib/ganyu-seam-check.js','ganyu-body-cage.js']) vm.runInContext(fs.readFileSync('scripts/parts/'+f,'utf8'), c, {filename:f});
const body=c.__BODY_CAGE__; const v=body.mesh.vertices;
const P=body.branches.palmL; // left palm
console.log('palmL: B='+P.B+' rings='+P.rings.length+' loop='+P.loop.length);
// ring verts positions (world)
P.rings.forEach((ring,k)=>{
  const pts=ring.map(id=>v[id]);
  const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]), zs=pts.map(p=>p[2]);
  console.log('ring'+k+' n='+ring.length+' x['+Math.min(...xs).toFixed(3)+','+Math.max(...xs).toFixed(3)+'] y['+Math.min(...ys).toFixed(3)+','+Math.max(...ys).toFixed(3)+'] z['+Math.min(...zs).toFixed(3)+','+Math.max(...zs).toFixed(3)+']');
});
// last ring (distal) verts in order
const last=P.rings[P.rings.length-1];
console.log('distal ring verts (j: pos):');
last.forEach((id,j)=>console.log('  j'+j+' id'+id+' '+v[id].map(x=>+x.toFixed(3)).join(',')));
// thumb side = radial (+X side of left palm). wrist ring (ring0) verts
console.log('wrist ring0 verts:');
P.rings[0].forEach((id,j)=>console.log('  j'+j+' id'+id+' '+v[id].map(x=>+x.toFixed(3)).join(',')));
// total verts
console.log('mesh verts='+v.length+' faces='+body.mesh.faces.length/3);
