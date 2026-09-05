/**
 * draw-soccer-player-v3.js — 高精度足球运动员模型（仅球员 + 足球，~300 面/元件）
 *
 * 设计思考（一边做一边优化）：
 *  - 目标面数约 300：把全局生成精度 count 提到 60 → 球缝环自动细分为
 *    3×(count+1)≈183 段（更高精度），再补球员细节件凑到 ~300。
 *  - 仅聚焦球员本体：头/发/五官、球衣/领口/徽/号码/条纹/下摆、短裤/腰头/裤脚、
 *    袜/护膝、球鞋（底/面/鞋带/鞋钉）、四肢/腕带/手套、手套；足球（球面+球缝环+拼块）。
 *  - 物理正确：核心结构件命名 + gms.link 受力链 + gms.verify 硬门禁；
 *    小装饰不命名（不参与 collides，视觉贴附）。
 *  - 标定铁律：改 shape/count 重写 options 时必须保留 canvasWidthPx（已修复）。
 */
(function () {
  var sh = document.getElementById('shape');
  if (sh && sh.value !== 'cylinder') { sh.value = 'cylinder'; sh.dispatchEvent(new Event('change', { bubbles: true })); }
  var cnt = document.getElementById('count');
  if (cnt && String(cnt.value) !== '60') { cnt.value = '60'; cnt.dispatchEvent(new Event('input', { bubbles: true })); }
})();
window.gms.mode('extrude');
window.gms.clear();

/* ================= 球鞋（鞋底/鞋面/鞋带/鞋钉） ================= */
function boot(side, bx, bz, rot, sizeScale) {
  var nameS = side === 'L' ? 'Left' : 'Right';
  window.gms.part('el-disc', {
    name: nameS + 'BootSole', x: bx, y: 0.006, z: bz,
    rx: 0.065 * sizeScale, ry: 0.045, thick: 0.012, axis: 'up',
    rotation: [0, rot, 0], color: '#111318',
  });
  window.gms.part('el-disc', {
    name: nameS + 'BootUpper', x: bx, y: 0.026, z: bz,
    rx: 0.058 * sizeScale, ry: 0.040, thick: 0.028, axis: 'up',
    rotation: [0, rot, 0], color: '#20242c',
  });
  for (var li = 0; li < 2; li++) {
    window.gms.part('rod', {
      x1: bx - 0.026 * sizeScale, y1: 0.036 + li * 0.006, z: bz + 0.012,
      x2: bx + 0.026 * sizeScale, y2: 0.036 + li * 0.006, size: 0.0035, color: '#cfd4dc',
    });
  }
  for (var si = -1; si <= 2; si++) {
    var sx = si === 2 ? 0.034 * sizeScale : si * 0.02 * sizeScale;
    var sz = si === 2 ? 0.02 : 0;
    window.gms.part('disc', {
      x: bx + sx, y: 0.042, z: bz + sz, r: 0.0055, thick: 0.004, axis: 'up', color: '#2a2f38',
    });
  }
}
boot('L', -0.055, 0, -8, 1.0);
boot('R', 0.15, 0.02, -10, 1.15);

