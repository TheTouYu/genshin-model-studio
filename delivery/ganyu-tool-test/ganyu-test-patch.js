/* 最小微曲面验收贴片：4 环 × 10 段 × 2×2 子面 + 3 凸点（秒级重建，专用严格核验） */
(function () { 'use strict';
  var PI2 = Math.PI * 2;
  var WHITE = '#eef2f7', BLUE = '#3b6ea5';
  function _n(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function quad(c, n, w, h, color, thick) {
    window.gms.part('quad', { x: c[0], y: c[1], z: c[2], w: w, h: h, normal: n, color: color, thick: thick });
  }
  function surface(rings, u, colorFn, thick) {
    var SUB = 2;
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
          quad(c, nml, Math.max(w, 0.0005) * 1.033, Math.max(h, 0.0005) * 1.033, colorFn(i, j, tm), thick);
        }
      }
    }
  }
  window.gms.clear();
  window.__gmsBatch = true;
  var rings = [
    { y: 0.98, cx: 0, cz: -0.02, rx: 0.064, ry: 0.030 },
    { y: 0.92, cx: 0, cz: -0.02, rx: 0.062, ry: 0.029 },
    { y: 0.86, cx: 0, cz: -0.02, rx: 0.060, ry: 0.028 },
    { y: 0.80, cx: 0, cz: -0.02, rx: 0.052, ry: 0.028 },
    { y: 0.75, cx: 0, cz: -0.02, rx: 0.048, ry: 0.027 },
    { y: 0.71, cx: 0, cz: -0.02, rx: 0.046, ry: 0.027 }
  ];
  surface(rings, 16, function (i, j, tm) {
    var blue = (i === 1 || i === 3) && (j % 3 === 0 || j % 3 === 1);
    return blue ? BLUE : WHITE;
  }, 0.002);
  // 凸点 ×3（检查凹凸表达 + 与曲面贴合）
  window.gms.part('sphere', { x: -0.024, y: 0.905, z: 0.0085, r: 0.0065, color: '#dbe6f2' });
  window.gms.part('sphere', { x: 0.020, y: 0.835, z: 0.0075, r: 0.0065, color: '#dbe6f2' });
  window.gms.part('sphere', { x: 0.004, y: 0.775, z: 0.0065, r: 0.006, color: '#dbe6f2' });
  window.__gmsBatchEnd && window.__gmsBatchEnd();
})();
