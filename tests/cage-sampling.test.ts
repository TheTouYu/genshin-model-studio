import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { verifyMesh } from '../src/mesh/verify.js';
function load() { const c=vm.createContext({});vm.runInContext(fs.readFileSync('scripts/parts/lib/ganyu-lib.js','utf8'),c);return c; }
const rings=()=>[0,1,2].map(y=>Array.from({length:8},(_,j)=>[Math.cos(j*Math.PI/4),y,Math.sin(j*Math.PI/4)]));
test('cage angular resampling does not mix longitudinal ring heights',()=>{
 const c=load(), cage=c.cageLoft(rings(),{segs:4,sides:16});
 assert.ok(cage.mesh.vertices.slice(0,16).every((p:number[])=>Math.abs(p[1])<1e-12));
 assert.ok(cage.mesh.vertices.slice(-16).every((p:number[])=>Math.abs(p[1]-2)<1e-12));
 assert.equal(cage.mesh.colors.length,cage.mesh.faces.length/3);
 assert.ok(cage.mesh.colors.every((x:string)=>x==='#ffffff'));
});
test('cage controls rebuild deterministically and point reads cannot mutate controls',()=>{
 const c=load(), cage=c.cageLoft(rings(),{segs:4,sides:16,colorFn:()=> '#112233'});
 const original=JSON.stringify(cage.mesh);const point=c.cagePoint(cage,1,0);point[0]=100;assert.equal(c.cagePoint(cage,1,0)[0],1);
 c.cageMove(cage,1,0,[0.1,0,0]);assert.notEqual(JSON.stringify(cage.mesh),original);
 c.cageMove(cage,1,0,{pos:[1,1,0]});assert.equal(JSON.stringify(cage.mesh),original);
 assert.ok(cage.mesh.colors.every((x:string)=>x==='#112233'));
});
test('subdivision preserves input and multiplies triangle color count consistently',()=>{
 const c=load();const m={vertices:[[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]],faces:[0,2,1,0,1,3,0,3,2,1,2,3],colors:['#112233','#445566','#778899','#aabbcc']};
 const original=JSON.stringify(m), out=c.subdivSurface(m,1);
 assert.equal(JSON.stringify(m),original);assert.equal(out.faces.length,m.faces.length*4);assert.equal(out.colors.length,out.faces.length/3);
 assert.equal(JSON.stringify(out),JSON.stringify(c.subdivSurface(m,1)));
 const edges=new Map<string,number>();for(let i=0;i<out.faces.length;i+=3)for(let j=0;j<3;j++){const a=out.faces[i+j],b=out.faces[i+(j+1)%3],k=[Math.min(a,b),Math.max(a,b)].join(':');edges.set(k,(edges.get(k)||0)+1);}
 assert.ok([...edges.values()].every(n=>n===2));
 assert.equal(verifyMesh(out).ok,true, JSON.stringify(verifyMesh(out).failures));
});
