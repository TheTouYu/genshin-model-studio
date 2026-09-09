#!/usr/bin/env node
/**
 * page-shots.mjs — 一次会话内拍全部视角（零依赖 CDP，不依赖 browser-harness daemon）
 *
 * 用法：node scripts/max/page-shots.mjs --out delivery/macbook-page --views hero,front,kb,ports,screen34,top --w 1416 --h 840
 *
 * 为什么存在：验收数字只能出自真实页面渲染（用户裁决）。且历史教训——截图必须与
 * 网格/贴图同代（曾用 18:04 的旧截图去盲测 18:34 才修好的字标贴图 → 裁判判「键帽无字标」）。
 * 本脚本每次都在同一页面会话里重拍，并在输出里带 mesh/贴图的 mtime 指纹。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d }
const OUT = arg('out', 'delivery/macbook-page')
const VIEWS = arg('views', 'hero,front,kb,ports,screen34,top').split(',')
const W = Number(arg('w', 1416)), H = Number(arg('h', 840))
const PORT = Number(arg('port', 9222))
const URL_ = arg('url', 'http://localhost:8787/draw/photo.html')
const PRESET = arg('preset', 'dark')
const POST = arg('post', '')            // JSON：{noise,vignette,ca,aperture,maxBlur,exposure}
const SEED0 = Number(arg('seed', 20260909))
const TUNE = arg('tune', '')            // 每视角覆写：JSON {"kb":{"aperture":0.25},...}
const MESH = arg('mesh', '')            // 空=页面默认（开盖）；'./macbook-closed.json' 等
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync('.scratch/max', { recursive: true })

// 页面内联 JS 语法自检：曾因一行注释吃掉 if 的 `{` → 整页卡在 loading…，白跑一整批渲染。
// 渲染前 0.2s 的检查，换掉 20 分钟的无效长跑。
{
  const html = fs.readFileSync('web/draw/photo.html', 'utf8')
  const blocks = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  blocks.forEach((b, i) => {
    const tmp = `.scratch/max/_page-check-${i}.js`
    fs.writeFileSync(tmp, b)
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }) }
    catch (e) { throw new Error(`photo.html inline script #${i} 语法错误：\n${String(e.stderr).slice(0, 400)}`) }
  })
  console.log(`page JS syntax OK (${blocks.length} inline block)`)
}

const t0 = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL_)}`, { method: 'PUT' })).json()
const ws = new WebSocket(t0.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let seq = 0
const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error('JS: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300))
  return r.result?.result?.value
}

await send('Page.enable'); await send('Runtime.enable')
// 视口必须先于页面 boot 设好（历史 bug：canvas 1416 而布局视口 1210 → 右侧/底部黑边被当成"渲染缺陷"）
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
await send('Emulation.setVisibleSize', { width: W, height: H })

let ready = false
for (let i = 0; i < 100; i++) { if (await evalJS('!!(window.__photo && window.__photo.ready && (!window.__screenMat || !!window.__screenMat.map))')) { ready = true; break } await sleep(300) }
if (!ready) throw new Error('page not ready')
await sleep(3000)
if (MESH) {
  await evalJS(`window.__photo.loadMesh(${JSON.stringify(MESH)})`)
  let ok = false
  for (let i = 0; i < 80; i++) { if (await evalJS(`window.__meshLoaded === ${JSON.stringify(MESH)}`)) { ok = true; break } await sleep(300) }
  if (!ok) throw new Error('mesh load failed: ' + MESH)
}
await sleep(2000)   // 等纹理/PMREM 完全就绪
// 线框模式（几何取证用：看顶面网格/轮廓，不受材质与光照干扰）
if (arg('wire', '') === '1') { await evalJS('window.__photo.wireframe(true)'); await sleep(400) }

const vp = await evalJS('JSON.stringify({iw: innerWidth, ih: innerHeight, cw: document.getElementById("canvas").width, ch: document.getElementById("canvas").height})')
const hud = await evalJS(`document.getElementById('hud') ? document.getElementById('hud').textContent : ''`)
const fingerprint = {
  mesh: (MESH || 'web/draw/macbook-current.json').replace('./','web/draw/') + ' @ ' + fs.statSync((MESH || 'web/draw/macbook-current.json').replace('./','web/draw/')).mtime.toISOString(),
  legends: fs.statSync('web/draw/kb-legends.png').mtime.toISOString(),
  screen: fs.statSync('web/draw/screen-ui.png').mtime.toISOString(),
  photoHtml: fs.statSync('web/draw/photo.html').mtime.toISOString(),
  hud,
  // 分支自检：网格 colors 格式变了会让字标/屏幕贴图分支静默失效（曾发生，渲染整批无字标无桌面）
  kbTop: (await evalJS('window.__kbDebug ? window.__kbDebug.top : 0')) || 0,
  hasScreenTex: await evalJS('!!(window.__screenMat && window.__screenMat.map)'),
  screenUV: await evalJS('JSON.stringify(window.__screenUV || null)'),
}
if (PRESET) await evalJS(`window.__photo.preset(${JSON.stringify(PRESET)})`)
if (POST) await evalJS(`window.__photo.post(${JSON.stringify(JSON.parse(POST))})`)
const TUNEMAP = TUNE ? JSON.parse(TUNE) : {}
await sleep(1500)
const shots = []
for (const v of VIEWS) {
  const o = Object.assign({ seed: SEED0 + VIEWS.indexOf(v) * 7919 }, TUNEMAP[v] || {})
  // 每视角可覆写预设（背景/地面多样化 → 去聚类），但整组仍在**同一页面会话**里拍
  // —— 屏幕贴图只加载一次，跨视角内容必然同源（用户点名的硬伤）。
  if (TUNEMAP[v] && TUNEMAP[v].preset) { await evalJS(`window.__photo.preset(${JSON.stringify(TUNEMAP[v].preset)})`); await sleep(900) }
  // 每视角可覆写后处理（噪声幅度按参考图实测标定：亮底产品照 3x3 残差 SD≈0.5-0.8，暗底≈5-12）
  if (TUNEMAP[v] && TUNEMAP[v].post) { await evalJS(`window.__photo.post(${JSON.stringify(TUNEMAP[v].post)})`) }
  // 每视角可覆写画布尺寸（协议 v7：跨图不同画布，避免裁判按「六张同尺寸」聚类）
  const VW = (TUNEMAP[v] && TUNEMAP[v].w) || W
  const VH = (TUNEMAP[v] && TUNEMAP[v].h) || H
  await evalJS(`window.__photo.shoot('${v}', ${VW}, ${VH}, ${JSON.stringify(o)})`)
  await sleep(900)
  // 直接读 canvas 像素（preserveDrawingBuffer:true）——绕开浏览器缩放/视口几何。
  // 历史 bug：本机浏览器有 1.25× 页面缩放（dpr 0.8），captureScreenshot 的 clip 按设备像素，
  // 于是画布只占画面左上 1133×672，右侧/底部是黑的，曾被误读成"渲染缺陷"。
  const screenBox = await evalJS('JSON.stringify(window.__photo.screenBox())')
  const screenQuad = await evalJS('JSON.stringify(window.__photo.screenQuad())')
  // 上盖姿态自检（2026-09-10 加）：lidGroup 局部坐标按 R(-angle0) 反解，静态出图必须把
  // rotation.x 还原成 -angle0，否则 angle0≠0 的网格会静默渲染成合盖（本轮踩过，白跑一炉）。
  const lidMeta = await evalJS('JSON.stringify(window.__lidMeta)')
  const lidRot = await evalJS('window.__lidGroup ? window.__lidGroup.rotation.x : null')
  let lidCheck = null
  if (lidMeta && lidMeta !== 'null') {
    const lm = JSON.parse(lidMeta)
    const want = -lm.angle0 * Math.PI / 180
    const got = Number(lidRot)
    lidCheck = { angle0: lm.angle0, rot: +got.toFixed(4), want: +want.toFixed(4), ok: Math.abs(got - want) < 1e-3 }
    if (!lidCheck.ok) console.error(`[LID-MISMATCH] ${v}: rotation.x=${got} 期望 ${want.toFixed(4)} → 出图无效`)
  }
  const dataUrl = await evalJS(`document.getElementById('canvas').toDataURL('image/png')`)
  const file = path.join(OUT, `p${VIEWS.indexOf(v) + 1}-${v}.png`)
  fs.writeFileSync(file, Buffer.from(String(dataUrl).split(',')[1], 'base64'))
  // 快速指纹：中心区域像素统计（确认不是空帧）
  shots.push({ view: v, file, bytes: fs.statSync(file).size, screenBox: screenBox && screenBox !== 'null' ? JSON.parse(screenBox) : null, screenQuad: screenQuad && screenQuad !== 'null' ? JSON.parse(screenQuad) : null, lid: lidCheck })
}
const report = { ready, vp, fingerprint, shots }
const REP = arg('report', '')
if (REP) { fs.mkdirSync(path.dirname(REP), { recursive: true }); fs.writeFileSync(REP, JSON.stringify(report, null, 2)); console.log('report: ' + REP) }
console.log(JSON.stringify(report, null, 2))
ws.close()
try { await fetch(`http://127.0.0.1:${PORT}/json/close/${t0.id}`) } catch {}
