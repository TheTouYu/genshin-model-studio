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

## 3. 量化验收（2026-09-06 已校准，诚实数值）
- `scripts/compare-ganyu.py` 方法：WebGL 全屏截图（`setGridVisible(false)` + `#000000` 背景，去掉网格/坐标轴/边沿噪点）→ 剪影 bbox 裁剪 → 统一高度 640、保持宽高比、中心对齐 → IoU；宽度曲线用「宽度/高度」比值逐高度对比。
- **实测（v10）**：**IoU = 0.5775**（目标 ≥0.70，未达标）；宽度平均误差 90.9%（含姿态差异行）。
  - 达标行（误差 ≤15%）：腿/袜 h0.07–0.23（3.1–13.8%）、膝/大腿 h0.33–0.42（1.8–6.8%）、髋/腰 h0.62–0.78（0.8–10.6%）；
  - 差异行：h0.47–0.57（参考双臂展开 ~0.33 vs 模型 ~0.24–0.26，误差 17–53%）；h0.88–0.93（模型发顶剪影黑，参差大）。
- mtime 说明：以上数值写入本报告留档；下一迭代修正 ① 双臂外摆姿态 ② 发顶法线/材质可见性 ③ 发丝加密后复测。

- 历史 `vmtop9amppwgh`；delivery_check PASS。

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
