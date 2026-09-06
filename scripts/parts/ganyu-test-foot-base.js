/* R1：参数化基础脚型（灰模，无丝袜/褶皱/材质）——比例校准用 */
(function () { 'use strict';
  window.gms.clear();
  window.__gmsBatch = true;
  var P = {
    foot_length: 0.142,      // 跟后→趾尖总长
    ankle_height: 0.058,     // 踝顶到地
    ankle_width: 0.026,
    achilles_width: 0.013,
    heel_width: 0.032,       // 跟宽
    heel_projection: 0.016,  // 跟后凸
    instep_height: 0.031,    // 背高（踝前最高）
    arch_depth: 0.011,       // 足弓内侧深
    forefoot_width: 0.038,
    ball_spread: 0.042,      // 趾根横向展开
    toe_total: 0.024         // 趾总长（圆钝收尾）
  };
  var zHeel = -0.02, zToe = P.foot_length - 0.02;
  var path = [
    [0, P.ankle_height + 0.02, 0], [0, P.ankle_height, 0], [0, P.ankle_height * 0.78, 0],
    [0, 0.040, 0], [0, 0.032, 0.014], [0, 0.028, 0.045],
    [0, 0.024, 0.080],
    [0, 0.020, zToe - 0.012], [0, 0.014, zToe]
  ];
  var secs = [
    { rx: P.ankle_width * 0.34, ry: P.ankle_width * 0.34, cy: 0 },
    { rx: P.ankle_width * 0.44, ry: P.ankle_width * 0.46, cy: 0 },
    { rx: P.ankle_width * 0.50, ry: P.ankle_width * 0.52, cy: -0.002 },
    { rx: P.heel_width * 0.50, ry: P.heel_width * 0.52, cy: 0.004 },
    { rx: P.heel_width * 0.56, ry: P.heel_width * 0.52, cy: 0.008, ryB: 0.92 },
    { rx: P.forefoot_width * 0.52, ry: P.instep_height * 0.52, cy: P.instep_height * 0.28, ryB: 0.60 },
    { rx: P.forefoot_width * 0.62, ry: P.instep_height * 0.46, cy: P.instep_height * 0.26, ryB: 0.78 },
    { rx: P.ball_spread * 0.62, ry: P.instep_height * 0.36, cy: P.instep_height * 0.20, ryB: 0.95 },
    { rx: P.ball_spread * 0.52, ry: P.instep_height * 0.24, cy: P.instep_height * 0.18, ryB: 1.0 }
  ];
  var d = profileLoft(path, secs, 32, 36, function () { return '#e8e8ec'; },
    { cap: 'none', dataOnly: true });
  window.gms.part('mesh', { mesh: d, color: '#e8e8ec' });
  window.__gmsBatchEnd && window.__gmsBatchEnd();
})();
