# 足球运动员模型 — 交付报告

- 任务：`/model-build-test 拼一个精美的足球运动员模型，保证交付质量，自己再浏览器验证`
- 模型工作室：`genshin-model-studio`（画线建模 / gms API / 浏览器 CDP）
- 完成时间：2026-09-05
- 状态：**通过（构建 ✓ · 单测 ✓ · 浏览器生成 ✓ · gms.verify ✓ · API 核验 ✓ · 五视角视觉复核 ✓）**

---

## 1. 交付物清单

| 文件 | 说明 |
|---|---|
| `delivery/soccer-player/work.json` | 作品 JSON（23 笔笔画，含 sphere 基础元件字段，可 `gms.import` 回灌） |
| `delivery/soccer-player/items.json` | `/api/draw-model` 生成元件（54 项，拍平后 structure items） |
| `delivery/soccer-player/summary.json` | 摘要：`{ok:true, strokes:23, items:54, closed:15}` |
| `delivery/soccer-player/api-inspect.json` | API 契约核验输出（200 / source / perStroke 映射） |
| `delivery/soccer-player/view-{iso,front,top,left,closeup}.png` | 五视角渲染截图（浏览器 readPixels 实拍） |
| `scripts/draw-soccer-player.js` | 模型组件脚本（交付物源码：21 命名组件 + 23 条 link + verify 硬门禁） |
| 历史版本 | `POST /api/history/save` → id `vmtoke3crhpnh`（name=足球运动员, 23 笔 / 54 元件） |

---

## 2. 模型构成（底层基础元件拼装）

世界坐标系：x 左右、y 高度、z 前后（米）。共 **23 笔笔画 → 54 个元件**：

| 子模型 | 元件 | 实现 |
|---|---|---|
| 草皮 | 1 平板 | `10009001` 长方体 0.86×0.52×0.004 |
| 球鞋 ×2 | 2 椭圆柱 | `10009008` 椭圆盘（水平、带 Y 旋转） |
| 小腿袜 ×2 | 2 杆 | `10009008` 圆柱杆 |
| 大腿 ×2 | 2 杆 | `10009008` 圆柱杆 |
| 短裤 | 1 椭圆柱 | `10009008` |
| 球衣躯干 | 1 椭圆柱 | `10009008`（深红） |
| 球衣徽章 | 1 圆盘 | `10009008`（白） |
| 上臂/前臂 ×4 | 4 杆 | `10009008` 圆柱杆（袖红 + 肤色） |
| 头 / 头发 | 2 球体 | `10009002`（**新增基础元件管线**，r=0.085/0.088） |
| 眼 ×2 / 嘴 | 3 圆盘 | `10009008`（贴在头前脸） |
| 足球 | 1 球体 | `10009002`（r=0.09） |
| 足球环线 | 32 小杆串联 | `10009008` 细杆（seg=32 深色圈线） |
| 五边形块 ×2 | 2 圆盘 | `10009008`（正面 + 右侧黑块） |

---

## 3. 基础元件扩展（本轮补充的 API）

原画线管线只产出圆柱/长方体/开口薄壁圆柱，无法直接拼**球体**（头/足球）。补充了底层基础元件覆盖，仍走同一笔画管线：

- `src/draw/types.ts`：`Stroke.resourceId?` + `SPHERE_RESOURCE_ID = 10009002`
- `src/draw/generate.ts`：`solidColumn` 识别 `resourceId=10009002` → 输出球形元件（scale=[D,D,D]，圆心=笔画中心）
- `src/web-shared.ts`：`parseDrawModelRequest` 校验并透传 `resourceId`
- `web/index.html`：`gms.part('sphere', {name,x,y,z,r,color})` 新组件类型 + `opts.resourceId` + 作品持久化（v3.5）
- `tests/draw.test.ts`：新增球体生成/解析测试（资源 ID、等比 scale、矩形拒绝、非法 ID 拒绝）

