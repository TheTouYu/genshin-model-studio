#!/usr/bin/env node
/**
 * demo-offline.mjs — 离线逐帧渲染演示视频（用户 2026-09-09 提示：放弃实时 captureStream）
 *
 * 为什么：实时 MediaRecorder 的帧率天花板 = 输出像素数（实测 ~15ms/MP：1280×720→30fps 封顶、
 * 1920×1080→29fps、2560×1440→16–20fps，与编码器/画质档无关）。视频不必实时。
 *
 * 管线：页面内「渲染一帧 → toDataURL(jpeg) → 时间步进 1/fps」→ 本进程把 JPEG 帧写进
 *       ffmpeg 的 image2pipe 输入 → x264（CRF）+ 离线渲染的 WAV（OfflineAudioContext）→ MP4。
 *       帧率与机器性能彻底解耦：恒定 30fps、分辨率可到 1440p/4K、无丢帧。
 *
 * 用法：
 *   node scripts/max/demo-offline.mjs --out delivery/demo-video/macbook-demo-1440p.mp4 \
 *        --w 2560 --h 1440 --fps 30 --q 0.92 --rtscale 2 --crf 18 --limit 0
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d }
const OUT = arg('out', 'delivery/demo-video/macbook-demo-1440p.mp4')
const WAV = arg('wav', OUT.replace(/\.mp4$/, '') + '.wav')
const W = Number(arg('w', 2560)), H = Number(arg('h', 1440))
const FPS = Number(arg('fps', 30))
const Q = Number(arg('q', 0.92))
const RTSCALE = Number(arg('rtscale', 2))
const CRF = Number(arg('crf', 18))
const PRESET = arg('preset', 'medium')
const LIMIT = Number(arg('limit', 0))            // >0：只渲染前 N 帧（冒烟测试）
const ABR = arg('abr', '192k')
const PORT = Number(arg('port', 9222))
const URL_ = arg('url', 'http://localhost:8787/draw/photo.html?v=off' + Date.now())
const INJECT = arg('inject', 'scripts/max/demo-inject.js')
const SHOTS = arg('shots', '')
const BATCH = Number(arg('batch', 4))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

execFileSync(process.execPath, ['--check', INJECT], { stdio: 'pipe' })
fs.mkdirSync(path.dirname(OUT), { recursive: true })

// ---------------------------------------------------------------- CDP
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
async function evalB64(expr) {           // 大字符串（帧数据）分块取回，避免单次 CDP 返回过大
  const len = await evalJS(`(${expr}).length`)
  if (typeof len !== 'number') throw new Error('b64 length not a number: ' + JSON.stringify(len).slice(0, 120))
  const CH = 2 * 1024 * 1024, parts = []
  for (let a = 0; a < len; a += CH) {
    const s = await evalJS(`(${expr}).slice(${a},${a + CH})`)
    if (typeof s !== 'string') throw new Error('chunk fetch failed at ' + a)
    parts.push(s)
  }
  return parts.join('')
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: Math.min(W, 1920), height: Math.round(Math.min(W, 1920) * H / W), deviceScaleFactor: 1, mobile: false })
await send('Page.bringToFront')
try { await send('Page.setWebLifecycleState', { state: 'active' }) } catch (e) {}

let ready = false
for (let i = 0; i < 120; i++) {
  const o = JSON.parse(await evalJS('JSON.stringify({r: !!(window.__photo&&window.__photo.ready), m: !!(window.__screenMat&&window.__screenMat.map)})') || '{}')
  if (o.r && o.m) { ready = true; break }
  await sleep(500)
}
if (!ready) throw new Error('page never became ready')
console.log('page ready')

// 画质：rtScale 决定内部超采样倍率（GPU 实测 1440p rtScale2 只要 ~5ms/帧，瓶颈在 CPU 侧 JPEG）
await evalJS(`window.__demoSize = [${W}, ${H}]`)
await evalJS(`window.__photo.quality('low')`)
await evalJS(`window.__photo.rtScale(${RTSCALE})`)
await evalJS(`window.__offline = { fps: ${FPS}, q: ${Q} }`)
await evalJS(fs.readFileSync(INJECT, 'utf8'))
await sleep(400)

const meta = JSON.parse(await evalJS('JSON.stringify({phase: window.__off && window.__off.phase, total: window.__off && window.__off.total, frames: window.__off && window.__off.frames, err: window.__off && window.__off.err})') || '{}')
if (!meta.frames) throw new Error('offline driver did not start: ' + JSON.stringify(meta))
const TOTAL = meta.total, FRAMES = LIMIT > 0 ? Math.min(LIMIT, meta.frames) : meta.frames
console.log(`offline: total=${TOTAL.toFixed(1)}s frames=${meta.frames} @${FPS}fps  out=${W}x${H} rtScale=${RTSCALE} jpeg q=${Q}`)

// ---------------------------------------------------------------- 离线音轨（先渲染：ffmpeg 启动时输入文件必须已存在）
let audioInfo = null
if (LIMIT === 0) {
  console.log('rendering audio offline (OfflineAudioContext)...')
  const a = await evalJS('window.__offAudio()')
  if (!a || a.err) throw new Error('offline audio failed: ' + JSON.stringify(a).slice(0, 300))
  const wav = await evalB64('window.__off.wavCache')
  if (!wav) throw new Error('wav fetch failed')
  fs.writeFileSync(WAV, Buffer.from(wav, 'base64'))
  audioInfo = a
  console.log(`wav: ${WAV} ${(fs.statSync(WAV).size / 1e6).toFixed(1)} MB, dur=${a.dur.toFixed(2)}s sr=${a.sr}`)
}

if (arg('audio-only', '')) {
  console.log(`audio-only done: ${WAV}`)
  ws.close()
  try { await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`) } catch (e) {}
  process.exit(0)
}

// ---------------------------------------------------------------- ffmpeg
const hasWav = fs.existsSync(WAV)
const ffArgs = [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(FPS), '-i', 'pipe:0',
]
if (hasWav) ffArgs.push('-i', WAV)
// ⚠️ 输出选项必须在所有输入之后：-r/-fps_mode 放在 -i 之前会被当成 WAV 的输入选项（实测 ffmpeg 直接拒收）
ffArgs.push('-c:v', 'libx264', '-preset', PRESET, '-crf', String(CRF), '-pix_fmt', 'yuv420p',
             '-r', String(FPS), '-fps_mode', 'cfr')
if (hasWav) ffArgs.push('-c:a', 'aac', '-b:a', ABR, '-shortest')
ffArgs.push('-movflags', '+faststart', OUT)
const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] })
let ffErr = null, ffExit = null
ff.on('error', (e) => { ffErr = e })
ff.stdin.on('error', (e) => { ffErr = ffErr || e })
const ffDone = new Promise((res) => ff.on('close', (code) => { ffExit = code; res(code) }))
function ffWrite(buf) {
  if (ffExit !== null) throw new Error('ffmpeg exited early (code ' + ffExit + '): ' + (ffErr ? ffErr.message : ''))
  return ff.stdin.write(buf)
}

// ---------------------------------------------------------------- 逐帧渲染
const t0 = Date.now()
let done = 0, bytes = 0
while (done < FRAMES) {
  const n = Math.min(BATCH, FRAMES - done)
  const list = await evalJS(`window.__offNext(${n})`)
  if (!Array.isArray(list) || list.length === 0) throw new Error('frame fetch failed at ' + done + ': ' + JSON.stringify(list).slice(0, 200))
  for (const b64 of list) {
    const buf = Buffer.from(b64, 'base64')
    if (!ffWrite(buf)) await new Promise((r) => ff.stdin.once('drain', r))
    bytes += buf.length
  }
  done += list.length
  if (done % (BATCH * 5) === 0 || done === FRAMES) {
    const el = (Date.now() - t0) / 1000
    const rate = done / el
    const eta = (FRAMES - done) / Math.max(0.01, rate)
    process.stdout.write(`\r  ${done}/${FRAMES} frames  ${rate.toFixed(1)} fps  已 ${(bytes / 1e6).toFixed(0)}MB  ETA ${Math.round(eta / 60)}m${String(Math.round(eta % 60)).padStart(2, '0')}s   `)
  }
}
process.stdout.write('\n')
console.log(`frames done: ${done} in ${((Date.now() - t0) / 1000).toFixed(1)}s (${(done / ((Date.now() - t0) / 1000)).toFixed(2)} fps), ${(bytes / 1e6).toFixed(1)} MB jpeg`)

// ---------------------------------------------------------------- 关键帧存证（PNG）
if (SHOTS) {
  fs.mkdirSync(SHOTS, { recursive: true })
  const times = (arg('shot-times', '3,12.4,19,26.8,34.6,43.6,50,58,64,72,80,88,96,104,112,120,128,136,144').split(',').map(Number))
  for (const t of times) {
    const n = await evalJS(`window.__offShot(${t})`)
    if (typeof n !== 'number') continue
    const d = await evalB64('window.__off.shotCache')
    if (typeof d === 'string' && d.startsWith('data:image/png')) {
      const p = path.join(SHOTS, `t${String(t).replace('.', '_')}.png`)
      fs.writeFileSync(p, Buffer.from(d.split(',')[1], 'base64'))
    }
  }
  console.log(`keyframes -> ${SHOTS}`)
}

ff.stdin.end()
const code = await ffDone
if (audioInfo) console.log(`audio: dur=${audioInfo.dur.toFixed(2)}s sr=${audioInfo.sr}`)
if (ffErr) throw ffErr
if (code !== 0) throw new Error('ffmpeg exit ' + code)
console.log(`wrote ${OUT} ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`)
ws.close()
try { await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`) } catch (e) {}
