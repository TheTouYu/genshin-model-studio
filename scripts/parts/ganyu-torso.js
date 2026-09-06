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
window.__gmsBatchEnd && window.__gmsBatchEnd();
