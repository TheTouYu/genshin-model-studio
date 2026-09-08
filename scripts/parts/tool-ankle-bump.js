/* 工具表达能力严格验证：脚踝凸包（4/5 多边形）单独复原台
 * 变体：
 *   A  polyDomePatch(rings=1, sides=5) → 5 三角（中心扇）
 *   B  polyDomePatch(rings=1, sides=4) → 4 三角（中心扇）
 *   C  polyDomePatch(rings=2, sides=5) → 5 + 10 = 15 三角（对比：双层瓣）
 * 每个变体输出 meshCheck 数值，并从 top/sideX/sideY/iso 四视角着色+线框渲染。
 * 依赖：ganyu-lib（polyDomePatch/meshCheck）+ window.THREE（r160）。
 */
(function () {
  'use strict';
  var old = document.getElementById('ankle-bench');
  if (old) old.remove();

  var R = 0.010, H = 0.0028;
  var SPEC = [
    { key: 'A', rings: 3, sides: 8, tint: '#e8e8ec' },
    { key: 'B', rings: 4, sides: 8, tint: '#dce8f2' },
    { key: 'C', rings: 4, sides: 10, tint: '#e6dfea' }
  ];
  var V = {};
  var meta = {};
  for (var si = 0; si < SPEC.length; si++) {
    var sp = SPEC[si];
    meta[sp.key] = sp;
    V[sp.key] = polyDomePatch({
      x: 0, y: 0, z: 0, r: R, h: H, rings: sp.rings, sides: sp.sides,
      colorFn: function () { return sp.tint; }
    });
  }
  var checks = {};
  for (var k in V) checks[k] = meshCheck(V[k]);
  var views = ['top', 'sideX', 'sideY', 'iso', 'sideX-zoom'];

  // 上下文列：把 A（5 边凸包）旋转贴到本工具放样的踝段侧面
  var legData = profileLoft(
    [[0, 0.030, 0], [0, 0.055, 0], [0, 0.085, 0]],
    [{ rx: 0.0125, ry: 0.0120 }, { rx: 0.0110, ry: 0.0115 }, { rx: 0.0128, ry: 0.0125 }],
    8, 16, function () { return '#d9d9de'; }, { dataOnly: true });
  var ctxPatch = polyDomePatch({
    x: 0, y: 0, z: 0, r: 0.010, h: 0.0028, rings: 4, sides: 8,
    pos: function (px, py, pz) { return [pz + 0.0102, py + 0.055, -px]; },
    colorFn: function () { return '#9fb6c8'; }
  });
  function mergeData(a, b) {
    var off = a.vertices.length;
    var out = { vertices: a.vertices.concat(b.vertices), faces: a.faces.concat(b.faces.map(function (f) { return f + off; })), colors: a.colors.concat(b.colors) };
    return out;
  }
  var CTX = mergeData(legData, ctxPatch);
  var ctxViews = ['ctx-iso', 'ctx-front', 'ctx-zoom'];
  var ctxChecks = { leg: meshCheck(legData), patch: meshCheck(ctxPatch), total: meshCheck(CTX) };

  // 单 WebGL 渲染器 + 2D 拷贝：避免多上下文被浏览器回收导致画布空白
  var glCanvas = document.createElement('canvas'); glCanvas.width = 300; glCanvas.height = 220;
  var renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true });

  function bake(canvas, data, view) {
    canvas.width = 300; canvas.height = 220;
    var scene = new THREE.Scene(); scene.background = new THREE.Color(0x23242a);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    var dl = new THREE.DirectionalLight(0xffffff, 1.0); dl.position.set(3, 5, 4); scene.add(dl);
    var cam = new THREE.PerspectiveCamera(38, 300 / 220, 0.001, 10);
    var vs = data.vertices, fs = data.faces;
    var pos = new Float32Array(vs.length * 3);
    for (var i = 0; i < vs.length; i++) { pos[i * 3] = vs[i][0]; pos[i * 3 + 1] = vs[i][1]; pos[i * 3 + 2] = vs[i][2]; }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(fs), 1));
    var mat = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.55, metalness: 0.05 });
    if (data.colors && data.colors.length === fs.length / 3) {
      var cattr = new Float32Array(vs.length * 3);
      var tmp = new THREE.Color();
      for (var f = 0; f < fs.length; f += 3) {
        tmp.set(data.colors[Math.floor(f / 3)]);
        for (var q = 0; q < 3; q++) {
          var vi = fs[f + q];
          cattr[vi * 3] = tmp.r; cattr[vi * 3 + 1] = tmp.g; cattr[vi * 3 + 2] = tmp.b;
        }
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cattr, 3));
      mat.vertexColors = true;
    }
    geo.computeVertexNormals();
    var mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    scene.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x14161a, transparent: true, opacity: 0.62 })));
    var bb = new THREE.Box3().setFromObject(mesh);
    var center = bb.getCenter(new THREE.Vector3());
    var radius = bb.getSize(new THREE.Vector3()).length() / 2;
    var dFull = (radius / Math.tan(38 * Math.PI / 360)) * 1.25 + radius;
    var dZoom = (radius / Math.tan(38 * Math.PI / 360)) * 0.52 + radius * 0.2;
    var off = {
      top: [0, 0, dFull],
      sideX: [dFull, 0, 0],
      sideY: [0, dFull, 0],
      iso: [dFull * 0.78, dFull * 0.62, dFull * 0.78],
      'sideX-zoom': [dZoom, 0, 0],
      'ctx-iso': [dFull * 0.8, dFull * 0.55, dFull * 0.8],
      'ctx-front': [dFull, 0, 0],
      'ctx-zoom': [dZoom * 0.75, dZoom * 0.45, dZoom * 0.55]
    }[view];
    cam.position.copy(center).add(new THREE.Vector3(off[0], off[1], off[2]));
    cam.lookAt(center);
    renderer.setSize(300, 220, false);
    renderer.render(scene, cam);
    var c2 = canvas.getContext('2d');
    c2.clearRect(0, 0, 300, 220);
    c2.drawImage(glCanvas, 0, 0);
    geo.dispose();
  }

  var bench = document.createElement('div');
  bench.id = 'ankle-bench';
  bench.style.cssText = 'position:absolute;top:0;left:0;z-index:99999;background:#17181c;padding:14px 16px;font-family:Consolas,Menlo,monospace;color:#cfd3d8;';
  var grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,300px);gap:10px;';
  var order = ['A', 'B', 'C'];
  for (var vi = 0; vi < order.length; vi++) {
    var key = order[vi], d = V[key], c = checks[key];
    var col = document.createElement('div');
    var head = document.createElement('div');
    head.style.cssText = 'font-size:12px;line-height:1.5;margin-bottom:4px;white-space:pre;';
    head.textContent = key + ': ' + c.faces + ' faces · rings=' + meta[key].rings + ' sides=' + meta[key].sides +
      '\ndeg=' + c.deg + ' skinny%=' + c.skinnyPct + ' areaRatio=' + c.areaRatio +
      '\nsize=' + (R * 1000).toFixed(0) + 'mm r · h=' + (H * 1000).toFixed(1) + 'mm rimZ=0';
    col.appendChild(head);
    for (var vv = 0; vv < views.length; vv++) {
      var cv = document.createElement('canvas');
      bake(cv, d, views[vv]);
      var lab = document.createElement('div');
      lab.style.cssText = 'font-size:11px;color:#9aa2ac;margin:2px 0 6px;';
      lab.textContent = views[vv];
      col.appendChild(cv); col.appendChild(lab);
    }
    grid.appendChild(col);
  }
  // 上下文列
  var colC = document.createElement('div');
  var headC = document.createElement('div');
  headC.style.cssText = 'font-size:12px;line-height:1.5;margin-bottom:4px;white-space:pre;';
  headC.textContent = 'CTX: A 贴踝段侧面 (leg 288f + patch ' + ctxChecks.patch.faces + 'f)' +
    '\ndeg=' + ctxChecks.total.deg + ' skinny%=' + ctxChecks.total.skinnyPct + ' areaRatio=' + ctxChecks.total.areaRatio +
    '\npatch: ' + ctxChecks.patch.faces + ' faces · h=2.8mm · 贴 +x 外侧面';
  colC.appendChild(headC);
  for (var cvv = 0; cvv < ctxViews.length; cvv++) {
    var cv2 = document.createElement('canvas');
    bake(cv2, CTX, ctxViews[cvv]);
    var lab2 = document.createElement('div');
    lab2.style.cssText = 'font-size:11px;color:#9aa2ac;margin:2px 0 6px;';
    lab2.textContent = ctxViews[cvv];
    colC.appendChild(cv2); colC.appendChild(lab2);
  }
  grid.appendChild(colC);
  bench.appendChild(grid);
  document.body.appendChild(bench);
  var ribbon = document.createElement('div');
  ribbon.style.cssText = 'font-size:12px;margin-bottom:8px;color:#e8ecef;';
  ribbon.textContent = 'ANKLE BUMP BENCH — 工具多边形表达能力验证（着色+线框叠加）';
  bench.insertBefore(ribbon, grid);
  window.__ANKLE_BENCH__ = { variants: V, checks: checks, views: views, ctx: { data: CTX, checks: ctxChecks, views: ctxViews } };
})();