球体/圆柱/长方体等基础元件统一由「画线 → 拟合 → 元件」管线产出，浏览器的 `10009002` 原本就有 Three.js 球体几何映射（无预览改动）。

---

## 4. 自动化测试与构建

```text
npm run build --silent        → exit 0（无错误）
node --test dist/tests/*.test.js → ℹ tests 94 · ℹ pass 94 · ℹ fail 0
web/index.html 内联 JS 语法检查  → script[0] OK / script[1] OK / SYNTAX_OK
web/ ↔ public/ 哈希一致         → 2+2 相同哈希
```

---

## 5. 浏览器数据核验（四层）

**层 1 状态栏：**
```text
✓ 23 笔 · 15 笔封闭 · 54 个元件
```

**层 2 作品数据：** `gms.export()` → `version:3`、`shape:cylinder`、`mode:extrude`、23 笔画；3 笔附 `resourceId:10009002`（头/头发/足球，各 33 点圆轮廓）。

**层 3 API 契约（`scripts/inspect-draw-model.sh`）：**
```text
source       = POST /api/draw-model from window.gms.export()
httpStatus   = 200
strokeCount  = 23
itemCount    = 54
perStroke    = 每笔 1~32 项，顺序与 strokeItemCounts 一一对应
resourceId   = 10009002 ×3 / 10009008 ×50 / 10009001 ×1
```

**层 4 物理校验（`gms.verify()`）：**
```text
{ ok: true, floating: [], collides: [] }
links = 23 条，全部 contact:true（典型间隙：pitch-ball 0、boot-ball -0.043、
        head-hair -0.158、ball-ballRing -0.003；负值=实体相交=视觉贴合）
```

---

## 6. 视觉复核（5 张截图逐张 read_image 人工/视觉模型检查）

| 视角 | 结论 |
|---|---|
| `view-iso.png` | 整体结构完整：棕色头发、肤色脸+眼嘴、红色球衣+白徽、深蓝短裤、白袜、黑靴、白球+黑块；球贴右脚，草皮承托；无悬空/穿模可见 |
| `view-front.png` | 正面比例协调，五官可见，球衣徽章在左胸，球与右脚相邻；手臂袖红+肤色前臂层次清楚 |
| `view-top.png` | 俯视轮廓干净：头发圆形、肩臂对称、短裤/足球位置正确，无散件 |
| `view-left.png` | 侧面头发包裹头部后侧、正面脸可见；躯干/腿部连成一体；球在右脚前方不穿模 |
| `view-closeup.png` | 近景：球衣/短裤接缝贴合，四肢关节（肩/肘/膝/踝）均为连续圆柱，足球环线与黑块清晰 |

**审美结论**：风格化的「红白黑 + 肤色 + 绿草」配色明快，球体头部/头发/足球让模型明显比纯柱体版本更精致；比例接近矮身卡通球员，五视角无断裂、无漂浮、无可见缝隙缺陷。

**说明**：截图中的深色网格与黄/绿细线是预览器自带的 GridHelper / AxesHelper（世界坐标辅助线），不是模型元件（items.json 中无对应项）。

---

## 7. 复现步骤

```bash
cd /home/h/genshin-model-studio
npm run build --silent && node --test dist/tests/*.test.js
# 服务与 Edge（CDP 9222）就绪后：
export BU_CDP_WS=$(curl -s http://127.0.0.1:9222/json/version | python3 -c "import json,sys; print(json.load(sys.stdin)['webSocketDebuggerUrl'])")
scripts/run-gms-model.sh scripts/draw-soccer-player.js delivery/soccer-player http://localhost:8787/
scripts/inspect-draw-model.sh http://localhost:8787/ > /tmp/soccer-player-api.json
```

---

## 8. 修复：刷新后「身体解散」bug（v2）

