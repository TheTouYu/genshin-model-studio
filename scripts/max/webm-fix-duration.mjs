#!/usr/bin/env node
/**
 * webm-fix-duration.mjs — 给 MediaRecorder 录出来的 WebM 补一个 Duration
 *
 * 为什么需要：MediaRecorder 写的是「直播式」WebM——Segment 长度 UNKNOWN、Info 里没有 Duration。
 * Chrome 自己能靠扫描算出时长，但很多播放器/剪辑软件会显示 0:00 或不能拖进度条。
 * 本机没有 ffmpeg，所以自己动 11 个字节：在 Info 末尾插入 Duration(0x4489, float64 毫秒)，
 * 并把 Info 的 size 从 25 改成 36（Segment 是 UNKNOWN 长度，不用改；后面没有 SeekHead/Cues，
 * EBML 里所有长度都是相对的，插入后不需要修正任何偏移）。
 *
 * 用法：node scripts/max/webm-fix-duration.mjs <in.webm> [out.webm]
 */
import fs from 'node:fs'

const IN = process.argv[2]
const OUT = process.argv[3] || IN.replace(/\.webm$/, '.fixed.webm')
if (!IN) { console.error('usage: webm-fix-duration.mjs <in.webm> [out.webm]'); process.exit(1) }
let b = fs.readFileSync(IN)

// ---- 最小 EBML 读取器 ----
function readVint(buf, p) {
  const first = buf[p]
  if (first === 0) return null
  let len = 1
  for (let m = 0x80; m > 0; m >>= 1) { if (first & m) break; len++ }
  let val = first & ((1 << (8 - len)) - 1)
  let unknown = (first & ((1 << (8 - len)) - 1)) === (1 << (8 - len)) - 1
  for (let i = 1; i < len; i++) { val = val * 256 + buf[p + i]; if (buf[p + i] !== 0xff) unknown = false }
  return { val, len, unknown }
}
function readId(buf, p) {
  let len = 1
  for (let m = 0x80; m > 0; m >>= 1) { if (buf[p] & m) break; len++ }
  if (len > 4) return null
  let id = 0
  for (let i = 0; i < len; i++) id = id * 256 + buf[p + i]
  return { id, len }
}
function children(buf, start, end) {
  const out = []
  let p = start
  while (p < end - 1) {
    const id = readId(buf, p)
    if (!id) break
    const sz = readVint(buf, p + id.len)
    if (!sz) break
    const dataStart = p + id.len + sz.len
    const dataEnd = sz.unknown ? end : dataStart + sz.val
    out.push({ id: id.id, start: p, idLen: id.len, szLen: sz.len, dataStart, dataEnd, unknown: sz.unknown })
    if (sz.unknown) break
    p = dataEnd
  }
  return out
}

// ---- 定位 EBML 头 → Segment → Info ----
const top = children(b, 0, b.length)
const seg = top.find((e) => e.id === 0x18538067)
if (!seg) throw new Error('no Segment')
const segKids = children(b, seg.dataStart, b.length)
const info = segKids.find((e) => e.id === 0x1549a966)
if (!info) throw new Error('no Info')
const infoKids = children(b, info.dataStart, info.dataEnd)
const tcs = infoKids.find((e) => e.id === 0x2ad7b1)
const timecodeScale = tcs ? Number(b.readUIntBE(tcs.dataStart, tcs.dataEnd - tcs.dataStart)) : 1000000
console.log('Info @' + info.start + ' size=' + (info.dataEnd - info.dataStart) + ' timecodeScale=' + timecodeScale)

// ---- 扫所有 Cluster 的 Timecode，求真实末尾时间 ----
let lastTc = 0, clusters = 0
for (let p = 0; p < b.length - 4; p++) {
  if (b[p] === 0x1f && b[p + 1] === 0x43 && b[p + 2] === 0xb6 && b[p + 3] === 0x75) {
    clusters++
    const id = readId(b, p), sz = readVint(b, p + id.len)
    const ds = p + id.len + sz.len
    const kids = children(b, ds, Math.min(b.length, ds + 4096))
    const tc = kids.find((e) => e.id === 0xe7)
    if (tc) {
      const v = Number(b.readUIntBE(tc.dataStart, tc.dataEnd - tc.dataStart))
      if (v > lastTc) lastTc = v
    }
  }
}
const durationMs = lastTc * (timecodeScale / 1e6) + 34   // 加一帧（30fps）的余量
console.log('clusters=' + clusters + ' lastTimecode=' + lastTc + ' -> duration≈' + durationMs.toFixed(0) + 'ms')

// ---- 轨道清单（确认音频轨在）----
const tracks = segKids.find((e) => e.id === 0x1654ae6b)
if (tracks) {
  const list = children(b, tracks.dataStart, tracks.dataEnd).filter((e) => e.id === 0xae)
  list.forEach((t, i) => {
    const ks = children(b, t.dataStart, t.dataEnd)
    const tt = ks.find((e) => e.id === 0x83)
    const codec = ks.find((e) => e.id === 0x86)
    console.log('  track' + i + ': type=' + (tt ? b[tt.dataStart] : '?') + ' (1=video 2=audio) codec=' +
      (codec ? b.slice(codec.dataStart, codec.dataEnd).toString('latin1') : '?'))
  })
}

// ---- 写 Duration ----
const hasDur = infoKids.find((e) => e.id === 0x4489)
let out
if (hasDur) {
  out = Buffer.from(b)
  out.writeDoubleBE(durationMs, hasDur.dataStart)
  console.log('Duration 已存在 → 原地覆写')
} else {
  const durEl = Buffer.alloc(2 + 1 + 8)
  durEl[0] = 0x44; durEl[1] = 0x89; durEl[2] = 0x88           // ID + size(8)
  durEl.writeDoubleBE(durationMs, 3)
  const insertAt = info.dataEnd
  const newSize = (info.dataEnd - info.dataStart) + durEl.length
  if (newSize > 127) throw new Error('Info size > 127，需要多字节 vint（本文件不该发生）')
  out = Buffer.concat([b.slice(0, insertAt), durEl, b.slice(insertAt)])
  out[info.start + info.idLen] = 0x80 | newSize               // 1 字节 vint
  console.log('插入 Duration ' + durEl.length + ' B，Info size ' + (info.dataEnd - info.dataStart) + ' → ' + newSize)
}
fs.writeFileSync(OUT, out)
console.log('written ' + OUT + ' (' + out.length + ' B, 原 ' + b.length + ' B)')
