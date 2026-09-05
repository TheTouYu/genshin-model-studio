/**
 * draw-ganyu-soccer-v4.js — 甘雨·足球队服三视图精准还原（装饰物 ≤3000）
 *
 * 推理记录（一边做一边优化）：
 *  - 比例：动漫女性，头略大（r=0.085）、腰细胸窄、腿长；身姿直立微开双臂（贴合三视图）。
 *  - 发丝是「面数」主要来源：用新加的 gms.part('poly')（世界坐标 3D 折线）画刘海/侧发/马尾
 *    发束——一根 poly = 一条多段杆链（N 点 → N-1 件），比逐根 rod 省笔画、密度精确可控。
 *  - 道具优化：新增 cone(10009009) 用于角尖/发尾收尖；poly 用于曲线发丝；MAX_DRAW_STROKES 500。
 *  - 颜色对照参考图：发 #a9d4f5、角 #7a3140+浅蓝尖、球衣/短裤 #f7f9fc、蓝纹 #3b6ea5、
 *    袜 #f2f4f7+蓝条、鞋 #f5f7fa+蓝、手套 #3a3f45。
 *  - 物理：结构件命名+link+verify；发丝/纹样不命名。
 */
(function () {
  var sh = document.getElementById('shape');
  if (sh && sh.value !== 'cylinder') { sh.value = 'cylinder'; sh.dispatchEvent(new Event('change', { bubbles: true })); }
  var cnt = document.getElementById('count');
  if (cnt && String(cnt.value) !== '60') { cnt.value = '60'; cnt.dispatchEvent(new Event('input', { bubbles: true })); }
})();
window.gms.mode('extrude');
window.gms.clear();

var HAIR = '#a9d4f5';
var HAIR2 = '#8fc0e9';
var SKIN = '#f3c9a7';
var HORN = '#7a3140';
var HORN_TIP = '#d8ecfa';
var WHITE = '#f7f9fc';
var BLUE = '#3b6ea5';
var BLUE_L = '#7aa8d8';
var SOCK = '#f2f4f7';
var BOOT = '#f5f7fa';
var SOLE = '#2b3a55';
var GLOVE = '#3a3f45';
var EYE = '#4a8fe0';
var MOUTH = '#c96a6a';
var RED = '#d9534f';

/* ================= 球鞋（白蓝 + 黑钉） ================= */
function boot(side, bx, rot) {
  var n = side === 'L' ? 'Left' : 'Right';
  window.gms.part('el-disc', { name: n + 'BootSole', x: bx, y: 0.006, z: 0, rx: 0.058, ry: 0.044, thick: 0.012, axis: 'up', rotation: [0, rot, 0], color: SOLE });
  window.gms.part('el-disc', { name: n + 'BootUpper', x: bx, y: 0.026, z: 0, rx: 0.052, ry: 0.038, thick: 0.028, axis: 'up', rotation: [0, rot, 0], color: BOOT });
  // 蓝色鞋头/后跟
  window.gms.part('disc', { x: bx + (side === 'L' ? 0.024 : 0.024), y: 0.03, z: 0.018, r: 0.016, thick: 0.012, axis: 'side', color: BLUE });
  // 鞋带
  for (var li = 0; li < 2; li++) {
    window.gms.part('rod', { x1: bx - 0.022, y1: 0.038 + li * 0.005, z: 0.012, x2: bx + 0.022, y2: 0.038 + li * 0.005, size: 0.003, color: BLUE_L });
  }
  // 鞋钉 ×3
  for (var si = -1; si <= 1; si++) {
    window.gms.part('disc', { x: bx + si * 0.018, y: 0.012, z: 0, r: 0.005, thick: 0.005, axis: 'up', color: '#3a3f45' });
  }
}
boot('L', -0.06, -6);
boot('R', 0.06, 6);

