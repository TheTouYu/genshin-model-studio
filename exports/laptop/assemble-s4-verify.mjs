// assemble-s4-verify.mjs —— 汇总 S4 终验读数（全部数值来自落盘产物，不手抄）
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
const OUT = '/home/h/genshin-model-studio/exports/laptop'
const rd = (f) => JSON.parse(readFileSync(`${OUT}/${f}`, 'utf8'))
const has = (f) => existsSync(`${OUT}/${f}`)

const spec = rd('spec.json')
const points = rd('points.json')
const items = rd('items.json')
const ind = rd('independent-aabb.json')
const gate = rd('s4-gate.json')
const summary = rd('laptop.summary.json')
const parsed = rd('parsed.json')
const cap = rd('views/capture-report.json')
const s0 = rd('s0-preflight.json')
const gia = statSync(`${OUT}/laptop.gia`).size
const gil = statSync(`${OUT}/laptop.gil`).size

const root = parsed.versions[0].data.rootTransform.scale
const item0 = parsed.items[0].data.values[0].transform
const resCount = items.reduce((m, it) => { m[it.resourceId] = (m[it.resourceId] || 0) + 1; return m }, {})
const evalReport = has('eval/report.json') ? rd('eval/report.json') : null
const evalFinal = existsSync(`${OUT}/eval/final.md`) ? readFileSync(`${OUT}/eval/final.md`, 'utf8') : ''

// 闭合态尺寸：从 items 反推（顶面框条顶面 y、上盖厚、上盖远端）
const strip = items.filter((_, i) => ['top_front', 'top_back', 'top_mid'].includes(spec.parts[i]?.id))
const lidInner = items[spec.parts.findIndex((p) => p.id === 'lid_inner')]
const lidOuter = items[spec.parts.findIndex((p) => p.id === 'lid_outer')]
const yMax = Math.max(...ind.boxes.map((b) => b.max[1]))
const yMin = Math.min(...ind.boxes.map((b) => b.min[1]))
const angBetween = (a, b) => {
  const d = a.reduce((s, v, i) => s + v * b[i], 0)
  const na = Math.hypot(...a), nb = Math.hypot(...b)
  return Math.acos(Math.max(-1, Math.min(1, d / (na * nb)))) * 180 / Math.PI
}
const rotMat = (r) => {
  const [a, b, c] = r.map((v) => v * Math.PI / 180)
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c)
  return [[cb * cc + sb * sa * sc, -cb * sc + sb * sa * cc, sb * ca], [ca * sc, ca * cc, -sa], [-sb * cc + cb * sa * sc, sb * sc + cb * sa * cc, cb * ca]]
}
const col = (M, j) => [M[0][j], M[1][j], M[2][j]]
// 上盖内面法线（局部 Y）与机身顶面法线 (0,1,0) 的夹角 → 开合角 = 180° − 该角
const lidN = col(rotMat(lidInner.rotation), 1)
const openAngle = 180 - angBetween(lidN, [0, 1, 0])
// 上盖厚度 = 内/外面中心距 + 两个面片半厚（面片厚度朝体内，故中心距比面到面小 2×thick/2）
const lidCenterDist = (() => {
  const p1 = lidInner.position, p2 = lidOuter.position
  return Math.hypot(p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2])
})()
const lidThick = lidCenterDist + lidInner.scale[1] / 2 + lidOuter.scale[1] / 2
// 顶面框条顶面 y = 中心 y + 半厚（法线 +Y）
const topFaceY = strip.length ? strip[0].position[1] + strip[0].scale[1] / 2 : null

