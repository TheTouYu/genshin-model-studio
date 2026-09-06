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
    [0, 0.040, -0.004], [0, 0.040, 0], [0, 0.032, 0.014], [0, 0.028, 0.045],
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
  var d = profileLoft(path, secs, 44, 48, function () { return '#e8e8ec'; },
    { cap: 'none', dataOnly: true,
      toes: { frac: 0.30, amp: 0.24, list: [
        { c: Math.PI * 1.62, w: 0.42, len: 1.00, dy: 0.012 },
        { c: Math.PI * 1.34, w: 0.34, len: 0.94, dy: 0.008 },
        { c: Math.PI * 1.08, w: 0.30, len: 0.86, dy: 0.005 },
        { c: Math.PI * 0.84, w: 0.28, len: 0.78, dy: 0.003 },
        { c: Math.PI * 0.60, w: 0.28, len: 0.70, dy: 0.002 } ] },
      bumps: [
        { t: 0.10, th: Math.PI * 1.5, amp: 0.10, w: 0.030, wt: 0.7 },   // 内踝（左足内侧 +x，较高大）
        { t: 0.14, th: Math.PI * 0.5, amp: 0.055, w: 0.028, wt: 0.7 },  // 外踝（较小，偏低）
        { t: 0.20, th: Math.PI, amp: -0.085, w: 0.022, wt: 0.6 },       // 跟腱收窄（后侧）
        { t: 0.27, th: Math.PI, amp: 0.06, w: 0.030, wt: 0.9 }          // 跟后凸
      ] });
  window.gms.part('mesh', { mesh: d, color: '#e8e8ec' });
  window.__GMS_CHECK__ = meshCheck(d);
  window.__gmsBatchEnd && window.__gmsBatchEnd();
})();
