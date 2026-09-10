#!/usr/bin/env node
// curv-qa.mjs —— 全网格「弧度/连续性」审计（deck-qa 的整机推广版，零依赖）
//
// deck-qa 只能看一个矩形区域（俯视高度场）；而「四角不够圆滑 / 弧面跳段 / 接缝有折 / 贴片浮空」
// 散布全机各处。本工具不开浏览器、不摆机位：直接把网格的**面片二面角**与**法线场**统计出来，
// 一次列出每个部件（按颜色分组）的弧度质量与全部离群位置。
//
// 判据设计（关键：区分「故意折」与「缺陷折」）
//   · 一个棱柱的 90° 直角，若每条相邻边都是 90°，那是**故意折**（jump≈0）；
//     缺陷折 = 一条边折了、邻居没折（jump 大）→ 用**顶点局部跳变**判定，而非绝对角度。
//   · jump_max/jump_px：顶点处相邻边二面角的 max−min（≥3 条边才统计）。弧面均匀细分 → ≈0。
//   · p95：分面粗细（越粗细分越像多边形）。仅对 curved 件有意义。
//   · dup：重合但未焊接的顶点（结构裂缝，渲染出黑线）。
//   · open：只被 1 个面用到的边（开口；壳件本来就开，仅参考）。
//   · seam：与其它颜色部件共享的边（部件间接缝），按共享顶点索引，本身不产生 gap。
//
// 用法：
//   node scripts/max/curv-qa.mjs web/draw/macbook-current.json [--out DIR] [--worst 12]
//                                                  [--min-tris 12] [--group 0xf3f3f4]
// 退出码 1 = 有部件存在 jump 缺陷或未焊接重合点。
import fs from 'node:fs';
import path from 'node:path';

const A = process.argv.slice(2);
const arg = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const MESH = A.find(a => !a.startsWith('--') && /\.json$/i.test(a)) || 'web/draw/macbook-current.json';
const OUT = arg('out', ''), WORST = +arg('worst', 12), MINTRIS = +arg('min-tris', 12), ONLY = (arg('group', '') || '').toLowerCase();

const NAMES = {
  '0xf3f3f4': 'alu-silver', '0x1d1d1f': 'keycap', '0x191919': 'screen', '0x151516': 'glass-black',
  '0xe6e6e8': 'trackpad-glass', '0xfbfbfc': 'logo-mirror', '0x2f2f30': 'foot', '0xe7e7e8': 'etch',
  '0x0e0e0f': 'keycap-side', '0xfdfdfd': 'alu-gloss',
};
const hexOf = c => (typeof c === 'string' ? c.toLowerCase() : '0x' + (c >>> 0).toString(16).padStart(6, '0'));
const pad = (x, n) => String(x).padEnd(n);

// ============ 载入 ============
const raw = JSON.parse(fs.readFileSync(MESH, 'utf8'));
const V = raw.vertices;
// faces 契约：**扁平索引数组** [i0,j0,k0, i1,j1,k1, ...]（页面网格格式）。
// 兼容数组的数组写法（自检/手搓网格常用），免得用错格式还以为是几何有问题。
let F = raw.faces;
if (Array.isArray(F[0])) { F = F.flat(); console.error('note: faces 是数组的数组 → 已自动摊平（页面网格契约是扁平索引数组）'); }
const CO = raw.colors || [], NR = raw.normals || null;
const NV = V.length;
if (F.length % 3 !== 0) { console.error(`faces 长度 ${F.length} 不是 3 的倍数——不是扁平索引数组契约`); process.exit(2); }
const NT = F.length / 3;
let maxAbs = 0;
for (const p of V) maxAbs = Math.max(maxAbs, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
const S = maxAbs < 10 ? 1000 : 1;                 // → mm
const U = v => v * S;
const EPS = maxAbs < 10 ? 1e-9 : 1e-6;            // 焊接判定容差（原单位）
const OL = S === 1000 ? 'm→mm' : 'mm';

// ============ 面法线 ============
const FN = new Float64Array(NT * 3), AR = new Float64Array(NT);
for (let t = 0; t < NT; t++) {
  const a = V[F[t * 3]], b = V[F[t * 3 + 1]], c = V[F[t * 3 + 2]];
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const L = Math.hypot(nx, ny, nz);
  AR[t] = L * 0.5;
  if (L > 0) { nx /= L; ny /= L; nz /= L; }
  FN[t * 3] = nx; FN[t * 3 + 1] = ny; FN[t * 3 + 2] = nz;
}

// ============ 边 → 面 ============
const ekey = (a, b) => (a < b ? a * NV + b : b * NV + a);
const e1 = new Map(), e2 = new Map();
for (let t = 0; t < NT; t++) {
  const i0 = F[t * 3], i1 = F[t * 3 + 1], i2 = F[t * 3 + 2];
  for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]]) {
    const k = ekey(a, b);
    if (!e1.has(k)) e1.set(k, t); else if (!e2.has(k)) e2.set(k, t);
  }
}

