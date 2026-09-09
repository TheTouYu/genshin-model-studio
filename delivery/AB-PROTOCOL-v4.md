# 盲测协议 v4（**浏览器页面通道** · 预定义口径）

> 本文件在渲染前写定。与 v3 的**唯一区别（也是用户裁决的核心）**：被评刺激物不再来自
> 自建零依赖路径追踪器，而是**项目页面里 three.js 渲染出的截图**（`web/draw/photo.html`）。
> 自建渲染器保留做快速迭代，但**验收数字只认页面截图**。

## 为什么换通道

自建路径追踪器有自己的着色/AO/噪声模型，会把网格级缺陷（盖板顶角缺口、共面缝隙）糊掉；
页面通道用**同一份网格数据**（`web/draw/macbook-current.json`，由 `scripts/max/page-mesh.mjs`
从当前 dist 生成）渲染，缺陷会立刻现形——这是用户 2026-09-09 16:34 的裁决原话所指。

## 渲染通道

- 页面：`web/draw/photo.html`（同源静态页，three.js r160 CDN + PBR + 程序化影棚环境贴图
  PMREM + ACES 色调映射 + 2× 画布超采样 + 无网格/无坐标轴/无调试文字）。
- 网格：`web/draw/macbook-current.json`（引擎级 LOD 0.12，开盖 100°，银色，含今日全部几何修复）。
- 屏幕纹理：`web/draw/screen-ui.png`（程序化 macOS 桌面，由 `scripts/max/make-screen-png.mjs` 生成）。
- 截图：CDP `Page.captureScreenshot`（Edge 152，视口 1210×727，画布 1180×700），
  裁掉画布外区域后存 `delivery/macbook-page/p1..p6.png`。

## 素材（12 张 = 6 页面截图 + 6 官方参考图，同角度类别配对）

| 页面截图 | 视角 | 官方参考 |
|---|---|---|
| p1-hero | 3/4 开盖 | official-mbp14-hero.jpg |
| p2-front | 正面开盖 | apple-mbp13-press-front-official.jpg |
| p3-kb | 键盘俯视 | apple-mbp13-top-case-official.png |
| p4-ports | 左侧接口 | official-mbp14-ports-1.jpg |
| p5-screen34 | 开盖略俯 | apple-mbp14-m3-official.png |
| p6-top | 俯视 | official-mbp14-dimensions-1.jpg |

统一重编码为 PNG（≤880px 长边）→ 随机混排 `img01..img12.png` 到工作区内
`.blind-<seed>/`（子代理沙箱不共享 /tmp，故必须在工作区内），
答案 key 删除（可确定性再生）；同时把源渲染目录与复盘文档改成不透明隐藏名。

## 裁判

3 个独立子代理（无本会话上下文），指令固定（只读 `.blind-<seed>/`，逐张 read_image，
输出严格 JSON 数组）。计分 `scripts/max/ab-score.py`。

## 判定

误判率 = 判错张数 / 12；**达标线 ≥ 50%**（等于随机猜测）。任一裁判 < 50% 即未达标。
