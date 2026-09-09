/**
 * page-mesh.mjs — 当前版本 MacBook → 页面可加载的 mesh JSON（web/draw/macbook-current.json）
 *
 * 与 build-macbook-gia.mjs 同源（焊接+去 sliver），但：
 *  - 不走 export-mesh/.gia（不碰 delivery/，长跑会话正在用）
 *  - 输出到 web/draw/（web-server 静态服务），供页面 gms.part('mesh') fetch 加载
 *  - 始终从当前 dist 构建（含当日全部修复：刻字条移除/圆角分段/曲面细分优化）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildMacbook14 } from '../../dist/src/model/macbook/geometry.js';
import { linearToSrgb } from '../../dist/src/render/image.js';

const ROOT = new URL('../..', import.meta.url).pathname;
const lod = 1.0;                     // 渲染级（页面通道用：低 LOD 的 6 段圆角在 3/4 视角下呈阶梯折面，裁判点名）
const openAngle = 100, color = 'silver', screenOn = true;

const logo = JSON.parse(readFileSync(ROOT + 'reference/macbook/logo-outline.json', 'utf8'));
const built = buildMacbook14({ openAngle, screenOn, color, lod, legends: false }, { logo });
const mesh = built.mesh;

const hexOf = built.materials.map((m) => {
  const to255 = (v) => Math.max(0, Math.min(255, linearToSrgb(v)));
  return '0x' + [0, 1, 2].map((i) => to255(m.baseColor[i]).toString(16).padStart(2, '0')).join('');
});

// ---- 焊接（2e-4 m，同门禁 weldTolerance）----
const TOL = 2e-4;
const cells = new Map();
const remap = new Int32Array(mesh.pos.length / 3);
const vertices = [];
const key = (a, b, c) => a + ',' + b + ',' + c;
for (let i = 0; i < mesh.pos.length / 3; i++) {
  const x = mesh.pos[i * 3], y = mesh.pos[i * 3 + 1], z = mesh.pos[i * 3 + 2];
  const gx = Math.floor(x / TOL), gy = Math.floor(y / TOL), gz = Math.floor(z / TOL);
  let hit = -1;
  outer:
  for (let dx = -1; dx <= 1 && hit < 0; dx++)
    for (let dy = -1; dy <= 1 && hit < 0; dy++)
      for (let dz = -1; dz <= 1 && hit < 0; dz++) {
        const arr = cells.get(key(gx + dx, gy + dy, gz + dz));
        if (!arr) continue;
        for (const j of arr) {
          const v = vertices[j];
          if (Math.abs(v[0] - x) <= TOL && Math.abs(v[1] - y) <= TOL && Math.abs(v[2] - z) <= TOL) { hit = j; break outer; }
        }
      }
  if (hit < 0) {
    hit = vertices.length;
    vertices.push([+x.toFixed(6), +y.toFixed(6), +z.toFixed(6)]);
    const k = key(gx, gy, gz);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(hit);
  }
  remap[i] = hit;
}

// ---- 去 sliver ----
const faces = [], colors = [];
let dropped = 0;
for (let t = 0; t < mesh.mat.length; t++) {
  const a = remap[mesh.idx[t * 3]], b = remap[mesh.idx[t * 3 + 1]], c = remap[mesh.idx[t * 3 + 2]];
  if (a === b || b === c || a === c) { dropped++; continue; }
  const [x0, y0, z0] = vertices[a], [x1, y1, z1] = vertices[b], [x2, y2, z2] = vertices[c];
  const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0, vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (0.5 * Math.hypot(cx, cy, cz) < 1e-9) { dropped++; continue; }
  const minE = Math.min(Math.hypot(ux, uy, uz), Math.hypot(x2 - x1, y2 - y1, z2 - z1), Math.hypot(x2 - x0, y2 - y0, z2 - z0));
  if (minE < 2e-5) { dropped++; continue; }
  faces.push(a, b, c);
  colors.push(hexOf[mesh.mat[t]]);
}

const out = { name: 'macbook-pro-14-silver-open-r4', vertices, faces, colors };
mkdirSync(ROOT + 'web/draw/', { recursive: true });
writeFileSync(ROOT + 'web/draw/macbook-current.json', JSON.stringify(out));
console.log(`verts ${vertices.length} | tris ${faces.length / 3} | dropped ${dropped} | colors ${new Set(colors).size}`);
console.log('written: web/draw/macbook-current.json');
