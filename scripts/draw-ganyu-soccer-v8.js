/**
 * draw-ganyu-soccer-v7.js — 曲线网络交叉成面（UV 曲面格）+ 独立衣物壳层
 *
 * 用户核心指导（2026-09-06）：
 *  - 身体是一条条【曲线】：绕一圈得到一堆纵向曲线；横着扫一圈得到一堆横向曲线；
 *    横竖曲线交错 → 成千上万个【曲面片】。
 *  - 这些面片用长方体/三角/五棱等基础元件模拟即可，关键是**面的生成算法**。
 *  - 衣服是**独立的面**（壳层）：贴着身体表面外扩一层（有间隙），裙摆/绶带与封闭身体不同。
 *
 * v7 框架：
 *  1. surface(rings, u)：截面环 → UV 网格，法线按 dU×dV 真值（含坡度），逐格生成小面。
 *  2. offset(rings, d)：衣物壳 = 身体表面外扩 d（独立面，不开底盖）。
 *  3. 身体皮肤(下) + 衣物壳(上)分层：袜/短裤/球衣/袖各自独立壳层。
 *  4. 头发 = 头皮壳 + 飘带束（刘海/侧发/长马尾）。
 */
(function () {
  var sh = document.getElementById('shape');
  if (sh && sh.value !== 'cylinder') { sh.value = 'cylinder'; sh.dispatchEvent(new Event('change', { bubbles: true })); }
  var cnt = document.getElementById('count');
  if (cnt && String(cnt.value) !== '60') { cnt.value = '60'; cnt.dispatchEvent(new Event('input', { bubbles: true })); }
})();
window.__gmsBatch = true;
window.gms.mode('extrude');
window.gms.clear();

var U = 28; // 横向（绕一周）曲线数：越大越圆滑
var HAIR = '#a9d4f5', HAIR2 = '#8fc0e9', HAIR3 = '#c7e2fa';
var SKIN = '#f3c9a7';
var WHITE = '#f7f9fc', BLUE = '#3b6ea5', BLUE_L = '#7aa8d8';
var SOCK = '#f2f4f7', BOOT = '#f5f7fa', SOLE = '#2b3a55', GLOVE = '#3a3f45';
var EYE = '#4a8fe0', MOUTH = '#c96a6a', HORN = '#7a3140', HORN_TIP = '#d8ecfa', RED = '#d9534f';

function quad(c, n, w, h, color, thick) {
  window.gms.part('quad', { x: c[0], y: c[1], z: c[2], w: w, h: h, thick: thick || 0.0015, normal: n, color: color });
}
function _n(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
/** rings=[{y,cx,cz,rx,ry}]；逐格生成小面，法线 = cross(dU,dV)（含坡度，u→绕周、v→垂直） */
function surface(rings, u, colorFn, thick) {
  for (var i = 0; i < rings.length - 1; i++) {
    var A = rings[i], B = rings[i + 1];
    var Acx = A.cx || 0, Bcx = B.cx || 0;
    for (var j = 0; j < u; j++) {
      var t0 = (j * 2 * Math.PI) / u, t1 = ((j + 1) * 2 * Math.PI) / u, tm = (t0 + t1) / 2;
      function P(r, cxr, t) { return [cxr + Math.cos(t) * r.rx, r.y, r.cz + Math.sin(t) * r.ry]; }
      var a0 = P(A, Acx, t0), a1 = P(A, Acx, t1), b0 = P(B, Bcx, t0), b1 = P(B, Bcx, t1);
      var dU = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]];
      var am = P(A, Acx, tm), bm = P(B, Bcx, tm);
      var dV = [bm[0] - am[0], bm[1] - am[1], bm[2] - am[2]];
      var n = [dU[1] * dV[2] - dU[2] * dV[1], dU[2] * dV[0] - dU[0] * dV[2], dU[0] * dV[1] - dU[1] * dV[0]];
      // 朝外：与径向点积为正
      var rad = [am[0] - Acx, 0, am[2] - A.cz];
      if (n[0] * rad[0] + n[2] * rad[2] < 0) n = [-n[0], -n[1], -n[2]];
      n = _n(n);
      var c = [(a0[0] + a1[0] + b0[0] + b1[0]) / 4, (A.y + B.y) / 2, (a0[2] + a1[2] + b0[2] + b1[2]) / 4];
      var w = Math.hypot(a1[0] - a0[0], a1[2] - a0[2]);
      var h = Math.hypot(dV[0], dV[1], dV[2]);
      quad(c, n, w * 0.94, h * 0.97, colorFn(i, j, tm), thick);
    }
  }
}
function offsetRings(rings, d) { return rings.map(function (r) { return { y: r.y, cx: r.cx || 0, cz: r.cz || 0, rx: r.rx + d, ry: r.ry + d }; }); }
/** 发丝飘带（ribbon of quads）：法线朝 axisCenter 径向，宽度渐变 */
function ribbon(pts, widths, color, axis) {
  for (var i = 0; i < pts.length - 1; i++) {
    var a = pts[i], b = pts[i + 1];
    var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    var len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (len < 1e-5) continue;
    var out = [mid[0] - axis[0], 0, mid[2] - axis[2]];
    var ol = Math.hypot(out[0], out[2]);
    if (ol < 1e-6) out = [0, 0, 1]; else out = [out[0] / ol, 0, out[2] / ol];
    var n = [out[0], mid[1] > axis[1] + 0.12 ? 0.3 : 0, out[2]];
    quad(mid, _n(n), widths[Math.min(i, widths.length - 1)], len * 1.06, color, 0.0012);
  }
}