/* ================= 腿（白袜 + 蓝条 + 鸢尾纹，肤色大腿） ================= */
window.gms.part('rod', { name: 'leftShin', x1: -0.06, y1: 0.03, z: 0, x2: -0.065, y2: 0.34, z: -0.005, size: 0.048, color: SOCK });
window.gms.part('rod', { name: 'rightShin', x1: 0.06, y1: 0.03, z: 0, x2: 0.065, y2: 0.34, z: -0.005, size: 0.048, color: SOCK });
// 袜口蓝条（上下两条）
window.gms.part('disc', { x: -0.064, y: 0.325, z: -0.005, r: 0.034, thick: 0.010, axis: 'up', color: BLUE });
window.gms.part('disc', { x: 0.064, y: 0.325, z: -0.005, r: 0.034, thick: 0.010, axis: 'up', color: BLUE });
window.gms.part('disc', { x: -0.064, y: 0.30, z: -0.005, r: 0.035, thick: 0.006, axis: 'up', color: WHITE });
window.gms.part('disc', { x: 0.064, y: 0.30, z: -0.005, r: 0.035, thick: 0.006, axis: 'up', color: WHITE });
// 鸢尾花纹（前三束蓝笔触）
function fleur(sx, sy, sz) {
  window.gms.part('rod', { x1: sx, y1: sy - 0.03, z: sz + 0.030, x2: sx, y2: sy + 0.02, size: 0.004, color: BLUE });
  window.gms.part('rod', { x1: sx, y1: sy + 0.005, z: sz + 0.030, x2: sx - 0.014, y2: sy + 0.016, size: 0.0035, color: BLUE });
  window.gms.part('rod', { x1: sx, y1: sy + 0.005, z: sz + 0.030, x2: sx + 0.014, y2: sy + 0.016, size: 0.0035, color: BLUE });
  window.gms.part('disc', { x: sx, y: sy - 0.038, z: sz + 0.030, r: 0.006, thick: 0.002, axis: 'front', color: BLUE });
}
fleur(-0.064, 0.16, -0.005);
fleur(0.064, 0.16, -0.005);
// 大腿（肤色）
window.gms.part('rod', { name: 'leftThigh', x1: -0.065, y1: 0.34, z: -0.005, x2: -0.05, y2: 0.60, z: 0, size: 0.056, color: SKIN });
window.gms.part('rod', { name: 'rightThigh', x1: 0.065, y1: 0.34, z: -0.005, x2: 0.05, y2: 0.60, z: 0, size: 0.056, color: SKIN });

/* ================= 短裤（白 + 蓝腰/侧条/前 10） ================= */
window.gms.part('el-disc', { name: 'shorts', x: 0, y: 0.63, z: 0, rx: 0.115, ry: 0.085, thick: 0.14, axis: 'up', color: WHITE });
window.gms.part('disc', { x: 0, y: 0.70, z: 0, r: 0.118, thick: 0.013, axis: 'up', color: BLUE });
window.gms.part('rod', { x1: -0.112, y1: 0.56, z: 0, x2: -0.112, y2: 0.685, size: 0.007, color: BLUE });
window.gms.part('rod', { x1: 0.112, y1: 0.56, z: 0, x2: 0.112, y2: 0.685, size: 0.007, color: BLUE });
// 前侧 10
window.gms.part('rod', { x1: 0.052, y1: 0.665, z: 0.088, x2: 0.052, y2: 0.615, size: 0.0035, color: BLUE });
window.gms.part('disc', { x: 0.078, y: 0.64, z: 0.088, r: 0.012, thick: 0.002, axis: 'front', color: BLUE });

