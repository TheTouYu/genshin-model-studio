/**
 * cage branch：从主干长出连续肢体、手指或颈部。两类连接原语：
 *  - extrudeRing(mesh, ringIdx, opts)：只在“开放边界环”上整环分支（内部整环会被拒绝，见 allowInterior 守卫）。
 *  - extrudePatch(mesh, patchVerts, rings, opts)：通用“面片挤出”——摘除一块连通盘面片、
 *    恢复有向边界、以“与原边界共享顶点”的首环长出新环并顶盖。ring-subset 分支，不依赖整环，
 *    也不需要独立 mesh 合并；首环只引用 main 环顶点索引，后续环才追加顶点 → seamCheck 恒 0 缝。
 * mesh 为 {vertices,faces,colors}；profileLoft(dataOnly) 提供的 ringIdx/sides 可定位“环 × 角向”盘。
 * opts：extrudeRing {seg, sides, length, scale, dir, curve, twist, cap, color}；
 *       extrudePatch {axis, color, cap}，rings = [{c:[x,y,z], r, twist?}]（环轴垂直于 axis 的显式圆环）。
 */
(function (root) {
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]); return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 1, 0]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function rotate(v, axis, angle) {
    var c = Math.cos(angle), s = Math.sin(angle), d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2], q = cross(axis, v);
    return [v[0] * c + q[0] * s + axis[0] * d * (1 - c), v[1] * c + q[1] * s + axis[1] * d * (1 - c), v[2] * c + q[2] * s + axis[2] * d * (1 - c)];
  }
  function curveAt(curve, t) {
    if (!curve) return [0, 0, 0];
    if (typeof curve === 'function') return curve(t) || [0, 0, 0];
    if (Array.isArray(curve[0])) {
      if (curve.length === 1) return curve[0].slice();
      var x = t * (curve.length - 1), i = Math.min(curve.length - 2, Math.floor(x)), f = x - i;
      return add(curve[i], mul([curve[i + 1][0] - curve[i][0], curve[i + 1][1] - curve[i][1], curve[i + 1][2] - curve[i][2]], f));
    }
    return curve.slice ? curve.slice() : [0, 0, 0];
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  /** 与轴向垂直的局部正交基 {u,v}，环置于中心 c 时以 u/v 表达截面（环轴 = dir）。 */
  function basis(dir) {
    var ref = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    var u = norm(cross(dir, ref));
    var v = cross(dir, u);
    return { u: u, v: v };
  }
  function extrudeRing(mesh, ringIdx, opts) {
    opts = opts || {};
    var v = mesh.vertices || (mesh.vertices = []), f = mesh.faces || (mesh.faces = []), c = mesh.colors || (mesh.colors = []);
    var sides = opts.sides || mesh.sides || 12;
    var base = mesh.ringIdx && mesh.ringIdx[ringIdx] != null ? mesh.ringIdx[ringIdx] : ringIdx * sides;
    if (base < 0 || base + sides > v.length) throw new Error('extrudeRing: ring index out of range');
    // A full-ring branch is manifold only at an open boundary ring. Interior rings already
    // have two trunk bands; adding another band there creates a non-manifold Y seam.
    if (!opts.allowInterior) {
      var edgeUse = {};
      for (var fi = 0; fi + 2 < f.length; fi += 3) {
        var tri = [f[fi], f[fi + 1], f[fi + 2]];
        for (var ej = 0; ej < sides; ej++) {
          var ea = base + ej, eb = base + ((ej + 1) % sides), hit = 0;
          for (var tk = 0; tk < 3; tk++) for (var tl = tk + 1; tl < 3; tl++) {
            var x = tri[tk], y = tri[tl]; if ((x === ea && y === eb) || (x === eb && y === ea)) hit = 1;
          }
          if (hit) edgeUse[ej] = (edgeUse[ej] || 0) + 1;
        }
      }
      var interior = 0;
      for (var ek = 0; ek < sides; ek++) if ((edgeUse[ek] || 0) > 1) interior++;
      if (interior === sides) throw new Error('extrudeRing: full-ring branch requires an open boundary ring; use a ring subset or allowInterior for diagnostic use');
    }
    var seg = Math.max(1, Math.floor(opts.seg || 4)), scale = opts.scale == null ? 0.72 : opts.scale;
    var dir = norm(opts.dir || [0, 1, 0]), center = [0, 0, 0];
    for (var j = 0; j < sides; j++) { center[0] += v[base + j][0]; center[1] += v[base + j][1]; center[2] += v[base + j][2]; }
    center = mul(center, 1 / sides);
    var rings = [[]]; for (var j0 = 0; j0 < sides; j0++) rings[0].push(base + j0);
    var ref = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    var axisX = norm(cross(dir, ref)), axisZ = norm(cross(axisX, dir));
    for (var k = 1; k <= seg; k++) {
      var t = k / seg, ctr = add(center, add(mul(dir, opts.length == null ? 0.18 * t : opts.length * t), curveAt(opts.curve, t))), ids = [];
      for (var j1 = 0; j1 < sides; j1++) {
        var src = v[base + j1], radial = [src[0] - center[0], src[1] - center[1], src[2] - center[2]];
        // 保留源环的完整截面，再在局部轴上收缩、扭转和推进；首环天然等于主干环。
        var ang = (opts.twist || 0) * t, q = rotate(mul(radial, scale * (1 - 0.12 * t)), dir, ang);
        ids.push(v.length); v.push(add(ctr, q));
      }
      rings.push(ids);
    }
    for (var k2 = 0; k2 < rings.length - 1; k2++) for (var j2 = 0; j2 < sides; j2++) { var n = (j2 + 1) % sides, a = rings[k2][j2], b = rings[k2][n], d = rings[k2 + 1][j2], e = rings[k2 + 1][n]; f.push(a, b, e, a, e, d); c.push(opts.color || '#b8c4d8', opts.color || '#b8c4d8'); }
    if (opts.cap !== 'none') { var last = rings[rings.length - 1], tip = [0, 0, 0]; for (var z = 0; z < sides; z++) { tip[0] += v[last[z]][0]; tip[1] += v[last[z]][1]; tip[2] += v[last[z]][2]; } var ti = v.length; v.push(mul(tip, 1 / sides)); for (var z2 = 0; z2 < sides; z2++) { var zn = (z2 + 1) % sides; f.push(ti, last[z2], last[zn]); c.push(opts.color || '#b8c4d8'); } }
    mesh.sides = sides; mesh.branchRings = mesh.branchRings || []; mesh.branchRings.push({ source: ringIdx, rings: rings.map(function (r) { return r.slice(); }) });
    return mesh;
  }
  function extrudeFace(mesh, faceIdx, opts) {
    opts = opts || {};
    var v = mesh.vertices || (mesh.vertices = []), f = mesh.faces || (mesh.faces = []), c = mesh.colors || (mesh.colors = []);
    var at = faceIdx * 3;
    if (at < 0 || at + 2 >= f.length) throw new Error('extrudeFace: face index out of range');
    var ids = [f[at], f[at + 1], f[at + 2]], a = v[ids[0]], b = v[ids[1]], d = v[ids[2]];
    var ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    var n = norm(cross(ab, ac)), len = opts.length == null ? 0.12 : opts.length;
    var off = mul(n, len), top = ids.map(function (id) { var p = v[id]; var q = add(p, off); v.push(q); return v.length - 1; });
    // Replace the source face with the three side quads and a translated cap.
    f.splice(at, 3, ids[0], ids[1], top[1], ids[0], top[1], top[0], ids[1], ids[2], top[2], ids[1], top[2], top[1], ids[2], ids[0], top[0], ids[2], top[0], top[2], top[0], top[1], top[2]);
    var color = opts.color || c[faceIdx] || '#b8c4d8';
    c.splice(faceIdx, 1, color, color, color, color, color, color, color);
    return mesh;
  }
  /**
   * recoverBoundary：给定一个顶点集合（构成网格表面的连通盘），移除该盘内全部三角形，
   * 恢复其“有向边界环”。任一满足“盘内所有三角形”的三角面会在其后被删除。
   * 有向边界：对盘内每个已定向三角边 (a→b)，若其反向边 (b→a) 不在盘内，则该边为边界边，
   * 且其方向一致地绕孔。从任一边界顶点沿 out 边行走，若回到起点且长度等于边界边数，
   * 则该环是简单环（每个边界顶点出度=入度=1 → 有向一致）。否则视为非法盘并抛错。
   * 返回 { loop, rm, boundaryEdges }：loop 为按边界顺序的顶点索引数组；rm 为盘内三角面序（0 基）。
   */
  function recoverBoundary(mesh, patchVerts) {
    var v = mesh.vertices || [], f = mesh.faces || [];
    var pset = new Set(patchVerts), rm = new Set(), dir = new Set();
    for (var t = 0; t + 2 < f.length; t += 3) {
      var A = f[t], B = f[t + 1], C = f[t + 2];
      if (pset.has(A) && pset.has(B) && pset.has(C)) rm.add(t / 3);
    }
    if (!rm.size) throw new Error('recoverBoundary: patch vertex set covers no triangles');
    rm.forEach(function (ti) {
      var a = f[ti * 3], b = f[ti * 3 + 1], c = f[ti * 3 + 2];
      dir.add(a + '_' + b); dir.add(b + '_' + c); dir.add(c + '_' + a);
    });
    var out = new Map();
    dir.forEach(function (ke) {
      var p = ke.split('_'), a = Number(p[0]), b = Number(p[1]);
      if (!dir.has(b + '_' + a)) out.set(a, b);
    });
    if (!out.size) throw new Error('recoverBoundary: patch is not a disk within the surface (no boundary)');
    var start = out.keys().next().value, loop = [start], cur = start;
    for (var k = 0; k < out.size; k++) {
      var nxt = out.get(cur);
      if (nxt == null) throw new Error('recoverBoundary: boundary disconnected at vertex ' + cur);
      if (nxt === start) break;
      loop.push(nxt); cur = nxt;
    }
    if (loop.length !== out.size) throw new Error('recoverBoundary: patch boundary is not a simple loop (len=' + loop.length + ' edges=' + out.size + '); refusing to attach a limb');
    return { loop: loop.slice(), rm: rm, boundaryEdges: out.size };
  }

  /**
   * extrudePatch：通用“面片挤出”——从连通盘面片摘除并长出连续肢体/颈/指。
   * 这是 ring-subset 分支原语：不需要主干整环，只需把盘内三角形删除后恢复的有向边界作为首环，
   * 后续环全部为新顶点并“显式定位”（每环给定中心 c 与半径 r），且与原边界共享顶点索引（ring0=边界），
   * 因此不会产生“重合坐标不同索引”的拼接缝。
   *
   * 环为垂直于 limb 轴线的圆：逐边界顶点求出其在 (u,v) 基下的角度，环顶点落于该角度，
   * 保证 ring0[j] 与 ring[k][j] 同角向 → 连接不扭转。末端以最后环心盖顶。
   *
   * opts={axis(default [0,-1,0]), color, cap(default true)}。
   * 无 allowInterior 旁路：任何非法盘（非简单环、无边界、边界断开）都直接抛错。
   * 返回 { loop, B }。
   */
  function extrudePatch(mesh, patchVerts, rings, opts) {
    opts = opts || {};
    var v = mesh.vertices || (mesh.vertices = []), colors = mesh.colors;
    var loop, rm, B;
    if (opts.loop) { loop = opts.loop.slice(); rm = new Set(); B = loop.length; }
    else { var rb = recoverBoundary(mesh, patchVerts); loop = rb.loop; rm = rb.rm; B = loop.length; }
    var hc = [0, 0, 0];
    for (var j0 = 0; j0 < B; j0++) { hc[0] += v[loop[j0]][0]; hc[1] += v[loop[j0]][1]; hc[2] += v[loop[j0]][2]; }
    hc[0] /= B; hc[1] /= B; hc[2] /= B;
    var axis = norm(opts.axis || [0, -1, 0]), b = basis(axis), u = b.u, vv = b.v;
    // 环角向：统一“满圆”分布（2π*j/B），相位锚定到首边界顶点的径向；仅借边界定相位/顺序，
    // 绝不用每个边界顶点的 atan2 落点（边界角投影会挤成窄弧 → 截面成平面扇/细鳍）。
    // 相同下标 j 的边界环与生成环对齐 → 环形连接保持顺序、不扭转，截面为完整圆。
    var p0r = sub(v[loop[0]], hc);
    var phase = Math.atan2(dot(p0r, vv), dot(p0r, u));
    var ang = [];
    for (var j1 = 0; j1 < B; j1++) ang.push(phase + 2 * Math.PI * j1 / B);
    // 重建面 + 颜色（同一跳过顺序 → colors 与 faces 保持对齐，避免颜色错位横向溢出）
    var nf = [], nc = [];
    for (var t0 = 0; t0 < mesh.faces.length / 3; t0++) {
      if (rm.has(t0)) continue;
      nf.push(mesh.faces[t0 * 3], mesh.faces[t0 * 3 + 1], mesh.faces[t0 * 3 + 2]);
      if (colors) nc.push(colors[t0]);
    }
    var ringIds = [loop.slice()];
    for (var k = 0; k < rings.length; k++) {
      var rs = rings[k], ctr = rs.c || [0, 0, 0], r = rs.r == null ? 0.05 : rs.r, ids = [];
      // Rotate the same frame through ankle bends without reordering columns.
      var ru = rs.ru == null ? r : rs.ru, rv = rs.rv == null ? r : rs.rv;
      var turn = rs.bend || 0;
      // Per-ring local frame: explicit frame > dir > concentric (u,v). Keeps the full-circle
      // angular distribution (ang[]) and per-vertex index correspondence, so columns never reorder.
      var ku = u, kv = vv, ax = axis;
      if (rs.frame && rs.frame.u && rs.frame.v) { ku = norm(rs.frame.u); kv = norm(rs.frame.v); }
      else if (rs.dir) { var fb = basis(norm(rs.dir)); ku = fb.u; kv = fb.v; ax = norm(rs.dir); }
      if (turn) { ku = rotate(ku, [1, 0, 0], turn); kv = rotate(kv, [1, 0, 0], turn); }
      // mix: 0 = conform to the socket loop (clean in-plane collar), 1 = full circular tube ring.
      // Blending POSITIONS (not re-parameterising angles) lets each rim vertex slide from its
      // socket position toward its circle radial gradually -> no 90-degree plane slam, no twist.
      var mix = rs.mix == null ? (rs.conform ? 0 : 1) : rs.mix;
      var sc = rs.scale == null ? 1 : rs.scale, offv = rs.offset == null ? 0 : rs.offset;
      var ringAng = ang;
      if (rs.radial) {
        // radial 投影：把每个边界顶点按「它自己在环 u/v 基下的方位角」落点（保角向、不扫掠），
        // 避免带面横扫过主干/cap；边界环包围肢体根，故方位角覆盖整圆。
        ringAng = [];
        for (var ja = 0; ja < B; ja++) { var lv = sub(v[loop[ja]], hc); ringAng.push(Math.atan2(dot(lv, kv), dot(lv, ku))); }
      }
      for (var j = 0; j < B; j++) {
        var lp = v[loop[j]];
        var px = hc[0] + (lp[0] - hc[0]) * sc + ax[0] * offv;
        var py = hc[1] + (lp[1] - hc[1]) * sc + ax[1] * offv;
        var pz = hc[2] + (lp[2] - hc[2]) * sc + ax[2] * offv;
        var ca = Math.cos(ringAng[j]), sa = Math.sin(ringAng[j]);
        // superellipse 指数（<1 方形化）：sign(cos)*|cos|^exp / sign(sin)*|sin|^exp
        var ce = ca, se = sa;
        if (rs.exp) { var e = rs.exp; ce = (ca<0?-1:1)*Math.pow(Math.abs(ca), e); se = (sa<0?-1:1)*Math.pow(Math.abs(sa), e); }
        var qx = ctr[0] + ru * ce * ku[0] + rv * se * kv[0];
        var qy = ctr[1] + ru * ce * ku[1] + rv * se * kv[1];
        var qz = ctr[2] + ru * ce * ku[2] + rv * se * kv[2];
        ids.push(v.length);
        v.push([px + (qx - px) * mix, py + (qy - py) * mix, pz + (qz - pz) * mix]);
      }
      ringIds.push(ids);
    }
    var color = opts.color || '#b8c4d8';
    for (var k2 = 0; k2 < ringIds.length - 1; k2++) {
      var A = ringIds[k2], N = ringIds[k2 + 1];
      for (var j2 = 0; j2 < B; j2++) { var n = (j2 + 1) % B, a = A[j2], b2 = A[n], c2 = N[n], d = N[j2]; nf.push(a, b2, c2, a, c2, d); if (colors) nc.push(color, color); }
    }
    if (opts.cap !== false) {
      var last = ringIds[ringIds.length - 1], cy = [0, 0, 0];
      for (var z = 0; z < B; z++) { cy[0] += v[last[z]][0]; cy[1] += v[last[z]][1]; cy[2] += v[last[z]][2]; }
      cy[0] /= B; cy[1] /= B; cy[2] /= B;
      var ci = v.length; v.push(cy);
      for (var z2 = 0; z2 < B; z2++) { var zn = (z2 + 1) % B; nf.push(ci, last[z2], last[zn]); if (colors) nc.push(color); }
    }
    mesh.faces = nf;
    if (colors) mesh.colors = nc;
    return { loop: loop.slice(), B: B, rings: ringIds };
  }
  root.extrudeRing = extrudeRing; root.extrudeFace = extrudeFace; root.extrudePatch = extrudePatch; root.recoverBoundary = recoverBoundary;
  if (typeof module !== 'undefined') module.exports = { extrudeRing: extrudeRing, extrudeFace: extrudeFace, extrudePatch: extrudePatch, recoverBoundary: recoverBoundary };
})(typeof window !== 'undefined' ? window : globalThis);
