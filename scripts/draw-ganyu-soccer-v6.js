/**
 * draw-ganyu-soccer-v6.js — 表面网格重建框架（framework-first）
 *
 * 用户核心指导（2026-09-06）：
 *  - 真正的模型 = 由很多“面”拼起来的连续表面：身体的每根曲线 → 许多小面。
 *  - 先做对框架（把人物拆成一个个面），密度只是参数：几千面精度就好，调参可上万。
 *  - 不再用“杆+球+盘”拼布娃娃——改用【截面环放样面】+【发丝飘带面】。
 *
 * v6 框架：
 *  1. body：女性身体用 8~14 个截面环（椭圆，含腰/胸/髋曲线）放样成四边面板（quad/10009003）。
 *  2. 衣物 = 身体表面的着色面板（球衣/短裤/袜/护膝分区着色）。
 *  3. 头发 = 沿流线的多段飘带（ribbon of quads），刘海/侧发/马尾各几十条。
 *  4. 密度参数化：DENSITY=1（约 2k 面）→ 调大环数/段数即可上万（预算 ≤30000 笔没问题）。
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

var D = 1; // 密度倍率：1 ≈ 2k 面；调高即逼近真实精度
var HAIR = '#a9d4f5', HAIR2 = '#8fc0e9', HAIR3 = '#c7e2fa';
var SKIN = '#f3c9a7';
var WHITE = '#f7f9fc', BLUE = '#3b6ea5', BLUE_L = '#7aa8d8';
var SOCK = '#f2f4f7', BOOT = '#f5f7fa', SOLE = '#2b3a55', GLOVE = '#3a3f45';
var EYE = '#4a8fe0', MOUTH = '#c96a6a', HORN = '#7a3140', HORN_TIP = '#d8ecfa', RED = '#d9534f';

/* ---------- 表面原语 ---------- */
function quad(c, n, w, h, color, roll, thick) {
  window.gms.part('quad', { x: c[0], y: c[1], z: c[2], w: w, h: h, thick: thick || 0.0015, normal: n, roll: roll || 0, color: color });
}
/** 截面环放样：rings=[{y,cx,rx,ry,cz}]，seg 段；每条“身体曲线”→ 一圈小面 */
function loft(rings, seg, colorFn, thick) {
  for (var i = 0; i < rings.length - 1; i++) {
    var A = rings[i], B = rings[i + 1];
    var Acx = A.cx || 0, Bcx = B.cx || 0;
    for (var j = 0; j < seg; j++) {
      var t0 = (j * 2 * Math.PI) / seg, t1 = ((j + 1) * 2 * Math.PI) / seg, tm = (t0 + t1) / 2;
      var p00 = [Acx + Math.cos(t0) * A.rx, A.y, A.cz + Math.sin(t0) * A.ry];
      var p01 = [Acx + Math.cos(t1) * A.rx, A.y, A.cz + Math.sin(t1) * A.ry];
      var p10 = [Bcx + Math.cos(t0) * B.rx, B.y, B.cz + Math.sin(t0) * B.ry];
      var p11 = [Bcx + Math.cos(t1) * B.rx, B.y, B.cz + Math.sin(t1) * B.ry];
      var c = [(p00[0] + p01[0] + p10[0] + p11[0]) / 4, (A.y + B.y) / 2, (p00[2] + p01[2] + p10[2] + p11[2]) / 4];
      var n = [Math.cos(tm), 0, Math.sin(tm)];
      var w = Math.hypot(p00[0] - p01[0], p00[2] - p01[2]);
      var h = Math.hypot(A.y - B.y, p00[0] - p10[0], p00[2] - p10[2]);
      quad(c, n, w * 0.94, h * 0.99, colorFn(i, j, tm), 0, thick);
    }
  }
}
/** 发丝飘带：沿 pts 的连续小面（ribbon），宽度按 widths 数组渐变，法线朝 axis 径向 */
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
    var l = Math.hypot(n[0], n[1], n[2]); n = [n[0] / l, n[1] / l, n[2] / l];
    quad(mid, n, widths[Math.min(i, widths.length - 1)], len * 1.06, color, 0, 0.0012);
  }
}

