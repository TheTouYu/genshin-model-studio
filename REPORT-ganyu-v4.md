# 甘雨·足球队服 v4 精准还原 — 交付报告

- 参考：用户提供的甘雨足球队服三视图（front/side/back，GANYU #10）。
- 目标：**直接精准还原**，装饰物数量 ≤3000；本版 **218 笔画 / 511 件**（远低于预算）。
- 完成时间：2026-09-05（本波，含工具自优化）
- 状态：通过（构建 95/95、gms.verify ok、API 200、6 视角 read_image 复核）

---

## 1. 交付物

| 文件 | 说明 |
|---|---|
| `delivery/ganyu-v4/work.json` | 作品 JSON（218 笔画 / count=60 / canvasWidthPx=496） |
| `delivery/ganyu-v4/items.json` | `/api/draw-model` 生成元件（511 项） |
| `delivery/ganyu-v4/summary.json` | `{ok:true, strokes:218, items:511, closed:55}` |
| `delivery/ganyu-v4/view-{iso,front,top,left,back,closeup}.png` | 六视角截图（隔离 Edge 实例，无共享窗口干扰） |
| `scripts/draw-ganyu-soccer-v4.js` | 模型脚本（结构件命名 + link + verify） |
| 历史版本 | id `vmtomke8p742p`（甘雨足球队服 v4 精准还原, 218 笔 / 511 件） |
| 工具自优化 | `gms.part('poly')` 世界坐标 3D 折线、`gms.part('cone')`（10009009）、`MAX_DRAW_STROKES 200→500` |

## 2. 对照参考图的还原点

| 特征 | 还原实现 |
|---|---|
| 浅蓝长发 + 长马尾 | 头发球体 + 26 束刘海 + 每侧 8 束侧发 + 马尾核心 15 节点曲线 + 10 层椭圆盘 + **70 束发丝**（poly 4-5 点，浅蓝/深蓝交替） |
| 呆毛 | 顶部 4 点细 poly |
| 暗红双角 + 浅蓝角尖 | 2×4 点 poly（暗红 #7a3140）+ 2×cone（10009009, 浅蓝尖） |
| 五官 | 蓝眼（带白色高光）+ 上睫毛 + 眉 + 鼻 + 嘴 + 耳 + 红耳穗 |
| 白色蓝纹球衣 | 白躯干 + 蓝领/蓝下摆 + 前后斜纹 + 侧边蓝拼条 + 前胸 #10 + 背后块状 GANYU 字母 + 背后 #10 |
| 白色蓝纹短裤 | 白短裤 + 蓝腰头 + 蓝侧条 + 前侧 #10 |
| 白袜 + 蓝条纹 + 鸢尾纹 | 白袜杆 + 袜口双蓝条 + 三蓝束鸢尾纹（rod×3 + disc） |
| 蓝白足球鞋 | 白鞋面 + 深蓝鞋底 + 蓝鞋头 + 蓝鞋带 + 黑鞋钉 |
| 黑手套 | 深色手套盘 + 蓝袖口 |

## 3. 工具/API 自优化（本轮）

- `gms.part('poly', {points:[[x,y,z],...], size, color})`：**世界坐标 3D 折线**；有 z 时不重采样，
  N 点 → N-1 根杆。发丝/马尾/曲线都靠它把「密度」压进单笔画（218 笔就能出 511 件）。
- `gms.part('cone', {x,y,z,r,h,axis,color})`：基础元件 10009009 圆锥（未校准预览为 ConeGeometry），用于角尖/收尖。
- `MAX_DRAW_STROKES` 200→500：高密度毛发/细节建模需要更多笔画。
- 新增 cone/poly 全套链路（types/generate/web-shared/index.html + 单测 95/95）。

## 4. 验证

- 状态栏：`✓ 218 笔 · 55 笔封闭 · 511 个元件`
- `gms.verify()`：`ok:true`，18 条 link 全 contact，`floating:[]`，`collides:[]`
- API（work.json 离线 POST）：`httpStatus=200`、`itemCount=511`、
  `10009008×507 + 10009002×2（头+发） + 10009009×2（角尖）`
- 六视角截图逐张 `read_image` 复核：
  - 正面：刘海/蓝瞳/球衣 #10/斜纹/腰条/短裤 #10/袜纹/白鞋
  - 背面：长马尾垂至大腿中段、GANYU 块状字母（部分被马尾遮挡）、背后 #10
  - 侧面：马尾体积 + 角 + 侧发轮廓
  - 顶视：发顶/角/马尾截面圆
  - 近景：球衣斜纹、号码、袜纹、鞋钉清晰
- 说明：本工具为**基础元件拼装**（无三角面片/布尔），外观为高精度风格化近似；
  毛发与衣物图案用「多段杆 + 小盘」逼近，无法达到游戏级 mesh 曲面细节。

## 5. 复现

```bash
npm run build --silent && node --test dist/tests/*.test.js
export BU_CDP_WS=$(curl -s http://127.0.0.1:9224/json/version | python3 -c "import json,sys; print(json.load(sys.stdin)['webSocketDebuggerUrl'])")
scripts/run-gms-model.sh scripts/draw-ganyu-soccer-v4.js delivery/ganyu-v4 http://localhost:8787/
```
