/**
 * 断缝/连续性检测与最小比例报告。
 * 判定式：seamEdges > 0 或 openEdges > 0 即不是一体网格（评审不合格）。
 * 拼接 vs 主干挤出：拼接件有坐标重合但索引不同的边；主干挤出共享同一顶点索引，故 seamEdges=0。
 */
(function (root) {
  function coordKey(p, eps) { return [p[0], p[1], p[2]].map(function (x) { return Math.round(x / eps); }).join(','); }
  function edgeKey(a, b) { return a < b ? a + ':' + b : b + ':' + a; }
  function connectedComponents(mesh) {
    var v = mesh.vertices || [], f = mesh.faces || [], parent = [], rank = [], seen = new Set();
    for (var i = 0; i < v.length; i++) { parent[i] = i; rank[i] = 0; }
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function unite(a, b) { a = find(a); b = find(b); if (a === b) return; if (rank[a] < rank[b]) { var t = a; a = b; b = t; } parent[b] = a; if (rank[a] === rank[b]) rank[a]++; }
    for (var j = 0; j + 2 < f.length; j += 3) { unite(f[j], f[j + 1]); unite(f[j + 1], f[j + 2]); unite(f[j + 2], f[j]); }
    for (var k = 0; k < f.length; k++) seen.add(find(f[k]));
    return seen.size;
  }
  function seamCheck(mesh, eps) {
    eps = eps || 1e-6;
    var v = mesh.vertices || [], f = mesh.faces || [], edges = new Map();
    for (var i = 0; i + 2 < f.length; i += 3) {
      var tri = [f[i], f[i + 1], f[i + 2]];
      for (var j = 0; j < 3; j++) {
        var a = tri[j], b = tri[(j + 1) % 3], k = edgeKey(a, b);
        var e = edges.get(k); if (!e) { e = { a: Math.min(a, b), b: Math.max(a, b), count: 0 }; edges.set(k, e); }
        e.count++;
      }
    }
    var openEdges = 0, nonManifoldEdges = 0, coordGroups = new Map();
    var parent = [], rank = [];
    for (var vi = 0; vi < v.length; vi++) { parent[vi] = vi; rank[vi] = 0; }
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function unite(a, b) { a = find(a); b = find(b); if (a === b) return; if (rank[a] < rank[b]) { var t = a; a = b; b = t; } parent[b] = a; if (rank[a] === rank[b]) rank[a]++; }
    edges.forEach(function (e) {
      if (e.count === 1) openEdges++;
      if (e.count > 2) nonManifoldEdges++;
      unite(e.a, e.b);
      var ka = coordKey(v[e.a] || [0, 0, 0], eps), kb = coordKey(v[e.b] || [0, 0, 0], eps);
      var ck = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      var list = coordGroups.get(ck); if (!list) { list = []; coordGroups.set(ck, list); }
      list.push(e);
    });
    var seams = [];
    coordGroups.forEach(function (list) {
      for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
        if (list[i].a !== list[j].a || list[i].b !== list[j].b) seams.push({ verts: [list[i].a, list[i].b], count: list[i].count + list[j].count });
      }
    });
    var components = connectedComponents(mesh);
    return { openEdges: openEdges, nonManifoldEdges: nonManifoldEdges, seamEdges: seams.length, components: components, onePiece: openEdges === 0 && nonManifoldEdges === 0 && seams.length === 0 && components === 1, watertight: openEdges === 0 && nonManifoldEdges === 0 && seams.length === 0, seams: seams };
  }
  function proportionReport(mesh, bands) {
    var v = mesh.vertices || [], out = {};
    (bands || []).forEach(function (b) {
      var pts = v.filter(function (p) { return p[1] >= b.y0 && p[1] <= b.y1; });
      if (!pts.length) return;
      var xs = pts.map(function (p) { return p[0]; }), zs = pts.map(function (p) { return p[2]; });
      out[b.name] = { width: +(Math.max.apply(Math, xs) - Math.min.apply(Math, xs)).toFixed(4), depth: +(Math.max.apply(Math, zs) - Math.min.apply(Math, zs)).toFixed(4), count: pts.length };
    });
    function ratio(a, b) { return out[a] && out[b] ? +(out[a].width / Math.max(out[b].width, 1e-9)).toFixed(3) : null; }
    out.ratios = { shoulderToWaist: ratio('shoulder', 'waist'), palmToFinger: ratio('palm', 'finger') };
    return out;
  }
  root.seamCheck = seamCheck; root.connectedComponents = connectedComponents; root.proportionReport = proportionReport;
  if (typeof module !== 'undefined') module.exports = { seamCheck: seamCheck, connectedComponents: connectedComponents, proportionReport: proportionReport };
})(typeof globalThis !== 'undefined' ? globalThis : this);
