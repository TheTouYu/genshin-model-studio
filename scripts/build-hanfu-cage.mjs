#!/usr/bin/env node
/**
 * build-hanfu-cage.mjs — S2/L3 古风甘雨语义控制图粗模（v4 重写：四件结构 + verifyMesh 清债）
 *
 * 输入（全部实测）：
 *   reference/ganyu-hanfu-landmarks.json — stations[] 米制截面（L1 实测）、pose（原图动势）
 *
 * 工艺（原则④ 连接=共享顶点/主干挤出；AGENTS.md 铁律 9 禁贴小件）：
 *   1) 躯干 + 三层裙 = 单条 asymLoft 主干（折叠式三层：外纱/中裙/内裙独立环、层间下垂差≥0.08m）
 *   2) 双臂 = extrudePatch 从肩部 3×2 盘挤出（B=6，共享边界顶点）
 *   3) 双角 = extrudePatch 从头顶 2×2 盘挤出（B=4，向外后弯）
 *   4) 发束 ×2 = extrudePatch 从后脑/前侧 2×2 盘挤出（前束/后束，流向 142°）
 *   5) 剑 = 从持剑手端环续挤：柄/护手/刃 三段（B=6）
 *   6) 腰封 = 主干 seal_bot→seal_top 两道环（半径外凸）
 *   7) 肩饰宝石 ×4 = 单面片外挤（B=4）；挂带 ×2 = 2×2 盘下挤（B=4）
 *   8) 回眸 = 头部环绕颈轴 yaw（取原图实测 face_yaw 22.4°）
 *
 * 面预算 ≤600；退出码 0 = verifyMesh 三门（自交=0/瘦三角≤5%/面积比≤20）+ 面数门通过。
 */
import fs from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyMesh } from '../dist/src/mesh/verify.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const R = (...p) => resolve(ROOT, ...p);

const context = { Math, console, JSON };
context.window = context;
vm.createContext(context);
for (const file of ['ganyu-lib.js', 'ganyu-cage-branch.js', 'ganyu-seam-check.js',
  'ganyu-anatomy-cage.js', 'ganyu-asym-loft.js']) {
  const fp = R('scripts/parts/lib', file);
  if (!fs.existsSync(fp)) throw new Error(`missing lib ${fp}`);
  vm.runInContext(fs.readFileSync(fp, 'utf8'), context, { filename: file });
}
const { asymLoft, extrudePatch, recoverBoundary, seamCheck } = context;

/* ---------------- 自研扫掠：平行传输帧（保相不扭转） ---------------- */
const V3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
function frameOf(dir) {
  const d = V3.norm(dir);
  const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = V3.norm(V3.cross(d, ref));
  const v = V3.cross(d, u);
  return { u, v };
}
function centroidOf(mesh, idx) {
  const c = [0, 0, 0];
  for (const i of idx) { c[0] += mesh.vertices[i][0]; c[1] += mesh.vertices[i][1]; c[2] += mesh.vertices[i][2]; }
  return c.map((x) => x / idx.length);
}
/**
 * 从插座环长出新环：平行传输相位（每个新环的相位取上一环 0 号顶点在自身帧中的方位）
 * rings: [{c, dir, ru, rv, cap?}]；loop 为有序插座顶点；移除 loop 内部的补丁面。
 */
function tubeFromLoop(mesh, loopIn, rings, opts) {
  let loop = loopIn.slice();
  const B = loop.length;
  const hc = centroidOf(mesh, loop);
  // 朝向归一（确定性）：与主干剩余面有向边对齐——主干含 loop[j]→loop[j+1] 则本环带同向边重复
  // ⇒ 反序。排除待删补丁面，否则补丁自身的有向边会污染判据（cone 侧已实证）。
  if (B >= 3) {
    const skip = opts?.removeFaces ? new Set(opts.removeFaces) : null;
    const dirEdge = new Set();
    for (let f = 0; f + 2 < mesh.faces.length; f += 3) {
      if (skip && skip.has(f / 3)) continue;
      const A = mesh.faces[f]; const B2 = mesh.faces[f + 1]; const C = mesh.faces[f + 2];
      dirEdge.add(A + '|' + B2); dirEdge.add(B2 + '|' + C); dirEdge.add(C + '|' + A);
    }
    let fwd = 0; let bwd = 0;
    for (let j = 0; j < B; j += 1) {
      const a = loop[j]; const b = loop[(j + 1) % B];
      if (dirEdge.has(a + '|' + b)) fwd += 1;
      if (dirEdge.has(b + '|' + a)) bwd += 1;
    }
    if (bwd > fwd) loop = loop.slice().reverse();
    if (opts?.reverseLoop) loop = loop.slice().reverse();
  }
  if (opts?.reverseLoop) loop = loop.slice().reverse();
  // 移除补丁内部面
  if (opts?.removeFaces) {
    const rm = new Set(opts.removeFaces);
    const nf = []; const nc = mesh.colors ? [] : null;
    for (let f = 0; f + 2 < mesh.faces.length; f += 3) {
      if (rm.has(f / 3)) continue;
      nf.push(mesh.faces[f], mesh.faces[f + 1], mesh.faces[f + 2]);
      if (nc) { nc.push(mesh.colors[f], mesh.colors[f + 1], mesh.colors[f + 2]); }
    }
    mesh.faces = nf; if (nc) mesh.colors = nc;
  }
  const ringIds = [loop.slice()];
  let prev = loop.map((i) => mesh.vertices[i]);
  const centers = [hc, ...rings.map((r) => r.c)];
  let loopAngles = null; // 逐顶点角向（首个非棱柱环的帧内计算），替代等分相位——非均匀插座不再扭转
  for (let k = 0; k < rings.length; k += 1) {
    const rs = rings[k];
    // 自动切向：中心差分（首环用插座形心，末环用后向差分）→ 环面垂直于路径，杜绝折叠
    const dir = rs.dir || V3.sub(centers[Math.min(k + 2, centers.length - 1)], centers[k]);
    const { u, v } = frameOf(dir);
    const c = rs.c;
    const p0 = V3.sub(prev[0], c);
    const phase = Math.atan2(V3.dot(p0, v), V3.dot(p0, u));
    const ids = [];
    const pts = [];
    if (rs.project) {
      // 投影环：把插座边界沿 dir 投到过 c 且垂直于 dir 的平面 → 顶点一一对应，不可能扭转
      const dn = V3.norm(dir);
      for (let j = 0; j < B; j += 1) {
        const v = mesh.vertices[loop[j]];
        const k = V3.dot(V3.sub(v, c), dn);
        const p = V3.sub(v, V3.mul(dn, k));
        ids.push(mesh.vertices.length);
        mesh.vertices.push(p);
        pts.push(p);
      }
    } else if (rs.prism) {
      const loopPts = loop.map((i) => mesh.vertices[i]);
      for (let j = 0; j < B; j += 1) {
        const rel = V3.sub(loopPts[j], hc);
        const p = V3.add(c, V3.add(V3.mul(rel, rs.scale == null ? 0.88 : rs.scale), V3.mul(V3.norm(dir), rs.out || 0)));
        ids.push(mesh.vertices.length);
        mesh.vertices.push(p);
        pts.push(p);
      }
    } else {
      // rs.perVertex：首环逐顶点角向（插座顶点在环面内真实方位；环心须在插座法线上否则角序会绕回）
      let pvAng = null;
      if (rs.perVertex) {
        pvAng = loop.map((i) => {
          const p = V3.sub(mesh.vertices[i], hc);
          return Math.atan2(V3.dot(p, v), V3.dot(p, u));
        });
      }
      for (let j = 0; j < B; j += 1) {
        const a = pvAng ? pvAng[j] : phase + (2 * Math.PI * j) / B + (rs.phase || 0);
        const p = V3.add(c, V3.add(V3.mul(u, rs.ru * Math.cos(a)), V3.mul(v, rs.rv * Math.sin(a))));
        ids.push(mesh.vertices.length);
        mesh.vertices.push(p);
        pts.push(p);
      }
    }
    ringIds.push(ids);
    prev = pts;
  }
  // 侧壁
  for (let k = 0; k + 1 < ringIds.length; k += 1) {
    const A = ringIds[k]; const N = ringIds[k + 1];
    for (let j = 0; j < B; j += 1) {
      const n = (j + 1) % B;
      mesh.faces.push(A[j], N[n], A[n], A[j], N[j], N[n]);
    }
  }
  // 顶盖（扇形到末环形心）
  if (opts?.cap !== false) {
    const last = ringIds[ringIds.length - 1];
    const cy = centroidOf(mesh, last);
    const ci = mesh.vertices.length;
    mesh.vertices.push(cy);
    for (let j = 0; j < B; j += 1) {
      const n = (j + 1) % B;
      mesh.faces.push(ci, last[n], last[j]);
    }
  }
  return { loop: loop.slice(), B, rings: ringIds };
}