// ============ 分组 ============
const gid = new Map(), groups = [];
const triGroup = new Int32Array(NT).fill(-1);
for (let t = 0; t < NT; t++) {
  const h = hexOf(CO[t] !== undefined ? CO[t] : 0);
  if (!gid.has(h)) { gid.set(h, groups.length); groups.push({ hex: h, tris: 0, area: 0 }); }
  const g = gid.get(h); triGroup[t] = g; groups[g].tris++; groups[g].area += AR[t];
}
const NG = groups.length;

// ============ 逐边二面角 ============
const dihOf = new Float64Array(e1.size).fill(NaN);   // 只统计**同组**内部边
const dihKey = new Map();                            // edgeKey → 索引（供顶点跳变用）
const edgeOf = [], edgeDih = [];
let ei = 0;
for (const [k, t1] of e1) {
  const t2 = e2.get(k);
  dihKey.set(k, ei++);
  if (t2 === undefined) { edgeOf.push(k); edgeDih.push(NaN); continue; }
  if (triGroup[t1] !== triGroup[t2]) { edgeOf.push(k); edgeDih.push(NaN); continue; }   // 跨部件不判
  const d = FN[t1 * 3] * FN[t2 * 3] + FN[t1 * 3 + 1] * FN[t2 * 3 + 1] + FN[t1 * 3 + 2] * FN[t2 * 3 + 2];
  const ang = Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
  edgeOf.push(k); edgeDih.push(ang);
  dihOf[dihKey.get(k)] = ang;
}

// ============ 逐部件统计 + 顶点局部跳变 ============
const dihByGroup = groups.map(() => []);
const openByGroup = new Int32Array(NG), seamByGroup = new Int32Array(NG);
const bndEdges = groups.map(() => []);      // 开边（只被 1 个面用）→ 轮廓折线，供「圆角够不够圆」判据
const bndVert = new Map();                  // 顶点 → 边界邻居顶点（限开边）
const vMax = new Float64Array(NV).fill(-1), vMin = new Float64Array(NV).fill(1e9), vCnt = new Int32Array(NV);
const vGroup = new Int32Array(NV).fill(-1);
for (let t = 0; t < NT; t++) for (let c = 0; c < 3; c++) { const i = F[t * 3 + c]; if (vGroup[i] < 0) vGroup[i] = triGroup[t]; }

for (let idx = 0; idx < edgeOf.length; idx++) {
  const k = edgeOf[idx], ang = edgeDih[idx], a = Math.floor(k / NV), b = k % NV;
  const t1 = e1.get(k), t2 = e2.get(k);
  if (Number.isNaN(ang)) {                       // NaN = 开边 或 跨部件缝
    if (t2 === undefined) {
      const g0 = triGroup[t1]; openByGroup[g0]++; bndEdges[g0].push(k);
      if (!bndVert.has(a)) bndVert.set(a, new Set()); if (!bndVert.has(b)) bndVert.set(b, new Set());
      bndVert.get(a).add(b); bndVert.get(b).add(a);
    } else seamByGroup[triGroup[t1]]++;
    continue;
  }
  dihByGroup[triGroup[t1]].push(ang);
  for (const v of [a, b]) {
    if (ang > vMax[v]) vMax[v] = ang;
    if (ang < vMin[v]) vMin[v] = ang;
    vCnt[v]++;
  }
}

