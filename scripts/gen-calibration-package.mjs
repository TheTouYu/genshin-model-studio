#!/usr/bin/env node
/**
 * gen-calibration-package.mjs — 网格-面片体系最小校准包（确定性、可重跑）。
 *
 * 输出：delivery/calibration-mesh/<sample>/ 下每个样例的输入 JSON / 输出候选（.gil + .gia）/
 * structure.json / summary.json，并汇总到 delivery/calibration-mesh/MANIFEST.json。
 *
 * 覆盖：10009003 平面、10009006 三棱锥（压扁三角）、10009019 网格元件直出、
 * 以及「网格 → 面板化最小单元」（简单网格转为官方面片元件）。
 *
 * 运行（先构建，确保 dist 为最新）：
 *   npm run build --silent && node scripts/gen-calibration-package.mjs
 *
 * 说明：
 * - 确定性：相同输入必得相同字节（无时间戳/随机数）
 * - 10009019 直出：.gia/.gil 只携带 resourceId + 变换（GIA/GIL 不承载自定义网格几何），
 *   游戏侧是否把网格按几何渲染需在 docs/calibration-mesh-elements.md 记录对照结论。
 * - 预览截图：本仓库无轻量无头渲染路径（capture-views.sh 需本地服务 + 浏览器 CDP，且其
 *   渲染的是网页预览而非游戏语义），故不生成截图，仅保留「预期观察点」字段。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = new URL('../dist/src/core/encoder.js', import.meta.url)
try {
  // 仅用于 import 存在性校验（真正构建依赖这些模块编译完成）。
  await import(DIST.href)
} catch {
  console.error('[error] 请先构建再运行：npm run build --silent && node scripts/gen-calibration-package.mjs')
  process.exit(2)
}

const { encodeStructure } = await import('../dist/src/core/encoder.js')
const { resolveStructure, EMPTY_MODEL_RESOURCE_ID, DEFAULT_PREFAB_ID } = await import(
  '../dist/src/core/structure.js'
)
const { encodeGia } = await import('../dist/src/gia/gia-encoder.js')
const { panelize, colorStringToItemColor } = await import('../dist/src/mesh/panelize.js')

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const OUT = path.join(ROOT, 'delivery', 'calibration-mesh')

const GAME_VERSION = '6.7.0'
const UNIT_ID = 1077936129
const TEMPLATE_PREFAB_ID = 10005018

function colorHex(hex) {
  return { enabled: true, rgb: Number.parseInt(hex.replace('0x', ''), 16), opacity: 100, overlay: 'overwrite' }
}

// —— 样例对象：item 由结构项组成（非网格走 resolveStructure；网格直出手工装配）。——

// a) 10009003 平面：单位 1×1 / 缩放 0.5×0.3 / 斜 45°
const planeSamples = {
  'a1-plane-unit': {
    name: '平面_单位1x1',
    item: { resourceId: 10009003, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: colorHex('0x3E63DD') },
    observe: ['朝向：零旋转平躺、法线应朝 +Y', '双面性：背面/正面是否同色可见', '尺寸：scale=[1,1,1] 是否呈现 1×1']
  },
  'a2-plane-scaled': {
    name: '平面_缩放0.5x0.3',
    item: { resourceId: 10009003, position: [0, 0, 0], rotation: [0, 0, 0], scale: [0.5, 1, 0.3], color: colorHex('0x46A758') },
    observe: ['尺寸：scale=[0.5,1,0.3] 是否呈现宽 0.5 × 深 0.3（X/Z 对应宽深）', '朝向：是否仍为水平面']
  },
  'a3-plane-rotated45': {
    name: '平面_斜45度',
    item: { resourceId: 10009003, position: [0, 0.5, 0], rotation: [0, 45, 0], scale: [1, 1, 1], color: colorHex('0xFACC15') },
    observe: ['朝向：绕 Y 转 45° 后平面是否斜置', '尺寸：斜置后是否仍为 1×1 平面']
  }
}

// b) 10009006 三棱锥：压扁三角面（正三角形 / 任意斜三角形）
const triSamples = {
  'b1-tri-equilateral': {
    name: '三棱锥_压扁正三角',
    item: { resourceId: 10009006, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 0.02, 1], color: colorHex('0xE5484D') },
    observe: ['压扁语义：scale.y→0 是否得到一个三角形的面（正三角形）', '朝向：三角面应落在 XZ 平面（法线 ±Y）', '穿透：被压扁后是否仍为一个可见三角面']
  },
  'b2-tri-oblique': {
    name: '三棱锥_任意斜三角',
    item: { resourceId: 10009006, position: [0, 0, 0], rotation: [0, 30, 0], scale: [1.0, 0.02, 0.6], color: colorHex('0xF97316') },
    observe: ['任意形状：缩放+旋转后是否得到不等边三角形', '比例：不等边是否随 scale.x/z 精确可控']
  }
}

// c) 10009019 网格元件直出：单件（无面板化），说明「直出不携几何」。
const meshSample = {
  name: '网格元件_直出',
  mesh: {
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [0.5, 0, 1],
      [0.5, 1, 0.5]
    ],
    faces: [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 2, 3],
    colors: ['0x12A594', '0x12A594', '0x12A594', '0x12A594']
  },
  observe: ['直出字节：.gia/.gil 仅含 resourceId+变换（不携几何）', '游戏侧：是否按 vertices/faces 渲染几何（需确认）', '若渲染为空壳：走「面板化」路径导出官方面片']
}

// d) 网格 → 面板化最小单元：3×3 方格面（9 四边）与 4 段开口圆柱（4 四边）。
// 面按三角索引书写（每 3 个 = 1 三角），四边形 = (A,B,C,A,C,D) 两三角；颜色逐三角。
function gridMesh() {
  const verts = []
  for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) verts.push([i, 0, j])
  const faces = []
  const cols = []
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const a = i * 4 + j
      const b = i * 4 + j + 1
      const c = (i + 1) * 4 + j + 1
      const d = (i + 1) * 4 + j
      const quadCol = i % 2 === j % 2 ? '0x3E63DD' : '0x46A758'
      faces.push(a, b, c, a, c, d)
      cols.push(quadCol, quadCol)
    }
  }
  return { vertices: verts, faces, colors: cols }
}
function cylinderMesh(segments, radius, height) {
  const verts = []
  const faces = []
  const cols = []
  for (let k = 0; k < segments; k++) {
    const a0 = (k / segments) * 2 * Math.PI
    const a1 = ((k + 1) / segments) * 2 * Math.PI
    const b = verts.length
    verts.push([Math.cos(a0) * radius, 0, Math.sin(a0) * radius])
    verts.push([Math.cos(a1) * radius, 0, Math.sin(a1) * radius])
    verts.push([Math.cos(a1) * radius, height, Math.sin(a1) * radius])
    verts.push([Math.cos(a0) * radius, height, Math.sin(a0) * radius])
    const quadCol = k % 2 === 0 ? '0xE5484D' : '0xFACC15'
    faces.push(b, b + 1, b + 2, b, b + 2, b + 3)
    cols.push(quadCol, quadCol)
  }
  return { vertices: verts, faces, colors: cols }
}

function structureJson(name, item) {
  return { name, template: '空模型', items: [item] }
}

/** 网格 → 官方基础元件 structure：复用新面板化模块（与 CLI export-mesh 同源）。 */
function panelizeToStructure(name, mesh) {
  const { items, stats } = panelize(mesh)
  const structureItems = items.map((it) => ({
    resourceId: it.resourceId,
    position: it.position,
    rotation: it.rotation,
    scale: it.scale,
    ...(it.color === undefined ? {} : { color: colorStringToItemColor(it.color) })
  }))
  const structure = resolveStructure({ name, template: '空模型', items: structureItems })
  return { structure, stats }
}

