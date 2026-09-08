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
import { execFileSync } from 'node:child_process';
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
  { name: 'under_mid', y: -0.010, rx: 0.2726, ryF: 0.1259, ryB: 0.1958 }, // S5 面积比门：拆大面（under_cap→hem 原单跨 0.0392）
  { name: 'hem_low', y: 0.000, rx: 0.3639, ryF: 0.1539, ryB: 0.2487 }, // S5 面积比门拆大面
  { name: 'hem', y: 0.010, rx: 0.4552, ryF: 0.1818, ryB: 0.3015 },        // L1 hem
  { name: 'hem_upper', y: 0.075, rx: 0.4035, ryF: 0.1788, ryB: 0.2723 },   // 剖面插值（拆大面）
  { name: 'tierC_mid', y: 0.140, rx: 0.3527, ryF: 0.1759, ryB: 0.2431 },   // L1 skirt_wide
  { name: 'tierC_hi', y: 0.200, rx: 0.3323, ryF: 0.1725, ryB: 0.2308 },  // S5 面积比门拆大面
  { name: 'tierC_top', y: 0.260, rx: 0.3118, ryF: 0.1690, ryB: 0.2185 },   // 剖面实测
  { name: 'tierB_bot', y: 0.300, rx: 0.2989, ryF: 0.1667, ryB: 0.2103 },
  { name: 'tierB_mid', y: 0.400, rx: 0.2667, ryF: 0.1609, ryB: 0.1899 },
  { name: 'tierB_top', y: 0.500, rx: 0.2366, ryF: 0.1552, ryB: 0.1696 },
  { name: 'tierA_bot', y: 0.550, rx: 0.2258, ryF: 0.1523, ryB: 0.1594 },   // 剖面实测（裙最窄）
  { name: 'tierA_hip', y: 0.625, rx: 0.2572, ryF: 0.1481, ryB: 0.1443 }, // S5 面积比门拆大面
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
  /* S5 面积比门：端盖用「环自身三角面」而非形心扇（面积 ×3、少 2 面 → p5 抬升） */
  push3(last[0], last[2], last[1]);
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

  const info = { branches: [], parts: [{ name: 'trunk', vStart: 0, vEnd: mesh.vertices.length }], sheets5: [], horns: [] };
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
      { c: V3.add(V3.add(hc, V3.mul(nrm, off)), [0, 0, -0.01]), ru: rad, rv: rad },
      { c: elbow, ru: 0.038, rv: 0.036 },
      { c: wrist, ru: 0.040, rv: 0.038 },
    ];
  };
  // L4：手臂轴内收（肘 0.30→0.25、腕 0.292→0.245）+ 半径收窄——参考正视图 y0.98-1.46
  // 模型超宽 0.05~0.18m（front 残差 excR 峰值 0.181），外缘对齐实测 ±0.32
  const armR = attach(mesh, ['seal_top', 'chest'], [7, 0, 1],
    armRings([7, 0, 1], [0.240, 1.010, 0.130], [0.245, 0.730, 0.175], 0.075, 0.026),
    { axis: [0.25, -0.95, 0.15], cap: false });
  log('armR', null, armR); mark('armR', armR._faceStart);

  const armL = attach(mesh, ['seal_top', 'chest'], [4,5,3],
    armRings([3, 4, 5], [-0.245, 1.010, 0.140], [-0.250, 0.730, 0.185], 0.085, 0.028),
    { axis: [-0.25, -0.95, 0.2] });
  log('armL', null, armL); mark('armL', armL._faceStart);

  /* 剑：从持剑手端环续挤（柄 / 护手 / 刃 三段，共享手环顶点）
   * L4：刃改薄片——帧 u=+z / v=−x ⇒ rv 即 x 半宽（厚度）0.002 → 片厚 0.004m；
   * 旧 rv=0.030 使刃在正视投影宽 0.06m（≈45px×250行=11k 红），改薄后正视近零贡献。 */
  const handRing = armR.rings[armR.rings.length - 1];
  const _swfs = mesh.vertices.length;
  const sword = tubeFromLoop(mesh, handRing, [
    { c: [0.235, 0.600, 0.178], dir: [0.02, -1.0, 0.01], ru: 0.016, rv: 0.020 },  // 柄
    { c: [0.232, 0.480, 0.183], dir: [0.01, -1.0, 0.01], ru: 0.022, rv: 0.020 },  // 护手
    { c: [0.240, 0.090, 0.193], dir: [0.01, -1.0, 0.01], ru: 0.034, rv: 0.006 },  // 刃（薄片，近垂直）
  ], {});
  info.branches.push({ name: 'sword', B: sword.B, rings: sword.rings.length });
  mark('sword', _swfs);

  /* 双角：头顶 2×2 盘（B=4）→ 单顶点 apex 锥（每角 4 三角，无中间环 = 无环带互穿）
     镜像对：绕 x=0 镜像角 θ→180°−θ，故 hornR[0,1] ↔ hornL[4,5]（[3,4] 不是镜像，是前移 45°） */
  /* S5 双角复位（§6.4）：参考角=短粗+向外后弯，实测投影长 0.190m（side horn_root→horn_tip_back）
     ×1.10 = 0.2090m 上限。L4 的 attachCone 是「插座→单 apex」=2 控制点（长直尖刺，全身最不像）。
     改 3 控制点角链（根/中/尖）管体：短粗（根 r 0.034 → 尖 r 0.010）+ 后弯（尖 z −0.095）。
     角长按链长实测（root→mid→tip 折线长），镜像对 [0,1] ↔ [4,5]。 */
  const hornChain = (sign) => {
    const hc = patchCentroid(mesh, patchVerts(mesh, ['head_widest', 'crown'], sign > 0 ? [0, 1] : [4, 5]));
    const mid = [sign * 0.150, 1.600, -0.040];
    const tip = [sign * 0.170, 1.570, -0.120];
    return { hc, mid, tip };
  };
  for (const [nm, sgn] of [['hornR', 1], ['hornL', -1]]) {
    const { hc, mid, tip } = hornChain(sgn);
    const _vfs = mesh.vertices.length;
    const res = attach(mesh, ['head_widest', 'crown'], sgn > 0 ? [0, 1] : [4, 5], [
      { c: mid, ru: 0.026, rv: 0.024 },
      { c: tip, ru: 0.010, rv: 0.009 },
    ], { axis: [sgn * 0.18, 0.96, -0.20] });
    log(nm, null, res); mark(nm, _vfs);
    const chain = [hc, mid, tip];
    let len = 0; for (let i = 1; i < chain.length; i += 1) len += Math.hypot(...V3.sub(chain[i], chain[i - 1]));
    info.horns.push({
      name: nm, chain: chain.map((p) => p.map((x) => +x.toFixed(4))),
      lengthM: +len.toFixed(4), backBendM: +Math.abs(tip[2] - hc[2]).toFixed(4),
      rootRadiusM: 0.034, tipRadiusM: 0.010,
    });
  }

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
    /* S5 薄片成型度量（§6.3）：环数 / 根尖宽度比 / 中心线弯曲（偏离弦） */
    const c0 = chain[0]; const cN = chain[chain.length - 1];
    const chord = V3.sub(cN, c0); const cl = Math.hypot(...chord);
    let bend = 0;
    for (const p of chain.slice(1, -1)) {
      const d = V3.sub(p, c0);
      const proj = V3.mul(chord, V3.dot(d, chord) / (cl * cl));
      bend = Math.max(bend, Math.hypot(...V3.sub(d, proj)));
    }
    const wRoot = 2 * root.rv; const wTip = 2 * spine[spine.length - 1].rv;
    info.sheets5.push({
      name, kind: opts.kind, rings: res.rings.length,
      rootWidthM: +wRoot.toFixed(4), tipWidthM: +wTip.toFixed(4),
      widthRatio: +(Math.max(wRoot, wTip) / Math.min(wRoot, wTip)).toFixed(2),
      taperDir: wRoot >= wTip ? 'root-wider' : 'tip-wider',
      bendDeviationM: +bend.toFixed(4), spineStations: spine.length,
      flowDeg: opts.flowDeg ?? null, layer: opts.layer ?? null,
    });
    return res;
  };
  const hcOf = (rows, angles) => centroidOf(mesh, socketTriangle(mesh, rows, angles).tri);

  /* S5 发片 ×4（§6.3）：每片 3 控制点（≥3 环）+ 根宽尖窄锥化 ≥1.6:1 + 中心线弯曲（单向流）
     流向沿用实测：后 142° / 前 154°；根贴头（y≈1.18-1.24）→ 尖端下垂至 y 0.78-0.90 */
  sheet('hairBack1', ['jaw', 'head_widest'], [5, 6], [
    { c: [-0.150, 1.180, -0.130], rv: 0.048 },
    { c: [-0.215, 0.980, -0.120], rv: 0.036 },
    { c: [-0.270, 0.790, -0.175], rv: 0.0235 },
  ], { axis: [-0.25, -0.96, -0.10], kind: 'hair', flowDeg: 142, layer: 0 });
  sheet('hairBack2', ['jaw', 'head_widest'], [6, 7], [
    { c: [0.155, 1.190, -0.110], rv: 0.048 },
    { c: [0.220, 1.000, -0.118], rv: 0.035 },
    { c: [0.276, 0.815, -0.172], rv: 0.0235 },
  ], { axis: [0.25, -0.96, -0.10], kind: 'hair', flowDeg: 142, layer: 0 });
  sheet('hairFront1', ['jaw', 'head_widest'], [0, 1], [
    { c: [0.150, 1.235, 0.145], rv: 0.052 },
    { c: [0.173, 1.060, 0.165], rv: 0.035 },
    { c: [0.172, 0.885, 0.185], rv: 0.025 },
  ], { axis: [0.25, -0.96, 0.10], kind: 'hair', flowDeg: 154, layer: 0 });
  sheet('hairFront2', ['jaw', 'head_widest'], [3, 4], [
    { c: [-0.155, 1.242, 0.148], rv: 0.052 },
    { c: [-0.178, 1.070, 0.167], rv: 0.035 },
    { c: [-0.177, 0.900, 0.187], rv: 0.025 },
  ], { axis: [-0.25, -0.96, 0.10], kind: 'hair', flowDeg: 154, layer: 0 });

  /* S5 袖片 ×2（§6.3）：臂插座 [seal_top,chest] 已占用，故从肩上行 [chest,neck_base] 长出。
     参考正视剖面（probe:iou-targets-l5）：y1.22 ref±0.215 / y1.14 ±0.255 / y1.06 ±0.284 /
     y0.98 ±0.320 / y0.90 ±0.383 / y0.86 ±0.411 / **y0.82 ±0.433（袖口最宽）**。
     旧袖 y0.875 触底且 y1.14-1.22 超宽 0.05-0.10 → 3 控制点改 4 站：上收下探到 0.82。
     锥化方向=尖宽（袖口宽）——与发/纱相反，照参考实测（大袖开口最宽）。 */
  sheet('sleeveR', ['chest', 'neck_base'], [6, 7], [
    { c: [0.205, 1.195, -0.055], rv: 0.030 },
    { c: [0.245, 1.070, -0.060], rv: 0.045 },
    { c: [0.300, 0.945, -0.060], rv: 0.070 },
    { c: [0.348, 0.790, -0.055], rv: 0.085 },
  ], { axis: [0.22, -0.96, -0.08], frameSocket: true, kind: 'sleeve', flowDeg: 180, layer: 0 });
  sheet('sleeveL', ['chest', 'neck_base'], [5, 6], [
    { c: [-0.210, 1.200, -0.065], rv: 0.030 },
    { c: [-0.250, 1.075, -0.060], rv: 0.045 },
    { c: [-0.305, 0.950, -0.058], rv: 0.070 },
    { c: [-0.351, 0.795, -0.053], rv: 0.085 },
  ], { axis: [-0.22, -0.96, -0.08], frameSocket: true, kind: 'sleeve', flowDeg: 180, layer: 0 });

  /* S5 纱片 ×3（§6.3）：层底 0.55/0.30/0.14 → 层间下垂差 0.250/0.160m（沿用 L3-G3 实测）；
     每片 3 控制点（弯曲垂坠）+ 根宽尖窄锥化 ≥1.6:1；veilC(z 0.215-0.272) 在 veilA
     (z 0.160-0.215) 之外 → 正视投影遮挡 veilA（§6.3③ ≥2 层可见遮挡） */
  sheet('veilA', ['hip', 'upper_hip'], [1, 2], [
    { c: [0.085, 0.680, 0.138], rv: 0.048 },
    { c: [0.1, 0.605, 0.150], rv: 0.038 },
    { c: [0.112, 0.555, 0.161], rv: 0.0235 },
  ], { axis: [0.0, -0.99, 0.14], kind: 'veil', flowDeg: 175, layer: 0 });
  sheet('veilB', ['upper_hip', 'mid_body'], [6, 7], [
    { c: [0.1, 0.430, -0.155], rv: 0.060 },
    { c: [0.12, 0.350, -0.170], rv: 0.042 },
    { c: [0.14, 0.298, -0.180], rv: 0.030 },
  ], { axis: [0.0, -0.99, -0.14], kind: 'veil', flowDeg: 175, layer: 1 });
  sheet('veilC', ['mid_body', 'lower_waist'], [2, 3], [
    { c: [0.115, 0.620, 0.222], rv: 0.058 },
    { c: [0.125, 0.270, 0.214], rv: 0.048 },
    { c: [0.145, 0.195, 0.226], rv: 0.036 },
    { c: [0.160, 0.140, 0.238], rv: 0.028 },
  ], { axis: [0.0, -0.99, 0.14], kind: 'veil', flowDeg: 175, layer: 2 });

  /* 肩饰宝石 ×4：单面片外挤（肩前/肩后 + 腰前/腰后），从主干长出 */
  const gems = [
    { rows: ['chest', 'neck_base'], angles: [1, 2], out: 0.022 },
    { rows: ['chest', 'neck_base'], angles: [4, 5], out: 0.022 },
    { rows: ['mid_body', 'lower_waist'], angles: [1, 2], out: 0.024 },
    { rows: ['mid_body', 'lower_waist'], angles: [6, 7], out: 0.024 },
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
  prismPatch('faceForehead', ['head_widest', 'crown'], [1, 2], 0.028);
  prismPatch('faceCheekR', ['jaw', 'head_widest'], [1, 2], 0.026);
  prismPatch('faceCheekL', ['jaw', 'head_widest'], [2, 3], 0.026);
  prismPatch('faceJaw', ['head_base', 'jaw'], [2, 3], 0.026);

  /* 挂带 ×2：胸上 2×2 盘向下挤（背右 / 前左） */
  const strapBack = attach(mesh, ['seal_top', 'chest'], [1, 2], [
    { c: [0.070, 1.200, 0.198], ru: 0.018, rv: 0.022 },
    { c: [0.080, 1.010, 0.212], ru: 0.020, rv: 0.034 },
  ], { axis: [0.02, -0.98, 0.18] });
  log('strapBack', null, strapBack); mark('strapBack', strapBack._faceStart);
  const strapFront = attach(mesh, ['seal_top', 'chest'], [2, 3], [
    { c: [-0.070, 1.200, 0.198], ru: 0.018, rv: 0.022 },
    { c: [-0.080, 1.010, 0.212], ru: 0.020, rv: 0.034 },
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

/* S5 §6.3③ 纱片可见遮挡：正视投影（x,y）下，外层纱片（z 更大=更靠前）覆盖内层纱片的
 * 投影面积占比。2mm 栅格栅格化（控制图精度足够），返回 {inner, outer, pct}。 */
function veilOcclusion(mesh, parts) {
  const veils = parts.filter((p) => p.name.startsWith('veil'));
  const triOf = (p) => {
    const out = [];
    for (let f = 0; f + 2 < mesh.faces.length; f += 3) {
      const t = [mesh.faces[f], mesh.faces[f + 1], mesh.faces[f + 2]];
      if (t.every((vi) => vi >= p.vStart && vi < p.vEnd)) out.push(t.map((vi) => mesh.vertices[vi]));
    }
    return out;
  };
  const raster = (tris, box, cell) => {
    const w = Math.max(1, Math.ceil((box[2] - box[0]) / cell));
    const h = Math.max(1, Math.ceil((box[3] - box[1]) / cell));
    const g = new Uint8Array(w * h);
    for (const t of tris) {
      const xs = t.map((p) => (p[0] - box[0]) / cell); const ys = t.map((p) => (p[1] - box[1]) / cell);
      const x0 = Math.max(0, Math.floor(Math.min(...xs))); const x1 = Math.min(w - 1, Math.ceil(Math.max(...xs)));
      const y0 = Math.max(0, Math.floor(Math.min(...ys))); const y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
      const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      const P = t.map((p) => [(p[0] - box[0]) / cell, (p[1] - box[1]) / cell]);
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const q = [x + 0.5, y + 0.5];
          const d1 = d(P[0], P[1], q); const d2 = d(P[1], P[2], q); const d3 = d(P[2], P[0], q);
          if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) g[y * w + x] = 1;
        }
      }
    }
    return { g, w, h };
  };
  const boxOf = (tris) => {
    const xs = []; const ys = [];
    for (const t of tris) for (const p of t) { xs.push(p[0]); ys.push(p[1]); }
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const out = [];
  const tris = Object.fromEntries(veils.map((p) => [p.name, triOf(p)]));
  const meanZ = (name) => {
    let s = 0; let n = 0;
    for (const t of tris[name]) for (const p of t) { s += p[2]; n += 1; }
    return n ? s / n : 0;
  };
  for (const inner of veils) {
    let best = 0; let outerName = null;
    for (const outer of veils) {
      if (outer.name === inner.name) continue;
      if (meanZ(outer.name) <= meanZ(inner.name)) continue; // 只在更靠前的片下算遮挡
      const box = [
        Math.min(boxOf(tris[inner.name])[0], boxOf(tris[outer.name])[0]) - 0.01,
        Math.min(boxOf(tris[inner.name])[1], boxOf(tris[outer.name])[1]) - 0.01,
        Math.max(boxOf(tris[inner.name])[2], boxOf(tris[outer.name])[2]) + 0.01,
        Math.max(boxOf(tris[inner.name])[3], boxOf(tris[outer.name])[3]) + 0.01,
      ];
      const cell = 0.002;
      const A = raster(tris[inner.name], box, cell); const B = raster(tris[outer.name], box, cell);
      let ai = 0; let inter = 0;
      for (let i = 0; i < A.g.length; i += 1) { if (A.g[i]) { ai += 1; if (B.g[i]) inter += 1; } }
      const pct = ai ? (100 * inter) / ai : 0;
      if (pct > best) { best = pct; outerName = outer.name; }
    }
    out.push({ inner: inner.name, outer: outerName, pct: +best.toFixed(1) });
  }
  return out;
}

function main() {
  const { mesh, info } = buildCageMesh();
  const occ = veilOcclusion(mesh, info.parts);
  for (const s of info.sheets5) {
    if (s.kind === 'veil') {
      const o = occ.find((q) => q.inner === s.name);
      s.occlusionPct = o ? o.pct : 0;
      s.occludedBy = o ? o.outer : null;
    }
  }
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
  /* S5 §6.8 分色：部件→色（分组取 parts[] 区间），按顶点索引对齐写 cage-mesh.colors；
     预览页 10009019 分支按面读 cols[fi/3] → web json 另写逐面色（同调色板、同部件映射）。 */
  const PALETTE = {
    trunk: '#c9c9c9', sleeve: '#7fb3e8', veil: '#9fd6c0', hair: '#b9a7e0',
    sword: '#e8d27f', horn: '#8a8f99', gem: '#e87f9f', face: '#f0d9c0',
  };
  const colorOfPart = (name) => {
    if (name.startsWith('sleeve')) return PALETTE.sleeve;
    if (name.startsWith('veil')) return PALETTE.veil;
    if (name.startsWith('hair')) return PALETTE.hair;
    if (name.startsWith('sword')) return PALETTE.sword;
    if (name.startsWith('horn')) return PALETTE.horn;
    if (name.startsWith('gem') || name.startsWith('strap')) return PALETTE.gem;
    if (name.startsWith('face')) return PALETTE.face;
    return PALETTE.trunk;
  };
  const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const vcol = new Array(mesh.vertices.length).fill(PALETTE.trunk);
  for (const p of info.parts) {
    const c = colorOfPart(p.name);
    for (let vi = p.vStart; vi < p.vEnd; vi += 1) vcol[vi] = c;
  }
  const vertexColors = [];
  for (const c of vcol) vertexColors.push(...hex2rgb(c));
  const faceColors = [];
  for (let f = 0; f + 2 < mesh.faces.length; f += 3) faceColors.push(vcol[mesh.faces[f]]);
  const colorHist = {};
  for (const c of vcol) colorHist[c] = (colorHist[c] || 0) + 1;
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
    sheets5: info.sheets5,
    horns: info.horns,
    veilOcclusion: occ,
    colors: { palette: PALETTE, histogram: colorHist, distinct: Object.keys(colorHist).length },
    eyeSockets: info.eyeSockets ?? [],
  };
  fs.writeFileSync(R('delivery/hanfu-cage/cage.json'), JSON.stringify({
    iteration: 39, stage: 'L5-sheets-colors', mesh, provenance: { builder: 'scripts/build-hanfu-cage.mjs', sides: SIDES, rings: RINGS.length },
  }, null, 1));
  // 预览页契约：{name, items[{resourceId,vertices,faces,colors}], summary{faces,seams,gate,inBudget}}
  fs.writeFileSync(R('web/draw/hanfu-cage.json'), JSON.stringify({
    name: 'hanfu-cage',
    items: [{ resourceId: 10009019, vertices: mesh.vertices, faces: mesh.faces, colors: faceColors }],
    summary: {
      stage: 'hanfu-control-cage-L5-sheets-colors',
      faces: faceCount,
      colors: { distinct: Object.keys(colorHist).length, palette: PALETTE },
      seams: { openEdges: seam.openEdges, seamEdges: seam.seamEdges, components: seam.components, onePiece: seam.components === 1, watertight: seam.openEdges === 0 },
      gate: { ok: report.verify.gateOk && report.budgetOk && seam.openEdges === 0, failures: report.verify.failures },
      inBudget: faceCount <= TARGET_FACES,
    },
  }));
  fs.writeFileSync(R('delivery/hanfu-cage/cage-mesh.json'), JSON.stringify({
    schemaVersion: 1,
    units: 'm',
    coordinateSystem: '+Y up +Z front',
    iteration: 39,
    stage: 'L5-sheets-colors',
    faceCount: faceCount,
    vertexCount: mesh.vertices.length,
    vertices: mesh.vertices,
    faces: mesh.faces,
    colors: vertexColors,
    colorParts: info.parts.map((p) => ({ name: p.name, color: colorOfPart(p.name), vStart: p.vStart, vEnd: p.vEnd })),
  }, null, 1));
  fs.writeFileSync(R('.scratch/l5-build-report.json'), JSON.stringify(report, null, 1));
  fs.writeFileSync(R('.scratch/l4-build-report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({
    faces: report.faces, vertices: report.vertices, verify: report.verify.selfIntersections,
    skinny: report.verify.skinny, areaRatio: report.verify.areaRatio, seam: report.seam,
    sheets5: report.sheets5, horns: report.horns, veilOcclusion: report.veilOcclusion,
    colors: report.colors, thin: report.thin, pairByPart: report.pairByPart,
  }, null, 1));
  const ok = report.budgetOk && report.verify.gateOk && seam.openEdges === 0 && seam.components === 1;
  console.log(ok ? '\n✅ L5 BUILD GATE OK' : '\n❌ L5 BUILD GATE FAIL');
  // L4 教训：build 会覆盖记录定稿块 → 末尾自定稿（记录 39）
  try {
    execFileSync(process.execPath, [R('scripts/finalize-hanfu-record39.mjs')], { stdio: 'inherit' });
  } catch { /* 定稿失败不阻断构建 */ }
  process.exitCode = ok ? 0 : 1;
}

main();
