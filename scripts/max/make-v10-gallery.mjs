#!/usr/bin/env node
/**
 * make-v10-gallery.mjs —— r10 修复后的看图页（协议 6 张 + 用户点名两处的对照特写）。
 * 用法：node scripts/max/make-v10-gallery.mjs
 * 用户 2026-09-10 反馈：①接口粗糙 ②合盖侧缝对不上（官方严丝闭合）。
 * 本页把修复后的成图 + 与官方侧视图的同尺度并排放在一起，1:1 可看。
 */
import fs from 'node:fs'
import path from 'node:path'

const R = process.cwd()
const OUT = path.join(R, 'web/draw/v10')
fs.mkdirSync(OUT, { recursive: true })

const copy = (src, dst) => {
  if (!fs.existsSync(src)) { console.warn('missing: ' + src); return false }
  fs.copyFileSync(src, dst)
  return true
}

const protocol = [
  ['p1-closedtop.png', 'delivery/macbook-v10w/p1-closedtop.png', '1 闭合俯视 closedtop', '900×724 · 白底', '俯视图.png'],
  ['p2-screenfront.png', 'delivery/macbook-v10w/p1-screenfront.png', '2 屏幕正面 screenfront', '1000×627 · 白底', '正视图.png'],
  ['p3-kb.png', 'delivery/macbook-v10w/p1-kb.png', '3 键盘+触控板 kb', '880×680 · 白底', '键盘和触控板.png'],
  ['p4-ports.png', 'delivery/macbook-v10d/p1-portstele.png', '4 左侧接口 portstele（长焦侧视）', '1180×395 · 暗底', 'official-mbp14-ports-1.jpg'],
  ['p5-hero.png', 'delivery/macbook-v10d/p1-hero.png', '5 3/4 开盖 hero', '860×520 · 暗底', 'official-mbp14-hero.jpg'],
  ['p6-bottom.png', 'delivery/macbook-v10g/p1-bottom.png', '6 底面 bottom', '880×600 · 灰底', 'apple-mbp13-bottom-case-official.jpg'],
].map(([f, s, t, c, r]) => ({ file: f, title: t, sub: c, ref: r, ok: copy(path.join(R, s), path.join(OUT, f)) }))

const qa = [
  ['qa/closedtop-vs-official.png', '.scratch/r11/verify-sheet.png', '合盖俯视 ←→ 官方双机俯视', '上盖 d 210 → 218：俯视轮廓 = 整机轮廓，后唇只剩 3.0mm（旧值露 11mm 台面 + 转轴槽）'],
  ['qa/rear34.png', '.scratch/r11/v-rear34.png', '合盖后 3/4', '上盖与底座左右齐平（x ±156.30 = ±156.30）、前唇 0.2mm、后唇 3.0mm'],
  ['qa/ports-close.png', '.scratch/r11/close4.png', '接口特写（暗底）', '端口补片绕序修正 → 补片不再变暗；开口为精确圆角矩形，墙面无条纹'],
  ['qa/ports-tele.png', 'delivery/macbook-v10/compare-ports-tele.png', '左/右壁 ←→ 官方侧视图并排', '上=我方 下=官方（official-mbp14-ports-1/2.jpg）'],
  ['qa/cmp-all.png', 'delivery/macbook-v10/compare-v10.png', '协议 4 张 ←→ 配对参考并排', '左=我方 右=参考'],
].map(([f, s, t, c]) => {
  fs.mkdirSync(path.join(OUT, path.dirname(f)), { recursive: true })
  return { file: f, title: t, sub: c, ok: copy(path.join(R, s), path.join(OUT, f)) }
})

const card = (x) => `
    <figure>
      <a href="./v10/${x.file}" target="_blank"><img src="./v10/${x.file}" alt="${x.title}" loading="lazy"></a>
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
  <h1>MacBook Pro 14″ · r11：合盖上下齐平（尺寸修正）</h1>
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
    <b>r11 改动（都在盘档，可复现）</b>
    <ul>
      <li><b>上盖深度 210 → 218 mm</b>（用户：「上下盖子平齐……尺寸可能错了」「官方 14 寸两种颜色都是绝对对齐的」）：旧值后缘比底座后缘前 11 mm，合盖俯视露出一条 11 mm 台面 + 转轴槽。现后缘 −107.6、后唇 3.0 mm、前唇 0.2 mm。</li>
      <li><b>前缘开盖凹槽符号错误</b>：<code>surf</code> 沿<b>外法线 +g</b> 偏移 → 前壁中段外凸 1.2 mm（实测底座 z 到 111.5 &gt; 名义 110.6），合盖时底座比上盖多出一圈台阶。改 <b>−g</b> 内凹。</li>
      <li><b>底面螺丝</b>：旧版整组吊在底面下方 0.75 mm（整机 y 到 −0.20），底面看是四个凸点；现与底面齐平。</li>
      <li><b>端口补片绕序</b>：补片几何法线朝内 → three.js 对背面翻转法线 → 补片整片变暗（射线取证 face.normal = +x）。翻绕序后补片不可见，只剩精确开口。</li>
      <li><b>转轴槽随上盖后移</b>：cz −102.8 → −106.6（藏在合盖后的上盖后缘之下）。</li>
    </ul>
    <p style="margin:10px 0 0">已知未修：<code>control</code>/<code>command</code> 字标缺尾字母、触控板暗缝左右不对称、底盖刻蚀读作虚线块、扬声器开孔、侧壁散热槽。</p>
  </div>
</body>
</html>
`
fs.writeFileSync(path.join(R, 'web/draw/v10.html'), html)
const missing = [...protocol, ...qa].filter((x) => !x.ok)
console.log(`gallery written: web/draw/v10.html（协议 ${protocol.length} + 特写 ${qa.length}${missing.length ? `，缺 ${missing.length} 张` : ''}）`)
missing.forEach((m) => console.log('  missing ' + m.title))
