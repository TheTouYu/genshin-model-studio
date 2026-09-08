#!/usr/bin/env node
/* L5 门禁单脚本多门：node scripts/check-hanfu-l5.mjs <gate>
   gate ∈ iou | sheets | horns | topology | gates | labels | colors | record39
   判据全部来自 docs/hanfu-l4-review-and-s5-prompt.md §6.5（L5-G1..L5-G9）。 */
import fs from 'node:fs';
import { loadMesh, loadG1, verify, seam, report, ROOT } from './lib/l4-common.mjs';

const gate = process.argv[2];
const R = (p) => JSON.parse(fs.readFileSync(`${ROOT}/${p}`, 'utf8'));
const has = (p) => fs.existsSync(`${ROOT}/${p}`);
const b5 = () => (has('.scratch/l5-build-report.json') ? R('.scratch/l5-build-report.json') : null);
const faces = (m) => m.faces.length / 3;

/* ---------- L5-G1 剪影收口 ---------- */
if (gate === 'iou') {
  const g1 = loadG1(); const mesh = loadMesh();
  const F = faces(mesh);
  const IOU_MIN = { front: 0.88, back: 0.88, side: 0.82 };
  const RATIO = [0.97, 1.06];
  const checks = [];
  const tag = JSON.stringify(g1.definition || {});
  checks.push({ name: '报告标签=终态面数', ok: tag.includes(String(F)), detail: `definition 含 ${F} 三角形` });
  for (const v of ['front', 'side', 'back']) {
    const V = g1.views[v]; const ratio = V.cagePx / V.refPx;
    checks.push({ name: `${v} 面积比`, ok: ratio >= RATIO[0] && ratio <= RATIO[1],
      detail: `cagePx/refPx=${V.cagePx}/${V.refPx}=${ratio.toFixed(3)} ∈[${RATIO[0]},${RATIO[1]}]` });
    checks.push({ name: `${v} IoU`, ok: V.iou >= IOU_MIN[v], detail: `${V.iou} ≥ ${IOU_MIN[v]}` });
  }
  report('L5-G1 剪影收口', checks);
}

/* ---------- L5-G2 薄片成型 ---------- */
if (gate === 'sheets') {
  const b = b5();
  const checks = [];
  if (!b || !b.sheets5) { checks.push({ name: '构建报告', ok: false, detail: '缺 .scratch/l5-build-report.json 或 sheets5' }); }
  else {
    for (const s of b.sheets5) {
      checks.push({ name: `${s.name} 环数≥3`, ok: s.rings >= 3, detail: `rings=${s.rings}` });
      checks.push({ name: `${s.name} 宽度比≥1.6`, ok: s.widthRatio >= 1.6,
        detail: `root=${s.rootWidthM}m tip=${s.tipWidthM}m ratio=${s.widthRatio}（方向 ${s.taperDir}）` });
      checks.push({ name: `${s.name} 非平移（可弯）`, ok: s.bendDeviationM >= 0.010,
        detail: `中心线偏离弦 ${s.bendDeviationM}m ≥ 0.010` });
    }
    const veil = (b.sheets5 || []).filter((s) => s.kind === 'veil');
    const vis = veil.filter((s) => (s.occlusionPct ?? 0) >= 15);
    checks.push({ name: '纱片≥2层可见遮挡', ok: vis.length >= 2,
      detail: `遮挡≥15% 的纱片 ${vis.length} 片 / 共 ${veil.length} 片` });
  }
  report('L5-G2 薄片成型', checks);
}

/* ---------- L5-G3 角形复位 ---------- */
if (gate === 'horns') {
  const b = b5();
  const lm = R('reference/ganyu-hanfu-landmarks.json');
  const PX = { front: 697.5, side: 685.0 };
  const px = (v, n) => (lm[v].landmarks.find((p) => p.name === n) || {}).pixel;
  const d2 = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1]);
  const refs = [];
  for (const [v, a, c] of [['front', 'horn_root_left', 'horn_tip_left'], ['front', 'horn_root_right', 'horn_tip_right'], ['side', 'horn_root', 'horn_tip_back']]) {
    const pa = px(v, a); const pc = px(v, c);
    if (pa && pc) refs.push(d2(pa, pc) / PX[v]);
  }
  /* 3D 参考角长：正视给 dx/dy、侧视给 dz/dy（同一根角的两投影合成） */
  const fl = px('front', 'horn_root_left'); const ft = px('front', 'horn_tip_left');
  const sr = px('side', 'horn_root'); const st = px('side', 'horn_tip_back');
  let ref3D = 0;
  if (fl && ft && sr && st) {
    const dx = (ft[0] - fl[0]) / PX.front;
    const dyF = (ft[1] - fl[1]) / PX.front;
    const dz = (st[0] - sr[0]) / PX.side;
    const dyS = (st[1] - sr[1]) / PX.side;
    ref3D = Math.hypot(dx, (dyF + dyS) / 2, dz);
  }
  const refM = Math.max(ref3D, ...refs);
  const cap = refM * 1.10;
  const checks = [{ name: '参考角长实测', ok: refs.length >= 2, detail: `3D ${ref3D.toFixed(4)}m / 投影 ${refs.map((x) => x.toFixed(4)).join(' / ')} m → 上限 ${cap.toFixed(4)} m` }];
  if (!b || !b.horns) checks.push({ name: '构建报告', ok: false, detail: '缺 horns' });
  else for (const h of b.horns) {
    checks.push({ name: `${h.name} 角链≥3点`, ok: (h.chain || []).length >= 3, detail: `chain=${(h.chain || []).length}` });
    checks.push({ name: `${h.name} 角长≤实测+10%`, ok: h.lengthM <= cap, detail: `${h.lengthM}m ≤ ${cap.toFixed(4)}m` });
    checks.push({ name: `${h.name} 后弯（非直刺）`, ok: h.backBendM >= 0.02, detail: `后向偏移 ${h.backBendM}m ≥ 0.02` });
  }
  report('L5-G3 角形复位', checks);
}

