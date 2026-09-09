// gen-parts.mjs — 笔记本电脑（MacBook 式银灰极简）150 元件规格生成器
//
// 依据：PROMPT-laptop-model.md §2 规格表（逐字复算）。
// 产出：
//   scripts/parts/laptop-*.js        —— 自包含 part 输入脚本（run-gms-parts.sh 直接跑）
//   exports/laptop/spec.json         —— 全部元件规格（gate 复算来源）
//   exports/laptop/points.json       —— S1 关键点表 + 实测方向映射（conventions）
//
// 引擎语义（2026-09 实测 + 源码核对）：
//   part('quad', {x,y,z,w,h,thick,normal}) → item {position:[x,y,z], rotation:rotFromNormal(n), scale:[w,thick,h]}
//   几何局部基（web/draw/preview.js 10009003 = PlaneGeometry + rotateX(−90)，scale 作用于局部 X/Y/Z）：
//     局部 X = w 方向、局部 Y = 法线（厚度方向）、局部 Z = h 方向。
//   rotFromNormal(n) = [90+δ, 90−φ, 0]，δ=−asin(ny)、φ=atan2(nz,nx)（|n_xz|→0 时 φ=0）。
//   因此页面推导的 w 轴 = (sinφ,0,−cosφ)、h 轴 = R·(0,0,1)（R=Ry(90−φ)Rx(90+δ)）。
//   本生成器逐面核对「页面推导轴」与「设计轴」，不平行即用 gms.props 覆写 rotation（PROMPT §2 允许）。
//   贴面件：中心 = 表面点 − (thick/2)·n（厚度朝体内），故可见面恰在设计表面上。
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = '/home/h/genshin-model-studio'
const OUT_PARTS = join(ROOT, 'scripts/parts')
const OUT_EXP = join(ROOT, 'exports/laptop')

// ---------- §2 规格常量（逐字复算） ----------
const W = 0.3040, D = 0.2120, H = 0.0155
const HX = W / 2, HZ = D / 2
const TOP_Y = 0.0115, LID_TH = 0.0040, TH = 0.0010, R_CHAM = 0.0100
const yBottom = (z) => 0.0006 + (z + HZ) / D * 0.0045
const OPEN_DEG = 100
const PIVOT = { y: 0.0115, z: -0.1000 }
const THETA = -OPEN_DEG * Math.PI / 180
const CT = Math.cos(THETA), ST = Math.sin(THETA)
const rotPt = (p) => { const dy = p[1] - PIVOT.y, dz = p[2] - PIVOT.z; return [p[0], PIVOT.y + dy * CT - dz * ST, PIVOT.z + dy * ST + dz * CT] }
const rotVec = (v) => [v[0], v[1] * CT - v[2] * ST, v[1] * ST + v[2] * CT]
const norm = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l] }
const round = (v, n = 8) => Number(v.toFixed(n))

const C = {
  body: '#C9CDD4', well: '#1A1A1C', key: '#2A2A2E', tp: '#B9BEC6',
  hinge: '#8A8F96', port: '#4A4E55', logo: '#E8EAED', screen: '#14294A', bezel: '#1A1A1C',
}

const parts = []
let seq = 0
const add = (p) => { p.seq = ++seq; parts.push(p); return p }
// 面片：闭态「表面点 + 法线 + w 方向 + h 方向 + 沿 w/h 的长度」，厚度沿 −n 向内
const quad = (o) => add({ type: 'quad', lid: false, thick: TH, ...o })

// —— 底座 5 面 ——
quad({ id: 'base_bottom', name: 'base_bottom', batch: 'base', color: C.body,
  surface: [0, (0.0006 + 0.0051) / 2, 0], n: norm([0, -1, 0.0045 / D]), wDir: [1, 0, 0], hDir: norm([0, -0.0045 / D, -1]), w: W, h: D,
  ref: '§2 底座楔形 底面斜面 y_bottom(z)=0.0006+(z+0.1060)/0.2120×0.0045' })
quad({ id: 'base_front', name: 'base_front', batch: 'base', color: C.body,
  surface: [0, (yBottom(HZ) + TOP_Y) / 2, HZ], n: [0, 0, 1], wDir: [1, 0, 0], hDir: [0, 1, 0],
  w: W, h: TOP_Y - yBottom(HZ), ref: '§2 底座前壁（z=+0.1060，高 0.0064）' })
quad({ id: 'base_back', name: 'base_back', batch: 'base', color: C.body,
  surface: [0, (yBottom(-HZ) + TOP_Y) / 2, -HZ], n: [0, 0, -1], wDir: [1, 0, 0], hDir: [0, 1, 0],
  w: W, h: TOP_Y - yBottom(-HZ), ref: '§2 底座后壁（z=−0.1060，高 0.0109）' })
quad({ id: 'base_left', name: 'base_left', batch: 'base', color: C.body,
  surface: [-HX, 0.00605, 0], n: [-1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0],
  w: D, h: 0.0109, ref: '§2 底座左壁（x=−0.1520，全高 0.0109）' })
quad({ id: 'base_right', name: 'base_right', batch: 'base', color: C.body,
  surface: [HX, 0.00605, 0], n: [1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0],
  w: D, h: 0.0109, ref: '§2 底座右壁（x=+0.1520，全高 0.0109）' })

