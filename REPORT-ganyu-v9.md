# 甘雨 v9 — 测量驱动高密度表面网格（i2 迭代报告）

- 目标（本波）：测量数据直接驱动 + 高密度面 + 参考要点（GANYU 10 / 胸前 10 / 鸢尾纹 / 衣壳分层）。
- 状态：框架与测量闭环稳定，**3753 面**；已知 3 处差距进入下一迭代。

## 1. 交付物
| 文件 | 说明 |
|---|---|
| `scripts/extract-ganyu-profile.py` | 测量管线（三视图切割/逐行剪影/中轴 bodyW/颜色分带/平滑）|
| `reference/ganyu-dense.js` | **密集测量数据**（躯干 21 环、腿 12 环、臂 8 行、衣装色带边界）|
| `scripts/run-gms-model.sh` | 支持 `DATA_FILE` 预注入（模型脚本直接消费测量数据）|
| `scripts/draw-ganyu-soccer-v9.js` | 数据驱动 v9（TORSO_R/LEG_R 用测量环；jersey/shorts 插值带；GANYU/10/鸢尾纹）|
| `reference/compare-front-v9.png` / `compare-back-v9.png` | 参考 vs 模型并排（已 read_image 复核）|
| `delivery/ganyu-v9/` | work/items/六视角截图；历史 `vmtop3cyh8km7` |

## 2. 本波进展
- **密集测量 → 建模**：v9 直接读 `window.GANYU_DENSE`（躯干 21 环：h0.42-0.98 每 2.8%；腿 12 环；臂 8 行；色带边界 marks）。
- **衣物连续性**：新增 `ringsBetween/ringAt` 插值（衣装带采样 7+ 环），解决“测量标签噪声→露肤缝隙”；
  皮肤底座按色带着色（0.44-0.92 为 WHITE，其余 SKIN）。
- **参考标志**：背后 GANYU 字母 + 10、胸前 10、袜鸢尾纹（贴面 rod/disc）已加入。
- **密度**：U=48；实测 **3753 面 / 3753 笔**（10009003×3698 + 10009008×50 + 10009002×1 + 10009009×2 + 10009006×2），低于预算 30000。

## 3. 复核（read_image，正/背对比）
- 正面：测量比例成立——纤瘦躯干、腿距 ±0.09、袖口/长袜/白蓝鞋、蓝发+双角；胸前 10 隐约可辨。
- 背面：长马尾（3753 面中发丝 ribbon）垂背；GANYU 字母被发丝部分遮挡（可见 U 等）；球衣/短裤/袜色带正确。
- 衣壳分层：球衣=躯干外扩 0.008、短裤=0.006、袜=0.005，独立于皮肤底座。

## 4. 已知差距（下一迭代清单）
1. **腰腹“皮肤色带”残留**：jersey(0.60-0.92) 与 shorts(0.44-0.62) 之间仍有皮肤色反白/透出——需把皮肤底座在 0.40-0.92 全染 WHITE，并微调衣壳环覆盖 0.56-0.62；
2. **发丝质量**：头皮壳偏“头盔”、马尾为丝状柱体；需后脑完整包覆 + 发丝飘带加密（60+ 条 × 8 段）；
3. **GANYU 10 可读性**：字模贴面被发丝遮盖；改为发丝让位 + 字体加大/高亮色；
4. **量化验收**（未做）：正视剪影 IoU + 关键高度宽度误差脚本（v10 处理）。

## 5. 复现
```bash
uv run --with pillow --with numpy python3 scripts/extract-ganyu-profile.py
export BU_CDP_WS=$(curl -s http://127.0.0.1:9225/json/version | python3 -c "import json,sys; print(json.load(sys.stdin)['webSocketDebuggerUrl'])")
scripts/run-gms-model.sh scripts/draw-ganyu-soccer-v9.js delivery/ganyu-v9 http://localhost:8787/ reference/ganyu-dense.js
```
