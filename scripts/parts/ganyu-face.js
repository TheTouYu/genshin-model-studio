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
      quad(c, n, w * 1.02, h * 1.02, colorFn(i, j, tm), thick);
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


/* ---------- 头 + 五官（细节拆分 ticket: face —— 眼睛/睫/嘴逐步优化） ---------- */
window.gms.part('sphere', { x: 0, y: 1.05, z: 0, r: 0.085, color: SKIN });
window.gms.part('disc', { x: 0, y: 0.965, z: 0, r: 0.048, thick: 0.030, axis: 'up', color: SKIN });
// 眼睛：眼白 + 蓝瞳 + 瞳孔 + 高光 + 睫毛线（对比原图三次：眼大、上挑、高光左上）
function eye(sx) {
  window.gms.part('disc', { x: sx, y: 1.062, z: 0.0795, r: 0.0125, thick: 0.002, axis: 'front', color: WHITE });
  window.gms.part('disc', { x: sx, y: 1.060, z: 0.0812, r: 0.0098, thick: 0.0018, axis: 'front', color: '#8a6fd8' });
  window.gms.part('disc', { x: sx, y: 1.058, z: 0.0822, r: 0.0042, thick: 0.0015, axis: 'front', color: '#1a2b4a' });
  window.gms.part('disc', { x: sx + 0.0035, y: 1.0655, z: 0.0828, r: 0.0026, thick: 0.0012, axis: 'front', color: WHITE });
  window.gms.part('rod', { x1: sx - 0.015, y1: 1.0745, z: 0.0810, x2: sx - 0.004, y2: 1.0785, size: 0.0026, color: '#b8cfe8' });
  window.gms.part('rod', { x1: sx - 0.004, y1: 1.0785, z: 0.0810, x2: sx + 0.014, y2: 1.0755, size: 0.0026, color: '#b8cfe8' });
}
eye(-0.028); eye(0.028);
window.gms.part('disc', { x: -0.030, y: 1.044, z: 0.0825, r: 0.006, thick: 0.0018, axis: 'front', color: '#f0b7b7' });
window.gms.part('disc', { x: 0.030, y: 1.044, z: 0.0825, r: 0.006, thick: 0.0018, axis: 'front', color: '#f0b7b7' });
window.gms.part('rod', { x1: 0, y1: 1.052, z: 0.086, x2: 0, y2: 1.040, size: 0.0028, color: '#e8b49b' });
window.gms.part('disc', { x: 0, y: 1.014, z: 0.081, r: 0.0068, thick: 0.0018, axis: 'front', color: MOUTH });
window.gms.part('rod', { x1: -0.006, y1: 1.0195, z: 0.0812, x2: 0.006, y2: 1.0195, size: 0.0012, color: '#8a4a4a' });
window.__gmsBatchEnd && window.__gmsBatchEnd();
