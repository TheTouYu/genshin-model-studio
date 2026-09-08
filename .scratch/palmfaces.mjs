import fs from 'node:fs'; import vm from 'node:vm';
const c={Math,console}; c.window=c; vm.createContext(c);
for(const f of ['lib/ganyu-lib.js','lib/ganyu-cage-branch.js','lib/ganyu-seam-check.js','ganyu-body-cage.js']) vm.runInContext(fs.readFileSync('scripts/parts/'+f,'utf8'), c, {filename:f});
const body=c.__BODY_CAGE__; const v=body.mesh.vertices; const f=body.mesh.faces;
const P=body.branches.palmL; const ringSet=new Set();
P.rings.forEach(r=>r.forEach(id=>ringSet.add(id)));
// faces fully in palm rings (the palm tube + cap)
const palmFaces=[];
for(let t=0;t<f.length/3;t++){const ia=[f[t*3],f[t*3+1],f[t*3+2]];if(ia.every(id=>ringSet.has(id))){const cc=ia.map(id=>v[id]).reduce((s,p)=>[s[0]+p[0],s[1]+p[1],s[2]+p[2]],[0,0,0]);palmFaces.push({t,ia,cen:[cc[0]/3,cc[1]/3,cc[2]/3]});}}
console.log('palm faces (fully in palm rings)='+palmFaces.length);
palmFaces.filter(x=>x.cen[1]<0.72).forEach(x=>console.log('  f'+x.t+' cen='+x.cen.map(q=>+q.toFixed(3)).join(',')+' verts='+x.ia.join(',')));
// distal ring3 vertex indices and their band (ring2-ring3) quads
console.log('--- ring3 verts (distal) + ring2 verts (band) ---');
console.log('ring2:', P.rings[2].join(','));
console.log('ring3:', P.rings[3].join(','));
// cap tip vertex = after ring3? find it
const caps=[];
for(let t=0;t<f.length/3;t++){const ia=[f[t*3],f[t*3+1],f[t*3+2]];if(ia.some(id=>ringSet.has(id))&&!ia.every(id=>ringSet.has(id))){caps.push(t);}}
console.log('faces partially in palm (cap/boundary)='+caps.length);
caps.slice(0,10).forEach(t=>{const ia=[f[t*3],f[t*3+1],f[t*3+2]];const cc=ia.map(id=>v[id]).reduce((s,p)=>[s[0]+p[0],s[1]+p[1],s[2]+p[2]],[0,0,0]);console.log('  f'+t+' cen='+[cc[0]/3,cc[1]/3,cc[2]/3].map(q=>+q.toFixed(3)).join(',')+' verts='+ia.join(','));});