// —— 顶面 7 张框条 ——
const strip = (id, cx, cz, wx, wz, ref) => quad({
  id, name: id, batch: 'base', color: C.body, surface: [cx, TOP_Y, cz], n: [0, 1, 0],
  wDir: [0, 0, 1], hDir: [1, 0, 0], w: wz, h: wx, ref,
})
strip('top_front', 0, 0.1000, W, 0.0120, '§2 顶面框条① 前边距 0.3040×0.0120（z +0.0940…+0.1060）')
strip('top_tp_left', -0.1085, 0.0570, 0.0870, 0.0740, '§2 顶面框条② 触控板左 0.0870×0.0740')
strip('top_tp_right', 0.1085, 0.0570, 0.0870, 0.0740, '§2 顶面框条③ 触控板右 0.0870×0.0740')
strip('top_mid', 0, 0.0175, W, 0.0050, '§2 顶面框条④ 中隔 0.3040×0.0050（z +0.0150…+0.0200）')
strip('top_kb_left', -0.1450, -0.0395, 0.0140, 0.1090, '§2 顶面框条⑤ 键盘井左 0.0140×0.1090')
strip('top_kb_right', 0.1450, -0.0395, 0.0140, 0.1090, '§2 顶面框条⑥ 键盘井右 0.0140×0.1090')
strip('top_back', 0, -0.1000, W, 0.0120, '§2 顶面框条⑦ 后边距 0.3040×0.0120（z −0.1060…−0.0940）')

// —— 底座四角 45° 切角 ——
for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
  const cz = sz * (HZ - R_CHAM / 2)
  const yb = yBottom(cz)
  quad({
    id: `cham_base_${sx > 0 ? 'p' : 'n'}${sz > 0 ? 'p' : 'n'}`,
    name: `cham_base_${sx > 0 ? 'p' : 'n'}${sz > 0 ? 'p' : 'n'}`, batch: 'base', color: C.body,
    surface: [sx * (HX - R_CHAM / 2), (yb + TOP_Y) / 2, cz], n: norm([sx, 0, sz]),
    wDir: norm([sx, 0, -sz]), hDir: [0, 1, 0], w: R_CHAM * Math.SQRT2, h: TOP_Y - yb,
    ref: '§2 圆角 四角单张 45° 切角 quad，等效半径 R 0.0100',
  })
}

// —— 键盘井（井底 1 + 侧壁 4；侧壁法线朝井内）——
const WELL = { x0: -0.1380, x1: 0.1380, z0: -0.0940, z1: 0.0150, floor: 0.0095 }
quad({ id: 'well_floor', name: 'well_floor', batch: 'keyboard', color: C.well,
  surface: [0, WELL.floor, (WELL.z0 + WELL.z1) / 2], n: [0, 1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0],
  w: WELL.z1 - WELL.z0, h: WELL.x1 - WELL.x0, ref: '§2 键盘井 井底（y=0.0095）' })
quad({ id: 'well_front', name: 'well_front', batch: 'keyboard', color: C.well,
  surface: [0, (WELL.floor + TOP_Y) / 2, WELL.z1], n: [0, 0, -1], wDir: [1, 0, 0], hDir: [0, 1, 0],
  w: WELL.x1 - WELL.x0, h: TOP_Y - WELL.floor, ref: '§2 键盘井 前侧壁（法线朝井内）' })
quad({ id: 'well_back', name: 'well_back', batch: 'keyboard', color: C.well,
  surface: [0, (WELL.floor + TOP_Y) / 2, WELL.z0], n: [0, 0, 1], wDir: [1, 0, 0], hDir: [0, 1, 0],
  w: WELL.x1 - WELL.x0, h: TOP_Y - WELL.floor, ref: '§2 键盘井 后侧壁（法线朝井内）' })
quad({ id: 'well_left', name: 'well_left', batch: 'keyboard', color: C.well,
  surface: [WELL.x0, (WELL.floor + TOP_Y) / 2, (WELL.z0 + WELL.z1) / 2], n: [1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0],
  w: WELL.z1 - WELL.z0, h: TOP_Y - WELL.floor, ref: '§2 键盘井 左侧壁（法线朝井内）' })
quad({ id: 'well_right', name: 'well_right', batch: 'keyboard', color: C.well,
  surface: [WELL.x1, (WELL.floor + TOP_Y) / 2, (WELL.z0 + WELL.z1) / 2], n: [-1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0],
  w: WELL.z1 - WELL.z0, h: TOP_Y - WELL.floor, ref: '§2 键盘井 右侧壁（法线朝井内）' })