/* ================= 球衣（白 + 蓝领/下摆/斜纹/前后号码/背字 GANYU） ================= */
window.gms.part('el-disc', { name: 'torso', x: 0, y: 0.83, z: 0, rx: 0.10, ry: 0.062, thick: 0.24, axis: 'up', color: WHITE });
window.gms.part('disc', { x: 0, y: 0.95, z: 0, r: 0.05, thick: 0.012, axis: 'up', color: BLUE });
window.gms.part('disc', { x: 0, y: 0.715, z: 0, r: 0.105, thick: 0.010, axis: 'up', color: BLUE });
// 前斜纹（两条）
window.gms.part('rod', { x1: -0.085, y1: 0.90, z: 0.072, x2: 0.085, y2: 0.72, size: 0.010, color: BLUE });
window.gms.part('rod', { x1: -0.075, y1: 0.915, z: 0.072, x2: 0.095, y2: 0.72, size: 0.010, color: BLUE });
// 后斜纹（两条）
window.gms.part('rod', { x1: -0.085, y1: 0.90, z: -0.072, x2: 0.085, y2: 0.72, size: 0.010, color: BLUE });
window.gms.part('rod', { x1: -0.075, y1: 0.915, z: -0.072, x2: 0.095, y2: 0.72, size: 0.010, color: BLUE });
// 前胸 10
window.gms.part('rod', { x1: -0.028, y1: 0.90, z: 0.072, x2: -0.028, y2: 0.82, size: 0.004, color: BLUE });
window.gms.part('disc', { x: 0.006, y: 0.86, z: 0.072, r: 0.017, thick: 0.002, axis: 'front', color: BLUE });
// 后背 GANYU（块状字母：G A N Y U，每字 3 杆）
function ganyuLetter(x, y, letter, sz) {
  var z = -0.072;
  if (letter === 'G') {
    window.gms.part('rod', { x1: x - 0.016, y1: y + 0.012, z: z, x2: x - 0.016, y2: y - 0.012, size: 0.004, color: BLUE });
    window.gms.part('rod', { x1: x - 0.016, y1: y + 0.012, z: z, x2: x + 0.014, y2: y + 0.012, size: 0.004, color: BLUE });
    window.gms.part('rod', { x1: x - 0.016, y1: y - 0.012, z: z, x2: x + 0.014, y2: y - 0.012, size: 0.004, color: BLUE });
    window.gms.part('rod', { x1: x + 0.014, y1: y + 0.012, z: z, x2: x + 0.014, y2: y + 0.002, size: 0.004, color: BLUE });
    window.gms.part('rod', { x1: x + 0.014, y1: y + 0.002, z: z, x2: x - 0.002, y2: y + 0.002, size: 0.004, color: BLUE });
  } else if (letter === 'A') {
    window.gms.part('rod', { x1: x - 0.016, y1: y - 0.012, z: z, x2: x, y2: y + 0.014, size: 0.004, color: BLUE });
    window.gms.part('rod', { x1: x, y1: y + 0.014, z: z, x2: x + 0.016, y2: y - 0.012, size: 0.004, color: BLUE });
    window.gms.part('rod', { x1: x - 0.009, y1: y - 0.001, z: z, x2: x + 0.009, y2: y - 0.001, size: 0.004, color: BLUE });
  } else if (letter === 'N') {
    window.gms.part('rod', { x1: x - 0.016, y1: y + 0.013, z: z, x2: x - 0.016, y2: y - 0.013, size: 0.004, color: BLUE });
    window.gms.part('rod', { x1: x + 0.016, y1: y + 0.013, z: z, x2: x + 0.016, y2: y - 0.013, size: 0.004, color: BLUE });
    window.gms.part('rod', { x1: x - 0.016, y1: y + 0.013, z: z, x2: x + 0.016, y2: y - 0.013, size: 0.004, color: BLUE });
  } else if (letter === 'Y') {
    window.gms.part('rod', { x1: x - 0.016, y1: y + 0.012, z: z, x2: x, y2: y + 0.0, size: 0.004, color: BLUE });
    window.gms.part('rod', { x1: x + 0.016, y1: y + 0.012, z: z, x2: x, y2: y + 0.0, size: 0.004, color: BLUE });
    window.gms.part('rod', { x1: x, y1: y + 0.0, z: z, x2: x, y2: y - 0.013, size: 0.004, color: BLUE });
  } else if (letter === 'U') {
    window.gms.part('rod', { x1: x - 0.016, y1: y + 0.013, z: z, x2: x - 0.016, y2: y - 0.010, size: 0.004, color: BLUE });
    window.gms.part('rod', { x1: x + 0.016, y1: y + 0.013, z: z, x2: x + 0.016, y2: y - 0.010, size: 0.004, color: BLUE });
    window.gms.part('rod', { x1: x - 0.016, y1: y - 0.010, z: z, x2: x + 0.016, y2: y - 0.010, size: 0.004, color: BLUE });
  }
}
ganyuLetter(-0.06, 0.885, 'G');
ganyuLetter(-0.022, 0.885, 'A');
ganyuLetter(0.016, 0.885, 'N');
ganyuLetter(0.054, 0.885, 'Y');
ganyuLetter(0.092, 0.885, 'U');
// 背后 10
window.gms.part('rod', { x1: 0.028, y1: 0.80, z: -0.072, x2: 0.028, y2: 0.73, size: 0.005, color: BLUE });
window.gms.part('disc', { x: 0.062, y: 0.765, z: -0.072, r: 0.02, thick: 0.002, axis: 'front', color: BLUE });
// 侧边蓝色拼接（左右各两条）
window.gms.part('rod', { x1: -0.098, y1: 0.90, z: 0.02, x2: -0.098, y2: 0.72, size: 0.012, color: BLUE });
window.gms.part('rod', { x1: 0.098, y1: 0.90, z: 0.02, x2: 0.098, y2: 0.72, size: 0.012, color: BLUE });
window.gms.part('rod', { x1: -0.098, y1: 0.90, z: -0.02, x2: -0.098, y2: 0.72, size: 0.012, color: BLUE });
window.gms.part('rod', { x1: 0.098, y1: 0.90, z: -0.02, x2: 0.098, y2: 0.72, size: 0.012, color: BLUE });