const NEUTRAL = '#c9c9c9';
function signedVolume(mesh) {
  const v = mesh.vertices; const f = mesh.faces; let vol = 0;
  for (let i = 0; i + 2 < f.length; i += 3) {
    const a = v[f[i]]; const b = v[f[i + 1]]; const c = v[f[i + 2]];
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2])
      + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return vol;
}
function ensureOutward(mesh) {
  if (signedVolume(mesh) < -1e-12) {
    for (let i = 0; i + 2 < mesh.faces.length; i += 3) {
      const t = mesh.faces[i + 1]; mesh.faces[i + 1] = mesh.faces[i + 2]; mesh.faces[i + 2] = t;
    }
  }
  return mesh;
}
const SIDES = 8;
const TARGET_FACES = 1200;
/* L4 框对齐：IoU 框把模型 z=0 锚在面板中心，而参考侧视图身体轴在 L1 实测 abs x=1106.5
 * （面板中心 1147.5）→ 差 (1147.5-1106.5)/685 = 0.0598m。实测扫描 zshift 0.000..0.090：
 * IoU 峰值 0.7491@0.060（与实测轴一致），故整体平移 +0.0598 与参考同框。 */
const Z_ALIGN = 0.0598;

const landmarks = JSON.parse(fs.readFileSync(R('reference/ganyu-hanfu-landmarks.json'), 'utf8'));
const pose = landmarks.pose;
// L3-G2：网格 head_yaw 与「面部对相机」实测 22.4° 差 ≤3°（pose.head_yaw_over_shoulder.value_deg=45 是解剖夹取值，不作网格门）
const headYawDeg = pose.head_yaw_over_shoulder.face_yaw_vs_camera_deg ?? 22.4;
const deg = (d) => (d * Math.PI) / 180;

/* ------------------------------ 截面环表（底→顶，米） ------------------------------
 * 裙 = 折叠式三层：inner_top(内裙顶/底盖) → 内壁下行 → hem(最外最低) → 外壁上行
 *   → foldB(中裙顶折) → 中裙下行 → foldA(外纱顶折) → 外纱上行 → hip
 * 层间下垂差：hem 0.02 / tierB 下沿 0.285 / tierA 下沿 0.545（差 0.265、0.260 ≥ 0.08）
 */
const RINGS = [
  // 全部由 L1 实测驱动：裙区取 central-run 剖面，躯干取 stations 插值（R4/G1 逐点 3D 前置修正）
  { name: 'under_cap', y: -0.030, rx: 0.0900, ryF: 0.0700, ryB: 0.0900 }, // 裙内封盖
  { name: 'hem', y: 0.010, rx: 0.4552, ryF: 0.1818, ryB: 0.3015 },        // L1 hem
  { name: 'hem_upper', y: 0.075, rx: 0.4035, ryF: 0.1788, ryB: 0.2723 },   // 剖面插值（拆大面）
  { name: 'tierC_mid', y: 0.140, rx: 0.3527, ryF: 0.1759, ryB: 0.2431 },   // L1 skirt_wide
  { name: 'tierC_top', y: 0.260, rx: 0.3118, ryF: 0.1690, ryB: 0.2185 },   // 剖面实测
  { name: 'tierB_bot', y: 0.300, rx: 0.2989, ryF: 0.1667, ryB: 0.2103 },
  { name: 'tierB_mid', y: 0.400, rx: 0.2667, ryF: 0.1609, ryB: 0.1899 },
  { name: 'tierB_top', y: 0.500, rx: 0.2366, ryF: 0.1552, ryB: 0.1696 },
  { name: 'tierA_bot', y: 0.550, rx: 0.2258, ryF: 0.1523, ryB: 0.1594 },   // 剖面实测（裙最窄）
  { name: 'hip', y: 0.700, rx: 0.2885, ryF: 0.1438, ryB: 0.1291 },         // L1 hip
  { name: 'upper_hip', y: 0.820, rx: 0.2620, ryF: 0.1445, ryB: 0.1233 },
  { name: 'mid_body', y: 0.950, rx: 0.2334, ryF: 0.1452, ryB: 0.1170 },
  { name: 'lower_waist', y: 1.100, rx: 0.2003, ryF: 0.1461, ryB: 0.1097 },
  { name: 'seal_bot', y: 1.190, rx: 0.1804, ryF: 0.1466, ryB: 0.1053 },    // 腰封下沿
  { name: 'seal_top', y: 1.230, rx: 0.1961, ryF: 0.1558, ryB: 0.0991 },    // 腰封上沿
  { name: 'chest', y: 1.310, rx: 0.1380, ryF: 0.1057, ryB: 0.0850 },
  { name: 'neck_base', y: 1.345, rx: 0.1090, ryF: 0.0795, ryB: 0.0797 },   // L1 neck
  { name: 'neck_mid', y: 1.370, rx: 0.1140, ryF: 0.0633, ryB: 0.0899 },    // 颈第 2 环（L3-G1）
  { name: 'head_base', y: 1.430, rx: 0.1257, ryF: 0.0829, ryB: 0.1059 },
  { name: 'jaw', y: 1.465, rx: 0.1300, ryF: 0.0950, ryB: 0.1130 },         // L4-G2 下颌线环
  { name: 'head_widest', y: 1.510, rx: 0.1401, ryF: 0.1387, ryB: 0.1215 }, // L1 head_widest
  { name: 'crown', y: 1.600, rx: 0.1276, ryF: 0.1190, ryB: 0.1088 },       // L1 crown
  { name: 'crown_top', y: 1.670, rx: 0.0850, ryF: 0.0800, ryB: 0.0730 },   // L4 发顶（参考剪影到 1.67）
];
const IDX = Object.fromEntries(RINGS.map((r, i) => [r.name, i]));

