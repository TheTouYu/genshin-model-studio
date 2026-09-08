import fs from 'fs';
import vm from 'vm';

const root = new URL('./', import.meta.url);
const lib = fs.readFileSync(new URL('./lib/ganyu-lib.js', root), 'utf8');
const branch = fs.readFileSync(new URL('./lib/ganyu-cage-branch.js', root), 'utf8');
const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(lib, ctx);
vm.runInContext(branch, ctx);

const sides = 12;
const mesh = { vertices: [], faces: [], colors: [], sides, ringIdx: [] };
for (let r = 0; r < 9; r++) {
  mesh.ringIdx.push(mesh.vertices.length);
  const z = r * 0.22;
  const rx = 0.26 - 0.025 * Math.min(r, 5) + (r > 6 ? 0.02 : 0);
  const ry = rx * 0.68;
  for (let j = 0; j < sides; j++) {
    const t = j * Math.PI * 2 / sides;
    mesh.vertices.push([Math.cos(t) * rx, Math.sin(t) * ry, z]);
  }
}
for (let r = 0; r < 8; r++) for (let j = 0; j < sides; j++) {
  const n = (j + 1) % sides, a = mesh.ringIdx[r] + j, b = mesh.ringIdx[r] + n;
  const c = mesh.ringIdx[r + 1] + n, d = mesh.ringIdx[r + 1] + j;
  mesh.faces.push(a, b, c, a, c, d); mesh.colors.push('#9ba8bc', '#9ba8bc');
}
for (const ring of [0, 8]) { const center = mesh.vertices.slice(mesh.ringIdx[ring], mesh.ringIdx[ring] + sides).reduce((a,p) => [a[0]+p[0]/sides,a[1]+p[1]/sides,a[2]+p[2]/sides],[0,0,0]); const ci = mesh.vertices.length; mesh.vertices.push(center); for (let j=0;j<sides;j++) { const n=(j+1)%sides; mesh.faces.push(ci, mesh.ringIdx[ring] + (ring ? j : n), mesh.ringIdx[ring] + (ring ? n : j)); mesh.colors.push('#9ba8bc'); } }
function addBranch(ring, dir, length) {
  ctx.extrudeRing(mesh, ring, { sides, seg: 4, dir, length, scale: 1, curve: t => [0.025 * Math.sin(t * Math.PI), 0, 0], twist: 0.18, cap: 'end', color: '#c5d0df' });
}
addBranch(6, [1, 0, 0], 0.46); addBranch(6, [-1, 0, 0], 0.46);
addBranch(2, [0.62, 0, 0.78], 0.42); addBranch(2, [-0.62, 0, 0.78], 0.42);
addBranch(8, [0, 1, 0], 0.28);
function boundaryEdges(d) {
  const e = new Map();
  for (let i = 0; i < d.faces.length; i += 3) for (const [a, b] of [[d.faces[i], d.faces[i + 1]], [d.faces[i + 1], d.faces[i + 2]], [d.faces[i + 2], d.faces[i]]]) {
    const k = a < b ? `${a}:${b}` : `${b}:${a}`; e.set(k, (e.get(k) || 0) + 1);
  }
  return [...e.values()].filter(n => n === 1).length;
}
function mergeStyle() {
  const p = { vertices: [], faces: [], colors: [] };
  function append(m) { const off = p.vertices.length; p.vertices.push(...m.vertices); p.faces.push(...m.faces.map(x => x + off)); p.colors.push(...m.colors); }
  append(meshBase());
  for (const [ring, dir, length] of [[6,[1,0,0],.46],[6,[-1,0,0],.46],[2,[.62,0,.78],.42],[2,[-.62,0,.78],.42],[8,[0,1,0],.28]]) append(independent(ring, dir, length));
  return p;
}
function meshBase() { return { vertices: mesh.vertices.slice(0, 9 * sides), faces: mesh.faces.slice(0, 8 * sides * 6), colors: mesh.colors.slice(0, 8 * sides * 2) }; }
function independent(ring, dir, length) { const m = { vertices: [], faces: [], colors: [], sides }; const base = mesh.ringIdx[ring]; const center = mesh.vertices.slice(base, base + sides); const c = center.reduce((a, p) => [a[0]+p[0]/sides,a[1]+p[1]/sides,a[2]+p[2]/sides],[0,0,0]); const start = m.vertices.length; for (let k=0;k<=5;k++) for (let j=0;j<sides;j++) { const t=k/5, p=center[j]; m.vertices.push([p[0]+dir[0]*length*t,p[1]+dir[1]*length*t,p[2]+dir[2]*length*t]); } for(let k=0;k<5;k++) for(let j=0;j<sides;j++){const n=(j+1)%sides,a=start+k*sides+j,b=start+k*sides+n,d=start+(k+1)*sides+j,e=start+(k+1)*sides+n;m.faces.push(a,b,e,a,e,d);m.colors.push('#c5d0df','#c5d0df');} const tip=m.vertices.length; m.vertices.push([c[0]+dir[0]*length,c[1]+dir[1]*length,c[2]+dir[2]*length]); const last=start+5*sides; for(let j=0;j<sides;j++){const n=(j+1)%sides;m.faces.push(tip,last+j,last+n);m.colors.push('#c5d0df');} return m; }
console.log('meshCheck', ctx.meshCheck(mesh));
console.log('boundaryEdges.onePiece', boundaryEdges(mesh));
console.log('boundaryEdges.independentMerge', boundaryEdges(mergeStyle()));
console.log('sharedStartVertices', mesh.branchRings.map(x => x.rings[0][0]));