/* ---------- 身体：球衣（躯干） ---------- */
var segT = 24 * D;
loft([
  { y: 0.585, rx: 0.118, ry: 0.085, cz: 0 },
  { y: 0.645, rx: 0.098, ry: 0.066, cz: 0 },
  { y: 0.705, rx: 0.104, ry: 0.070, cz: 0 },
  { y: 0.805, rx: 0.106, ry: 0.078, cz: 0.005 },
  { y: 0.905, rx: 0.100, ry: 0.066, cz: 0 },
  { y: 0.945, rx: 0.094, ry: 0.058, cz: 0 },
], segT, function (i, j, tm) {
  return WHITE;
}, 0.0016);
// 蓝斜纹：从左上到右下的一列面板染蓝
loft([
  { y: 0.645, rx: 0.098, ry: 0.066, cz: 0 },
  { y: 0.805, rx: 0.106, ry: 0.078, cz: 0.005 },
  { y: 0.925, rx: 0.098, ry: 0.062, cz: 0 },
], segT, function (i, j, tm) {
  var front = Math.abs(tm - Math.PI / 2) < Math.PI / 4; // 面向 +Z 的前侧
  var diag = Math.abs((tm / Math.PI) - 0.5 + (i - 1) * 0.18) < 0.09;
  return (front && diag) ? BLUE : (front ? WHITE : WHITE);
}, 0.0017);
// 领/下摆
window.gms.part('disc', { x: 0, y: 0.945, z: 0, r: 0.052, thick: 0.012, axis: 'up', color: BLUE });
window.gms.part('disc', { x: 0, y: 0.60, z: 0, r: 0.118, thick: 0.012, axis: 'up', color: BLUE });

/* ---------- 短裤 ---------- */
loft([
  { y: 0.525, rx: 0.118, ry: 0.088, cz: 0 },
  { y: 0.585, rx: 0.120, ry: 0.090, cz: 0 },
  { y: 0.655, rx: 0.116, ry: 0.086, cz: 0 },
], segT, function () { return WHITE; }, 0.0016);
window.gms.part('disc', { x: 0, y: 0.655, z: 0, r: 0.118, thick: 0.013, axis: 'up', color: BLUE });

/* ---------- 左右腿（白袜 → 肤色大腿） ---------- */
var segL = 18 * D;
function leg(cx) {
  loft([
    { y: 0.05, cx: cx, rx: 0.028, ry: 0.030, cz: 0 },
    { y: 0.13, cx: cx, rx: 0.030, ry: 0.032, cz: 0 },
    { y: 0.22, cx: cx, rx: 0.032, ry: 0.034, cz: 0 },
    { y: 0.30, cx: cx, rx: 0.033, ry: 0.035, cz: 0 },
    { y: 0.34, cx: cx, rx: 0.031, ry: 0.033, cz: -0.004 },
  ], segL, function () { return SOCK; }, 0.0014);
  loft([
    { y: 0.335, cx: cx, rx: 0.033, ry: 0.035, cz: -0.004 },
    { y: 0.42, cx: cx, rx: 0.037, ry: 0.038, cz: 0 },
    { y: 0.52, cx: cx, rx: 0.042, ry: 0.040, cz: 0 },
    { y: 0.585, cx: cx * 0.8, rx: 0.052, ry: 0.042, cz: 0 },
  ], segL, function () { return SKIN; }, 0.0014);
}
leg(-0.062);
leg(0.062);
window.gms.part('disc', { x: -0.062, y: 0.315, z: 0, r: 0.036, thick: 0.012, axis: 'up', color: BLUE });
window.gms.part('disc', { x: 0.062, y: 0.315, z: 0, r: 0.036, thick: 0.012, axis: 'up', color: BLUE });

