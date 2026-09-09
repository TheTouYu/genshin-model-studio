# 演示视频 · 分镜脚本（可直接照做）

> **2 分 29 秒（149.3 s）· 2560×1440 · MP4(H.264 CRF18 + AAC 48 kHz) 77.2 MB**
> 前 61.2 s 是产品演示（13 镜），后 88.1 s 是片尾寄语章《以假乱真》（GLM 5.3 撰文，12 张卡 + 1 张谢幕卡）
> v1 对照：1280×720 / 175.2 s / 14.7 MB（实时录制管线，见 `macbook-demo-720p.mp4`）
> 机位参数全部取自 `web/draw/photo.html` 的 `VIEWS` 与实测标定；字幕里每个数字都能在
> `reference/macbook/design-reference.md` / `src/model/macbook/spec.ts` / `delivery/*.md` 里查到。
> 复现命令见 §4——**一条命令重跑整段**。

---

## 0. 先说清楚：这段视频是什么，不是什么

| | |
|---|---|
| **是** | 浏览器 `web/draw/photo.html` 里 WebGL 画布的真实录制（`canvas.captureStream` → MediaRecorder → WebM）。模型是本项目生成的网格（`scripts/max/page-mesh.mjs` → `web/draw/macbook-current.json`）。**开盖、亮屏、倒影、噪声都是实时算的**，不是素材。 |
| **不是** | AI 生成视频（那演示的是别人的 MacBook）；也不是自建光线追踪器出图（用户裁决：验收数字只能出自真实页面）。 |
| **音效/配乐** | WebAudio **现场合成**（零素材、零授权）：4 段和弦 pad 铺底（Am9 → Fmaj7 → Cmaj9 → G6，每段 17 s 交叉淡入）+ 铃音点缀；叠加铰链扫频、到位闷响、点亮「boong」、键击、合盖闷响、UI 轻点。 |
| **容器** | 本机没有 ffmpeg，用浏览器自带编码器；录完由 `scripts/max/webm-fix-duration.mjs` 补写 Duration（MediaRecorder 写的是直播式 WebM，很多播放器会显示 0:00）。 |

---

## 1. 时间轴总览

| # | 起–止 (s) | 镜头 | 影棚 | 主字幕 |
|---|---|---|---|---|
| 1 | 0.0 – 7.0 | 闭合机身，玻璃台面上的镜像倒影，缓慢环绕 | dark | MacBook Pro 14" · 312.6 × 221.2 × 15.5 mm |
| 2 | 7.0 – 12.0 | **开盖**：上盖绕转轴 0° → 100° | dark | 开盖 · 转轴绕 y=11.8 mm 旋转 100° |
| 3 | 12.0 – 16.6 | **亮屏**：屏幕自发光 0 → 1.85 → 1.40，桌面浮现 | dark | 屏幕活动区 302.4 × 196.4 mm · 3024 × 1964 @ 254 ppi |
| 4 | 16.6 – 22.6 | 键盘俯视，缓慢推近 + 横移 | white | 键距 19.05 × 18.65 mm · 键帽 17.35 × 16.95 mm |
| 5 | 22.6 – 26.8 | 触控板特写 | white | 触控板：与掌托共面，只靠反射率区分 |
| 6 | 26.8 – 31.4 | 左壁接口，沿侧壁平移 | grey | 左壁：MagSafe 3 · 2× USB-C · 3.5 mm 耳机 |
| 7 | 31.4 – 35.0 | 右壁接口 | grey | 右壁：HDMI · USB-C · SDXC |
| 8 | 35.0 – 41.0 | **倒影主场**：低机位 + 玻璃台面，镜像随镜头移动 | dark | 高光、倒影、屏幕自发光——全部实时算出来的 |
| 9 | 41.0 – 46.2 | **合盖**：100° → 0°，屏幕随之下沉熄灭 | dark | 合盖 · 闭合厚度 15.5 mm |
| 10 | 46.2 – 51.2 | 闭合上盖俯视，Apple 标 | white | 平面圆角 R20 mm |
| 11 | 51.2 – 55.2 | 底面：脚垫 + 刻蚀铭牌 | grey | 底盖：脚垫 4 × Ø15 mm 距边 22 mm |
| 12 | 55.2 – 61.2 | 交互演示：持续环绕 + 缓慢推近 | dark | 拖动旋转 · 滚轮缩放 · Shift / 右键拖动平移 |
| 13 | 61.2 – 149.3 | **片尾寄语章《以假乱真》**（12 张卡 + 谢幕卡，见 `EPILOGUE.md`） | dark | 文字全文由 GLM 5.3 撰写；画面不切黑，闭合机身极暗缓慢环绕 |

---

## 2. 逐镜机位（`photo.html` 的 `VIEWS` 真实值；单位：米 / 度）