// ============ 未焊接重合点（结构裂缝）============
const posMap = new Map();
for (let i = 0; i < NV; i++) {
  const k = Math.round(V[i][0] / EPS) + ',' + Math.round(V[i][1] / EPS) + ',' + Math.round(V[i][2] / EPS);
  if (!posMap.has(k)) posMap.set(k, []);
  posMap.get(k).push(i);
}
const dupByGroup = new Int32Array(NG);      // 同组内重合但未共享 = **真裂缝**
const touchByGroup = new Int32Array(NG);    // 跨组重合 = 两片壳贴合（一般无害）
const dupLoc = [];
for (const arr of posMap.values()) {
  if (arr.length < 2) continue;
  const gs = new Set(arr.map(i => vGroup[i]));
  const same = gs.size === 1;
  for (const i of arr) {
    if (vGroup[i] < 0) continue;
    if (same) { dupByGroup[vGroup[i]]++; } else { touchByGroup[vGroup[i]]++; }
  }
  if (same) dupLoc.push({ g: [...gs][0], n: arr.length, x: +U(V[arr[0]][0]).toFixed(1), y: +U(V[arr[0]][1]).toFixed(1), z: +U(V[arr[0]][2]).toFixed(1) });
}
dupLoc.sort((a, b) => b.n - a.n);

// ============ 平滑法线（角点法线 vs 自身面法线）============
const smoothByGroup = groups.map(() => []);
if (NR) for (let t = 0; t < NT; t++) {
  const g = triGroup[t];
  for (let c = 0; c < 3; c++) {
    const n = NR[F[t * 3 + c]]; if (!n) continue;
    const dot = n[0] * FN[t * 3] + n[1] * FN[t * 3 + 1] + n[2] * FN[t * 3 + 2];
    smoothByGroup[g].push(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI);
  }
}

// ============ 汇总 ============
const q = (arr, p) => { if (!arr.length) return 0; const s = arr.length > 40000 ? Float64Array.from(arr).sort() : arr.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; };
const rows = [];
for (let g = 0; g < NG; g++) {
  const d = dihByGroup[g], p50 = q(d, 0.5), p90 = q(d, 0.9), p95 = q(d, 0.95);
  const pMax = d.reduce((m, v) => v > m ? v : m, 0);
  const nz = d.filter(v => v > 0.5);                                   // 只看真有弧度的边
  const nz50 = q(nz, 0.5);
  const maxP50 = nz50 > 0.5 ? pMax / nz50 : 0;                         // 分面均匀度：均匀弧≈1.0；跳一段≈2.0；漏采样≫3
  // 顶点跳变：只统计该组顶点，且 ≥3 条内部边
  let jMax = 0, jPx = 0, jAt = null;
  for (let v = 0; v < NV; v++) {
    if (vGroup[v] !== g || vCnt[v] < 2) continue;
    const j = vMax[v] - vMin[v];
    if (j > jMax) { jMax = j; jAt = [+U(V[v][0]).toFixed(1), +U(V[v][1]).toFixed(1), +U(V[v][2]).toFixed(1)]; }
    if (j > 8) jPx++;
  }
  // 轮廓转角：相邻两条边界边的方向夹角（直边=0°；圆角被均匀细分≈每段转角；粗折=大角）
  const turns = [];
  for (const [v, nb] of bndVert) {
    if (vGroup[v] !== g || nb.size !== 2) continue;
    const [n1, n2] = [...nb];
    const e1v = [V[n1][0] - V[v][0], V[n1][1] - V[v][1], V[n1][2] - V[v][2]];
    const e2v = [V[n2][0] - V[v][0], V[n2][1] - V[v][1], V[n2][2] - V[v][2]];
    const l1 = Math.hypot(...e1v) || 1, l2 = Math.hypot(...e2v) || 1;
    const dot = (e1v[0] * e2v[0] + e1v[1] * e2v[1] + e1v[2] * e2v[2]) / (l1 * l2);
    turns.push(180 - Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI);
  }
  const bndP95 = q(turns, 0.95), bndMax = turns.reduce((m, v) => v > m ? v : m, 0);
  const bndPx = turns.filter(t => t > 15).length;

  rows.push({
    hex: groups[g].hex, name: NAMES[groups[g].hex] || '', tris: groups[g].tris, area: +(groups[g].area * S * S).toFixed(1),
    curved: nz.length > 8 && nz50 > 0.5, p50: +p50.toFixed(2), p90: +p90.toFixed(2), p95: +p95.toFixed(2),
    p_max: +pMax.toFixed(2), maxP50: +maxP50.toFixed(2),
    jump_max: +jMax.toFixed(2), jump_at: jAt, jump_px: jPx,
    open: openByGroup[g], dup: dupByGroup[g], touch: touchByGroup[g], seam: seamByGroup[g],
    bnd_p95: +bndP95.toFixed(2), bnd_max: +bndMax.toFixed(2), bnd_px: bndPx,
    smooth90: +q(smoothByGroup[g], 0.9).toFixed(2),
  });
}
const cur = rows.filter(r => r.tris >= MINTRIS && (!ONLY || r.hex === ONLY));
cur.sort((a, b) => (b.jump_px - a.jump_px) || (b.jump_max - a.jump_max) || (b.p95 - a.p95) || (b.tris - a.tris));