// —— 键帽 79（行分布 14/14/14/13/13/11；第 6 行 = 10 键 + 空格 0.0780）——
const COL = 0.0190, ROW = 0.0180, CAP = 0.0150, CAP_TH = 0.0010
const colX = (i) => -0.1235 + i * COL
const rowZ = (j) => -0.0845 + j * ROW
const KEY_ROWS = [
  { xs: Array.from({ length: 14 }, (_, i) => colX(i)) },
  { xs: Array.from({ length: 14 }, (_, i) => colX(i)) },
  { xs: Array.from({ length: 14 }, (_, i) => colX(i)) },
  { xs: Array.from({ length: 13 }, (_, i) => -0.1140 + i * COL) },
  { xs: Array.from({ length: 13 }, (_, i) => -0.1140 + i * COL) },
  { xs: Array.from({ length: 10 }, (_, i) => -0.1265 + i * COL), spaceX: 0.0950, spaceW: 0.0780 },
]
let keyCount = 0
KEY_ROWS.forEach((row, j) => {
  const z = rowZ(j)
  row.xs.forEach((x, i) => {
    keyCount++
    quad({ id: `key_r${j}c${i}`, batch: 'keyboard', color: C.key,
      surface: [x, TOP_Y, z], n: [0, 1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0],
      w: CAP, h: CAP, thick: CAP_TH, ref: `§2 键帽 第${j + 1}行第${i + 1}键 0.0150×0.0150×0.0010` })
  })
  if (row.spaceX !== undefined) {
    keyCount++
    quad({ id: `key_r${j}_space`, batch: 'keyboard', color: C.key,
      surface: [row.spaceX, TOP_Y, z], n: [0, 1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0],
      w: CAP, h: row.spaceW, thick: CAP_TH, ref: '§2 键帽 空格 0.0780×0.0150（占 4 槽）' })
  }
})

// —— 触控板（面 1 + 侧壁 4；侧壁法线朝凹槽内）——
const TP = { cx: 0, cz: 0.0570, wx: 0.1300, wz: 0.0740, th: 0.0006, wallH: 0.0010 }
quad({ id: 'tp_face', name: 'tp_face', batch: 'trackpad', color: C.tp,
  surface: [TP.cx, TOP_Y, TP.cz], n: [0, 1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0],
  w: TP.wz, h: TP.wx, thick: TP.th, ref: '§2 触控板 0.1300×0.0740 中心 (0,0.0115,+0.0570) 厚 0.0006' })
quad({ id: 'tp_front', name: 'tp_front', batch: 'trackpad', color: C.tp,
  surface: [TP.cx, TOP_Y - TP.wallH / 2, TP.cz + TP.wz / 2], n: [0, 0, -1], wDir: [1, 0, 0], hDir: [0, 1, 0],
  w: TP.wx, h: TP.wallH, ref: '§2 触控板 前侧壁（法线朝凹槽内；h 0.0010 见 engineFix）' })
quad({ id: 'tp_back', name: 'tp_back', batch: 'trackpad', color: C.tp,
  surface: [TP.cx, TOP_Y - TP.wallH / 2, TP.cz - TP.wz / 2], n: [0, 0, 1], wDir: [1, 0, 0], hDir: [0, 1, 0],
  w: TP.wx, h: TP.wallH, ref: '§2 触控板 后侧壁（法线朝凹槽内；h 0.0010 见 engineFix）' })
quad({ id: 'tp_left', name: 'tp_left', batch: 'trackpad', color: C.tp,
  surface: [TP.cx - TP.wx / 2, TOP_Y - TP.wallH / 2, TP.cz], n: [1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0],
  w: TP.wz, h: TP.wallH, ref: '§2 触控板 左侧壁（法线朝凹槽内；h 0.0010 见 engineFix）' })
quad({ id: 'tp_right', name: 'tp_right', batch: 'trackpad', color: C.tp,
  surface: [TP.cx + TP.wx / 2, TOP_Y - TP.wallH / 2, TP.cz], n: [-1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0],
  w: TP.wz, h: TP.wallH, ref: '§2 触控板 右侧壁（法线朝凹槽内；h 0.0010 见 engineFix）' })

// —— 上盖（6 面 + 4 切角；闭态定义，整体绕转轴开 100°）——
const lidQuad = (o) => quad({ lid: true, batch: 'lid', ...o })
lidQuad({ id: 'lid_inner', name: 'lid_inner', color: C.body,
  surface: [0, TOP_Y, 0], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: W, h: D,
  ref: '§2 上盖 内面（闭态 y=0.0115，屏幕面）' })
lidQuad({ id: 'lid_outer', name: 'lid_outer', color: C.body,
  surface: [0, TOP_Y + LID_TH, 0], n: [0, 1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: W, h: D,
  ref: '§2 上盖 外面（闭态 y=0.0155）' })
lidQuad({ id: 'lid_front', name: 'lid_front', color: C.body,
  surface: [0, TOP_Y + LID_TH / 2, HZ], n: [0, 0, 1], wDir: [1, 0, 0], hDir: [0, 1, 0], w: W, h: LID_TH,
  ref: '§2 上盖 前缘（z=+0.1060）' })
lidQuad({ id: 'lid_back', name: 'lid_back', color: C.body,
  surface: [0, TOP_Y + LID_TH / 2, -HZ], n: [0, 0, -1], wDir: [1, 0, 0], hDir: [0, 1, 0], w: W, h: LID_TH,
  ref: '§2 上盖 后缘（z=−0.1060，转轴侧）' })
lidQuad({ id: 'lid_left', name: 'lid_left', color: C.body,
  surface: [-HX, TOP_Y + LID_TH / 2, 0], n: [-1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0], w: D, h: LID_TH,
  ref: '§2 上盖 左侧缘（x=−0.1520）' })
lidQuad({ id: 'lid_right', name: 'lid_right', color: C.body,
  surface: [HX, TOP_Y + LID_TH / 2, 0], n: [1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0], w: D, h: LID_TH,
  ref: '§2 上盖 右侧缘（x=+0.1520）' })
for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
  lidQuad({
    id: `cham_lid_${sx > 0 ? 'p' : 'n'}${sz > 0 ? 'p' : 'n'}`,
    name: `cham_lid_${sx > 0 ? 'p' : 'n'}${sz > 0 ? 'p' : 'n'}`, color: C.body,
    surface: [sx * (HX - R_CHAM / 2), TOP_Y + LID_TH / 2, sz * (HZ - R_CHAM / 2)], n: norm([sx, 0, sz]),
    wDir: norm([sx, 0, -sz]), hDir: [0, 1, 0], w: R_CHAM * Math.SQRT2, h: LID_TH,
    ref: '§2 圆角 上盖四角单张 45° 切角 quad',
  })
}

