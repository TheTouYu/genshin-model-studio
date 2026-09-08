/**
 * 生成 v9 输入网格 JSON（供 export-mesh 面板化）：
 * - 踝段放样（adaptive stops 12/16 + dense mult2）+ reliefYTube 浮雕 + 平滑 jitterMesh
 * - 顶点 ×24（装饰物常规 ~1.7m 大小）
 * - 逐面颜色：凸包区 0xf0c6a2（肉色）、其余 0x9aa2ab（灰）
 * 输出：delivery/r0-toes/ankle-bump-v12-mesh.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const lib = readFileSync(new URL('./parts/lib/ganyu-lib.js', import.meta.url), 'utf8');
const ctx = createContext({ window: { gms: { part() {} } }, console, Math, Number, Float32Array });
runInContext(lib, ctx);
const { profileLoft, reliefYTube, jitterMesh, adaptiveAngularStops, meshCheck } = ctx;

const WORLD = 14;
const stops = adaptiveAngularStops({ center: 0, sigma: 0.55, nFine: 12, nCoarse: 16, wave: 0.012, seed: 3 });
const SIDES = stops.length;
const leg = profileLoft(
  [[0, 0.02, 0], [0, 0.03, 0], [0, 0.04, 0], [0, 0.05, 0], [0, 0.06, 0], [0, 0.07, 0], [0, 0.08, 0], [0, 0.09, 0]],
  [{ rx: 0.0138, ry: 0.0132 }, { rx: 0.0130, ry: 0.0128 }, { rx: 0.0124, ry: 0.0126 }, { rx: 0.0122, ry: 0.0126 }, { rx: 0.0124, ry: 0.0128 }, { rx: 0.0128, ry: 0.0130 }, { rx: 0.0134, ry: 0.0134 }, { rx: 0.0142, ry: 0.0138 }],
  20, SIDES, function () { return '#d9d9de'; }, { dataOnly: true, dense: [{ t0: 0.40, t1: 0.62, mult: 2 }], angularStops: stops });
reliefYTube(leg, { y: 0.055, th: 0, r: 0.010, h: 0.0028, irr: 0.12, seed: 2.2, leanY: 0.30, leanTh: 0.25 });
jitterMesh(leg, { sides: SIDES, ampA: 0.035, ampR: 0.0004, ampY: 0.0003, seed: 7 });

const vs = leg.vertices, fs = leg.faces;
const scaled = vs.map((v) => [v[0] * WORLD, v[1] * WORLD, v[2] * WORLD]);
const colors = [];
for (let f = 0; f < fs.length; f += 3) {
  const p0 = vs[fs[f]], p1 = vs[fs[f + 1]], p2 = vs[fs[f + 2]];
  const cx = (p0[0] + p1[0] + p2[0]) / 3, cy = (p0[1] + p1[1] + p2[1]) / 3, cz = (p0[2] + p1[2] + p2[2]) / 3;
  const rad = Math.hypot(cx, cz);
  const dth = Math.atan2(Math.sin(Math.atan2(cz, cx)), Math.cos(Math.atan2(cz, cx)));
  const inBump = Math.hypot(cy - 0.055, rad * dth) / 0.010 < 1;
  colors.push(inBump ? '0xf0c6a2' : '0x9aa2ab');
}
console.log('meshCheck', JSON.stringify(meshCheck(leg)));
console.log('verts', scaled.length, 'faces', fs.length, 'uniqueColors', new Set(colors).size);
const out = { name: 'ankle-bump-v12', vertices: scaled, faces: fs, colors };
const outPath = new URL('../delivery/r0-toes/ankle-bump-v12-mesh.json', import.meta.url);
writeFileSync(outPath, JSON.stringify(out));
console.log('wrote', outPath.pathname);
