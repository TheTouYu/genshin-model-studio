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