/* ---------- 双臂（白袖/肤色前臂，横环放样近似） ---------- */
var segA = 14 * D;
function arm(side) {
  loft([
    { y: 0.93, cx: side, rx: 0.026, ry: 0.026, cz: 0.0 },
    { y: 0.86, cx: side * 1.12, rx: 0.028, ry: 0.028, cz: 0.01 },
    { y: 0.79, cx: side * 1.24, rx: 0.026, ry: 0.026, cz: 0.02 },
  ], segA, function () { return WHITE; }, 0.0014);
  loft([
    { y: 0.79, cx: side * 1.24, rx: 0.024, ry: 0.024, cz: 0.02 },
    { y: 0.74, cx: side * 1.34, rx: 0.022, ry: 0.022, cz: 0.03 },
    { y: 0.68, cx: side * 1.44, rx: 0.020, ry: 0.020, cz: 0.04 },
  ], segA, function () { return SKIN; }, 0.0014);
}
arm(-0.125);
arm(0.125);
window.gms.part('disc', { x: -0.30, y: 0.665, z: 0.04, r: 0.024, thick: 0.014, axis: 'front', color: GLOVE });
window.gms.part('disc', { x: 0.30, y: 0.665, z: 0.04, r: 0.024, thick: 0.014, axis: 'front', color: GLOVE });
window.gms.part('disc', { x: -0.30, y: 0.665, z: 0.04, r: 0.026, thick: 0.008, axis: 'up', color: BLUE_L });
window.gms.part('disc', { x: 0.30, y: 0.665, z: 0.04, r: 0.026, thick: 0.008, axis: 'up', color: BLUE_L });

/* ---------- 头 + 颈（球体脸 + 五官） ---------- */
window.gms.part('rod', { x1: 0, y1: 0.935, z: 0, x2: 0, y2: 0.985, size: 0.032, color: SKIN });
window.gms.part('sphere', { x: 0, y: 1.05, z: 0, r: 0.085, color: SKIN });
window.gms.part('disc', { x: -0.028, y: 1.062, z: 0.079, r: 0.010, thick: 0.0035, axis: 'front', color: EYE });
window.gms.part('disc', { x: 0.028, y: 1.062, z: 0.079, r: 0.010, thick: 0.0035, axis: 'front', color: EYE });
window.gms.part('rod', { x1: -0.04, y1: 1.083, z: 0.078, x2: -0.012, y2: 1.083, size: 0.0038, color: HAIR3 });
window.gms.part('rod', { x1: 0.012, y1: 1.083, z: 0.078, x2: 0.04, y2: 1.083, size: 0.0038, color: HAIR3 });
window.gms.part('disc', { x: 0, y: 1.044, z: 0.083, r: 0.006, thick: 0.003, axis: 'front', color: SKIN });
window.gms.part('disc', { x: 0, y: 1.012, z: 0.079, r: 0.009, thick: 0.002, axis: 'front', color: MOUTH });

