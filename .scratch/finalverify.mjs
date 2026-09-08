import fs from 'node:fs'; import vm from 'node:vm';
import { verifyMesh } from '../dist/src/mesh/verify.js';
const context = { Math, console }; context.window = context; vm.createContext(context);
for (const file of ['lib/ganyu-lib.js','lib/ganyu-cage-branch.js','lib/ganyu-seam-check.js','ganyu-body-cage.js']) vm.runInContext(fs.readFileSync('scripts/parts/'+file,'utf8'), context, {filename:file});
const mesh = context.__BODY_CAGE__.mesh; const v = mesh.vertices; const f = mesh.faces; const c = mesh.colors;
const seam = context.seamCheck(mesh);
const gate = verifyMesh(mesh, { maxSamples: 100000 });
// mirror
let maxMirror=0;
for (const p of v){ const d=Math.min(...v.map(q=>Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2]))); if(d>maxMirror)maxMirror=d; }
// forefoot (right foot: x>0, z>0.15, y<0.08)
const forefoot = v.filter(p=>p[0]>0&&p[2]>0.15&&p[1]<0.08);
const ffTh = forefoot.length?Math.max(...forefoot.map(p=>p[1]))-Math.min(...forefoot.map(p=>p[1])):0;
// winding: directed edges balance
const edges=new Map();
for(let i=0;i<f.length;i+=3) for(let j=0;j<3;j++){const a=f[i+j],b=f[i+(j+1)%3],k=[Math.min(a,b),Math.max(a,b)].join(':'); edges.set(k,(edges.get(k)||0)+(a<b?1:-1));}
const badWInd = [...edges.values()].filter(n=>n!==0).length;
// area / skinny / degenerate
let degenerate=0, skinny=0, minA=Infinity, maxA=0;
for(let i=0;i<f.length;i+=3){const a=v[f[i]],b=v[f[i+1]],d=v[f[i+2]];const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],w=[d[0]-a[0],d[1]-a[1],d[2]-a[2]];const ar=0.5*Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]);if(ar<1e-11)degenerate++;const es=[u,w,[d[0]-b[0],d[1]-b[1],d[2]-b[2]]].map(q=>Math.hypot(...q)).sort((x,y)=>x-y);if(es[0]/es[2]<0.08)skinny++; if(ar<minA)minA=ar; if(ar>maxA)maxA=ar;}
const ys=v.map(p=>p[1]), xs=v.map(p=>p[0]), zs=v.map(p=>p[2]);
console.log('=== FINAL VERIFY ===');
console.log('vertices='+v.length+' faces(tris)='+f.length/3+' colors='+c.length);
console.log('height='+(Math.max(...ys)-Math.min(...ys)).toFixed(3)+'m front=+Z');
console.log('bbox x['+Math.min(...xs).toFixed(3)+','+Math.max(...xs).toFixed(3)+'] y['+Math.min(...ys).toFixed(3)+','+Math.max(...ys).toFixed(3)+'] z['+Math.min(...zs).toFixed(3)+','+Math.max(...zs).toFixed(3)+']');
console.log('seam: open='+seam.openEdges+' nonmanifold='+seam.nonManifoldEdges+' seams='+seam.seamEdges+' components='+seam.components+' onePiece='+seam.onePiece+' watertight='+seam.watertight);
console.log('gate ok='+gate.ok+' selfInt='+gate.checks.selfIntersections.intersectingPairs+' watertight='+gate.checks.watertight.pass+' normals='+gate.checks.normals.pass+' degenerate='+gate.checks.degenerate.count+' skinny='+gate.checks.skinny.count+' areaRatio='+gate.checks.areaRatio.value+' budget='+gate.checks.budget.pass);
console.log('maxMirrorDist='+maxMirror.toExponential(2)+' (req <1e-8)');
console.log('forefoot verts='+forefoot.length+' thickness='+ffTh.toFixed(4)+'m (req >=0.035)');
console.log('badDirectedEdges='+badWInd+' (req 0); myDegenerate='+degenerate+' mySkinny='+skinny+' minArea='+minA.toExponential(2)+' maxArea='+maxA.toFixed(5));
console.log('failures='+JSON.stringify(gate.failures));