/* ---------- 测量数据（来自 extract-ganyu-profile.py：front 宽 × side 深） ---------- */
// 躯干环：参考图像素测得（H_M=1.18m）；rx/ry 已 ×1.15 补偿“中央主段”剔除手臂造成的轻微低估
var TORSO_R = [
  { y: 0.543, cx: 0, cz: -0.02, rx: 0.059, ry: 0.034 },
  { y: 0.614, cx: 0, cz: -0.02, rx: 0.052, ry: 0.030 },
  { y: 0.684, cx: 0, cz: -0.02, rx: 0.043, ry: 0.036 },
  { y: 0.755, cx: 0, cz: -0.02, rx: 0.060, ry: 0.035 },
  { y: 0.826, cx: 0, cz: -0.02, rx: 0.060, ry: 0.036 },
  { y: 0.897, cx: 0, cz: -0.02, rx: 0.065, ry: 0.040 },
  { y: 0.968, cx: 0, cz: -0.02, rx: 0.038, ry: 0.034 },
  { y: 0.995, cx: 0, cz: -0.02, rx: 0.030, ry: 0.028 },
];
// 腿环（left 侧；right 侧 cx 取反）：小腿/脚踝/膝/大腿均按测得
var LEG_R = [
  { y: 0.059, cx: 0.105, rx: 0.015, ry: 0.030 },
  { y: 0.106, cx: 0.090, rx: 0.018, ry: 0.024 },
  { y: 0.153, cx: 0.090, rx: 0.021, ry: 0.024 },
  { y: 0.212, cx: 0.088, rx: 0.028, ry: 0.030 },
  { y: 0.271, cx: 0.084, rx: 0.036, ry: 0.036 },
  { y: 0.330, cx: 0.077, rx: 0.031, ry: 0.038 },
  { y: 0.389, cx: 0.066, rx: 0.034, ry: 0.040 },
  { y: 0.448, cx: 0.065, rx: 0.038, ry: 0.046 },
  { y: 0.507, cx: 0.070, rx: 0.040, ry: 0.048 },
  { y: 0.555, cx: 0.059, rx: 0.050, ry: 0.026 },
];
function mirrorRings(rings, sign) {
  return rings.map(function (r) { return { y: r.y, cx: Math.round(r.cx * sign * 1000) / 1000, cz: r.cz ?? -0.02, rx: r.rx, ry: r.ry }; });
}

/* ---------- 躯干皮肤（下） + 球衣壳层（上，独立面外扩 0.008） ---------- */
surface(mirrorRings(TORSO_R, 1), U, function () { return SKIN; }, 0.0012);
var jerseyRings = TORSO_R.slice(0, 7);
surface(offsetRings(jerseyRings, 0.008), U, function (i, j, tm) {
  var front = Math.abs(tm - Math.PI / 2) < Math.PI / 3;
  var diag = Math.abs((tm / Math.PI) - 0.5 + (i - 2) * 0.22) < 0.10;
  return front && diag ? BLUE : WHITE;
}, 0.0016);
window.gms.part('disc', { x: 0, y: 0.968, z: -0.02, r: 0.040, thick: 0.012, axis: 'up', color: BLUE });
window.gms.part('disc', { x: 0, y: 0.543, z: -0.02, r: 0.062, thick: 0.011, axis: 'up', color: BLUE });

