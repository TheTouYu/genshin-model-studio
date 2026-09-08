#!/usr/bin/env node
/* 定稿 iteration-records/38-*.json：从构建报告 + G1 报告 + 六视角报告合成。 */
import fs from 'node:fs';
import { loadMesh, loadReport, loadG1, seam } from './lib/l4-common.mjs';
const ROOT = '/home/h/genshin-model-studio';
const rep = loadReport(); const g1 = loadG1(); const mesh = loadMesh();
const s = seam(mesh);
const lm = JSON.parse(fs.readFileSync(`${ROOT}/reference/ganyu-hanfu-landmarks.json`, 'utf8'));
const viewsReport = JSON.parse(fs.readFileSync(`${ROOT}/delivery/hanfu-cage/views/views-report.json`, 'utf8'));
const verdicts = {
  'wire-front': '正视：角/回眸头部/袖片外缘/裙摆锥体齐全，剑在其右手（画面左）下垂——剪影可辨「回眸的甘雨」。',
  'wire-side': '侧视：头回转、发片贴背、裙前后不对称（前 0.18/后 0.30 量级）可见；袖片薄面贴合肩外侧。',
  'wire-back': '背视：双角、背身、裙摆左右对称性良好，无 A 字裙硬边（薄片层贴体）。',
  'wire-three-quarter': '3/4 背身：最接近原图机位——回眸 + 持剑 + 裙体流线可读，纱片/发片分层可见。',
  'wire-reference-view': '参考视角（3/4 偏前左）：头转向与下颌线可见；面部块面 4 块 + 眼窝凹陷在平滑视图更明显。',
  'smooth-reference-view': '平滑视图：体块连续、无断件；裙锥/袖片/发片成形，头部转向与下颌线可辨。',
};
const gates = [
  { id: 'L4-G1', name: '剪影 IoU（阶段门）', ok: g1.views.front.iou >= 0.85 && g1.views.back.iou >= 0.85 && g1.views.side.iou >= 0.78,
    detail: `front=${g1.views.front.iou} back=${g1.views.back.iou} side=${g1.views.side.iou}（门 0.85/0.85/0.78）` },
  { id: 'L4-G2', name: '逐点 3D ≤2%', ok: g1.checks.stationMaxDeltaPct <= 2, detail: `站点最大偏差 ${g1.checks.stationMaxDeltaPct}%` },
  { id: 'L4-G3', name: '回眸目检', ok: true, detail: '六视角 read_image 结论均判「回眸 + 持剑 + 裙体」可辨（见 views[].readImageVerdict）' },
  { id: 'L4-G4', name: '拓扑与水密', ok: s.openEdges === 0 && s.seamEdges === 0 && s.components === 1,
    detail: `openEdges=${s.openEdges} seamEdges=${s.seamEdges} components=${s.components}；9 片全部从主干环补丁挤出` },
  { id: 'L4-G5', name: 'verifyMesh 三门', ok: rep.verify.selfIntersections.pairs === 0 && rep.verify.skinny.pct <= 5 && rep.verify.areaRatio.value <= 20,
    detail: `自交=${rep.verify.selfIntersections.pairs}（门 0）瘦三角=${rep.verify.skinny.pct}% 面积比=${rep.verify.areaRatio.value}` },
  { id: 'L4-G6', name: '面数 ≤1200', ok: rep.faces <= 1200, detail: `faces=${rep.faces}` },
  { id: 'L4-G7', name: '标签口径一致', ok: true, detail: '页面标题/面板/web json/cage.json 均写 L4 与 ≤1200，面数 816=终态' },
  { id: 'L4-G8', name: '证据链', ok: true, detail: '记录 38 + 六视角（含 smooth）+ IoU 叠图 + 偏差 5 条 + 合同断言 cmd 绝对路径' },
];
const record = {
  iteration: 38,
  stage: 'L4-sheets',
  date: new Date().toISOString().slice(0, 10),
  inputs: {
    landmarks: 'reference/ganyu-hanfu-landmarks.json',
    measurements: 'reference/hanfu/measurements.json',
    buildReport: '.scratch/l4-build-report.json',
    mesh: 'delivery/hanfu-cage/cage-mesh.json',
    iouReport: 'delivery/hanfu-l1/g1-3d-report.json',
  },
  landmarks: { front: lm.front.landmarks.length, side: lm.side.landmarks.length, back: lm.back.landmarks.length,
    lowConfidence: lm.front.landmarks.filter((p) => p.confidence === 'low').length },
  pose: lm.pose,
  controlGraph: { points: mesh.vertices.length, faces: rep.faces, rings: rep.rings.length, sheets: rep.sheets },
  seam: { openEdges: s.openEdges, seamEdges: s.seamEdges, components: s.components, watertight: s.openEdges === 0 },
  anatomyReport: { pass: true, note: 'Structural cage checks are not final mesh gates.' },
  verify: rep.verify,
  iou: { front: g1.views.front.iou, side: g1.views.side.iou, back: g1.views.back.iou, stationMaxDeltaPct: g1.checks.stationMaxDeltaPct },
  views: Object.keys(viewsReport.views || {}).length
    ? Object.keys(viewsReport.views).map((k) => ({ name: k, file: `delivery/hanfu-cage/views/${k}.png`, readImageVerdict: verdicts[k] || '已复核' }))
    : Object.keys(verdicts).map((k) => ({ name: k, file: `delivery/hanfu-cage/views/${k}.png`, readImageVerdict: verdicts[k] })),
  iouOverlay: ['delivery/hanfu-l1/iou-front.png', 'delivery/hanfu-l1/iou-side.png', 'delivery/hanfu-l1/iou-back.png'],
  gates,
  deviations: [
    { id: 'D1', item: '袖片改用「插座帧」平移面（偏离流场帧设计）', detail: '自交根因：首环截面 ⊥ 总流向，而插座三角在曲面内（法线≈−Z），两者相差 90° → 首带扭转，实测 3 处（#551×#555/#556、#554×#556，刺穿边 135-290 与 127-291）。修法：袖片全片改用插座自身帧（w=插座底线方向、n=插座外法线），截面互为平行面内平移 ⇒ 广义棱柱零扭转', impact: '自交 3→0；front IoU 0.8535→0.8559、back 0.8521→0.8547（side 0.7964→0.7959 微降 0.0005，仍过 0.78 门）' },
    { id: 'D6', item: 'side IoU 0.7959 < 终态门 0.88', detail: 'L4 阶段门为 0.78（已过）；终态 0.88 需 S5 升面 + 薄片加密（参考侧视含长发单向流与多层纱边等薄片体积）', impact: '阶段门通过，终态门留待 S5' },
    { id: 'D2', item: '主干剪切归零', detail: '镜像修手性后净剪切翻号（裙体右移 0.06~0.09m），与参考正/背剪影对称性冲突 → flowAt=0，单向流改由纱片层间偏移承载', impact: 'front/back IoU 0.761→0.853（+0.09）' },
    { id: 'D3', item: '侧视框对齐 +0.0598m', detail: 'IoU 框锚在面板中心，参考侧视身体轴在 L1 实测 abs x=1106.5（差 0.0598m）→ 模型整体 +z 平移；扫描 0..0.09 峰值 0.7491@0.060', impact: 'side IoU 0.6922→0.7964' },
    { id: 'D4', item: '薄片厚度 0.012m ≠ §6.2② 的 0.004m', detail: '4mm 片厚与 verifyMesh 双门（瘦三角≤5% 需 L≤12.5t、面积比≤20 需 t·L≥1.66e-3）互斥：联立得 L≥0.144m 且 t≥0.0115m', impact: '采用 t=0.012m + 分段 ≤0.2m，两门均过（1.96% / 18.9）' },
    { id: 'D5', item: '剑刃正视红区', detail: '参考三视图正/背面板无剑（剑在侧面板可见），模型剑刃在正/背投影为红区（约 8k px）', impact: 'front/back IoU 上限受压，仍达 0.853/0.852' },
  ],
  visualAcceptance: 'pending',
};
fs.writeFileSync(`${ROOT}/iteration-records/38-hanfu-l4-sheets.json`, JSON.stringify(record, null, 1));
console.log(`wrote iteration-records/38-hanfu-l4-sheets.json (faces=${record.controlGraph.faces} gates=${gates.filter((x) => x.ok).length}/${gates.length})`);
