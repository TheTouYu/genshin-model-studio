/* 19b-demo：脚部精细对齐（踝以下放大）——趾间沟槽/脚背斜纹/踝折纹/跟球足弓 */
(function () { 'use strict';
  window.gms.clear();
  window.__gmsBatch = true;
  var WHITE = '#f2f4f7';
  function footData() {
    var path = [
      [0, 0.115, 0.000], [0, 0.085, 0.000], [0, 0.060, 0.000],
      [0, 0.048, 0.004], [0, 0.040, 0.020], [0, 0.036, 0.042],
      [0, 0.032, 0.072], [0, 0.028, 0.102], [0, 0.024, 0.130]
    ];
    var secs = [
      { rx: 0.021, ry: 0.021, cy: 0 },
      { rx: 0.020, ry: 0.020, cy: 0 },
      { rx: 0.023, ry: 0.019, cy: 0.003, ryB: 1.0 },
      { rx: 0.027, ry: 0.019, cy: 0.005, ryB: 0.92 },   // 跟球
      { rx: 0.031, ry: 0.016, cy: 0.007, ryB: 0.82 },   // 足弓抬升
      { rx: 0.034, ry: 0.014, cy: 0.008, ryB: 0.78 },
      { rx: 0.036, ry: 0.013, cy: 0.008, ryB: 0.88 },   // 蹠垫
      { rx: 0.037, ry: 0.012, cy: 0.009, ryB: 1.0 },
      { rx: 0.034, ry: 0.011, cy: 0.010, ryB: 1.0 }
    ];
    return profileLoft(path, secs, 30, 34, function () { return WHITE; }, {
      cap: 'none', dataOnly: true,
      toe: { n: 5, amp: 0.55, frac: 0.42 },
      rings: [ { t: 0.09, amp: 0.06, w: 0.025 }, { t: 0.14, amp: 0.065, w: 0.03 }, { t: 0.195, amp: 0.055, w: 0.03 }, { t: 0.25, amp: 0.05, w: 0.035 } ],
      creases: { t0: 0.06, t1: 0.85, lines: [ { k1: 0.35, k2: 6.0, amp: 0.11, w: 0.035 }, { k1: -0.35, k2: 5.2, amp: 0.08, w: 0.03 } ] }
    });
  }
  var dL = footData();
  window.gms.part('mesh', { mesh: dL, color: '#ffffff' });
  window.gms.part('mesh', { mesh: mirrorMeshData(dL), color: '#ffffff' });
  window.__gmsBatchEnd && window.__gmsBatchEnd();
})();
