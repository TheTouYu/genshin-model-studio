#!/usr/bin/env node
/**
 * make-v9-gallery.mjs —— r10 修复后的看图页（协议 6 张 + 用户点名两处的对照特写）。
 * 用法：node scripts/max/make-v9-gallery.mjs
 * 用户 2026-09-10 反馈：①接口粗糙 ②合盖侧缝对不上（官方严丝闭合）。
 * 本页把修复后的成图 + 与官方侧视图的同尺度并排放在一起，1:1 可看。
 */
import fs from 'node:fs'
import path from 'node:path'

const R = process.cwd()
const OUT = path.join(R, 'web/draw/v9')
fs.mkdirSync(OUT, { recursive: true })

const copy = (src, dst) => {
  if (!fs.existsSync(src)) { console.warn('missing: ' + src); return false }
  fs.copyFileSync(src, dst)
  return true
}

const protocol = [
  ['p1-closedtop.png', 'delivery/macbook-v9w/p1-closedtop.png', '1 闭合俯视 closedtop', '900×724 · 白底', '俯视图.png'],
  ['p2-screenfront.png', 'delivery/macbook-v9w/p1-screenfront.png', '2 屏幕正面 screenfront', '1000×627 · 白底', '正视图.png'],
  ['p3-kb.png', 'delivery/macbook-v9w/p1-kb.png', '3 键盘+触控板 kb', '880×680 · 白底', '键盘和触控板.png'],
  ['p4-ports.png', 'delivery/macbook-v9d/p1-portstele.png', '4 左侧接口 portstele（长焦侧视）', '1180×395 · 暗底', 'official-mbp14-ports-1.jpg'],
  ['p5-hero.png', 'delivery/macbook-v9d/p1-hero.png', '5 3/4 开盖 hero', '860×520 · 暗底', 'official-mbp14-hero.jpg'],
  ['p6-bottom.png', 'delivery/macbook-v9g/p1-bottom.png', '6 底面 bottom', '880×600 · 灰底', 'apple-mbp13-bottom-case-official.jpg'],
].map(([f, s, t, c, r]) => ({ file: f, title: t, sub: c, ref: r, ok: copy(path.join(R, s), path.join(OUT, f)) }))

const qa = [
  ['qa/ports-left.png', '.scratch/r10l/p1-portstele.png', '左壁接口（长焦侧视）', '与官方图同尺度：MagSafe 11.0×2.5 + 5 金色触点、USB-C 8.34×2.67 圆角开口 + 深色内舌、耳机 Ø3.6'],
  ['qa/ports-right.png', '.scratch/r10l/p2-sidetele.png', '右壁接口（长焦侧视）', 'SDXC 26.7×2.67 / USB-C 8.34×2.67 / HDMI 14.67×4.33'],
  ['qa/port-close.png', '.scratch/r10e/p1-portclose.png', '接口特写（暗底）', '圆角开口（r≈1.15mm）替换直角盒；墙面竖直高光条纹已消除（解析法线）'],
  ['qa/seam-left.png', '.scratch/r10c/p2-leftseam.png', '合盖侧缝（左前 3/4）', '上盖侧壁与底座**齐平**（312.6 = 312.6），井口后边距 1mm、转轴槽贴上盖后缘'],
  ['qa/cmp-ports.png', 'delivery/macbook-v9/compare-ports-tele.png', '左/右壁 ←→ 官方侧视图并排', '上=我方 下=官方（official-mbp14-ports-1/2.jpg）'],
  ['qa/cmp-all.png', 'delivery/macbook-v9/compare-v9.png', '协议 6 张 ←→ 配对参考并排', '左=我方 右=参考'],
].map(([f, s, t, c]) => {
  fs.mkdirSync(path.join(OUT, path.dirname(f)), { recursive: true })
  return { file: f, title: t, sub: c, ok: copy(path.join(R, s), path.join(OUT, f)) }
})