/* ================= 手臂（白袖 + 蓝袖口 + 肤色前臂 + 黑手套） ================= */
window.gms.part('rod', { name: 'upperArmL', x1: -0.102, y1: 0.90, z: 0, x2: -0.145, y2: 0.80, z: 0.01, size: 0.05, color: WHITE });
window.gms.part('rod', { name: 'upperArmR', x1: 0.102, y1: 0.90, z: 0, x2: 0.145, y2: 0.80, z: 0.01, size: 0.05, color: WHITE });
window.gms.part('disc', { x: -0.145, y: 0.80, z: 0.01, r: 0.027, thick: 0.009, axis: 'up', color: BLUE });
window.gms.part('disc', { x: 0.145, y: 0.80, z: 0.01, r: 0.027, thick: 0.009, axis: 'up', color: BLUE });
window.gms.part('rod', { name: 'forearmL', x1: -0.145, y1: 0.80, z: 0.01, x2: -0.175, y2: 0.70, z: 0.02, size: 0.04, color: SKIN });
window.gms.part('rod', { name: 'forearmR', x1: 0.145, y1: 0.80, z: 0.01, x2: 0.175, y2: 0.70, z: 0.02, size: 0.04, color: SKIN });
window.gms.part('disc', { x: -0.185, y: 0.685, z: 0.02, r: 0.02, thick: 0.016, axis: 'front', color: GLOVE });
window.gms.part('disc', { x: 0.185, y: 0.685, z: 0.02, r: 0.02, thick: 0.016, axis: 'front', color: GLOVE });

/* ================= 颈 + 头 + 五官 ================= */
window.gms.part('rod', { x1: 0, y1: 0.945, z: 0, x2: 0, y2: 0.985, size: 0.03, color: SKIN });
window.gms.part('sphere', { name: 'head', x: 0, y: 1.05, z: 0, r: 0.085, color: SKIN });
window.gms.part('disc', { name: 'eyeL', x: -0.028, y: 1.062, z: 0.079, r: 0.010, thick: 0.0035, axis: 'front', color: EYE });
window.gms.part('disc', { name: 'eyeR', x: 0.028, y: 1.062, z: 0.079, r: 0.010, thick: 0.0035, axis: 'front', color: EYE });
window.gms.part('disc', { x: -0.031, y: 1.066, z: 0.0815, r: 0.0035, thick: 0.001, axis: 'front', color: '#ffffff' });
window.gms.part('disc', { x: 0.025, y: 1.066, z: 0.0815, r: 0.0035, thick: 0.001, axis: 'front', color: '#ffffff' });
// 上睫毛
window.gms.part('rod', { x1: -0.040, y1: 1.074, z: 0.080, x2: -0.016, y2: 1.074, size: 0.0038, color: '#4a3f66' });
window.gms.part('rod', { x1: 0.016, y1: 1.074, z: 0.080, x2: 0.040, y2: 1.074, size: 0.0038, color: '#4a3f66' });
window.gms.part('rod', { x1: -0.044, y1: 1.090, z: 0.078, x2: -0.012, y2: 1.090, size: 0.004, color: HAIR2 });
window.gms.part('rod', { x1: 0.012, y1: 1.090, z: 0.078, x2: 0.044, y2: 1.090, size: 0.004, color: HAIR2 });
window.gms.part('disc', { x: 0, y: 1.042, z: 0.083, r: 0.006, thick: 0.003, axis: 'front', color: SKIN });
window.gms.part('disc', { name: 'mouth', x: 0, y: 1.012, z: 0.079, r: 0.008, thick: 0.002, axis: 'front', color: MOUTH });
window.gms.part('disc', { x: -0.088, y: 1.045, z: 0.0, r: 0.010, thick: 0.005, axis: 'side', color: SKIN });
window.gms.part('disc', { x: 0.088, y: 1.045, z: 0.0, r: 0.010, thick: 0.005, axis: 'side', color: SKIN });

