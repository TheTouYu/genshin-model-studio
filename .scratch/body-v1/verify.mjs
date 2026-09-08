import fs from 'fs'; import vm from 'vm';
const lib = fs.readFileSync('scripts/parts/lib/ganyu-lib.js','utf8');
const br  = fs.readFileSync('scripts/parts/lib/ganyu-cage-branch.js','utf8');
const seam= fs.readFileSync('scripts/parts/lib/ganyu-seam-check.js','utf8');
const body= fs.readFileSync('scripts/parts/ganyu-body-cage.js','utf8');
const ctx = { console, Math, THREE:{Vector3:class{constructor(x,y,z){this.x=x;this.y=y;this.z=z;}}} };
vm.createContext(ctx); vm.runInContext(lib,ctx); vm.runInContext(br,ctx); vm.runInContext(seam,ctx); ctx.window=ctx;
vm.runInContext(body,ctx);
const B=ctx.__BODY_CAGE__; const m=B.mesh;
console.log('metadata', JSON.stringify(B.scale), 'topology', B.topology);
console.log('seam', JSON.stringify(ctx.seamCheck(m)));
// degenerate check
let deg=0,minA=1e9;
function area(i){const a=m.vertices[m.faces[i]],b=m.vertices[m.faces[i+1]],c=m.vertices[m.faces[i+2]];const e1=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],e2=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];return 0.5*Math.hypot(e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]);}
for(let i=0;i<m.faces.length;i+=3){const a=area(i);if(a<1e-11)deg++;minA=Math.min(minA,a);}
console.log('verts',m.vertices.length,'tris',m.faces.length/3,'deg',deg,'minArea',minA.toExponential(2));
let obj='# body\n'; for(const p of m.vertices) obj+='v '+p[0]+' '+p[1]+' '+p[2]+'\n'; for(let i=0;i<m.faces.length;i+=3) obj+='f '+(m.faces[i]+1)+' '+(m.faces[i+1]+1)+' '+(m.faces[i+2]+1)+'\n';
fs.writeFileSync(new URL('./final.obj', import.meta.url), obj);
console.log('obj written');