// —— 屏幕（可视区 1 + 黑边 4 + 背板 1）+ 摄像头 + logo ——
const SC = { wx: 0.2920, wz: 0.1825, bezelLR: 0.0060, bezelTop: 0.0060, bezelBottom: 0.0120, th: 0.0003 }
const scZ0 = -(SC.wz + SC.bezelTop + SC.bezelBottom) / 2 + SC.bezelTop
const scZ1 = scZ0 + SC.wz
const scZc = (scZ0 + scZ1) / 2
const decal = (o) => quad({ lid: true, batch: 'screen', thick: SC.th, ...o })
decal({ id: 'screen_backplate', name: 'screen_backplate', color: C.bezel,
  surface: [0, TOP_Y - SC.th, 0], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: W, h: D,
  ref: '§2 屏幕 背板 1（上盖内面底衬）' })
decal({ id: 'bezel_top', name: 'bezel_top', color: C.bezel,
  surface: [0, TOP_Y - SC.th * 2, scZ0 - SC.bezelTop / 2], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1],
  w: W, h: SC.bezelTop, ref: '§2 屏幕 黑边 上 0.0060' })
decal({ id: 'bezel_bottom', name: 'bezel_bottom', color: C.bezel,
  surface: [0, TOP_Y - SC.th * 2, scZ1 + SC.bezelBottom / 2], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1],
  w: W, h: SC.bezelBottom, ref: '§2 屏幕 黑边 下 0.0120' })
decal({ id: 'bezel_left', name: 'bezel_left', color: C.bezel,
  surface: [-(SC.wx / 2 + SC.bezelLR / 2), TOP_Y - SC.th * 2, scZc], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1],
  w: SC.bezelLR, h: SC.wz, ref: '§2 屏幕 黑边 左 0.0060' })
decal({ id: 'bezel_right', name: 'bezel_right', color: C.bezel,
  surface: [SC.wx / 2 + SC.bezelLR / 2, TOP_Y - SC.th * 2, scZc], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1],
  w: SC.bezelLR, h: SC.wz, ref: '§2 屏幕 黑边 右 0.0060' })
decal({ id: 'screen_glow', name: 'screen_glow', color: C.screen,
  surface: [0, TOP_Y - SC.th * 3, scZc], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1],
  w: SC.wx, h: SC.wz, ref: '§2 屏幕 可视区 0.2920×0.1825（16:10，屏内黑边左/右 0.0060、上 0.0060、下 0.0120）' })
decal({ id: 'camera', name: 'camera', color: C.logo,
  surface: [0, TOP_Y - SC.th * 4, scZ0 - SC.bezelTop / 2], n: [0, -1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1],
  w: 0.0020, h: 0.0020, ref: '§2 摄像头 0.0020×0.0020 方形 quad（屏上边中点）' })
decal({ id: 'logo', name: 'logo', color: C.logo,
  surface: [0, TOP_Y + LID_TH + SC.th, 0], n: [0, 1, 0], wDir: [1, 0, 0], hDir: [0, 0, -1], w: 0.0140, h: 0.0140,
  ref: '§2 品牌 logo 位 0.0140×0.0140 方形 quad（上盖背面中心）' })

// —— 接口（2×USB-C：凹槽底板 1 + 三面唇壁；耳机孔：底板 1 + 内壁 1）——
// 平面件无法在侧壁上开洞 → 接口做成「微微外凸的浅槽」：底板贴壁外 0.0004，唇壁从壁面伸到槽底。
const PD = 0.0004
const usbc = (zc, k) => {
  const tag = `usbc${k}`
  const wy = 0.0025, wz = 0.0085
  quad({ id: `${tag}_back`, name: `${tag}_back`, batch: 'ports', color: C.port,
    surface: [-HX - PD, 0.0060, zc], n: [-1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0], w: wz, h: wy, thick: PD,
    ref: `§2 接口 USB-C#${k} 底（凹槽底板，x=−0.1520 侧）` })
  quad({ id: `${tag}_top`, name: `${tag}_top`, batch: 'ports', color: C.port,
    surface: [-HX - PD / 2, 0.0060 + wy / 2, zc], n: [0, -1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0], w: wz, h: PD, thick: PD,
    ref: `§2 接口 USB-C#${k} 顶壁（法线朝槽内）` })
  quad({ id: `${tag}_za`, name: `${tag}_za`, batch: 'ports', color: C.port,
    surface: [-HX - PD / 2, 0.0060, zc - wz / 2], n: [0, 0, 1], wDir: [1, 0, 0], hDir: [0, 1, 0], w: PD, h: wy, thick: PD,
    ref: `§2 接口 USB-C#${k} 侧壁 A（法线朝槽内）` })
  quad({ id: `${tag}_zb`, name: `${tag}_zb`, batch: 'ports', color: C.port,
    surface: [-HX - PD / 2, 0.0060, zc + wz / 2], n: [0, 0, -1], wDir: [1, 0, 0], hDir: [0, 1, 0], w: PD, h: wy, thick: PD,
    ref: `§2 接口 USB-C#${k} 侧壁 B（法线朝槽内）` })
}
usbc(-0.0600, 1)
usbc(-0.0200, 2)
quad({ id: 'jack_back', name: 'jack_back', batch: 'ports', color: C.port,
  surface: [HX + PD, 0.0060, -0.0700], n: [1, 0, 0], wDir: [0, 0, 1], hDir: [0, 1, 0], w: 0.0035, h: 0.0035, thick: PD,
  ref: '§2 接口 耳机孔 底（凹槽底板，x=+0.1520 侧）' })
