/**
 * ganyu-blockout-minimal — 极简人体 blockout（低面数、一体、共享顶点）。
 *
 * 目标：一个完整粗模人体 —— 头/颈/躯干/肩/臂(肘)/腕/掌 + 髋/膝/踝/足，
 * 全部由一个连续共享顶点网格构成（profileLoft 主干 + extrudePatch 从主干“长”出肢体，
 * 肢体根环与主干共享相同顶点索引 → seamCheck 恒 0 缝；not 断管/not index 合并）。
 *
 * 坐标：+Y 上（高 1.60m）、+X 左右宽、+Z 前。面朝 +Z。
 * 依赖（须在同一 vm context 先加载）：
 *   - scripts/parts/lib/ganyu-lib.js         → profileLoft (dataOnly + up:[0,0,1])
 *   - scripts/parts/lib/ganyu-cage-branch.js → extrudePatch / recoverBoundary
 *   - scripts/parts/lib/ganyu-seam-check.js  → seamCheck（报告用）
 *
 * 已知局限（粗模草案，非最终门禁通过）：
 *   - 极低分辨率 + SIDES=8 使肩/髋根部孔洞呈鞍形 → 肩部存在若干局部自交（见报告）。
 *   - 消除自交需提高 SIDES(>=16)与环数 → 面数远超 300；=> <=300 三角形与“零自交完整人体”
 *     在当前分支工具下不可兼得（实测见 tool 报告）。
 *   - 腕/踝作为“一节”压缩进相邻带（无独立环）；无手指（按要求）。
 *   - 参考拟合：未做；本文件仅为画格/视觉迭代骨格。
 */
