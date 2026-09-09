#!/usr/bin/env node
/**
 * make-captions.mjs — 从页面里的时间轴（单一真源）生成字幕 SRT
 *
 * 为什么不让模型手抄：片尾时长一改，手写的 SRT 立刻与成片不同步（本版片尾从 114s 收到 88s）。
 * 页面里的 S = 真正驱动渲染的时间轴，导出成 JSON 再格式化，字幕与画面不可能错位。
 *
 * 用法：node scripts/max/make-captions.mjs --out delivery/demo-video/captions.srt
 */
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d }
const OUT = arg('out', 'delivery/demo-video/captions.srt')
const W = Number(arg('w', 1280)), H = Number(arg('h', 720))
const PORT = Number(arg('port', 9222))
const URL_ = arg('url', 'http://localhost:8787/draw/photo.html?v=cap' + Date.now())
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL_)}`, { method: 'PUT' })).json()
const ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let seq = 0
const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
const evalJS = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error('JS: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300))
  return r.result?.result?.value
}
await send('Page.enable'); await send('Runtime.enable'); await send('Page.bringToFront')
let ready = false
for (let i = 0; i < 120; i++) {
  const o = JSON.parse(await evalJS('JSON.stringify({r: !!(window.__photo&&window.__photo.ready), m: !!(window.__screenMat&&window.__screenMat.map)})') || '{}')
  if (o.r && o.m) { ready = true; break }
  await sleep(500)
}
if (!ready) throw new Error('page never became ready')
await evalJS(`window.__demoSize = [${W}, ${H}]`)
await evalJS(`window.__offline = { fps: 30, q: 0.92 }`)
await evalJS(fs.readFileSync('scripts/max/demo-inject.js', 'utf8'))
await sleep(400)
const tl = JSON.parse(await evalJS('JSON.stringify(window.__offTimeline)'))
console.log(`timeline: total=${tl.total.toFixed(1)}s segs=${tl.segs.length}`)

const ts = (t) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), ms = Math.round((t - Math.floor(t)) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}
const blocks = []
for (const g of tl.segs) {
  if (g.fade || g.fade === undefined && g.epi && g.epi.fade) continue
  let a, b, text
  if (g.epi) {
    if (g.epi.fade) continue
    a = g.start
    b = g.start + g.d
    if (g.epi.thanks) text = g.epi.lines.join('\n')
    else if (g.epi.title) text = [g.epi.title].concat(g.epi.lines).join('\n')
    else text = [g.epi.h].filter(Boolean).concat(g.epi.lines).join('\n')
  } else if (g.cap) {
    a = g.start + 0.4
    b = g.start + g.d - 0.6
    text = [g.cap, g.sub].filter(Boolean).join('\n')
  } else continue
  blocks.push(`${blocks.length + 1}\n${ts(a)} --> ${ts(b)}\n${text}\n`)
}
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, blocks.join('\n'))
console.log(`wrote ${OUT} (${blocks.length} 条, 覆盖到 ${tl.total.toFixed(1)}s)`)
ws.close()
try { await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`) } catch (e) {}
