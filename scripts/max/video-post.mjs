#!/usr/bin/env node
/**
 * video-post.mjs — 录完之后的收尾：补容器时长 → 转 MP4 → 抽帧存证 → ffprobe 体检
 *
 * 为什么需要：MediaRecorder 写的是「直播式」WebM（Segment 长度 UNKNOWN、Info 无 Duration），
 * 播放器显示 0:00、不能拖进度条；而且 WebM 在微信/PPT/部分剪辑软件里不能直接用。
 * ffmpeg 装好之后，这一步就成了标准收尾。
 *
 * 用法：node scripts/max/video-post.mjs <raw.webm> [--outdir delivery/demo-video] [--frames 70,80,92,104,116,128,140,152,160,168]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const IN = args[0]
if (!IN) { console.error('usage: video-post.mjs <raw.webm> [--outdir DIR] [--frames t,t,...]'); process.exit(1) }
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d }
const OUTDIR = arg('outdir', path.dirname(IN))
const BASE = path.basename(IN).replace(/-raw\.webm$/, '').replace(/\.webm$/, '')
const FIXED = path.join(OUTDIR, BASE + '.webm')
const MP4 = path.join(OUTDIR, BASE + '.mp4')
const SHOTS = path.join(OUTDIR, 'verify-frames')
const FRAMES = arg('frames', '2.6,9.4,13.4,19,24.4,32.6,37.6,44,48,52.4,57,63,70,80,92,104,116,128,140,152,160,168').split(',')

const run = (cmd, argv) => execFileSync(cmd, argv, { stdio: 'pipe' }).toString()

// 1) 补 Duration（只动 11 个字节）
console.log('--- 1. 补容器时长 ---')
const fix = run(process.execPath, ['scripts/max/webm-fix-duration.mjs', IN, FIXED])
console.log(fix.trim().split('\n').slice(-3).join('\n'))

// 2) 转 MP4（H.264/AAC，CFR 30，faststart：微信/PPT/剪辑软件都能直接用）
console.log('--- 2. 转 MP4 ---')
const probeIn = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', FIXED]))
const dur = parseFloat(probeIn.format.duration)
run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', FIXED,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
  '-fps_mode', 'cfr', '-r', '30',
  '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', MP4])
const sz = (p) => (fs.statSync(p).size / 1048576).toFixed(1) + 'MB'
console.log(`  ${path.basename(FIXED)}  ${sz(FIXED)}  ${dur.toFixed(2)}s`)
console.log(`  ${path.basename(MP4)}  ${sz(MP4)}`)

// 3) 抽帧存证（ffmpeg 的 seek 是准的；浏览器对这类 WebM 的 seek 会失效，见 _verify-video.html 注释）
console.log('--- 3. 抽帧存证 ---')
fs.mkdirSync(SHOTS, { recursive: true })
for (const t of FRAMES) {
  const p = path.join(SHOTS, `t${String(t).replace('.', '_')}.png`)
  run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', MP4,
    '-frames:v', '1', '-q:v', '2', p])
}
console.log(`  ${FRAMES.length} 帧 -> ${SHOTS}`)

// 4) ffprobe 体检
console.log('--- 4. ffprobe ---')
const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries',
  'format=duration,size,bit_rate:stream=index,codec_name,codec_type,width,height,channels,sample_rate,avg_frame_rate,nb_frames',
  '-of', 'json', MP4]))
for (const st of probe.streams) {
  if (st.codec_type === 'video') console.log(`  video: ${st.codec_name} ${st.width}x${st.height} ${st.avg_frame_rate} frames=${st.nb_frames}`)
  else console.log(`  audio: ${st.codec_name} ${st.channels}ch ${st.sample_rate}Hz`)
}
console.log(`  duration=${probe.format.duration}s  bitrate=${(probe.format.bit_rate / 1e6).toFixed(2)}Mbps`)
console.log('OK')
