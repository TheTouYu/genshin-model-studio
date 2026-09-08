/* subdivSurface deterministic demo: node scripts/parts/tool-subdiv-demo.js */
'use strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var src = fs.readFileSync(path.join(__dirname, 'lib/ganyu-lib.js'), 'utf8');
var ctx = { console: console, Math: Math };
vm.createContext(ctx); vm.runInContext(src, ctx);
var rings = [], sections = [];
for (var r = 0; r < 5; r++) {
  var y = 0.05 + r * 0.04, ring = [];
  for (var j = 0; j < 8; j++) { var t = j * Math.PI * 2 / 8; ring.push([0, y, 0]); }
  rings.push([0, y, 0]);
  sections.push({ rx: 0.026 + 0.002 * Math.sin(r), ry: 0.022 + 0.001 * Math.cos(r), cy: 0 });
}
var loftPath = rings;
var mesh = ctx.profileLoft(loftPath, sections, 4, 8, function () { return '#b8c7dd'; }, { cap: 'both', dataOnly: true, up: [0, 0, 1] });
function boundaryCount(m) { var e = {}; for (var i = 0; i < m.faces.length; i += 3) for (var k = 0; k < 3; k++) { var a = m.faces[i + k], b = m.faces[i + (k + 1) % 3], key = a < b ? a + ':' + b : b + ':' + a; e[key] = (e[key] || 0) + 1; } return Object.keys(e).filter(function (k) { return e[k] === 1; }).length; }
function normal(m, fi) { var f = m.faces.slice(fi * 3, fi * 3 + 3), a = m.vertices[f[0]], b = m.vertices[f[1]], c = m.vertices[f[2]], u = [b[0]-a[0],b[1]-a[1],b[2]-a[2]], v = [c[0]-a[0],c[1]-a[1],c[2]-a[2]], n = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]], l = Math.hypot(n[0],n[1],n[2]); return [n[0]/l,n[1]/l,n[2]/l]; }
function creaseAngle(m, edge) { var fs = []; for (var i = 0; i < m.faces.length; i += 3) { var f = m.faces.slice(i, i + 3); if (f.indexOf(edge[0]) >= 0 && f.indexOf(edge[1]) >= 0) fs.push(i / 3); } if (fs.length < 2) return 0; var a = normal(m, fs[0]), b = normal(m, fs[1]), d = Math.max(-1, Math.min(1, a[0]*b[0]+a[1]*b[1]+a[2]*b[2])); return Math.acos(d) * 180 / Math.PI; }
function maxDihedral(m) { var em = {}, max = 0; for (var i = 0; i < m.faces.length; i += 3) { var f = m.faces.slice(i, i + 3); for (var k = 0; k < 3; k++) { var a = f[k], b = f[(k + 1) % 3], key = a < b ? a + ':' + b : b + ':' + a; (em[key] || (em[key] = [])).push(i / 3); } } Object.keys(em).forEach(function (k) { if (em[k].length === 2) { var p = k.split(':').map(Number), a = normal(m, em[k][0]), b = normal(m, em[k][1]), d = Math.max(-1, Math.min(1, a[0]*b[0]+a[1]*b[1]+a[2]*b[2])); max = Math.max(max, Math.acos(d) * 180 / Math.PI); } }); return max; }
console.log('base', { vertices: mesh.vertices.length, faces: mesh.faces.length / 3, boundary: boundaryCount(mesh) });
for (var level = 1; level <= 3; level++) { var out = ctx.subdivSurface(mesh, level); var check = ctx.meshCheck(out); console.log('level=' + level, 'faces=' + check.faces, 'expected=' + (mesh.faces.length / 3 * Math.pow(4, level)), 'vertices=' + out.vertices.length, 'meshCheck=' + JSON.stringify(check)); }
var folded = { vertices: [[0,0,0],[1,0,0],[0,1,0],[1,0,2]], faces: [0,1,2,1,0,3], colors: ['#aaa','#aaa'] };
var smoothFold = ctx.subdivSurface(folded, 1), sharpFold = ctx.subdivSurface(folded, 1, { creases: function (a, b) { return (Math.min(a,b) === 0 && Math.max(a,b) === 1) ? 1 : 0; } });
console.log('creaseAngleDeg sharedEdge smooth=' + creaseAngle(smoothFold, [6, 0]).toFixed(3) + ' sharp=' + creaseAngle(sharpFold, [6, 0]).toFixed(3));
var open = ctx.profileLoft(loftPath, sections, 4, 8, function () { return '#b8c7dd'; }, { cap: 'none', dataOnly: true, up: [0, 0, 1] });
var b0 = boundaryCount(open), b1 = boundaryCount(ctx.subdivSurface(open, 1)), b2 = boundaryCount(ctx.subdivSurface(open, 2));
console.log('openBoundary before=' + b0 + ' L1=' + b1 + ' expected=' + (b0 * 2) + ' L2=' + b2 + ' expected=' + (b0 * 4) + ' assertions=' + (b1 === b0 * 2 && b2 === b0 * 4 ? 'PASS' : 'FAIL'));
function yBounds(m) { var lo = Infinity, hi = -Infinity; m.vertices.forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }); return { lo: lo, hi: hi }; }
var cap2 = ctx.subdivSurface(mesh, 2), capCheck = ctx.meshCheck(cap2), capBounds = yBounds(cap2), inputBounds = yBounds(mesh);
var capOvershoot = Math.max(0, inputBounds.lo - capBounds.lo, capBounds.hi - inputBounds.hi);
console.log('closedBoundary capBoth=' + boundaryCount(cap2) + ' assertion=' + (boundaryCount(cap2) === 0 ? 'PASS' : 'FAIL'));
console.log('capBoth meshCheck=' + JSON.stringify(capCheck) + ' capPlaneOvershoot=' + capOvershoot.toFixed(6) + ' assertion=' + (capCheck.deg === 0 && capCheck.skinnyPct < 5 && capCheck.areaRatio < 20 && capOvershoot < 1e-6 ? 'PASS' : 'FAIL'));