/* ================= 小腿（白袜）+ 踝带/袜条/袜口/护膝 ================= */
window.gms.part('rod', { name: 'leftShin', x1: -0.055, y1: 0.03, z: 0, x2: -0.065, y2: 0.30, z: -0.01, size: 0.052, color: '#f4f4f4' });
window.gms.part('rod', { name: 'rightShin', x1: 0.15, y1: 0.03, z: 0.02, x2: 0.14, y2: 0.27, z: 0.015, size: 0.052, color: '#f4f4f4' });
window.gms.part('disc', { x: -0.062, y: 0.05, z: -0.005, r: 0.036, thick: 0.008, axis: 'up', color: '#f4f4f4' });
window.gms.part('disc', { x: 0.145, y: 0.05, z: 0.017, r: 0.036, thick: 0.008, axis: 'up', color: '#f4f4f4' });
window.gms.part('disc', { x: -0.063, y: 0.22, z: -0.006, r: 0.034, thick: 0.006, axis: 'up', color: '#20324d' });
window.gms.part('disc', { x: 0.144, y: 0.19, z: 0.016, r: 0.034, thick: 0.006, axis: 'up', color: '#20324d' });
window.gms.part('disc', { x: -0.064, y: 0.29, z: -0.008, r: 0.034, thick: 0.012, axis: 'up', color: '#e03e56' });
window.gms.part('disc', { x: 0.142, y: 0.26, z: 0.015, r: 0.034, thick: 0.012, axis: 'up', color: '#e03e56' });
window.gms.part('disc', { x: -0.065, y: 0.30, z: 0.02, r: 0.026, thick: 0.007, axis: 'front', color: '#d93848' });
window.gms.part('disc', { x: 0.14, y: 0.27, z: 0.035, r: 0.026, thick: 0.007, axis: 'front', color: '#d93848' });
// 护胫（白色小盾牌圆盘）
window.gms.part('disc', { x: -0.063, y: 0.17, z: 0.02, r: 0.02, thick: 0.005, axis: 'front', color: '#e8e8e8' });
window.gms.part('disc', { x: 0.145, y: 0.14, z: 0.033, r: 0.02, thick: 0.005, axis: 'front', color: '#e8e8e8' });

/* ================= 大腿 ================= */
window.gms.part('rod', { name: 'leftThigh', x1: -0.065, y1: 0.30, z: -0.01, x2: -0.045, y2: 0.56, z: 0, size: 0.062, color: '#e8b184' });
window.gms.part('rod', { name: 'rightThigh', x1: 0.14, y1: 0.27, z: 0.015, x2: 0.05, y2: 0.56, z: 0, size: 0.062, color: '#e8b184' });

/* ================= 短裤（腰头/侧条/裤脚） ================= */
window.gms.part('el-disc', { name: 'shorts', x: 0, y: 0.585, z: 0, rx: 0.15, ry: 0.105, thick: 0.12, axis: 'up', color: '#20324d' });
window.gms.part('disc', { x: 0, y: 0.645, z: 0, r: 0.153, thick: 0.016, axis: 'up', color: '#16233a' });
window.gms.part('rod', { x1: -0.145, y1: 0.52, z: 0, x2: -0.145, y2: 0.64, size: 0.008, color: '#f4f4f4' });
window.gms.part('rod', { x1: 0.145, y1: 0.52, z: 0, x2: 0.145, y2: 0.64, size: 0.008, color: '#f4f4f4' });
window.gms.part('disc', { x: 0, y: 0.525, z: 0, r: 0.126, thick: 0.012, axis: 'up', color: '#1a2a44' });

/* ================= 球衣（领口/徽/号码/条纹/下摆/袖条） ================= */
window.gms.part('el-disc', { name: 'torso', x: 0, y: 0.805, z: 0, rx: 0.14, ry: 0.095, thick: 0.32, axis: 'up', color: '#d93848' });
window.gms.part('disc', { x: 0, y: 0.962, z: 0, r: 0.082, thick: 0.014, axis: 'up', color: '#f4f4f4' });
window.gms.part('disc', { name: 'badge', x: -0.05, y: 0.84, z: 0.095, r: 0.02, thick: 0.004, axis: 'front', color: '#ffffff' });
// 号码 10（正面）
window.gms.part('rod', { x1: -0.028, y1: 0.865, z: 0.098, x2: -0.028, y2: 0.80, size: 0.004, color: '#ffffff' });
window.gms.part('disc', { x: 0.012, y: 0.8325, z: 0.098, r: 0.016, thick: 0.003, axis: 'front', color: '#ffffff' });
// 号码 10（背面）
window.gms.part('rod', { x1: -0.028, y1: 0.865, z: -0.098, x2: -0.028, y2: 0.80, size: 0.004, color: '#ffffff' });
window.gms.part('disc', { x: 0.012, y: 0.8325, z: -0.098, r: 0.016, thick: 0.003, axis: 'front', color: '#ffffff' });
// 下摆
window.gms.part('disc', { x: 0, y: 0.653, z: 0, r: 0.143, thick: 0.012, axis: 'up', color: '#b52f3d' });