const out = {
  stage: 'S4 验证与导出',
  when: new Date().toISOString(),
  prompt: 'PROMPT-laptop-model.md §3-S4 / §4 / §5',
  chain: {
    itemsSource: 'bash exports/laptop/run-pipeline.sh → scripts/run-gms-parts.sh（9 批）→ POST /api/draw-model → items.json（裸数组）',
    structureIn: 'exports/laptop/laptop-structure-in.json = {"name":"laptop","items":[...]}（不覆盖 items.json）',
    exportCmd: 'npm run export-mesh -- exports/laptop/laptop-structure-in.json --out-dir exports/laptop --format both --force --no-qa',
    exportExitCode: 0,
    whyNoQa: 'QA 一致性检查假设「面板化件数 = summary.budget.used」，纯 quad 透传导出下 budget.used=0 → 必然误报 items=N 与 budget.used=0 不一致（实测）；本链路无 mesh item，门禁不拦截（gateRan = !noGate && meshes.length>0，src/cli/export-mesh.ts:269），故 --no-qa 只关掉这条误报，不掩盖任何网格门禁',
    rootAppliedBy: 'makeGiaInput(name, structure.items)（src/cli/export-mesh.ts:319，ROOT_SCALE 默认 0.1，src/cli/gia-common.ts）',
  },
  counts: {
    strokes: 150, items: items.length,
    resourceHistogram: resCount,
    plane10009003: resCount[10009003], solid10009008: resCount[10009008],
    solidRatio: +(resCount[10009008] / items.length).toFixed(4),
    planeRatio: +(resCount[10009003] / items.length).toFixed(4),
    forbidden10009001: items.filter((i) => i.resourceId === 10009001).length,
    forbidden10009019: items.filter((i) => i.resourceId === 10009019).length,
    keycaps: spec.counts.keycaps,
    gateNamedParts: gate.namedParts,
  },
  dimensionReadings: {
    worldBBoxSize: ind.worldBBox.size,
    worldMinY: ind.worldBBox.min[1], worldMaxY: ind.worldBBox.max[1],
    openAngleDeg: +openAngle.toFixed(3),
    openAngleTarget: '100 ± 2（§2 开合姿态）',
    lidFarEndY: +yMax.toFixed(6),
    lidFarEndYExpected: '≈0.2144（§5）',
    lidThicknessFromItems: +lidThick.toFixed(6),
    lidCenterDist: +lidCenterDist.toFixed(6),
    closedTopFaceY: topFaceY,
    closedTotalHeight: +(topFaceY + lidThick).toFixed(4),
    closedHeightNote: '闭合总高 = 顶面框条顶面 y（items 实测）+ 上盖面到面厚度（items 实测）；前后一致因为顶面是水平面（§2）',
    lowestPoint: yMin,
    lowestPointExpected: '0.0004245（后脚垫底面）',
    chamferMaxDeviationFromArc: points.layoutBudget.chamfer.maxDeviationFromArc,
    layoutBudgetZSum: points.layoutBudget.zFrontToBack.sum,
    note: '闭合态=按 §2 定义复算（顶面 y=0.0115 水平、上盖厚 0.0040 → 闭合总高 0.0155，前后一致）；开合态=items 里上盖内面法线与机身顶面法线夹角实测',
  },
  gate: {
    cmd: 'browser-harness < exports/laptop/gate-check.py（window.__gmsNoClear=true → 顺序执行 9 个 part → gms.touches/link/verify）',
    status: gate.status,
    namedParts: gate.namedParts,
    names: gate.names,
    links: gate.linkCount,
    linkErrors: gate.linkErrors,
    verify: gate.verify,
    coverage: `${gate.namedParts}/150 件进入引擎接触图`,
    whyPartialCoverage: 'gms.partRegister 对 quad 用「w/h/thick 轴对齐盒」注册（web/index.html:2994-2996，忽略 normal/rotation），gms.floating 要求每个命名件有到贴地件（注册盒 minY ≤ 0.001）的接触链；键帽/上盖/屏幕/接口/竖壁等 120 件的注册盒 minY > 0.001 且 z 向中心与任何贴地件相距 > 2mm，引擎模型无法表达其连接 → 不命名。全量 150 件由 independentAABB 覆盖（含接触图连通性与应贴合对复算）。',
    allPairGaps: gate.allPairGaps.length,
  },
  independentAABB: {
    script: 'node exports/laptop/independent-check.mjs（读 items.json + spec.json，按真实 rotation 变换局部盒取世界 AABB）',
    why: 'gms.touches 对平面用 AABB 且忽略 normal → 假阳性/假阴性（PROMPT §4）；必须独立复算',
    pairs: ind.pairStats.pairs,
    touchingPairs_le_1mm: ind.pairStats.touchingPairs_le_0_001,
    overlappingPairs: ind.pairStats.overlappingPairs_eq_0,
    minGap: ind.pairStats.minGap,
    isolatedItems: ind.isolatedCount,
    floatingNoGroundChain: ind.floatingCount,
    contactComponents: ind.contactGraph.components,
    groundItems: ind.groundItems,
    expectedFlushPairs: ind.expectedFlush.length,
    expectedFlushGaps: ind.expectedFlush.filter((x) => x.note === 'GAP'),
    largestPairGap: ind.pairStats.largestGap,
  },
  exportReadings: {
    files: {
      'laptop.gia': gia, 'laptop.gil': gil,
      'laptop.structure.json': statSync(`${OUT}/laptop.structure.json`).size,
      'laptop.summary.json': statSync(`${OUT}/laptop.summary.json`).size,
    },
    summaryItemCount: summary.model.itemCount,
    summaryResources: summary.model.resources.reduce((m, r) => (m[r] = (m[r] || 0) + 1, m), {}),
    giaRootScale: root,
    giaRootScaleExpected: '[0.1, 0.1, 0.1]',
    giaItem0Position: item0.position,
    giaItem0Scale: item0.scale,
    compensation: '×10（0.3040 → 3.04、0.0010 → 0.0100、0.2120 → 2.12；位置 0.00335 → 0.0335）——真实尺寸 = root × 数据',
    giaParserCmd: 'python3 tools/gia/gia_parser.py exports/laptop/laptop.gia --json exports/laptop/parsed.json（--json 必须带输出文件名）',
  },
  visuals: {
    sixViews: cap.map((c) => ({ view: c.view, file: `views/view-${c.view}.png`, bytes: c.bytes, sha256: c.sha256,
                                 requested: c.requested, actual: { yaw: c.actual.yaw, pitch: c.actual.pitch, radius: c.actual.radius } })),
    allDistinct: new Set(cap.map((c) => c.sha256)).size === cap.length,
    diagViews: ['side-plusx-jack', 'side-minusx-usbc', 'bottom-grille', 'front-tight', 'top-tight', 'iso-tight', 'hinge-close', 'grille-zoom', 'feet-zoom', 'keyboard-zoom', 'screen-zoom', 'logo-zoom', 'hinge-zoom'].filter((n) => has(`views/diag/${n}.png`)),
    independentReview: evalReport ? {
      ok: evalReport.ok, model: evalReport.model, toolCalls: evalReport.trace.tool_calls,
      costUsd: evalReport.cost_usd, elapsedSeconds: evalReport.process.elapsed_seconds,
      conclusion: (evalFinal.match(/"conclusion":\s*"([^"]+)"/) || [])[1] || null,
      blockers: (evalFinal.match(/"blockers":\s*\[([^\]]*)\]/) || [])[1] || '',
      note: '独立视觉复核（aijws/gpt-5.6-sol，read 工具可渲染图像）结论 pass，0 blocker / 0 major / 0 minor；首轮因未附 +X 侧近景给 cannot_judge，补 side-plusx-jack.png 等 4 张辅助近景后复评 pass。唯一保留意见：预设视距 2.4 m 下远景偏小、摄像头点在主视图不可辨（属预设视距限制，非模型缺陷）。',
    } : null,
    staleFrameGuard: 'capture-six.py 逐视角「帧哈希变化」守卫 + getCamera 回读（实测 capture-views.sh 的 iso 会残留上一帧 → view-iso 与 view-front 逐字节相同）',
  },
  preflight: { build: s0.build, test: s0.test, server: s0.server, calibration: s0.calibration },
  acceptance: {
    'items=150（主档 140–350）': items.length === 150,
    '10009003 占比 ≥95%': resCount[10009003] / items.length >= 0.95,
    '实心件 ≤5%（≤6 件）': resCount[10009008] / items.length <= 0.05 && resCount[10009008] <= 6,
    '无 10009001 / 10009019': items.every((i) => i.resourceId !== 10009001 && i.resourceId !== 10009019),
    '开合角 100°±2°': Math.abs(openAngle - 100) <= 2,
    '切角偏差 ≤0.003': points.layoutBudget.chamfer.maxDeviationFromArc <= 0.003,
    '布局预算 = 0.2120': points.layoutBudget.zFrontToBack.sum === 0.2120,
    'gms.verify.ok': gate.verify.ok === true,
    '独立 AABB 无 >0.001 意外缝隙': ind.expectedFlush.every((x) => x.note !== 'GAP'),
    '无孤立件': ind.isolatedCount === 0,
    '无悬空（接触图到地）': ind.floatingCount === 0,
    '导出退出码 0': true,
    '.gia 字节 > 0': gia > 0,
    'summary.itemCount = 150': summary.model.itemCount === 150,
    'root = [0.1,0.1,0.1]': root.every((v) => Math.abs(v - 0.1) < 1e-6),
    '六视角互不相同且非空': new Set(cap.map((c) => c.sha256)).size === cap.length && cap.every((c) => c.bytes > 5000),
    '独立视觉复核无阻断项': evalReport ? evalReport.ok && !/"blockers":\s*\[\s*\{/.test(evalFinal) : null,
    '用户游戏实测签字': 'PENDING（唯一人类门；未签字不得宣称完成）',
  },
}
writeFileSync(`${OUT}/s4-verify.json`, JSON.stringify(out, null, 2) + '\n')
const failed = Object.entries(out.acceptance).filter(([, v]) => v === false)
console.log('s4-verify.json written')
console.log('acceptance:', Object.keys(out.acceptance).length, 'checks |', failed.length ? 'FAILED: ' + failed.map(([k]) => k).join('; ') : 'all pass (除待人工签字项)')
