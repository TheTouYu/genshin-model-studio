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

const target = await (await fetch('http://127.0.0.1:9333/json/new?' + encodeURIComponent(URL), { method: 'PUT' })).json()
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

const report = {}

async function snap(name) {
  const res = await evalJS(`(() => {
    const c = document.getElementById('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const w = c.width, h = c.height;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    // silhouette stats vs background #10151c (16,21,28)
    let x0 = w, x1 = -1, y0 = h, y1 = -1, n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const d = Math.abs(buf[i] - 16) + Math.abs(buf[i + 1] - 21) + Math.abs(buf[i + 2] - 28);
        if (d > 60) {
          n++;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
    const ctx2 = c2.getContext('2d'); const img = ctx2.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(buf.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
    ctx2.putImageData(img, 0, 0);
    return { url: c2.toDataURL('image/png'), w, h, n,
      bbox: x1 < 0 ? null : [x0, y0, x1, y1] };
  })()`)
  const data = res.url.split(',')[1]
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data, 'base64'))
  report[name] = { width: res.w, height: res.h, silhouettePixels: res.n,
    coverage: +(res.n / (res.w * res.h)).toFixed(4), bbox: res.bbox,
    camera: currentCamera }
  console.log('saved', name, 'coverage', report[name].coverage, 'bbox', JSON.stringify(res.bbox))
}

await waitReady()
await evalJS("window.gmsPreview.setGridVisible(false)")
await evalJS("window.gmsPreview.setBackground('#10151c')")
await evalJS("window.gmsPreview.setTarget(0, 0.82, 0)")

const VIEWS = {
  'front': { yaw: 0.0, pitch: 1.57 },
  'side': { yaw: 1.5708, pitch: 1.57 },
  'back': { yaw: 3.14159, pitch: 1.57 },
  'three-quarter': { yaw: 0.65, pitch: 0.85 },
  'reference-view': { yaw: -0.65, pitch: 1.45 },
}
let currentCamera = null
for (const [name, cam] of Object.entries(VIEWS)) {
  currentCamera = cam
  await evalJS(`window.gmsPreview.setCamera({yaw:${cam.yaw},pitch:${cam.pitch},radius:2.9})`)
  await sleep(250)
  await evalJS('window.gmsPreview.setWireframe(true)')
  await sleep(250)
  await snap('wire-' + name)
}
await evalJS("window.gmsPreview.setWireframe(false)")
await evalJS('window.gmsPreview.setCamera({yaw:-0.65,pitch:1.45,radius:2.9})')
await sleep(300)
await snap('smooth-reference-view')

currentCamera = { yaw: -0.65, pitch: 1.45, radius: 2.9, wireframe: false }
ws.close()
fs.writeFileSync(path.join(OUT, 'views-report.json'), JSON.stringify({
  schemaVersion: 1, url: URL, background: '#10151c', cameraRadius: 2.9,
  cameraTarget: [0, 0.82, 0],
  handedness: {
    mirrored: false,
    note: 'R3 已修：网格末尾绕 x=0 镜像顶点+翻转面绕序，使「面朝 +Z、上 +Y」的右手系成立（右手在 -X）；正视图里她的右手（持剑手）落画面左，与真实人物一致。',
    frontSignVsReference: 1,
  },
  views: report,
}, null, 2) + '\n')
console.log('done')