/* ================= 头发（大体积 + 刘海 + 侧发 + 呆毛 + 角 + 长马尾） ================= */
window.gms.part('sphere', { name: 'hair', x: 0, y: 1.08, z: -0.025, r: 0.092, color: HAIR });
// 刘海（26 束，4 点微曲 poly → 每束 3 节，更长更蓬）
for (var bi = 0; bi < 26; bi++) {
  var hx = -0.078 + (bi / 25) * 0.156;
  var hEnd = 1.036 - (bi % 4) * 0.007;
  var fx = hx + ((bi % 5) - 2) * 0.003;
  window.gms.part('poly', {
    points: [[hx, 1.115, 0.052], [hx + (fx - hx) * 0.35, (1.115 + hEnd) / 2, 0.070], [hx + (fx - hx) * 0.75, (1.15 + hEnd) / 2, 0.076], [fx, hEnd, 0.080]],
    size: 0.0085, color: bi % 2 ? HAIR : HAIR2
  });
}
// 侧发（每侧 8 束，长至锁骨）
for (var li2 = 0; li2 < 8; li2++) {
  var sx2 = li2 < 4 ? -0.092 - li2 * 0.004 : 0.092 + (li2 - 4) * 0.004;
  var sdir = sx2 < 0 ? -1 : 1;
  var sy = 1.10 - li2 * 0.010;
  window.gms.part('poly', {
    points: [[sx2, sy, 0.03], [sx2 + sdir * 0.010, sy - 0.05, 0.052], [sx2 + sdir * 0.006, sy - 0.11, 0.048], [sx2 + sdir * 0.012, sy - 0.17, 0.04]],
    size: 0.011, color: li2 % 2 ? HAIR : HAIR2
  });
}
// 呆毛（弯向前的细枝）
window.gms.part('poly', {
  points: [[0, 1.16, 0.0], [0.006, 1.185, 0.02], [0.002, 1.19, 0.045], [-0.005, 1.175, 0.055]],
  size: 0.005, color: HAIR
});
// 双角（暗红 + 浅蓝尖；poly 曲线 4 节）
function horn(sideSign) {
  var bx = 0.045 * sideSign;
  window.gms.part('poly', {
    points: [[bx, 1.095, 0.0], [bx + 0.014 * sideSign, 1.15, -0.02], [bx + 0.018 * sideSign, 1.20, -0.045], [bx + 0.008 * sideSign, 1.235, -0.065]],
    size: 0.015, color: HORN
  });
  window.gms.part('cone', { x: bx + 0.008 * sideSign, y: 1.262, z: -0.065, r: 0.013, h: 0.04, axis: 'up', color: HORN_TIP });
}
horn(-1);
horn(1);
// 马尾主体（后腰长）：核心 15 节点曲线 + 10 层椭圆盘（左右轻摆）+ 70 束发丝
window.gms.part('poly', {
  points: [
    [0, 1.05, -0.09], [0.012, 0.98, -0.10], [-0.012, 0.90, -0.105], [0.014, 0.82, -0.112],
    [-0.014, 0.74, -0.113], [0.006, 0.66, -0.108], [-0.010, 0.58, -0.102], [0.012, 0.50, -0.096],
    [-0.008, 0.43, -0.09], [0.0, 0.38, -0.085], [0.008, 0.34, -0.08]
  ],
  size: 0.024, color: HAIR
});
for (var pi = 0; pi < 10; pi++) {
  var py = 1.03 - pi * 0.072;
  var pr = 0.058 - pi * 0.0045;
  var wob = pi % 2 ? 0.008 : -0.008;
  window.gms.part('el-disc', { x: wob, y: py, z: -0.095, rx: pr, ry: pr * 0.8, thick: 0.062, axis: 'up', color: pi % 2 ? HAIR2 : HAIR });
}
for (var si3 = 0; si3 < 70; si3++) {
  var ang = (si3 / 70) * Math.PI * 2;
  var ox = Math.cos(ang) * 0.052;
  var oz = -0.095 + Math.sin(ang) * 0.042;
  var k = (si3 % 7);
  var tipy = 0.36 + (si3 % 5) * 0.012;
  var tipx = ox * 0.5 + (k - 3) * 0.006;
  var tipz = -0.078 + (si3 % 4) * 0.003;
  window.gms.part('poly', {
    points: [
      [ox, 1.03, oz],
      [ox * 0.9 + (si3 % 3) * 0.004, 0.92, oz + 0.002],
      [ox * 0.75 + ((si3 % 2) ? 0.006 : -0.006), 0.78, oz + 0.004],
      [ox * 0.6 + (k % 3) * 0.008, 0.58, oz + 0.002],
      [tipx, tipy, tipz]
    ],
    size: 0.0055, color: si3 % 2 ? HAIR : HAIR2
  });
}
// 马尾发圈（红）
window.gms.part('disc', { x: 0, y: 1.045, z: -0.09, r: 0.035, thick: 0.012, axis: 'up', color: RED });
// 耳侧红缨（参考图耳侧红色饰穗）
window.gms.part('rod', { x1: -0.095, y1: 1.08, z: 0.01, x2: -0.10, y2: 1.0, size: 0.005, color: RED });
window.gms.part('rod', { x1: 0.095, y1: 1.08, z: 0.01, x2: 0.10, y2: 1.0, size: 0.005, color: RED });
window.gms.part('disc', { x: -0.101, y: 1.0, z: 0.01, r: 0.005, thick: 0.003, axis: 'up', color: WHITE });
window.gms.part('disc', { x: 0.101, y: 1.0, z: 0.01, r: 0.005, thick: 0.003, axis: 'up', color: WHITE });