console.log(`mesh: ${path.basename(MESH)} | ${NV} verts / ${NT} tris | 单位 ${OL} | ${NG} 个部件组（列出 tris≥${MINTRIS}）`);
console.log(pad('hex', 10) + pad('name', 16) + pad('tris', 8) + pad('curved', 7) + pad('p50', 7) + pad('p90', 7) + pad('p95', 7) + pad('maxP50', 8) + pad('jumpMax', 9) + pad('jumpPx', 8) + pad('bnd95', 7) + pad('bndMax', 8) + pad('open', 7) + pad('dup', 6) + pad('touch', 7) + pad('seam', 6) + 'smooth90');
for (const r of cur) {
  console.log(pad(r.hex, 10) + pad(r.name || '-', 16) + pad(r.tris, 8) + pad(r.curved ? 'Y' : '.', 7) +
    pad(r.p50, 7) + pad(r.p90, 7) + pad(r.p95, 7) + pad(r.maxP50, 8) + pad(r.jump_max, 9) + pad(r.jump_px, 8) + pad(r.bnd_p95, 7) + pad(r.bnd_max, 8) + pad(r.open, 7) + pad(r.dup, 6) + pad(r.touch, 7) + pad(r.seam, 6) + r.smooth90);
}
if (ONLY) console.log('\n(--group 过滤仅影响表格；离群清单仍为全机)');

// 最大二面角定位（同组内部，= 折痕候选）
const top = [];
for (let idx = 0; idx < edgeOf.length; idx++) {
  const ang = edgeDih[idx]; if (Number.isNaN(ang)) continue;
  const k = edgeOf[idx], a = Math.floor(k / NV), b = k % NV;
  top.push({ g: triGroup[e1.get(k)], ang, x: +U((V[a][0] + V[b][0]) / 2).toFixed(1), y: +U((V[a][1] + V[b][1]) / 2).toFixed(1), z: +U((V[a][2] + V[b][2]) / 2).toFixed(1) });
}
top.sort((p, r) => r.ang - p.ang);
console.log(`\n最大二面角 ${WORST} 处（同组内部；棱柱直角本来就大，需看该处 jump 是否也大）：`);
for (const o of top.slice(0, WORST)) console.log(`  ${String(o.ang.toFixed(1)).padStart(6)}°  ${pad(NAMES[groups[o.g].hex] || groups[o.g].hex, 16)} @ (${o.x}, ${o.y}, ${o.z}) mm`);

if (dupLoc.length) {
  console.log(`\n同组重合点（真裂缝）最多 ${Math.min(8, dupLoc.length)} 处：`);
  for (const d of dupLoc.slice(0, 8)) console.log(`  ${String(d.n).padStart(3)} 个重合点  ${pad(NAMES[groups[d.g].hex] || groups[d.g].hex, 16)} @ (${d.x}, ${d.y}, ${d.z}) mm`);
}

if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'curv-report.json'), JSON.stringify({ mesh: MESH, units: OL, groups: rows, worst: top.slice(0, 300), dup: dupLoc.slice(0, 100) }, null, 1));
  console.log(`\n→ ${path.join(OUT, 'curv-report.json')}`);
}

// 判据门：① 未焊接重合点（结构裂缝）② 局部跳变（折/台阶）③ 轮廓粗折（圆角不圆：轮廓里 >15° 的转角）
const bad = cur.filter(r => r.dup > 0 || (r.jump_px > 0 && r.jump_max > 12) || (r.curved && r.bnd_px > 0));
if (bad.length) {
  console.log(`\n⚠ ${bad.length} 个部件有局部跳变或未焊接重合点：` + bad.slice(0, 10).map(r => `${r.name || r.hex}(jumpPx=${r.jump_px}${r.dup ? `,dup=${r.dup}` : ''})`).join(' '));
  process.exitCode = 1;
} else console.log('\n✓ 无局部跳变 / 无未焊接重合点');