/* ---------- 短裤壳层（独立面：外扩 0.006，白 + 蓝腰/侧条） ---------- */
var shortsRings = [
  { y: 0.47, cx: 0, cz: -0.02, rx: 0.062, ry: 0.036 },
  { y: 0.56, cx: 0, cz: -0.02, rx: 0.064, ry: 0.038 },
  { y: 0.64, cx: 0, cz: -0.02, rx: 0.052, ry: 0.032 },
];
surface(offsetRings(shortsRings, 0.006), U, function (i, j) { return WHITE; }, 0.0016);
window.gms.part('disc', { x: 0, y: 0.64, z: -0.02, r: 0.058, thick: 0.012, axis: 'up', color: BLUE });

/* ---------- 腿（皮肤底座（下） + 白袜壳层（上，外扩 0.005） + 蓝条） ---------- */
function leg(sign) {
  var skin = mirrorRings(LEG_R.slice(4), sign);
  surface(skin, Math.round(U * 0.8), function () { return SKIN; }, 0.0012);
  var sock = mirrorRings(LEG_R.slice(0, 6), sign);
  surface(offsetRings(sock, 0.005), Math.round(U * 0.8), function () { return SOCK; }, 0.0014);
  window.gms.part('disc', { x: sign * 0.082, y: 0.325, z: -0.02, r: 0.034, thick: 0.011, axis: 'up', color: BLUE });
}
leg(-1);
leg(1);

/* ---------- 臂（皮肤 + 白袖壳层/蓝袖口 + 黑手套） ---------- */
function arm(side) {
  surface([
    { y: 0.93, cx: side, rx: 0.024, ry: 0.024, cz: 0.0 },
    { y: 0.86, cx: side * 1.12, rx: 0.026, ry: 0.026, cz: 0.01 },
    { y: 0.79, cx: side * 1.24, rx: 0.024, ry: 0.024, cz: 0.02 },
    { y: 0.74, cx: side * 1.34, rx: 0.022, ry: 0.022, cz: 0.03 },
    { y: 0.68, cx: side * 1.44, rx: 0.020, ry: 0.020, cz: 0.04 },
  ], Math.round(U * 0.7), function (i) { return i < 3 ? SKIN : SKIN; }, 0.0012);
  surface(offsetRings([
    { y: 0.93, cx: side, rx: 0.024, ry: 0.024, cz: 0.0 },
    { y: 0.88, cx: side * 1.15, rx: 0.026, ry: 0.026, cz: 0.005 },
    { y: 0.80, cx: side * 1.35, rx: 0.024, ry: 0.024, cz: 0.02 },
  ], 0.006), Math.round(U * 0.7), function () { return WHITE; }, 0.0014);
  window.gms.part('disc', { x: side * 1.35, y: 0.80, z: 0.02, r: 0.027, thick: 0.009, axis: 'up', color: BLUE });
  window.gms.part('disc', { x: side * 1.68, y: 0.665, z: 0.04, r: 0.024, thick: 0.016, axis: 'front', color: GLOVE });
}
arm(-0.105);
arm(0.105);
window.gms.part('rod', { x1: 0, y1: 0.935, z: 0, x2: 0, y2: 0.985, size: 0.032, color: SKIN });

/* ---------- 头 + 五官 ---------- */
window.gms.part('sphere', { x: 0, y: 1.05, z: 0, r: 0.085, color: SKIN });
window.gms.part('disc', { x: -0.028, y: 1.062, z: 0.079, r: 0.010, thick: 0.0035, axis: 'front', color: EYE });
window.gms.part('disc', { x: 0.028, y: 1.062, z: 0.079, r: 0.010, thick: 0.0035, axis: 'front', color: EYE });
window.gms.part('rod', { x1: -0.043, y1: 1.083, z: 0.078, x2: -0.013, y2: 1.083, size: 0.0038, color: HAIR3 });
window.gms.part('rod', { x1: 0.013, y1: 1.083, z: 0.078, x2: 0.043, y2: 1.083, size: 0.0038, color: HAIR3 });
window.gms.part('disc', { x: 0, y: 1.044, z: 0.083, r: 0.006, thick: 0.003, axis: 'front', color: SKIN });
window.gms.part('disc', { x: 0, y: 1.012, z: 0.079, r: 0.009, thick: 0.002, axis: 'front', color: MOUTH });

