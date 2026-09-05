# 甘雨 v8 — 测量驱动表面网格交付（三视图 vs 模型对比）

- 目标：按用户要求「先有测量，不靠记忆」——从原图提取身体曲线 → 数据驱动建模 → 对比验收。
- 完成时间：2026-09-06（本波）
- 状态：**框架 + 测量闭环已验证**（1894 面 / 分带配色 / 比例对齐参考），持续细节迭代中。

---

## 1. 交付物

| 文件 | 说明 |
|---|---|
| `reference/ganyu-3view.png` | 用户原件（1254×1254，Downloads 原图） |
| `reference/ganyu-{front,side,back}.png` | 自动切成三张独立视图（387/232/385×1125） |
| `reference/ganyu-*-overlay.png` | 逐行剪影提取叠加（已 read_image 复核正面） |
| `reference/ganyu-profile.json` | 每归一化高度：全宽 w / 身体主段宽 bodyW / runs / 颜色分带 |
| `reference/ganyu-rings.json` | 测量环（front 宽 × side 深 → rx/ry/y） |
| `reference/compare-front-v8.png` | **参考正面 vs 模型正面 并排对比**（已 read_image） |
| `scripts/extract-ganyu-profile.py` | 测量管线（背景分离/三视图切割/中轴 bodyW/颜色分类/平滑/环生成） |
| `scripts/draw-ganyu-soccer-v8.js` | 数据驱动的表面网格脚本（读取测量环） |
| `delivery/ganyu-v8/` | work/items/六视角截图 |
| 历史版本 | `vmtooo6njo38l` |

## 2. 测量 → 建模闭环（关键证据）

- **三视图分离**：前景=与边缘均值灰色差>40；自动找到 3 个列区间（56-443 / 520-752 / 820-1205）。
- **逐行剪影**：64 档归一化高度；每行输出全宽、包含**身体中轴**（脚/腿行中点中位数）的主段宽 bodyW、
  全部 runs、颜色分带（white/hair/skin/blue/red/dark）。
- **测量环**：`H_M=1.18m` 标定；躯干环（h0.46-0.94）与腿环（每腿 cx≈±0.09→±0.065、半径渐变）
  全部来自像素测量。v8 脚本直接使用这些值（肋 0.059/腰 0.043/胸 0.065；腿踝 0.018→大腿 0.05）。
- **侧深**：side 视图 bodyW 提供 ry；前深比（胸 0.04 / 髋 0.034）贴合参考侧视。
- **衣壳层**：球衣 = 躯干环外扩 0.008；短裤 = 髋环外扩 0.006；袜 = 腿环外扩 0.005——
  每件衣服都是与身体独立的表面（用户强调的核心难点）。

## 3. v8 统计与定性评价

- 1894 面：10009003 平面面板×1868 + 圆柱 21 + 球 1（头）+ 锥 2（角尖）+ 三棱锥 2（鞋楔）。
- 对比（reference/compare-front-v8.png，read_image 复核）：
  - **比例对齐**：纤瘦躯干、腿间距（±0.09）、袖口在肘、长袜至膝、白蓝鞋 —— 与参考一致；
  - 蓝发+双角+呆毛+脸在白/蓝网格人物上成立；
  - 球衣斜纹/蓝腰条/白短裤/肤色四肢/黑手套分带正确。
- **仍有差距**（诚实记录）：
  1. 躯干仍是低模"直筒"，胸/腰/髋曲线对比度不足（测量环密度 9 环，需增至 20+ 环）；
  2. 发片为块状刘海/马尾，缺少参考的丝缕感（需 ribbon 加密 + 后脑包覆）；
  3. 图案（背面 GANYU 10、胸前 10、袜鸢尾纹）未做成贴面面板；
  4. 头部圆球与发壳接缝、手的造型粗略。

## 4. 下一步（测量驱动继续）

1. **曲线密度**：躯干/腿加环（20+ 环）→ 胸/腰/髋曲线明显；U 提升（28→48）。
2. **发壳包覆 + 长马尾**：头皮壳覆盖后脑（背视不再露皮肤）；马尾加长到腰、40+ 条 8 段 ribbon。
3. **图案面板**：GANYU 10 / 胸前 10 / 鸢尾纹用贴面 quad（10009003）钉在壳面上。
4. **自动量化验收**：模型正视剪影 vs 参考正面剪影 IoU / 宽度曲线误差，逐段修正。

## 5. 复现

```bash
uv run --with pillow --with numpy python3 scripts/extract-ganyu-profile.py
export BU_CDP_WS=$(curl -s http://127.0.0.1:9225/json/version | python3 -c "import json,sys; print(json.load(sys.stdin)['webSocketDebuggerUrl'])")
scripts/run-gms-model.sh scripts/draw-ganyu-soccer-v8.js delivery/ganyu-v8 http://localhost:8787/
```
