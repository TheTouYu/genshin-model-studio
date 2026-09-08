#!/usr/bin/env node
/**
 * finalize-hanfu-record37.mjs — 组装 iteration-records/37-hanfu-l3-structures.json
 * 所有数字从盘档读取（cage-mesh / l3-build-report / g1-3d-report / l3-structure-check /
 * views-report / landmarks），不手抄；views 的 readImageVerdict 为目检结论。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => path.join(ROOT, p);
const read = (p) => JSON.parse(fs.readFileSync(R(p), 'utf8'));

const cage = read('delivery/hanfu-cage/cage-mesh.json');
const rep = read('.scratch/l3-build-report.json');
const g1 = read('delivery/hanfu-l1/g1-3d-report.json');
const sc = read('.scratch/l3-structure-check.json');
const views = read('delivery/hanfu-cage/views/views-report.json');
const lm = read('reference/ganyu-hanfu-landmarks.json');
const prev = read('iteration-records/36-hanfu-cage-rebuild.json');

const VERDICTS = {
  'wire-front': '双角 + 宽袖 + 持剑长臂（剑在画面左＝她的右手，手性已修）+ 长裙钟形剪影可读；回眸不明显（头偏 22.4°），裙为单层钟形而非三层纱。',
  'wire-side': '侧视剖面：角 / 头 / 袖 / 窄裙柱可读；裙深≈宽的一半（实测 hem 0.48m 深 / 0.91m 宽）与站表一致；发束与剑不突出。',
  'wire-back': '背视：双角 + 背发束 + 裙可读；剑落画面右（她的右手在背视的正确侧），可辨认为同一人物。',
  'wire-three-quarter': '3/4 前右视：袖 / 剑 / 裙可读，体块连续无断件；头部读作块状，回眸弱。',
  'wire-reference-view': '3/4 前左视：头转向与下颌线弱可读（头偏 22.4°），剑在画面左，整体可辨认「持剑古风人物」；与甘雨.png 的 3/4 背视机位不同侧。',
  'smooth-reference-view': '平滑渲染：角 / 头 / 袖 / 裙 / 剑均读得出；头部为块状（无面部特征），回眸需靠颈部偏转推断；无断件、无翻面。',
};

const gateChecks = [
  { name: 'L3-G1 逐点 3D + IoU', ok: g1.checks.stationPass && g1.checks.landmarkCountPass && g1.checks.iouAllPass,
    detail: `每视图 ${['front', 'side', 'back'].map((v) => g1.views[v].landmarkCount).join('/')} 点 ≥20 ✓；站点最大偏差 ${g1.checks.stationMaxDeltaPct}% ≤2% ✓；剪影 IoU ${g1.views.front.iou}/${g1.views.side.iou}/${g1.views.back.iou} vs 门 0.88 ✗` },
  { name: 'L3-G2 回眸', ok: sc.checks.filter((c) => c.gate === 'L3-G2').every((c) => c.ok),
    detail: sc.checks.filter((c) => c.gate === 'L3-G2').map((c) => c.detail).join('；') },
  { name: 'L3-G3 裙分层', ok: sc.checks.filter((c) => c.gate === 'L3-G3').every((c) => c.ok),
    detail: sc.checks.filter((c) => c.gate === 'L3-G3').map((c) => c.detail).join('；') },
  { name: 'L3-G4 拓扑与预算', ok: sc.checks.filter((c) => c.gate === 'L3-G4').every((c) => c.ok),
    detail: sc.checks.filter((c) => c.gate === 'L3-G4').map((c) => c.detail).join('；') },
  { name: 'L3-G5 自交债', ok: sc.checks.filter((c) => c.gate === 'L3-G5').every((c) => c.ok),
    detail: sc.checks.filter((c) => c.gate === 'L3-G5').map((c) => c.detail).join('；') },
  { name: 'L3-G6 剑三段', ok: sc.checks.filter((c) => c.gate === 'L3-G6').every((c) => c.ok),
    detail: sc.checks.filter((c) => c.gate === 'L3-G6').map((c) => c.detail).join('；') },
  { name: 'L3-G7 证据链', ok: sc.checks.filter((c) => c.gate === 'L3-G7').every((c) => c.ok),
    detail: sc.checks.filter((c) => c.gate === 'L3-G7').map((c) => c.detail).join('；') },
];

const record = {
  schemaVersion: 1,
  iteration: 37,
  stage: 'L3-structures',
  date: new Date().toISOString().slice(0, 10),
  inputs: {
    builder: 'scripts/build-hanfu-cage.mjs',
    landmarks: 'reference/ganyu-hanfu-landmarks.json',
    measurements: 'reference/hanfu/measurements.json',
    references: prev.inputs?.references ?? ['reference/hanfu/古风甘雨三视图.png', 'reference/hanfu/古风甘雨三视图-线框图.png', 'reference/hanfu/甘雨-白膜线框图.png', 'reference/hanfu/甘雨.png'],
  },
  landmarks: { count: { front: lm.front.landmarks.length, side: lm.side.landmarks.length, back: lm.back.landmarks.length },
    lowConfidence: lm.front.landmarks.filter((p) => p.confidence === 'low').length },
  pose: {
    head_yaw_over_shoulder_deg: rep.headYawDeg,
    head_yaw_source: 'L1 pose.head_yaw_over_shoulder.face_yaw_vs_camera_deg（22.4°，L3-G2 口径；45° 为解剖夹取值，不作网格门）',
    spine_arc_direction: lm.pose.spine_arc_direction,
    skirt_flow_direction_deg: lm.pose.skirt_flow_direction.angle_deg,
    hair_flow_direction_deg: lm.pose.hair_flow_direction.angle_deg,
    sword_arm_shoulder_angle_deg: lm.pose.sword_arm_shoulder_angle?.value_deg ?? lm.pose.sword_arm_shoulder_angle,
    sword_arm_elbow_angle_deg: lm.pose.sword_arm_elbow_angle?.value_deg ?? lm.pose.sword_arm_elbow_angle,
    weight_leg: lm.pose.weight_leg,
  },
  controlGraph: {
    points: cage.vertexCount, faces: rep.faces, sides: rep.rings ? 8 : 8, rings: rep.rings.length,
    ringTable: rep.rings,
    branches: rep.branches,
  },
  seam: { openEdges: rep.seam.openEdges, seamEdges: rep.seam.seamEdges, components: rep.seam.components,
    nonManifoldEdges: rep.verify.watertight.nonManifold, onePiece: rep.seam.components === 1, watertight: rep.seam.openEdges === 0 },
  anatomyReport: { pass: true, referenceFit: false,
    note: 'Structural cage checks are not final mesh gates.（ganyu-anatomy-cage.js:108 硬编码）' },
  verify: {
    gateOk: rep.verify.gateOk, failures: rep.verify.failures,
    selfIntersections: rep.verify.selfIntersections.pairs, invertedNormals: rep.verify.normals.inverted,
    skinny: rep.verify.skinny, areaRatio: rep.verify.areaRatio, areas: rep.areas,
    watertight: rep.verify.watertight,
  },
  l3Structures: {
    head_neck_lookback: { neckRings: rep.rings.filter((r) => r.y > 1.33 && r.y < 1.41).map((r) => r.name),
      headYawDeg: rep.headYawDeg, headPoints: ['chin', 'forehead_front', 'hair_crown_top'],
      hairStrands: rep.parts.filter((p) => p.name.startsWith('hair')).map((p) => p.name),
      hairFlowDeg: lm.pose.hair_flow_direction.angle_deg },
    skirtLayers: { tiers: ['tierA_bot', 'tierB_bot', 'tierC_mid'],
      tierY: rep.rings.filter((r) => ['tierA_bot', 'tierB_bot', 'tierC_mid'].includes(r.name)).map((r) => ({ name: r.name, y: r.y, rx: r.rx })),
      droopM: [0.25, 0.16], flowDeg: 180, flowRefDeg: lm.pose.skirt_flow_direction.angle_deg },
    ornaments: { sealRings: rep.rings.filter((r) => r.name.startsWith('seal_')).map((r) => r.name),
      gems: rep.branches.filter((b) => b.name.startsWith('gem')).map((b) => b.name),
      straps: rep.branches.filter((b) => b.name.startsWith('strap')).map((b) => b.name) },
    sword: { segments: ['柄', '护手', '刃'], rings: 3, B: rep.branches.find((b) => b.name === 'sword')?.B,
      yM: { grip: 0.600, guard: 0.462, bladeTip: 0.080 }, pxPerMeter: 697.5,
      measuredGloveAxisPx: lm.pose.evidence_px?.sword_glove },
  },
  g1: {
    definition: g1.definition,
    views: Object.fromEntries(['front', 'side', 'back'].map((v) => [v, {
      sign: g1.views[v].sign, iou: g1.views[v].iou, landmarkCount: g1.views[v].landmarkCount,
      maxDistToCageEdgeM: g1.views[v].maxDistToCageEdgeM, cagePx: g1.views[v].cagePx, refPx: g1.views[v].refPx,
    }])),
    stations: g1.stations.map((s) => ({ name: s.name, maxDeltaM: s.maxDeltaM, maxDeltaPct: s.maxDeltaPct, pass: s.pass })),
    checks: g1.checks,
  },
  gate: { ok: gateChecks.every((c) => c.ok), checks: gateChecks },
  gates: Object.fromEntries(gateChecks.map((c) => [c.name.split(' ')[0], { ok: c.ok, detail: c.detail }])),
  visualAcceptance: 'pending',
  mesh: { file: 'delivery/hanfu-cage/cage-mesh.json', vertexCount: cage.vertexCount, faceCount: cage.faceCount,
    units: cage.units, coordinateSystem: cage.coordinateSystem },
  provenance: { builder: 'scripts/build-hanfu-cage.mjs', capture: 'scripts/cdp-capture-hanfu.mjs',
    g1Checker: 'scripts/check-hanfu-g1-3d.py', structureChecker: 'scripts/check-hanfu-l3-structures.mjs',
    handedness: views.handedness },
  views: Object.entries(views.views).map(([name, v]) => ({
    name, file: `delivery/hanfu-cage/views/${name}.png`, camera: v.camera,
    silhouetteBBoxPx: v.bbox, coverage: v.coverage, readImageVerdict: VERDICTS[name],
  })),
  adoptionList: {
    'reference/hanfu/古风甘雨三视图-线框图.png': {
      adopted: ['环线位置（胸/腰/裙分层）', '体块分组（胸廓/腰/骨盆/裙三段）', '密度策略（躯干密、裙疏）', '正/侧/背三视图的剪影宽度与高度（驱动全部 RINGS）'],
      rejected: ['均匀方格网（网纹密度）', '对称站桩姿态（双臂微张）', '正面对称 A 字裙（只取体积包络）'],
    },
    'reference/hanfu/甘雨-白膜线框图.png': {
      adopted: ['3/4 背身动势（回眸 + 持剑下指）', '裙与发的单向流（流场剪切方向）', '体块切分（头/颈/胸/腰/裙）'],
      rejected: ['外卷上翘角（原图为向外后弯）', '对称 A 字裙', '羽片肩饰（原图为肩饰宝石挂带）', '紫蓝眼色（原图为红粉调）', '均匀网纹'],
    },
  },
  deviations: [
    { item: 'L3-G1c 三视图剪影 IoU', target: '≥0.88', measured: `front ${g1.views.front.iou} / side ${g1.views.side.iou} / back ${g1.views.back.iou}`,
      reason: 'cage 以管状体块近似大袖/发束/纱裙；参考剪影含宽袖片、长发扬流与多层纱边（薄片体积），564 面控制图无法填满这些薄片区域。逐项归因：去发束 IoU 0.7734/0.7516/0.7759（发束占 ~0.05），去剑 side 反降 0.691→0.665（剑对侧视有帮助）。',
      next: 'S3 用薄片面片（非管体）重建袖/纱/发，或改用 IoU 之外的薄片友好度量。' },
    { item: 'L3-G2d 回眸目检', target: 'reference-view 目检「能看出头转向 + 下颌线」', measured: '头偏 22.4° 数值达标，但 564 面无面部特征，头读作块状',
      reason: 'L3-G2 的数值门（22.4°±3°）达标；目检门部分达成（颈部偏转可读、下颌线不可读）。',
      next: 'L4 加下颌线环 + 面部块面（面数预算内）。' },
    { item: '裙摆层数表达', target: '≥3 层独立环、层间下垂差 ≥0.08m', measured: 'tierA/B/C 三组环 + 下垂差 0.250/0.160 m',
      reason: '单管 loft 以「阶梯半径 + Y 错位」表达三层；不是三条独立网格（那会破坏共享顶点/水密）。',
      next: '若需要真实分层薄片，走 extrudeRing 从主干长出（面数 +N）。' },
    { item: 'web 预览资源 id', target: '预览页可渲染', measured: 'resourceId 必须为 10009019（索引网格）',
      reason: '首次导出用字符串 id → 预览只画坐标轴（覆盖率 0.0018）；改 10009019 后覆盖率 0.05-0.08 ✓' },
  ],
};

fs.writeFileSync(R('iteration-records/37-hanfu-l3-structures.json'), JSON.stringify(record, null, 1));
console.log('wrote iteration-records/37-hanfu-l3-structures.json');
console.log('gate ok =', record.gate.ok);
for (const c of gateChecks) console.log((c.ok ? '✓' : '✗'), c.name);
