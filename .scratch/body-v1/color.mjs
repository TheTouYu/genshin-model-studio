import fs from 'fs'; import vm from 'vm';
const lib = fs.readFileSync('scripts/parts/lib/ganyu-lib.js','utf8');
const br  = fs.readFileSync('scripts/parts/lib/ganyu-cage-branch.js','utf8');
const seam= fs.readFileSync('scripts/parts/lib/ganyu-seam-check.js','utf8');
const body= fs.readFileSync('scripts/parts/ganyu-body-cage.js','utf8');
const ctx = { console, Math };
vm.createContext(ctx); vm.runInContext(lib,ctx); vm.runInContext(br,ctx); vm.runInContext(seam,ctx);
ctx.window=ctx; ctx.THREE={Vector3:class{constructor(x,y,z){this.x=x;this.y=y;this.z=z;}}};
vm.runInContext(body,ctx);
const m=ctx.__BODY_CAGE__.mesh;
const rep=ctx.seamCheck(m);
const ys=m.vertices.map(p=>p[1]);
console.log('height',(Math.max(...ys)-Math.min(...ys)).toFixed(3),'ymin',Math.min(...ys).toFixed(3),'ymax',Math.max(...ys).toFixed(3));
console.log('seam',JSON.stringify(rep));
console.log('tris',m.faces.length/3,'colors sample', m.colors.slice(0,2), m.colors[100], m.colors[200]);
// write colored meshes JSON for render
fs.writeFileSync(new URL('./color.json', import.meta.url), JSON.stringify({vertices:m.vertices,faces:m.faces,colors:m.colors}));
console.log('wrote color.json');