quad({ id: 'jack_top', name: 'jack_top', batch: 'ports', color: C.port,
  surface: [HX + PD / 2, 0.0060 + 0.00175, -0.0700], n: [0, -1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0], w: 0.0035, h: PD, thick: PD,
  ref: '§2 接口 耳机孔 内壁（法线朝槽内）' })

// —— 散热格栅（2 框 + 8 片；框面凹入 0.0003，叶片与底面齐平）——
const GR = { xc: [-0.0750, 0.0750], wz: 0.0060, wx: 0.1400, zc: -0.1030, blades: 4, bladeTh: 0.0010, bladeY: 0.0003, gap: 0.0006667, frameProud: 0.0001, bladeProud: 0.0002 }
GR.xc.forEach((xc, k) => {
  const yS = yBottom(GR.zc)
  const tag = `grille${k + 1}`
  quad({ id: `${tag}_frame`, name: `${tag}_frame`, batch: 'grille', color: C.well,
    surface: [xc, yS - GR.frameProud, GR.zc], n: [0, -1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0],
    w: GR.wz, h: GR.wx, thick: GR.bladeY, ref: `§2 散热格栅#${k + 1} 框面（暗色底衬，外凸 0.0001；z 向 0.0060 见 engineFix）` })
  const pitch = GR.bladeTh + GR.gap
  const z0 = GR.zc - (GR.blades - 1) * pitch / 2
  for (let b = 0; b < GR.blades; b++) {
    quad({ id: `${tag}_blade${b}`, name: `${tag}_blade${b}`, batch: 'grille', color: C.body,
      surface: [xc, yS - GR.bladeProud, z0 + b * pitch], n: [0, -1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0],
      w: GR.bladeTh, h: GR.wx, thick: GR.bladeY, ref: `§2 散热格栅#${k + 1} 叶片${b + 1}（外凸 0.0002；0.1400×0.0010×0.0003 见 engineFix）` })
  }
})

// —— 脚垫 4（disc，axis up）——
for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
  const x = sx * (HX - 0.0200), z = sz * (HZ - 0.0200)
  add({ type: 'disc', batch: 'feet', id: `foot_${sx > 0 ? 'p' : 'n'}${sz > 0 ? 'p' : 'n'}`,
    name: `foot_${sx > 0 ? 'p' : 'n'}${sz > 0 ? 'p' : 'n'}`, color: C.body,
    spec: { x, y: yBottom(z) - 0.0003, z, r: 0.0040, thick: 0.0006, axis: 'up' },
    ref: '§2 脚垫 4×Ø0.0080×0.0006（disc，中心 y = y_bottom(z) − 0.0003）' })
}

// —— 转轴 1 + 铰链盖 2 ——
add({ type: 'rod', batch: 'hinge', id: 'hinge_rod', name: 'hinge_rod', color: C.hinge,
  spec: { x1: -HX, y1: 0.0115, x2: HX, y2: 0.0115, z: PIVOT.z, size: 0.0040 },
  ref: '§2 开合姿态 转轴轴心 (0,0.0115,−0.1000) 轴沿 x，rod size 0.0040' })
quad({ id: 'hinge_cover_left', name: 'hinge_cover_left', batch: 'hinge', color: C.hinge,
  surface: [-0.1270, TOP_Y + TH, -0.1000], n: [0, 1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0],
  w: 0.0120, h: 0.0500, ref: '§2 转轴 铰链盖 2（左端 x −0.1520…−0.1020，贴顶面）' })
quad({ id: 'hinge_cover_right', name: 'hinge_cover_right', batch: 'hinge', color: C.hinge,
  surface: [0.1270, TOP_Y + TH, -0.1000], n: [0, 1, 0], wDir: [0, 0, 1], hDir: [1, 0, 0],
  w: 0.0120, h: 0.0500, ref: '§2 转轴 铰链盖 2（右端 x +0.1020…+0.1520，贴顶面）' })

