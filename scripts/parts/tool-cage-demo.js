import fs from 'fs'; import vm from 'vm';
const src=fs.readFileSync(new URL('./lib/ganyu-lib.js',import.meta.url),'utf8'); const ctx={console,Math}; vm.createContext(ctx); vm.runInContext(src,ctx);
const rings=[]; for(let r=0;r<5;r++){const z=r*.4,rx=[.22,.18,.14,.2,.16][r],ry=rx*.65; rings.push(Array.from({length:8},(_,i)=>{const t=i*Math.PI/4;return [Math.cos(t)*rx,Math.sin(t)*ry,z]}));}
function bounds(m){const xs=m.vertices.map(p=>p[0]),ys=m.vertices.map(p=>p[1]),zs=m.vertices.map(p=>p[2]); return {x:+(Math.max(...xs)-Math.min(...xs)).toFixed(3),y:+(Math.max(...ys)-Math.min(...ys)).toFixed(3),z:+(Math.max(...zs)-Math.min(...zs)).toFixed(3)};}
const c=ctx.cageLoft(rings,{up:[0,0,1],segs:2,sides:8}); console.log('check',ctx.meshCheck(c.mesh),'bounds',bounds(c.mesh)); if(!(bounds(c.mesh).x>bounds(c.mesh).z&&bounds(c.mesh).y>1)) throw Error('up axis assertion failed');
for(const [r,p,d] of [[1,0,[.02,0,0]],[2,3,[-.01,0,0]],[3,2,[0,.02,0]]]){ctx.cageMove(c,r,p,d); console.log('move',r,p,d,ctx.meshCheck(c.mesh),'bounds',bounds(c.mesh));}
console.log('dense',ctx.cageLoft(rings,{up:[0,0,1],segs:8,sides:16}).mesh.faces.length/3);