(function (root) {
  'use strict';
  var SKIN = '#f3c9a7', CLOTH = '#d9d9de';

  /** 控制断面：{y, rx(半宽), front(+Z 前深), back(-Z 后深)} */
  var CONTROL_SECTIONS = [
    { y: 0.82, rx: 0.125, front: 0.085, back: 0.100 },   // pelvis
    { y: 0.93, rx: 0.150, front: 0.100, back: 0.120 },   // hip
    { y: 1.05, rx: 0.125, front: 0.082, back: 0.082 },   // waist
    { y: 1.17, rx: 0.150, front: 0.130, back: 0.100 },   // chest (bust)
    { y: 1.30, rx: 0.160, front: 0.100, back: 0.090 },   // shoulder
    { y: 1.60, rx: 0.075, front: 0.080, back: 0.092 }    // head + crown (top ring, capped)
  ];

  /** 手臂规范（右手 s=+1；左手 s=-1 镜像中心/方向）。环轴肩部沿 +X，随后逐环转向下垂。 */
  function armStations(s) {
    return [
      { c: [s * 0.176, 1.285, 0.001], dir: [s * 1, -0.06, 0], ru: 0.046, rv: 0.056, mix: 0.35 },
      { c: [s * 0.228, 1.090, 0.000], dir: [s * 0.30, -0.95, 0], ru: 0.038, rv: 0.033, mix: 1 },
      { c: [s * 0.278, 0.720, 0.014], dir: [s * 0.05, -0.999, 0], ru: 0.021, rv: 0.040, exp: 0.8, mix: 1 } // 掌盘 + 盖(腕压缩)
    ];
  }

  /** 腿规范（右手）：hip 根环用 radial 投影贴合骨盆底；knee；foot(含踝转向+足前伸+盖)。踝压缩进 knee→foot 带。 */
  function legStations(s) {
    return [
      { c: [s * 0.098, 0.780, 0.000], ru: 0.090, rv: 0.078, radial: true },
      { c: [s * 0.101, 0.480, 0.006], ru: 0.055, rv: 0.047 },
      { c: [s * 0.101, 0.045, 0.095], ru: 0.030, rv: 0.040, bend: -1.40 }
    ];
  }

  /** 将已在 mesh 上的右手分支位置“镜像”到左手分支（保证两侧精确对称、法线一致）。 */
  function mirrorBranch(mesh, leftBranch, rightBranch, hasCap) {
    var map = rightBranch.loop.map(function (id) {
      var p = mesh.vertices[id], best = 0, distance = Infinity;
      leftBranch.loop.forEach(function (lid, j) {
        var q = mesh.vertices[lid], d = Math.hypot(p[0] + q[0], p[1] - q[1], p[2] - q[2]);
        if (d < distance) { best = j; distance = d; }
      });
      if (distance > 1e-6) throw new Error('blockout: non-mirrored source boundary (d=' + distance.toFixed(6) + ')');
      return best;
    });
    for (var k = 1; k < rightBranch.rings.length; k++) {
      rightBranch.rings[k].forEach(function (id, j) {
        var q = mesh.vertices[leftBranch.rings[k][map[j]]];
        mesh.vertices[id] = [-q[0], q[1], q[2]];
      });
    }
    if (hasCap !== false) {
      var li = leftBranch.rings[leftBranch.rings.length - 1];
      var ri2 = rightBranch.rings[rightBranch.rings.length - 1];
      var q = mesh.vertices[Math.max.apply(Math, li) + 1];
      mesh.vertices[Math.max.apply(Math, ri2) + 1] = [-q[0], q[1], q[2]];
    }
  }

  /**
   * 构建极简一体人体。
   * opts：{ sides=8, armK=3, legK=3 }。armK/legK 为每条肢体取用前 N 个环站。
   */
  function buildBlockoutMinimal(opts) {
    opts = opts || {};
    var SIDES = opts.sides || 8;
    var armK = opts.armK || 3;
    var legK = opts.legK || 3;
    var path = CONTROL_SECTIONS.map(function (s) { return [0, s.y, 0]; });
    var sections = CONTROL_SECTIONS.map(function (s) { return { rx: s.rx, ryB: s.front, ryF: s.back }; });
    var half = Math.floor(CONTROL_SECTIONS.length * 0.55);
    var mesh = profileLoft(path, sections, path.length - 1, SIDES, function (i) { return i < half ? CLOTH : SKIN; },
      { dataOnly: true, cap: 'both', up: [0, 0, 1] });
    var ri = mesh.ringIdx;
    function blockVerts(rings, angles) { var o = []; for (var r = 0; r < rings.length; r++) for (var a = 0; a < angles.length; a++) o.push(ri[rings[r]] + angles[a]); return o; }
    function take(fn, s, K) { return fn(s).slice(0, K); }

    // up=[0,0,1] → 角 0=+X(右), floor(S/2)=-X(左)；右/左各取连续 3 角。
    var right = [SIDES - 1, 0, 1];
    var left = [Math.floor(SIDES / 2) - 1, Math.floor(SIDES / 2), Math.floor(SIDES / 2) + 1];

    // 肩部面片：环 {3,4}(胸/肩) × 角向。环轴在肩部沿 +X 使环面落在根孔平面。
    var armPR = blockVerts([3, 4], right), armPL = blockVerts([3, 4], left);
    var armR = extrudePatch(mesh, armPR, take(armStations, 1, armK), { axis: [0, -1, 0], color: SKIN, cap: true });
    var armL = extrudePatch(mesh, armPL, take(armStations, -1, armK), { axis: [0, -1, 0], color: SKIN, cap: true });
    mirrorBranch(mesh, armR, armL, true);

    // 骨盆底侧面片：环 {0,1} × 角向 + 底部 cap 中心（合并裆部，避免腿撞实心盆底）。
    var capIndex = SIDES * ri.length;
    var legPR = blockVerts([0, 1], right).concat([capIndex]);
    var legPL = blockVerts([0, 1], left).concat([capIndex]);
    var legR = extrudePatch(mesh, legPR, take(legStations, 1, legK), { axis: [0, -1, 0], color: SKIN, cap: true });
    var legL = extrudePatch(mesh, legPL, take(legStations, -1, legK), { axis: [0, -1, 0], color: SKIN, cap: true });
    mirrorBranch(mesh, legR, legL, true);

    var ys = mesh.vertices.map(function (p) { return p[1]; });
    var xs = mesh.vertices.map(function (p) { return p[0]; });
    var zs = mesh.vertices.map(function (p) { return p[2]; });
    var metrics = {
      vertices: mesh.vertices.length,
      tris: mesh.faces.length / 3,
      rings: ri.length,
      sides: SIDES,
      armStations: armK,
      legStations: legK,
      height: +(Math.max.apply(Math, ys) - Math.min.apply(Math, ys)).toFixed(3),
      halfWidth: +Math.max.apply(Math, xs.map(Math.abs)).toFixed(3),
      front: +Math.max.apply(Math, zs).toFixed(3),
      back: +Math.min.apply(Math, zs).toFixed(3),
      limbs: 4
    };
    return {
      schemaVersion: 1,
      stage: 'blockout-minimal',
      mesh: mesh,
      controls: {
        sections: CONTROL_SECTIONS.slice(),
        armStations: armStations(1).slice(0, armK),
        legStations: legStations(1).slice(0, legK)
      },
      metrics: metrics,
      topology: 'closed-manifold-shared-vertex (profileLoft trunk + extrudePatch limbs, shared root boundary)',
      componentsExpected: 1,
      referenceFit: { status: 'not-fitted', reason: 'low-poly visual iteration cage; no reference landmark fitting performed' },
      scale: { height: metrics.height, unit: 'm', front: '+Z' },
      provenance: { algorithm: 'shared-vertex branch extrusion (no mesh merge, no disconnected tubes)', editableLevel: 'structural' }
    };
  }

  /** 默认配置：8 边、臂/腿各 3 环站（在面数与完整度之间折中，<=300 目标）。 */
  function blockoutConfig() { return { sides: 8, armK: 3, legK: 3 }; }

  root.buildBlockoutMinimal = buildBlockoutMinimal;
  root.blockoutConfig = blockoutConfig;
  if (typeof module !== 'undefined') module.exports = { buildBlockoutMinimal: buildBlockoutMinimal, blockoutConfig: blockoutConfig };
})(typeof globalThis !== 'undefined' ? globalThis : this);
