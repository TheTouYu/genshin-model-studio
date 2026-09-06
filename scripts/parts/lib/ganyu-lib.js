function quad(c, n, w, h, color, thick) {
  window.gms.part('quad', { x: c[0], y: c[1], z: c[2], w: w, h: h, thick: thick || 0.0015, normal: n, color: color });
}
function _n(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
/** rings=[{y,cx,cz,rx,ry}]；逐格生成小面，法线 = cross(dU,dV)（含坡度，u→绕周、v→垂直） */
function surface(rings, u, colorFn, thick) {
  for (var i = 0; i < rings.length - 1; i++) {
    var A = rings[i], B = rings[i + 1];
    var Acx = A.cx || 0, Bcx = B.cx || 0;
    var SUB = 2;   // 微曲面片：每格 2×2 子面，采样全落在环曲面；法线=解析外法线（无翻转歧义）
    for (var j = 0; j < u; j++) {
      var t0 = (j * 2 * Math.PI) / u, t1 = ((j + 1) * 2 * Math.PI) / u, tm = (t0 + t1) / 2;
      function P(r, t) { return [r.cx + Math.cos(t) * r.rx, r.y, r.cz + Math.sin(t) * r.ry]; }
      function mixR(f) {
        return { y: A.y + (B.y - A.y) * f, rx: A.rx + (B.rx - A.rx) * f, ry: A.ry + (B.ry - A.ry) * f,
                 cx: Acx + (Bcx - Acx) * f, cz: (A.cz || -0.02) + ((B.cz || -0.02) - (A.cz || -0.02)) * f };
      }
      for (var si = 0; si < SUB; si++) for (var sj = 0; sj < SUB; sj++) {
        var R0 = mixR(sj / SUB), R1 = mixR((sj + 1) / SUB);
        var u0 = t0 + (t1 - t0) * (si / SUB), u1 = t0 + (t1 - t0) * ((si + 1) / SUB), umid = (u0 + u1) / 2;
        var p0 = P(R0, u0), p1 = P(R0, u1), p2 = P(R1, u1), p3 = P(R1, u0);
        var n = _n([Math.cos(umid) / (R0.rx || 1), 0, Math.sin(umid) / (R0.ry || 1)]);  // 椭圆解析外法线
        var c = [(p0[0] + p1[0] + p2[0] + p3[0]) / 4, R0.y + (R1.y - R0.y) / 2, (p0[2] + p1[2] + p2[2] + p3[2]) / 4];
        var w = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
        var h = Math.hypot(p3[0] - p0[0], R1.y - R0.y, p3[2] - p0[2]);
        quad(c, n, Math.max(w, 0.0005) * 1.03, Math.max(h, 0.0005) * 1.03, colorFn(i, j, tm), thick);
      }
    }
  }
}
function offsetRings(rings, d) { return rings.map(function (r) { return { y: r.y, cx: r.cx || 0, cz: r.cz || 0, rx: r.rx + d, ry: r.ry + d }; }); }
/** 发丝飘带（ribbon of quads）：法线朝 axisCenter 径向，宽度渐变 */
function ribbon(pts, widths, color, axis) {
  for (var i = 0; i < pts.length - 1; i++) {
    var a = pts[i], b = pts[i + 1];
    var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    var len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (len < 1e-5) continue;
    var out = [mid[0] - axis[0], 0, mid[2] - axis[2]];
    var ol = Math.hypot(out[0], out[2]);
    if (ol < 1e-6) out = [0, 0, 1]; else out = [out[0] / ol, 0, out[2] / ol];
    var n = [out[0], mid[1] > axis[1] + 0.12 ? 0.3 : 0, out[2]];
    quad(mid, _n(n), widths[Math.min(i, widths.length - 1)], len * 1.06, color, 0.0012);
  }
}
function crPt(p0, p1, p2, p3, t) {
  var t2 = t * t, t3 = t2 * t;
  return [0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
          0.5 * (2 * p1[2] + (-p0[2] + p2[2]) * t + (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t2 + (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * t3)];
}
function curvedRibbon(ctrl, widths, color, axis, segs) {
  segs = segs || 8; var pts = [], wds = [], n = ctrl.length;
  for (var k = 0; k <= segs; k++) {
    var t = (k / segs) * (n - 1), i = Math.min(n - 2, Math.floor(t)), f = t - i;
    pts.push(crPt(ctrl[Math.max(0, i - 1)], ctrl[i], ctrl[i + 1], ctrl[Math.min(n - 1, i + 2)], f));
    var w0 = widths[Math.min(widths.length - 1, i)], w1 = widths[Math.min(widths.length - 1, i + 1)];
    wds.push(w0 + (w1 - w0) * f);
  }
  ribbon(pts, wds, color, axis);
}
function mirrorRings(rings, sign) {
  return rings.map(function (r) { return { y: r.y, cx: Math.round(r.cx * sign * 1000) / 1000, cz: r.cz ?? -0.02, rx: r.rx, ry: r.ry }; });
}
/** 在测量环表中插值取单环；ringsBetween 生成衣装带的连续环（避免测量标签噪声造成“露肤缝隙”） */
function ringAt(rings, y) {
  var y0 = rings[0].y, y1 = rings[rings.length - 1].y;
  y = Math.max(y0, Math.min(y1, y));
  for (var i = 0; i < rings.length - 1; i++) {
    var a = rings[i], b = rings[i + 1];
    if (y >= a.y && y <= b.y) {
      var t = (y - a.y) / ((b.y - a.y) || 1);
      return { y: y, cx: 0, cz: -0.02, rx: a.rx + (b.rx - a.rx) * t, ry: a.ry + (b.ry - a.ry) * t };
    }
  }
  return y1 - y0 > 0 ? rings[rings.length - 1] : rings[0];
}
function interp(rings, n) {
  var out = [];
  for (var i = 0; i <= n; i++) out.push(ringAt2(rings, i / n));
  return out;
}
function ringAt2(rings, t) {
  var m = rings.length - 1, x = t * m, i = Math.min(m - 1, Math.floor(x)), f = x - i;
  var a = rings[i], b = rings[i + 1];
  var sm = f * f * (3 - 2 * f);
  return { y: a.y + (b.y - a.y) * f, cx: (a.cx || 0) + ((b.cx || 0) - (a.cx || 0)) * f,
           cz: (a.cz || -0.02) + ((b.cz || -0.02) - (a.cz || -0.02)) * f,
           rx: a.rx + (b.rx - a.rx) * sm, ry: a.ry + (b.ry - a.ry) * sm };
}
function ringsBetween(rings, y0, y1, n) {
  n = n || 7;
  var s = Math.max(y0, rings[0].y), e = Math.min(y1, rings[rings.length - 1].y);
  if (e - s < 0.01) { s = rings[0].y; e = rings[rings.length - 1].y; }
  var out = [];
  for (var i = 0; i <= n; i++) out.push(ringAt(rings, s + (e - s) * i / n));
  return out;
}
