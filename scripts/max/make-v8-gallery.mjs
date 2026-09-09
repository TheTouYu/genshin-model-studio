#!/usr/bin/env node
/**
 * make-v8-gallery.mjs —— 把 v8/v9 的出图与 QA 特写汇总到 web/draw/v8/ 并生成看图页。
 * 用法：node scripts/max/make-v8-gallery.mjs
 * 目的：用户能在一个页面里 1:1 看全部图（协议 6 张 + 本轮修复的 4 处特写 + 开合盖序列）。
 */
import fs from 'node:fs'
import path from 'node:path'

const R = process.cwd()
const OUT = path.join(R, 'web/draw/v8')
fs.mkdirSync(path.join(OUT, 'qa'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'lid'), { recursive: true })

const copy = (src, dst) => {
  if (!fs.existsSync(src)) { console.warn('missing: ' + src); return false }
  fs.copyFileSync(src, dst)
  return true
}

// 1) 协议 6 张
const protocol = [
  ['p1-closedtop.png', 'delivery/macbook-v8w/p1-closedtop.png', '1 闭合俯视 closedtop', '900×724 · 白底', '俯视图.png'],
  ['p2-screenfront.png', 'delivery/macbook-v8w/p1-screenfront.png', '2 屏幕正面 screenfront', '1000×627 · 白底', '正视图.png'],
  ['p3-kb.png', 'delivery/macbook-v8w/p1-kb.png', '3 键盘+触控板 kb', '880×680 · 白底', '键盘和触控板.png'],
  ['p4-ports.png', 'delivery/macbook-v8d/p1-ports.png', '4 左侧接口 ports', '1180×395 · 暗底', 'official-mbp14-ports-1.jpg'],
  ['p5-hero.png', 'delivery/macbook-v8d/p1-hero.png', '5 3/4 开盖 hero', '860×520 · 暗底', 'official-mbp14-hero.jpg'],
  ['p6-bottom.png', 'delivery/macbook-v8g/p1-bottom.png', '6 底面 bottom', '880×600 · 灰底', 'apple-mbp13-bottom-case-official.jpg'],
].map(([f, s, t, c, r]) => ({ file: f, title: t, sub: c, ref: r, ok: copy(path.join(R, s), path.join(OUT, f)) }))

// 2) 本轮修复的四处 QA 特写
const qa = [
  ['hinge-open.png', '.scratch/r9/p1-hinge.png', '转轴（开盖）', '槽内筒 + 端盖，筒不再悬空在台面上'],
  ['hinge-closed.png', '.scratch/r9/closed4/p1-hinge.png', '转轴（合盖）', '合盖息屏：旧版壁纸会从盖缝里透出来（彩色像素 8914 → 23）'],
  ['deckL.png', '.scratch/r9/deck/p1-deckL.png', '台面左前角', '圆角台阶 3.6mm → 0.23mm，不再"透明看到里面"'],
  ['deckR.png', '.scratch/r9/deck/p2-deckR.png', '台面右前角', '同上，右侧同样验证'],
  ['bezel.png', '.scratch/r9/p1-bezel.png', '屏幕边框/活动区', '玻璃边框改环形面片（48 段/角），洞边不再锯齿'],
  ['cornerL.png', '.scratch/r9/corner3-dark/p1-cornerL.png', '上盖左前角', '圆角 + 镜面高光连续'],
].map(([f, s, t, c]) => ({ file: 'qa/' + f, title: t, sub: c, ok: copy(path.join(R, s), path.join(OUT, 'qa', f)) }))

// 3) 开合盖序列
const lid = [100, 66, 33, 0].map((d) => ({
  file: `lid/${d}.png`,
  title: `上盖 ${d}°`,
  ok: copy(path.join(R, `.scratch/r9/lid-${d}/p1-hero.png`), path.join(OUT, 'lid', `${d}.png`)),
}))

