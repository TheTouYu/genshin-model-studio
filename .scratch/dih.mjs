import fs from 'node:fs'; import vm from 'node:vm';
const c={Math,console}; c.window=c; vm.createContext(c);
for(const f of ['lib/ganyu-lib.js','lib/ganyu-cage-branch.js','lib/ganyu-seam-check.js','ganyu-body-cage.js']) vm.runInContext(fs.readFileSync('scripts/parts/'+f,'utf8'), c, {filename:f});
const v=c.__BODY_CAGE__.mesh.vertices; const f=c.__BODY_CAGE__.mesh.faces;
function norm(i){const a=v[f[i*3]],b=v[f[i*3+1]],d=v[f[i*3+2]];const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],w=[d[0]-a[0],d[1]-a[1],d[2]-a[2]];const nx=u[1]*w[2]-u[2]*w[1],ny=u[2]*w[0]-u[0]*w[2],nz=u[0]*w[1]-u[1]*w[0];const l=Math.hypot(nx,ny,nz)||1;return [nx/l,ny/l,nz/l];}
function cen(i){const a=v[f[i*3]],b=v[f[i*3+1]],d=v[f[i*3+2]];return [(a[0]+b[0]+d[0])/3,(a[1]+b[1]+d[1])/3,(a[2]+b[2]+d[2])/3];}
// all dihedrals, histogram
const edgeFace=new Map();
for(let i=0;i<f.length/3;i++){const ia=[f[i*3],f[i*3+1],f[i*3+2]];for(let k=0;k<3;k++){const a=ia[k],b=ia[(k+1)%3],key=a<b?a+':'+b:b+':'+a;if(!edgeFace.has(key))edgeFace.set(key,[]);edgeFace.get(key).push(i);}}
const dih=[];
const seen=new Set();
for(let i=0;i<f.length/3;i++){const ni=norm(i);const ia=[f[i*3],f[i*3+1],f[i*3+2]];for(let k=0;k<3;k++){const a=ia[k],b=ia[(k+1)%3],key=a<b?a+':'+b:b+':'+a;for(const j of (edgeFace.get(key)||[])){if(j===i)continue;const pk=i<j?i+':'+j:j+':'+i;if(seen.has(pk))continue;seen.add(pk);const njj=norm(j);const dot=Math.max(-1,Math.min(1,ni[0]*njj[0]+ni[1]*njj[1]+ni[2]*njj[2]));const ang=Math.acos(dot)*180/Math.PI;if(ang<179.5&&ang>0.5)dih.push({i,j,ang,ci:cen(i),cj:cen(j)});}}}
dih.sort((a,b)=>b.ang-a.ang);
console.log('total dihedral edges='+dih.length);
console.log('top 12 sharpest dihedrals (angle, faces, centroids):');
dih.slice(0,12).forEach(x=>console.log('  '+x.ang.toFixed(1)+'deg f'+x.i+','+x.j+' at '+JSON.stringify(x.ci.map(q=>+q.toFixed(2)))+' <-> '+JSON.stringify(x.cj.map(q=>+q.toFixed(2)))));
// count creases >150 on front-mid (+Z, y0.78-1.35)
const fm=dih.filter(x=>x.ang>150 && x.ci[2]>0.03 && x.ci[1]>0.78 && x.ci[1]<1.35);
console.log('front-mid(+Z,y0.78-1.35) creases>150deg: '+fm.length);
fm.slice(0,10).forEach(x=>console.log('  '+x.ang.toFixed(1)+' f'+x.i+','+x.j+' at '+JSON.stringify(x.ci.map(q=>+q.toFixed(2)))+' <-> '+JSON.stringify(x.cj.map(q=>+q.toFixed(2)))));