/* ---------- L5-G4 拓扑 ---------- */
if (gate === 'topology') {
  const mesh = loadMesh(); const s = seam(mesh);
  const F = faces(mesh); const V = mesh.vertices.length;
  const E = new Set();
  for (let i = 0; i + 2 < mesh.faces.length; i += 3) {
    const t = [mesh.faces[i], mesh.faces[i + 1], mesh.faces[i + 2]];
    for (let k = 0; k < 3; k += 1) { const a = t[k]; const b = t[(k + 1) % 3]; E.add(a < b ? `${a}|${b}` : `${b}|${a}`); }
  }
  const euler = V - E.size + F;
  report('L5-G4 拓扑', [
    { name: 'openEdges=0', ok: s.openEdges === 0, detail: `openEdges=${s.openEdges}` },
    { name: 'seamEdges=0', ok: s.seamEdges === 0, detail: `seamEdges=${s.seamEdges}` },
    { name: 'components=1', ok: s.components === 1, detail: `components=${s.components}` },
    { name: 'Euler=2', ok: euler === 2, detail: `V=${V} E=${E.size} F=${F} → ${euler}` },
  ]);
}

/* ---------- L5-G5/G6 verifyMesh + 面数 ---------- */
if (gate === 'gates') {
  const mesh = loadMesh(); const v = verify(mesh, { maxSamples: 100000 });
  const F = faces(mesh);
  report('L5-G5/G6 门禁', [
    { name: '自交=0', ok: v.checks.selfIntersections.intersectingPairs === 0, detail: `intersectingPairs=${v.checks.selfIntersections.intersectingPairs}` },
    { name: '瘦三角≤5%', ok: v.checks.skinny.pct <= 5, detail: `${v.checks.skinny.pct}%（${v.checks.skinny.count} 个）` },
    { name: '面积比≤20', ok: v.checks.areaRatio.value <= 20, detail: `${v.checks.areaRatio.value}` },
    { name: '法线朝内=0', ok: v.checks.normals.invertedCount === 0, detail: `invertedCount=${v.checks.normals.invertedCount}` },
    { name: '面数≤1500', ok: F <= 1500, detail: `faces=${F}` },
  ]);
}

/* ---------- L5-G2 逐点 3D（不得回退） ---------- */
if (gate === 'points') {
  const g1 = loadG1();
  const checks = [];
  const minPts = Math.min(...['front', 'side', 'back'].map((v) => g1.views[v].landmarkCount));
  checks.push({ name: '每视图≥20点', ok: minPts >= 20, detail: `min=${minPts}` });
  checks.push({ name: '站点 3D 最大偏差≤2%身高', ok: g1.checks.stationMaxDeltaPct <= 2,
    detail: `${g1.checks.stationMaxDeltaPct}% ≤ 2%（基线 1.944% 不得回退）` });
  const surf = g1.checks.surfaceDistPass;
  checks.push({ name: 'landmark→模型表面最近距离', ok: surf === true,
    detail: `surfaceDistPass=${surf} max=${g1.checks.maxDistToSurfaceM} ≤ ${g1.checks.toleranceM ?? 0.032}` });
  report('L5-G2 逐点 3D', checks);
}

