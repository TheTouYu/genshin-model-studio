import fs from 'fs'; import vm from 'vm';
const lib = fs.readFileSync('scripts/parts/lib/ganyu-lib.js','utf8');
const br  = fs.readFileSync('scripts/parts/lib/ganyu-cage-branch.js','utf8');
const seam= fs.readFileSync('scripts/parts/lib/ganyu-seam-check.js','utf8');
const body= fs.readFileSync('scripts/parts/ganyu-body-cage.js','utf8');
const ctx={console,Math}; vm.createContext(ctx); vm.runInContext(lib,ctx); vm.runInContext(br,ctx); vm.runInContext(seam,ctx); ctx.window=ctx; ctx.THREE={Vector3:class{constructor(x,y,z){this.x=x;this.y=y;this.z=z;}}}; vm.runInContext(body,ctx);
const m=ctx.__BODY_CAGE__.mesh;
const rep=ctx.seamCheck(m);
const xs=m.vertices.map(p=>p[0]),ys=m.vertices.map(p=>p[1]),zs=m.vertices.map(p=>p[2]);
function area(i){const a=m.vertices[m.faces[i]],b=m.vertices[m.faces[i+1]],c=m.vertices[m.faces[i+2]];const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],w=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];return 0.5*Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]);}
let deg=0,minA=1e9,cnt=0;
for(let i=0;i<m.faces.length;i+=3){const a=area(i);if(a<1e-11)deg++;minA=Math.min(minA,a);cnt++;}
console.log(JSON.stringify({
  vertices:m.vertices.length, tris:cnt,
  seam:{components:rep.components, openEdges:rep.openEdges, nonManifoldEdges:rep.nonManifoldEdges, seamEdges:rep.seamEdges, onePiece:rep.onePiece, watertight:rep.watertight},
  degenerate:deg, minTriangleArea:+minA.toExponential(3),
  bbox:{x:[+Math.min(...xs).toFixed(3),+Math.max(...xs).toFixed(3)], y:[+Math.min(...ys).toFixed(3),+Math.max(...ys).toFixed(3)], z:[+Math.min(...zs).toFixed(3),+Math.max(...zs).toFixed(3)]},
  height:+(Math.max(...ys)-Math.min(...ys)).toFixed(3), front:'+Z',
  scale:ctx.__BODY_CAGE__.scale, topology:ctx.__BODY_CAGE__.topology
},null,2));