// ---------- 门禁可判定集合（GATE_NAMES）----------
// gms.partRegister 对 quad 用「w/h/thick 轴对齐盒」注册（web/index.html:2994-2996，忽略 normal），
// gms.floating 要求每个命名件有到「贴地件（注册盒 minY ≤ 0.001）」的接触链。
// 逐件复算注册盒 minY = y_center − h/2 后，可进入接触图的是下面这批（贴地件 + 由转轴连接的 hinge_rod）；
// 其余件（键帽/上盖/屏幕/接口/竖壁…）注册盒的 minY > 0.001 且 z 向中心与任何贴地件相距 > 2mm，
// 引擎模型无法表达其连接 → 不命名（由独立 AABB 复算覆盖，见 independent-check.mjs）。
const GATE_NAMES = new Set([
  'base_bottom', 'base_left', 'base_right', 'base_back',
  'top_front', 'top_tp_left', 'top_tp_right', 'top_mid', 'top_back',
  'cham_base_pn', 'cham_base_nn',
  'well_floor', 'tp_face',
  'grille1_frame', 'grille1_blade0', 'grille1_blade1', 'grille1_blade2', 'grille1_blade3',
  'grille2_frame', 'grille2_blade0', 'grille2_blade1', 'grille2_blade2', 'grille2_blade3',
  'foot_pp', 'foot_pn', 'foot_np', 'foot_nn',
  'hinge_cover_left', 'hinge_cover_right', 'hinge_rod',
])

// ---------- 引擎侧旋转推导（与 web/index.html part('quad') 一致） ----------
const DEG = 180 / Math.PI
// 与 web/index.html part('quad') 完全一致（无 ±Y 特例；|n_xz|→0 时 φ=0）
function rotFromNormal(n) {
  const ny = Math.max(-1, Math.min(1, n[1]))
  const phi = Math.atan2(n[2], n[0]) * DEG
  const delta = -Math.asin(ny) * DEG
  return [90 + delta, 90 - phi, 0]
}
function eulerToMat(r) {
  const a = r[0] / DEG, b = r[1] / DEG, c = r[2] / DEG
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c)
  return [
    [cb * cc + sb * sa * sc, -cb * sc + sb * sa * cc, sb * ca],
    [ca * sc, ca * cc, -sa],
    [-sb * cc + cb * sa * sc, sb * sc + cb * sa * cc, cb * ca],
  ]
}
const apply = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
]
function basisToEuler(X, Y, Z) {
  const M = [[X[0], Y[0], Z[0]], [X[1], Y[1], Z[1]], [X[2], Y[2], Z[2]]]
  const alpha = Math.asin(-M[1][2]) * DEG
  const beta = Math.atan2(M[0][2], M[2][2]) * DEG
  const gamma = Math.atan2(M[1][0], M[1][1]) * DEG
  return [round(alpha, 6), round(beta, 6), round(gamma, 6)]
}
const parallel = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) > 0.9995

const resolved = []
for (const p of parts) {
  if (p.type !== 'quad') { resolved.push({ ...p }); continue }
  let surf = p.surface, n = norm(p.n), wDir = norm(p.wDir), hDir = norm(p.hDir)
  if (p.lid) { surf = rotPt(surf); n = rotVec(n); wDir = rotVec(wDir); hDir = rotVec(hDir) }
  const th = p.thick
  const center = [surf[0] - n[0] * th / 2, surf[1] - n[1] * th / 2, surf[2] - n[2] * th / 2]
  const pageRot = rotFromNormal(n)
  const M = eulerToMat(pageRot)
  const pageW = apply(M, [1, 0, 0]), pageH = apply(M, [0, 0, 1])
  const aligned = parallel(pageW, wDir) && parallel(pageH, hDir)
  const rotation = aligned ? pageRot : basisToEuler(wDir, n, hDir)
  // 引擎 RDP 抽稀阈值 = max(0.1, 0.005×bbox 对角线)（src/draw/fitting.ts）：
  // 平面短边 / 长边 < ~0.005 时短边两点被抽掉 → 服务端「平面渲染需要矩形轮廓」400。
  const ratio = Math.min(p.w, p.h) / Math.max(p.w, p.h)
  resolved.push({ ...p, center: center.map((v) => round(v, 8)), normal: n.map((v) => round(v, 8)),
    rotation: rotation.map((v) => round(v, 6)), needProps: !aligned, aspect: round(ratio, 6) })
}

// ---------- 生成 part 脚本 ----------
const BATCH_ORDER = ['base', 'lid', 'hinge', 'keyboard', 'trackpad', 'screen', 'ports', 'grille', 'feet']
const BATCH_FILE = {
  base: 'laptop-base.js', lid: 'laptop-lid.js', hinge: 'laptop-hinge.js', keyboard: 'laptop-keyboard.js',
  trackpad: 'laptop-trackpad.js', screen: 'laptop-screen.js', ports: 'laptop-ports.js',
  grille: 'laptop-grille.js', feet: 'laptop-feet.js',
}
const HEADER = (batch, n) => `// ${BATCH_FILE[batch]} —— 笔记本电脑（MacBook 式银灰极简）part：${batch}（${n} 件）
// 自包含单文件（run-gms-parts.sh 直接在页面上下文执行；不依赖任何未注入的全局）。
// 规格来源：PROMPT-laptop-model.md §2（逐字复算）；方向语义见 exports/laptop/points.json conventions。
// 引擎事实（实测）：quad 的 w 沿局部 X、h 沿局部 Z、法线沿局部 Y；rotFromNormal(n)=[90+δ,90−φ,0]。
// window.__gmsNoClear=true 时不 clear（用于「全量装配 + 门禁复核」一次跑全部 part）。
;(function () {
  var G = window.gms
  if (!window.__gmsNoClear) G.clear()
  function q(s) { return G.part('quad', s) }
`
const FOOTER = `})()
`
mkdirSync(OUT_PARTS, { recursive: true })
for (const batch of BATCH_ORDER) {
  const list = resolved.filter((p) => p.batch === batch)
  let src = HEADER(batch, list.length)
  for (const p of list) {
    if (p.type === 'quad') {
      const s = { x: p.center[0], y: p.center[1], z: p.center[2], w: round(p.w, 8), h: round(p.h, 8), thick: p.thick, normal: p.normal, color: p.color }
      if (p.name && GATE_NAMES.has(p.id)) s.name = p.name
      src += `  // ${p.ref}\n`
      src += `  q(${JSON.stringify(s)})\n`
      if (p.needProps) {
        src += `  // 该面经引擎 rotFromNormal 推导的 w/h 轴与设计轴不平行 → 显式覆写 rotation（PROMPT §2 允许）\n`
        src += `  G.props(-1, { transform: { position: [0, 0, ${s.z}], rotation: ${JSON.stringify(p.rotation)} } })\n`
      }
    } else if (p.type === 'disc' || p.type === 'rod') {
      const s = { ...p.spec, color: p.color, ...(p.name && GATE_NAMES.has(p.id) ? { name: p.name } : {}) }
      src += `  // ${p.ref}\n  G.part('${p.type}', ${JSON.stringify(s)})\n`
    }
  }
  src += FOOTER
  writeFileSync(join(OUT_PARTS, BATCH_FILE[batch]), src)
}

