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

