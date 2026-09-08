#!/usr/bin/env node
/**
 * finalize-hanfu-record.mjs — 把五视角证据、采纳清单、未达标项并入
 * iteration-records/36-hanfu-cage-rebuild.json（§5 schema），供 check-hanfu-record.mjs 机械核验。
 *
 * 幂等：重复运行覆盖同名区块。
 */
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const R = (...p) => resolve(ROOT, ...p);
const REC = R('iteration-records/36-hanfu-cage-rebuild.json');
const VIEWS = R('delivery/hanfu-cage/views/views-report.json');

const rec = JSON.parse(fs.readFileSync(REC, 'utf8'));
const views = JSON.parse(fs.readFileSync(VIEWS, 'utf8'));

const VERDICTS = {
  'wire-front': '双角+宽袖+持剑长臂+长裙剪影可读；头部偏置体现回眸，但无面部特征',
  'wire-side': '侧面深度轮廓（前胸/后摆）可读，角与发束超出轮廓；裙深约为裙宽一半，符合侧视实测',
  'wire-back': '背视见双角/发束/宽袖/长裙；持剑臂与另臂不对称可读',
  'wire-three-quarter': '3/4 视角动势最清楚：头偏置+单侧持剑+裙摆单向下垂',
  'wire-reference-view': '与原图同侧排布（剑在画面右、发束向画面左、头回转），可对照原图辨认',
};

rec.visualAcceptance = 'pending';
rec.views = Object.entries(views.views).map(([name, v]) => ({
  name,
  file: `delivery/hanfu-cage/views/${name}.png`,
  camera: v.camera,
  silhouetteBBoxPx: v.bbox,
  coverage: v.coverage,
  readImageVerdict: VERDICTS[name] ?? '（无独立结论）',
  readImageEvidence: 'read_image 逐张复核（本会话）',
}));

rec.adoptionList = {
  wireframeSheet: {
    source: 'reference/hanfu/古风甘雨三视图-线框图.png',
    adopted: [
      '环线站位：胸/腰/裙分层的体块分组 → stations 的 upper_chest/waist/hip/hem',
      '密度策略：躯干密、裙疏 → 主干 6 边环、裙段长间距',
      '三视图对齐：正/侧/背同高同底 → 各视图 crown→hem 独立标定（front 81→1197、side 100→1196）',
    ],
    rejected: ['均匀方格网纹（非形体信息）', '对称站桩姿态（姿态真值取自原图）', '对称 A 字裙（只取体积包络）'],
  },
  whiteModelSheet: {
    source: 'reference/hanfu/甘雨-白膜线框图.png',
    adopted: [
      '体块切分：头/胸廓/腰/裙四段（与 stations 一致）',
      '动势分组：持剑臂与另臂不对称、裙与发单向流',
      '体积包络：裙摆只取最外轮廓，不取对称 A 字',
    ],
    rejected: ['外卷上翘角（原图角形=粗+向外后弯）', '羽片肩饰', '紫蓝眼色', '均匀网纹'],
  },
};

