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
    var SUB = 2;   // 微曲面片：每格 2×2 子面，采样全落在环曲面；法线=解析外法线（无翻转歧义）
    for (var j = 0; j < u; j++) {
      var t0 = (j * 2 * Math.PI) / u, t1 = ((j + 1) * 2 * Math.PI) / u, tm = (t0 + t1) / 2;
      function P(r, t) { return [r.cx + Math.cos(t) * r.rx, r.y, r.cz + Math.sin(t) * r.ry]; }
      function mixR(f) {
        return { y: A.y + (B.y - A.y) * f, rx: A.rx + (B.rx - A.rx) * f, ry: A.ry + (B.ry - A.ry) * f,
                 cx: Acx + (Bcx - Acx) * f, cz: (A.cz || -0.02) + ((B.cz || -0.02) - (A.cz || -0.02)) * f };
      }
      for (var si = 0; si < SUB; si++) for (var sj = 0; sj < SUB; sj++) {
        var R0 = mixR(sj / SUB), R1 = mixR((sj + 1) / SUB);
        var u0 = t0 + (t1 - t0) * (si / SUB), u1 = t0 + (t1 - t0) * ((si + 1) / SUB), umid = (u0 + u1) / 2;
        var p0 = P(R0, u0), p1 = P(R0, u1), p2 = P(R1, u1), p3 = P(R1, u0);
        var n = _n([Math.cos(umid) / (R0.rx || 1), 0, Math.sin(umid) / (R0.ry || 1)]);  // 椭圆解析外法线
        var c = [(p0[0] + p1[0] + p2[0] + p3[0]) / 4, R0.y + (R1.y - R0.y) / 2, (p0[2] + p1[2] + p2[2] + p3[2]) / 4];
        var w = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
        var h = Math.hypot(p3[0] - p0[0], R1.y - R0.y, p3[2] - p0[2]);
        quad(c, n, Math.max(w, 0.0005) * 1.03, Math.max(h, 0.0005) * 1.03, colorFn(i, j, tm), thick);
      }
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
  var sm = f * f * (3 - 2 * f);
  return { y: a.y + (b.y - a.y) * f, cx: (a.cx || 0) + ((b.cx || 0) - (a.cx || 0)) * f,
           cz: (a.cz || -0.02) + ((b.cz || -0.02) - (a.cz || -0.02)) * f,
           rx: a.rx + (b.rx - a.rx) * sm, ry: a.ry + (b.ry - a.ry) * sm };
}
function ringsBetween(rings, y0, y1, n) {
  n = n || 7;
  var s = Math.max(y0, rings[0].y), e = Math.min(y1, rings[rings.length - 1].y);
  if (e - s < 0.01) { s = rings[0].y; e = rings[rings.length - 1].y; }
  var out = [];
  for (var i = 0; i <= n; i++) out.push(ringAt(rings, s + (e - s) * i / n));
  return out;
}


