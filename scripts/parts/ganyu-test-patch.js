/* 复杂局部（用户审核版）：球员胸-腰微曲承托面 + 蓝斜襟 + 10 + 金藤 + 盾徽 + 凸点 */
(function () { 'use strict';
  var PI2 = Math.PI * 2;
  var WHITE = '#eef2f7', BLUE = '#3b6ea5', GOLD = '#c9a86a';
  function _n(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function quad(c, n, w, h, color, thick) {
    window.gms.part('quad', { x: c[0], y: c[1], z: c[2], w: w, h: h, normal: n, color: color, thick: thick });
  }
  function surface(rings, u, colorFn, thick) {
    var SUB = 3;
    for (var i = 0; i < rings.length - 1; i++) {
      var A = rings[i], B = rings[i + 1], Acx = A.cx || 0, Bcx = B.cx || 0;
      for (var j = 0; j < u; j++) {
        var t0 = (j * PI2) / u, t1 = ((j + 1) * PI2) / u, tm = (t0 + t1) / 2;
        function P(r, t) { return [r.cx + Math.cos(t) * r.rx, r.y, r.cz + Math.sin(t) * r.ry]; }
        function mixR(f) {
          return { y: A.y + (B.y - A.y) * f, rx: A.rx + (B.rx - A.rx) * f, ry: A.ry + (B.ry - A.ry) * f,
                   cx: Acx + (Bcx - Acx) * f, cz: (A.cz || -0.02) + ((B.cz || -0.02) - (A.cz || -0.02)) * f };
        }
        for (var si = 0; si < SUB; si++) for (var sj = 0; sj < SUB; sj++) {
          var R0 = mixR(sj / SUB), R1 = mixR((sj + 1) / SUB);
          var u0 = t0 + (t1 - t0) * (si / SUB), u1 = t0 + (t1 - t0) * ((si + 1) / SUB), umid = (u0 + u1) / 2;
          var p0 = P(R0, u0), p1 = P(R0, u1), p2 = P(R1, u1), p3 = P(R1, u0);
          var nml = _n([Math.cos(umid) / (R0.rx || 1), 0, Math.sin(umid) / (R0.ry || 1)]);
          var c = [(p0[0] + p1[0] + p2[0] + p3[0]) / 4, R0.y + (R1.y - R0.y) / 2, (p0[2] + p1[2] + p2[2] + p3[2]) / 4];
          var w = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
          var h = Math.hypot(p3[0] - p0[0], R1.y - R0.y, p3[2] - p0[2]);
          quad(c, nml, Math.max(w, 0.0005) * 1.03, Math.max(h, 0.0005) * 1.03, colorFn(i, j, tm), thick);
        }
      }
    }
  }
  window.gms.clear();
  window.__gmsBatch = true;

  var rings = [
    { y: 0.985, cx: 0, cz: -0.02, rx: 0.0645, ry: 0.0300 },
    { y: 0.960, cx: 0, cz: -0.02, rx: 0.0635, ry: 0.0295 },
    { y: 0.935, cx: 0, cz: -0.02, rx: 0.0625, ry: 0.0290 },
    { y: 0.910, cx: 0, cz: -0.02, rx: 0.0615, ry: 0.0285 },
    { y: 0.885, cx: 0, cz: -0.02, rx: 0.0610, ry: 0.0285 },
    { y: 0.860, cx: 0, cz: -0.02, rx: 0.0600, ry: 0.0280 },
    { y: 0.835, cx: 0, cz: -0.02, rx: 0.0560, ry: 0.0275 },
    { y: 0.810, cx: 0, cz: -0.02, rx: 0.0525, ry: 0.0275 },
    { y: 0.785, cx: 0, cz: -0.02, rx: 0.0500, ry: 0.0270 },
    { y: 0.760, cx: 0, cz: -0.02, rx: 0.0475, ry: 0.0270 },
    { y: 0.735, cx: 0, cz: -0.02, rx: 0.0465, ry: 0.0270 },
    { y: 0.715, cx: 0, cz: -0.02, rx: 0.0460, ry: 0.0270 },
    { y: 0.700, cx: 0, cz: -0.02, rx: 0.0470, ry: 0.0270 },
    { y: 0.690, cx: 0, cz: -0.02, rx: 0.0480, ry: 0.0270 }
  ];
  var U = 22;
  var C1 = '#dce8f4', C2 = '#8fb4dd', C3 = '#4a7fb5', C4 = '#2f5c92';
  surface(rings, U, function (i, j, tm) {
    var front = Math.abs(tm - Math.PI / 2) < Math.PI / 2.2;
    var d = ((tm - Math.PI / 2) / (Math.PI / 1.1)) + (i / (rings.length - 1)) * 1.0 + 0.35;
    if (front) {
      if (d < 0.28) return C1;
      if (d < 0.42) return C2;
      if (d < 0.58) return C3;
      if (d < 0.80) return C4;
      return C1;
    }
    var side = Math.abs(tm) < Math.PI / 6 || Math.abs(tm - Math.PI) < Math.PI / 6;
    return side ? C4 : C1;
  }, 0.002);

  var fz = 0.011;
  // 胸前 10（白描边 + 蓝芯）
  window.gms.part('disc', { x: 0.006, y: 0.858, z: fz, r: 0.028, thick: 0.0018, axis: 'front', color: WHITE });
  window.gms.part('disc', { x: 0.006, y: 0.858, z: fz + 0.0012, r: 0.024, thick: 0.0018, axis: 'front', color: C3 });
  window.gms.part('rod', { x1: -0.036, y1: 0.900, z: fz, x2: -0.036, y2: 0.826, size: 0.0075, color: WHITE });
  window.gms.part('rod', { x1: -0.036, y1: 0.898, z: fz + 0.0012, x2: -0.036, y2: 0.828, size: 0.0058, color: C3 });
  // 金藤（斜襟波浪 ×2 色双线）
  var vpts = [];
  for (var vi = 0; vi <= 9; vi++) { var t = vi / 9; vpts.push([-0.054 + t * 0.104, 0.975 - t * 0.30, 0.009 + Math.sin(t * 7) * 0.0022]); }
  for (var vj = 0; vj < vpts.length - 1; vj++) {
    window.gms.part('rod', { x1: vpts[vj][0], y1: vpts[vj][1], z1: vpts[vj][2], x2: vpts[vj + 1][0], y2: vpts[vj + 1][1], z2: vpts[vj + 1][2], size: 0.0024, color: GOLD });
  }
  // 左胸盾徽：金边 + 白 + 蓝芯；右胸小徽
  window.gms.part('disc', { x: -0.050, y: 0.950, z: fz, r: 0.017, thick: 0.0018, axis: 'front', color: GOLD });
  window.gms.part('disc', { x: -0.050, y: 0.950, z: fz + 0.0010, r: 0.0135, thick: 0.0018, axis: 'front', color: WHITE });
  window.gms.part('disc', { x: -0.050, y: 0.950, z: fz + 0.0020, r: 0.0100, thick: 0.0018, axis: 'front', color: C3 });
  window.gms.part('tri', { x: 0.054, y: 0.950, z: fz, w: 0.014, h: 0.019, thick: 0.0018, axis: 'front', color: C3 });
  // 金领口/下摆金线（前弧 12 段）
  (function () {
    function goldArc(y, rr) {
      for (var gi = 0; gi < 11; gi++) {
        var a0 = 0.65 + (gi / 11) * 0.55, a1 = 0.65 + ((gi + 1) / 11) * 0.55;
        window.gms.part('rod', {
          x1: Math.cos(a0) * rr, y1: y, z1: -0.02 + Math.sin(a0) * rr * 0.45,
          x2: Math.cos(a1) * rr, y2: y, z2: -0.02 + Math.sin(a1) * rr * 0.45, size: 0.0022, color: GOLD
        });
      }
    }
    goldArc(0.985, 0.0645); goldArc(0.692, 0.0475);
  })();
  // 左胸鸢尾纹（蓝+金）
  window.gms.part('disc', { x: -0.040, y: 0.905, z: fz, r: 0.006, thick: 0.0015, axis: 'front', color: GOLD });
  window.gms.part('tri', { x: -0.040, y: 0.898, z: fz + 0.001, w: 0.005, h: 0.009, thick: 0.0015, axis: 'front', color: C3 });
  // 红绳结 + 金扣 + 青宝石（右髋）
  window.gms.part('disc', { x: 0.054, y: 0.700, z: fz, r: 0.005, thick: 0.004, axis: 'front', color: GOLD });
  window.gms.part('sphere', { x: 0.054, y: 0.682, z: fz, r: 0.0042, color: '#2fb8c8' });
  window.gms.part('disc', { x: 0.054, y: 0.700, z: fz + 0.0022, r: 0.0026, thick: 0.0012, axis: 'front', color: WHITE });
  window.gms.part('rod', { x1: 0.052, y1: 0.716, z: fz, x2: 0.043, y2: 0.662, size: 0.0018, color: '#c62828' });
  window.gms.part('rod', { x1: 0.056, y1: 0.716, z: fz + 0.001, x2: 0.064, y2: 0.660, size: 0.0018, color: '#c62828' });
  // 凸点 ×4（布褶感，贴曲面）
  window.gms.part('sphere', { x: -0.024, y: 0.905, z: 0.0095, r: 0.0060, color: '#e6edf5' });
  window.gms.part('sphere', { x: 0.024, y: 0.845, z: 0.0085, r: 0.0060, color: '#e6edf5' });
  window.gms.part('sphere', { x: -0.010, y: 0.780, z: 0.0075, r: 0.0055, color: '#e6edf5' });
  window.gms.part('sphere', { x: 0.010, y: 0.720, z: 0.0070, r: 0.0055, color: '#e6edf5' });

  window.__gmsBatchEnd && window.__gmsBatchEnd();
})();