// —— 写文件 & 汇总 ——
const samples = []

function record(sampleId, name, kind, { input, structure, gil, gia, observe, extra = {} }) {
  const dir = path.join(OUT, sampleId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'input.json'), JSON.stringify(input, null, 2) + '\n')
  writeFileSync(path.join(dir, 'structure.json'), JSON.stringify(structure, null, 2) + '\n')
  if (gil) writeFileSync(path.join(dir, 'model.gil'), gil)
  if (gia) writeFileSync(path.join(dir, 'model.gia'), gia)
  const summary = {
    schemaVersion: 1,
    kind: 'genshin-model-studio.calibration-mesh.summary',
    sample: sampleId,
    name,
    primitive: kind,
    resourceIds: structure.items.map((it) => it.resourceId),
    unitCount: structure.items.length,
    output: {
      gil: gil ? gil.length : 0,
      gia: gia ? gia.length : 0,
      structure: structure.items.length
    },
    observe,
    ...extra
  }
  writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
  samples.push(summary)
}

function makeGiaInput(name, items) {
  const giaItems = items.map((it, idx) => ({
    id: 1073741824 + idx + 1,
    resourceId: it.resourceId,
    position: it.position,
    rotation: it.rotation,
    scale: it.scale,
    ...(it.color === undefined ? {} : { color: it.color, name: it.name ?? `item_${idx + 1}` })
  }))
  return {
    schemaVersion: 1,
    model: { name, unitId: UNIT_ID, templatePrefabId: TEMPLATE_PREFAB_ID, items: giaItems },
    file: { filePath: `${name}.gia`, gameVersion: GAME_VERSION }
  }
}