/* ---------- 躯干皮肤（下） + 球衣壳层（上，独立面外扩 0.008） ---------- */
var TORSO_DENSE = ringsBetween(TORSO_R, 0.40, 1.00, 40);
surface(mirrorRings(TORSO_DENSE, 1), U, function (i) {
  var r = TORSO_DENSE[Math.min(i, TORSO_DENSE.length - 1)];
  return r.y < 0.40 ? SKIN : (r.y < 0.92 ? WHITE : SKIN); // 上衣/短裤覆盖区全白，杜绝腰腹露肤
}, 0.0012);
var jerseyRings = ringsBetween(TORSO_R, 0.56, 0.92, 26);
surface(offsetRings(jerseyRings, 0.012), U, function (i, j, tm) {
  var front = Math.abs(tm - Math.PI / 2) < Math.PI / 3;
  var diag = Math.abs((tm / Math.PI) - 0.5 + (i - 3) * 0.22) < 0.10;
  var side = Math.abs(tm) < Math.PI / 7 || Math.abs(tm - Math.PI) < Math.PI / 7;   // 侧腹藏青
  var hem = i >= jerseyRings.length - 2;                                           // 下摆深蓝腰带
  return (front && diag) || side || hem ? BLUE : WHITE;
}, 0.0016);
window.gms.part('disc', { x: 0, y: 0.968, z: -0.02, r: 0.040, thick: 0.012, axis: 'up', color: BLUE });
window.gms.part('disc', { x: 0, y: 0.545, z: -0.02, r: 0.062, thick: 0.011, axis: 'up', color: BLUE });
/* 凹凸测试：胸前/腰腹 6 处微凸（贴曲面） */
var bumps = [[-0.030, 0.86, 0.012], [0.020, 0.82, 0.010], [-0.015, 0.74, 0.008], [0.035, 0.68, 0.006], [-0.030, 0.60, 0.006], [0.012, 0.55, 0.006]];
for (var bi = 0; bi < bumps.length; bi++) {
  window.gms.part('sphere', { x: bumps[bi][0], y: bumps[bi][1], z: bumps[bi][2], r: 0.006, color: '#eef2f7' });
}
/* ---------- 球鞋（对齐测得脚位 cx=±0.09） ---------- */
window.gms.part('el-disc', { x: -0.09, y: 0.006, z: 0, rx: 0.048, ry: 0.036, thick: 0.012, axis: 'up', rotation: [0, -6, 0], color: SOLE });
window.gms.part('el-disc', { x: 0.09, y: 0.006, z: 0, rx: 0.048, ry: 0.036, thick: 0.012, axis: 'up', rotation: [0, 6, 0], color: SOLE });
window.gms.part('el-disc', { x: -0.09, y: 0.026, z: 0, rx: 0.060, ry: 0.040, thick: 0.028, axis: 'up', rotation: [0, -6, 0], color: BOOT });
window.gms.part('el-disc', { x: 0.09, y: 0.026, z: 0, rx: 0.060, ry: 0.040, thick: 0.028, axis: 'up', rotation: [0, 6, 0], color: BOOT });
window.gms.part('tri', { x: -0.104, y: 0.032, z: 0.026, w: 0.028, h: 0.016, thick: 0.003, axis: 'side', color: BLUE });
window.gms.part('tri', { x: 0.104, y: 0.032, z: 0.026, w: 0.028, h: 0.016, thick: 0.003, axis: 'side', color: BLUE });
// 袜-鞋关节盖（消除接缝）
window.gms.part('disc', { x: -0.09, y: 0.048, z: 0, r: 0.031, thick: 0.018, axis: 'up', color: SOCK });
window.gms.part('disc', { x: 0.09, y: 0.048, z: 0, r: 0.031, thick: 0.018, axis: 'up', color: SOCK });
// 鞋带（白色细杆 ×3 每只）+ 蓝鞋头三棱
function laces(cx) {
  // 交叉鞋带（X ×2 + 中横带）
  window.gms.part('rod', { x1: cx - 0.016, y1: 0.050, z: 0.034, x2: cx + 0.016, y2: 0.066, size: 0.0026, color: WHITE });
  window.gms.part('rod', { x1: cx + 0.016, y1: 0.050, z: 0.034, x2: cx - 0.016, y2: 0.066, size: 0.0026, color: WHITE });
  window.gms.part('rod', { x1: cx - 0.018, y1: 0.058, z: 0.035, x2: cx + 0.018, y2: 0.058, size: 0.0028, color: WHITE });
  // 侧金藤印刷（外侧面）
  window.gms.part('rod', { x1: cx - 0.052, y1: 0.028, z: -0.012, x2: cx - 0.058, y2: 0.040, size: 0.0020, color: '#c9a86a' });
  window.gms.part('rod', { x1: cx - 0.058, y1: 0.040, z: -0.012, x2: cx - 0.052, y2: 0.050, size: 0.0020, color: '#c9a86a' });
  window.gms.part('tri', { x: cx, y: 0.052, z: 0.052, w: 0.022, h: 0.014, thick: 0.002, axis: 'front', color: BLUE });
}
laces(-0.09);
laces(0.09);
// 黑鞋钉（每脚 3 颗）
for (var st = 0; st < 3; st++) {
  window.gms.part('disc', { x: -0.09, y: 0.002, z: -0.024 + st * 0.026, r: 0.008, thick: 0.006, axis: 'up', color: '#1a1f26' });
  window.gms.part('disc', { x: 0.09, y: 0.002, z: -0.024 + st * 0.026, r: 0.008, thick: 0.006, axis: 'up', color: '#1a1f26' });
}
// 蓝后跟
window.gms.part('tri', { x: -0.09, y: 0.03, z: -0.045, w: 0.03, h: 0.018, thick: 0.003, axis: 'side', color: BLUE });
window.gms.part('tri', { x: 0.09, y: 0.03, z: -0.045, w: 0.03, h: 0.018, thick: 0.003, axis: 'side', color: BLUE });
window.__gmsBatchEnd && 
window.__gmsBatchEnd && window.__gmsBatchEnd();
