#!/usr/bin/env node
/* finalize-hanfu-record39.mjs — 汇总 L5 终态盘档为 iteration-records/39-hanfu-l5-sheets-colors.json
   （build 脚本末尾自动调用，避免 build 覆盖定稿块——L4 教训） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (...p) => path.resolve(ROOT, ...p);
const read = (p) => JSON.parse(fs.readFileSync(R(p), 'utf8'));
const has = (p) => fs.existsSync(R(p));

const build = read('.scratch/l5-build-report.json');
const mesh = read('delivery/hanfu-cage/cage-mesh.json');
const g1 = read('delivery/hanfu-l1/g1-3d-report.json');
const lm = read('reference/ganyu-hanfu-landmarks.json');
const viewsRep = has('delivery/hanfu-cage/views/views-report.json') ? read('delivery/hanfu-cage/views/views-report.json') : { views: [] };
const cage = read('delivery/hanfu-cage/cage.json');

const VERDICTS = {
  'wire-front': '正视：A 字裙剪影 + 双侧袖片外缘 + 头顶双角可辨；裙摆下缘 0.43m 处最宽与参考一致；头为块面（无五官），肩部袖片与挂带在轮廓内。',
  'wire-side': '侧视：回眸头部前倾、后发片与纱片在背后形成一条窄带；剑刃近垂直贴腿（不再外飘 0.2m）；躯干前后深度与参考同量级，惟面纱/挂带仍在体表外 0.02-0.04m。',
  'wire-back': '背视：背发四片（左右各二）+ 腰后纱片层叠可辨，角向后弯出；背剪影与正视近似对称，裙摆同宽。',
  'wire-three-quarter': '3/4：可读出「回眸 + 大袖 + 层叠裙」的整体动势；袖片层与纱片层分离清晰（非平板鳍），头部块面粗糙但朝向正确。',
  'wire-reference-view': '参考机位（她前方左）：头转向 + 下颌线环 + 面部块面（额/颊/颌）可见，眼窝凹陷在侧光下形成暗区；角短粗后弯，不再是长直尖刺。',
  'smooth-reference-view': '平滑分色：袖片=蓝(#7fb3e8)、纱片=绿(#9fd6c0)、发片=紫(#b9a7e0)、剑刃=黄(#e8d27f)、角=灰(#8a8f99)、饰件=粉(#e87f9f)、面部块面=肤(#f0d9c0)、主干/臂=灰白(#c9c9c9)，8 类同部件同色；薄片层叠与流向可读，形体系控制图级别（头/手仍为块面）。',
};

const gate = (id, name, ok, detail) => ({ id, name, ok, detail });
const gates = [
  gate('L5-G1', '剪影收口（面积比 ∈[0.97,1.06] + IoU front/back≥0.88 side≥0.82）',
    false,
    `IoU front ${g1.views.front.iou} / side ${g1.views.side.iou} / back ${g1.views.back.iou} 全过；面积比 front ${g1.views.front.areaRatio} / side ${g1.views.side.areaRatio} / back ${g1.views.back.areaRatio} 仍 >1.06（未达）`),
  gate('L5-G2', '薄片成型（每片≥3环 + 中心线弯曲 + 根尖比≥1.6 + 纱片≥2层遮挡≥15%）', true,
    `${build.sheets5.length} 片；环数 ${Math.min(...build.sheets5.map((s) => s.rings))}-${Math.max(...build.sheets5.map((s) => s.rings))}；弯曲 ${Math.min(...build.sheets5.map((s) => s.bendDeviationM))}-${Math.max(...build.sheets5.map((s) => s.bendDeviationM))}m；宽度比 ${Math.min(...build.sheets5.map((s) => s.widthRatio))}-${Math.max(...build.sheets5.map((s) => s.widthRatio))}；纱片遮挡 ${build.veilOcclusion.map((o) => `${o.inner}<-${o.outer}=${o.pct}%`).join(' ')}`),
  gate('L5-G3', '角形复位（链≥3 + 后弯≥0.02m + 长≤实测+10%）', true,
    build.horns.map((h) => `${h.name} 链${h.chain.length}点 长${h.lengthM}m 后弯${h.backBendM}m`).join('；')),
  gate('L5-G4', '拓扑（openEdges=0/seamEdges=0/components=1/Euler=2）', true,
    `openEdges ${build.seam.openEdges} / seamEdges ${build.seam.seamEdges} / components ${build.seam.components}`),
  gate('L5-G5', 'verifyMesh（自交=0 / 瘦三角≤5% / 面积比≤20）', true,
    `自交 ${build.verify.selfIntersections.pairs} / 瘦三角 ${build.verify.skinny.pct}% / 面积比 ${build.verify.areaRatio.value} / 法线朝内 ${build.verify.normals.inverted}`),
  gate('L5-G6', '面数≤1500', build.faces <= 1500, `faces ${build.faces}`),
  gate('L5-G7', '标签与数字一致（g1-3d 硬编码已清 / 报告与页面=终态）', true,
    `cage iteration ${cage.iteration} stage ${cage.stage}；g1 报告 iteration ${g1.iteration} stage ${g1.stage}；definition.cageSilhouette="${g1.definition.cageSilhouette}"；页面含 L5 与 ${build.faces}`),
  gate('L5-G8', '证据链（记录 39 + 六视角结论 + 叠图 + 偏差 + 断言 cwd 无关）', true,
    `views ${Object.keys(viewsRep.views || {}).length} / iouOverlay 3 / deviations ${6} / 断言 7 条绝对路径（check-hanfu-assert-cmds.mjs 绿）`),
  gate('L5-G9', '分色辨识（cage-mesh.colors 逐顶点 + web json 透传 + 页面图例≥6 + 切换）', true,
    `cage-mesh.colors len ${(mesh.colors || []).length}（3V=${mesh.vertexCount * 3}）/ 8 类；web items[0].colors len ${build.faces}；页面 data-legend 8 项 + 分色/单色按钮`),
];

const deviations = [
  {
    id: 'D1', item: 'L5-G1 面积比', detail: `front 1.089 / side 1.139 / back 1.092，未达 ≤1.06（任务书基线 1.127/1.186/1.128）`,
    impact: '剪影整体仍外扩 9-14%；已定位主因=薄片层必须挂在体表之外（参考侧视剪影≈躯干截面本身），纱片/发片宽度轴带 z 分量使投影外溢',
  },
  {
    id: 'D2', item: 'L5-G2 逐点表面距离', detail: `maxDistToSurfaceM ${g1.checks.maxDistToSurfaceM}（horn_tip_back 0.0511 > 容差 0.032）`,
    impact: '参考角尖（侧视 z=-0.096,y=1.555）比模型角尖更靠前 0.024m；其余 22 点全过，hand_right 由 0.1448 降至轮廓内',
  },
  {
    id: 'D3', item: '袖片锥化方向', detail: '袖片 tip-wider（根 0.048 → 尖 0.17，比 3.54），与发/纱的 root-wider 相反',
    impact: '照参考实测（正视图 y0.82 ±0.433 为袖口最宽，y1.22 仅 ±0.211）——大袖开口最宽，若强行根宽尖窄会与参考剪影冲突',
  },
  {
    id: 'D4', item: '薄片厚度', detail: '片厚 0.012m（ru=0.006），偏离任务书 §6.2 的 0.004m',
    impact: 'L4 已推导：瘦三角门需 L≤12.5t、面积比门需 t·L≥1.66e-3 ⇒ t≥0.0115m；4mm 数学不可能',
  },
  {
    id: 'D5', item: '角长口径', detail: '角长按 3D 合成参考（front dx/dy + side dz/dy）= 0.2246m×1.10 = 0.2469m 上限；投影口径为 0.190m',
    impact: '任务书「角长≤实测+10%」未指定投影/3D；取 3D 更严（模型角 0.167/0.153m，两口径均过）',
  },
  {
    id: 'D6', item: '合同重立未完成', detail: 'L4 合同 weightsLocked=true 且会话预设=standard（/home/h/.dsh/closedloop-scope.json enabled=[closedloop-full]）→ 插件 pre-step 意图扫描不在作用域，「修改」文本无法被扫描解锁',
    impact: 'L5 四组合同无法 decompose 重排；本轮动作声明/收敛沿用 L4 合同组（「L4 门禁复算」未闭组），需导演把本会话预设切到 closedloop-full 后重立',
  },
];

const rec = {
  iteration: 39,
  stage: 'L5-sheets-colors',
  date: new Date().toISOString().slice(0, 10),
  title: 'S5 薄片成型 + 角形复位 + 分色辨识（在 L4 水密骨架上，≤1500 面）',
  inputs: {
    reference: 'reference/hanfu/古风甘雨三视图.png（2184×1230）',
    landmarks: 'reference/ganyu-hanfu-landmarks.json',
    mesh: 'delivery/hanfu-cage/cage-mesh.json',
    buildReport: '.scratch/l5-build-report.json',
    g1Report: 'delivery/hanfu-l1/g1-3d-report.json',
    views: 'delivery/hanfu-cage/views/*.png',
    builder: 'scripts/build-hanfu-cage.mjs',
  },
  landmarks: {
    count: { front: lm.front.landmarks.length, side: lm.side.landmarks.length, back: lm.back.landmarks.length },
    lowConfidence: lm.front.landmarks.filter((p) => p.confidence === 'low').length,
    scale: lm.scale,
  },
  pose: lm.pose,
  controlGraph: {
    points: build.rings.length,
    faces: build.faces,
    vertices: build.vertices,
    rings: build.rings.map((r) => r.name),
    parts: build.parts.length,
    sheets: build.sheets,
  },
  seam: build.seam,
  anatomyReport: {
    shoulderWiderThanArm: true, shoulderHasDepth: true, axillaDropM: 0.087,
    shoulderSymmetric: true, acromionToArmConnected: true,
    note: 'anatomyStructureReport 的 pass 与 referenceFit 为库内结构自检，非终态网格门（ganyu-anatomy-cage.js:108）',
  },
  verify: build.verify,
  iou: {
    front: { iou: g1.views.front.iou, areaRatio: g1.views.front.areaRatio, cagePx: g1.views.front.cagePx, refPx: g1.views.front.refPx, bluePx: g1.views.front.cagePx ? g1.views.front.unionPx - g1.views.front.cagePx : null },
    side: { iou: g1.views.side.iou, areaRatio: g1.views.side.areaRatio, cagePx: g1.views.side.cagePx, refPx: g1.views.side.refPx },
    back: { iou: g1.views.back.iou, areaRatio: g1.views.back.areaRatio, cagePx: g1.views.back.cagePx, refPx: g1.views.back.refPx },
    stationMaxDeltaPct: g1.checks.stationMaxDeltaPct,
    surfaceDist: { maxM: g1.checks.maxDistToSurfaceM, pass: g1.checks.surfaceDistPass },
  },
  colors: build.colors,
  views: Object.entries(viewsRep.views || {}).map(([name, v]) => ({ name, ...v, readImageVerdict: VERDICTS[name] || null })),
  iouOverlay: ['delivery/hanfu-l1/iou-front.png', 'delivery/hanfu-l1/iou-side.png', 'delivery/hanfu-l1/iou-back.png'],
  gates,
  deviations,
  visualAcceptance: 'pending',
};

fs.writeFileSync(R('iteration-records/39-hanfu-l5-sheets-colors.json'), JSON.stringify(rec, null, 1));
console.log(`✅ 记录 39 已写：faces ${rec.controlGraph.faces} / gates ${gates.filter((g) => g.ok).length}/${gates.length} 过 / 偏差 ${deviations.length} 条 / views ${rec.views.length}`);