/* ---------- 头发：头皮壳（包住后脑）+ 刘海/侧发/长马尾飘带 ---------- */
var headC = [0, 1.06, -0.02];
surface([
  { y: 0.985, cx: 0, cz: -0.012, rx: 0.086, ry: 0.086 },
  { y: 1.04, cx: 0, cz: -0.02, rx: 0.090, ry: 0.090 },
  { y: 1.10, cx: 0, cz: -0.022, rx: 0.091, ry: 0.092 },
  { y: 1.15, cx: 0, cz: -0.012, rx: 0.070, ry: 0.072 },
], Math.round(U * 0.9), function (i, j, tm) {
  // 前脸区域（tm≈π/2 且 i 上下边缘）露出皮肤：只包住正面外圈，脸中间露脸
  var face = Math.abs(tm - Math.PI / 2) < Math.PI / 5 && i >= 1 && i <= 2;
  return face ? SKIN : HAIR;
}, 0.0015);
for (var bi = 0; bi < 34; bi++) {
  var hx = -0.078 + (bi / 33) * 0.156;
  var hEnd = 1.068 - (bi % 4) * 0.008;
  var fx = hx + ((bi % 5) - 2) * 0.004;
  ribbon([[hx, 1.11, 0.052], [hx + (fx - hx) * 0.3, 1.09, 0.066], [hx + (fx - hx) * 0.62, 1.075, 0.073], [fx, hEnd, 0.077]],
    [0.011, 0.010, 0.009], bi % 2 ? HAIR : HAIR2, headC);
}
for (var li = 0; li < 14; li++) {
  var sx = li < 7 ? -0.09 - li * 0.005 : 0.09 + (li - 7) * 0.005;
  var di = sx < 0 ? -1 : 1;
  var sy = 1.10 - li * 0.008;
  ribbon([[sx, sy, 0.03], [sx + di * 0.012, sy - 0.06, 0.05], [sx + di * 0.008, sy - 0.13, 0.045], [sx + di * 0.016, sy - 0.21, 0.035]],
    [0.012, 0.011, 0.010], li % 2 ? HAIR : HAIR2, headC);
}
var tailC = [0, 0.82, -0.10];
for (var si = 0; si < 90; si++) {
  var ang = (si / 90) * Math.PI * 2;
  var ox = Math.cos(ang) * 0.055, oz = -0.095 + Math.sin(ang) * 0.045;
  var kk = si % 9;
  ribbon([
    [ox, 1.0, oz], [ox * 0.92, 0.90, oz + 0.002], [ox * 0.8, 0.76, oz + 0.004],
    [ox * 0.68, 0.62, oz + 0.003], [ox * 0.55, 0.48, oz + 0.002],
    [ox * 0.42, 0.38, -0.082], [ox * 0.28, 0.30 + (si % 4) * 0.012, -0.074]
  ], [0.010, 0.010, 0.009, 0.008, 0.007, 0.006], si % 2 ? HAIR : HAIR2, tailC);
}
ribbon([[0, 1.15, 0], [0.006, 1.185, 0.02], [0.002, 1.192, 0.045], [-0.005, 1.176, 0.055]], [0.006, 0.005, 0.004], HAIR3, headC);
function horn(sd) {
  var bx = 0.05 * sd;
  ribbon([[bx, 1.09, 0], [bx + 0.018 * sd, 1.16, -0.02], [bx + 0.028 * sd, 1.24, -0.05], [bx + 0.012 * sd, 1.30, -0.09]],
    [0.016, 0.015, 0.012], HORN, headC);
  window.gms.part('cone', { x: bx + 0.012 * sd, y: 1.325, z: -0.09, r: 0.015, h: 0.05, axis: 'up', color: HORN_TIP });
}
horn(-1); horn(1);
window.gms.part('disc', { x: 0, y: 1.0, z: -0.09, r: 0.038, thick: 0.012, axis: 'up', color: RED });

/* ---------- 球鞋（对齐测得脚位 cx=±0.09） ---------- */
window.gms.part('el-disc', { x: -0.09, y: 0.006, z: 0, rx: 0.048, ry: 0.036, thick: 0.012, axis: 'up', rotation: [0, -6, 0], color: SOLE });
window.gms.part('el-disc', { x: 0.09, y: 0.006, z: 0, rx: 0.048, ry: 0.036, thick: 0.012, axis: 'up', rotation: [0, 6, 0], color: SOLE });
window.gms.part('el-disc', { x: -0.09, y: 0.026, z: 0, rx: 0.044, ry: 0.032, thick: 0.028, axis: 'up', rotation: [0, -6, 0], color: BOOT });
window.gms.part('el-disc', { x: 0.09, y: 0.026, z: 0, rx: 0.044, ry: 0.032, thick: 0.028, axis: 'up', rotation: [0, 6, 0], color: BOOT });
window.gms.part('tri', { x: -0.104, y: 0.032, z: 0.026, w: 0.028, h: 0.016, thick: 0.003, axis: 'side', color: BLUE });
window.gms.part('tri', { x: 0.104, y: 0.032, z: 0.026, w: 0.028, h: 0.016, thick: 0.003, axis: 'side', color: BLUE });

window.__gmsBatchEnd && window.__gmsBatchEnd();