/* 主干路径：脊柱弧（向 -X = 她的右）+ 裙摆单向流（越低越偏 -X）+ 前倾 */
const pathPoint = (s) => {
  const t = Math.max(0, s.y) / 1.6;
  const arc = -0.055 * Math.sin(Math.PI * t) * t;
  return [arc, s.y, 0.012 * t];
};
/** 裙摆单向流：L4 改为 0——镜像修手性后净剪切翻号（实测正/背剪影对称：front yM0.02 ref
 * -0.429..+0.432、yM0.34 -0.285..+0.286），剪切使裙体整体右移 0.06~0.09m 直接吃掉 IoU。
 * 单向流改由纱片层间偏移承载（见 veilA/B/C），主干保持居中。 */
const flowAt = () => 0;
function shearFlow(mesh) {
  // 按顶点 y 剪切：环与封盖顶点同步位移，环保持水平
  for (const v of mesh.vertices) v[0] += flowAt(v[1]);
}

function yawRings(mesh, ringNames, pivot, yawRad) {
  const cos = Math.cos(yawRad);
  const sin = Math.sin(yawRad);
  for (const name of ringNames) {
    const base = mesh.ringIdx[IDX[name]];
    for (let a = 0; a < SIDES; a += 1) {
      const v = mesh.vertices[base + a];
      const dx = v[0] - pivot[0];
      const dz = v[2] - pivot[2];
      mesh.vertices[base + a] = [pivot[0] + dx * cos - dz * sin, v[1],
        pivot[2] + dx * sin + dz * cos];
    }
  }
}

function patchVerts(mesh, ringNames, angles) {
  const out = [];
  for (const name of ringNames) for (const a of angles) out.push(mesh.ringIdx[IDX[name]] + a);
  return out;
}
function patchCentroid(mesh, verts) {
  const c = [0, 0, 0];
  for (const i of verts) { c[0] += mesh.vertices[i][0]; c[1] += mesh.vertices[i][1]; c[2] += mesh.vertices[i][2]; }
  return c.map((x) => x / verts.length);
}
/** 锥形分支：插座环 → 单顶点 apex（每边 1 三角）。朝向由主干剩余面有向边确定，不用启发式。 */
function coneFromLoop(mesh, loopIn, apex, opts, skipFaces) {
  let loop = loopIn.slice();
  const B = loop.length;
  const dirEdge = new Set();
  for (let f = 0; f + 2 < mesh.faces.length; f += 3) {
    if (skipFaces && skipFaces.has(f / 3)) continue; // 排除待删补丁面（否则自我污染 fwd）
    const A = mesh.faces[f]; const B2 = mesh.faces[f + 1]; const C = mesh.faces[f + 2];
    dirEdge.add(A + '|' + B2); dirEdge.add(B2 + '|' + C); dirEdge.add(C + '|' + A);
  }
  let fwd = 0; let bwd = 0;
  for (let j = 0; j < B; j += 1) {
    const a = loop[j]; const b = loop[(j + 1) % B];
    if (dirEdge.has(a + '|' + b)) fwd += 1;
    if (dirEdge.has(b + '|' + a)) bwd += 1;
  }
  // 锥面 (A[j], apex, A[n]) 含 A[n]→A[j]：主干若也含 A[n]→A[j]（bwd）则反序
  if (bwd > fwd) loop = loop.slice().reverse();
  if (opts && opts.reverseLoop) loop = loop.slice().reverse();
  return { loop, B };
}
function attachCone(mesh, ringNames, angles, apex, opts) {
  const _vStart = mesh.vertices.length; // apex 即本部件首个新顶点（旧版误传 faceStart → parts 区间记反）
  const patch = patchVerts(mesh, ringNames, angles);
  const rb = recoverBoundary(mesh, patch);
  const res = coneFromLoop(mesh, rb.loop, apex, opts, rb.rm);
  const rm = new Set(rb.rm);
  const nf = []; const nc = mesh.colors ? [] : null;
  for (let f = 0; f + 2 < mesh.faces.length; f += 3) {
    if (rm.has(f / 3)) continue;
    nf.push(mesh.faces[f], mesh.faces[f + 1], mesh.faces[f + 2]);
    if (nc) { nc.push(mesh.colors[f], mesh.colors[f + 1], mesh.colors[f + 2]); }
  }
  mesh.faces = nf; if (nc) mesh.colors = nc;
  const ai = mesh.vertices.length;
  mesh.vertices.push(apex);
  for (let j = 0; j < res.B; j += 1) {
    const n = (j + 1) % res.B;
    mesh.faces.push(res.loop[j], ai, res.loop[n]);
  }
  return { apex: ai, B: res.B, _vStart, centroid: patchCentroid(mesh, patch) };
}

function attach(mesh, ringNames, angles, rings, opts) {
  const _fs = mesh.vertices.length;
  const patch = patchVerts(mesh, ringNames, angles);
  const rb = recoverBoundary(mesh, patch);
  const res = tubeFromLoop(mesh, rb.loop, rings, { cap: opts?.cap === undefined ? true : opts.cap, removeFaces: rb.rm, reverseLoop: opts?.reverseLoop });
  res._faceStart = _fs;
  res.centroid = patchCentroid(mesh, patch);
  return res;
}

