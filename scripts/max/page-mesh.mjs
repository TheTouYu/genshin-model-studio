/**
 * page-mesh.mjs — 当前版本 MacBook → 页面可加载的 mesh JSON（web/draw/macbook-current.json）
 *
 * 与 build-macbook-gia.mjs 同源（焊接+去 sliver），但：
 *  - 不走 export-mesh/.gia（不碰 delivery/，长跑会话正在用）
 *  - 输出到 web/draw/（web-server 静态服务），供页面 gms.part('mesh') fetch 加载
 *  - 始终从当前 dist 构建（含当日全部修复：刻字条移除/圆角分段/曲面细分优化）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { buildMacbook14 } from '../../dist/src/model/macbook/geometry.js';
import { linearToSrgb } from '../../dist/src/render/image.js';

const ROOT = new URL('../..', import.meta.url).pathname;
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}
const lod = parseFloat(arg('lod', '1.0'));   // 渲染级（页面通道用：低 LOD 的 6 段圆角在 3/4 视角下呈阶梯折面，裁判点名）
const OUT = arg('out', 'web/draw/macbook-current.json');
const openAngle = parseFloat(arg('open', '100')), color = arg('color', 'silver'), screenOn = arg('screen', '1') !== '0';

const logo = JSON.parse(readFileSync(ROOT + 'reference/macbook/logo-outline.json', 'utf8'));
const built = buildMacbook14({ openAngle, screenOn, color, lod, legends: false }, { logo });
const mesh = built.mesh;

// ---- 上盖（lid）刚体标记：演示视频要「开盖/合盖」，页面必须知道哪些顶点属于上盖 ----
// 做法：同参数再建一次 0° 姿态，逐顶点比对——只有上盖顶点会动（geometry.ts §7 用 xf() 绕转轴旋转），
// 本体/转轴顶点两姿态完全一致。拓扑与姿态无关（只改角度，采样数不变），所以索引一一对应。
// 转轴数值取 spec.ts（L.closedY / L.hingeZ），与 geometry.ts 的 xf() 同源，避免两处漂移。
let LID = null;
{
  // 参考姿态必须与输出姿态不同，否则一个顶点都不会"动"→ 闭合网格拿不到 lid 区间
  // （2026-09-10 修：闭合网格缺 lid 字段 → 页面不知道该合盖，屏幕不熄 → 合盖后壁纸从缝里透出来）
  const refAngle = openAngle === 0 ? 100 : 0;
  const zero = buildMacbook14({ openAngle: refAngle, screenOn, color, lod, legends: false }, { logo }).mesh;
  if (zero.pos.length !== mesh.pos.length || zero.idx.length !== mesh.idx.length) {
    console.warn('!! lid 标记跳过：两个姿态的拓扑不一致（顶点/索引数不同）');
  } else {
    const n = mesh.pos.length / 3;
    const flag = new Uint8Array(n);
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(mesh.pos[i * 3] - zero.pos[i * 3]) + Math.abs(mesh.pos[i * 3 + 1] - zero.pos[i * 3 + 1]) + Math.abs(mesh.pos[i * 3 + 2] - zero.pos[i * 3 + 2]);
      if (d > 1e-9) { flag[i] = 1; moved++; }
    }
    // 必须是连续区间（本体 → 上盖 → 转轴 的发射顺序）
    let first = -1, last = -1, holes = 0;
    for (let i = 0; i < n; i++) {
      if (flag[i]) { if (first < 0) first = i; if (last >= 0 && i !== last + 1) holes++; last = i; }
    }
    const SPEC = await import('../../dist/src/model/macbook/spec.js');
    const S_M = 1e-3;
    LID = {
      from: first, to: last + 1, moved, holes,
      hingeY: SPEC.S.lid.closedY * S_M, hingeZ: SPEC.S.lid.hingeZ * S_M,
      angle: openAngle,
    };
    if (holes) console.warn('!! lid 顶点区间有 ' + holes + ' 处断裂——页面拆分可能漏件');
  }
}

const hexOf = built.materials.map((m) => {
  const to255 = (v) => Math.max(0, Math.min(255, linearToSrgb(v)));
  return '0x' + [0, 1, 2].map((i) => to255(m.baseColor[i]).toString(16).padStart(2, '0')).join('');
});

// ---- 焊接（2e-4 m，同门禁 weldTolerance）----
// 上盖标记进 cell key：上盖与本体/转轴在转轴附近可能贴得比容差还近，
// 一旦焊到一起，开盖动画会把本体顶点一起拽走（转轴处撕开）。按部件隔离焊接即可根除。
const TOL = 2e-4;
const isLid = (i) => (LID && i >= LID.from && i < LID.to ? 1 : 0);
const cells = new Map();
const remap = new Int32Array(mesh.pos.length / 3);
const vertices = [];
const key = (a, b, c, f) => a + ',' + b + ',' + c + '|' + f;
for (let i = 0; i < mesh.pos.length / 3; i++) {
  const x = mesh.pos[i * 3], y = mesh.pos[i * 3 + 1], z = mesh.pos[i * 3 + 2];
  const f = isLid(i);
  const gx = Math.floor(x / TOL), gy = Math.floor(y / TOL), gz = Math.floor(z / TOL);
  let hit = -1;
  outer:
  for (let dx = -1; dx <= 1 && hit < 0; dx++)
    for (let dy = -1; dy <= 1 && hit < 0; dy++)
      for (let dz = -1; dz <= 1 && hit < 0; dz++) {
        const arr = cells.get(key(gx + dx, gy + dy, gz + dz, f));
        if (!arr) continue;
        for (const j of arr) {
          const v = vertices[j];
          if (Math.abs(v[0] - x) <= TOL && Math.abs(v[1] - y) <= TOL && Math.abs(v[2] - z) <= TOL) { hit = j; break outer; }
        }
      }
  if (hit < 0) {
    hit = vertices.length;
    vertices.push([+x.toFixed(6), +y.toFixed(6), +z.toFixed(6)]);
    const k = key(gx, gy, gz, f);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(hit);
  }
  remap[i] = hit;
}
// 焊接后上盖顶点是否仍为连续区间（页面按区间拆分；不连续就报出来）
let lidFrom = -1, lidTo = -1, lidBreaks = 0, mixedTris = 0;
if (LID) {
  const seen = new Uint8Array(vertices.length);
  for (let i = 0; i < remap.length; i++) if (isLid(i)) seen[remap[i]] = 1;
  for (let v = 0; v < seen.length; v++) if (seen[v]) { if (lidFrom < 0) lidFrom = v; if (lidTo >= 0 && v !== lidTo + 1) lidBreaks++; lidTo = v; }
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
  if (LID && lidFrom >= 0) {
    const la = a >= lidFrom && a <= lidTo, lb = b >= lidFrom && b <= lidTo, lc = c >= lidFrom && c <= lidTo;
    if ((la || lb || lc) && !(la && lb && lc)) mixedTris++;
  }
  faces.push(a, b, c);
  colors.push(hexOf[mesh.mat[t]]);
}

const out = { name: `macbook-pro-14-${color}-${openAngle === 0 ? 'closed' : 'open' + openAngle}-r4`, vertices, faces, colors };
if (LID && lidFrom >= 0) {
  out.lid = { from: lidFrom, to: lidTo + 1, hingeY: LID.hingeY, hingeZ: LID.hingeZ, angle: LID.angle };
  console.log(`lid: verts [${lidFrom}, ${lidTo}] (${lidTo - lidFrom + 1}) | 原始动点 ${LID.moved} | 区间断裂 ${LID.holes} | 焊接后断裂 ${lidBreaks} | 跨部件三角 ${mixedTris} | 转轴 y=${LID.hingeY} z=${LID.hingeZ} @${LID.angle}°`);
}
mkdirSync(ROOT + 'web/draw/', { recursive: true });
const json = JSON.stringify(out);
writeFileSync(ROOT + OUT, json);
// 同时写 gzip 版（2.58MB → 0.36MB，7.1×）。页面用 fetch + DecompressionStream 解压，
// 不需要服务器支持 Content-Encoding（web-server.js 零依赖单文件，不重启它）。
const gz = gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
writeFileSync(ROOT + OUT + '.gz', gz);
console.log(`verts ${vertices.length} | tris ${faces.length / 3} | dropped ${dropped} | colors ${new Set(colors).size}`);
console.log(`written: ${OUT} (${(json.length / 1048576).toFixed(2)}MB) + .gz (${(gz.length / 1048576).toFixed(2)}MB)`);
