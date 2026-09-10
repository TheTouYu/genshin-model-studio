#!/usr/bin/env node
// curv-qa 自检：用**合成真值**验证这把尺子（尺子会撒谎比没有尺子更糟）
// 每个用例有已知缺陷/已知良好，断言工具的读数必须落在预期区间。
// 跑法：node scripts/max/curv-qa-selftest.mjs
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const DIR = '.scratch/curvqa-selftest'; fs.mkdirSync(DIR, { recursive: true });
const write = (name, V, F, colors) => { const f = path.join(DIR, name + '.json'); fs.writeFileSync(f, JSON.stringify({ name, vertices: V, faces: F.flat(), colors: F.map((_, i) => colors[Math.min(colors.length - 1, i)] || colors[0]) })); return f; };
const run = f => { try { return JSON.parse(execFileSync(process.execPath, ['scripts/max/curv-qa.mjs', f, '--min-tris', '1'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('✓')[0]); } catch (e) { return null; } };
const runJson = f => {
  const out = path.join(DIR, 'r');
  fs.rmSync(out, { recursive: true, force: true });          // ← 必须清干净：否则读到上一个用例的残留报告（自检自己会撒谎）
  try { execFileSync(process.execPath, ['scripts/max/curv-qa.mjs', f, '--min-tris', '1', '--out', out], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { if (!fs.existsSync(path.join(out, 'curv-report.json'))) throw new Error(`工具未产出报告（真崩了）: ${f}\n${e.stderr || e.message}`); }
  return JSON.parse(fs.readFileSync(path.join(out, 'curv-report.json'), 'utf8')).groups[0];
};

// ---- 用例构造（单位 m，与页面网格一致）----
const R = 0.05, H = 0.02;
function cylinder(skipSeg) {
  const n = 64, V = [], F = [];
  for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI; V.push([R * Math.cos(a), 0, R * Math.sin(a)], [R * Math.cos(a), H, R * Math.sin(a)]); }
  for (let i = 0; i < n; i++) {
    const j = (skipSeg && i === 10) ? (i + 2) % n : (i + 1) % n;   // 跳一段 = 该面跨 2 段（不是挖洞）
    const a = 2 * i, b = 2 * i + 1, c = 2 * j, d = 2 * j + 1;
    F.push([a, b, d], [a, d, c]);
  }
  return { V, F };
}
function flatPlate(nx, nz) {                          // 纯平面
  const V = [], F = [], s = 0.1;
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) V.push([i / nx * s, 0, j / nz * s]);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const a = i * (nz + 1) + j; F.push([a, a + 1, a + nz + 2], [a, a + nz + 2, a + nz + 1]); }
  return { V, F };
}
function roundedPlate(segsPerCorner) {                // 圆角板：角弧 segsPerCorner 段（粗=可见多边形）
  const w = 0.2, d = 0.15, r = 0.03, V = [], F = []; const ring = [];
  const corner = (cx, cz, a0, a1) => { for (let i = 0; i <= segsPerCorner; i++) { const a = a0 + (a1 - a0) * i / segsPerCorner; ring.push([cx + r * Math.cos(a), 0, cz + r * Math.sin(a)]); } };
  corner(w / 2 - r, d / 2 - r, 0, Math.PI / 2); corner(-w / 2 + r, d / 2 - r, Math.PI / 2, Math.PI);
  corner(-w / 2 + r, -d / 2 + r, Math.PI, 1.5 * Math.PI); corner(w / 2 - r, -d / 2 + r, 1.5 * Math.PI, 2 * Math.PI);
  const n = ring.length;
  for (const p of ring) V.push(p);
  V.push([0, 0, 0]);                                  // 扇心
  for (let i = 0; i < n; i++) F.push([i, (i + 1) % n, n]);
  return { V, F };
}
function crease(deg) {                                // 两块平板共用一条边、折 deg 度（同组）
  const s = 0.1, t = Math.tan(deg * Math.PI / 180), V = [], F = [];
  for (let i = 0; i <= 2; i++) { V.push([i / 2 * s, 0, 0], [i / 2 * s, i / 2 * s * t, s]); }
  for (let i = 0; i < 2; i++) { const a = 2 * i; F.push([a, a + 1, a + 3], [a, a + 3, a + 2]); }
  return { V, F };
}
function creaseDense(deg) {                            // 密集网格折痕：邻居共面 → 折痕应凸显
  const nx = 20, nz = 6, s = 0.1, t = Math.tan(deg * Math.PI / 180), V = [], F = [];
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) V.push([i / nx * s, 0, j / nz * s, ].slice(0, 3) && [i / nx * s, 0, j / nz * s].map((v, k) => k === 1 ? (i > nx / 2 ? (i / nx * s - s / 2) * t : 0) : v));
  const at = (i, j) => i * (nz + 1) + j;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) F.push([at(i, j), at(i, j + 1), at(i + 1, j + 1)], [at(i, j), at(i + 1, j + 1), at(i + 1, j)]);
  return { V, F };
}
function crackedPlate() {                             // 两块共线平板，**顶点不共享**（未焊接重合点）
  const a = flatPlate(3, 2), b = flatPlate(3, 2); const V = a.V.concat(b.V.map(p => [p[0] + 0.1000000001, p[1], p[2]]));
  const F = a.F.concat(b.F.map(f => f.map(i => i + a.V.length))); return { V, F };
}