**现象**：主页面生成/预览正常，但刷新页面（或独立预览 `preview-demo.html`）后，头/躯干/四肢/球被拉开成散件（body disassembly）。

**根因**：模型脚本里切换杆形状（`shape` 下拉 `change`）走 `onOptionChange` 重建 `state.options` 时**丢失了 `canvasWidthPx`**（画布宽标定）。此后 `gms.part` 以“不断漂移的 bbox 中心/底”为原点写笔画像素坐标，与服务器用固定画布原点生成时不一致；刷新后 `applyWork` 又会把缺失的 `canvasWidthPx` 补成当前画布宽，使同一批像素坐标被服务器按**固定原点**解释 → 部件整体散架。

**修复**（`web/index.html` `onOptionChange`）：
```js
state.options = { mode, shape, size, count, heightMeters,
                  canvasHeightPx: drawCanvas.clientHeight || 462,
                  canvasWidthPx: drawCanvas.clientWidth || 640 }
```
即任何选项变更都保留 `canvasWidthPx`，保证「写笔画像素坐标」与「服务器生成世界坐标」始终同一原点。
**同族加固**：`gms.part` 开头增加标定自愈——若 `canvasWidthPx/canvasHeightPx` 缺失，先补当前画布尺寸再写笔画，不再允许退回漂移 bbox 原点。

**修复后验证（刷新 + 独立预览）**：
- `localStorage` 重新保存的 `work.json.options` 含 `canvasWidthPx=575`，与交付 `work.json` 逐字段一致（`WORK_EQUAL: true`）
- 刷新后 `/api/draw-model(items)` 与交付 `items.json` 完全一致（54 项逐位相等）
- 主页面刷新后截图 `delivery/soccer-player/page-smoke.png`：球员完整站立
- 独立预览页 `preview-demo.html` 截图 `delivery/soccer-player/after-refresh-fixed-demo.png`：头/躯干/四肢/球全部连接，不再解散
- 交付截图更新为修复后版本（`view-*.png` 重新生成）

---

## 9. 附录：UI 新增能力与真人操作验证证据（2026-09-05 · 二十一期）

**目标**：`window.gms.*` 程序化 API 能做的（本波足球运动员用到的）全部补齐为网页真人
（鼠标/键盘、不写 JS）可操作的入口，保持 API ↔ UI 双向一致；既有 API 行为不变。

### 9.1 新增/扩展 UI

**笔画弹层（#colorPopover）**：
- 「元件类型」下拉：默认圆柱/长方体、**球体 10009002**（选球体强制 solid，自动按轮廓直径填
  `height=2r`、按圆心高填 `lift`，轮廓需圆/椭圆——矩形被后端中文拒绝；预览即 10009002 几何）
- 「粗细 size（米）」：写 `stroke.size`（足球环线 0.006 vs 全局 0.03）
- 「抬升 lift（米，≥0，仅柱体）」：写 `stroke.lift`
- 「3D 变换」：z 偏移 → `stroke.transform.position[2]`；旋转 α/β/γ（度）→
  `stroke.transform.rotation`；保留旋转副本 position 的 x/y，避免与 gms.rotate 副本逻辑双重生效

**「组件/连接」面板（画布区左栏，等价方法论 API）**：
- 选中笔画 → 命名：按轮廓自动识别 `disc`（圆 solid）/`el-disc`（椭圆 solid）/`plate`（矩形 solid）/
  `rod`（开放线）/`ring`（闭合圆默认杆）/`sphere`（resourceId 球体），画布像素 + 米制标定反推
  gmsPartRegister 的 (type, spec)
- 两个命名组件 → 声明连接（`gms.link`，可选 support: a/b）；查询接触（`gms.touches`）；
  查锚点（`gms.point`，center/top/bottom/front/back/end1/end2/mid/left/right）
