# v8 出图报告（真实浏览器页面渲染 · 当前几何）

- 出图时间：2026-09-10 07:09–07:10（本地）
- 页面通道：`http://localhost:8787/draw/photo.html` + CDP Edge 152 @ `127.0.0.1:9222`
- 渲染工具：`scripts/max/render-v8.sh`（条件与 v7 逐项一致：配对参考图 / 画布尺寸 / 背景，只换几何与贴图）
- 网格：`web/draw/macbook-current.json`（开盖 100°）73,855 tris / 46,207 verts；`macbook-closed.json`（闭合）73,813 tris / 46,171 verts；14 材质
- 回归：`npm test` **252/252**

## 1. 六张图（各自独立画布，与 v7 协议一致）

| # | 文件 | 画布 | 背景 | 配对参考图 |
|---|---|---|---|---|
| 1 | `delivery/macbook-v8w/p1-closedtop.png` | 900×724 | 白 | `/mnt/e/模型/笔记本/俯视图.png` |
| 2 | `delivery/macbook-v8w/p1-screenfront.png` | 1000×627 | 白 | `/mnt/e/模型/笔记本/正视图.png` |
| 3 | `delivery/macbook-v8w/p1-kb.png` | 880×680 | 白 | `/mnt/e/模型/笔记本/键盘和触控板.png` |
| 4 | `delivery/macbook-v8d/p1-ports.png` | 1180×395 | 暗 | `reference/macbook/img/official-mbp14-ports-1.jpg` |
| 5 | `delivery/macbook-v8d/p1-hero.png` | 860×520 | 暗 | `reference/macbook/img/official-mbp14-hero.jpg` |
| 6 | `delivery/macbook-v8g/p1-bottom.png` | 880×600 | 灰 | `reference/macbook/img/apple-mbp13-bottom-case-official.jpg` |

并排比对图：`delivery/macbook-v8/compare-v8.png`（每行：我方渲染 ← → 配对参考图），同步一份到 `web/draw/compare-v8.png`。

## 2. 本轮修掉的两个真 bug

### 2.1 上盖姿态回归（v8 首炉 6 张全部作废）
`web/draw/photo.html` 把上盖拆进 `lidGroup` 时，顶点坐标已按 `R(-angle0)` 反解到转轴局部系，但**从未把 `lidGroup.rotation.x` 还原成 `-angle0`**（`web/draw/photo.html:438` 附近）。
- 后果：任何 `lid.angle ≠ 0` 的网格（= 开盖网格，angle0 = 100）静态出图时被静默旋转成**合盖**——`kb` 视角拍到的是上盖顶面（Apple 标），`hero/screenfront` 拍到的是几乎合上的机器。
- 为什么之前没发现：演示视频每帧都调 `__photo.setLid()` 覆写，所以 demo 正常；`page-shots.mjs` 从不调 → 静态出图全错。
- 修法：建组后补 `lidGroup.rotation.x = -lidAngle0 * Math.PI / 180`。
- 防回归：`scripts/max/page-shots.mjs` 每张图写 `lid: {angle0, rot, want, ok}`，不符即打印 `[LID-MISMATCH]`（本轮 6 张全 ok）。

### 2.2 键帽圆角只有 4 段（读作八边形/方体）
`src/model/macbook/geometry.ts:139` 键帽顶面轮廓 `roundedRectPath(w, d, rr, ksc(4, 1))` → lod=1.0 时每角仅 4 段（90°/4 = 22.5° 折角，弦长 0.98mm），880px 验收图上键帽是八边形，与裁判多次点名的「方体/方块」一致。
- 修法：`ksc(12, 4)` → 7.5°/段、弦长 0.39mm。三角数 58,879 → 73,855（+25%），页面帧时 1.4–8.8ms 无影响。
- 线框复核（`--wire 1` 新增开关）：空格键顶面轮廓为正常圆角矩形，端部无梯形（此前阴影读作「斜切端」是碟面高光的等值线，非几何）。

## 3. 自检读数（全部来自页面，非估算）

- 分支自检：`kbTop 19760`（键帽顶面顶点，字标分支生效）、`hasScreenTex true`、`screenUV uSpan 0.3024 / vSpan 0.1964`（= 屏幕活动区 302.4×196.4mm ✓）。
- 跨视角屏幕一致性（`scripts/max/check-screen.py`，阈值 corr≥0.55）：hero **+0.921** / kb **+0.875** / screenfront **+0.937** → 「所有视角屏幕内容 = 同一张贴图 ✓」。
- 材质 14 组（含本轮新增 `M.WELL` 键槽、`M.ETCH` 底盖刻蚀）。

## 4. 与 v7 的差异（几何侧，均已进入本轮图）

| 项 | v7 图里的状态 | v8 图里的状态 |
|---|---|---|
| 端口 z 朝向 / 高度 | 旧（跨 126mm、centerY 4.4mm） | 已标定（跨 46mm、centerY 7.7mm = 分缝下 3.95mm） |
| 键槽底色 | 与键帽同色（亮灰） | `M.WELL`（比键帽更黑） |
| 数字行上档符号 | `%^&*` 被清理规则误删 | 已恢复 |
| 触控板缝 | 与台面共面 → 断续虚线 | 抬到 +0.25mm |
| 苹果叶形 | 抽稀过度（尖窄） | `maxSeg 0.30mm/30°`（176 点） |
| 底盖刻蚀 | 无 | `M.ETCH` 三行文字块 + 脚垫微穹顶 |
| 键帽圆角 | 4 段/角（八边形） | 12 段/角（圆角） |

## 5. 已知缺陷（尚未修，按验收分辨率 880px 计的可见度）

1. **`control` / `command` 字标缺尾字母**（渲染读作 `contro` / `comman`）。根因在图集本身：`reference/macbook/legend-atlas.json` 的 `4:control` 矩形宽 192px（=13.7mm）、`4:command` 258px，而键宽 17.25mm（=241px）——提取窗口比键窄，字母被裁。修法二选一：重新提取这两个（及同类）矩形，或用字体绘制这两个词。
2. **触控板暗缝左右/上下不对称**：实测左/上暗核亮度 28/26，右/下 165/150（同一 0.7mm 平带）。暗缝是与触控板同高（+0.25mm）的浮置平带，可见性依赖亚像素覆盖；建议改成**有深度的凹槽**（向下扫 0.35mm）而不是靠材质颜色。
3. **底盖刻蚀读作虚线块**：`M.ETCH` 的 34 段细横条在 880px 下是「模糊虚线段」，不是「文字质感」。
4. **ports 视角背景与参考不一致**：我方暗底，`official-mbp14-ports-1.jpg` 是亮底；v7 协议沿用未改。
5. 屏幕贴图来源为 `亮屏桌面.png`（用户素材），跨视角一致 ✓，但贴图本身带压缩色阶。

## 6. 下一步（待用户定口径）

- 口径 A：主口径改为**单侧误判率**（我方图被判 photo 的比例 ≥50%），参考图被误判只记录不计分；理由：Apple 官方图经 EXIF 核查带 `Software: Adobe Photoshop 24.5`、无相机标签，作「photo 真值」本身存疑。
- 口径 B：沿用协议 v7 的**全体误判率 ≥50%**（12 图里裁判判对 ≤6 张）。
- 复测前置：先修 §5 的 1–2（字标与暗缝），再跑 3 位独立裁判（协议 v8，画布/背景沿用 v7 分布）。
