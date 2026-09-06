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

/** 02-ticket: 沿路径放样 —— path 控制点 + 逐点截面(标量或[rx,ry]) → 弯曲变截面微曲面网格 */
/** quadB：显式局部基贴面（解决 quad 只有法线时弯曲环面滚转/翻面歧义） */
function quadB(c, xa, ya, n, w, h, color, thick) {
  var mm = new THREE.Matrix4().makeBasis(new THREE.Vector3(xa[0], xa[1], xa[2]), new THREE.Vector3(ya[0], ya[1], ya[2]), new THREE.Vector3(n[0], n[1], n[2]));
  var ee = new THREE.Euler().setFromRotationMatrix(mm, 'YXZ');
  window.gms.part('quad', { x: c[0], y: c[1], z: c[2], w: w, h: h, rotation: [ee.x, ee.y, ee.z], color: color, thick: thick });
}
function loft(pts, radii, segs, sides, colorFn, thick) {
  segs = segs || 12; sides = sides || 12;
  var n = pts.length, pts2 = [];
  for (var k = 0; k <= segs; k++) {
    var t = (k / segs) * (n - 1), i = Math.min(n - 2, Math.floor(t)), f = t - i;
    pts2.push(crPt(pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(n - 1, i + 2)], f));
  }
  var rings = [];
  for (var k = 0; k < pts2.length; k++) {
    var p = pts2[k];
    var p0 = pts2[Math.max(0, k - 1)], p1 = pts2[Math.min(pts2.length - 1, k + 1)];
    var tg = _n([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
    var up = Math.abs(tg[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    var u1 = _n([tg[1] * up[2] - tg[2] * up[1], tg[2] * up[0] - tg[0] * up[2], tg[0] * up[1] - tg[1] * up[0]]);
    var u2 = [tg[1] * u1[2] - tg[2] * u1[1], tg[2] * u1[0] - tg[0] * u1[2], tg[0] * u1[1] - tg[1] * u1[0]];
    var r = radii[Math.min(radii.length - 1, Math.round((k / (pts2.length - 1)) * (radii.length - 1)))];
    var rx = Array.isArray(r) ? r[0] : r, ry = Array.isArray(r) ? r[1] : r;
    var ring = [];
    for (var a = 0; a < sides; a++) {
      var th = (a / sides) * Math.PI * 2;
      ring.push([p[0] + u1[0] * Math.cos(th) * rx + u2[0] * Math.sin(th) * ry,
                 p[1] + u1[1] * Math.cos(th) * rx + u2[1] * Math.sin(th) * ry,
                 p[2] + u1[2] * Math.cos(th) * rx + u2[2] * Math.sin(th) * ry]);
    }
    rings.push({ ring: ring, u1: u1, u2: u2, c: p, rx: rx, ry: ry });
  }
  var SUB = 2;
  for (var i = 0; i < rings.length - 1; i++) {
    var RA = rings[i].ring, RB = rings[i + 1].ring;
    var A_u1 = rings[i].u1, A_u2 = rings[i].u2, B_u1 = rings[i + 1].u1, B_u2 = rings[i + 1].u2;
    var A_c = rings[i].c, B_c = rings[i + 1].c;
    function mixV(A, B, f) { return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]; }
    function PR(R, sf) {
      var a = Math.floor(sf) % sides, b = (a + 1) % sides, f = sf - Math.floor(sf);
      return mixV(R[a], R[b], f);
    }
    function MXR(f) {
      var out = [];
      for (var a = 0; a < sides; a++) out.push(mixV(RA[a], RB[a], f));
      return out;
    }
    for (var j = 0; j < sides; j++) {
      for (var si = 0; si < SUB; si++) for (var sj = 0; sj < SUB; sj++) {
        var fMid = (sj + 0.5) / SUB;
        var R0 = MXR(sj / SUB), R1 = MXR((sj + 1) / SUB);
        var s0 = j + si / SUB, s1 = j + (si + 1) / SUB;
        var pA = PR(R0, s0), pB = PR(R0, s1), pC = PR(R1, s1), pD = PR(R1, s0);
        var th = (s0 + s1) / 2 / sides * Math.PI * 2;
        var u1 = mixV(A_u1, B_u1, fMid), u2 = mixV(A_u2, B_u2, fMid), cen = mixV(A_c, B_c, fMid);
        var xa = [-Math.sin(th) * u1[0] + Math.cos(th) * u2[0], -Math.sin(th) * u1[1] + Math.cos(th) * u2[1], -Math.sin(th) * u1[2] + Math.cos(th) * u2[2]];
        var nv = [Math.cos(th) * u1[0] + Math.sin(th) * u2[0], Math.cos(th) * u1[1] + Math.sin(th) * u2[1], Math.cos(th) * u1[2] + Math.sin(th) * u2[2]];
        var ya = [nv[1] * xa[2] - nv[2] * xa[1], nv[2] * xa[0] - nv[0] * xa[2], nv[0] * xa[1] - nv[1] * xa[0]];
        var c = [(pA[0] + pB[0] + pC[0] + pD[0]) / 4, (pA[1] + pB[1] + pC[1] + pD[1]) / 4, (pA[2] + pB[2] + pC[2] + pD[2]) / 4];
        var w = Math.hypot(pB[0] - pA[0], pB[1] - pA[1], pB[2] - pA[2]);
        var h = Math.hypot(pD[0] - pA[0], pD[1] - pA[1], pD[2] - pA[2]);
        quadB(c, xa, ya, nv, Math.max(w, 0.0006) * 1.04, Math.max(h, 0.0006) * 1.04, colorFn(i, j, si / SUB, sj / SUB), thick);
      }
    }
  }
}

/** loftMesh：路径放样 → 单个 mesh 基础元件（水密曲面：共享边、逐面对色、可选端盖） */
function loftMesh(pts, radii, segs, sides, colorFn, opts) {
  opts = opts || {};
  var pts2 = [];
  var n = pts.length;
  for (var k = 0; k <= segs; k++) {
    var t = (k / segs) * (n - 1), i = Math.min(n - 2, Math.floor(t)), f = t - i;
    pts2.push(crPt(pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(n - 1, i + 2)], f));
  }
  var verts = [], faces = [], colors = [];
  var rAt = function (k) {
    var r = radii[Math.min(radii.length - 1, Math.round((k / (pts2.length - 1)) * (radii.length - 1)))];
    return { rx: Array.isArray(r) ? r[0] : r, ry: Array.isArray(r) ? r[1] : r };
  };
  var ringIdx = [];
  for (var k = 0; k < pts2.length; k++) {
    var p = pts2[k];
    var p0 = pts2[Math.max(0, k - 1)], p1 = pts2[Math.min(pts2.length - 1, k + 1)];
    var tg = _n([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
    var up = Math.abs(tg[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    var u1 = _n([tg[1] * up[2] - tg[2] * up[1], tg[2] * up[0] - tg[0] * up[2], tg[0] * up[1] - tg[1] * up[0]]);
    var u2 = [tg[1] * u1[2] - tg[2] * u1[1], tg[2] * u1[0] - tg[0] * u1[2], tg[0] * u1[1] - tg[1] * u1[0]];
    var r = rAt(k);
    var base = verts.length;
    ringIdx.push(base);
    for (var a = 0; a < sides; a++) {
      var th = (a / sides) * Math.PI * 2;
      verts.push([p[0] + u1[0] * Math.cos(th) * r.rx + u2[0] * Math.sin(th) * r.ry,
                  p[1] + u1[1] * Math.cos(th) * r.rx + u2[1] * Math.sin(th) * r.ry,
                  p[2] + u1[2] * Math.cos(th) * r.rx + u2[2] * Math.sin(th) * r.ry]);
    }
  }
  for (var i = 0; i < pts2.length - 1; i++) {
    for (var j = 0; j < sides; j++) {
      var j1 = (j + 1) % sides;
      var A = ringIdx[i] + j, B = ringIdx[i] + j1, C = ringIdx[i + 1] + j1, D = ringIdx[i + 1] + j;
      var col = colorFn(i, j, i / (pts2.length - 1));
      faces.push(A, B, C, A, C, D);
      colors.push(col, col);
    }
  }
  if (opts.cap !== 'none') {
    var tipIdx = verts.length;
    verts.push(pts2[0]);
    var a0 = ringIdx[0];
    for (var j = 0; j < sides; j++) faces.push(tipIdx, a0 + ((j + 1) % sides), a0 + j), colors.push(colorFn(0, j, 0));
    var tip2 = verts.length;
    verts.push(pts2[pts2.length - 1]);
    var b0 = ringIdx[pts2.length - 1];
    for (var j = 0; j < sides; j++) faces.push(tip2, b0 + j, b0 + ((j + 1) % sides)), colors.push(colorFn(pts2.length - 2, j, 1));
  }
  window.gms.part('mesh', { mesh: { vertices: verts, faces: faces, colors: colors }, color: '#ffffff' });
}