const card = (x) => `
    <figure>
      <a href="./v9/${x.file}" target="_blank"><img src="./v9/${x.file}" alt="${x.title}" loading="lazy"></a>
      <figcaption><b>${x.title}</b><br><span class="meta">${x.sub}${x.ref ? ' · 配对参考：' + x.ref : ''}</span></figcaption>
    </figure>`

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>MacBook 14″ · 接口与合盖侧缝修复（r10）</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 26px 30px 70px; background: #14151a; color: #e8e9ec;
         font: 14px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
  h1 { font-size: 19px; font-weight: 600; margin: 0 0 4px; }
  h2 { font-size: 15px; font-weight: 600; margin: 34px 0 14px; color: #cfd2d9; }
  p.lead { margin: 0 0 6px; color: #9a9da6; }
  a { color: #7fb4ff; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(430px, 1fr)); gap: 22px; }
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
  <h1>MacBook Pro 14″ · r10：接口细节 + 合盖严丝闭合</h1>
  <p class="lead">同一份网格（<code>web/draw/macbook-current.json</code>）与同一影棚环境，全部由
    <a href="./photo.html" target="_blank">/draw/photo.html</a> 实时渲染后直接读画布像素。
    新增长焦侧视机位（3 m / fov 1.6° ≈ 正交），与官方侧视图同尺度可直接叠看。</p>

  <h2>协议 6 张（与 v7/v8 同条件：配对参考图 / 画布 / 背景）</h2>
  <div class="grid">${protocol.map(card).join('')}
  </div>

  <h2>用户点名的两处 + 修复依据</h2>
  <div class="grid">${qa.map(card).join('')}
  </div>

  <div class="note">
    <b>r10 改动（都在盘档，可复现）</b>
    <ul>
      <li><b>合盖侧缝</b>：上盖宽 311.6 → <b>312.6</b>（与底座齐平）；键盘井后边距 3 → <b>1 mm</b>（井口后缘 = 上盖后缘 −99.6）；转轴槽 −105 → <b>−102.8</b>（贴上盖后缘）；上盖下缘圆角 1.30 → <b>0.35 mm</b>（分缝面近直角，侧视只剩一条细黑线）。</li>
      <li><b>接口</b>：开口改<b>圆角矩形</b>（实测 r≈1.0–1.2 mm，旧版直角盒）；尺寸按官方图逐列剖面重标（MagSafe 11.0×2.5、USB-C 8.34×2.67、耳机 Ø3.6、HDMI 14.67×4.33、SDXC 26.7×2.67）；MagSafe 改 5 个<b>镀金</b>小触点、USB-C 内舌改深色 PCB 并推深到 2.2 mm。</li>
      <li><b>竖直高光条纹</b>：页面旧版对全部顶点 <code>computeVertexNormals()</code>，端口附近列宽 0.1–0.3 mm 与墙面 1–3 mm 的<b>平均法线不一致</b> → 端口两侧出现竖直亮条。改为网格 JSON 带<b>解析法线</b>（按位置+法线焊接），条纹消失、硬边也不再被抹圆。</li>
      <li><b>取证机位</b>：<code>portstele/sidetele</code>（azim 270/90, elev 0, dist 3.0 m, fov 1.6°）——旧机位 0.26 m/fov24 透视太强，无法与官方侧视图逐项对照。</li>
    </ul>
    <p style="margin:10px 0 0">已知未修：<code>control</code>/<code>command</code> 字标缺尾字母、触控板暗缝左右不对称、底盖刻蚀读作虚线块、扬声器开孔。</p>
  </div>
</body>
</html>
`
fs.writeFileSync(path.join(R, 'web/draw/v9.html'), html)
const missing = [...protocol, ...qa].filter((x) => !x.ok)
console.log(`gallery written: web/draw/v9.html（协议 ${protocol.length} + 特写 ${qa.length}${missing.length ? `，缺 ${missing.length} 张` : ''}）`)
missing.forEach((m) => console.log('  missing ' + m.title))