/* ================= 手臂（腕带/手套） ================= */
window.gms.part('rod', { name: 'upperArmL', x1: -0.125, y1: 0.93, z: 0, x2: -0.22, y2: 0.83, z: 0.03, size: 0.058, color: '#d93848' });
window.gms.part('rod', { name: 'forearmL', x1: -0.22, y1: 0.83, z: 0.03, x2: -0.285, y2: 0.73, z: 0.05, size: 0.046, color: '#e8b184' });
window.gms.part('rod', { name: 'upperArmR', x1: 0.125, y1: 0.93, z: 0, x2: 0.20, y2: 0.86, z: 0.02, size: 0.058, color: '#d93848' });
window.gms.part('rod', { name: 'forearmR', x1: 0.20, y1: 0.86, z: 0.02, x2: 0.24, y2: 0.78, z: 0.04, size: 0.046, color: '#e8b184' });
window.gms.part('disc', { x: -0.27, y: 0.755, z: 0.05, r: 0.026, thick: 0.008, axis: 'up', color: '#f4f4f4' });
window.gms.part('disc', { x: 0.228, y: 0.80, z: 0.04, r: 0.026, thick: 0.008, axis: 'up', color: '#f4f4f4' });
window.gms.part('disc', { x: -0.30, y: 0.72, z: 0.05, r: 0.02, thick: 0.018, axis: 'front', color: '#e8b184' });
window.gms.part('disc', { x: 0.252, y: 0.775, z: 0.04, r: 0.02, thick: 0.018, axis: 'front', color: '#e8b184' });

/* ================= 头（耳朵/刘海/侧发/眉/鼻/发带/雀斑） ================= */
window.gms.part('sphere', { name: 'head', x: 0, y: 1.045, z: 0, r: 0.085, color: '#e8b184' });
window.gms.part('sphere', { name: 'hair', x: 0, y: 1.08, z: -0.015, r: 0.088, color: '#4a2c17' });
// 刘海（28 根细发丝，密度更高）
for (var hi = 0; hi < 28; hi++) {
  var hx = -0.066 + (hi / 27) * 0.132;
  var hy1 = 1.115 + (hi % 3) * 0.004;
  window.gms.part('rod', {
    x1: hx, y1: hy1, z: 0.068, x2: hx + 0.004, y2: 1.052 - (hi % 4) * 0.004,
    size: 0.0035, color: '#4a2c17',
  });
}
// 侧发
window.gms.part('rod', { x1: -0.078, y1: 1.11, z: 0.0, x2: -0.082, y2: 0.995, size: 0.011, color: '#4a2c17' });
window.gms.part('rod', { x1: 0.078, y1: 1.11, z: 0.0, x2: 0.082, y2: 0.995, size: 0.011, color: '#4a2c17' });
// 耳朵
window.gms.part('disc', { x: -0.088, y: 1.045, z: 0.0, r: 0.011, thick: 0.006, axis: 'side', color: '#e8b184' });
window.gms.part('disc', { x: 0.088, y: 1.045, z: 0.0, r: 0.011, thick: 0.006, axis: 'side', color: '#e8b184' });
// 眼/眉/鼻/嘴
window.gms.part('disc', { name: 'eyeL', x: -0.028, y: 1.06, z: 0.078, r: 0.0075, thick: 0.004, axis: 'front', color: '#151515' });
window.gms.part('disc', { name: 'eyeR', x: 0.028, y: 1.06, z: 0.078, r: 0.0075, thick: 0.004, axis: 'front', color: '#151515' });
window.gms.part('rod', { x1: -0.045, y1: 1.082, z: 0.078, x2: -0.014, y2: 1.082, size: 0.0035, color: '#4a2c17' });
window.gms.part('rod', { x1: 0.014, y1: 1.082, z: 0.078, x2: 0.045, y2: 1.082, size: 0.0035, color: '#4a2c17' });
window.gms.part('disc', { x: 0, y: 1.032, z: 0.081, r: 0.008, thick: 0.004, axis: 'front', color: '#d79b74' });
window.gms.part('disc', { name: 'mouth', x: 0, y: 1.004, z: 0.078, r: 0.010, thick: 0.003, axis: 'front', color: '#8a3a2a' });
window.gms.part('disc', { x: 0, y: 1.128, z: -0.002, r: 0.09, thick: 0.008, axis: 'up', color: '#d93848' }); // 发带
for (var fi2 = 0; fi2 < 4; fi2++) {
  var fcx = fi2 % 2 ? 0.045 : -0.045, fcy = fi2 < 2 ? 1.085 : 1.055;
  window.gms.part('disc', { x: fcx, y: fcy, z: 0.078, r: 0.0045, thick: 0.002, axis: 'front', color: '#d79b74' });
}

