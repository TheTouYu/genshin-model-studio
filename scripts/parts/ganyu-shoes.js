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
window.__gmsBatchEnd && window.__gmsBatchEnd();