| # | 目标 | azim | elev | dist | fov | target | 运动 |
|---|---|---|---|---|---|---|---|
| 1 | hero 变体 | 26 | 12 | 0.60 | 30 | `[0, 0.045, 0]` | 从 azim 48 / elev 10 / dist 0.78 缓入 3.4 s，之后每秒 azim −1.5° |
| 2 | hero 变体 | 30 | 15 | 0.70 | 30 | `[0, 0.085, 0]` | 1.6 s 缓入，之后每秒 azim −0.7°；**上盖同时间从 0° 转到 103.5° 再回 100°**（铰链阻尼） |
| 3 | hero 变体 | 22 | 12 | 0.66 | 30 | `[0, 0.085, 0]` | 2.2 s 缓入，之后每秒 azim −0.5°、dist −0.004；屏幕亮度关键帧 12.05 s 起升 |
| 4 | kb | 0 | 86 | 0.43 | 30 | `[0, 0.012, 0.0015]` | 2.6 s 缓入，之后每秒 dist −0.010、target.x +4 mm |
| 5 | 触控板 | 0 | 52 | 0.30 | 30 | `[0, 0.012, 0.058]` | 2.2 s 缓入，之后每秒 target.z +4 mm、dist −0.003 |
| 6 | ports | 270 | 3 | 0.26 | 24 | `[0, 0.008, −0.060]` | 2.2 s 缓入，之后每秒 target.z +6 mm |
| 7 | side | 90 | 3 | 0.40 | 24 | `[0, 0.008, −0.060]` | 2.0 s 缓入，之后每秒 target.z −5 mm |
| 8 | 倒影 | 26 | 13 | 0.54 | 34 | `[0, 0.026, 0]` | 2.6 s 缓入，之后每秒 azim −3.0°、dist −0.004 |
| 9 | hero 变体 | 34 | 13 | 0.64 | 30 | `[0, 0.085, 0]` | 1.8 s 缓入；**上盖 100° → −1.6° → 0°**（合上有回弹），屏幕 41.4 s 起熄灭 |
| 10 | closedtop | 0 | 89 | 0.550 | 30 | `[0, 0.008, 0]` | 2.6 s 缓入，之后每秒 azim −1.0° |
| 11 | bottom | 0 | −88 | 0.50 | 30 | `[0, 0, 0]` | 2.4 s 缓入，之后每秒 azim +0.9° |
| 12 | hero 变体 | 44 | 21 | 0.68 | 30 | `[0, 0.085, 0]` | 1.8 s 缓入，之后每秒 azim −8.5°、dist +0.004 |
| 13 | 寄语章背景 | 20 + t×0.55 | 14 | 0.62 | 30 | `[0, 0.045, 0]` | 114 s 内极慢环绕（绝对时间驱动，换卡不跳变），画面被 scrim 压到约 24% 亮度 |

**取景坑（都踩过）**：`closedtop` 的 dist 必须 0.550（0.385 时 312.6 mm 机身被裁）；`bottom` 必须 0.50；
`ports`/`side` 的 target.z 必须 −0.060（端口整簇中心在 z≈62 mm，旧值 +0.020 会把 HDMI 切在画框外）。

---

## 3. 音效表（WebAudio 合成，相对录制起点）

| 时间 (s) | 音 | 合成方式 |
|---|---|---|
| 0.0–67.8 | **背景音乐** | 4 段和弦 pad（Am9 / Fmaj7 / Cmaj9 / G6，每段 17 s、交叉淡入、6 s 起音）+ 每 4.25 s 一颗铃音 |
| 0.0 | 房间底噪 + 低频 drone | 低通噪声 0.010 + 55 Hz 正弦 0.014 |
| 7.0 | 开盖铰链 | 带通噪声 320 → 1500 Hz，2.9 s |
| 9.9 | 盖板将到位 | 低通噪声 180 → 90 Hz |
| 10.32 | 到位闷响 | 正弦 95 → 52 Hz，0.45 s + 噪声点 |
| 12.10 | 亮屏「boong」 | 1046.5 + 1568 + 523 Hz 三partial，指数衰减 |
| 16.65 / 16.78 | 键击 ×2 | 带通噪声 2600/2200 Hz，35 ms |
| 26.60 / 31.10 | 接口轻点 | 带通噪声 1200/1100 Hz，50 ms |
| 34.5 | 倒影镜头 pad | 220 + 329.6 Hz 三角波，6 s 渐入渐出 |
| 43.30 / 43.38 | 合盖闷响 | 噪声 900→200 Hz + 正弦 78 → 40 Hz |
| 55.20 / 57.40 | UI 轻点 | 带通噪声 3000 Hz，40 ms |
| 60.5 | 结尾和弦 | 261.6 / 392 / 523.3 Hz，6 s 淡出 |