// ---------- spec.json / points.json ----------
// 注意：spec/points 的顺序必须与 part 脚本的落笔顺序一致（batch 顺序 + 批内创建顺序），
// 否则 items.json[i] 与 spec.parts[i] 错位（2026-09-08 实测：check 脚本把 keycap 当成 tp_face）。
const ordered = BATCH_ORDER.flatMap((b) => resolved.filter((p) => p.batch === b))
const spec = {
  name: 'laptop',
  generatedBy: 'exports/laptop/gen-parts.mjs',
  openAngleDeg: OPEN_DEG, pivot: PIVOT,
  gateNames: [...GATE_NAMES],
  counts: {
    total: resolved.length,
    quads: resolved.filter((p) => p.type === 'quad').length,
    rods: resolved.filter((p) => p.type === 'rod').length,
    discs: resolved.filter((p) => p.type === 'disc').length,
    keycaps: keyCount,
  },
  batches: BATCH_ORDER.map((b) => ({ batch: b, file: BATCH_FILE[b], count: resolved.filter((p) => p.batch === b).length })),
  parts: ordered.map((p) => p.type === 'quad'
    ? { id: p.id, name: p.name || null, type: 'quad', batch: p.batch, color: p.color, ref: p.ref,
        x: p.center[0], y: p.center[1], z: p.center[2], w: round(p.w, 8), h: round(p.h, 8), thick: p.thick,
        normal: p.normal, rotation: p.rotation, needProps: p.needProps, lid: !!p.lid, aspect: p.aspect }
    : { id: p.id, name: p.name || null, type: p.type, batch: p.batch, color: p.color, ref: p.ref, spec: p.spec, lid: false }),
}
mkdirSync(OUT_EXP, { recursive: true })
writeFileSync(join(OUT_EXP, 'spec.json'), JSON.stringify(spec, null, 2) + '\n')

