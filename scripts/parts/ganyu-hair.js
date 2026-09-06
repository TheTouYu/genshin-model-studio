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
/* ---------- 头发：头皮壳（包住后脑）+ 刘海/侧发/长马尾飘带 ---------- */
var headC = [0, 1.06, -0.02];
// 发体球：顶部/后脑圆润发壳（避免面板法线/剔除导致剪影黑洞）
window.gms.part('sphere', { x: 0, y: 1.13, z: -0.02, r: 0.088, color: HAIR3 });
window.gms.part('sphere', { x: 0, y: 1.05, z: -0.05, r: 0.075, color: HAIR2 });
surface([
  { y: 0.945, cx: 0, cz: -0.03, rx: 0.070, ry: 0.070 },
  { y: 0.985, cx: 0, cz: -0.012, rx: 0.086, ry: 0.086 },
  { y: 1.04, cx: 0, cz: -0.02, rx: 0.090, ry: 0.090 },
  { y: 1.10, cx: 0, cz: -0.022, rx: 0.091, ry: 0.092 },
  { y: 1.15, cx: 0, cz: -0.012, rx: 0.070, ry: 0.072 },
], Math.round(U * 0.9), function (i, j, tm) {
  // 前脸区域（tm≈π/2 且 i 上下边缘）露出皮肤：只包住正面外圈，脸中间露脸
  var face = Math.abs(tm - Math.PI / 2) < Math.PI / 5 && i >= 1 && i <= 2;
  return face ? SKIN : HAIR;
}, 0.0015);
/* ---- 弯曲发丝（P0: hair-waves）：Catmull-Rom 采样 ribbon，天然波浪/卷 ---- */
// 刘海：从左往右 12 束，每束沿额头弧形扫过、发梢外翘/内卷
for (var bi = 0; bi < 12; bi++) {
  var hx = -0.085 + (bi / 11) * 0.17;
  var sw = Math.sin(bi * 1.1) * 0.006;
  var midx = hx * 0.75 + sw, tipx = hx * 0.55 + sw * 1.4, curlx = tipx + (bi % 2 ? 0.010 : -0.010);
  curvedRibbon([[hx, 1.115, 0.045], [midx, 1.095, 0.062], [tipx, 1.068, 0.075], [curlx, 1.082, 0.078]],
    [0.013, 0.011, 0.008], bi % 2 ? HAIR : HAIR2, headC, 6);
}
// 侧发：每侧 6 束，中段波浪、末端内勾卷（还原原图卷尾）
for (var li = 0; li < 12; li++) {
  var sd = li < 6 ? -1 : 1;
  var sx0 = sd * (0.070 + (li % 6) * 0.006);
  var sy0 = 1.10 - (li % 6) * 0.010;
  var wv = Math.sin(li * 1.7) * 0.008;
  curvedRibbon([[sx0, sy0, 0.01],
    [sx0 + sd * 0.010 + wv, sy0 - 0.06, 0.030],
    [sx0 + sd * 0.006 + wv * 1.6, sy0 - 0.14, 0.030],
    [sx0 + sd * 0.016 + wv * 0.6, sy0 - 0.20, 0.028],
    [sx0 + sd * 0.000 + wv * 0.3, sy0 - 0.205, 0.026]],
    [0.013, 0.012, 0.010, 0.007], li % 2 ? HAIR : HAIR2, headC, 7);
}
// 呆毛：螺旋卷（顶端小环 + 上挑弯）
(function () {
  var sp = [];
  for (var k = 0; k <= 14; k++) {
    var a = (k / 14) * Math.PI * 2.3 - 0.5, r = 0.010 + (k / 14) * 0.006;
    sp.push([Math.cos(a) * r, 1.185 + Math.sin(a) * r * 0.8, 0.028]);
  }
  curvedRibbon(sp, [0.007, 0.006, 0.005], HAIR3, headC, 10);
})();
var tailC = [0, 0.85, -0.10];
for (var si = 0; si < 150; si++) {
  var ang = (si / 150) * Math.PI * 2;
  var ox = Math.cos(ang) * 0.058, oz = -0.095 + Math.sin(ang) * 0.045;
  var kk = si % 9;
  ribbon([
    [ox, 1.02, oz],
    [ox * 0.92 + Math.sin(si * 1.7) * 0.006, 0.90, oz + 0.002],
    [ox * 0.82 + Math.sin(si * 2.3) * 0.010, 0.76, oz + 0.004],
    [ox * 0.72 + Math.sin(si * 1.9) * 0.012, 0.62, oz + 0.003],
    [ox * 0.62 + Math.sin(si * 2.6) * 0.014, 0.50, oz + 0.002],
    [ox * 0.52 + Math.sin(si * 2.1) * 0.016, 0.40, -0.082],
    [ox * 0.42 + Math.sin(si * 2.9) * 0.018, 0.30 + (si % 4) * 0.010, -0.074],
    [ox * 0.34 + Math.sin(si * 2.4) * 0.018, 0.26, -0.070]
  ], [0.011, 0.011, 0.010, 0.010, 0.009, 0.008, 0.007], si % 2 ? HAIR : HAIR2, tailC);
}
function horn(sd) {
  // 还原 01：大弯月角——从头顶向外-上-后弯曲；黑外层+暗红内层+近基灰带+尖细
  var bx = 0.048 * sd;
  var arc = [[bx, 1.095, 0.005],
             [bx + 0.026 * sd, 1.155, -0.045],
             [bx + 0.048 * sd, 1.205, -0.105],
             [bx + 0.055 * sd, 1.235, -0.165],
             [bx + 0.048 * sd, 1.245, -0.190]];
  // 外主：黑
  curvedRibbon(arc, [0.026, 0.022, 0.016, 0.008], '#20242c', headC, 8);
  // 内层：暗红（贴内侧略后）
  curvedRibbon([[bx - 0.002 * sd, 1.105, -0.008], [bx + 0.020 * sd, 1.16, -0.055], [bx + 0.038 * sd, 1.20, -0.112], [bx + 0.042 * sd, 1.225, -0.162]],
    [0.016, 0.013, 0.008], '#7a2a30', headC, 7);
  // 近基灰带
  curvedRibbon([[bx, 1.095, 0.005], [bx + 0.012 * sd, 1.125, -0.018], [bx + 0.022 * sd, 1.15, -0.042]],
    [0.027, 0.020], '#8a8f98', headC, 4);
  // 尖
  window.gms.part('cone', { x: bx + 0.048 * sd, y: 1.252, z: -0.19, r: 0.012, h: 0.045, axis: 'up', color: '#20242c' });
}
horn(-1); horn(1);
window.gms.part('disc', { x: 0, y: 1.0, z: -0.09, r: 0.038, thick: 0.012, axis: 'up', color: RED });
window.__gmsBatchEnd && window.__gmsBatchEnd();
