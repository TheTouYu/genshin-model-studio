#!/usr/bin/env node
/**
 * page-probe.mjs — 零依赖 CDP 探针（自建 WebSocket 客户端，不依赖 browser-harness daemon）
 *
 * 用法：
 *   node scripts/max/page-probe.mjs --url <url> --wait-ms 9000 --expr "<js>" [--shot out.png] [--w 1416 --h 840]
 *   node scripts/max/page-probe.mjs --url <url> --script file.mjs   # 文件导出 default(api) 函数
 *
 * 目的：验收数字只能出自真实页面渲染（用户裁决）→ 每次改动都用本探针回读 DOM/材质/截图。
 * 端口：CDP Edge 152 @ 127.0.0.1:9222（本机唯一实例）。
 */
import fs from 'node:fs'

const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf('--' + name)
  return i >= 0 ? args[i + 1] : def
}
const URL_ = arg('url', 'http://localhost:8787/draw/photo.html')
const WAIT = Number(arg('wait-ms', 9000))
const SHOT = arg('shot', '')
const SHOT_W = Number(arg('w', 1416))
const SHOT_H = Number(arg('h', 840))
const EXPR = arg('expr', '')
const SCRIPT = arg('script', '')
const PORT = Number(arg('port', 9222))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function openTab(url) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!res.ok) throw new Error('cannot open tab: ' + res.status)
  return res.json()
}
async function closeTab(id) {
  try { await fetch(`http://127.0.0.1:${PORT}/json/close/${id}`) } catch {}
}

const target = await openTab(URL_)
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let seq = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
function send(method, params = {}) {
  return new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
}
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) return { __error: JSON.stringify(r.result.exceptionDetails).slice(0, 400) }
  return r.result?.result?.value
}
async function shoot(path, w, h) {
  // 直接读 canvas 像素（绕开浏览器 1.25× 缩放下 captureScreenshot 的设备像素几何）
  await sleep(900)
  const dataUrl = await evalJS(`document.getElementById('canvas').toDataURL('image/png')`)
  if (!dataUrl) throw new Error('toDataURL failed')
  fs.writeFileSync(path, Buffer.from(String(dataUrl).split(',')[1], 'base64'))
  return path
}

await send('Page.enable')
await send('Page.bringToFront')   // 后台标签的 rAF 会被节流到 0——性能测量前必须前置
await send('Runtime.enable')
// 视口必须先于页面 boot 就设好：否则 canvas 会超出布局视口 → 截图右侧/底部是黑边
await send('Emulation.setDeviceMetricsOverride', { width: SHOT_W, height: SHOT_H, deviceScaleFactor: 1, mobile: false })
await send('Emulation.setVisibleSize', { width: SHOT_W, height: SHOT_H })

// 等网格就绪
let ready = false
for (let i = 0; i < 90; i++) {
  // 屏幕贴图必须就绪再拍：晚到的贴图会让部分视角的屏幕是纯色（跨视角内容不一致 = 硬伤）
  const v = await evalJS('!!(window.__photo && window.__photo.ready && (!window.__screenMat || !!window.__screenMat.map))')
  if (v === true) { ready = true; break }
  await sleep(400)
}
await sleep(WAIT)   // 再等纹理/PMREM

const vp = await evalJS('JSON.stringify({iw: innerWidth, ih: innerHeight, cw: document.getElementById("canvas").width, ch: document.getElementById("canvas").height})')
const out = { url: URL_, ready, vp }
if (SCRIPT) {
  const mod = await import(new URL(SCRIPT, 'file://' + process.cwd() + '/').href)
  out.result = await mod.default({ evalJS, send, shoot, sleep })
} else if (EXPR) {
  out.result = await evalJS(EXPR)
}
if (SHOT) out.shot = await shoot(SHOT, SHOT_W, SHOT_H)
console.log(JSON.stringify(out, null, 2))
ws.close()
// 默认**保留**页签：用户要用同一个页面复核/给反馈（2026-09-11 用户要求）。
// 需要收尾时显式加 --close。
if (process.argv.includes('--close')) await closeTab(target.id)
