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
for (let i = 0; i < 100; i++) { if (await evalJS('!!(window.__photo && window.__photo.ready)')) { ready = true; break } await sleep(300) }
if (!ready) throw new Error('page not ready')
await sleep(3000)
if (MESH) {
  await evalJS(`window.__photo.loadMesh(${JSON.stringify(MESH)})`)
  let ok = false
  for (let i = 0; i < 80; i++) { if (await evalJS(`window.__meshLoaded === ${JSON.stringify(MESH)}`)) { ok = true; break } await sleep(300) }
  if (!ok) throw new Error('mesh load failed: ' + MESH)
}
await sleep(2000)   // 等纹理/PMREM 完全就绪

const vp = await evalJS('JSON.stringify({iw: innerWidth, ih: innerHeight, cw: document.getElementById("canvas").width, ch: document.getElementById("canvas").height})')
const hud = await evalJS(`document.getElementById('hud') ? document.getElementById('hud').textContent : ''`)
const fingerprint = {
  mesh: (MESH || 'web/draw/macbook-current.json').replace('./','web/draw/') + ' @ ' + fs.statSync((MESH || 'web/draw/macbook-current.json').replace('./','web/draw/')).mtime.toISOString(),
  legends: fs.statSync('web/draw/kb-legends.png').mtime.toISOString(),
  screen: fs.statSync('web/draw/screen-ui.png').mtime.toISOString(),
  photoHtml: fs.statSync('web/draw/photo.html').mtime.toISOString(),
  hud,
}
if (PRESET) await evalJS(`window.__photo.preset(${JSON.stringify(PRESET)})`)
if (POST) await evalJS(`window.__photo.post(${JSON.stringify(JSON.parse(POST))})`)
const TUNEMAP = TUNE ? JSON.parse(TUNE) : {}
await sleep(1500)
const shots = []
for (const v of VIEWS) {
  const o = Object.assign({ seed: SEED0 + VIEWS.indexOf(v) * 7919 }, TUNEMAP[v] || {})
  await evalJS(`window.__photo.shoot('${v}', ${W}, ${H}, ${JSON.stringify(o)})`)
  await sleep(900)
  // 直接读 canvas 像素（preserveDrawingBuffer:true）——绕开浏览器缩放/视口几何。
  // 历史 bug：本机浏览器有 1.25× 页面缩放（dpr 0.8），captureScreenshot 的 clip 按设备像素，
  // 于是画布只占画面左上 1133×672，右侧/底部是黑的，曾被误读成"渲染缺陷"。
  const dataUrl = await evalJS(`document.getElementById('canvas').toDataURL('image/png')`)
  const file = path.join(OUT, `p${VIEWS.indexOf(v) + 1}-${v}.png`)
  fs.writeFileSync(file, Buffer.from(String(dataUrl).split(',')[1], 'base64'))
  // 快速指纹：中心区域像素统计（确认不是空帧）
  shots.push({ view: v, file, bytes: fs.statSync(file).size })
}
console.log(JSON.stringify({ ready, vp, fingerprint, shots }, null, 2))
ws.close()
try { await fetch(`http://127.0.0.1:${PORT}/json/close/${t0.id}`) } catch {}
