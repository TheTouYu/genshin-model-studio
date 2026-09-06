/* R5：灰模 base + 丝袜薄壳（offset 1.6mm 贴合；小腿段+袜口双蓝带；轮廓透出） */
(function () { 'use strict';
  window.gms.clear();
  window.__gmsBatch = true;
  var GRAY='#d9d9de', WHITE='#f2f4f7', BLUE='#2f6bb0', BLUE2='#3b7fc4';
  var P = { foot_length:0.142, ankle_height:0.058, ankle_width:0.026, achilles_width:0.013,
            heel_width:0.032, heel_projection:0.016, instep_height:0.031, arch_depth:0.011,
            forefoot_width:0.038, ball_spread:0.042, toe_total:0.024 };
  var zHeel=-0.02, zToe=P.foot_length-0.02;
  function baseData(off, colFn, extraBumps) {
    var path = [
      [0, 0.21, 0], [0, 0.17, 0], [0, 0.13, 0], [0, 0.10, 0],
      [0, P.ankle_height+0.02, 0], [0, P.ankle_height, 0], [0, P.ankle_height*0.78, 0],
      [0, 0.040, -0.004], [0, 0.040, 0], [0, 0.032, 0.014], [0, 0.028, 0.045],
      [0, 0.024, 0.080], [0, 0.020, zToe-0.012], [0, 0.014, zToe]
    ];
    var secs = [
      { rx:0.030+off, ry:0.031+off, cy:-0.006 }, { rx:0.028+off, ry:0.030+off, cy:-0.006 },
      { rx:0.025+off, ry:0.027+off, cy:-0.004 }, { rx:0.023+off, ry:0.024+off, cy:0 },
      { rx:P.ankle_width*0.34+off, ry:P.ankle_width*0.34+off, cy:0 },
      { rx:P.ankle_width*0.44+off, ry:P.ankle_width*0.46+off, cy:0 },
      { rx:P.ankle_width*0.50+off, ry:P.ankle_width*0.52+off, cy:-0.002 },
      { rx:P.heel_width*0.50+off, ry:P.heel_width*0.52+off, cy:0.004 },
      { rx:P.heel_width*0.56+off, ry:P.heel_width*0.52+off, cy:0.008, ryB:0.92 },
      { rx:P.forefoot_width*0.52+off, ry:P.instep_height*0.52+off, cy:P.instep_height*0.28, ryB:0.60 },
      { rx:P.forefoot_width*0.62+off, ry:P.instep_height*0.46+off, cy:P.instep_height*0.26, ryB:0.78 },
      { rx:P.ball_spread*0.62+off, ry:P.instep_height*0.36+off, cy:P.instep_height*0.20, ryB:0.95 },
      { rx:P.ball_spread*0.52+off, ry:P.instep_height*0.24+off, cy:P.instep_height*0.18, ryB:1.0 },
      { rx:P.ball_spread*0.36+off, ry:P.instep_height*0.12+off, cy:P.instep_height*0.14, ryB:1.0 }
    ];
    return profileLoft(path, secs, 46, 48, colFn, {
      cap:'none', dataOnly:true,
      toes:{ frac:0.30, amp:0.24, list:[
        { c:Math.PI*1.62, w:0.42, len:1.00, dy:0.012 },
        { c:Math.PI*1.34, w:0.34, len:0.94, dy:0.008 },
        { c:Math.PI*1.08, w:0.30, len:0.86, dy:0.005 },
        { c:Math.PI*0.84, w:0.28, len:0.78, dy:0.003 },
        { c:Math.PI*0.60, w:0.28, len:0.70, dy:0.002 } ] },
bumps:[ { t:0.145, th:Math.PI*1.5, amp:0.10, w:0.030, wt:0.7 },
        { t:0.175, th:Math.PI*0.5, amp:0.055, w:0.028, wt:0.7 },
        { t:0.215, th:Math.PI, amp:-0.085, w:0.022, wt:0.6 },
        { t:0.27,  th:Math.PI, amp:0.06,  w:0.030, wt:0.9 } ].concat(extraBumps || [])
    });
  }
  var base = baseData(0, function(){ return GRAY; });
  var WK = [
    // 踝前压缩褶群（脚背弯折压缩；短弧、错位、不规则；深度≈0.0012m≈amp0.055*0.022）
    { t:0.345, th:0.0,  amp:0.055, w:0.010, wt:0.55, irreg:0.7 },
    { t:0.372, th:0.22, amp:0.050, w:0.009, wt:0.50, irreg:0.8 },
    { t:0.352, th:-0.28, amp:0.045, w:0.008, wt:0.45, irreg:0.9 },
    // 趾根放射褶（趾弯压缩；每趾根短褶，长度/角度各异）
    { t:0.760, th:Math.PI*1.62, amp:0.050, w:0.009, wt:0.36, irreg:0.6 },
    { t:0.775, th:Math.PI*1.34, amp:0.045, w:0.008, wt:0.34, irreg:0.7 },
    { t:0.788, th:Math.PI*1.08, amp:0.042, w:0.008, wt:0.33, irreg:0.7 },
    { t:0.800, th:Math.PI*0.84, amp:0.040, w:0.007, wt:0.32, irreg:0.8 },
    { t:0.810, th:Math.PI*0.60, amp:0.038, w:0.007, wt:0.32, irreg:0.8 },
    // 袜口微松褶（束口下方；仅局部弧）
    { t:0.062, th:2.6, amp:0.038, w:0.012, wt:0.75, irreg:0.55 }
  ];
  var sockData = baseData(0.0016, function(i,j,t){
    if (t < 0.052) return BLUE;         // 袜口上蓝
    if (t < 0.085) return WHITE;
    if (t < 0.125) return BLUE2;        // 第二蓝
    return WHITE;
  }, WK);
  // base 仅取腿上段露出（皮肤）+ 其余被袜遮住看不见——直接把 base 全放（色彩区分）
  window.gms.part('mesh', { mesh: base, color: GRAY });
  window.gms.part('mesh', { mesh: sockData, color: WHITE });
  window.__GMS_CHECK__ = { base: meshCheck(base), sock: meshCheck(sockData) };
  window.__gmsBatchEnd && window.__gmsBatchEnd();
})();
