/* ganyu-head-new.js — 足球服甘雨 头部独立组件（头发 + 双角 + 脸细节）。
 *
 * 世界坐标，与 body-r2.mesh.json 同系：+Y 上、+Z 前、面朝 +Z、x=0 中线。
 * 输出 window.__GMS_HEAD_PARTS__ = { hair:{vertices,faces,colors}, horns:[hornL,hornR], face:{vertices,faces,colors} }。
 * 边界：只新建本文件；不改 body-cage / cage-branch / lib / body-cage.test.ts；
 * 不调用 gms.clear()；不用 mergeMeshes 并入人体；各件自成一 mesh（水密、自交 0）。
 * 头参照（body-r2，实测）：crown y=1.60、jaw ~1.35、头半宽 ~0.087、额前 +z~0.082、后脑 -z~-0.101、头中心 z~-0.008。
 */
(function () {
  'use strict';
  var PAL = {
    hairBright: '#A8D8F0', hairMid: '#6FA5D5', hairDeep: '#3E6FA8', hairPurple: '#6C79C9',
    skin: '#F5C9A6', hornOuter: '#2A2A2E', hornInner: '#7A1F2B', hornBase: '#C9A66B',
    eye: '#4A8FE0', brow: '#3E6FA8', mouth: '#C96A6A'
  };
  var H = { cx: 0, cz: -0.008 };

  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  function closedLoft(rings, colorFn) {
    var n = rings[0].length, v = [], f = [], c = [], bases = [], i, j;
    for (i = 0; i < rings.length; i++) { bases.push(v.length); for (j = 0; j < n; j++) v.push(rings[i][j].slice()); }
    for (i = 0; i < rings.length - 1; i++) for (j = 0; j < n; j++) {
      var a = bases[i] + j, b = bases[i] + (j + 1) % n, d = bases[i + 1] + j, e = bases[i + 1] + (j + 1) % n;
      f.push(a, b, e, a, e, d); var col = colorFn(i, j); c.push(col, col);
    }
    function cap(base) { var cx = 0, cy = 0, cz = 0, k; for (k = 0; k < n; k++) { cx += v[base + k][0]; cy += v[base + k][1]; cz += v[base + k][2]; } cx /= n; cy /= n; cz /= n; var ci = v.length; v.push([cx, cy, cz]); for (k = 0; k < n; k++) { var a = base + k, b = base + (k + 1) % n; f.push(ci, a, b); c.push(colorFn(-1, k)); } }
    cap(bases[0]); cap(bases[rings.length - 1]);
    return { vertices: v, faces: f, colors: c };
  }

  // 水平“环”：x=cx+rx*cosθ，z = cz + (sinθ>=0 ? front : back)*sinθ。
  // front/back 均为 **正幅度**：sinθ>0(+z 前) 用 front，sinθ<0(-z 后) 用 back*负 → 得到 -z。
  function headRing(y, rx, front, back, n) {
    var cx = H.cx, cz = H.cz, pts = [], j;
    for (j = 0; j < n; j++) { var t = j / n * 2 * Math.PI, co = Math.cos(t), si = Math.sin(t); pts.push([cx + rx * co, y, cz + (si >= 0 ? front : back) * si]); }
    return pts;
  }

  function makeHair() {
    var R = [
      [1.30, 0.076, 0.028, 0.082],
      [1.36, 0.084, 0.042, 0.098],
      [1.42, 0.089, 0.050, 0.105],
      [1.46, 0.091, 0.060, 0.106],
      [1.50, 0.092, 0.072, 0.106],
      [1.53, 0.093, 0.076, 0.105],
      [1.57, 0.087, 0.070, 0.098],
      [1.61, 0.078, 0.058, 0.086],
      [1.645, 0.048, 0.038, 0.050]
    ].map(function (r) { return headRing(r[0], r[1], r[2], r[3], 24); });
    function colorFn(i) { if (i < 0) return PAL.hairDeep; var y = R[i][0]; if (y > 1.54) return PAL.hairBright; if (y > 1.42) return PAL.hairMid; return PAL.hairDeep; }
    return outward(closedLoft(R, colorFn));
  }

  function frameTube(path, radii, colorFn, n) {
    var v = [], f = [], c = [], bases = [], i, j;
    for (i = 0; i < path.length; i++) {
      var p0 = path[Math.max(0, i - 1)], p1 = path[Math.min(path.length - 1, i + 1)], tg = norm([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
      var ref = Math.abs(tg[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u = norm(cross(tg, ref)), w = cross(tg, u);
      bases.push(v.length);
      for (j = 0; j < n; j++) { var t = j / n * 2 * Math.PI, r = radii[i]; v.push([path[i][0] + r * Math.cos(t) * u[0] + r * Math.sin(t) * w[0], path[i][1] + r * Math.cos(t) * u[1] + r * Math.sin(t) * w[1], path[i][2] + r * Math.cos(t) * u[2] + r * Math.sin(t) * w[2]]); }
    }
    for (i = 0; i < path.length - 1; i++) for (j = 0; j < n; j++) { var a = bases[i] + j, b = bases[i] + (j + 1) % n, d = bases[i + 1] + j, e = bases[i + 1] + (j + 1) % n; f.push(a, b, e, a, e, d); var col = colorFn(i); c.push(col, col); }
    function cap(base, center) { var ci = v.length; v.push(center); for (var k = 0; k < n; k++) { var a = base + k, b = base + (k + 1) % n; f.push(ci, a, b); c.push(colorFn(-1)); } }
    cap(bases[0], path[0]); cap(bases[path.length - 1], path[path.length - 1]);
    return { vertices: v, faces: f, colors: c };
  }
  function hornColor(i, len) { var t = len > 1 ? i / (len - 1) : 0; if (t < 0.18) return PAL.hornBase; if (t < 0.40) return PAL.hornInner; return PAL.hornOuter; }
  function makeHorn(s) {
    var path = [[s * 0.052, 1.575, -0.02], [s * 0.072, 1.61, -0.03], [s * 0.086, 1.66, -0.05], [s * 0.080, 1.715, -0.07]];
    var radii = [0.019, 0.015, 0.010, 0.004];
    return frameTube(path, radii, function (i) { return hornColor(i, path.length); }, 12);
  }
  var hornR = outward(makeHorn(1)), hornL = outward(makeHorn(-1));

  function box(cx, cy, cz, w, h, d, color, tilt) {
    var hw = w / 2, hh = h / 2, hd = d / 2, rot = tilt || 0, cos = Math.cos(rot), sin = Math.sin(rot);
    var cor = [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd], [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]];
    var vs = [];
    for (var i = 0; i < 8; i++) { var x = cor[i][0], y = cor[i][1]; vs.push([cx + (x * cos - y * sin), cy + (x * sin + y * cos), cz + cor[i][2]]); }
    var q = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], faces = [], colors = [];
    for (var k = 0; k < 6; k++) { var a = q[k][0], b = q[k][1], c2 = q[k][2], d2 = q[k][3]; faces.push(a, b, c2, a, c2, d2); for (var x = 0; x < 2; x++) colors.push(color); }
    return { vertices: vs, faces: faces, colors: colors };
  }
  function mergeParts(parts) { var v = [], f = [], c = [], off = 0; parts.forEach(function (m) { v = v.concat(m.vertices); f = f.concat(m.faces.map(function (x) { return x + off; })); c = c.concat(m.colors); off += m.vertices.length; }); return { vertices: v, faces: f, colors: c }; }
  // 使闭合件法线朝外（含背面对消，仅后向剔除可见）。
  function outward(m) { var i, t; for (i = 0; i < m.faces.length; i += 3) { t = m.faces[i + 1]; m.faces[i + 1] = m.faces[i + 2]; m.faces[i + 2] = t; } return m; }
  var eyeL = box(-0.038, 1.475, 0.085, 0.032, 0.022, 0.012, PAL.eye, 0.15);
  var eyeR = box(0.038, 1.475, 0.085, 0.032, 0.022, 0.012, PAL.eye, -0.15);
  var browL = box(-0.038, 1.515, 0.088, 0.034, 0.009, 0.009, PAL.brow, 0.12);
  var browR = box(0.038, 1.515, 0.088, 0.034, 0.009, 0.009, PAL.brow, -0.12);
  var mouth = box(0, 1.400, 0.082, 0.026, 0.008, 0.012, PAL.mouth, 0);
  var face = outward(mergeParts([eyeL, eyeR, browL, browR, mouth]));

  var holder = (typeof window !== 'undefined' ? window : globalThis);
  holder.__GMS_HEAD_PARTS__ = { hair: makeHair(), horns: [hornL, hornR], face: face };
  if (typeof module !== 'undefined' && module.exports) module.exports = { __GMS_HEAD_PARTS__: holder.__GMS_HEAD_PARTS__ };
})();