/* ================= 受力链（结构件 + verify） ================= */
window.gms.link('LeftBootSole', 'LeftBootUpper', { support: 'b' });
window.gms.link('RightBootSole', 'RightBootUpper', { support: 'b' });
window.gms.link('LeftBootUpper', 'leftShin', { support: 'b' });
window.gms.link('RightBootUpper', 'rightShin', { support: 'b' });
window.gms.link('leftShin', 'leftThigh', { support: 'b' });
window.gms.link('rightShin', 'rightThigh', { support: 'b' });
window.gms.link('leftThigh', 'shorts', { support: 'b' });
window.gms.link('rightThigh', 'shorts', { support: 'b' });
window.gms.link('shorts', 'torso', { support: 'b' });
window.gms.link('torso', 'upperArmL', { support: 'a' });
window.gms.link('torso', 'upperArmR', { support: 'a' });
window.gms.link('upperArmL', 'forearmL', { support: 'a' });
window.gms.link('upperArmR', 'forearmR', { support: 'a' });
window.gms.link('torso', 'head', { support: 'a' });
window.gms.link('head', 'hair', { support: 'a' });
window.gms.link('head', 'eyeL', { support: 'a' });
window.gms.link('head', 'eyeR', { support: 'a' });
window.gms.link('head', 'mouth', { support: 'a' });

var __v = window.gms.verify();
if (!__v.ok) {
  throw new Error('VERIFY_FAIL ' + JSON.stringify({
    floating: __v.floating, collides: __v.collides,
    badLinks: __v.links.filter(function (l) { return !l.contact; }),
  }));
}
