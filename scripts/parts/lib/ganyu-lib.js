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
    // 2026-09-06 竖直件轴互换修复：默认对竖直路径取 up=[1,0,0] 会把 rx↔z、ry↔x 互换（躯干与脚错轴）；
    // opts.up 可指定竖直件用 [0,0,1]（rx=宽、ry=深）；水平路径默认 [0,1,0] 正确。
    var up = opts.up ? _n(opts.up) : (Math.abs(tg[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]);
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

/** profileLoft：不对称截面放样——sections=[{rx,ry,cx,cy}]（逐控制点），cap:'none'|'top'|'bottom'|'both' */
function profileLoft(path, sections, segs, sides, colorFn, opts) {
  opts = opts || {};
  var pts2 = [];
  var n = path.length;
  // 纵向采样：默认均匀 segs 段；opts.dense=[{t0,t1,mult}] 在指定路径区间内插入细分环，
  // 使同一放样可生成不同尺寸的多边形（趾区小、腿段大）。
  var sampleT = [];
  for (var k0 = 0; k0 <= segs; k0++) sampleT.push(k0 / segs);
  if (opts.dense) {
    for (var d = 0; d < opts.dense.length; d++) {
      var DR = opts.dense[d], t0 = DR.t0 || 0, t1 = DR.t1 || 1, m = Math.max(1, DR.mult || 2);
      for (var k1 = 0; k1 < segs; k1++) {
        var a = k1 / segs, b = (k1 + 1) / segs;
        if (b <= t0 || a >= t1) continue;
        var lo = Math.max(a, t0), hi = Math.min(b, t1);
        for (var q = 1; q < m; q++) sampleT.push(lo + (hi - lo) * q / m);
      }
    }
    sampleT.sort(function (x, y) { return x - y; });
    var dedup = [];
    for (var s = 0; s < sampleT.length; s++) {
      if (!s || sampleT[s] > dedup[dedup.length - 1] + 1e-9) dedup.push(sampleT[s]);
    }
    sampleT = dedup;
  }
  var ringT = sampleT;
  // 角向非均匀采样：opts.angularStops（单调递增、覆盖 [0,2π)，全环共享 → 列宽不同但曲面连续）
  var nAng = opts.angularStops ? opts.angularStops.length : sides;
  for (var k = 0; k < sampleT.length; k++) {
    var t = sampleT[k] * (n - 1), i = Math.min(n - 2, Math.floor(t)), f = t - i;
    pts2.push(crPt(path[Math.max(0, i - 1)], path[i], path[i + 1], path[Math.min(n - 1, i + 2)], f));
  }
  var getSec = function (k) {
    var f = ringT[k] * (sections.length - 1), i = Math.min(sections.length - 1, Math.floor(f)), g = f - i;
    var A = sections[i], B = sections[Math.min(sections.length - 1, i + 1)];
    function value(section, key, fallback) { return section[key] == null ? (section[fallback] == null ? 0 : section[fallback]) : section[key]; }
    function field(key, fallback) { var a = value(A, key, fallback), b = value(B, key, fallback); return a + (b - a) * g; }
    return { rx: field('rx', 'rx'), ry: field('ry', 'ry'), ryF: field('ryF', 'ry'), cyF: field('cyF', 'cy'), ryB: field('ryB', 'ry'), cyB: field('cyB', 'cy'), cx: field('cx', 'cx'), cy: field('cy', 'cy') };
  };
  var verts = [], faces = [], colors = [], props = [], ringIdx = [];
  for (var k = 0; k < pts2.length; k++) {
    var p = pts2[k], sec = getSec(k);
    var p0 = pts2[Math.max(0, k - 1)], p1 = pts2[Math.min(pts2.length - 1, k + 1)];
    var tg = _n([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
    // 2026-09-06 竖直件轴互换修复：默认对竖直路径取 up=[1,0,0] 会把 rx↔z、ry↔x 互换（躯干与脚错轴）；
    // opts.up 可指定竖直件用 [0,0,1]（rx=宽、ry=深）；水平路径默认 [0,1,0] 正确。
    var up = opts.up ? _n(opts.up) : (Math.abs(tg[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]);
    var u1 = _n([tg[1] * up[2] - tg[2] * up[1], tg[2] * up[0] - tg[0] * up[2], tg[0] * up[1] - tg[1] * up[0]]);
    var u2 = [tg[1] * u1[2] - tg[2] * u1[1], tg[2] * u1[0] - tg[0] * u1[2], tg[0] * u1[1] - tg[1] * u1[0]];
    var base = verts.length; ringIdx.push(base);
    var pT = ringT[k] || 0;
    var toeFrac = opts.toes ? (opts.toes.frac || 0.3) : 0;
    var toeF2 = toeFrac > 0 ? Math.max(0, (pT - (1 - toeFrac)) / toeFrac) : 0;
    var toe = opts.toe;
    var toeF = toe ? Math.max(0, (pT - (1 - (toe.frac || 0.28))) / (toe.frac || 0.28)) : 0;
    for (var a = 0; a < nAng; a++) {
      var th = opts.angularStops ? opts.angularStops[a] : (a / sides) * Math.PI * 2;
      var dyLift = 0;
      var toeShift = 0;
      var toeLat = 0;
      var scl = 1;
      if (toe && toeF > 0) {
        var A = (opts.toe.amp || 0.16) * toeF * toeF * toeF;
        var upMask = 0.45 + 0.55 * Math.sin(th);        // 瓣只作用于脚背上弧（底部收敛）
        var s1 = A * upMask * (Math.cos((opts.toe.n || 5) * th + (opts.toe.phase || 0)) + 0.5 * Math.cos(2 * (opts.toe.n || 5) * th + 2 * (opts.toe.phase || 0)));
        if (opts.toe.bigDir) s1 += A * 0.5 * opts.toe.bigDir * Math.cos(th) * upMask;
        scl = 1 + s1;
        if (scl > 1.32) scl = 1.32;
        if (scl < 0.84) scl = 0.84;
      }
      if (opts.toes && toeF2 > 0) {
        var TL = opts.toes.angularList || opts.toes.list || [];
        for (var tk = 0; tk < TL.length; tk++) {
          var TW = TL[tk];
          if (TW.c == null) continue;
          var toeStart = 1 - (opts.toes.frac || 0.3);
          if (pT >= toeStart) {
            var toeU = (pT - toeStart) / Math.max(1e-6, opts.toes.frac || 0.3);
            var env = Math.max(0, Math.min(1, toeU));
            env = env * env * (3 - 2 * env);
            var len = TW.len || 1;
            var dA = Math.atan2(Math.sin(th - TW.c), Math.cos(th - TW.c)) / (TW.w || 0.3);
            var lobe = Math.exp(-dA * dA) * env;
            scl += (opts.toes.amp || 0.22) * (0.72 + 0.28 * len) * lobe;
            dyLift += (TW.dy || 0) * env;
            toeShift += len * 0.014 * lobe;
            toeLat += (TW.dx || 0) * lobe;
          }
        }
      }
      if (opts.micro) {
        scl *= 1 + opts.micro.a1 * Math.sin(th * opts.micro.f1 + pT * 27) + opts.micro.a2 * Math.sin(pT * opts.micro.f2 * Math.PI + th * 3);
      }
      if (opts.bumps) {
        for (var bk = 0; bk < opts.bumps.length; bk++) {
          var BP = opts.bumps[bk];
          var dT = (pT - BP.t) / (BP.w || 0.03);
          var dTh = Math.atan2(Math.sin(th - BP.th), Math.cos(th - BP.th)) / (BP.wt || 0.6);
          var irr = BP.irreg ? (0.55 + 0.45 * Math.sin(k * 3.7 + a * 5.1 + (BP.t || 0) * 40)) : 1;
          scl *= 1 + BP.amp * irr * Math.exp(-dT * dT - dTh * dTh);
        }
      }
      if (opts.rings) {
        for (var rk = 0; rk < opts.rings.length; rk++) {
          var RG = opts.rings[rk];
          var dz = (pT - RG.t) / (RG.w || 0.02);
          scl *= 1 + RG.amp * Math.exp(-dz * dz);
        }
      }
      if (opts.creases && pT > (opts.creases.t0 || 0) && pT < (opts.creases.t1 || 1)) {
        for (var ci = 0; ci < opts.creases.lines.length; ci++) {
          var LN = opts.creases.lines[ci];
          var vv = (th / (Math.PI * 2) * LN.k1 + pT * LN.k2) % 1;
          if (vv < 0) vv += 1;
          var dv = Math.min(vv, 1 - vv);
          scl *= 1 + LN.amp * Math.exp(-(dv / (LN.w || 0.05)) * (dv / (LN.w || 0.05)));
        }
      }
      var front = Math.sin(th) >= 0;
      var ryd = front ? (sec.ryF == null ? sec.ry : sec.ryF) : (sec.ryB == null ? sec.ry : sec.ryB);
      var cyd = front ? (sec.cyF == null ? sec.cy : sec.cyF) : (sec.cyB == null ? sec.cy : sec.cyB);
      var off = [u1[0] * (Math.cos(th) * sec.rx * scl + (sec.cx || 0)) + u2[0] * (Math.sin(th) * ryd * scl + cyd + dyLift),
                 u1[1] * (Math.cos(th) * sec.rx * scl + (sec.cx || 0)) + u2[1] * (Math.sin(th) * ryd * scl + cyd + dyLift),
                 u1[2] * (Math.cos(th) * sec.rx * scl + (sec.cx || 0)) + u2[2] * (Math.sin(th) * ryd * scl + cyd + dyLift)];
      verts.push([p[0] + off[0] + tg[0] * toeShift + u1[0] * toeLat, p[1] + off[1] + tg[1] * toeShift + u1[1] * toeLat, p[2] + off[2] + tg[2] * toeShift + u1[2] * toeLat]);
    }
  }
  for (var i = 0; i < pts2.length - 1; i++) {
    for (var j = 0; j < nAng; j++) {
      var j1 = (j + 1) % nAng;
      var A = ringIdx[i] + j, B = ringIdx[i] + j1, C = ringIdx[i + 1] + j1, D = ringIdx[i + 1] + j;
      var fp = opts.faceProps ? opts.faceProps(i, j, ringT[i] || 0) : null;
      var col = (fp && fp.color) || colorFn(i, j, ringT[i] || 0);
      faces.push(A, B, C, A, C, D); colors.push(col, col);
      if (fp) props.push(fp, fp);
    }
  }
  var cap = opts.cap || 'both';
  if (opts.toes && opts.toes.lofted) {
    var toeList = opts.toes.list || [];
    var toeBaseZ = pts2[pts2.length - 1][2] - 0.035;
    var toeBaseY = 0.008;
    var toeSegs = opts.toes.lofted.segs || 8;
    var toeSides = opts.toes.lofted.sides || 12;
    for (var ti = 0; ti < toeList.length; ti++) {
      var TW = toeList[ti];
      var tx = TW.x || 0;
      var tr = TW.r || 0.006;
      var tLen = 0.030 * (TW.len || 1);
      var tStart = verts.length;
      for (var ts = 0; ts <= toeSegs; ts++) {
        var tu = ts / toeSegs;
        var ease = tu * tu * (3 - 2 * tu);
        var tz = toeBaseZ + tLen * tu;
        var rootBlend = Math.sin(Math.min(1, tu) * Math.PI * 0.5);
        var rootEase = tu * tu * (3 - 2 * tu);
        var taper = 1.15 - 0.73 * ease;
        var rootInset = 0.006 * (1 - rootEase);
        var depth = 0.82 + 0.10 * rootBlend;
        for (var ta = 0; ta < toeSides; ta++) {
          var ath = (ta / toeSides) * Math.PI * 2;
          verts.push([tx + Math.cos(ath) * tr * taper, toeBaseY + (TW.dy || 0) * ease + Math.sin(ath) * tr * depth + rootInset, tz]);
        }
      }
      for (var ts = 0; ts < toeSegs; ts++) for (var ta = 0; ta < toeSides; ta++) {
        var an = (ta + 1) % toeSides;
        var q0 = tStart + ts * toeSides + ta, q1 = tStart + ts * toeSides + an;
        var q2 = tStart + (ts + 1) * toeSides + an, q3 = tStart + (ts + 1) * toeSides + ta;
        faces.push(q0, q1, q2, q0, q2, q3); colors.push(colorFn(pts2.length - 2, ta, 1), colorFn(pts2.length - 2, ta, 1));
      }
      var toeCap = tStart + toeSegs * toeSides;
      var toeTip = verts.length;
      var tipZ = toeBaseZ + tLen;
      for (var ta = 0; ta < toeSides; ta++) {
        var ath = (ta / toeSides) * Math.PI * 2;
        verts.push([tx + Math.cos(ath) * tr * 0.66, toeBaseY + (TW.dy || 0) + Math.sin(ath) * tr * 0.52, tipZ]);
      }
      for (var ta = 0; ta < toeSides; ta++) { var an = (ta + 1) % toeSides; faces.push(toeCap + ta, toeCap + an, toeTip + an, toeCap + ta, toeTip + an, toeTip + ta); colors.push(colorFn(pts2.length - 2, ta, 1), colorFn(pts2.length - 2, ta, 1)); }
    }
  }
  if (cap === 'both' || cap === 'top') {
    var tipIdx = verts.length; verts.push(pts2[0]);
    var a0 = ringIdx[0];
    for (var j = 0; j < nAng; j++) { faces.push(tipIdx, a0 + ((j + 1) % nAng), a0 + j); colors.push(colorFn(0, j, 0)); }
  }
  if (cap === 'both' || cap === 'bottom') {
    var tip2 = verts.length;
    var b0 = ringIdx[pts2.length - 1];
    var capCenter = [0, 0, 0];
    for (var j = 0; j < nAng; j++) {
      var cv = verts[b0 + j];
      capCenter[0] += cv[0]; capCenter[1] += cv[1]; capCenter[2] += cv[2];
    }
    capCenter[0] /= nAng; capCenter[1] /= nAng; capCenter[2] /= nAng;
    verts.push(capCenter);
    for (var j = 0; j < nAng; j++) { faces.push(tip2, b0 + j, b0 + ((j + 1) % nAng)); colors.push(colorFn(pts2.length - 2, j, 1)); }
  }
  if (opts.dataOnly) {
    var out = { vertices: verts, faces: faces, colors: colors };
    // 2026-09-06 ringIdx 元数据：供 extrudeRing 分支从真实环位长出（一体分支）
    out.ringIdx = ringIdx; out.sides = nAng;
    if (opts.faceProps) out.props = props;
    return out;
  }

}

/**
 * polyGrid：参数化多边形面片（rows×cols 四边面网格）。
 * - 行/列停靠点可非均匀（rowStops/colStops）→ 生成不同大小的多边形；
 * - pos(u,v) 给出每格角点位置；colorFn 逐格颜色；faceProps 逐面属性 {color,mat,flat,...}。
 */
function polyGrid(opts) {
  opts = opts || {};
  var rows = opts.rows || 4, cols = opts.cols || 4;
  function stops(n, arr) {
    var out = [];
    if (arr && arr.length === n + 1) { for (var k = 0; k < arr.length; k++) out.push(arr[k]); }
    else for (var k = 0; k <= n; k++) out.push(k / n);
    return out;
  }
  var cs = stops(cols, opts.colStops), rs = stops(rows, opts.rowStops);
  var pos = opts.pos || function (u, v) { return [u, v, 0]; };
  var colorFn = opts.colorFn || function () { return '#cccccc'; };
  var faceProps = opts.faceProps || null;
  var verts = [], faces = [], colors = [], props = [], rowBase = [];
  for (var r = 0; r <= rows; r++) {
    rowBase.push(verts.length);
    for (var c = 0; c <= cols; c++) {
      var p = pos(cs[c], rs[r]);
      verts.push([p[0], p[1], p[2]]);
    }
  }
  for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
    var A = rowBase[r] + c, B = rowBase[r] + c + 1, C = rowBase[r + 1] + c + 1, D = rowBase[r + 1] + c;
    var fp = faceProps ? faceProps(r, c, cs[c], rs[r]) : null;
    var col = (fp && fp.color) || colorFn(r, c, cs[c], rs[r]);
    faces.push(A, B, C, A, C, D); colors.push(col, col);
    if (fp) props.push(fp, fp);
  }
  var out = { vertices: verts, faces: faces, colors: colors };
  if (faceProps) out.props = props;
  return out;
}

/**
 * polyDomePatch：局域凸包多边形补丁——中心顶点 + 径向环 + 扇形分割。
 * 与"脚踝鼓包"线框表达同构：中心处小而密的多边形，逐环放大，外环升高为 0 贴合表面。
 * opts：{x,y,z, r, h, rings, sides, sx, sy, lean, leanY, irr, seed,
 *        pos(px,py,pz)->[x,y,z], profileF(u), colorFn(r,a), faceProps(r,a)}
 * lean/leanY：顶点向侧向倾斜（0..1×r）→ 不对称曲面；irr/seed：低频径向不规则。
 */
function polyDomePatch(o) {
  o = o || {};
  var x = o.x || 0, y = o.y || 0, z = o.z || 0;
  var r = o.r || 0.01, h = o.h || 0.002;
  var rings = o.rings || 3, sides = o.sides || 12;
  var sx = o.sx || 1, sy = o.sy || 1;
  var lean = o.lean || 0, leanY = o.leanY || 0;
  var irr = o.irr || 0, seed = o.seed || 0;
  var pos = o.pos || function (px, py, pz) { return [px, py, pz]; };
  var colorFn = o.colorFn || function () { return '#e8e8ec'; };
  var faceProps = o.faceProps || null;
  var profileF = o.profileF || function (u) { return Math.cos(Math.min(1, Math.max(0, u)) * Math.PI * 0.5); };
  var verts = [], faces = [], colors = [], props = [];
  var center = verts.length; verts.push(pos(x + lean * r, y + leanY * r, z + h));
  var ringIdx = [];
  for (var rr = 1; rr <= rings; rr++) {
    var ru = rr / rings;
    var shx = lean * r * ru * ru, shy = leanY * r * ru * ru;
    var rad = r * ru;
    var rise = h * profileF(ru);
    ringIdx.push(verts.length);
    for (var a = 0; a < sides; a++) {
      var ath = (a / sides) * Math.PI * 2;
      var radl = rad * (1 + irr * (0.6 * Math.sin(2 * ath + seed) + 0.4 * Math.cos(3 * ath + seed * 1.7)));
      verts.push(pos(x + shx + Math.cos(ath) * radl * sx, y + shy + Math.sin(ath) * radl * sy, z + rise));
    }
  }
  var r0 = ringIdx[0];
  for (var a = 0; a < sides; a++) {
    var a1 = (a + 1) % sides;
    var fp0 = faceProps ? faceProps(0, a) : null;
    var c0 = (fp0 && fp0.color) || colorFn(0, a);
    faces.push(center, r0 + a, r0 + a1); colors.push(c0);
    if (fp0) props.push(fp0);
  }
  for (var rr = 1; rr < rings; rr++) {
    var base = ringIdx[rr - 1], next = ringIdx[rr];
    for (var a = 0; a < sides; a++) {
      var a1 = (a + 1) % sides;
      var fp = faceProps ? faceProps(rr, a) : null;
      var c = (fp && fp.color) || colorFn(rr, a);
      faces.push(base + a, next + a, next + a1, base + a, next + a1, base + a1);
      colors.push(c, c);
      if (fp) props.push(fp, fp);
    }
  }
  var out = { vertices: verts, faces: faces, colors: colors };
  if (faceProps) out.props = props;
  return out;
}

/**
 * reliefYTube：沿 Y 轴放样管表面做局部浮雕（真正的 3D 深度凸起/凹陷）。
 * 不新增面片——直接位移 data 网格顶点，沿各自表面外法向（径向）鼓出，边缘 falloff 归零无缝贴合。
 * opts：{y, th, r, h, irr, seed, leanY, leanTh, neg}
 *  - y/th：凸包中心（管轴 Y；th=atan2(z,x) 角位置）
 *  - r：影响半径（表面弧长），h：鼓出高度；fall=cos(d/r·π/2)
 *  - leanY/leanTh：不对称倾移；irr/seed：低频径向不规则（细节）
 */
function reliefYTube(data, o) {
  o = o || {};
  var y0 = o.y || 0, th0 = o.th || 0, r = o.r || 0.01, h = o.h || 0.002;
  var irr = o.irr || 0, seed = o.seed || 0, leanY = o.leanY || 0, leanTh = o.leanTh || 0;
  var neg = o.neg ? -1 : 1;
  var vs = data.vertices;
  for (var i = 0; i < vs.length; i++) {
    var v = vs[i];
    var rad = Math.hypot(v[0], v[2]);
    if (rad < 1e-9) continue;
    var th = Math.atan2(v[2], v[0]);
    var dth = Math.atan2(Math.sin(th - th0), Math.cos(th - th0));
    var u = Math.hypot(v[1] - y0, rad * dth) / r;
    if (u >= 1) continue;
    var fall = Math.cos(u * Math.PI * 0.5);
    var wob = 1 + irr * (0.45 * Math.sin(2 * th + seed) + 0.30 * Math.cos(3 * th + seed * 1.7));
    var asym = 1 + leanTh * fall * dth * 0.8 + leanY * fall * ((v[1] - y0) / r);
    var amp = h * fall * wob * asym * neg;
    var inv = 1 / rad;
    v[0] += v[0] * inv * amp;
    v[2] += v[2] * inv * amp;
  }
  return data;
}
/**
 * jitterMesh：确定性平滑扰动——相位沿环、角度均连续（低频正弦），
 * 只让每个四边形尺寸/角度略有差异，绝不产生断层。
 * opts：{sides, ampA=0.02(角向), ampR=0.0002(径向,m), ampY=0.00025(高度,m),
 *        seed=1, freq=0.35, freq2=0.21, freqY=0.8}
 */
function jitterMesh(data, o) {
  o = o || {};
  var sides = o.sides || 40;
  var ampA = o.ampA == null ? 0.02 : o.ampA;
  var ampR = o.ampR == null ? 0.0002 : o.ampR;
  var ampY = o.ampY == null ? 0.00025 : o.ampY;
  var seed = o.seed || 1;
  var freq = o.freq == null ? 0.35 : o.freq;
  var freq2 = o.freq2 == null ? 0.21 : o.freq2;
  var freqY = o.freqY == null ? 0.8 : o.freqY;
  var vs = data.vertices;
  var rings = Math.floor((vs.length - 2) / sides);
  for (var i = 0; i < rings; i++) {
    var ph1 = seed * 1.3 + i * freq;       // 相位沿环线性推进 → 连续
    var ph2 = seed * 2.1 + i * freq2;
    var dy = ampY * Math.sin(i * freqY + seed); // 高度用低频正弦 → 无台阶
    for (var a = 0; a < sides; a++) {
      var v = vs[i * sides + a];
      if (!v) continue;
      var rad = Math.hypot(v[0], v[2]);
      if (rad < 1e-9) continue;
      var th = Math.atan2(v[2], v[0]);
      var dth = ampA * (Math.sin(2 * th + ph1) + 0.5 * Math.sin(3 * th + ph2));
      var dr = ampR * (Math.sin(2 * th + ph1 + 0.8) + 0.6 * Math.sin(3 * th + ph2 + 1.3));
      var th2 = th + dth;
      var r2 = rad + dr;
      v[0] = Math.cos(th2) * r2;
      v[2] = Math.sin(th2) * r2;
      v[1] += dy;
    }
  }
  return data;
}

/**
 * adaptiveAngularStops：非均匀角向停靠点——曲率高（凸包中心 θ0 ± σ）加密、平处放宽；
 * 列宽再叠加平滑低频波形差异。所有环共享同一停靠点 → 多边形不同但曲面连续。
 * opts：{center=0, sigma=0.55, nFine=18, nCoarse=26, wave=0.012, seed=3} → 返回 [0,2π) 单调递增数组
 */
function adaptiveAngularStops(o) {
  o = o || {};
  var th0 = o.center || 0, sig = o.sigma || 0.55, nFine = o.nFine || 18, nCoarse = o.nCoarse || 26;
  var wave = o.wave == null ? 0.012 : o.wave, seed = o.seed || 3;
  function norm(x) { x = x % (2 * Math.PI); if (x < 0) x += 2 * Math.PI; return x; }
  var sector = sig * 4.8;
  var left = th0 - sector / 2, right = th0 + sector / 2;
  var comp = 2 * Math.PI - sector;
  var raw = [0];
  for (var i = 0; i <= nFine; i++) raw.push(norm(left + sector * i / nFine));
  for (var i = 0; i < nCoarse; i++) raw.push(norm(right + comp * i / nCoarse));
  raw.sort(function (a, b) { return a - b; });
  var mono = [];
  for (var m = 0; m < raw.length; m++) {
    var y = raw[m];
    if (y >= 2 * Math.PI - 1e-6) y = 0;
    if (!mono.length || y > mono[mono.length - 1] + 1e-6) mono.push(y);
  }
  // 平滑列宽扰动（仅内部点，端点不动，保持单调）
  var out = [];
  for (var p = 0; p < mono.length; p++) {
    var x0 = mono[p];
    if (p === 0 || p === mono.length - 1) { out.push(x0); continue; }
    var t = x0 / (2 * Math.PI);
    var edge = Math.min(1, Math.min(t, 1 - t) * 12);
    var dx = wave * (Math.sin(x0 * 2 + seed) + 0.6 * Math.sin(x0 * 3 + seed * 1.7)) * edge;
    var x1 = x0 + dx;
    if (x1 <= out[out.length - 1] + 1e-6) x1 = out[out.length - 1] + 0.0005;
    if (x1 >= 2 * Math.PI - 1e-4) x1 = 2 * Math.PI - 0.001;
    out.push(x1);
  }
  return out;
}

function mirrorMeshData(d) {
  var verts = d.vertices.map(function (v) { return [-v[0], v[1], v[2]]; });
  var faces = [];
  for (var i = 0; i < d.faces.length; i += 3) faces.push(d.faces[i], d.faces[i + 2], d.faces[i + 1]);
  return { vertices: verts, faces: faces, colors: d.colors };
}
/** toeBumps：鞋头前端 n 个趾鼓包列（袜包脚趾列） */
function toeBumps(x, y, z, halfW, n, color, size, bigDir) {
  n = n || 5; size = size || 0.0062; bigDir = bigDir || 0;
  for (var i = 0; i < n; i++) {
    var fx = x + (i / (n - 1) - 0.5) * 2 * halfW;
    window.gms.part('sphere', { x: fx, y: y, z: z - Math.abs(fx - x) * 0.25, r: size * (1 - Math.abs(i / (n - 1) - 0.5) * 0.3) * (1 + 0.30 * bigDir * (i / (n - 1) - 0.5)), color: color });
  }
}

/** Control-cage loft: deterministic periodic angular and open-u Catmull-Rom sampling. Vertical parts should pass up=[0,0,1]. */
function cageLoft(ctrlRings, opts) {
  opts = opts || {}; var R = ctrlRings.length, N = ctrlRings[0].length;
  var rows = opts.segs || (Array.isArray(opts.dense) ? opts.dense.length + 1 : opts.dense) || 8;
  var cols = opts.sides || (Array.isArray(opts.angularStops) ? opts.angularStops.length : opts.angularStops) || N;
  var up = opts.up ? _n(opts.up) : [0, 1, 0];
  // Vertical cages with up=Z map control [x,y,z] to [x,z,y], keeping rx on X and ry on Z.
  function map(p) { return Math.abs(up[2]) > 0.9 ? [p[0], p[2], p[1]] : p.slice(); }
  var rings = ctrlRings.map(function (r) { return r.map(map); });
  var v = [], f = [], colors = [], props = [];
  function ring(u) {
    var i = Math.min(R - 2, Math.floor(u)), t = Math.max(0, Math.min(1, u - i)), out = [];
    for (var j = 0; j < cols; j++) { var q = j * N / cols, k = Math.floor(q), s = q - k;
      var a = (k + N - 1) % N, b = k % N, c = (k + 1) % N, d = (k + 2) % N;
      function angular(row) { return crPt(rings[row][a], rings[row][b], rings[row][c], rings[row][d], s); }
      out.push(crPt(angular(Math.max(0,i-1)), angular(i), angular(i+1), angular(Math.min(R-1,i+2)), t)); }
    return out;
  }
  for (var i = 0; i <= rows; i++) { var row = ring((R - 1) * i / rows); for (var j = 0; j < cols; j++) { v.push(row[j]); } }
  for (var ri = 0; ri < rows; ri++) for (var j = 0; j < cols; j++) { var a = ri * cols + j, b = ri * cols + (j + 1) % cols, c = (ri + 1) * cols + (j + 1) % cols, d = (ri + 1) * cols + j; f.push(a, b, c, a, c, d); var color = opts.colorFn ? opts.colorFn((ri+0.5)/rows, (j+0.5)/cols) : '#ffffff'; colors.push(color,color); if (opts.faceProps) props.push(opts.faceProps(ri, j), opts.faceProps(ri, j)); }
  return { mesh: { vertices: v, faces: f, colors: colors, props: props }, ctrl: ctrlRings, opts: opts };
}
function cageMove(cage, ringIdx, ptIdx, deltaOrPos){var p=cage.ctrl[ringIdx][ptIdx],d=deltaOrPos; if(d.absolute||d.pos){d=d.pos||d; cage.ctrl[ringIdx][ptIdx]=[d[0],d[1],d[2]];}else cage.ctrl[ringIdx][ptIdx]=[p[0]+d[0],p[1]+d[1],p[2]+d[2]]; var n=cageLoft(cage.ctrl,cage.opts); cage.mesh=n.mesh; return cage;}
function cagePoint(cage,ringIdx,ptIdx){return cage.ctrl[ringIdx][ptIdx].slice();}
function mergeMeshes(parts){var v=[],f=[],c=[],p=[],off=0; parts.forEach(function(m){m=m.mesh||m; v=v.concat(m.vertices||[]); f=f.concat((m.faces||[]).map(function(x){return x+off;})); c=c.concat(m.colors||[]); p=p.concat(m.props||[]); off+= (m.vertices||[]).length;}); return {vertices:v,faces:f,colors:c,props:p};}
/** meshCheck：网格拓扑诊断——面数/瘦长三角（minE/maxE<0.08）/面积比例/退化面 */
function meshCheck(d) {
  var v = d.vertices, f = d.faces;
  var skinny = 0, deg = 0, areas = [];
  for (var i = 0; i + 2 < f.length; i += 3) {
    var A = v[f[i]], B = v[f[i + 1]], C = v[f[i + 2]];
    if (!A || !B || !C) { deg++; continue; }
    var e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    var e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    var nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    var ar = 0.5 * Math.hypot(nx, ny, nz);
    if (ar < 1e-9) { deg++; continue; }
    var l1 = Math.hypot(e1[0], e1[1], e1[2]), l2 = Math.hypot(e2[0], e2[1], e2[2]);
    var l3 = Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]);
    var minE = Math.min(l1, l2, l3), maxE = Math.max(l1, l2, l3);
    if (minE / maxE < 0.08) skinny++;
    areas.push(ar);
  }
  areas.sort(function (a, b) { return a - b; });
  var q = areas[Math.floor(areas.length * 0.05)] || 0, p = areas[Math.floor(areas.length * 0.95)] || 0;
  return { faces: Math.floor(f.length / 3), deg: deg, skinny: skinny, skinnyPct: +(100 * skinny / Math.max(1, areas.length)).toFixed(2), areaRatio: +(p / Math.max(q, 1e-12)).toFixed(1) };
}

/* ===== subdivSurface (subagent B, 2026-09-06) — 追加区，勿改其他区块 ===== */
/**
 * 均匀三角细分与褶皱：每级把每个三角拆成 4 个三角（四边形写成两三角后即为 8 三角）。
 * levels 为非负整数；opts.creases 可为 edgeKey→0..1 表或 (a,b)→0..1 函数，1 保持锐边，0 平滑；
 * opts.colors=true 时继承父三角颜色。算法固定按 faces 输入顺序建立边表，顶点输出顺序为“所有新边点（首次遇边顺序）后所有旧顶点”，
 * 因此同一输入与选项产生完全相同结果。边界边仅生成边点且不填补，开口拓扑保持；只追加本区块，不覆盖其他工具区块。
 */
function subdivSurface(mesh, levels, opts) {
  opts = opts || {};
  levels = Math.max(0, Math.floor(levels || 0));
  var cur = { vertices: (mesh.vertices || []).map(function (p) { return [p[0], p[1], p[2]]; }), faces: (mesh.faces || []).slice(), colors: (mesh.colors || []).slice() };
  function key(a, b) { return a < b ? a + ':' + b : b + ':' + a; }
  function clamp(x) { return Math.max(0, Math.min(1, Number(x) || 0)); }
  function crease(a, b) {
    var k = key(a, b), c = opts.creases;
    if (!c) return 0;
    return typeof c === 'function' ? clamp(c(a, b)) : clamp(c[k] == null ? c[a + ':' + b] : c[k]);
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  for (var lev = 0; lev < levels; lev++) {
    var ov = cur.vertices, of = cur.faces, oc = cur.colors || [], edges = {}, edgeList = [], adj = [], incident = [], boundary = {}, capVerts = {}, sharpSum = [], sharpCount = [], sharpMax = [];
    for (var vi = 0; vi < ov.length; vi++) { adj[vi] = []; incident[vi] = []; sharpSum[vi] = 0; sharpCount[vi] = 0; sharpMax[vi] = 0; }
    function edge(a, b, face) {
      var k = key(a, b), e = edges[k];
      if (!e) { e = edges[k] = { a: Math.min(a, b), b: Math.max(a, b), faces: [], c: crease(a, b) }; edgeList.push(e); }
      e.faces.push(face); return e;
    }
    for (var fi = 0; fi < of.length; fi += 3) {
      var a = of[fi], b = of[fi + 1], c = of[fi + 2];
      var e0 = edge(a, b, fi / 3), e1 = edge(b, c, fi / 3), e2 = edge(c, a, fi / 3);
      adj[a].push(b, c); adj[b].push(a, c); adj[c].push(a, b); incident[a].push(fi / 3); incident[b].push(fi / 3); incident[c].push(fi / 3);
      if (e0.c > 0) { sharpSum[a] += e0.c; sharpSum[b] += e0.c; sharpCount[a]++; sharpCount[b]++; sharpMax[a] = Math.max(sharpMax[a] || 0, e0.c); sharpMax[b] = Math.max(sharpMax[b] || 0, e0.c); }
      if (e1.c > 0) { sharpSum[b] += e1.c; sharpSum[c] += e1.c; sharpCount[b]++; sharpCount[c]++; sharpMax[b] = Math.max(sharpMax[b] || 0, e1.c); sharpMax[c] = Math.max(sharpMax[c] || 0, e1.c); }
      if (e2.c > 0) { sharpSum[c] += e2.c; sharpSum[a] += e2.c; sharpCount[c]++; sharpCount[a]++; sharpMax[c] = Math.max(sharpMax[c] || 0, e2.c); sharpMax[a] = Math.max(sharpMax[a] || 0, e2.c); }
    }
    // Detect planar cap fans: a high-valence vertex with coplanar incident faces is a cap center.
    function fnorm(fi) { var ia = of[fi * 3], ib = of[fi * 3 + 1], ic = of[fi * 3 + 2], a = ov[ia], b = ov[ib], c = ov[ic], u = [b[0]-a[0],b[1]-a[1],b[2]-a[2]], w = [c[0]-a[0],c[1]-a[1],c[2]-a[2]], n = [u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]], l = Math.hypot(n[0],n[1],n[2]); return l < 1e-12 ? [0,0,0] : [n[0]/l,n[1]/l,n[2]/l]; }
    for (var cv = 0; cv < ov.length; cv++) if (incident[cv].length >= 3) {
      var cn = fnorm(incident[cv][0]), planar = true;
      for (var ci = 1; ci < incident[cv].length; ci++) { var nn = fnorm(incident[cv][ci]); if (Math.abs(cn[0]*nn[0]+cn[1]*nn[1]+cn[2]*nn[2]) < 0.999) { planar = false; break; } }
      if (planar) { capVerts[cv] = true; incident[cv].forEach(function (q) { capVerts[of[q*3]] = capVerts[of[q*3+1]] = capVerts[of[q*3+2]] = true; }); }
    }
    edgeList.forEach(function (e) { if (e.faces.length === 1) { boundary[e.a] = boundary[e.b] = true; } });
    var nv = [];
    edgeList.forEach(function (e) {
      var p = mix(ov[e.a], ov[e.b], 0.5), smooth = p;
      if (e.faces.length === 2 && e.c < 1 && !capVerts[e.a] && !capVerts[e.b]) {
        var f0 = e.faces[0] * 3, f1 = e.faces[1] * 3, opp = [], ids = [of[f0], of[f0 + 1], of[f0 + 2], of[f1], of[f1 + 1], of[f1 + 2]];
        for (var ii = 0; ii < ids.length; ii++) if (ids[ii] !== e.a && ids[ii] !== e.b) opp.push(ov[ids[ii]]);
        smooth = [(3*(ov[e.a][0]+ov[e.b][0])+opp[0][0]+opp[1][0])/8, (3*(ov[e.a][1]+ov[e.b][1])+opp[0][1]+opp[1][1])/8, (3*(ov[e.a][2]+ov[e.b][2])+opp[0][2]+opp[1][2])/8];
      }
      nv.push(mix(smooth, p, e.c));
    });
    var edgeIndex = {}, base = edgeList.length;
    edgeList.forEach(function (e, i) { edgeIndex[key(e.a, e.b)] = i; });
    for (var vi2 = 0; vi2 < ov.length; vi2++) {
      var p0 = ov[vi2], ns = adj[vi2], unique = [], seen = {};
      for (var ni = 0; ni < ns.length; ni++) if (!seen[ns[ni]]) { seen[ns[ni]] = 1; unique.push(ns[ni]); }
      if (boundary[vi2] || capVerts[vi2] || !unique.length) { nv.push(p0.slice()); continue; }
      var avg = [0, 0, 0]; unique.forEach(function (j) { avg[0] += ov[j][0]; avg[1] += ov[j][1]; avg[2] += ov[j][2]; });
      avg[0] /= unique.length; avg[1] /= unique.length; avg[2] /= unique.length;
      var sharp = Math.max(sharpMax[vi2] || 0, sharpCount[vi2] ? sharpSum[vi2] / sharpCount[vi2] : 0);
      var w = 0.25 * (1 - sharp);
      nv.push([p0[0] + (avg[0] - p0[0]) * w, p0[1] + (avg[1] - p0[1]) * w, p0[2] + (avg[2] - p0[2]) * w]);
    }
    var nf = [], nc = [];
    function ei(a, b) { return edgeIndex[key(a, b)]; }
    for (var fj = 0; fj < of.length; fj += 3) {
      var A0 = of[fj], B0 = of[fj + 1], C0 = of[fj + 2];
      var A = base + A0, B = base + B0, C = base + C0, ab = ei(A0, B0), bc = ei(B0, C0), ca = ei(C0, A0);
      nf.push(A, ab, ca, ab, B, bc, ca, bc, C, ab, bc, ca);
      var col = oc[fj / 3]; if (opts.colors !== false) { nc.push(col, col, col, col); }
    }
    cur = { vertices: nv, faces: nf, colors: nc };
  }
  return cur;
}
/* ===== end subdivSurface ===== */
