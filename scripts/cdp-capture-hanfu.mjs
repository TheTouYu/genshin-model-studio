#!/usr/bin/env node
/**
 * cdp-capture-hanfu.mjs — 用 Edge CDP 直接截图（不依赖 browser-harness daemon）
 * 用法：node scripts/cdp-capture-hanfu.mjs <outputDir>
 */
import fs from 'node:fs'
import path from 'node:path'

const OUT = process.argv[2] || 'delivery/hanfu-cage/views'
const URL = 'http://localhost:8787/draw/hanfu-cage.html'
fs.mkdirSync(OUT, { recursive: true })

const target = await (await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(URL), { method: 'PUT' })).json()
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error('JS error: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300))
  return r.result?.result?.value
}

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try { if (await evalJS('window.__PREVIEW_READY__ === true')) return } catch {}
    await sleep(500)
  }
  throw new Error('preview not ready')
}

async function snap(name) {
  const b64 = await evalJS(`(() => {
    const c = document.getElementById('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const w = c.width, h = c.height;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
    const ctx2 = c2.getContext('2d'); const img = ctx2.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(buf.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
    ctx2.putImageData(img, 0, 0);
    return c2.toDataURL('image/png');
  })()`)
  const data = b64.split(',')[1]
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data, 'base64'))
  console.log('saved', name)
}

await waitReady()
await evalJS("window.gmsPreview.setGridVisible(false)")
await evalJS("window.gmsPreview.setBackground('#10151c')")
await evalJS("window.gmsPreview.setTarget(0, 0.85, 0)")

const VIEWS = {
  'front': { yaw: 0.0, pitch: 1.57 },
  'side': { yaw: 1.5708, pitch: 1.57 },
  'back': { yaw: 3.14159, pitch: 1.57 },
  'three-quarter': { yaw: 0.65, pitch: 0.85 },
  'reference-view': { yaw: -0.65, pitch: 1.45 },
}
for (const [name, cam] of Object.entries(VIEWS)) {
  await evalJS(`window.gmsPreview.setCamera({yaw:${cam.yaw},pitch:${cam.pitch},radius:1.7})`)
  await sleep(250)
  await evalJS('window.gmsPreview.setWireframe(true)')
  await sleep(250)
  await snap('wire-' + name)
}
await evalJS("window.gmsPreview.setWireframe(false)")
await evalJS('window.gmsPreview.setCamera({yaw:-0.65,pitch:1.45,radius:1.7})')
await sleep(300)
await snap('smooth-reference-view')

ws.close()
console.log('done')
