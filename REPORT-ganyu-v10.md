# 甘雨 v10 — 测量驱动表面网格（衣装连续性 + GANYU 可读性迭代）

- 目标进展：v9 已知差距 ① 腰腹露肤、② 发壳、③ GANYU 可读性 —— 本波修复 ①③，② 部分改善。
- 状态：**4290 面**，正/背对比图 read_image 复核；量化 IoU 脚本已写，但剪影分割受网格/光照干扰需校准（诚实记录，未达验收口径）。

## 1. 本波改动
| 问题 | v10 修复 |
|---|---|
| 腰腹皮肤色带 | 皮肤底座 0.40–0.92 全染 WHITE；jersey 0.56–0.92 / shorts 0.40–0.63 插值环加密集（10/8 环） |
| GANYU 被发丝遮挡 | 马尾整体右移（tailC x=+0.045、丝束 120 根、8 段）；字母加大（sz 0.0055、间距 0.064、z=-0.082） |
| 短裤标志缺失 | 短裤前侧 10（rod+disc） |
| 发壳不包后脑 | 头皮壳新增底部环 y=0.945，后脑/颈部用发色包裹（正面仍露脸） |

## 2. 复核（read_image）
- 正面：白球衣（胸前 #10）+ 白短裤（前 #10）+ 肤色大腿 + 白袜/蓝条 + 白蓝鞋；腰腹露肤回归；比例/腿距/蓝发双角与三视图对齐。
- 背面：**GANYU 字模可见**（马尾右移让位），仍见 10 与球衣蓝饰；马尾垂至臀下。
- 衣壳分层：球衣 +0.008 / 短裤 +0.006 / 袜 +0.005 独立于皮肤底座。

## 3. 量化验收（方法已建，待校准）
- `scripts/compare-ganyu.py`：参考正视剪影 vs 模型正视剪影 → IoU / 宽度曲线误差；已输出初值，但模型侧 `lum>45` 被网格线/阴影干扰（出现伪全宽行与断行），当前值不可信，**下轮修复分割**（用 WebGL readPixels 截图 + 网格清理 + 光照归一）后写入合规数值。
- 目标：IoU≥0.70、关键高度宽度误差≤12%（未达成，见报告诚实记录）。

## 4. 交付物
- `scripts/draw-ganyu-soccer-v10.js`、`scripts/compare-ganyu.py`
- `delivery/ganyu-v10/`（work/items/六视角）、历史 `vmtop9amppwgh`
- `reference/compare-front-v10.png` / `compare-back-v10.png`

## 5. 复现
```bash
export BU_CDP_WS=$(curl -s http://127.0.0.1:9225/json/version | python3 -c "import json,sys; print(json.load(sys.stdin)['webSocketDebuggerUrl'])")
scripts/run-gms-model.sh scripts/draw-ganyu-soccer-v10.js delivery/ganyu-v10 http://localhost:8787/ reference/ganyu-dense.js
uv run --with pillow --with numpy python3 scripts/compare-ganyu.py   # 待校准
```