总线挂 `DynamicsCompressor`（阈值 −18 dB、ratio 6）防叠加削波，再补 2× 主增益。
成片实测：立体声 48 kHz，**峰值 0.37、RMS 0.032**（补增益前）；逐秒能量在开盖闷响（t≈10 s）、
倒影 pad（t≈40 s）、结尾和弦（t≈60 s）处有明显起伏——用 `_verify-video.html` 的 `__v.analyze()` 可复测。

---

## 4. 复现命令

```bash
cd /home/h/genshin-model-studio

# 1) 页面网格（含上盖刚体区间 lid{from,to,hingeY,hingeZ,angle}）
node scripts/max/page-mesh.mjs --lod 1.0 --open 100 --out web/draw/macbook-current.json

# 2) 键帽字标 + 屏幕贴图
.venv/bin/python scripts/max/make-kb-legends.py
.venv/bin/python scripts/max/make-screen-from-ref.py

# 3) v2 成片：离线逐帧渲染（需要 CDP 浏览器 127.0.0.1:9222 + 页面服务 localhost:8787 + ffmpeg）
#    页面渲染一帧 → JPEG → image2pipe → x264(CRF18)；音轨用 OfflineAudioContext 离线渲染
node scripts/max/demo-offline.mjs --out delivery/demo-video/macbook-demo.mp4 \
     --w 2560 --h 1440 --fps 30 --q 0.92 --rtscale 2 --crf 18 \
     --shots delivery/demo-video/verify-frames-1440p

# 3b) v1 对照（实时录制，720p）：MediaRecorder + 补容器时长 + 转 MP4
node scripts/max/demo-record.mjs --out delivery/demo-video/macbook-demo-raw.webm --codec vp8
node scripts/max/video-post.mjs delivery/demo-video/macbook-demo-raw.webm --outdir delivery/demo-video

# 4) 字幕（时间轴单一真源 = 页面里的 S，片尾改时长也不会错位）
node scripts/max/make-captions.mjs --out delivery/demo-video/captions.srt

# 5) 回放自检（浏览器解码 + 逐帧比对，证明「文件真的能播」）
cp delivery/demo-video/macbook-demo.webm web/draw/_demo.webm
node scripts/max/page-probe.mjs --url 'http://localhost:8787/draw/_verify-video.html?v=1' \
  --wait-ms 2500 --script .scratch/r7/vidplayfull.mjs
```

**手动录屏也可以**：打开 `http://localhost:8787/draw/photo.html`，键盘 `1`–`9` 切视角、`Q/W/E` 切影棚
（白/深/灰）、鼠标拖动旋转、滚轮缩放、Shift/右键平移、`H` 隐藏角标。

---

## 5. 关键实现（为什么能动起来）

- **上盖刚体**：`page-mesh.mjs` 用「同参数再建一次 0° 姿态 + 逐顶点比对」标出上盖顶点区间
  （实测 `[27997, 35653]`，8816 个动点，区间无断裂、无跨部件三角），并按部件隔离焊接。
  页面把这段顶点换算成转轴局部坐标挂进一个 Group，开合只改 `group.rotation.x`——
  **不是逐帧重建几何**（重建一次 ~400 ms，做不了 30 fps）。
- **亮屏**：屏幕材质 `emissiveIntensity` 关键帧 0 → 1.85 → 1.40（过冲一下更像真机点亮）。
- **玻璃台面**：地面材质原来不透明，把 y<0 的倒影组整个挡住（实测 refl=0 与 0.45 逐像素完全相同）；
  dark 预设改为 `groundOpacity 0.52` 后镜像才穿出来——这就是用户点名喜欢的那个效果。

---

## 6. 片尾寄语章（GLM 5.3 撰文）

全文、拆卡表、导演取舍说明见 `EPILOGUE.md`。要点：

- **一句没删**，只拆卡；「它不是在执行任务，它是在做工程」单独立卡留白。
- **不用旁白**：前 61 秒是产品演示，突然出现人声像换了支片子；文字卡 + 音乐渐弱更连贯。
- 画面**不切黑**：闭合的 MacBook 在玻璃台面上极暗地缓慢环绕（scrim 压到 24% 亮度），
  文字用左侧渐变压上去——既是视频，也不是幻灯片。
- 换卡配一声极轻的「翻页」（带通噪声 1500→900 Hz / 50 ms / 0.028）。
- 音乐：和弦循环铺满全片（每 17 s 一段、交叉淡入），最后一段收小并淡出。

## 7. 已知缺口（不藏）

- 扬声器开孔：键盘两侧掌托的细密孔阵**还没建模**，特写下会露。
- 屏幕内容：用户提供的 `亮屏桌面.png` 裁切，**不是**实时 macOS；所有视角共用同一张，保证跨视角自洽。
- 侧壁散热槽：真机有细暗线，模型未建。
- 键帽字标：2.4 mm 蚀刻字在 880 px 长边的验收图集里只占约 3 px，是盲测里最吃亏的一项。