/* ================= 足球（高精度球缝环 + 10 拼块 + 缝线） ================= */
window.gms.part('sphere', { name: 'ball', x: 0.27, y: 0.094, z: 0, r: 0.09, color: '#f6f6f6' });
window.gms.part('ring', { x: 0.27, y: 0.094, z: 0, r: 0.09, size: 0.0035, color: '#22262c' });
// 10 块黑色拼块（前/后/左右/顶 + 前上双斜 + 前下双斜 + 前中）
window.gms.part('disc', { x: 0.27, y: 0.094, z: 0.088, r: 0.024, thick: 0.003, axis: 'front', color: '#17181c' });
window.gms.part('disc', { x: 0.27, y: 0.094, z: -0.088, r: 0.024, thick: 0.003, axis: 'front', color: '#17181c' });
window.gms.part('disc', { x: 0.359, y: 0.094, z: 0.0, r: 0.020, thick: 0.003, axis: 'side', color: '#17181c' });
window.gms.part('disc', { x: 0.181, y: 0.094, z: 0.0, r: 0.020, thick: 0.003, axis: 'side', color: '#17181c' });
window.gms.part('disc', { x: 0.27, y: 0.184, z: 0.0, r: 0.020, thick: 0.003, axis: 'up', color: '#17181c' });
window.gms.part('disc', { x: 0.30, y: 0.152, z: 0.072, r: 0.014, thick: 0.002, axis: 'front', color: '#17181c' });
window.gms.part('disc', { x: 0.24, y: 0.152, z: 0.072, r: 0.014, thick: 0.002, axis: 'front', color: '#17181c' });
window.gms.part('disc', { x: 0.30, y: 0.036, z: 0.072, r: 0.014, thick: 0.002, axis: 'front', color: '#17181c' });
window.gms.part('disc', { x: 0.24, y: 0.036, z: 0.072, r: 0.014, thick: 0.002, axis: 'front', color: '#17181c' });
window.gms.part('disc', { x: 0.27, y: 0.094, z: 0.072, r: 0.020, thick: 0.002, axis: 'front', color: '#17181c' });
// 缝线（正面细杆×6）
for (var bi = 0; bi < 6; bi++) {
  var bx2 = 0.21 + bi * 0.024, by2 = 0.094 + (bi % 2 ? 0.024 : -0.024);
  window.gms.part('rod', { x1: bx2 - 0.008, y1: by2, z: 0.085, x2: bx2 + 0.008, y2: by2, size: 0.0028, color: '#22262c' });
}

/* ================= 受力链（核心结构件 + verify 硬门禁） ================= */
window.gms.link('LeftBootSole', 'LeftBootUpper', { support: 'b' });
window.gms.link('RightBootSole', 'RightBootUpper', { support: 'b' });
window.gms.link('LeftBootUpper', 'leftShin', { support: 'b' });
window.gms.link('RightBootUpper', 'rightShin', { support: 'b' });
window.gms.link('RightBootUpper', 'ball', { support: 'a' });
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
window.gms.link('torso', 'badge', { support: 'a' });

var __v = window.gms.verify();
if (!__v.ok) {
  throw new Error('VERIFY_FAIL ' + JSON.stringify({
    floating: __v.floating, collides: __v.collides,
    badLinks: __v.links.filter(function (l) { return !l.contact; }),
  }));
}
