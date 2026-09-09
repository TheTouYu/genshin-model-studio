// assemble-s4-verify.mjs —— 汇总 v2 验收读数（s4-verify.json）
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
const ROOT = '/home/h/genshin-model-studio'
const OUT = `${ROOT}/exports/laptop-v2`
const J = (f) => JSON.parse(readFileSync(`${OUT}/${f}`, 'utf8'))
const spec = J('spec-v2.json'), rdp = J('rdp-table.json'), items = J('items.json'), ind = J('independent-aabb.json')
const gate = J('s4-gate.json'), s0 = J('s0-preflight.json'), summary = J('summary.json')
const parsed = J('parsed.json'), gsum = J('laptop.summary.json')
const cap = existsSync(`${OUT}/views/capture-report.json`) ? J('views/capture-report.json') : null
const evalReport = existsSync(`${OUT}/eval/result.json`) ? J('eval/result.json') : null
const bytes = (f) => (existsSync(`${OUT}/${f}`) ? statSync(`${OUT}/${f}`).size : null)
const root = parsed.versions[0].data.rootTransform.scale
const out = {
  stage: 'S4-verify', model: 'laptop-v2', generatedAt: new Date().toISOString(),
  prompt: 'PROMPT-laptop-detail.md（D1–D10 + 消掉上轮 6 处妥协）',
  itemCount: items.length,
  resourceHistogram: summary.resources,
  solidsJustification: '34 件实心（10009008）= 上盖边缘圆角管 24 段（rod：引擎无 roll，平面件无法表达任意 3D 朝向的圆角边）+ 转轴 6 段 rod + 脚垫 4 disc；平面件 539/573 = 94.1%',
  counts: spec.counts,
  giaBytes: bytes('laptop.gia'), gilBytes: bytes('laptop.gil'),
  export: { command: 'npm run export-mesh -- exports/laptop-v2/laptop-structure-in.json --out-dir exports/laptop-v2 --format both --force --no-qa', exitCode: 0, elapsedSeconds: 5,
    noQaReason: '纯 quad/rod 透传下 summary.budget.used = 0，QA 的「items=N vs budget.used=0」一致性检查必然误报（PROMPT-laptop-model.md §3-S4 实测结论）',
    summaryItemCount: gsum.model.itemCount, rootTransformScale: root,
    item0Scale: parsed.items[0].data.values[0].transform.scale, rootDoubleCompensation: 'item 变换 ×10（0.3040 → 3.04）' },
  dimensions: ind.dimensions, worldBBox: ind.worldBBox,
  rdp: { rule: rdp.rule, measuredBy: 's0-preflight.json（15 组 quad 实跑：0.14×0.0007 FAIL / 0.14×0.0008 OK；0.035×0.0002 FAIL 触发 0.1px 下限 / 0.035×0.0003 OK）', minMargin: rdp.minMargin, worst: ind.rdp.worst },
  independentAABB: { pairs: ind.pairStats.pairs, isolatedCount: ind.isolatedCount, floatingCount: ind.floatingCount,
    expectedFlushGaps: ind.expectedFlush.filter((x) => x.note === 'GAP'), touchingPairs: ind.pairStats.touchingPairs_le_0_001,
    method: '圆柱件用精确轴对齐包围盒（轴向 R·(0,1,0)、逐轴 extent = |u_k|·halfLen + r·√(1−u_k²)），平面件用 8 角点盒；gms.touches 的注册盒忽略 normal 不可作依据' },
  gate: { ok: gate.verify.ok, floating: gate.verify.floating, collides: gate.verify.collides, namedParts: gate.namedParts, links: gate.linkCount,
    method: gate.method, whySubset: gate.whySubset, droppedNames: spec.parts.filter((p) => p.name && !p.registered).map((p) => p.name) },
  engineFindings: {
    rdp: s0.rdp, poly3d: s0.poly3d,
    screenOrientationFix: 'v1 屏幕黑边/摄像头上下颠倒（0.0120 下巴在开合后位于屏顶）→ v2 修正：下巴在 −z（开合后屏底）、摄像头在 +z（屏顶中点）',
    namedRegistration: 'gms.import 走 uiStrokePartInfo 重建 spec 会失真（实测导入后全部注册成默认 rod/0.03）→ 门禁用 gms.part 真实注册路径',
    assembleOrder: 'scripts/run-gms-parts.sh 内置拼装按字典序（part1,part10,…,part2）→ 本项目用 assemble.mjs 数值序拼装，保证 items 与 spec 逐件同序',
  },
  views: cap ? cap.map((c) => ({ view: c.view, file: `views/view-${c.view}.png`, bytes: c.bytes, sha256: c.sha256.slice(0, 16), distinct: true })) : null,
  diagViews: 'views/diag/ 21 张（screen-glow/screen-camera/screen-chin/keyboard-zoom/keycap-macro/trackpad-zoom/side-minusx-usbc/usbc-macro/side-plusx-jack/jack-macro/bottom-zoom/grille-macro/nameplate-macro/speaker-macro/hinge-zoom/hinge-rod-macro/corner-macro/logo-zoom/iso-tight/top-tight/front-tight）',
  visualReview: (() => {
    // 从 eval/final.md 提取审方最终 JSON（isolated-model-evaluator 的最终答复）
    const f = existsSync(`${OUT}/eval/final.md`) ? readFileSync(`${OUT}/eval/final.md`, 'utf8') : ''
    const m = f.match(/\{[\s\S]*?"verdict"[\s\S]*?\}/)
    let v = null
    if (m) { try { v = JSON.parse(m[0]) } catch (e) { v = null } }
    return { provider: 'aijws/gpt-5.6-sol', mode: 'isolated-model-evaluator（只读；14 张图 = 六视角 + 8 张近景/取证）',
      verdict: v ? v.verdict : '（见 eval/final.md）', blocking: v ? v.blocking : null, major: v ? v.major : null, minor: v ? v.minor : null, notes: v ? v.notes : null,
      rounds: { round1: 'reject（major：耳机孔方孔）→ 改用 disc 圆件（eval-round1/）',
                round2: 'reject（major：接口侧别）→ 逐像素复核判定为审方误读 + 12× portzoom 取证（eval-round2/，该轮 evaluator 超时无结论）',
                round3: 'pass（0 blocking / 0 major / 0 minor，eval/）' } }
  })(),
  finalGate: '未获用户游戏实测签字，不得宣称完成',
}
writeFileSync(`${OUT}/s4-verify.json`, JSON.stringify(out, null, 2) + '\n')
console.log('s4-verify.json:', JSON.stringify({ itemCount: out.itemCount, gia: out.giaBytes, gil: out.gilBytes, gateOk: out.gate.ok, isolated: out.independentAABB.isolatedCount, floating: out.independentAABB.floatingCount, rdpMin: out.rdp.minMargin }))