/* ---------- 头发：发顶壳 + 刘海/侧发/马尾飘带（几十条曲线 × 多段小面） ---------- */
var headC = [0, 1.06, -0.02];
// 发顶/后脑壳（环放样）
loft([
  { y: 1.03, rx: 0.088, ry: 0.090, cz: -0.02 },
  { y: 1.09, rx: 0.091, ry: 0.093, cz: -0.022 },
  { y: 1.135, rx: 0.062, ry: 0.066, cz: -0.015 },
], 20 * D, function () { return HAIR; }, 0.0014);
// 刘海 34 条，每条 5 段飘带
for (var bi = 0; bi < 34; bi++) {
  var hx = -0.078 + (bi / 33) * 0.156;
  var hEnd = 1.07 - (bi % 4) * 0.008;
  var fx = hx + ((bi % 5) - 2) * 0.004;
  ribbon([
    [hx, 1.11, 0.052], [hx + (fx - hx) * 0.3, 1.09, 0.066], [hx + (fx - hx) * 0.62, 1.075, 0.073], [fx, hEnd, 0.077]
  ], [0.011, 0.010, 0.009], bi % 2 ? HAIR : HAIR2, headC);
}
// 侧发每侧 14 条
for (var li = 0; li < 14; li++) {
  var sx = li < 7 ? -0.09 - li * 0.005 : 0.09 + (li - 7) * 0.005;
  var di = sx < 0 ? -1 : 1;
  var sy = 1.10 - li * 0.008;
  ribbon([
    [sx, sy, 0.03], [sx + di * 0.012, sy - 0.06, 0.05], [sx + di * 0.008, sy - 0.13, 0.045], [sx + di * 0.016, sy - 0.20, 0.035]
  ], [0.012, 0.011, 0.010], li % 2 ? HAIR : HAIR2, headC);
}
// 马尾 90 条，每条 7 段（根部宽 → 尾尖收）
var tailC = [0, 0.85, -0.098];
for (var si = 0; si < 90; si++) {
  var ang = (si / 90) * Math.PI * 2;
  var ox = Math.cos(ang) * 0.055, oz = -0.095 + Math.sin(ang) * 0.045;
  var kk = si % 9;
  ribbon([
    [ox, 1.02, oz], [ox * 0.92 + (si % 3) * 0.004, 0.92, oz + 0.002],
    [ox * 0.80 + (si % 2 ? 0.007 : -0.007), 0.79, oz + 0.004],
    [ox * 0.68 + (kk % 3) * 0.009, 0.64, oz + 0.003],
    [ox * 0.55 + ((kk < 5 ? kk - 2 : 8 - kk)) * 0.012, 0.50, oz + 0.002],
    [ox * 0.42 + (kk - 4) * 0.010, 0.40, -0.082 + (si % 3) * 0.004],
    [ox * 0.28, 0.34 + (si % 4) * 0.012, -0.076]
  ], [0.010, 0.010, 0.009, 0.008, 0.007, 0.006], si % 2 ? HAIR : HAIR2, tailC);
}
// 呆毛
ribbon([[0, 1.15, 0], [0.006, 1.185, 0.02], [0.002, 1.192, 0.045], [-0.005, 1.176, 0.055]], [0.006, 0.005, 0.004], HAIR3, headC);
// 双角：飘带 + 锥尖
function horn(sd) {
  var bx = 0.05 * sd;
  ribbon([
    [bx, 1.09, 0], [bx + 0.018 * sd, 1.16, -0.02], [bx + 0.028 * sd, 1.24, -0.05], [bx + 0.012 * sd, 1.30, -0.09]
  ], [0.016, 0.015, 0.012], HORN, headC);
  window.gms.part('cone', { x: bx + 0.012 * sd, y: 1.325, z: -0.09, r: 0.015, h: 0.05, axis: 'up', color: HORN_TIP });
}
horn(-1); horn(1);
window.gms.part('disc', { x: 0, y: 1.03, z: -0.088, r: 0.036, thick: 0.012, axis: 'up', color: RED }); // 马尾发圈

/* ---------- 球鞋（鞋面 + 底 + 三棱锥鞋楔） ---------- */
window.gms.part('el-disc', { x: -0.062, y: 0.006, z: 0, rx: 0.058, ry: 0.044, thick: 0.012, axis: 'up', rotation: [0, -6, 0], color: SOLE });
window.gms.part('el-disc', { x: 0.062, y: 0.006, z: 0, rx: 0.058, ry: 0.044, thick: 0.012, axis: 'up', rotation: [0, 6, 0], color: SOLE });
window.gms.part('el-disc', { x: -0.062, y: 0.026, z: 0, rx: 0.052, ry: 0.038, thick: 0.028, axis: 'up', rotation: [0, -6, 0], color: BOOT });
window.gms.part('el-disc', { x: 0.062, y: 0.026, z: 0, rx: 0.052, ry: 0.038, thick: 0.028, axis: 'up', rotation: [0, 6, 0], color: BOOT });
window.gms.part('tri', { x: -0.078, y: 0.032, z: 0.026, w: 0.03, h: 0.018, thick: 0.003, axis: 'side', color: BLUE });
window.gms.part('tri', { x: 0.078, y: 0.032, z: 0.026, w: 0.03, h: 0.018, thick: 0.003, axis: 'side', color: BLUE });

// 收尾
window.__gmsBatchEnd && window.__gmsBatchEnd();