function emitStandard(sampleId, name, kind, item, observe, extra = {}) {
  const structure = resolveStructure(structureJson(name, item))
  const gil = encodeStructure(structure)
  const giaInput = makeGiaInput(name, structure.items)
  const gia = encodeGia(giaInput)
  record(sampleId, name, kind, {
    input: structureJson(name, item),
    structure,
    gil,
    gia,
    observe,
    extra
  })
}

// a) 平面
for (const [id, s] of Object.entries(planeSamples)) {
  emitStandard(id, s.name, '10009003 平面', s.item, s.observe, { sampleFamily: 'a-plane' })
}
// b) 三棱锥压扁三角
for (const [id, s] of Object.entries(triSamples)) {
  emitStandard(id, s.name, '10009006 三棱锥(压扁三角)', s.item, s.observe, { sampleFamily: 'b-tri' })
}
// c) 网格直出（手工装配结构；resolveStructure 会拒绝 vertices/faces，故绕过）
{
  const item = {
    resourceId: 10009019,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    vertices: meshSample.mesh.vertices,
    faces: meshSample.mesh.faces,
    colors: meshSample.mesh.colors
  }
  const structure = {
    schemaVersion: 1,
    name: meshSample.name,
    template: '空模型',
    templatePrefabId: TEMPLATE_PREFAB_ID,
    templateInstanceId: TEMPLATE_PREFAB_ID,
    prefabId: DEFAULT_PREFAB_ID,
    definitionAuxiliaryIds: [1073741830],
    instanceAuxiliaryIds: [1073741831],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    items: [item]
  }
  const gil = encodeStructure(structure)
  const gia = encodeGia(makeGiaInput(meshSample.name, [{ ...item, name: meshSample.name }]))
  record('c-mesh-direct', meshSample.name, '10009019 网格(直出)', {
    input: structureJson(meshSample.name, item),
    structure,
    gil,
    gia,
    observe: meshSample.observe,
    extra: { sampleFamily: 'c-mesh-direct', carriesGeometry: false, note: '直出仅 resourceId+变换，不携几何' }
  })
}
// d) 面板化
{
  const grid = gridMesh()
  const panelizedGrid = panelizeToStructure('网格_3x3方格面_面板化', grid)
  const structure = panelizedGrid.structure
  const gia = encodeGia(makeGiaInput('网格_3x3方格面_面板化', structure.items))
  record('d1-grid-panelized', '网格_3x3方格面_面板化', '10009003 平面(面板化)', {
    input: structureJson('网格_3x3方格面_面板化', {
      resourceId: 10009019,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      vertices: grid.vertices,
      faces: grid.faces,
      colors: grid.colors
    }),
    structure,
    gil: encodeStructure(structure),
    gia,
    observe: [
      '单元数：9 个四边 → 9 个平面元件（三角配对；法线一致）',
      '朝向：均为水平面（法线 +Y）',
      '双面性：平面是否双面可见；相邻格是否无缝/重叠'
    ],
    extra: {
      sampleFamily: 'd-panelized',
      panelizeStats: panelizedGrid.stats,
      sourceMesh: { vertices: grid.vertices.length, triangles: grid.faces.length / 3, quads: panelizedGrid.stats.quads }
    }
  })
  const cyl = cylinderMesh(4, 0.5, 1.0)
  const panelizedCyl = panelizeToStructure('网格_4段开口圆柱_面板化', cyl)
  const structureCyl = panelizedCyl.structure
  const giaCyl = encodeGia(makeGiaInput('网格_4段开口圆柱_面板化', structureCyl.items))
  record('d2-cylinder-panelized', '网格_4段开口圆柱_面板化', '10009003 平面(面板化)', {
    input: structureJson('网格_4段开口圆柱_面板化', {
      resourceId: 10009019,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      vertices: cyl.vertices,
      faces: cyl.faces,
      colors: cyl.colors
    }),
    structure: structureCyl,
    gil: encodeStructure(structureCyl),
    gia: giaCyl,
    observe: [
      '单元数：4 个四边 → 4 个平面元件（三角配对；法线一致）',
      '朝向：各面法线沿径向外指，rotation 由显式局部基 → YXZ 欧拉计算',
      '滚转：用显式局部基消除滚转歧义（widthDir×normal 补全深度轴）'
    ],
    extra: {
      sampleFamily: 'd-panelized',
      panelizeStats: panelizedCyl.stats,
      sourceMesh: { vertices: cyl.vertices.length, triangles: cyl.faces.length / 3, quads: panelizedCyl.stats.quads }
    }
  })
}

