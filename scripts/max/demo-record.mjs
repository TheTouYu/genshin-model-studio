#!/usr/bin/env node
/**
 * demo-record.mjs — 录一段真实页面的演示视频（零依赖：CDP + 浏览器 MediaRecorder → WebM/VP9）
 *
 * 为什么不是 ffmpeg：本机没有 ffmpeg/ffprobe；浏览器自带 VP9 编码器，且录的就是页面自己的画布。
 * 为什么不是 AI 生成视频：验收口径是「真实浏览器页面渲染」，AI 视频演示的是别人的模型。
 *
 * 用法：node scripts/max/demo-record.mjs --out delivery/demo-video/macbook-demo.webm --w 1280 --h 720
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d }
const OUT = arg('out', 'delivery/demo-video/macbook-demo.webm')
const KEYS = arg('keys', 'delivery/demo-video/keyframes')
const W = Number(arg('w', 1280)), H = Number(arg('h', 720))
const PORT = Number(arg('port', 9222))
const URL_ = arg('url', 'http://localhost:8787/draw/photo.html?v=demo' + Date.now())
const INJECT = arg('inject', 'scripts/max/demo-inject.js')
const SECS = Number(arg('secs', '0'))          // >0：录这么久就停（性能试验用）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 注入脚本语法自检（曾因 photo.html 一行注释吃掉 if 的 `{` 白跑一整批渲染）
execFileSync(process.execPath, ['--check', INJECT], { stdio: 'pipe' })
console.log('inject JS syntax OK')

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.mkdirSync(KEYS, { recursive: true })

const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL_)}`, { method: 'PUT' })).json()
const ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let seq = 0
const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error('JS: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}

await send('Page.enable'); await send('Runtime.enable')
// 视口必须先于页面 boot 生效（否则 canvas 尺寸/布局不一致 → 黑边被当成渲染缺陷）
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
await send('Emulation.setVisibleSize', { width: W, height: H })
// 后台标签会被 rAF 节流 → 录制会冻结；置前 + 激活生命周期
await send('Page.bringToFront')
try { await send('Page.setWebLifecycleState', { state: 'active' }) } catch (e) {}
// 复核视口真的生效（曾出现 override 未命中：innerWidth 仍是 1600 → 画布比例全错）
for (let i = 0; i < 20; i++) {
  const o = JSON.parse(await evalJS('JSON.stringify({w:innerWidth,h:innerHeight})') || '{}')
  if (o.w === W && o.h === H) break
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  await send('Emulation.setVisibleSize', { width: W, height: H })
  await sleep(300)
}

// 等页面就绪（three.js + 网格 + 屏幕贴图）
let ready = false
for (let i = 0; i < 120; i++) {
  const st = await evalJS('JSON.stringify({r: !!(window.__photo&&window.__photo.ready), m: !!(window.__screenMat&&window.__screenMat.map), e: !!(window.__rec&&window.__rec.err), err: (window.__rec&&window.__rec.err)||null})')
  const o = JSON.parse(st || '{}')
  if (o.e) throw new Error('page reports error: ' + o.err)
  if (o.r && o.m) { ready = true; break }
  await sleep(500)
}
if (!ready) throw new Error('page never became ready')
const vp = await evalJS('JSON.stringify({w:innerWidth,h:innerHeight,cw:document.getElementById("canvas").width,ch:document.getElementById("canvas").height})')
console.log('viewport ' + vp)

// 用户手势：AudioContext 在无手势的标签里会 suspended → 音效录不进去。
// 一次 CDP 合成点击即产生 user activation（不需要真的点中什么）。
for (const type of ['mousePressed', 'mouseReleased']) {
  await send('Input.dispatchMouseEvent', { type, x: Math.round(W / 2), y: Math.round(H / 2), button: 'left', clickCount: 1 })
}
await sleep(200)

// 注入录制器
const src = fs.readFileSync(INJECT, 'utf8')
if (arg('codec', '')) await evalJS(`window.__codecPref = ${JSON.stringify(arg('codec', 'vp9'))}`)
await evalJS(src)
await sleep(300)
const phase0 = await evalJS('window.__rec && window.__rec.phase')
console.log('recorder phase: ' + phase0 + ' (expect recording)')
if (phase0 !== 'recording') throw new Error('recorder did not start: ' + await evalJS('JSON.stringify(window.__rec&&window.__rec.err)'))

// 可选：提前停止（性能试验）
if (SECS > 0) setTimeout(() => { evalJS('window.__recStop = true').catch(() => {}) }, SECS * 1000)

// 等待录制完成（总时长 ~68s，留足余量）
const total = await evalJS('window.__rec.dur')
let done = false
for (let i = 0; i < 600; i++) {
  await sleep(1000)
  const st = JSON.parse(await evalJS('JSON.stringify({p:window.__rec.phase,t:window.__rec.t,fps:window.__rec.fps,d:window.__rec.done,b:window.__rec.b64.length})') || '{}')
  if (i % 5 === 0) console.log(`  t=${(st.t || 0).toFixed(1)}/${total}s phase=${st.p} fps=${st.fps} b64=${((st.b || 0) / 1e6).toFixed(1)}MB`)
  if (st.d) { done = true; break }
}
if (!done) throw new Error('recording did not finish')

const report = JSON.parse(await evalJS('JSON.stringify({dur:window.__rec.dur,bytes:window.__rec.bytes,fps:window.__rec.fps,log:window.__rec.log,err:window.__rec.err,len:window.__rec.b64.length})'))
console.log('recorded: ' + (report.bytes / 1e6).toFixed(1) + ' MB, base64 ' + (report.len / 1e6).toFixed(1) + ' MB, fps~' + report.fps + ', err=' + report.err)

// 分块取回 base64（单次 CDP 返回几十 MB 不稳）
const CH = 3 * 1024 * 1024
const parts = []
for (let a = 0; a < report.len; a += CH) {
  const s = await evalJS(`window.__rec.b64.slice(${a},${a + CH})`)
  if (typeof s !== 'string') throw new Error('chunk fetch failed at ' + a)
  parts.push(s)
  process.stdout.write(`\r  fetch ${Math.min(100, Math.round((a + CH) / report.len * 100))}%   `)
}
process.stdout.write('\n')
const b64 = parts.join('')
fs.writeFileSync(OUT, Buffer.from(b64, 'base64'))
const st = fs.statSync(OUT)
console.log('wrote ' + OUT + ' (' + st.size + ' B)')

// 关键帧存证（合成画面：字幕/水印/章节卡）
const keys = JSON.parse(await evalJS('JSON.stringify(window.__rec.keys.map(function(k){return {t:k.t,png:k.png.length}}))'))
for (let i = 0; i < keys.length; i++) {
  const png = await evalJS(`window.__rec.keys[${i}].png`)
  const p = path.join(KEYS, 't' + String(keys[i].t).padStart(4, '0') + '.png')
  fs.writeFileSync(p, Buffer.from(String(png).split(',')[1], 'base64'))
}
console.log('wrote ' + keys.length + ' keyframes -> ' + KEYS)

fs.writeFileSync(OUT + '.json', JSON.stringify({ out: OUT, size: st.size, dur: report.dur, fps: report.fps, log: report.log, keyframes: keys.map((k) => k.t) }, null, 2))

// 关掉这个临时标签页
await send('Page.close').catch(() => {})
ws.close()
process.exit(0)
