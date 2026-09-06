/* 12-demo：不对称截面 + cap 策略 —— 小腿肚后凸(cx/cy 偏心)/踝收窄；三档 cap 对照 */
(function () { 'use strict';
  window.gms.clear();
  window.__gmsBatch = true;
  var WH = '#f2f4f7', BL = '#2f6bb0';
  function leg(xOff, capStr) {
    var path = [[xOff, 0.34, 0], [xOff, 0.26, 0], [xOff, 0.20, 0], [xOff, 0.13, 0], [xOff, 0.07, 0], [xOff, 0.045, 0]];
    var secs = [
      { rx: 0.036, ry: 0.036, cy: 0 },
      { rx: 0.033, ry: 0.040, cy: -0.008 },   // 小腿肚后凸（cy 负=向后）
      { rx: 0.028, ry: 0.030, cy: -0.004 },
      { rx: 0.022, ry: 0.024, cy: 0 },
      { rx: 0.019, ry: 0.021, cy: 0 },        // 踝收窄
      { rx: 0.020, ry: 0.022, cy: 0 }
    ];
    profileLoft(path, secs, 14, 18, function (i, j, t) {
      if (capStr === 'stripe' && t < 0.30) return BL;   // 顶部条纹区（对照）
      return WH;
    }, { cap: capStr });
  }
  leg(-0.075, 'none');
  leg(0.0, 'both');
  leg(0.075, 'stripe');
  window.__gmsBatchEnd && window.__gmsBatchEnd();
})();
