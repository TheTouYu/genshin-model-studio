#!/usr/bin/env node
/**
 * hole-arc-qa — 孔边「真弧度」审计（R74 资产，扫描线开孔问题族的机器眼睛）
 *
 * 问题族：`plateWithHoles` 按 z 分带（maxCell≈1mm）求孔的 x 区间 → 孔的**圆角弧**被量化成方阶梯。
 * 键盘井角、栅格角、触控板角、转轴槽角同族。近距特写读作「阶梯/锯齿」，与三角密度无关。
 *
 * 判据（不依赖渲染图、不依赖人工看图）：
 *   1) 从 page 网格里取出**真实孔边折线**（只被一个三角形使用的边 = 边界边，且限 y/颜色/水平面）；
 *   2) 在四个角的象限里，按角度密采理想圆弧上的点 P(θ)；
 *   3) 量 P(θ) 到孔边折线（线段集）的最短距离 → maxArcDev。
 *      · 真弧（R74 新算法）：≈0.00–0.02mm（只剩弦高）
 *      · 扫描线阶梯：0.2–0.8mm（阶高一半量级）
 *   4) 附带量化指标：角部边界 x 的离散档数、沿 z 的最长「x 不变」平段（阶梯宽度）。
 *
 * 用法：
 *   node scripts/max/hole-arc-qa.mjs <mesh.json> [--y 11.5] [--color 0xf3f3f4]
 *        [--tol 0.10] [--hole cx,cz,w,d,r]... [--out DIR]
 *   不给 --hole 时用内置的 MacBook 14" 台面板五孔（参数从 dist 的 spec 现算，单一真源）。
 * 退出码 1 = 任一孔 maxArcDev 超 --tol。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { S } from '../../dist/src/model/macbook/spec.js';

const args = process.argv.slice(2);
const file = args[0];
if (!file) { console.error('用法: node scripts/max/hole-arc-qa.mjs <mesh.json> [--y mm] [--color hex] [--tol mm] [--hole cx,cz,w,d,r]...'); process.exit(2); }
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const holesArg = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--hole') holesArg.push(args[i + 1].split(',').map(Number));

const j = JSON.parse(readFileSync(file, 'utf8'));
const V = j.vertices, F = j.faces, C = j.colors;
let maxAbs = 0;
for (const p of V) maxAbs = Math.max(maxAbs, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
const U = maxAbs < 10 ? 1000 : 1;                        // 网格单位 → mm
const yMM = Number(opt('y', 11.5));
const color = String(opt('color', '0xf3f3f4'));
// tol 默认 0.20mm：真弧版实测 ≤0.17mm，残余**不是圆角算法**造成的——
// 孔与孔相切处（栅格内边 = 井口边 x=±142.45）板件薄带 < plateWithHoles 的 SNAP=0.3mm
// → 薄带被并档，孔边整体偏移 0.1–0.17mm。扫描线版同口径 1.09–1.19mm（差 7–10×）。
// 键盘井（本轮目标件）真弧版 0.061mm。
const tol = Number(opt('tol', 0.20));
const outDir = opt('out', null);
const dbg = args.includes('--debug');

// 台面板五孔（公式与 geometry.ts 同源；spec 从 dist 读，避免副本不同步）
const kb = S.keyboard, kbDepth = 5 * kb.pitchY + kb.keyH, wellRear = 1.0, SH = 0.4;
const wellW = kb.blockW + kb.wellMargin * 2, wellD = kbDepth + kb.wellMargin + wellRear;
const wellCz = S.deck.kbBackZ + (kbDepth + kb.wellMargin - wellRear) / 2;
const grilleCx = kb.blockW / 2 + kb.wellMargin + S.grille.w / 2 - 0.4;
const hslot = S.hinge.slot, tp = S.trackpad;
const DEFAULTS = [
  { name: 'keyboard-well', cx: 0, cz: wellCz, w: wellW - SH, d: wellD - SH, r: 4.0 },
  { name: 'grille-L', cx: -grilleCx, cz: wellCz, w: S.grille.w - SH, d: S.grille.d - SH, r: S.grille.r },
  { name: 'grille-R', cx: grilleCx, cz: wellCz, w: S.grille.w - SH, d: S.grille.d - SH, r: S.grille.r },
  { name: 'hinge-slot', cx: 0, cz: hslot.cz, w: hslot.w, d: hslot.d, r: hslot.r },
  { name: 'trackpad', cx: 0, cz: (S.deck.tpBackZ + S.deck.tpFrontZ) / 2, w: tp.w + 0.9, d: tp.d + 0.9, r: tp.r + 0.45 },
];
const holes = holesArg.length ? holesArg.map((h, i) => ({ name: `hole${i}`, cx: h[0], cz: h[1], w: h[2], d: h[3], r: h[4] ?? 0 })) : DEFAULTS;

// ---- 真实孔边：只被一个三角形使用的水平边 ----
const key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
const cnt = new Map();
let planeTris = 0;
for (let f = 0; f < F.length; f += 3) {
  if (C[f / 3] !== color) continue;
  const a = F[f], b = F[f + 1], c = F[f + 2];
  if (Math.abs(V[a][1] - V[b][1]) > 1e-9 || Math.abs(V[a][1] - V[c][1]) > 1e-9) continue;
  if (Math.abs(V[a][1] * U - yMM) > 0.02) continue;
  planeTris++;
  for (const [p, q] of [[a, b], [b, c], [c, a]]) cnt.set(key(p, q), (cnt.get(key(p, q)) || 0) + 1);
}
const segs = [];
for (const [k, n] of cnt) {
  if (n !== 1) continue;
  const [a, b] = k.split(':').map(Number);
  segs.push([V[a][0] * U, V[a][2] * U, V[b][0] * U, V[b][2] * U]);
}
const distSeg = (px, pz, s) => {
  const dx = s[2] - s[0], dz = s[3] - s[1];
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((px - s[0]) * dx + (pz - s[1]) * dz) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (s[0] + t * dx), pz - (s[1] + t * dz));
};

const report = { file, y: yMM, color, planeTris, boundarySegs: segs.length, tol, holes: [] };
for (const h of holes) {
  const hw = h.w / 2, hd = h.d / 2, rr = Math.min(h.r, Math.min(hw, hd));
  let worst = { dev: -1, corner: '-' };
  const corners = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const ocx = h.cx + sx * (hw - rr), ocz = h.cz + sz * (hd - rr);          // 弧心
      const local = segs.filter((s) => Math.abs(s[0] - ocx) < rr + 3 && Math.abs(s[2] - ocx) < rr + 3
        && Math.abs(s[1] - ocz) < rr + 3 && Math.abs(s[3] - ocz) < rr + 3);
      let dev = 0, n = 0;
      const a0 = sx > 0 ? (sz > 0 ? 0 : -Math.PI / 2) : (sz > 0 ? Math.PI / 2 : Math.PI);
      for (let i = 0; i <= 180; i++) {
        const th = a0 + (i / 180) * (Math.PI / 2);
        const px = ocx + rr * Math.cos(th), pz = ocz + rr * Math.sin(th);
        let best = Infinity;
        for (const s of local) { const d = distSeg(px, pz, s); if (d < best) best = d; if (best < 1e-6) break; }
        if (isFinite(best)) {
          if (best > dev) { dev = best; if (dbg) console.log(`   [${h.name} ${sx > 0 ? 'F' : 'B'}${sz > 0 ? 'R' : 'L'}] θ=${(th * 180 / Math.PI).toFixed(1)}° sample=(${px.toFixed(3)}, ${pz.toFixed(3)}) dev=${best.toFixed(4)} localSegs=${local.length}`); }
          n++;
        }
      }
      const c = { corner: `${sx > 0 ? 'F' : 'B'}${sz > 0 ? 'R' : 'L'}`, arcDev: dev, samples: n, localSegs: local.length };
      corners.push(c);
      if (dev > worst.dev) worst = { dev, corner: c.corner };
    }
  }
  // 量化指标（后左角）：边界顶点 x 档数 + 沿 z 最长「x 不变」平段
  const ocx = h.cx - (hw - rr), ocz = h.cz - (hd - rr);
  const cv = new Set(), cpts = [];
  for (const s of segs) for (const [x, z] of [[s[0], s[1]], [s[2], s[3]]]) {
    if (Math.abs(x - ocx) <= rr + 0.5 && Math.abs(z - ocz) <= rr + 0.5) { cv.add(x.toFixed(4)); cpts.push([x, z]); }
  }
  cpts.sort((a, b) => a[1] - b[1]);
  let run = 0, maxRun = 0;
  for (let i = 1; i < cpts.length; i++) {
    const dx = Math.abs(cpts[i][0] - cpts[i - 1][0]), dz = Math.abs(cpts[i][1] - cpts[i - 1][1]);
    if (dx < 1e-6 && dz < 1.2) { run += dz; maxRun = Math.max(maxRun, run); } else run = 0;
  }
  const r = { name: h.name, hole: h, maxArcDev: worst.dev, worstCorner: worst.corner, cornerXlevels: cv.size, maxFlatRun: maxRun, corners, pass: worst.dev <= tol };
  report.holes.push(r);
  console.log(`${r.name.padEnd(14)} maxArcDev ${r.maxArcDev.toFixed(4)}mm @${r.worstCorner}  角部x档数 ${r.cornerXlevels}  最长平段 ${r.maxFlatRun.toFixed(2)}mm  ${r.pass ? 'PASS' : 'FAIL'}`);
}
const worst = Math.max(...report.holes.map((h) => h.maxArcDev));
report.verdict = worst <= tol ? 'PASS' : 'FAIL';
console.log(`\nverdict: ${report.verdict}  (tol ${tol}mm；最差 ${worst.toFixed(4)}mm)  边界线段 ${segs.length}  台面三角形 ${planeTris}`);
if (outDir) { mkdirSync(outDir, { recursive: true }); const p = join(outDir, 'hole-arc-report.json'); writeFileSync(p, JSON.stringify(report, null, 2)); console.log('report →', p); }
process.exit(report.verdict === 'PASS' ? 0 : 1);
