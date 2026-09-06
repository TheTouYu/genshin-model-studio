/* 丝袜+脚 局部（对照袜子参考图）：袜筒(膝下到踝) + 脚(踝弯折→趾) 一体水密 mesh + 双蓝条纹 + 鸢尾纹 */
(function () { 'use strict';
  window.gms.clear();
  window.__gmsBatch = true;
  // 路径：袜口(y0.30) → 小腿 → 踝(y0.045) → 折向脚背 → 脚趾(z0.13, y0.02)
  var path = [
    [0, 0.300, 0.000],
    [0, 0.220, 0.000],
    [0, 0.140, 0.000],
    [0, 0.075, 0.000],
    [0, 0.052, 0.005],
    [0, 0.040, 0.030],
    [0, 0.036, 0.060],
    [0, 0.030, 0.095],
    [0, 0.022, 0.128]
  ];
  var radii = [
    [0.034, 0.034], [0.030, 0.031], [0.026, 0.028], [0.022, 0.024],
    [0.024, 0.022], [0.028, 0.018], [0.032, 0.014], [0.036, 0.012], [0.033, 0.010]
  ];
  var WHITE = '#f2f4f7', BLUE = '#2f6bb0', BLUE2 = '#3b7fc4';
  loftMesh(path, radii, 20, 20, function (i, j, t) {
    var tt = i / 20;
    if (tt < 0.052) return BLUE;      // 上蓝条（宽）
    if (tt < 0.085) return WHITE;     // 白缝
    if (tt < 0.125) return BLUE2;     // 下蓝条（窄）
    return WHITE;
  }, { cap: 'none' });
  // 釉口收口环（体现折叠袜口厚度）
  window.gms.part('disc', { x: 0, y: 0.302, z: 0, r: 0.036, thick: 0.010, axis: 'up', color: BLUE });
  // 腓骨鸢尾纹（蓝）—— 正/外侧小件
  (function () {
    var fy = 0.16, fz = 0.033;
    window.gms.part('rod', { x1: 0, y1: fy + 0.028, z: fz, x2: 0, y2: fy - 0.028, size: 0.0042, color: BLUE });
    window.gms.part('disc', { x: 0, y: fy + 0.012, z: fz + 0.001, r: 0.0075, thick: 0.002, axis: 'front', color: BLUE });
    window.gms.part('disc', { x: 0, y: fy - 0.012, z: fz + 0.001, r: 0.0075, thick: 0.002, axis: 'front', color: BLUE });
    window.gms.part('tri', { x: 0, y: fy, z: fz + 0.001, w: 0.008, h: 0.010, thick: 0.002, axis: 'front', color: BLUE });
  })();
  window.__gmsBatchEnd && window.__gmsBatchEnd();
})();
