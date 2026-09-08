/* 脚踝浮雕——多边形面数可视化分解 + GIA 单元视图
 * 用法：注入 ganyu-lib.js 后执行本文件。
 * 渲染三种状态：① 平滑着色+线框 ② GIA 单元平铺（每三角一色 + flatShading）
 * ③ 线框；并在页面上给出精确面数统计（总三角/四边形/凸包区/面积分布）。
 */
(function () {
  'use strict';
  var old = document.getElementById('relief-bench');
  if (old) old.remove();

  var leg = profileLoft(
    [[0, 0.02, 0], [0, 0.03, 0], [0, 0.04, 0], [0, 0.05, 0], [0, 0.06, 0], [0, 0.07, 0], [0, 0.08, 0], [0, 0.09, 0]],
    [{ rx: 0.0138, ry: 0.0132 }, { rx: 0.0130, ry: 0.0128 }, { rx: 0.0124, ry: 0.0126 }, { rx: 0.0122, ry: 0.0126 }, { rx: 0.0124, ry: 0.0128 }, { rx: 0.0128, ry: 0.0130 }, { rx: 0.0134, ry: 0.0134 }, { rx: 0.0142, ry: 0.0138 }],
    20, 40, function () { return '#d9d9de'; }, { dataOnly: true });
  reliefYTube(leg, { y: 0.055, th: 0, r: 0.010, h: 0.0028, irr: 0.12, seed: 2.2, leanY: 0.30, leanTh: 0.25 });

  var fs = leg.faces, vs = leg.vertices, SIDES = 40;
  var cols = [], bumpTris = 0, unitColors = [], tris = fs.length / 3;
  var q = 0, areas = [];
  for (var f = 0; f < fs.length; f += 3) {
    var p0 = vs[fs[f]], p1 = vs[fs[f + 1]], p2 = vs[fs[f + 2]];
    var cx = (p0[0] + p1[0] + p2[0]) / 3, cy = (p0[1] + p1[1] + p2[1]) / 3, cz = (p0[2] + p1[2] + p2[2]) / 3;
    var rad = Math.hypot(cx, cz);
    var dth = Math.atan2(Math.sin(Math.atan2(cz, cx)), Math.cos(Math.atan2(cz, cx)));
    var d = Math.hypot(cy - 0.055, rad * dth) / 0.010;
    var inBump = d < 1;
    cols.push(inBump ? '#9fb6c8' : '#d9d9de');
    if (inBump) bumpTris++;
    // 单元面积（mm²）
    var e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    var e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    var nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    areas.push(0.5 * Math.hypot(nx, ny, nz) * 1e6);
  }
  // 每三角一色（GIA 单元视图）
  for (var i = 0; i < tris; i++) {
    var h = ((i * 0.618033988749895) % 1);
    unitColors.push('#' + new THREE.Color().setHSL(h, 0.55, 0.70).getHexString());
  }
  leg.colors = cols;
  var unitData = { vertices: vs, faces: fs.slice(), colors: unitColors };
  var quads = tris - 2 * SIDES; // 总三角 - 两端盖三角(各 SIDES)
  areas.sort(function (a, b) { return a - b; });
  var avg = areas.reduce(function (s, v) { return s + v; }, 0) / areas.length;
  var STAT = {
    verts: vs.length, tris: tris, quads: quads, capTris: 2 * SIDES,
    bumpTris: bumpTris, bumpQuads: Math.round(bumpTris / 2 * 10) / 10,
    triAreaMin: +areas[0].toFixed(2), triAreaAvg: +avg.toFixed(2), triAreaMax: +areas[areas.length - 1].toFixed(2)
  };

  // 渲染（单 WebGL + 2D 拷贝）
  var glCanvas = document.createElement('canvas'); glCanvas.width = 640; glCanvas.height = 480;
  var renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true });
  function bake(canvas, data, opts) {
    canvas.width = 640; canvas.height = 480;
    var scene = new THREE.Scene(); scene.background = new THREE.Color(0x23242a);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    var dl = new THREE.DirectionalLight(0xffffff, 1.05); dl.position.set(4, 6, 5); scene.add(dl);
    var cam = new THREE.PerspectiveCamera(36, 640 / 480, 0.001, 10);
    var vs2 = data.vertices, fs2 = data.faces;
    var pos = new Float32Array(vs2.length * 3);
    for (var i2 = 0; i2 < vs2.length; i2++) { pos[i2 * 3] = vs2[i2][0]; pos[i2 * 3 + 1] = vs2[i2][1]; pos[i2 * 3 + 2] = vs2[i2][2]; }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(fs2), 1));
    if (opts.vertexColors && data.colors && data.colors.length === fs2.length / 3) {
      var carr = new Float32Array(vs2.length * 3), tmp = new THREE.Color();
      for (var f3 = 0; f3 < fs2.length; f3 += 3) {
        tmp.set(data.colors[Math.floor(f3 / 3)]);
        for (var qq = 0; qq < 3; qq++) { var vi = fs2[f3 + qq]; carr[vi * 3] = tmp.r; carr[vi * 3 + 1] = tmp.g; carr[vi * 3 + 2] = tmp.b; }
      }
      geo.setAttribute('color', new THREE.BufferAttribute(carr, 3));
    }
    geo.computeVertexNormals();
    var mat = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.6, metalness: 0.0, flatShading: !!opts.flat, vertexColors: !!opts.vertexColors });
    var mesh = new THREE.Mesh(geo, mat); scene.add(mesh);
    if (!opts.wireOnly) scene.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x14161a, transparent: true, opacity: opts.wireOpacity == null ? 0.55 : opts.wireOpacity })));
    var bb = new THREE.Box3().setFromObject(mesh);
    var center = bb.getCenter(new THREE.Vector3());
    var radius = bb.getSize(new THREE.Vector3()).length() / 2;
    var d = (radius / Math.tan(36 * Math.PI / 360)) * 1.2 + radius;
    var off = {
      iso: [d * 0.8, d * 0.55, d * 0.8],
      front: [d, 0, 0],
      side: [0, 0, d]
    }[opts.view || 'iso'];
    cam.position.copy(center).add(new THREE.Vector3(off[0], off[1], off[2]));
    cam.lookAt(center);
    renderer.setSize(640, 480, false);
    renderer.render(scene, cam);
    var c2 = canvas.getContext('2d');
    c2.clearRect(0, 0, 640, 480);
    c2.drawImage(glCanvas, 0, 0);
    geo.dispose();
  }

  var bench = document.createElement('div');
  bench.id = 'relief-bench';
  bench.style.cssText = 'position:absolute;top:0;left:0;z-index:99999;background:#17181c;padding:14px 16px;font-family:Consolas,Menlo,monospace;color:#cfd3d8;';
  var head = document.createElement('div');
  head.style.cssText = 'font-size:13px;line-height:1.6;margin-bottom:8px;white-space:pre;';
  head.textContent = 'RELIEF 面数分解 — 踝段 20×40 放样 + reliefYTube(r=10mm h=2.8mm)' +
    '\n顶点 ' + STAT.verts + ' · 三角 ' + STAT.tris + '（= 四边形 ' + STAT.quads + ' + 端盖三角 ' + STAT.capTris + '）' +
    '\n凸包区三角 ' + STAT.bumpTris + '（≈ ' + STAT.bumpQuads + ' 四边形）' +
    '\n单元面积 min ' + STAT.triAreaMin + 'mm² / avg ' + STAT.triAreaAvg + 'mm² / max ' + STAT.triAreaMax + 'mm²' +
    '\n左=平滑+线框 中=GIA单元平铺（每三角一色+flat） 右=前视单元平铺';
  bench.appendChild(head);
  var grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  var defs = [
    { data: leg, opts: { view: 'iso', vertexColors: true, flat: false, wireOpacity: 0.5 }, label: 'iso · 平滑+线框' },
    { data: unitData, opts: { view: 'iso', vertexColors: true, flat: true, wireOpacity: 0.35 }, label: 'iso · GIA单元平铺' },
    { data: unitData, opts: { view: 'front', vertexColors: true, flat: true, wireOpacity: 0.35 }, label: 'front(x) · GIA单元平铺' }
  ];
  for (var di = 0; di < defs.length; di++) {
    var col = document.createElement('div');
    var cv = document.createElement('canvas');
    bake(cv, defs[di].data, defs[di].opts);
    var lab = document.createElement('div');
    lab.style.cssText = 'font-size:11px;color:#9aa2ac;margin:2px 0 6px;';
    lab.textContent = defs[di].label;
    col.appendChild(cv); col.appendChild(lab);
    grid.appendChild(col);
  }
  bench.appendChild(grid);
  document.body.appendChild(bench);
  window.__RELIEF_BENCH__ = { stats: STAT, data: leg, unitData: unitData };
})();
