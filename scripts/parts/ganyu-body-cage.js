/* 甘雨人体一体化粗骨架（R1，面片挤出版）：
 * 单个流形网格 = 躯干/头连续放样 + 肩部侧向面片挤出双臂 + 骨盆左右底侧面片挤出双腿。
 * 关键：肢体不是独立放样后 index 合并，而是 extrudePatch 从主干摘除一块连通盘面片、
 * 恢复有向边界、以“与边界共享顶点”的首环长出新环并顶盖——共享同一顶点索引，seamCheck 恒 0 缝。
 * 禁止整环内部挤出（extrudeRing）与独立 mesh 合并（mergeMeshes）。
 *
 * 坐标：+Y 上（高），+X 左右宽，+Z 前。身高约 1.60 m，面朝 +Z。
 * 依赖：ganyu-lib.js 的 profileLoft（dataOnly + 前后不对称截面）、ganyu-cage-branch.js 的 extrudePatch。
 */
(function () {
  'use strict';
  var SKIN = '#f3c9a7', CLOTH = '#d9d9de', SOCK = '#9aa2ab';
  var SIDES = 16;
  // World-space profiles store [half width, front depth, back depth] in metres.
  var path = [0.80, 0.92, 1.04, 1.16, 1.25, 1.30, 1.32, 1.34, 1.36, 1.47, 1.54, 1.58, 1.60].map(function (y) { return [0, y, 0]; });
  // profileLoft's second basis vector is -Z for this upward path.
  // Therefore world front (+Z) uses the local B fields, not the F names.
  var profiles = [
    [0.125,0.085,0.100], [0.155,0.100,0.125], [0.120,0.085,0.085],
    [0.165,0.135,0.100], [0.183,0.102,0.092], [0.172,0.077,0.080],
    [0.062,0.052,0.050], [0.044,0.043,0.045], [0.061,0.068,0.067],
    [0.087,0.087,0.101], [0.082,0.078,0.092], [0.043,0.043,0.050],
    [0.018,0.020,0.025]
  ];
  var sections = profiles.map(function (p) { return {rx:p[0],ryB:p[1],ryF:p[2]}; });
  var colorFn = function (i) { return i < 7 ? CLOTH : SKIN; };
  var mesh = profileLoft(path, sections, path.length - 1, SIDES, colorFn, { dataOnly: true, cap: 'both', up: [0, 0, 1] });
  // Lift the midline into a crotch arch rather than leaving a flat pelvic shelf.
  for (var j = 0; j < SIDES; j++) {
    var p = mesh.vertices[j]; p[1] += 0.055 * (1 - Math.abs(p[0]) / profiles[0][0]);
  }
  mesh.vertices[SIDES * path.length][1] = 0.855;
  // ringIdx 元数据（profileLoft dataOnly 提供）：躯干每环起点；用于把面片盘定为“环 × 角向”块。
  var ri = mesh.ringIdx;
  function blockVerts(rings, angles) {
    var out = [];
    for (var r = 0; r < rings.length; r++) for (var a = 0; a < angles.length; a++) out.push(ri[rings[r]] + angles[a]);
    return out;
  }
  // 肩部侧向面片：环 {2,3,4}(y1.04~1.28 肋-肩) × 角向 {15,0,1}（+X 侧）/ {7,8,9}（-X 侧）。
  var armL = blockVerts([3, 4, 5], [15, 0, 1]);
  var armR = blockVerts([3, 4, 5], [7, 8, 9]);
  // 骨盆左右底侧面片：环 {0,1}(髋底 y0.80~0.92) × 角向，左右镜像。
  // 把裆部 cap 顶点(tip=208)并入双腿面片：删掉腿根下多余的 cap 三角，避免腿带横扫裆部。
  var legL = blockVerts([0, 1], [15, 0, 1, 2]).concat([SIDES * path.length]);
  var legR = blockVerts([0, 1], [6, 7, 8, 9]).concat([SIDES * path.length]);
  // 臂控制环：肩窝贴合边界(朝 +X 外张) → 逐环 mix 由 0(边界形) 渐变到 1(圆)，
  // 同时局部 dir 由 +X 转到 -Y(下垂)。mix 对位置做线性插值，杜绝 90° 骤变与扭转。
  function armRings(s) {
    return [
      // 肩窝mix环一律 dir=+X（与边界同面，仅在面内把边界形圆化），直到 mix=1 才逐环把 dir 转向 -Y。
      // 避免「loop 形 + 倾斜圆」混合产生的折角。
      {c:[s*0.186,1.238,0.002], dir:[s*1,-0.08,0], ru:0.046, rv:0.064, mix:0.30},
      {c:[s*0.212,1.235,0.002], dir:[s*1,-0.08,0], ru:0.048, rv:0.062, mix:0.58},
      {c:[s*0.232,1.228,0.001], dir:[s*1,-0.10,0], ru:0.050, rv:0.058, mix:0.80},
      {c:[s*0.250,1.195,0.000], dir:[s*0.75,-0.66,0], ru:0.050, rv:0.048, mix:1},
      {c:[s*0.270,1.075,-0.006], dir:[s*0.30,-0.93,0], ru:0.039, rv:0.034, mix:1},
      {c:[s*0.279,0.950,0.000], dir:[s*0.10,-0.995,0], ru:0.038, rv:0.031, mix:1},
      {c:[s*0.287,0.820,0.008], dir:[s*0.05,-0.999,0], ru:0.027, rv:0.024, mix:1},
      {c:[s*0.290,0.775,0.010], dir:[s*0.05,-0.999,0], ru:0.026, rv:0.025, mix:1}
    ];
  }
  // 掌盘（从腕开放边界挤出）：先方形化(superellipse exp<1)再压平成掌盘截面
  // 宽(rv,X)~0.085、厚(ru,Z)~0.02、长(Y)~0.09，掌心(掌盘薄面)朝 +Z 略前倾；指根五瓣留后续。
  function palmRings(s) {
    return [
      {c:[s*0.290,0.745,0.014], dir:[s*0.05,-0.999,0], ru:0.019, rv:0.036, exp:0.85, mix:0.6},
      {c:[s*0.291,0.715,0.019], dir:[s*0.02,-0.999,0], ru:0.011, rv:0.042, exp:0.7, mix:1},
      {c:[s*0.291,0.690,0.022], dir:[s*0.02,-0.999,0], ru:0.010, rv:0.040, exp:0.7, mix:1}
    ];
  }
  function legRings(s) {
    return [
      {c:[s*0.095,0.78,0],ru:0.093,rv:0.080, radial:true},
      {c:[s*0.098,0.72,0],ru:0.091,rv:0.077, radial:true},
      {c:[s*0.100,0.67,0],ru:0.088,rv:0.075, radial:true},
      {c:[s*0.102,0.60,0.004],ru:0.073,rv:0.062, radial:true},
      {c:[s*0.102,0.54,0.008],ru:0.064,rv:0.055},
      {c:[s*0.102,0.505,0.012],ru:0.060,rv:0.051},
      {c:[s*0.103,0.48,0.015],ru:0.056,rv:0.048},
      {c:[s*0.104,0.435,-0.002],ru:0.061,rv:0.050},
      {c:[s*0.104,0.39,-0.009],ru:0.066,rv:0.052},
      {c:[s*0.105,0.345,-0.012],ru:0.062,rv:0.049},
      {c:[s*0.105,0.30,-0.014],ru:0.059,rv:0.046},
      {c:[s*0.105,0.235,-0.010],ru:0.047,rv:0.037},
      {c:[s*0.105,0.17,-0.005],ru:0.036,rv:0.029},
      {c:[s*0.105,0.10,0],ru:0.036,rv:0.029},
      {c:[s*0.105,0.078,0.010],ru:0.040,rv:0.033,bend:-0.30},
      {c:[s*0.105,0.060,0.030],ru:0.045,rv:0.040,bend:-0.62},
      {c:[s*0.105,0.045,0.068],ru:0.040,rv:0.046,bend:-0.98},
      {c:[s*0.105,0.034,0.120],ru:0.031,rv:0.048,bend:-1.32},
      {c:[s*0.105,0.027,0.168],ru:0.023,rv:0.042,bend:-1.50},
      {c:[s*0.105,0.025,0.205],ru:0.018,rv:0.033,bend:-1.57}
    ];
  }
  var branches = {};
  branches.armL = extrudePatch(mesh, armL, armRings(+1), {axis:[0,-1,0],color:SKIN, cap:false});
  branches.armR = extrudePatch(mesh, armR, armRings(-1), {axis:[0,-1,0],color:SKIN, cap:false});
  branches.legL = extrudePatch(mesh, legL, legRings(+1), {axis:[0,-1,0],color:SOCK});
  branches.legR = extrudePatch(mesh, legR, legRings(-1), {axis:[0,-1,0],color:SOCK});
  // Reflect generated columns using the source boundary correspondence.
  function mirrorBranch(left, right, hasCap) {
    var map = right.loop.map(function (id) {
      var p = mesh.vertices[id], best = 0, distance = Infinity;
      left.loop.forEach(function (lid, j) {
        var q = mesh.vertices[lid], d = Math.hypot(p[0]+q[0],p[1]-q[1],p[2]-q[2]);
        if (d < distance) { best = j; distance = d; }
      });
      if (distance > 1e-7) throw new Error('Non-mirrored source boundary');
      return best;
    });
    for (var k = 1; k < right.rings.length; k++) right.rings[k].forEach(function (id,j) {
      var q = mesh.vertices[left.rings[k][map[j]]]; mesh.vertices[id] = [-q[0],q[1],q[2]];
    });
    // 仅当带盖帽(cap:true)时才镜像末端盖顶点；cap:false 的开放分支其后是被下一分支占用的顶点，不能覆盖。
    if (hasCap !== false) {
      var li = left.rings[left.rings.length-1], ri = right.rings[right.rings.length-1];
      var q = mesh.vertices[Math.max.apply(Math,li)+1];
      mesh.vertices[Math.max.apply(Math,ri)+1] = [-q[0],q[1],q[2]];
    }
  }
  mirrorBranch(branches.armL, branches.armR, false);
  // 掌盘：从左右臂腕开放边界用 extrudePatch 长出（先方形化再压平为掌盘截面），并镜像。
  branches.palmL = extrudePatch(mesh, null, palmRings(+1), {axis:[0,-1,0],color:SKIN, loop: branches.armL.rings[branches.armL.rings.length-1]});
  branches.palmR = extrudePatch(mesh, null, palmRings(-1), {axis:[0,-1,0],color:SKIN, loop: branches.armR.rings[branches.armR.rings.length-1]});
  mirrorBranch(branches.palmL, branches.palmR);
  mirrorBranch(branches.legL, branches.legR);
  var ys = mesh.vertices.map(function (p) { return p[1]; });
  window.__BODY_CAGE__ = {
    mesh: mesh,
    controls: {path:path, profiles:profiles, arms:armRings(1), legs:legRings(1)},
    branches: branches,
    referenceFit: {status:"provisional", references:["reference/ganyu-3view.png","reference/body-wire-front.png","reference/body-wire-side.png","reference/body-wire-quarter.png","reference/body-wire-back.png"], reason:"References recovered; landmark fitting and clothing clearance remain unverified"},
    componentsExpected: 1,
    topology: 'closed-manifold-patch-extrusion (trunk+arms+legs, shared boundary verts)',
    scale: { height: +(Math.max.apply(Math, ys) - Math.min.apply(Math, ys)).toFixed(3), unit: 'm', front: '+Z' },
    metrics: { vertices: mesh.vertices.length, tris: mesh.faces.length / 3, limbs: 4 },
    stage: 'blockout'
  };
})();