// 汇总
const manifest = {
  schemaVersion: 1,
  kind: 'genshin-model-studio.calibration-mesh.manifest',
  generatedAt: 'deterministic',
  gameVersion: GAME_VERSION,
  outDir: OUT,
  samples,
  collaboration: {
    importSteps: '见 docs/calibration-mesh-elements.md（游戏/编辑器加载候选，或交给 genshin-ts 适配器）',
    screenshots: '本仓库无轻量无头渲染路径，本轮不生成预览截图（capture-views.sh 需本地服务+浏览器 CDP）',
    openItems: ['10009003 平面朝向/双面性/尺寸映射', '10009006 三棱锥压扁比例', '10009019 游戏侧是否呈现几何']
  }
}
writeFileSync(path.join(OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n')

const totalUnits = samples.reduce((s, x) => s + x.unitCount, 0)
const totalGil = samples.reduce((s, x) => s + x.output.gil, 0)
const totalGia = samples.reduce((s, x) => s + x.output.gia, 0)
console.log(`校准包生成完毕：${OUT}`)
console.log(`样例数=${samples.length}  单元总数=${totalUnits}  gil总字节=${totalGil}  gia总字节=${totalGia}`)
for (const s of samples) {
  console.log(`  ${s.sample}  unitCount=${s.unitCount}  gil=${s.output.gil}B  gia=${s.output.gia}B`)
}