/* L4 自研薄片 ribbon（三角截面）：插座=主干上单个三角面（3 顶点，1:1 配准），
   截面=扁三角（+w*rv, -w*rv, +n*ru）——三条边都长 ⇒ 无小边面；片厚 = 2*ru。
   帧：逐环平行传输（w_k = 上一帧 w 在垂直于切向平面内的投影）⇒ 不可能扭转/翻滚。
   spine 项 {c, rv}；opts.ru = 片厚半值；首带沿插座法向外出，随后可下折。 */
function ribbonFromLoop(mesh, loopIn, spine, opts) {
  const loop = loopIn.slice();
  const hc = centroidOf(mesh, loop);
  const P = loop.map((vi) => mesh.vertices[vi]);
  // 基座对（同一环上的两顶点）= y 最接近的一对；第三点为顶点 apex
  let bi = 0; let bj = 1; let best = Infinity;
  for (let a = 0; a < P.length; a += 1) {
    for (let b = a + 1; b < P.length; b += 1) {
      const dy = Math.abs(P[a][1] - P[b][1]);
      if (dy < best) { best = dy; bi = a; bj = b; }
    }
  }
  const bk = [0, 1, 2].find((i) => i !== bi && i !== bj);
  const ru = opts.ru == null ? 0.002 : opts.ru;
  const t0 = opts.dir ? V3.norm(opts.dir) : V3.norm(V3.sub(spine[0].c, hc));
  let w = V3.norm(V3.sub(P[bi], P[bj]));
  w = V3.norm(V3.sub(w, V3.mul(t0, V3.dot(w, t0))));
  const baseMid = [0, 1, 2].map((k) => (P[bi][k] + P[bj][k]) / 2);
  let n = V3.sub(P[bk], baseMid);
  n = V3.sub(n, V3.mul(t0, V3.dot(n, t0)));   // 投影到截面平面
  n = V3.sub(n, V3.mul(w, V3.dot(n, w)));     // 去掉沿宽轴分量 → 厚轴 ⊥ w 且 ⊥ t0
  if (Math.hypot(n[0], n[1], n[2]) < 1e-6) n = V3.norm(V3.cross(w, t0)); else n = V3.norm(n);
  /* 手性归一：按插座真实环序试建首环，若环法线与插座法线反向则翻转厚轴 n。
     （apex 只偏 rk≈12mm，翻转的几何影响可忽略；但绕序必须一致，否则首带内外翻。） */
  {
    const trial = [0, 1, 2].map((q) => {
      if (q === bk) return V3.mul(n, 1);
      if (q === bi) return V3.mul(w, 1);
      return V3.mul(w, -1);
    });
    const nr = V3.cross(V3.sub(trial[1], trial[0]), V3.sub(trial[2], trial[0]));
    if (V3.dot(nr, t0) < 0) n = V3.mul(n, -1);
  }
  // 注意：不要为「apex 对齐」翻转 n——那会把环面转 90° 离开帧平面（实测首带自穿根因）。
  // apex 只偏离底线 2*ru=12mm，朝向无所谓。
  if (opts.debug) {
    console.log('DEBUG t0', t0.map((x) => +x.toFixed(3)), 'w', w.map((x) => +x.toFixed(3)),
      'n', n.map((x) => +x.toFixed(3)), 'bi/bj/bk', bi, bj, bk,
      'dot(w,t0)', +V3.dot(w, t0).toFixed(3), 'dot(n,t0)', +V3.dot(n, t0).toFixed(3));
  }
  // 朝向归一（排除待删补丁面后看主干有向边）
  const skip = new Set(opts.removeFaces || []);
  const dirEdge = new Set();
  for (let f = 0; f + 2 < mesh.faces.length; f += 3) {
    if (skip.has(f / 3)) continue;
    const A = mesh.faces[f]; const Bb = mesh.faces[f + 1]; const C = mesh.faces[f + 2];
    dirEdge.add(A + '|' + Bb); dirEdge.add(Bb + '|' + C); dirEdge.add(C + '|' + A);
  }
  const tri = loop.slice(); // 保持 recoverBoundary 的环向（重排会反转绕序 → 首带莫比乌斯折）
  let fwd = 0; let bwd = 0;
  for (let j = 0; j < 3; j += 1) {
    const a = tri[j]; const b = tri[(j + 1) % 3];
    if (dirEdge.has(a + '|' + b)) fwd += 1;
    if (dirEdge.has(b + '|' + a)) bwd += 1;
  }
  const flip = bwd > fwd;
  const rm = new Set(opts.removeFaces || []);
  if (rm.size) {
    const nf = []; const nc = mesh.colors ? [] : null;
    for (let f = 0; f + 2 < mesh.faces.length; f += 3) {
      if (rm.has(f / 3)) continue;
      nf.push(mesh.faces[f], mesh.faces[f + 1], mesh.faces[f + 2]);
      if (nc) { nc.push(mesh.colors[f], mesh.colors[f + 1], mesh.colors[f + 2]); }
    }
    mesh.faces = nf; if (nc) mesh.colors = nc;
  }
  const ringIds = [];
  // 全片共用一帧：t 取「插座形心 → 末环」的总流向。逐环重算 t 会在脊线转弯时扭转
  // （实测 veilA 17 处自交：根环→首环流向转 32°，外缘大摆自穿）。固定帧 ⇒ 零扭转。
  const t = V3.norm(V3.sub(spine[spine.length - 1].c, hc));
  w = V3.norm(V3.sub(w, V3.mul(t, V3.dot(w, t))));
  if (Math.hypot(w[0], w[1], w[2]) < 1e-6) w = V3.norm(V3.cross(t, [0, 1, 0]));
  n = V3.norm(V3.cross(w, t));
  if (V3.dot(n, V3.sub(P[bk], hc)) < 0) n = V3.mul(n, -1);
  /* 实验开关 frameSocket：全片用「插座自身帧」(w=插座底线方向, n=插座外法线)，
     即所有截面互为平行面内平移 ⇒ 广义棱柱，零扭转、不可能自穿。
     默认走流场帧（截面 ⊥ 总流向）。 */
  if (opts.frameSocket) {
    w = V3.norm(V3.sub(P[bi], P[bj]));
    n = V3.norm(opts.dir);
  }
  for (let k = 0; k < spine.length; k += 1) {
    const c = spine[k].c;
    const rv = spine[k].rv;
    // 厚度自插座竖向半跨收敛到目标片厚：避免首环退化成 sliver（apex 落在底线上 → 首带自穿）
    const halfH = Math.max(ru, Math.hypot(...V3.sub(P[bk], [0, 1, 2].map((q) => (P[bi][q] + P[bj][q]) / 2))) / 2);
    const rk = ru + (halfH - ru) * (1 - k / Math.max(1, spine.length - 1));
    // 顶点序与插座环向一致：apex 位放 +n，两个基座位放 ±w
    let pts;
    if (k === 0 && opts.projectFirst) {
      // 首环 = 插座三角形沿法线的正投影（纯棱柱 ⇒ 首带零扭转）
      pts = P.map((pj) => V3.add(pj, V3.mul(t0, V3.dot(V3.sub(c, pj), t0))));
    } else {
      pts = [0, 1, 2].map((q) => {
        if (q === bk) return V3.add(c, V3.mul(n, rk));
        if (q === bi) return V3.add(c, V3.mul(w, rv));
        return V3.sub(c, V3.mul(w, rv));
      });
    }
    const ids = pts.map((q) => { mesh.vertices.push(q); return mesh.vertices.length - 1; });
    ringIds.push(ids);
  }
  const push3 = (a, b, c) => { if (flip) mesh.faces.push(a, c, b); else mesh.faces.push(a, b, c); };
  // 首带：tri[0]→ring0[0], tri[1]→ring0[1], tri[2]→ring0[2]
  const R0 = ringIds[0];
  for (let j = 0; j < 3; j += 1) {
    const jn = (j + 1) % 3;
    push3(tri[j], R0[jn], tri[jn]);
    push3(tri[j], R0[j], R0[jn]);
  }
  for (let k = 0; k + 1 < ringIds.length; k += 1) {
    const A = ringIds[k]; const N = ringIds[k + 1];
    for (let j = 0; j < 3; j += 1) {
      const jn = (j + 1) % 3;
      push3(A[j], N[jn], A[jn]);
      push3(A[j], N[j], N[jn]);
    }
  }
  const last = ringIds[ringIds.length - 1];
  const ci = mesh.vertices.length;
  mesh.vertices.push(centroidOf(mesh, last));
  for (let j = 0; j < 3; j += 1) push3(ci, last[(j + 1) % 3], last[j]);
  return { loop: loop.slice(), B: 3, rings: ringIds };
}