const card = (x) => `
    <figure>
      <a href="./v8/${x.file}" target="_blank"><img src="./v8/${x.file}" alt="${x.title}" loading="lazy"></a>
      <figcaption><b>${x.title}</b><br><span class="meta">${x.sub}${x.ref ? ' · 配对参考：' + x.ref : ''}</span></figcaption>
    </figure>`

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>MacBook 14″ · 页面渲染总览（v8 六张 + 本轮修复特写）</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 26px 30px 70px; background: #14151a; color: #e8e9ec;
         font: 14px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
  h1 { font-size: 19px; font-weight: 600; margin: 0 0 4px; }
  h2 { font-size: 15px; font-weight: 600; margin: 34px 0 14px; color: #cfd2d9; }
  p.lead { margin: 0 0 6px; color: #9a9da6; }
  a { color: #7fb4ff; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 22px; }
  .grid.small { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
  figure { margin: 0; background: #1c1d23; border: 1px solid #2b2d36; border-radius: 10px; overflow: hidden; }
  figure img { display: block; width: 100%; height: auto; background: #000; }
  figcaption { padding: 9px 13px 11px; font-size: 13px; color: #b9bcc4; }
  figcaption b { color: #e8e9ec; font-weight: 600; }
  .meta { color: #7e828c; font-size: 12px; }
  .note { margin-top: 30px; padding: 14px 16px; background: #1c1d23; border: 1px solid #2b2d36;
          border-radius: 10px; color: #b9bcc4; font-size: 13px; }
  .note li { margin: 5px 0; }
</style>
</head>
<body>
  <h1>MacBook Pro 14″ · 浏览器页面渲染总览</h1>
  <p class="lead">同一份网格（<code>web/draw/macbook-current.json</code>）+ 同一套影棚环境，全部由
    <a href="./photo.html" target="_blank">/draw/photo.html</a> 实时渲染后直接读画布像素。
    <a href="./compare-v8.png" target="_blank">→ 与配对参考图并排</a></p>

  <h2>协议 6 张（与 v7 同条件：配对参考图 / 画布 / 背景）</h2>
  <div class="grid">${protocol.map(card).join('')}
  </div>

  <h2>本轮修复的四处（用户点名）</h2>
  <div class="grid">${qa.map(card).join('')}
  </div>

  <h2>开合盖（页面已接入动画：按钮「开 / 合盖」或按 L / 空格）</h2>
  <div class="grid small">${lid.map(card).join('')}
  </div>

  <div class="note">
    <b>本轮改动（都在盘档）</b>
    <ul>
      <li><b>合盖息屏</b>：屏幕自发光随开合角淡出（0° 全灭），旧版合盖后壁纸从盖缝透出。</li>
      <li><b>转轴</b>：台面后缘开槽（槽底 + 槽壁），转轴筒藏进槽里并加两端端盖；旧版是悬空 Ø6 开口管。</li>
      <li><b>台面四角</b>：挖孔板件的扫描线网格 24mm → 6mm，圆角台阶 3.6mm → 0.23mm。</li>
      <li><b>屏幕边框</b>：玻璃边框改环形面片，活动区洞边 48 段/角。</li>
      <li><b>键帽圆角</b>：4 段/角 → 12 段/角（880px 下不再是八边形）。</li>
      <li><b>页面动画</b>：<code>__photo.animLid/toggleLid</code> + UI 按钮 + L / 空格快捷键。</li>
    </ul>
    <p style="margin:10px 0 0">已知未修：<code>control</code>/<code>command</code> 字标缺尾字母（图集矩形比键窄）、触控板暗缝左右不对称、底盖刻蚀读作虚线块。</p>
  </div>
</body>
</html>
`
fs.writeFileSync(path.join(R, 'web/draw/v8.html'), html)
const missing = [...protocol, ...qa, ...lid].filter((x) => !x.ok)
console.log(`gallery written: web/draw/v8.html（协议 ${protocol.length} + 特写 ${qa.length} + 序列 ${lid.length}${missing.length ? `，缺 ${missing.length} 张` : ''}）`)
missing.forEach((m) => console.log('  missing ' + m.title))
