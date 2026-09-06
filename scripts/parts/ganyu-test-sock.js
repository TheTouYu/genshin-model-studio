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
  function sockData(sign) {
    var path = [
      [sign * 0, 0.300, 0.000],
      [sign * 0, 0.220, 0.000],
      [sign * 0, 0.140, 0.000],
      [sign * 0, 0.075, 0.000],
      [sign * 0, 0.052, 0.005],
      [sign * 0, 0.040, 0.030],
      [sign * 0, 0.036, 0.060],
      [sign * 0, 0.030, 0.095],
      [sign * 0, 0.022, 0.128]
    ];
    var secs = [
      { rx: 0.034, ry: 0.034, cy: 0 }, { rx: 0.030, ry: 0.031, cy: -0.004 },
      { rx: 0.026, ry: 0.028, cy: -0.006 }, { rx: 0.022, ry: 0.024, cy: -0.004 },
      { rx: 0.024, ry: 0.022, cy: 0 }, { rx: 0.028, ry: 0.018, cy: 0.004 },
      { rx: 0.032, ry: 0.014, cy: 0.006 }, { rx: 0.036, ry: 0.012, cy: 0.006 }, { rx: 0.033, ry: 0.010, cy: 0.008 }
    ];
    return profileLoft(path, secs, 20, 20, function (i, j, t) {
      var tt = i / 20;
      if (tt < 0.052) return BLUE;
      if (tt < 0.085) return WHITE;
      if (tt < 0.125) return BLUE2;
      return WHITE;
    }, { cap: 'none', dataOnly: true });
  }
  function place(d, xOff) {
    return { vertices: d.vertices.map(function (v) { return [v[0] + xOff, v[1], v[2]]; }), faces: d.faces, colors: d.colors };
  }
  var dL = sockData(1);
  var left = place(dL, -0.088);
  var right = place(mirrorMeshData(dL), 0.088);
  window.gms.part('mesh', { mesh: left, color: '#ffffff' });
  window.gms.part('mesh', { mesh: right, color: '#ffffff' });
  // 左右脚趾列（大趾在内侧 +0.088/-0.088）
  toeBumps(-0.088, 0.022, 0.132, 0.030, 5, WHITE, 0.0060, +1);
  toeBumps(0.088, 0.022, 0.132, 0.030, 5, WHITE, 0.0060, -1);
  // 腓骨鸢尾（每只）
  [-0.088, 0.088].forEach(function (fx) {
    window.gms.part('rod', { x1: fx, y1: 0.188, z: 0.031, x2: fx, y2: 0.132, size: 0.0042, color: BLUE });
    window.gms.part('disc', { x: fx, y: 0.172, z: 0.033, r: 0.0075, thick: 0.002, axis: 'front', color: BLUE });
    window.gms.part('disc', { x: fx, y: 0.148, z: 0.033, r: 0.0075, thick: 0.002, axis: 'front', color: BLUE });
    window.gms.part('tri', { x: fx, y: 0.160, z: 0.033, w: 0.008, h: 0.010, thick: 0.002, axis: 'front', color: BLUE });
  });
  window.__gmsBatchEnd && window.__gmsBatchEnd();
})();