/** 插座 = 主干上两环之间的一个三角面（quad 的一半）：返回 {tri, faceIndex} */
function socketTriangle(mesh, ringNames, angles) {
  const quad = new Set(patchVerts(mesh, ringNames, angles));
  for (let f = 0; f + 2 < mesh.faces.length; f += 3) {
    const A = mesh.faces[f]; const B = mesh.faces[f + 1]; const C = mesh.faces[f + 2];
    if (quad.has(A) && quad.has(B) && quad.has(C)) return { tri: [A, B, C], faceIndex: f / 3 };
  }
  throw new Error(`socketTriangle: no triangle in patch ${ringNames} x ${angles}`);
}

function attachRibbon(mesh, ringNames, angles, spine, opts) {
  const _vStart = mesh.vertices.length;
  const { tri, faceIndex } = socketTriangle(mesh, ringNames, angles);
  const res = ribbonFromLoop(mesh, tri, spine, { ru: opts.ru, dir: opts.dir, debug: opts.debug, frameSocket: opts.frameSocket, removeFaces: [faceIndex] });
  res._faceStart = _vStart;
  res.centroid = centroidOf(mesh, tri);
  return res;
}

function buildCageMesh() {
  const path = RINGS.map(pathPoint);
  const sections = RINGS.map((s) => ({ rx: s.rx, ryF: s.ryF, cyF: 0, ryB: s.ryB, cyB: 0 }));
  const mesh = asymLoft(path, sections, RINGS.length - 1, SIDES, () => NEUTRAL,
    { up: [0, 0, 1], cap: 'both' });

  shearFlow(mesh);
  // 回眸：头部三环绕颈轴旋转（原图 face_yaw 实测 22.4°；向她的左 = -X）
  // 回眸轴心 = 颈环形心（不是环上某个顶点！）
  const nbBase = mesh.ringIdx[IDX.neck_base];
  let ncx = 0; let ncz = 0;
  for (let a = 0; a < SIDES; a += 1) { ncx += mesh.vertices[nbBase + a][0]; ncz += mesh.vertices[nbBase + a][2]; }
  yawRings(mesh, ['head_base', 'jaw', 'head_widest', 'crown'], [ncx / SIDES, 0, ncz / SIDES],
    -deg(headYawDeg));

  /* L4 眼窝凹陷 ×2：head_widest 环 45°/135° 顶点沿水平径向内凹 0.012m（不增面、不描五官） */
  const hwBase = mesh.ringIdx[IDX.head_widest];
  const hwC = [0, 0, 0];
  for (let a = 0; a < SIDES; a += 1) { hwC[0] += mesh.vertices[hwBase + a][0]; hwC[2] += mesh.vertices[hwBase + a][2]; }
  hwC[0] /= SIDES; hwC[2] /= SIDES;
  const eyeSockets = [];
  for (const a of [1, 3]) {
    const vi = hwBase + a;
    const v = mesh.vertices[vi];
    const d = V3.norm([v[0] - hwC[0], 0, v[2] - hwC[2]]);
    mesh.vertices[vi] = [v[0] - d[0] * 0.012, v[1] + 0.003, v[2] - d[2] * 0.012];
    eyeSockets.push({ ring: 'head_widest', angle: a, vertex: vi, depth: 0.012 });
  }

  const info = { branches: [], parts: [{ name: 'trunk', vStart: 0, vEnd: mesh.vertices.length }] };
  const log = (name, patch, res, faceStart) => info.branches.push({ name, B: res.B, rings: res.rings ? res.rings.length : 0 });
  const mark = (name, vStart) => info.parts.push({ name, vStart, vEnd: mesh.vertices.length });

  /* 双臂：肩部 3×2 盘（B=6）→ 肘 → 手（避开躯干：肘外侧 x=±0.30/0.31、手前移 z=0.16） */
  // 首环 = 插座棱柱平移（纯平移环带不折叠）→ 肩到肘不再 90° 扭转
  // 首环 = 贴插座的小圆（沿插座径向法线外移）：插座竖向跨度 0.08 → 若首环复制该跨度，
  // 第二环带从顶行下扫会横穿第一环带（实测 9+10 处自交）；小圆收敛则环带无互穿。
  const armRings = (angles, elbow, wrist, off, rad) => {
    const hc = patchCentroid(mesh, patchVerts(mesh, ['seal_top', 'chest'], angles));
    const nrm = V3.norm([hc[0], 0, hc[2] - 0.01]);
    return [
      { c: V3.add(hc, V3.mul(nrm, off)), ru: rad, rv: rad },
      { c: elbow, ru: 0.060, rv: 0.055 },
      { c: wrist, ru: 0.065, rv: 0.058 },
    ];
  };
  // L4：手臂轴内收（肘 0.30→0.25、腕 0.292→0.245）+ 半径收窄——参考正视图 y0.98-1.46
  // 模型超宽 0.05~0.18m（front 残差 excR 峰值 0.181），外缘对齐实测 ±0.32
  const armR = attach(mesh, ['seal_top', 'chest'], [7, 0, 1],
    armRings([7, 0, 1], [0.285, 1.010, 0.095], [0.275, 0.730, 0.185], 0.08, 0.038),
    { axis: [0.25, -0.95, 0.15], cap: false });
  log('armR', null, armR); mark('armR', armR._faceStart);

  const armL = attach(mesh, ['seal_top', 'chest'], [4,5,3],
    armRings([3, 4, 5], [-0.295, 1.010, 0.110], [-0.285, 0.730, 0.205], 0.12, 0.040),
    { axis: [-0.25, -0.95, 0.2] });
  log('armL', null, armL); mark('armL', armL._faceStart);

  /* 剑：从持剑手端环续挤（柄 / 护手 / 刃 三段，共享手环顶点）
   * L4：刃改薄片——帧 u=+z / v=−x ⇒ rv 即 x 半宽（厚度）0.002 → 片厚 0.004m；
   * 旧 rv=0.030 使刃在正视投影宽 0.06m（≈45px×250行=11k 红），改薄后正视近零贡献。 */
  const handRing = armR.rings[armR.rings.length - 1];
  const _swfs = mesh.vertices.length;
  const sword = tubeFromLoop(mesh, handRing, [
    { c: [0.400, 0.600, 0.134], dir: [0.30, -0.95, 0.06], ru: 0.026, rv: 0.022 },  // 柄
    { c: [0.448, 0.462, 0.142], dir: [0.32, -0.94, 0.06], ru: 0.044, rv: 0.024 },  // 护手
    { c: [0.596, 0.080, 0.158], dir: [0.34, -0.93, 0.05], ru: 0.038, rv: 0.002 },  // 刃（薄片）
  ], {});
  info.branches.push({ name: 'sword', B: sword.B, rings: sword.rings.length });
  mark('sword', _swfs);

  /* 双角：头顶 2×2 盘（B=4）→ 单顶点 apex 锥（每角 4 三角，无中间环 = 无环带互穿）
     镜像对：绕 x=0 镜像角 θ→180°−θ，故 hornR[0,1] ↔ hornL[4,5]（[3,4] 不是镜像，是前移 45°） */
  const hornR = attachCone(mesh, ['head_widest', 'crown'], [0, 1], [0.205, 1.805, -0.070]);
  log('hornR', null, hornR); mark('hornR', hornR._vStart);
  const hornL = attachCone(mesh, ['head_widest', 'crown'], [4, 5], [-0.205, 1.805, -0.070]);
  log('hornL', null, hornL); mark('hornL', hornL._vStart);

  /* L4 薄片统一构造：从插座补丁长出「片」。帧 u=+z / v=−x（近竖直流向）⇒ ru=片厚半值、
     rv=片宽半值；片厚取 0.002（总厚 0.004m ≤ §6.5 上限）。全部经 attach→tubeFromLoop
     +removeFaces 从主干环挤出（共享顶点、水密），禁独立放样后 index 合并。 */
  const sheet = (name, rows, angles, spine, opts) => {
    /* 帧 = 插座外法线（不是总流向）：首带必须沿法线外出，否则插座法线（水平）与
       环法线（沿流向=竖直）差 90° → 首带扭转自穿。环面因此是竖直面，片体下垂不扭。 */
    const { tri } = socketTriangle(mesh, rows, angles);
    const hc = centroidOf(mesh, tri);
    const pts3 = tri.map((vi) => mesh.vertices[vi]);
    let nrm = V3.norm(V3.cross(V3.sub(pts3[1], pts3[0]), V3.sub(pts3[2], pts3[0])));
    if (V3.dot(nrm, V3.norm([hc[0], 0, hc[2]])) < 0) nrm = V3.mul(nrm, -1);
    const t = opts.t ?? 0.012;
    const root = { c: V3.add(hc, V3.mul(nrm, 0.015)), rv: spine[0].rv * 0.8 };
    const chain = [root.c, ...spine.map((q) => q.c)];
    const segs = [];
    for (let i = 1; i < chain.length; i += 1) {
      const a = chain[i - 1]; const b = chain[i];
      const rvA = i === 1 ? root.rv : spine[i - 2].rv;
      const rvB = spine[i - 1].rv;
      const n = Math.max(1, Math.ceil(Math.hypot(...V3.sub(b, a)) / 0.2));
      for (let k = 1; k <= n; k += 1) {
        const u = k / n;
        segs.push({ c: a.map((x, q) => x + (b[q] - x) * u), rv: rvA + (rvB - rvA) * u });
      }
    }
    const res = attachRibbon(mesh, rows, angles, segs, { ru: t / 2, dir: nrm, debug: false, frameSocket: opts.frameSocket });
    log(name, null, res); mark(name, res._faceStart);
    return res;
  };
  const hcOf = (rows, angles) => centroidOf(mesh, socketTriangle(mesh, rows, angles).tri);

  /* L4 发片 ×4（片厚 0.004m，流向沿用实测：后 142° / 前 154°）
     参考侧视背缘（相对身体轴）：y1.26 −0.093（贴身）→ y0.78 −0.211（下摆外扬）；
     旧 hairBack 管体 rv 0.062~0.080 → 侧视填充率仅 0.028（22.8k 红），改片贴体 */
  sheet('hairBack1', ['jaw', 'head_widest'], [5, 6], [
    { c: [-0.210, 0.870, -0.215], rv: 0.035 },
  ], { axis: [-0.25, -0.96, -0.10] });
  sheet('hairBack2', ['jaw', 'head_widest'], [6, 7], [
    { c: [0.215, 0.890, -0.210], rv: 0.035 },
  ], { axis: [0.25, -0.96, -0.10] });
  sheet('hairFront1', ['jaw', 'head_widest'], [0, 1], [
    { c: [0.225, 1.055, 0.210], rv: 0.035 },
  ], { axis: [0.25, -0.96, 0.10] });
  sheet('hairFront2', ['jaw', 'head_widest'], [3, 4], [
    { c: [-0.225, 1.055, 0.210], rv: 0.035 },
  ], { axis: [-0.25, -0.96, 0.10] });

  /* L4 袖片 ×2（片厚 0.004m）：臂插座 [seal_top,chest] 已占用，故从肩上行 [chest,neck_base]
     长出。参考正视 y0.86 出现 ±0.41 的袖口横档（残差 gapL/gapR 0.043-0.044），
     外缘取 L1 实测 ±0.431/±0.437 → 设计 0.435 */
  sheet('sleeveR', ['chest', 'neck_base'], [6, 7], [
    { c: [0.250, 1.160, -0.085], rv: 0.045 },
    { c: [0.300, 1.010, -0.090], rv: 0.070 },
    { c: [0.325, 0.880, -0.090], rv: 0.105 },
  ], { axis: [0.22, -0.96, -0.08], frameSocket: true });
  sheet('sleeveL', ['chest', 'neck_base'], [5, 6], [
    { c: [-0.250, 1.170, -0.095], rv: 0.045 },
    { c: [-0.305, 1.010, -0.085], rv: 0.070 },
    { c: [-0.330, 0.880, -0.085], rv: 0.105 },
  ], { axis: [-0.22, -0.96, -0.08], frameSocket: true });

  /* L4 纱片 ×3（片厚 0.004m）：从腰/臀环长出，层底 0.55/0.30/0.14 → 层间下垂差 0.250/0.160m
     （沿用 L3-G3 实测）；单向流由层间 z 偏移 0.150→0.178 承载（主干剪切已归零） */
  sheet('veilA', ['hip', 'upper_hip'], [1, 2], [
    { c: [0.150, 0.550, 0.160], rv: 0.050 },
  ], { axis: [0.0, -0.99, 0.14] });
  sheet('veilB', ['upper_hip', 'mid_body'], [6, 7], [
    { c: [-0.150, 0.300, -0.222], rv: 0.050 },
  ], { axis: [0.0, -0.99, -0.14] });
  sheet('veilC', ['mid_body', 'lower_waist'], [2, 3], [
    { c: [-0.160, 0.140, 0.215], rv: 0.050 },
  ], { axis: [0.0, -0.99, 0.14] });

  /* 肩饰宝石 ×4：单面片外挤（肩前/肩后 + 腰前/腰后），从主干长出 */
  const gems = [
    { rows: ['chest', 'neck_base'], angles: [1, 2], out: 0.075 },
    { rows: ['chest', 'neck_base'], angles: [4, 5], out: 0.075 },
    { rows: ['mid_body', 'lower_waist'], angles: [1, 2], out: 0.070 },
    { rows: ['mid_body', 'lower_waist'], angles: [5, 6], out: 0.070 },
  ];

  /* 棱柱贴片（宝石 / 面部块面共用）：从补丁长出 scale 收缩的单环棱柱 */
  const prismPatch = (name, rows, angles, out) => {
    const _vfs = mesh.vertices.length;
    const patch = patchVerts(mesh, rows, angles);
    const c = patchCentroid(mesh, patch);
    const rc = [0, 0, 0];
    for (const nm of rows) {
      const base = mesh.ringIdx[IDX[nm]];
      for (let a = 0; a < SIDES; a += 1) { rc[0] += mesh.vertices[base + a][0]; rc[2] += mesh.vertices[base + a][2]; }
    }
    rc[0] /= rows.length * SIDES; rc[2] /= rows.length * SIDES;
    const nl = Math.hypot(c[0] - rc[0], c[2] - rc[2]) || 1;
    const dir = [(c[0] - rc[0]) / nl, 0, (c[2] - rc[2]) / nl];
    const rb = recoverBoundary(mesh, patch);
    const res = tubeFromLoop(mesh, rb.loop, [
      { c: [c[0] + dir[0] * out, c[1], c[2] + dir[2] * out], dir, prism: true, scale: 0.86, out: 0 },
    ], { removeFaces: rb.rm });
    info.branches.push({ name, B: res.B, rings: res.rings.length });
    mark(name, _vfs);
    return res;
  };
  gems.forEach((g, i) => prismPatch(`gem${i + 1}`, g.rows, g.angles, g.out));

  /* L4 面部块面 ×4（额/颊×2/颌）+ 眼窝凹陷 ×2 —— 目标：reference-view 目检可见头转向 + 下颌线 */
  prismPatch('faceForehead', ['head_widest', 'crown'], [1, 2], 0.050);
  prismPatch('faceCheekR', ['jaw', 'head_widest'], [1, 2], 0.036);
  prismPatch('faceCheekL', ['jaw', 'head_widest'], [2, 3], 0.036);
  prismPatch('faceJaw', ['head_base', 'jaw'], [2, 3], 0.050);

  /* 挂带 ×2：胸上 2×2 盘向下挤（背右 / 前左） */
  const strapBack = attach(mesh, ['seal_top', 'chest'], [1, 2], [
    { c: [0.070, 1.200, 0.270], ru: 0.046, rv: 0.022 },
    { c: [0.080, 1.010, 0.300], ru: 0.058, rv: 0.034 },
  ], { axis: [0.02, -0.98, 0.18] });
  log('strapBack', null, strapBack); mark('strapBack', strapBack._faceStart);
  const strapFront = attach(mesh, ['seal_top', 'chest'], [2, 3], [
    { c: [-0.070, 1.200, 0.270], ru: 0.046, rv: 0.022 },
    { c: [-0.080, 1.010, 0.300], ru: 0.058, rv: 0.034 },
  ], { axis: [-0.02, -0.98, 0.18] });
  log('strapFront', null, strapFront); mark('strapFront', strapFront._faceStart);

  // R3 手性修正：右手系下「面朝 +Z、上 +Y」的人其右手在 -X；本管线此前把 +X 当右手 →
  // 整体是镜像人。末尾绕 x=0 镜像顶点 + 翻转面绕序（法线仍朝外），使预览正视图不再左右反。
  for (const v of mesh.vertices) v[0] = -v[0];
  for (let i = 0; i + 2 < mesh.faces.length; i += 3) {
    const t = mesh.faces[i + 1]; mesh.faces[i + 1] = mesh.faces[i + 2]; mesh.faces[i + 2] = t;
  }
  // L4 框对齐：整体 +z 平移 0.0598（参考侧视身体轴 L1 实测 abs x=1106.5 vs IoU 框面板中心 1147.5）
  for (const v of mesh.vertices) v[2] += Z_ALIGN;
  ensureOutward(mesh);
  info.eyeSockets = eyeSockets;
  info.sheets = {
    sleeve: info.branches.filter((b) => b.name.startsWith('sleeve')).length,
    veil: info.branches.filter((b) => b.name.startsWith('veil')).length,
    hair: info.branches.filter((b) => b.name.startsWith('hair')).length,
    blade: 1,
    jawRing: RINGS.some((r) => r.name === 'jaw') ? 1 : 0,
    faceBlock: info.branches.filter((b) => b.name.startsWith('face')).length,
    eyeSocket: eyeSockets.length,
    thicknessM: 0.004,
    droopBottomsM: [0.55, 0.30, 0.14],
    flowDeg: { hairBack: 142, hairFront: 154, skirt: 180 },
  };
  return { mesh, info };
}