- 「一键总检」→ 页面显示 `gms.verify()` 的 `{ok, links, floating, collides}`（显示未接触 badLinks）
- 命名/连接以 localStorage 可选侧边字段 `components` / `links` 持久化（不污染 strokes 语义字段），
  刷新后自动重建注册表；删除/撤销/清空同步清理

### 9.2 真人操作验证（仅页面 UI + PointerEvent，无任何 gms.* 命令）

脚本：`scripts/verify-ui-soccer-player.py`（`browser-harness < scripts/verify-ui-soccer-player.py`）。
输入为 `delivery/soccer-player/work.json` 的坐标/参数，模拟真人按图操作。

| 证据 | 结果 |
|---|---|
| 状态栏 | `✓ 23 笔 · 15 笔封闭 · 54 个元件` |
| 作品数据 | `delivery/ui-soccer/ui-work.json`：v3、23 笔、options={extrude, cylinder, 0.03, count 10, 460px=1m, 575px 固定原点} |
| 语义对照 | 与 `scripts/draw-soccer-player.js` 产物 `delivery/soccer-player/work.json` 的 render/height/axis/size/lift/transform/resourceId **逐字段相等（0 mismatch）**，球体×3、size 字段×9、lift×14、transform×20 |
| API 契约 | 直接 `POST /api/draw-model`（读 ui-work.json，不调用 gms export）：httpStatus=200；itemCount=54；resourceIds = 10009002×3 / 10009008×50 / 10009001×1；strokeItemCounts 与脚本一致 |
| 一键总检 | `gms.verify()`（经面板按钮）：`✓ 24 条连接全接触 · 无悬空 · 无重叠`；floating=[]、collides=[]；ball-ballRing gap=-0.003 与脚本一致 |
| 刷新稳定性 | 主页面 reload 后仍 `✓ 23 笔 · 15 笔封闭 · 54 个元件`；独立预览 `preview-demo.html` 显示 `✓ 已加载当前作品：23 笔笔画 · 54 个元件`，无解散 |
| 截图复核 | `delivery/ui-soccer/{main-page,view-iso,view-front,view-left,preview-demo}.png`，read_image 逐张复核：球员完整（头/头发/五官、红衣白徽、蓝短裤、白袜、黑靴、足球+环线/黑块）、球体贴合右脚、草皮承托、无悬空/穿模/解散 |

### 9.3 环境坑（已记入技能 §5 坑 #18-20）

- Edge 152 CDP：`mousePressed` 后 `mouseMoved` 事件已派发但 ack 永不返回 → 拖画超时；
  验证脚本改用 `PointerEvent` 合成（真实 UI 事件流），未调用任何 gms API。
- 主页面窄视口（<900px）画布变 769×320，脚本标定是 575×460 → 验证前用
  `Emulation.setDeviceMetricsOverride(width=1400, height=900)` 固定画布。
- `openPreview` 弹窗可能被拦截时，用 `new_tab('/draw/preview-demo.html')` 验证同一 localStorage。

### 9.4 自动化与同步

- `npm run build --silent`：exit 0
- `node --test dist/tests/*.test.js`：94/94 pass（本主题基线；工作区另含并行会话 cone 测试时为 95/95，均全绿）
- `web/index.html` 内联 JS `node --check`：script[0]/script[1] 均 OK
- `web/index.html` ↔ `public/index.html`、`web/draw/preview.js` ↔ `public/draw/preview.js`：哈希一致
- 本主题未改 `window.gms.*` 签名/行为，作品 JSON 仍 v3；新增 `components`/`links` 为可选侧边字段，旧作品兼容。
- **提交说明（用户 2026-09-06 确认）**：按用户决定，本次提交连同并行会话遗留的 `cone 10009009`
  基础元件改动（`src/draw/generate.ts`、`src/draw/types.ts`、`src/web-shared.ts` 白名单扩展、
  `tests/draw.test.ts` 及 `web/index.html` 中的圆锥 UI/预览）一并纳入，保证客户端/服务端一致。