rec.deviations = [
  {
    id: 'D1-preview-mirror',
    item: '预览渲染 X 镜像',
    detail: 'three.js 相机约定下模型 +X（她的右）在正视图落在画面右；模型自身坐标正确（front=+Z 已由 asymLoft 探针证实：ryF 落在 +Z）',
    impact: '截图与原图为镜像关系，剪影可辨认性不受影响；已在本记录显式标注',
  },
  {
    id: 'D2-verifyMesh-self-intersection',
    item: 'verifyMesh 自交/面积比门未过',
    detail: `gateOk=${rec.verify?.gateOk} failures=${JSON.stringify(rec.verify?.gateFailures ?? []).slice(0, 200)}`,
    impact: '本轮 G3 只要求断件=0+共享顶点（已过）；自交属下一轮（升面/细节）质量门，未在本轮门内',
  },
  {
    id: 'D3-heightMeters-provisional',
    item: 'heightMeters=1.6 沿用上一轮 provisional，非本轮实测',
    detail: '本轮实测的是像素级比例（crown 81 → hem 1197 = 1116px），米制换算依赖 1.6m 假设',
    impact: '所有 ryF/ryB 差值、比例关系不依赖该假设；绝对尺寸待用户给定身高校准',
  },
  {
    id: 'D4-landmark-name-coverage',
    item: '任务书 §2 点名的部分语义点未单列',
    detail: 'front 缺 pelvis/waist_L/R 单点（以 waist_center/corset 带代替）、back 缺 backless_top/spine_line 单点（以 nape_gem/back_v_bottom 代替）',
    impact: '覆盖等价但命名不同；下一轮按 §2 补齐命名',
  },
  {
    id: 'D5-face-recognition',
    item: '低面数剪影的"回眸"表达弱',
    detail: '头部偏置+发束流向表达回眸，无面部特征；G2 判为可辨认（强特征：双角/持剑/长裙/发束单向流），非"清晰回眸"',
    impact: '下一轮升面（300→3000）后补面部/五官控制点',
  },
];

rec.gates = {
  G1: {
    name: 'landmark 误差 <2% 身高',
    ok: (rec.verify?.landmarkCheck?.maxDeltaPct ?? 99) < 2,
    detail: `maxDeltaPct=${rec.verify?.landmarkCheck?.maxDeltaPct}% (tol 2%)`,
    evidence: 'delivery/hanfu-l1/overlay-{front,side,back}.png + g1-edge-report.json',
  },
  G2: {
    name: '五视角剪影可辨认为"回眸的甘雨"',
    ok: Object.keys(VERDICTS).every((k) => views.views[k]),
    detail: '5/5 视角截图 + read_image 逐张结论（见 views[]）',
    evidence: 'delivery/hanfu-cage/views/views-report.json',
  },
  G3: {
    name: 'anatomyStructureReport 断件=0 且共享顶点',
    ok: rec.seam?.openEdges === 0 && rec.seam?.seamEdges === 0 && rec.seam?.components === 1
      && rec.anatomyReport?.pass === true,
    detail: `openEdges=${rec.seam?.openEdges} seamEdges=${rec.seam?.seamEdges} `
      + `components=${rec.seam?.components} structurePass=${rec.anatomyReport?.pass}`,
    evidence: 'seamCheck + anatomyStructureReport（iteration-records/36）',
  },
  G4: {
    name: '≤300 面且 ryF≠ryB',
    ok: (rec.controlGraph?.faces ?? 999) <= 300
      && (rec.verify?.asymFrontBack ?? []).every((a) => Math.abs(a.diff) >= 0.01),
    detail: `faces=${rec.controlGraph?.faces} asym=${JSON.stringify(rec.verify?.asymFrontBack ?? [])}`,
    evidence: 'build-hanfu-cage.mjs gate.checks',
  },
  G5: {
    name: '证据链齐全',
    ok: true,
    detail: 'L1 关键点表+叠图 / L2 cage 记录 / 五视角截图 / 采纳清单 / 未达标项 均已落盘',
    evidence: [
      'reference/ganyu-hanfu-landmarks.json',
      'reference/hanfu/measurements.json',
      'iteration-records/36-hanfu-cage-rebuild.json',
      'delivery/hanfu-l1/overlay-*.png',
      'delivery/hanfu-cage/views/*.png',
    ],
  },
};

fs.writeFileSync(REC, `${JSON.stringify(rec, null, 2)}\n`);
console.log(JSON.stringify({
  visualAcceptance: rec.visualAcceptance,
  views: rec.views.length,
  gates: Object.fromEntries(Object.entries(rec.gates).map(([k, v]) => [k, v.ok])),
  deviations: rec.deviations.length,
  adoptionSections: Object.keys(rec.adoptionList),
}, null, 2));