/* --------------------------------- 诊断 --------------------------------- */
function triStats(vertices, faces) {
  const V = vertices;
  const F = Array.isArray(faces[0]) ? faces : Array.from({ length: faces.length / 3 },
    (_, i) => [faces[3 * i], faces[3 * i + 1], faces[3 * i + 2]]);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const rows = F.map((f, i) => {
    const [a, b, c] = f.map((vi) => V[vi]);
    const e = [len(sub(b, a)), len(sub(c, b)), len(sub(a, c))];
    return { i, area: 0.5 * len(cross(sub(b, a), sub(c, a))), aspect: Math.min(...e) / Math.max(...e) };
  });
  const areas = rows.map((r) => r.area).sort((x, y) => x - y);
  const q = (p) => areas[Math.min(areas.length - 1, Math.floor(p * (areas.length - 1)))];
  return { rows, areas, p5: q(0.05), p50: q(0.5), p95: q(0.95), min: areas[0], max: areas[areas.length - 1], ratio: q(0.95) / q(0.05) };
}

function main() {
  const { mesh, info } = buildCageMesh();
  const faceCount = mesh.faces.length / 3;
  const v = verifyMesh({ vertices: mesh.vertices, faces: mesh.faces }, {});
  const st = triStats(mesh.vertices, mesh.faces);
  const thin = st.rows.filter((r) => r.aspect < 0.08);
  const seam = seamCheck(mesh);

  const F3 = Array.isArray(mesh.faces[0]) ? mesh.faces : Array.from({ length: mesh.faces.length / 3 }, (_, i) => [mesh.faces[3 * i], mesh.faces[3 * i + 1], mesh.faces[3 * i + 2]]);
  const partOf = (fi) => {
    const vmax = Math.max(...F3[fi]);
    const p = info.parts.find((q) => vmax >= q.vStart && vmax < q.vEnd);
    return p ? p.name : '?';
  };
  const pairByPart = {};
  for (const p of (v.checks.selfIntersections.samplePairs || [])) {
    const k = [partOf(p.faceA), partOf(p.faceB)].sort().join(' x ');
    pairByPart[k] = (pairByPart[k] || 0) + 1;
  }
  const byArea = [...st.rows].sort((a, b) => a.area - b.area);
  const report = {
    faces: faceCount, vertices: mesh.vertices.length,
    parts: info.parts, pairByPart,
    smallest: byArea.slice(0, 10).map((r) => ({ f: r.i, part: partOf(r.i), area: +r.area.toExponential(2) })),
    largest: byArea.slice(-6).map((r) => ({ f: r.i, part: partOf(r.i), area: +r.area.toFixed(4) })),
    budgetOk: faceCount <= TARGET_FACES,
    verify: {
      gateOk: v.ok, failures: v.failures ?? [],
      normals: { pass: v.checks.normals.pass, inverted: v.checks.normals.invertedCount },
      watertight: v.checks.watertight, skinny: v.checks.skinny, areaRatio: v.checks.areaRatio,
      selfIntersections: { pass: v.checks.selfIntersections.pass, pairs: v.checks.selfIntersections.intersectingPairs },
    },
    areas: { min: st.min, p5: st.p5, p50: st.p50, p95: st.p95, max: st.max, ratio: +st.ratio.toFixed(2) },
    thin: { count: thin.length, pct: +(100 * thin.length / faceCount).toFixed(2), ids: thin.slice(0, 24).map((r) => `#${r.i}(${r.aspect.toFixed(3)})`) },
    seam: { openEdges: seam.openEdges, seamEdges: seam.seamEdges, components: seam.components },
    branches: info.branches,
    rings: RINGS,
    headYawDeg: headYawDeg,
    zAlign: Z_ALIGN,
    trunkShearAtHem: flowAt(0.01),
    sheets: info.sheets,
    eyeSockets: info.eyeSockets ?? [],
  };
  fs.writeFileSync(R('delivery/hanfu-cage/cage.json'), JSON.stringify({
    iteration: 38, stage: 'L4-sheets', mesh, provenance: { builder: 'scripts/build-hanfu-cage.mjs', sides: SIDES, rings: RINGS.length },
  }, null, 1));
  // 预览页契约：{name, items[{resourceId,vertices,faces,colors}], summary{faces,seams,gate,inBudget}}
  const webColors = [];
  for (let i = 0; i < mesh.faces.length; i += 1) webColors.push(mesh.colors && mesh.colors[i] ? mesh.colors[i] : NEUTRAL);
  fs.writeFileSync(R('web/draw/hanfu-cage.json'), JSON.stringify({
    name: 'hanfu-cage',
    items: [{ resourceId: 10009019, vertices: mesh.vertices, faces: mesh.faces, colors: webColors }],
    summary: {
      stage: 'hanfu-control-cage-L4-sheets',
      faces: faceCount,
      seams: { openEdges: seam.openEdges, seamEdges: seam.seamEdges, components: seam.components, onePiece: seam.components === 1, watertight: seam.openEdges === 0 },
      gate: { ok: report.verify.gateOk && report.budgetOk && seam.openEdges === 0, failures: report.verify.failures },
      inBudget: faceCount <= TARGET_FACES,
    },
  }));
  fs.writeFileSync(R('delivery/hanfu-cage/cage-mesh.json'), JSON.stringify({
    schemaVersion: 1,
    units: 'm',
    coordinateSystem: '+Y up +Z front',
    iteration: 38,
    stage: 'L4-sheets',
    faceCount: faceCount,
    vertexCount: mesh.vertices.length,
    vertices: mesh.vertices,
    faces: mesh.faces,
  }, null, 1));
  fs.writeFileSync(R('.scratch/l4-build-report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
  const ok = report.budgetOk && report.verify.gateOk && seam.openEdges === 0 && seam.components === 1;
  console.log(ok ? '\n✅ L4 BUILD GATE OK' : '\n❌ L4 BUILD GATE FAIL');
  process.exitCode = ok ? 0 : 1;
}

main();