const points = {
  schema: 'gms-laptop-points/v1',
  generatedBy: 'exports/laptop/gen-parts.mjs',
  sourceSpec: 'PROMPT-laptop-model.md §2',
  counts: spec.counts,
  conventions: {
    axes: 'x = 宽度（左右，±0.1520）；y = 高度（向上，y=0 为底面后缘基准面）；z = 深度（+z 朝用户/前缘，−z 朝转轴/后缘，±0.1060）',
    datum: '整机最低点 = 后脚垫底面 0.0004245（y_bottom(−0.0860) − 0.0003 − thick/2）',
    partQuad: 'gms.part("quad", {x,y,z,w,h,thick,normal}) → item {position:[x,y,z], rotation:rotFromNormal(normal), scale:[w,thick,h]}；x/y/z 为面片中心，厚度沿法线对称 → 贴面件中心 = 表面点 − (thick/2)·n',
    geometryLocalBasis: '平面几何局部基：局部 X = w 方向、局部 Y = 法线（厚度）、局部 Z = h 方向（web/draw/preview.js 10009003 = PlaneGeometry + rotateX(−90)，随后 geometry.scale(w, thick, h)）',
    rotFromNormal: 'rotFromNormal(n) = [90+δ, 90−φ, 0]，δ=−asin(ny)（度）、φ=atan2(nz,nx)（度）；|n_xz|→0（法线正上/正下）时 φ=0（页面公式的自然退化 → w 沿 −Z、h 沿 +X）',
    measuredMapping: [
      { normal: [0, 1, 0], rotation: [0, 90, 0], wAxis: [0, 0, -1], hAxis: [1, 0, 0], note: '法线 +Y（水平面朝上）：w 沿 −Z（深度）、h 沿 +X（宽度）' },
      { normal: [0, -1, 0], rotation: [180, 90, 0], wAxis: [0, 0, -1], hAxis: [-1, 0, 0], note: '法线 −Y（底面）：w 沿 −Z、h 沿 −X' },
      { normal: [0, 0, 1], rotation: [90, 0, 0], wAxis: [1, 0, 0], hAxis: [0, -1, 0], note: '法线 +Z（朝用户）：w 沿 +X、h 沿 −Y' },
      { normal: [0, 0, -1], rotation: [90, 180, 0], wAxis: [-1, 0, 0], hAxis: [0, -1, 0], note: '法线 −Z' },
      { normal: [1, 0, 0], rotation: [90, 90, 0], wAxis: [0, 0, -1], hAxis: [0, -1, 0], note: '法线 +X（右壁）：w 沿 −Z、h 沿 −Y' },
      { normal: [-1, 0, 0], rotation: [90, -90, 0], wAxis: [0, 0, 1], hAxis: [0, -1, 0], note: '法线 −X（左壁）' },
      { normal: [0.7071, 0, 0.7071], rotation: [90, 45, 0], wAxis: [0.7071, 0, -0.7071], hAxis: [0, -1, 0], note: '45° 切角：w 沿切角线、h 竖直' },
    ],
    measuredBy: 'browser-harness readPixels 截图 + 像素色块包围盒量测（exports/laptop/views/probe-*.png / shot-*.png / rotA-*.png / orient-*.png）',
    directionCheck: 'S1 实测：0.3000×0.1000 水平面 normal[0,0,1]→rot[90,0,0]，front 视角 697×348 px（≈2:1，与 w:h 一致）、top 视角 851×18 px（0.1 深度被 2.86° 俯角压缩）；normal[1,0,0]→rot[90,90,0] 在 left 视角 135×321 px 竖直长条 —— 与上表逐条一致。',
    sideNaming: 'capture-views.sh 预设按相机方位命名：left(yaw=1.5708) 相机在 +X 侧 → 看到 x=+0.1520 一侧（耳机孔）；right(yaw=−1.5708) 看到 x=−0.1520 侧（USB-C）。S2 首轮截图已核对（points.json 本字段在 S2 后确认）。',
    roll: '引擎未实现 roll（part("quad") 忽略 spec.roll）→ 6 个面（上盖左右侧缘 + 上盖 4 切角）的平面内朝向用 gms.props 显式覆写 rotation（YXZ 欧拉，由基向量 (w, n, h) 反解）。',
    liftConstraint: 'disc/el-disc 的 lift = y − thick/2 必须 ≥ 0；脚垫 y=0.000724/0.004375、thick=0.0006 → lift=0.000424/0.004075 ✓',
    portModel: '平面件无法在侧壁上开洞 → 接口建模为「微外凸浅槽」：底板贴壁外 0.0004，顶壁/侧壁为唇壁（法线朝槽内，可见面即槽内壁），读作凹槽。',
    grilleModel: '格栅框面凹入底面 0.0003（贴体内），4 片叶片与底面齐平（厚 0.0003），故整机最低点仍是后脚垫 0.0004245。',
  },
  keyPoints: ordered.map((p) => p.type === 'quad'
    ? { id: p.id, type: 'quad', x: p.center[0], y: p.center[1], z: p.center[2], w: round(p.w, 8), h: round(p.h, 8),
        thick: p.thick, normal: p.normal, rotation: p.rotation, propsOverride: p.needProps, batch: p.batch, ref: p.ref }
    : { id: p.id, type: p.type, ...(p.spec || {}), batch: p.batch, ref: p.ref }),
  layoutBudget: {
    zFrontToBack: { frontMargin: 0.0120, trackpad: 0.0740, gap: 0.0050, keyboardWell: 0.1090, hingeZone: 0.0120, sum: 0.2120 },
    keyboard: { rows: 6, rowPitch: 0.0180, rowsSpan: 0.1080, wellDepth: 0.1090, cols: 14, colPitch: 0.0190, colsSpan: 0.2660, wellWidth: 0.2760, keys: keyCount, slots: 84 },
    screen: { visible: '0.2920×0.1825', bezelLR: 0.0060, bezelTop: 0.0060, bezelBottom: 0.0120, widthSum: 0.3040, depthSum: 0.2005 },
    height: { closedTop: 0.0115, lidTh: 0.0040, closedTotal: 0.0155, bottomBack: 0.0006, bottomFront: 0.0051 },
    topSurface: { strips: 7, stripsSumZ: 0.2120, stripsSumX: 0.3040, trackpadFlanks: '0.0870×2 + 0.1300 = 0.3040' },
    chamfer: { R: 0.0100, quadLength: round(R_CHAM * Math.SQRT2, 6), maxDeviationFromArc: 0.002929 },
  },
}
writeFileSync(join(OUT_EXP, 'points.json'), JSON.stringify(points, null, 2) + '\n')

const thin = resolved.filter((p) => p.type === 'quad' && p.aspect <= 0.0055)
if (thin.length) {
  console.error('ENGINE-FIX NEEDED（RDP 会抽掉短边，aspect ≤ 0.0055）:', thin.map((p) => `${p.id}:${p.aspect}`).join(', '))
  process.exit(1)
}
console.log('min aspect:', Math.min(...resolved.filter((p) => p.type === 'quad').map((p) => p.aspect)))
console.log('parts:', resolved.length, '| quads:', spec.counts.quads, '| rods:', spec.counts.rods, '| discs:', spec.counts.discs, '| keycaps:', keyCount)
console.log('needProps:', resolved.filter((p) => p.needProps).map((p) => p.id).join(', ') || '(none)')
for (const b of spec.batches) console.log(' ', b.batch.padEnd(10), b.count, b.file)
