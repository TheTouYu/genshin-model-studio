# 演示视频交付包

`delivery/demo-video/`

| 文件 | 内容 |
|---|---|
| **`macbook-demo.webm`** | **成片**：67.8 s / 1280×720 / VP8+Opus / 22.6 MB。开盖 → 亮屏 → 细节巡游 → 倒影 → 合盖 → 交互 → 自我介绍 |
| `macbook-demo-raw.webm` | 录制原始输出（未补 Duration） |
| `keyframes/t*.png` | 录制过程中的 13 张合成关键帧（存证：字幕/水印/章节卡都在） |
| `SCRIPT.md` | **分镜脚本**：13 镜的机位参数、时长、字幕、音效表、复现命令、实现说明 |
| `captions.srt` | 字幕文件（UTF-8，可直接拖进剪辑软件） |
| `SELF-INTRO.md` | 自我介绍文案（结尾卡 / 口播 / 署名 三版）+ 素材授权说明 |
| `PROMPTS.md` | 若要做 AI 包装镜头用的提示词（含"不要用 AI 生成冒充产品镜头"的红线） |

## 怎么看

浏览器直接打开（Chrome / Edge 拖进去即可），或用支持 WebM 的播放器（VLC 等）。
文件已写入 Duration，进度条可拖。

## 怎么复现

```bash
cd /home/h/genshin-model-studio
node scripts/max/demo-record.mjs --out delivery/demo-video/macbook-demo-raw.webm --codec vp8
node scripts/max/webm-fix-duration.mjs delivery/demo-video/macbook-demo-raw.webm \
                                        delivery/demo-video/macbook-demo.webm
```

依赖：CDP 浏览器在线（`127.0.0.1:9222`）+ 页面服务 `localhost:8787`。全流程零第三方依赖、零素材。

## 这条片子的核心事实

- 画面是**浏览器 WebGL 画布的真实录制**（`canvas.captureStream` → MediaRecorder），不是 AI 生成视频，也不是离线光追出图。
- **开盖/合盖是真的几何动画**：上盖顶点区间由 `page-mesh.mjs` 标定（`[27997, 35653]`），页面绕转轴旋转刚体，不是逐帧重建。
- **亮屏**是屏幕材质 `emissiveIntensity` 的关键帧（0 → 1.85 → 1.40）。
- **倒影**是 y 镜像组 + 半透明玻璃台面（dark 预设 `groundOpacity 0.52`）；地面不透明时倒影完全不可见（实测逐像素 diff = 0）。
- **音乐与音效全部现场合成**（WebAudio），没有第三方素材。

## 已知缺口（不藏）

扬声器开孔未建模；屏幕内容是用户提供的桌面截图（跨视角共用同一张）；侧壁散热槽未建；
键帽字标 2.4 mm 在 880 px 长边下只占约 3 px。
