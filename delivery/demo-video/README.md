# 演示视频交付包

`delivery/demo-video/`

| 文件 | 内容 |
|---|---|
| **`macbook-demo.mp4`** | **成片 v2（推荐）**：2 分 29 秒 / **2560×1440** / H.264(CRF18)+AAC 48kHz / 77.2 MB / faststart。微信、PPT、剪辑软件直接能用 |
| `macbook-demo-720p.mp4` | v1 成片（1280×720 / 14.7 MB）——实时录制管线，留作对照 |
| `macbook-demo-720p.webm` | v1 同内容 WebM/VP8+Opus（浏览器原生播放） |
| `macbook-demo-raw.webm` | v1 录制原始输出（未补 Duration） |
| `verify-frames-1440p/t*.jpg` | v2 逐帧存证（19 张 2560×1440 JPEG q92，含片尾各卡与谢幕卡；仓库内为 JPEG 以控体积，`--shots` 重跑会输出 PNG） |
| `keyframes/t*.jpg` | v1 录制过程中的 23 张合成关键帧（JPEG q92） |
| `SCRIPT.md` | **分镜脚本**：13 镜的机位参数、时长、字幕、音效表、复现命令、实现说明 |
| `captions.srt` | 字幕文件（UTF-8，可直接拖进剪辑软件） |
| `EPILOGUE.md` | **片尾寄语章《以假乱真》全文**（GLM 5.3 撰文）+ 拆卡表 + 导演取舍说明 |
| `SELF-INTRO.md` | 自我介绍文案（结尾卡 / 口播 / 署名 三版）+ 素材授权说明 |
| `verify-frames/` | ffmpeg 逐帧抽帧存证（22 张，含寄语章各卡） |
| `PROMPTS.md` | 若要做 AI 包装镜头用的提示词（含"不要用 AI 生成冒充产品镜头"的红线） |

## 怎么看

浏览器直接打开（Chrome / Edge 拖进去即可），或用支持 WebM 的播放器（VLC 等）。
文件已写入 Duration，进度条可拖。

## 怎么复现

```bash
cd /home/h/genshin-model-studio
# v2（离线逐帧，推荐）：页面渲染一帧 → JPEG → ffmpeg image2pipe → x264 + 离线音轨
node scripts/max/demo-offline.mjs --out delivery/demo-video/macbook-demo.mp4 \
     --w 2560 --h 1440 --fps 30 --q 0.92 --rtscale 2 --crf 18 \
     --shots delivery/demo-video/verify-frames-1440p
# 字幕（时间轴单一真源在页面里，改时长不会字幕错位）
node scripts/max/make-captions.mjs --out delivery/demo-video/captions.srt
# v1（实时录制，留作对照）：MediaRecorder + 补容器时长
node scripts/max/demo-record.mjs --out delivery/demo-video/macbook-demo-raw.webm --codec vp8
node scripts/max/video-post.mjs delivery/demo-video/macbook-demo-raw.webm --outdir delivery/demo-video
```

依赖：CDP 浏览器在线（`127.0.0.1:9222`）+ 页面服务 `localhost:8787` + ffmpeg。全流程零第三方素材。

## v2 为什么放弃实时录制（用户提示「视频不必实时」）

实时 `captureStream` 的帧率天花板与**输出像素数**成正比（实测 ~15 ms/MP，与编码器无关）：

| 输出 | 帧率 |
|---|---|
| 1280×720 | 30 fps（正好卡在 captureStream(30) 上限） |
| 1600×900 | 42–49 fps |
| 1920×1080 | 29–33 fps |
| 2560×1440 | **16–20 fps** |

离线逐帧把帧率与机器性能彻底解耦：v2 是恒定 30 fps、1440p、内部 2× 超采样（5120×2880 渲染再降采样），
渲染 4479 帧耗时 20.4 分钟（3.66 帧/秒，瓶颈是浏览器里的 JPEG 编码，GPU 只要 ~5 ms/帧）。

## 这条片子的核心事实

- 画面是**浏览器 WebGL 画布的真实渲染**（v2 为逐帧 `toDataURL` 离线管线，v1 为 `captureStream` 实时录制），不是 AI 生成视频，也不是离线光追出图。
- **音轨是离线渲染的**（OfflineAudioContext → 48 kHz 立体声 WAV → AAC），与实时性能无关，没有 glitch。
- **开盖/合盖是真的几何动画**：上盖顶点区间由 `page-mesh.mjs` 标定（`[27997, 35653]`），页面绕转轴旋转刚体，不是逐帧重建。
- **亮屏**是屏幕材质 `emissiveIntensity` 的关键帧（0 → 1.85 → 1.40）。
- **倒影**是 y 镜像组 + 半透明玻璃台面（dark 预设 `groundOpacity 0.52`）；地面不透明时倒影完全不可见（实测逐像素 diff = 0）。
- **音乐与音效全部现场合成**（WebAudio），没有第三方素材。
- **片尾寄语章**（第 61.2–149.3 s）文字由 GLM 5.3 撰写，本片导演处理为 12 张卡 + 1 张谢幕卡；
  画面不切黑，闭合机身极暗环绕作为底。v2 按用户反馈把片尾从 114 s 收到 88.1 s（-23%），
  末尾新增「感谢观看」谢幕卡。

## 已知缺口（不藏）

扬声器开孔未建模；屏幕内容是用户提供的桌面截图（跨视角共用同一张）；侧壁散热槽未建；
键帽字标 2.4 mm 在 880 px 长边下只占约 3 px。
