import fs from 'fs'; import vm from 'vm';
const lib = fs.readFileSync('scripts/parts/lib/ganyu-lib.js','utf8');
const br  = fs.readFileSync('scripts/parts/lib/ganyu-cage-branch.js','utf8');
const seam= fs.readFileSync('scripts/parts/lib/ganyu-seam-check.js','utf8');
const body= fs.readFileSync('scripts/parts/ganyu-body-cage.js','utf8');
const ctx={console,Math}; vm.createContext(ctx); vm.runInContext(lib,ctx); vm.runInContext(br,ctx); vm.runInContext(seam,ctx); ctx.window=ctx; ctx.THREE={Vector3:class{constructor(x,y,z){this.x=x;this.y=y;this.z=z;}}}; vm.runInContext(body,ctx);
const m=ctx.__BODY_CAGE__.mesh;
const rep=ctx.seamCheck(m);
console.log('seam',JSON.stringify(rep));
// degenerate
let deg=0,minA=1e9;
function area(i){const a=m.vertices[m.faces[i]],b=m.vertices[m.faces[i+1]],c=m.vertices[m.faces[i+2]];const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],w=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];return 0.5*Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]);}
for(let i=0;i<m.faces.length;i+=3){const a=area(i);if(a<1e-11)deg++;minA=Math.min(minA,a);}
console.log('verts',m.vertices.length,'tris',m.faces.length/3,'deg',deg,'minArea',minA.toExponential(3));
// colors aligned? colors.length must equal tris count
console.log('colors.length',m.colors.length,'tris',m.faces.length/3,'aligned', m.colors.length===m.faces.length/3);
// region color check: for each face, centroid, classify region -> expected color, compare
const SKIN='#f3c9a7', CLOTH='#d9d9de', SOCK='#9aa2ab';
let bad=0, counts={SKIN:0,CLOTH:0,SOCK:0,OTHER:0};
const badSample=[];
function centroid(i){const a=m.vertices[m.faces[i]],b=m.vertices[m.faces[i+1]],c=m.vertices[m.faces[i+2]];return[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];}
const armX=0.09; // arms are near |x|>0.18 and y in [0.6,1.15]
for(let i=0;i<m.faces.length;i+=3){ const ct=centroid(i), col=m.colors[i/3]; const x=ct[0],y=ct[1],z=ct[2];
  let exp;
  const isArm = Math.abs(x)>0.16 && y>0.55 && y<1.15 && Math.abs(z)<0.22;
  const isHead = y>1.36;
  const isLeg = y<0.79;
  if(isArm) exp=SKIN;
  else if(isHead) exp=SKIN;
  else if(isLeg) exp=SOCK;
  else exp=CLOTH;
  if(col===SKIN) counts.SKIN++; else if(col===CLOTH) counts.CLOTH++; else if(col===SOCK) counts.SOCK++; else counts.OTHER++;
  if(col!==exp){ bad++; if(badSample.length<6) badSample.push({ct:ct.map(v=>+v.toFixed(3)),col,exp}); }
}
console.log('color counts',JSON.stringify(counts));
console.log('region mismatch count',bad);
console.log('mismatch samples',JSON.stringify(badSample));
// OBJ for render
let obj='# body\n'; for(const p of m.vertices) obj+='v '+p[0]+' '+p[1]+' '+p[2]+'\n'; for(let i=0;i<m.faces.length;i+=3) obj+='f '+(m.faces[i]+1)+' '+(m.faces[i+1]+1)+' '+(m.faces[i+2]+1)+'\n';
fs.writeFileSync(new URL('./fixed.obj', import.meta.url), obj);
// color json
fs.writeFileSync(new URL('./color2.json', import.meta.url), JSON.stringify({vertices:m.vertices,faces:m.faces,colors:m.colors}));
console.log('wrote fixed.obj + color2.json');
