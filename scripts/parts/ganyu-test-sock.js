/* 14-demo：完整袜+脚（腿→膝→小腿肚→踝→跟→弓→趾）单网格 + 分区着色(皮肤/袜/三道条纹) + 趾列 + 缝线/折边/踝皱褶 */
(function () { 'use strict';
  window.gms.clear();
  window.__gmsBatch = true;
  var SKIN = '#f3c9a7', WHITE = '#f2f4f7', WHITE2 = '#dfe6ee', BLUE = '#2f6bb0', BLUE2 = '#3b7fc4', SEAM = '#c9d6e8';
  function legData() {
    var path = [
      [0, 0.345, 0.000], [0, 0.300, 0.000], [0, 0.260, 0.000],
      [0, 0.210, 0.000], [0, 0.170, 0.000], [0, 0.120, 0.000],
      [0, 0.075, 0.000], [0, 0.055, 0.004], [0, 0.042, 0.018],
      [0, 0.036, 0.040], [0, 0.032, 0.070], [0, 0.028, 0.100], [0, 0.024, 0.128]
    ];
    var secs = [
      { rx: 0.040, ry: 0.040, cy: 0 },
      { rx: 0.037, ry: 0.038, cy: -0.003 },
      { rx: 0.034, ry: 0.040, cy: -0.009 },   // 小腿肚后凸
      { rx: 0.029, ry: 0.033, cy: -0.007 },
      { rx: 0.026, ry: 0.029, cy: -0.004 },
      { rx: 0.022, ry: 0.024, cy: -0.002 },
      { rx: 0.019, ry: 0.021, cy: 0 },        // 跟腱收窄+踝
      { rx: 0.021, ry: 0.019, cy: 0.002 },
      { rx: 0.026, ry: 0.016, cy: 0.004 },    // 跟部
      { rx: 0.030, ry: 0.013, cy: 0.006 },
      { rx: 0.034, ry: 0.012, cy: 0.006 },    // 跖部
      { rx: 0.036, ry: 0.011, cy: 0.007 },
      { rx: 0.032, ry: 0.009, cy: 0.008 }     // 趾端
    ];
    return profileLoft(path, secs, 36, 30, function (i, j, t) {
      if (t < 0.070) return SKIN;            // 膝上皮肤
      if (t < 0.105) return BLUE;            // 上蓝条（宽）
      if (t < 0.135) return WHITE;           // 白缝
      if (t < 0.175) return BLUE2;           // 下蓝条（窄）
      return WHITE;
    }, { cap: 'none', dataOnly: true, toe: { n: 5, amp: 0.20, frac: 0.30 }, rings: [ { t: 0.545, amp: 0.055, w: 0.018 }, { t: 0.585, amp: 0.05, w: 0.018 } ] });
  }
  function place(d, xOff) {
    return { vertices: d.vertices.map(function (v) { return [v[0] + xOff, v[1], v[2]]; }), faces: d.faces, colors: d.colors };
  }
  var dL = legData();
  [-0.088, 0.088].forEach(function (fx) {
    var d = fx < 0 ? place(dL, fx) : place(mirrorMeshData(dL), fx);
    window.gms.part('mesh', { mesh: d, color: '#ffffff' });
        // 袜口折边（细蓝环）
    window.gms.part('disc', { x: fx, y: 0.293, z: -0.004, r: 0.0375, thick: 0.008, axis: 'up', color: BLUE });
    // 腓骨鸢尾
    window.gms.part('rod', { x1: fx, y1: 0.210, z: 0.030, x2: fx, y2: 0.150, size: 0.0040, color: BLUE });
    window.gms.part('disc', { x: fx, y: 0.192, z: 0.032, r: 0.0072, thick: 0.002, axis: 'front', color: BLUE });
    window.gms.part('disc', { x: fx, y: 0.166, z: 0.032, r: 0.0072, thick: 0.002, axis: 'front', color: BLUE });
    window.gms.part('tri', { x: fx, y: 0.179, z: 0.032, w: 0.008, h: 0.010, thick: 0.002, axis: 'front', color: BLUE });
    // 脚背缝线 + 踝部皱褶（细线）
    window.gms.part('rod', { x1: fx, y1: 0.028, z: 0.030, x2: fx, y2: 0.020, z2: 0.075, size: 0.0020, color: SEAM });
  });
  window.__gmsBatchEnd && window.__gmsBatchEnd();
})();
