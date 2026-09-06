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
window.gms.part('rod', { x1: 0.045, y1: 0.780, z: -0.082, x2: 0.045, y2: 0.680, size: 0.008, color: BLUE });
window.gms.part('disc', { x: 0.090, y: 0.730, z: -0.082, r: 0.030, thick: 0.002, axis: 'front', color: BLUE });
// 胸前 10
window.gms.part('rod', { x1: -0.036, y1: 0.865, z: 0.073, x2: -0.036, y2: 0.775, size: 0.007, color: BLUE });
window.gms.part('disc', { x: 0.008, y: 0.820, z: 0.073, r: 0.026, thick: 0.002, axis: 'front', color: BLUE });
// 袜鸢尾纹 ×2
function fleur(x, y) {
  window.gms.part('rod', { x1: x, y1: y - 0.03, z: 0.028, x2: x, y2: y + 0.02, size: 0.004, color: BLUE });
  window.gms.part('rod', { x1: x, y1: y + 0.005, z: 0.028, x2: x - 0.014, y2: y + 0.016, size: 0.0035, color: BLUE });
  window.gms.part('rod', { x1: x, y1: y + 0.005, z: 0.028, x2: x + 0.014, y2: y + 0.016, size: 0.0035, color: BLUE });
  window.gms.part('disc', { x: x, y: y - 0.038, z: 0.028, r: 0.006, thick: 0.002, axis: 'front', color: BLUE });
}
fleur(-0.09, 0.15);
fleur(0.09, 0.15);
// 背部蓝色脊披饰品（流苏状蓝丝，垂下至腰）
var spineC = [0, 0.78, -0.10];
for (var si2 = 0; si2 < 9; si2++) {
  var bx2 = -0.026 + (si2 - 4) * 0.007;
  ribbon([[bx2, 0.86, -0.088], [bx2 * 0.7 + Math.sin(si2) * 0.004, 0.76, -0.090], [bx2 * 0.9, 0.66, -0.086], [bx2 * 0.5, 0.60, -0.082]],
    [0.012, 0.010, 0.008], si2 % 2 ? BLUE_L : '#a9d4f5', spineC);
}
// 金藤枝 + 双徽章（还原 03/04/05/13 的金色纹样）
var GOLD = '#c9a86a';
function vineFrom(pts) {
  for (var vi = 0; vi < pts.length - 1; vi++) {
    window.gms.part('rod', { x1: pts[vi][0], y1: pts[vi][1], z1: pts[vi][2], x2: pts[vi+1][0], y2: pts[vi+1][1], z2: pts[vi+1][2], size: 0.0026, color: GOLD });
  }
}
// 胸前斜襟金藤（从左肩到右髋）
(function () {
  var pts = [];
  for (var vi = 0; vi <= 6; vi++) {
    var t = vi / 6;
    pts.push([-0.058 + t * 0.115, 0.93 - t * 0.32, 0.085 + Math.sin(t * 6.0) * 0.004]);
  }
  vineFrom(pts);
})();
// 左胸盾徽（蓝底白边）+ 右胸小徽
window.gms.part('disc', { x: -0.052, y: 0.935, z: 0.087, r: 0.016, thick: 0.002, axis: 'front', color: WHITE });
window.gms.part('disc', { x: -0.052, y: 0.935, z: 0.0885, r: 0.012, thick: 0.002, axis: 'front', color: BLUE });
window.gms.part('tri', { x: 0.058, y: 0.935, z: 0.087, w: 0.014, h: 0.018, thick: 0.002, axis: 'front', color: BLUE });
// 右侧腰/背部金藤
vineFrom([[0.052, 0.82, 0.075], [0.058, 0.72, 0.078], [0.050, 0.62, 0.075], [0.056, 0.55, 0.070]]);
vineFrom([[-0.045, 0.82, -0.078], [-0.052, 0.72, -0.082], [-0.044, 0.62, -0.080]]);
window.__gmsBatchEnd && window.__gmsBatchEnd();