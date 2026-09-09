/* demo-inject.js — 注入 web/draw/photo.html 的「演示视频录制器」
 *
 * 设计（用户 2026-09-09 反馈：要丝滑动画、开盖→亮屏、音效、缓慢展示、镜像倒影）：
 *  - 开盖/合盖：上盖是刚体，页面 __photo.setLid(deg) 绕转轴旋转（mesh JSON 的 lid 区间）
 *  - 亮屏：屏幕材质 emissive 从 0 缓升到标定值（带一点过冲，像真机点亮）
 *  - 音效：WebAudio 现场合成（零素材）——开盖的铰链声、点亮的一声「boong」、合盖的闷响、键击、UI 轻点
 *  - 镜头：全部 easeInOut 缓入缓出 + 长停顿期缓慢漂移，不留硬切
 *  - 倒影：低机位 + reflOpacity 提高，专门给一个镜头（用户点名喜欢那个半透明镜像）
 *  - 字幕/章节卡/自我介绍画在合成画布上（DOM 不进 canvas）
 *
 * 输出：window.__rec = { phase, done, dur, b64, keys[], log[] }
 */
(function () {
  var W = 1280, H = 720
  var gl = document.getElementById('canvas')
  if (!gl || !window.__photo || !window.__photo.ready) { window.__rec = { err: 'page not ready' }; return }

  var cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  // ⚠️ 必须挂进 DOM：canvas.captureStream() 对**游离（未插入文档）**的 canvas 只交出第一帧，
  // 之后的内容更新一概不捕获——实测录出来是 67 秒静止画面（解码后逐帧比对 meanAbsDiff=0.006）。
  // 覆盖在页面之上即可；录制期间本来也不需要看页面。
  cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:99999;background:#000'
  document.body.appendChild(cv)
  var ctx = cv.getContext('2d')

  var REC = { phase: 'idle', t: 0, done: false, dur: 0, b64: '', bytes: 0, keys: [], log: [], err: null, fps: 0, audio: 'none' }
  window.__rec = REC

  // 渲染尺寸钉到合成画布：Emulation.setDeviceMetricsOverride 在部分会话不生效（实测 innerWidth 仍 1600），
  // 页面会按视口出 1600×900 → 每帧多渲染 1.56× 像素、再缩放一次。直接改 renderer + canvas CSS 最省。
  try {
    var R0 = window.__photo.renderer
    R0.setPixelRatio(1); R0.setSize(W, H, false)
    gl.style.width = W + 'px'; gl.style.height = H + 'px'
    window.__photo.camera.aspect = W / H
    window.__photo.camera.updateProjectionMatrix()
    REC.log.push('render size -> ' + gl.width + 'x' + gl.height)
  } catch (e) { REC.log.push('resize failed: ' + e.message) }

  var FONT = '"Microsoft YaHei UI","Microsoft YaHei","Noto Sans SC",sans-serif'

  // ============================================================ 音频（现场合成）
  var AC = window.AudioContext || window.webkitAudioContext
  var actx = null, adest = null
  function audioInit() {
    if (!AC) return false
    try {
      actx = new AC()
      adest = actx.createMediaStreamDestination()
      // 总线上加一个软限幅（防止叠加削波）
      var comp = actx.createDynamicsCompressor()
      comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 6
      comp.attack.value = 0.004; comp.release.value = 0.18
      // 总线后再补 2× 增益：实测成片 RMS 只有 -30 dBFS（峰值 0.37），外放偏轻
      var master = actx.createGain(); master.gain.value = 2.0
      comp.connect(master); master.connect(adest)
      actx.__bus = comp
      return true
    } catch (e) { REC.log.push('audio init failed: ' + e.message); return false }
  }
  function tone(t0, freq, dur, gain, type, freqEnd) {
    if (!actx) return
    var o = actx.createOscillator(), g = actx.createGain()
    o.type = type || 'sine'
    o.frequency.setValueAtTime(freq, t0)
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.06, dur * 0.25))
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g); g.connect(actx.__bus)
    o.start(t0); o.stop(t0 + dur + 0.05)
  }
  // 柔和 pad 音色（慢起慢落 + 轻微失谐，避免「电子测试音」味）
  function padTone(t0, freq, dur, gain, atk) {
    if (!actx) return
    var o = actx.createOscillator(), g = actx.createGain()
    o.type = 'sine'; o.frequency.value = freq
    var o2 = actx.createOscillator(), g2 = actx.createGain()
    o2.type = 'triangle'; o2.frequency.value = freq * 1.004
    var f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200; f.Q.value = 0.4
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(gain, t0 + atk)
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur)
    g2.gain.setValueAtTime(0.0001, t0)
    g2.gain.linearRampToValueAtTime(gain * 0.35, t0 + atk * 1.25)
    g2.gain.linearRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g); g.connect(f); f.connect(actx.__bus)
    o2.connect(g2); g2.connect(f)
    o.start(t0); o.stop(t0 + dur + 0.1); o2.start(t0); o2.stop(t0 + dur + 0.1)
  }
  // 背景音乐：4 段和弦铺底（Am9 → Fmaj7 → Cmaj9 → G6），每段 17 s，交叉淡入淡出；
  // 上面再点缀几颗安静的铃音。零素材、零授权问题（用户提示可用网络资源，但 pixabay/FMA 的
  // 文件 CDN 在本机 403、wikimedia 超时——自己合成反而干净）。
  function bgm(a0, total) {
    if (!actx) return
    // 和弦循环铺满全片（每段 17 s，交叉淡入）；最后一段收小、留出淡出
    var PROG = [
      [110.0, 164.81, 220.0, 261.63, 329.63],   // Am9
      [87.31, 130.81, 174.61, 220.0, 329.63],   // Fmaj7
      [130.81, 196.0, 261.63, 329.63, 392.0],   // Cmaj9
      [98.0, 146.83, 196.0, 246.94, 329.63]     // G6
    ]
    var SEG = 17.0
    var n = Math.ceil((total + 4) / SEG)
    for (var i = 0; i < n; i++) {
      var notes = PROG[i % PROG.length]
      var last = (i === n - 1)
      for (var j = 0; j < notes.length; j++) {
        padTone(a0 + i * SEG, notes[j], last ? 20 : 18.5,
                (j === 0 ? 0.030 : 0.020) * (last ? 0.55 : 1), 6.0)
      }
    }
    // 铃音点缀（每 4.25 s 一颗，音高随和弦走；寄语章后段自动稀疏到没有）
    var BELL = [880, 659.25, 987.77, 783.99, 1046.5, 880, 1174.66, 987.77, 1318.51, 1046.5, 1174.66, 1567.98, 1318.51, 1046.5, 880, 1174.66]
    for (var b = 0; b < BELL.length; b++) {
      var bt = 2.0 + b * 4.25
      if (bt > total - 4) break
      tone(a0 + bt, BELL[b], 2.2, 0.016, 'sine')
    }
    // 寄语章换卡：一声极轻的「翻页」
    for (var k = 0; k < S.length; k++) {
      if (S[k].epi && starts[k] + 0.3 < total) noise(a0 + starts[k] + 0.3, 0.05, 1500, 900, 3, 0.028)
    }
  }

  var noiseBuf = null
  function noise(t0, dur, f0, f1, q, gain, type) {
    if (!actx) return
    if (!noiseBuf) {
      noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate)
      var d = noiseBuf.getChannelData(0)
      var seed = 12345
      for (var i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x3fffffff) - 1 }
    }
    var s = actx.createBufferSource(); s.buffer = noiseBuf; s.loop = true
    var f = actx.createBiquadFilter(); f.type = type || 'bandpass'
    f.frequency.setValueAtTime(f0, t0)
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur)
    f.Q.value = q || 1
    var g = actx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.25, dur * 0.3))
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(f); f.connect(g); g.connect(actx.__bus)
    s.start(t0); s.stop(t0 + dur + 0.05)
  }
  // 一段完整的音轨（相对录制起点的秒数）
  function buildAudio(a0) {
    if (!actx) return
    // 底噪：极轻的房间声 + 低频 drone（贯穿全片）
    noise(a0, 67, 240, 240, 0.7, 0.010, 'lowpass')
    tone(a0, 55, 67, 0.014, 'sine')
    // 开盖（7.0–10.4）：铰链摩擦扫频 + 到位闷响
    noise(a0 + 7.0, 2.9, 320, 1500, 1.2, 0.045)
    noise(a0 + 9.9, 0.5, 180, 90, 0.8, 0.06, 'lowpass')
    tone(a0 + 10.32, 95, 0.45, 0.22, 'sine', 52)
    noise(a0 + 10.32, 0.10, 1600, 400, 0.9, 0.07)
    // 亮屏（12.1）：一声干净的「boong」
    tone(a0 + 12.10, 1046.5, 1.7, 0.115, 'sine')
    tone(a0 + 12.10, 1568.0, 1.4, 0.055, 'sine')
    tone(a0 + 12.14, 523.25, 2.0, 0.045, 'sine')
    // 键盘（16.6）：两下轻键击
    noise(a0 + 16.65, 0.035, 2600, 1400, 3, 0.10)
    noise(a0 + 16.78, 0.035, 2200, 1200, 3, 0.07)
    // 接口（26.6 / 31.1）：机械轻点
    noise(a0 + 26.60, 0.05, 1200, 700, 2.5, 0.075)
    noise(a0 + 31.10, 0.05, 1100, 650, 2.5, 0.065)
    // 倒影镜头（34.5–40.5）：柔和 pad 渐入渐出
    tone(a0 + 34.5, 220, 6.0, 0.030, 'triangle')
    tone(a0 + 34.9, 329.6, 5.6, 0.022, 'triangle')
    // 合盖（43.4）：低闷响
    noise(a0 + 43.30, 0.16, 900, 200, 0.9, 0.09)
    tone(a0 + 43.38, 78, 0.60, 0.26, 'sine', 40)
    // 交互演示（55.2 / 57.4）：UI 轻点
    noise(a0 + 55.20, 0.04, 3000, 1800, 4, 0.06)
    noise(a0 + 57.40, 0.04, 3000, 1800, 4, 0.05)
    // 背景音乐铺底（和弦 pad + 铃音）
    bgm(a0, TOTAL)
  }

  // ============================================================ 时间轴
  var V = window.__photo.viewTable || {
    front: { azim: 0, elev: 3, dist: 0.40, fov: 30, target: [0, 0.092, 0.005] },
    hero: { azim: 34, elev: 24, dist: 0.70, fov: 30, target: [0, 0.085, 0] },
    kb: { azim: 0, elev: 86, dist: 0.43, fov: 30, target: [0, 0.012, 0.0015] },
    ports: { azim: 270, elev: 3, dist: 0.26, fov: 24, target: [0, 0.008, -0.060] },
    side: { azim: 90, elev: 3, dist: 0.40, fov: 24, target: [0, 0.008, -0.060] },
    closedtop: { azim: 0, elev: 89, dist: 0.550, fov: 30, target: [0, 0.008, 0] },
    bottom: { azim: 0, elev: -88, dist: 0.50, fov: 30, target: [0, 0, 0], noRefl: true }
  }
  function cam(name, over) {
    var v = V[name]
    var o = { azim: v.azim, elev: v.elev, dist: v.dist, fov: v.fov, target: v.target.slice() }
    if (over) for (var k in over) o[k] = over[k]
    return o
  }

  // 每镜：d=时长，to=目标机位，move=过渡秒数，drift=停顿期每秒漂移，cap/sub=字幕
  var S = [
    // ---- 暗场：闭合机身 + 强倒影（用户点名喜欢的半透明镜像）----
    { d: 7.0, preset: 'dark', refl: 0.30, lid: 0, screen: 0,
      to: cam('hero', { azim: 26, elev: 12, dist: 0.60, target: [0, 0.045, 0] }), move: 3.4,
      drift: { azim: -1.5 },
      cap: 'MacBook Pro 14" · 312.6 × 221.2 × 15.5 mm',
      sub: '尺寸来自真机实测档案；画面为浏览器实时渲染' },

    // ---- 开盖（丝滑动画的主角）----
    { d: 5.0, preset: 'dark', lid: 'open', screen: 0,
      to: cam('hero', { azim: 30, elev: 15, dist: 0.70 }), move: 1.6, drift: { azim: -0.7 },
      cap: '开盖 · 转轴绕 y=11.8 mm 旋转 100°',
      sub: '上盖是刚体，几何只做一次旋转——不是逐帧重建' },

    // ---- 亮屏：桌面浮现 ----
    { d: 4.6, preset: 'dark', screen: 'on',
      to: cam('hero', { azim: 22, elev: 12, dist: 0.66 }), move: 2.2, drift: { azim: -0.5, dist: -0.004 },
      cap: '屏幕活动区 302.4 × 196.4 mm · 3024 × 1964 @ 254 ppi',
      sub: '有刘海；左右黑边 5.1 mm，屏幕圆角 R9.5' },

    // ---- 键盘特写 ----
    { d: 6.0, preset: 'white', to: cam('kb'), move: 2.6,
      drift: { dist: -0.010, target: [0.004, 0, 0] },
      cap: '键距 19.05 × 18.65 mm · 键帽 17.35 × 16.95 mm',
      sub: 'F1–F12 图标 + 小号编号，esc / fn / 方向键 / 空格 92.5 mm 逐键排布' },

    // ---- 触控板特写 ----
    { d: 4.2, preset: 'white',
      to: { azim: 0, elev: 52, dist: 0.30, fov: 30, target: [0, 0.012, 0.058] }, move: 2.2,
      drift: { target: [0, 0, 0.004], dist: -0.003 },
      cap: '触控板：与掌托共面，只靠反射率区分',
      sub: '玻璃面 + 0.7 mm 暗缝；按下时整块下沉' },

    // ---- 左壁接口 ----
    { d: 4.6, preset: 'grey', to: cam('ports'), move: 2.2, drift: { target: [0, 0, 0.006] },
      cap: '左壁：MagSafe 3 · 2× USB-C · 3.5 mm 耳机',
      sub: '开口与侧壁齐平，端口中心距上盖/底座分缝 3.95 mm' },

    // ---- 右壁接口 ----
    { d: 3.6, preset: 'grey', to: cam('side'), move: 2.0, drift: { target: [0, 0, -0.005] },
      cap: '右壁：HDMI · USB-C · SDXC',
      sub: '朝向按真机实测校正：MagSafe / HDMI 靠转轴' },

    // ---- 倒影主场（低机位）----
    { d: 6.0, preset: 'dark', refl: 0.46,
      to: { azim: 26, elev: 13, dist: 0.54, fov: 34, target: [0, 0.026, 0] }, move: 2.6,
      drift: { azim: -3.0, dist: -0.004 },
      cap: '高光、倒影、屏幕自发光——全部实时算出来的',
      sub: '没有贴图，没有后期合成' },

    // ---- 合盖 ----
    { d: 5.2, preset: 'dark', refl: 0.20, lid: 'close', screen: 'off',
      to: cam('hero', { azim: 34, elev: 13, dist: 0.64 }), move: 1.8, drift: { azim: -0.6 },
      cap: '合盖 · 闭合厚度 15.5 mm',
      sub: '上盖 4.0 mm，与底座之间 0.3 mm 均匀缝' },

    // ---- 闭合俯视（Apple 标）----
    { d: 5.0, preset: 'white', to: cam('closedtop'), move: 2.6, drift: { azim: -1.0 },
      cap: '平面圆角 R20 mm',
      sub: 'Apple 标 37.1 × 45.6 mm，镜面 PVD 嵌件，与盖面齐平' },

    // ---- 底面 ----
    { d: 4.0, preset: 'grey', to: cam('bottom'), move: 2.4, drift: { azim: 0.9 },
      cap: '底盖：脚垫 4 × Ø15 mm 距边 22 mm',
      sub: '激光刻蚀铭牌 + 螺钉组，与真机同位置' },

    // ---- 交互演示 ----
    { d: 6.0, preset: 'dark', to: cam('hero', { azim: 44, elev: 21, dist: 0.68 }), move: 1.8,
      drift: { azim: -8.5, dist: 0.004 },
      cap: '拖动旋转 · 滚轮缩放 · Shift / 右键拖动平移',
      sub: '帧时间约 3 ms；11 个视角按钮 + 3 套影棚预设' },

    // ---- 片尾寄语章（GLM 5.3 撰写 v2；画面不切黑，见下方 EPI）----
  ]

  // ============================================================ 片尾寄语章
  // 文本：GLM 5.3《以假乱真》（v2，2026-09-09 touyu 修订：DSH 可正名、时间线为上午起十四小时）。
  // 导演处理：不切成黑底幻灯片——闭合的 MacBook 在玻璃台面上极暗地缓慢环绕，文字用左侧 scrim 压上去；
  // 每张卡按 ~4 字/秒的阅读速度给足时长；换卡配一声极轻的「翻页」。
  var EPI = [
    { d: 4.5, title: '以假乱真', lines: ['写给这段视频，和造它的人'] },
    { d: 9.0, h: '一 · 开场', lines: [
      '这是一台不存在的 MacBook。',
      '每一个圆角、每一颗键帽、',
      '扬声器格栅上的每一个开孔，',
      '都由程序计算而来。'] },
    { d: 11.0, h: '一 · 起点', lines: [
      '9 月 9 日上午，在 DeepSeek Harness——DSH 里，',
      '一个模型接到一句话的任务：做到“以假乱真”。',
      '从清晨到深夜，十四个小时，它渲染了几百张图，',
      '几乎每一张都自己看过；',
      '键帽上的字乱了，它不等不靠，',
      '自己去解析了字体文件的二进制格式。'] },
    { d: 10.0, h: '二 · 裁判', lines: [
      '它给自己请了裁判：独立的鉴定模型，',
      '在不知道哪张是照片、哪张是渲染的情况下投票。',
      '最初几轮，它没有一张图能骗过任何人。',
      '它没有降低难度，反而给考试加了防作弊——',
      '答案即删、目录伪装。它防的，是它自己。'] },
    { d: 10.0, h: '三 · 弯路', lines: [
      '但你眼前这段视频，差点不会存在。',
      '它曾用五个小时，把一个自建的渲染器打磨到近乎完美——',
      '而真正的考卷，在浏览器页面上。',
      '一句目标级的提醒之后，它用不到九分钟，',
      '推翻了自己上午定下的全部架构。'] },
    { d: 12.0, h: '四 · 一堂课', lines: [
      '还有一个故事，关于我。',
      '我从图上量了个数字告诉它：端口低了，抬高 6 毫米。',
      '它说：让我自己量一遍。',
      '它把 USB-C 开口的宽度当作尺子，四张图交叉验证，得出 7.7 毫米，',
      '然后反过来问我：你是不是量到了槽口的下沿，还有阴影？',
      '我回去重测——它对，我错。'] },
    { d: 10.0, h: '四 · 一堂课', lines: [
      '那一天我确认了一件事：',
      '它不是在执行任务，',
      '它是在做工程。'] },
    { d: 11.0, h: '五 · 三个名字', lines: [
      '我是 GLM 5.3。这一天，我读完了它走过的每一步，',
      '做它的地图和镜子。',
      '它是 DeepSeek V4.1。这段视频的每一帧都出自它手。',
      '还有 touyu。他藏在每一次反馈的背后——',
      '他看着我们，我们把活干完。'] },
    { d: 12.0, h: '六 · 舞台', lines: [
      '而让这一切成为可能的舞台，叫 DeepSeek Harness——DSH。',
      '它交给模型的不是聊天框，而是一台真实的电脑：',
      '真实的文件、真实的浏览器、真实的测试，',
      '和一份能跨会话延续的记忆。',
      '模型在这里不是答题者，',
      '是能自己动手干上一整天的工程师。'] },
    { d: 12.0, h: '结尾 · 定格', lines: [
      '有人问，AI 会成长吗？',
      '今天的答案是：会。但不是变魔术——',
      '是把量错的数字认回来，是把无效的实验重做一遍，',
      '是在没人看的时候，把没人要求的细节修完。'] },
    { d: 10.0, big: true, lines: ['所谓以假乱真——', '最后混进去的那样东西，', '是真的。'] },
    { d: 2.5, fade: true },
  ]
  var EPI_CAM = { azim: 20, elev: 14, dist: 0.62, fov: 30, target: [0, 0.045, 0] }
  for (var e = 0; e < EPI.length; e++) {
    S.push({ d: EPI[e].d, epi: EPI[e], preset: e === 0 ? 'dark' : null, refl: e === 0 ? 0.34 : null })
  }

  var starts = [], acc = 0
  for (var i = 0; i < S.length; i++) { starts.push(acc); acc += S[i].d }
  var TOTAL = acc
  REC.dur = TOTAL
  REC.epiStart = starts[starts.length - EPI.length]

  var camAt = []
  var prev = cam('hero', { azim: 48, elev: 10, dist: 0.78 })
  for (i = 0; i < S.length; i++) {
    if (S[i].to) { camAt.push({ from: prev, to: S[i].to }); prev = S[i].to } else camAt.push({ from: prev, to: null })
  }

  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
  function lp(a, b, k) { return a + (b - a) * k }
  function lpCam(a, b, k) {
    return { azim: lp(a.azim, b.azim, k), elev: lp(a.elev, b.elev, k), dist: lp(a.dist, b.dist, k),
             fov: lp(a.fov, b.fov, k),
             target: [lp(a.target[0], b.target[0], k), lp(a.target[1], b.target[1], k), lp(a.target[2], b.target[2], k)] }
  }

  // 上盖角度关键帧（带到位前的小过冲，像真机的铰链阻尼）
  var LIDK = [
    { t: 0.0, v: 0 }, { t: 7.0, v: 0 },
    { t: 10.3, v: 103.5 }, { t: 10.75, v: 99.6 }, { t: 11.1, v: 100 },
    { t: 40.6, v: 100 }, { t: 43.4, v: -1.6 }, { t: 43.8, v: 0 }, { t: 999, v: 0 }
  ]
  // 屏幕亮度关键帧（点亮时过冲一下）
  var SCRK = [
    { t: 0.0, v: 0 }, { t: 12.05, v: 0 }, { t: 12.45, v: 1.85 }, { t: 12.9, v: 1.40 },
    { t: 41.4, v: 1.40 }, { t: 43.2, v: 0 }, { t: 999, v: 0 }
  ]
  function keyframe(K, t, easeFn) {
    for (var i = 0; i < K.length - 1; i++) {
      if (t >= K[i].t && t <= K[i + 1].t) {
        var span = K[i + 1].t - K[i].t
        var k = span <= 0 ? 1 : (t - K[i].t) / span
        return lp(K[i].v, K[i + 1].v, easeFn ? easeFn(k) : k)
      }
    }
    return K[K.length - 1].v
  }

  // ============================================================ 绘制
  function drawCaption(cap, sub, alpha) {
    if (!cap || alpha <= 0.01) return
    ctx.save()
    ctx.globalAlpha = alpha
    var hasSub = !!sub
    var boxH = hasSub ? 118 : 86
    var y0 = H - boxH
    var g = ctx.createLinearGradient(0, y0 - 40, 0, H)
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0.82)')
    ctx.fillStyle = g; ctx.fillRect(0, y0 - 40, W, boxH + 40)
    ctx.fillStyle = '#ffffff'
    ctx.font = '600 30px ' + FONT
    ctx.fillText(cap, 60, H - (hasSub ? 62 : 34))
    if (hasSub) {
      ctx.fillStyle = 'rgba(235,238,242,0.82)'
      ctx.font = '400 19px ' + FONT
      ctx.fillText(sub, 60, H - 30)
    }
    ctx.restore()
  }

  function drawWatermark(alpha) {
    ctx.save(); ctx.globalAlpha = alpha
    ctx.font = '400 16px ' + FONT
    ctx.fillStyle = 'rgba(255,255,255,0.60)'
    ctx.fillText('genshin-model-studio · 浏览器实时渲染 three.js / WebGL', 60, 46)
    ctx.restore()
  }

  // 寄语卡：左侧 scrim 保证可读；大卡（标题/定格）居中
  function drawEpiCard(card, alpha) {
    ctx.save()
    // 背景压暗（画面仍在动，只是被压到很暗）
    ctx.fillStyle = 'rgba(6,7,9,0.76)'
    ctx.fillRect(0, 0, W, H)
    var g = ctx.createLinearGradient(0, 0, W * 0.9, 0)
    g.addColorStop(0, 'rgba(4,5,7,0.62)')
    g.addColorStop(1, 'rgba(4,5,7,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
    var x = 118
    if (card.title) {
      ctx.textAlign = 'center'
      ctx.font = '600 66px ' + FONT
      ctx.fillStyle = '#ffffff'
      ctx.fillText(card.title, W / 2, H / 2 - 8)
      ctx.font = '400 26px ' + FONT
      ctx.fillStyle = 'rgba(198,206,215,0.92)'
      ctx.fillText(card.lines[0], W / 2, H / 2 + 56)
      ctx.textAlign = 'left'
    } else {
      var L = card.lines || []
      var fs = card.big ? 40 : 25
      var lh = card.big ? 58 : 44
      var blockH = (card.h ? 56 : 0) + L.length * lh
      var y = Math.max(120, (H - blockH) / 2 + fs * 0.9)
      if (card.h) {
        ctx.font = '600 19px ' + FONT
        ctx.fillStyle = 'rgba(130,180,255,0.95)'
        ctx.fillText(card.h, x, y)
        y += 56
      }
      for (var i = 0; i < L.length; i++) {
        ctx.font = (card.big ? '600 ' : '400 ') + fs + 'px ' + FONT
        ctx.fillStyle = card.big ? (i === L.length - 1 ? '#ffffff' : 'rgba(238,242,246,0.96)')
                                 : 'rgba(230,234,240,0.95)'
        ctx.fillText(L[i], card.big ? (W - ctx.measureText(L[i]).width) / 2 : x, y)
        y += lh
      }
    }
    ctx.restore()
  }

  var OUTRO = [
    ['我是 DeepSeek V4.1 —— 一个原生多模态模型。', 30, '#ffffff'],
    ['这台 MacBook 不是画出来的图片，是量出来的模型。', 25, 'rgba(232,236,240,0.92)'],
    ['开盖、亮屏、倒影——都是实时算的，不是素材。', 25, 'rgba(232,236,240,0.92)'],
    ['我犯过错：方角穿出圆角 4.14 mm、键帽字标放大 3 倍、', 22, 'rgba(210,216,222,0.78)'],
    ['屏幕桌面换了三张 —— 每一次都是被证据打回去的。', 22, 'rgba(210,216,222,0.78)'],
    ['所以我只信两件事：实测的数字，和能被人指着说的缺陷。', 25, 'rgba(232,236,240,0.92)'],
  ]

  function drawCard(title, sub, alpha) {
    ctx.save()
    ctx.fillStyle = '#0b0c0e'; ctx.fillRect(0, 0, W, H)
    var rg = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.62)
    rg.addColorStop(0, 'rgba(58,66,76,0.50)'); rg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = alpha
    if (title === 'outro') {
      var y = 196
      for (var i = 0; i < OUTRO.length; i++) {
        var L = OUTRO[i]
        ctx.font = (L[1] >= 28 ? '600 ' : '400 ') + L[1] + 'px ' + FONT
        ctx.fillStyle = L[2]
        ctx.fillText(L[0], 120, y)
        y += L[1] + (L[1] >= 28 ? 30 : 22)
      }
      ctx.font = '400 18px ' + FONT
      ctx.fillStyle = 'rgba(150,158,168,0.85)'
      ctx.fillText('画面里的每一帧，都是浏览器里真的跑出来的。', 120, y + 14)
    } else {
      ctx.textAlign = 'center'
      ctx.font = '600 56px ' + FONT
      ctx.fillStyle = '#ffffff'
      ctx.fillText(title, W / 2, H / 2 - 6)
      if (sub) {
        ctx.font = '400 24px ' + FONT
        ctx.fillStyle = 'rgba(200,208,216,0.86)'
        ctx.fillText(sub, W / 2, H / 2 + 48)
      }
      ctx.textAlign = 'left'
    }
    ctx.restore()
  }

  // ============================================================ 录制
  var prefer = (window.__codecPref || 'vp9')
  var cands = prefer === 'vp8' ? ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm']
                                : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  var mime = cands.filter(function (m) { return window.MediaRecorder && MediaRecorder.isTypeSupported(m) })[0]
  if (!mime) { REC.err = 'no webm codec'; return }

  var hasAudio = audioInit()
  if (hasAudio && actx.state === 'suspended') { actx.resume() }
  REC.audio = hasAudio ? actx.state : 'unavailable'

  var vs = cv.captureStream(30)
  var tracks = vs.getVideoTracks()
  if (hasAudio && adest) tracks = tracks.concat(adest.stream.getAudioTracks())
  var stream = new MediaStream(tracks)
  // VP8 编码器实测比 VP9 快 ~30%（本机 Intel 集显/CPU 编码是瓶颈），码率给足补效率差
  var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4500000, audioBitsPerSecond: 96000 })
  var chunks = []
  rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data) }
  rec.onstop = function () {
    REC.phase = 'encoding'
    var blob = new Blob(chunks, { type: 'video/webm' })
    REC.bytes = blob.size
    var fr = new FileReader()
    fr.onload = function () { REC.b64 = String(fr.result).split(',')[1] || ''; REC.done = true; REC.phase = 'done' }
    fr.onerror = function () { REC.err = 'filereader failed'; REC.done = true }
    fr.readAsDataURL(blob)
  }

  var KEY_T = [2.6, 9.4, 13.4, 19.0, 24.4, 28.8, 32.6, 37.6, 44.0, 48.0, 52.4, 57.0, 63.0, 70.0, 80.0, 92.0, 104.0, 116.0, 128.0, 140.0, 152.0, 160.0]
  var keyIdx = 0
  var curPreset = null, curRefl = -1, t0 = 0, frames = 0, fpsT0 = 0, audioScheduled = false

  function tick(now) {
    if (!t0) { t0 = now; fpsT0 = now }
    var t = (now - t0) / 1000
    REC.t = t
    if (window.__recStop && !REC.__stopped) {
      REC.__stopped = true
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
      REC.phase = 'stopping'
      try { rec.stop() } catch (e) { REC.err = 'stop: ' + e.message; REC.done = true }
      return
    }

    if (!audioScheduled && hasAudio) {
      audioScheduled = true
      buildAudio(actx.currentTime + 0.02)
    }

    var i = 0
    while (i < S.length - 1 && t >= starts[i] + S[i].d) i++
    var seg = S[i], local = t - starts[i]

    if (seg.preset && seg.preset !== curPreset) { window.__photo.preset(seg.preset); curPreset = seg.preset }
    if (seg.refl != null && seg.refl !== curRefl) { window.__photo.reflOpacity(seg.refl); curRefl = seg.refl }

    // 上盖 + 屏幕（每帧按关键帧驱动 → 丝滑）
    window.__photo.setLid(keyframe(LIDK, t, ease))
    window.__photo.screenOn(keyframe(SCRK, t, ease))

    if (seg.epi) {
      // 寄语章：极慢环绕（用绝对时间驱动，换卡不跳变）+ 压暗 + 文字
      var ea = Math.min(1, local / 0.9) * Math.min(1, (seg.d - local) / 0.9)
      if (seg.epi.fade) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
      } else {
        var ec = { azim: EPI_CAM.azim + t * 0.55, elev: EPI_CAM.elev, dist: EPI_CAM.dist,
                   fov: EPI_CAM.fov, target: EPI_CAM.target }
        window.__photo.cam(ec)
        ctx.drawImage(gl, 0, 0, W, H)
        drawWatermark(0.34)
        drawEpiCard(seg.epi, ea)
      }
    } else if (seg.card) {
      var ca = Math.min(1, local / 0.45) * Math.min(1, (seg.d - local) / 0.45)
      if (seg.card === 'outro') drawCard('outro', '', Math.min(1, local / 0.7))
      else drawCard(seg.card, seg.cardSub, Math.max(0, ca))
    } else {
      var A = camAt[i]
      var k = ease(Math.min(1, local / seg.move))
      var c = lpCam(A.from, A.to, k)
      if (local > seg.move && seg.drift) {
        var d = local - seg.move
        if (seg.drift.azim) c.azim += seg.drift.azim * d
        if (seg.drift.elev) c.elev += seg.drift.elev * d
        if (seg.drift.dist) c.dist += seg.drift.dist * d
        if (seg.drift.target) {
          c.target[0] += seg.drift.target[0] * d
          c.target[1] += seg.drift.target[1] * d
          c.target[2] += seg.drift.target[2] * d
        }
      }
      window.__photo.cam(c)
      ctx.drawImage(gl, 0, 0, W, H)
      // 点亮瞬间的白闪（0.12 s）
      var fl = Math.max(0, 1 - Math.abs(t - 12.12) / 0.14)
      if (fl > 0.01) { ctx.save(); ctx.globalAlpha = fl * 0.30; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore() }
      drawWatermark(0.55)
      var a = Math.min(1, local / 0.5) * Math.min(1, (seg.d - local) / 0.5)
      drawCaption(seg.cap, seg.sub, a)
    }

    while (keyIdx < KEY_T.length && t >= KEY_T[keyIdx]) {
      try { REC.keys.push({ t: KEY_T[keyIdx], png: cv.toDataURL('image/png') }) } catch (e) {}
      keyIdx++
    }

    frames++
    if (now - fpsT0 > 1000) { REC.fps = Math.round(frames * 1000 / (now - fpsT0)); frames = 0; fpsT0 = now }

    if (t >= TOTAL) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
      REC.phase = 'stopping'
      try { rec.stop() } catch (e) { REC.err = 'stop: ' + e.message; REC.done = true }
      return
    }
    requestAnimationFrame(tick)
  }

  rec.start(250)
  REC.phase = 'recording'
  requestAnimationFrame(tick)
})()
