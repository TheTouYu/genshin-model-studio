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
var D = window.GANYU_DENSE || {}; // 测量数据（extract-ganyu-profile.py → ganyu-dense.js 预注入）

var U = 48; // 横向（绕一周）曲线数：越大越圆滑（测量驱动密度）
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
      quad(c, n, w * 1.0, h * 1.0, colorFn(i, j, tm), thick);
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
// 躯干/腿环：优先用测量数据（ganyu-dense.js，21/12 环），缺省回退手测
var TORSO_R = (D.torso && D.torso.length ? D.torso : [
  { y: 0.543, rx: 0.059, ry: 0.034 }, { y: 0.614, rx: 0.052, ry: 0.030 },
  { y: 0.684, rx: 0.043, ry: 0.036 }, { y: 0.755, rx: 0.060, ry: 0.035 },
  { y: 0.826, rx: 0.060, ry: 0.036 }, { y: 0.897, rx: 0.065, ry: 0.040 },
  { y: 0.968, rx: 0.038, ry: 0.034 }, { y: 0.995, rx: 0.030, ry: 0.028 },
]).map(function (r) { return { y: r.y, cx: 0, cz: -0.02, rx: r.rx, ry: r.ry }; });
var LEG_R = (D.leg && D.leg.length ? D.leg : [
  { y: 0.059, cxL: -0.105, rx: 0.015, ry: 0.030 }, { y: 0.106, cxL: -0.090, rx: 0.018, ry: 0.024 },
  { y: 0.153, cxL: -0.090, rx: 0.021, ry: 0.024 }, { y: 0.212, cxL: -0.088, rx: 0.028, ry: 0.030 },
  { y: 0.271, cxL: -0.084, rx: 0.036, ry: 0.036 }, { y: 0.330, cxL: -0.077, rx: 0.031, ry: 0.038 },
  { y: 0.389, cxL: -0.066, rx: 0.034, ry: 0.040 }, { y: 0.448, cxL: -0.065, rx: 0.038, ry: 0.046 },
  { y: 0.507, cxL: -0.070, rx: 0.040, ry: 0.048 }, { y: 0.555, cxL: -0.059, rx: 0.050, ry: 0.026 },
]).map(function (r) {
  var cx = Math.abs(r.cxL !== undefined ? r.cxL : (r.cx || 0.08));
  return { y: r.y, cx: cx, cz: -0.02, rx: r.rx || r.rx, ry: r.ry || r.ry };
});
function mirrorRings(rings, sign) {
  return rings.map(function (r) { return { y: r.y, cx: Math.round(r.cx * sign * 1000) / 1000, cz: r.cz ?? -0.02, rx: r.rx, ry: r.ry }; });
}
/** 在测量环表中插值取单环；ringsBetween 生成衣装带的连续环（避免测量标签噪声造成“露肤缝隙”） */
function ringAt(rings, y) {
  var y0 = rings[0].y, y1 = rings[rings.length - 1].y;
  y = Math.max(y0, Math.min(y1, y));
  for (var i = 0; i < rings.length - 1; i++) {
    var a = rings[i], b = rings[i + 1];
    if (y >= a.y && y <= b.y) {
      var t = (y - a.y) / ((b.y - a.y) || 1);
      return { y: y, cx: 0, cz: -0.02, rx: a.rx + (b.rx - a.rx) * t, ry: a.ry + (b.ry - a.ry) * t };
    }
  }
  return y1 - y0 > 0 ? rings[rings.length - 1] : rings[0];
}
function interp(rings, n) {
  var out = [];
  for (var i = 0; i <= n; i++) out.push(ringAt2(rings, i / n));
  return out;
}
function ringAt2(rings, t) {
  var m = rings.length - 1, x = t * m, i = Math.min(m - 1, Math.floor(x)), f = x - i;
  var a = rings[i], b = rings[i + 1];
  return { y: a.y + (b.y - a.y) * f, cx: (a.cx || 0) + ((b.cx || 0) - (a.cx || 0)) * f,
           cz: (a.cz || -0.02) + ((b.cz || -0.02) - (a.cz || -0.02)) * f,
           rx: a.rx + (b.rx - a.rx) * f, ry: a.ry + (b.ry - a.ry) * f };
}
function ringsBetween(rings, y0, y1, n) {
  n = n || 7;
  var s = Math.max(y0, rings[0].y), e = Math.min(y1, rings[rings.length - 1].y);
  if (e - s < 0.01) { s = rings[0].y; e = rings[rings.length - 1].y; }
  var out = [];
  for (var i = 0; i <= n; i++) out.push(ringAt(rings, s + (e - s) * i / n));
  return out;
}
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
// 发体球：顶部/后脑圆润发壳（避免面板法线/剔除导致剪影黑洞）
window.gms.part('sphere', { x: 0, y: 1.13, z: -0.02, r: 0.088, color: HAIR3 });
window.gms.part('sphere', { x: 0, y: 1.05, z: -0.05, r: 0.075, color: HAIR2 });
surface([
  { y: 0.96, cx: 0, cz: -0.03, rx: 0.055, ry: 0.055 },
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
  var sx = li < 7 ? -0.078 - li * 0.003 : 0.078 + (li - 7) * 0.003;
  var di = sx < 0 ? -1 : 1;
  var sy = 1.10 - li * 0.008;
  ribbon([[sx, sy, -0.012], [sx + di * 0.010, sy - 0.06, 0.03], [sx + di * 0.007, sy - 0.13, 0.03], [sx + di * 0.014, sy - 0.14, 0.02]],
    [0.012, 0.011, 0.010], li % 2 ? HAIR : HAIR2, headC);
}
var tailC = [0.045, 0.82, -0.10];
for (var si = 0; si < 120; si++) {
  var ang = (si / 120) * Math.PI * 2;
  var ox = 0.045 + Math.cos(ang) * 0.045, oz = -0.095 + Math.sin(ang) * 0.038;
  var kk = si % 9;
  ribbon([
    [ox, 1.0, oz], [ox * 0.96 + 0.02, 0.90, oz + 0.002], [ox * 0.9 + 0.03, 0.76, oz + 0.004],
    [ox * 0.85 + 0.04, 0.62, oz + 0.003], [ox * 0.8 + 0.05, 0.48, oz + 0.002],
    [ox * 0.75 + 0.055, 0.38, -0.082], [ox * 0.7 + 0.06, 0.30 + (si % 4) * 0.010, -0.074],
    [ox * 0.65 + 0.06, 0.26, -0.070]
  ], [0.009, 0.009, 0.008, 0.008, 0.007, 0.006, 0.005], si % 2 ? HAIR : HAIR2, tailC);
}
ribbon([[0, 1.15, 0], [0.006, 1.185, 0.02], [0.002, 1.192, 0.045], [-0.005, 1.176, 0.055]], [0.006, 0.005, 0.004], HAIR3, headC);
function horn(sd) {
  var bx = 0.062 * sd;
  ribbon([[bx, 1.08, 0], [bx + 0.014 * sd, 1.13, -0.02], [bx + 0.024 * sd, 1.19, -0.05], [bx + 0.010 * sd, 1.22, -0.08]],
    [0.016, 0.015, 0.012], HORN, headC);
  window.gms.part('cone', { x: bx + 0.002 * sd, y: 1.24, z: -0.08, r: 0.010, h: 0.040, axis: 'up', color: HORN_TIP });
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
// 鞋带（白色细杆 ×3 每只）+ 蓝鞋头三棱
function laces(cx) {
  for (var k = 0; k < 3; k++) {
    window.gms.part('rod', { x1: cx - 0.018, y1: 0.055 + k * 0.012, z: 0.034, x2: cx + 0.018, y2: 0.050 + k * 0.012, size: 0.003, color: WHITE });
  }
  window.gms.part('tri', { x: cx, y: 0.052, z: 0.052, w: 0.022, h: 0.014, thick: 0.002, axis: 'front', color: BLUE });
}
laces(-0.09);
laces(0.09);

/* ---------- 贴面图案：背部 GANYU 10 / 胸前 10 / 袜鸢尾纹（参考三视图标志） ---------- */
function letter(x, y, ch, z, sz, color) {
  if (ch === 'G') {
    window.gms.part('rod', { x1: x - 0.016, y1: y + 0.012, z: z, x2: x - 0.016, y2: y - 0.012, size: sz, color: color });
    window.gms.part('rod', { x1: x - 0.016, y1: y + 0.012, z: z, x2: x + 0.014, y2: y + 0.012, size: sz, color: color });
    window.gms.part('rod', { x1: x - 0.016, y1: y - 0.012, z: z, x2: x + 0.014, y2: y - 0.012, size: sz, color: color });
    window.gms.part('rod', { x1: x + 0.014, y1: y + 0.012, z: z, x2: x + 0.014, y2: y + 0.002, size: sz, color: color });
    window.gms.part('rod', { x1: x + 0.014, y1: y + 0.002, z: z, x2: x - 0.002, y2: y + 0.002, size: sz, color: color });
  } else if (ch === 'A') {
    window.gms.part('rod', { x1: x - 0.016, y1: y - 0.012, z: z, x2: x, y2: y + 0.014, size: sz, color: color });
    window.gms.part('rod', { x1: x, y1: y + 0.014, z: z, x2: x + 0.016, y2: y - 0.012, size: sz, color: color });
    window.gms.part('rod', { x1: x - 0.009, y1: y - 0.001, z: z, x2: x + 0.009, y2: y - 0.001, size: sz, color: color });
  } else if (ch === 'N') {
    window.gms.part('rod', { x1: x - 0.016, y1: y + 0.013, z: z, x2: x - 0.016, y2: y - 0.013, size: sz, color: color });
    window.gms.part('rod', { x1: x + 0.016, y1: y + 0.013, z: z, x2: x + 0.016, y2: y - 0.013, size: sz, color: color });
    window.gms.part('rod', { x1: x - 0.016, y1: y + 0.013, z: z, x2: x + 0.016, y2: y - 0.013, size: sz, color: color });
  } else if (ch === 'Y') {
    window.gms.part('rod', { x1: x - 0.016, y1: y + 0.012, z: z, x2: x, y2: y + 0.0, size: sz, color: color });
    window.gms.part('rod', { x1: x + 0.016, y1: y + 0.012, z: z, x2: x, y2: y + 0.0, size: sz, color: color });
    window.gms.part('rod', { x1: x, y1: y + 0.0, z: z, x2: x, y2: y - 0.013, size: sz, color: color });
  } else if (ch === 'U') {
    window.gms.part('rod', { x1: x - 0.016, y1: y + 0.013, z: z, x2: x - 0.016, y2: y - 0.010, size: sz, color: color });
    window.gms.part('rod', { x1: x + 0.016, y1: y + 0.013, z: z, x2: x + 0.016, y2: y - 0.010, size: sz, color: color });
    window.gms.part('rod', { x1: x - 0.016, y1: y - 0.010, z: z, x2: x + 0.016, y2: y - 0.010, size: sz, color: color });
  }
}
// 背后 GANYU + 10（加大、左移避开偏右马尾）
letter(-0.105, 0.875, 'G', -0.082, 0.0055, BLUE);
letter(-0.041, 0.875, 'A', -0.082, 0.0055, BLUE);
letter(0.023, 0.875, 'N', -0.082, 0.0055, BLUE);
letter(0.087, 0.875, 'Y', -0.082, 0.0055, BLUE);
letter(0.151, 0.875, 'U', -0.082, 0.0055, BLUE);
window.gms.part('rod', { x1: 0.045, y1: 0.775, z: -0.082, x2: 0.045, y2: 0.700, size: 0.007, color: BLUE });
window.gms.part('disc', { x: 0.088, y: 0.7375, z: -0.082, r: 0.026, thick: 0.002, axis: 'front', color: BLUE });
// 胸前 10
window.gms.part('rod', { x1: -0.036, y1: 0.86, z: 0.073, x2: -0.036, y2: 0.79, size: 0.006, color: BLUE });
window.gms.part('disc', { x: 0.006, y: 0.825, z: 0.073, r: 0.022, thick: 0.002, axis: 'front', color: BLUE });
// 袜鸢尾纹 ×2
function fleur(x, y) {
  window.gms.part('rod', { x1: x, y1: y - 0.03, z: 0.028, x2: x, y2: y + 0.02, size: 0.004, color: BLUE });
  window.gms.part('rod', { x1: x, y1: y + 0.005, z: 0.028, x2: x - 0.014, y2: y + 0.016, size: 0.0035, color: BLUE });
  window.gms.part('rod', { x1: x, y1: y + 0.005, z: 0.028, x2: x + 0.014, y2: y + 0.016, size: 0.0035, color: BLUE });
  window.gms.part('disc', { x: x, y: y - 0.038, z: 0.028, r: 0.006, thick: 0.002, axis: 'front', color: BLUE });
}
fleur(-0.09, 0.15);
fleur(0.09, 0.15);
window.__gmsBatchEnd && window.__gmsBatchEnd();