/* ---------- L5-G7 标签一致 ---------- */
if (gate === 'labels') {
  const py = fs.readFileSync(`${ROOT}/scripts/check-hanfu-g1-3d.py`, 'utf8');
  const html = fs.readFileSync(`${ROOT}/web/draw/hanfu-cage.html`, 'utf8');
  const mesh = loadMesh(); const F = faces(mesh);
  const g1 = loadG1(); const cage = R('delivery/hanfu-cage/cage.json');
  const stage = cage.stage || '';
  report('L5-G7 标签一致', [
    { name: 'g1-3d.py 无 556 硬编码', ok: !py.includes('556'), detail: py.includes('556') ? '仍含 556' : '已清' },
    { name: 'g1-3d.py 无 iteration 37 硬编码', ok: !/'iteration':\s*37/.test(py), detail: /'iteration':\s*37/.test(py) ? '仍含 37' : '已清' },
    { name: 'g1-3d.py 无 L3 阶段名', ok: !py.includes('L3-G1-per-point-3d'), detail: py.includes('L3-G1-per-point-3d') ? '仍含 L3 阶段名' : '已清' },
    { name: '报告 iteration/stage=终态', ok: String(g1.iteration) === String(cage.iteration) && g1.stage === stage,
      detail: `报告 ${g1.iteration}/${g1.stage} vs cage ${cage.iteration}/${stage}` },
    { name: '页面口径=终态', ok: html.includes('L5') && html.includes(String(F)), detail: `页面含 L5 与 ${F}` },
  ]);
}

/* ---------- L5-G9 分色辨识 ---------- */
if (gate === 'colors') {
  const mesh = loadMesh(); const web = R('web/draw/hanfu-cage.json');
  const html = fs.readFileSync(`${ROOT}/web/draw/hanfu-cage.html`, 'utf8');
  const V = mesh.vertices.length; const F = faces(mesh);
  const dedup = (arr) => new Set(arr.filter(Boolean).map((c) => (typeof c === 'string' ? c.toLowerCase() : JSON.stringify(c)))).size;
  const mc = mesh.colors || [];
  const wc = (web.items && web.items[0] && web.items[0].colors) || [];
  /* cage-mesh.colors 是逐顶点 RGB 扁平数组（len=3V）→ 按三元组去重；web json 是逐面色串 */
  const cageTriples = mc.length === V * 3
    ? new Set(Array.from({ length: V }, (_, i) => mc.slice(3 * i, 3 * i + 3).map((x) => Number(x).toFixed(4)).join(',')))
    : new Set(mc.map((c) => String(c).toLowerCase()));
  const checks = [];
  checks.push({ name: 'cage-mesh.colors 按顶点对齐', ok: mc.length >= V, detail: `len=${mc.length} ≥ vertexCount=${V}（3V=${V * 3}）` });
  checks.push({ name: 'cage-mesh 去重≥6', ok: cageTriples.size >= 6, detail: `dedup=${cageTriples.size}` });
  checks.push({ name: 'web json 透传颜色', ok: wc.length >= F, detail: `items[0].colors len=${wc.length} ≥ faces=${F}` });
  checks.push({ name: 'web json 去重≥6', ok: dedup(wc) >= 6, detail: `dedup=${dedup(wc)}` });
  const legendCount = (html.match(/data-legend=/g) || []).length;
  checks.push({ name: '页面图例≥6类', ok: legendCount >= 6, detail: `data-legend 项=${legendCount}` });
  checks.push({ name: '页面分色/单色切换', ok: html.includes('分色') && html.includes('单色'), detail: '含「分色」「单色」按钮' });
  report('L5-G9 分色辨识', checks);
}

/* ---------- L5-G8 证据链 ---------- */
if (gate === 'record39') {
  const p = 'iteration-records/39-hanfu-l5-sheets-colors.json';
  const checks = [];
  if (!has(p)) checks.push({ name: '记录 39', ok: false, detail: `${p} 不存在` });
  else {
    const rec = R(p);
    const req = ['iteration', 'stage', 'inputs', 'landmarks', 'pose', 'controlGraph', 'seam', 'anatomyReport', 'verify', 'iou', 'views', 'iouOverlay', 'gates', 'deviations', 'visualAcceptance'];
    for (const k of req) checks.push({ name: `字段 ${k}`, ok: rec[k] !== undefined, detail: rec[k] === undefined ? '缺' : '有' });
    const vs = rec.views || [];
    checks.push({ name: '六视角各有结论', ok: vs.length >= 6 && vs.every((v) => v.readImageVerdict && v.readImageVerdict.length > 10),
      detail: `${vs.length} 张，带结论 ${vs.filter((v) => v.readImageVerdict).length}` });
    checks.push({ name: '叠图三张', ok: (rec.iouOverlay || []).length >= 3, detail: `${(rec.iouOverlay || []).length}` });
    checks.push({ name: '偏差≥4条', ok: (rec.deviations || []).length >= 4, detail: `${(rec.deviations || []).length}` });
    checks.push({ name: 'visualAcceptance=pending', ok: rec.visualAcceptance === 'pending', detail: String(rec.visualAcceptance) });
    checks.push({ name: 'L5-G1..G9 门齐', ok: (rec.gates || []).length >= 9, detail: `${(rec.gates || []).length} 门` });
  }
  report('L5-G8 证据链', checks);
}

if (!gate) { console.error('用法：node scripts/check-hanfu-l5.mjs <iou|sheets|horns|topology|gates|labels|colors|record39>'); process.exit(2); }