// ---- 断言 ----
const T = []; const ok = (n, cond, got) => T.push([n, !!cond, got]);
let g;
g = runJson(write('cyl-smooth', ...Object.values(cylinder(false)).slice(0, 2).concat([['0xf3f3f4']])));
ok('均匀圆柱：p50≈5.6°', Math.abs(g.p50 - 5.63) < 0.2, g.p50);
ok('均匀圆柱：maxP50≈1.0（无跳段）', g.maxP50 < 1.15, g.maxP50);
ok('均匀圆柱：jumpPx=0（无局部跳变）', g.jump_px === 0, g.jump_px);
ok('均匀圆柱：dup=0', g.dup === 0, g.dup);
ok('均匀圆柱：open=128（两端开口）', g.open === 128, g.open);
g = runJson(write('cyl-skip', ...Object.values(cylinder(true)).slice(0, 2).concat([['0xf3f3f4']])));
ok('跳一段圆柱：jumpPx≥1（局部跳变抓到）', g.jump_px >= 1, g.jump_px);
ok('跳一段圆柱：jumpMax≥8°（该处坡度翻倍）', g.jump_max >= 8, g.jump_max);
ok('跳一段圆柱：curved=Y（非零中位 5.6° 认得出来）', g.curved === true, g.curved);
g = runJson(write('plate-coarse', ...Object.values(roundedPlate(2)).slice(0, 2).concat([['0xf3f3f4']])));
// 边界认知（写进自检，别让它以后变成假警报）：扇形三角化的**平面**板件内部二面角恒为 0，
// 圆角质量只存在于轮廓折线 → 由 bnd_* 判据负责，不看内部 p95。
ok('粗圆角板：内部二面角≈0（扇形三角化平面件，符合预期）', g.p95 < 1, g.p95);
ok('粗圆角板：轮廓粗折被抓（bndMax≥40°）', g.bnd_max >= 40, g.bnd_max);
ok('粗圆角板：bnd_px>0（>15° 转角计数）', g.bnd_px > 0, g.bnd_px);
g = runJson(write('plate-fine', ...Object.values(roundedPlate(12)).slice(0, 2).concat([['0xf3f3f4']])));
ok('细圆角板（12 段/角）：轮廓转角≤10°（够圆）', g.bnd_max <= 10, g.bnd_max);
ok('细圆角板：bnd_px=0（不误报）', g.bnd_px === 0, g.bnd_px);
g = runJson(write('flat', ...Object.values(flatPlate(4, 4)).slice(0, 2).concat([['0x1d1d1f']])));
ok('纯平面：curved=N（不误报为弧面）', g.curved === false, g.curved);
ok('纯平面：jumpPx=0 / dup=0（无假阳性）', g.jump_px === 0 && g.dup === 0, `${g.jump_px}/${g.dup}`);
g = runJson(write('crease30', ...Object.values(crease(30)).slice(0, 2).concat([['0xf3f3f4']])));
ok('粗网格 30° 折痕：jumpMax>3°（粗网格下被三角化对角线稀释，如实记录）', g.jump_max > 3, g.jump_max);
g = runJson(write('crease30-dense', ...Object.values(creaseDense(30)).slice(0, 2).concat([['0xf3f3f4']])));
ok('密集网格 30° 折痕：jumpPx>0（抓到局部折）', g.jump_px > 0, g.jump_px);
ok('密集网格 30° 折痕：jumpMax≈30°', Math.abs(g.jump_max - 30) < 2, g.jump_max);
g = runJson(write('crack', ...Object.values(crackedPlate()).slice(0, 2).concat([['0xf3f3f4'], ['0xe7e7e8']])));
ok('未焊接重合点：dup>0（结构裂缝）', g.dup > 0, g.dup);

let bad = 0;
for (const [n, pass, got] of T) { if (!pass) bad++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}  → ${got}`); }
console.log(`\n${T.length - bad}/${T.length} 通过（合成真值自检）`);
process.exitCode = bad ? 1 : 0;
