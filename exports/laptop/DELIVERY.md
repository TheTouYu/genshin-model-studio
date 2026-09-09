# 笔记本电脑建模交付（exports/laptop/）

**任务**：PROMPT-laptop-model.md —— MacBook 式银灰极简笔记本，闭合 30.4 × 21.2 × 1.55 cm，gms 画线 route 一轮建出 150 元件 → 网页 1:1 多视角预览 → 导出 .gia → 待用户游戏实测。

## 交付清单

| 类别 | 文件 |
|---|---|
| part 输入脚本（仓库约定） | `scripts/parts/laptop-{base,lid,hinge,keyboard,trackpad,screen,ports,grille,feet}.js` |
| part 脚本副本 | `exports/laptop/parts-src/*.js` |
| 作品/元件 | `work.json`（150 笔 + components 30 + links 19）、`items.json`（裸数组 150 件）、`laptop-structure-in.json` |
| 游戏产物 | `laptop.gia`（29553 B）、`laptop.gil`（48530 B）、`laptop.structure.json`、`laptop.summary.json` |
| 六视角 | `views/view-{iso,top,front,left,right,closeup}.png` |
| 近景/探针 | `views/diag/`（13 张）、`views/probe/`（15 张）、运行器自带 `view-{iso,front,back,left,front-clean}.png` |
| 证据 | `s0-preflight.json`、`points.json`、`spec.json`、`s4-gate.json`、`s4-verify.json`、`independent-aabb.json`、`parsed.json`、`inspect-draw-model.json`、`eval/`、`views/capture-report.json` |
| 工具 | `gen-parts.mjs`、`run-pipeline.sh`、`final-pass.sh`、`capture-six.py`、`diag-views.py`、`gate-check.py`、`independent-check.mjs`、`assemble-s4-verify.mjs` |

## 关键读数

- items **150**；资源分布 **10009003 × 145 + 10009008 × 5**（实心件 3.33% ≤ 5%）；无 10009001 / 10009019。
- 尺寸实测（items.json 反推）：顶面 y **0.0115**（水平）、上盖厚 **0.0040** → 闭合总高 **0.0155**（前后一致）；开合角 **100.000°**；上盖远端 y **0.214422**（§5 期望 ≈0.2144）；整机最低点 **0.000425**（后脚垫）；世界包围盒 0.3048 × 0.213998 × 0.245711。
- 门禁：`gms.verify()` → `ok=true`，30 命名件 / 19 条 link 全接触 / floating=[] / collides=[]。
- 独立 AABB 复算：11175 对逐对，0 孤立件、0 无地面链、应贴合对 0 缝隙。
- 导出：exit 0；`rootTransform.scale = [0.1, 0.1, 0.1]`；item 变换 ×10 补偿（0.3040→3.04 等）。
- 视觉：六视角互不相同且非空；独立视觉复核（aijws/gpt-5.6-sol）结论 **pass**，0 blocker / 0 major / 0 minor。

## 复现

```bash
bash exports/laptop/final-pass.sh     # 流水线 → 独立复算 → 导出主链 → 门禁 → 六视角
node exports/laptop/assemble-s4-verify.mjs   # 汇总 s4-verify.json
```

## 与 §2 规格的偏差（均为引擎约束，已记录在 s4-verify.json）

1. 格栅叶片 z 向 0.0005→**0.0010**、框面 0.0030→**0.0060**；触控板四侧壁 h 0.0006→**0.0010** —— 引擎 RDP 抽稀阈值 = 0.005×包围盒对角线，aspect < 0.005 的短边会被抽掉（服务端 400「平面渲染需要矩形轮廓」）。
2. 屏幕发光色用单色 **#14294A**（§2 给的是 #0E1B2A→#1B3A5C 渐变；单个 quad 只能单色，逐行渐变需拆件、与 150 件清单冲突）。
3. 接口建模为「微外凸浅槽」（底板外凸 0.0004 + 唇壁）—— 平面件无法在侧壁开洞。
4. 格栅框面外凸 0.0001 / 叶片外凸 0.0002（避免与底面共面 z-fighting；整机最低点仍是后脚垫）。
5. 上盖左右侧缘 + 4 切角共 6 面用 `gms.props` 覆写 rotation（引擎未实现 roll）。
6. x 向包围盒 0.3048 = 0.3040 + 两侧接口浅槽各 0.0004。

## 追加（2026-09-08，用户需求「写到页面的历史里面去」）

- 历史版本已入库：`benchmark/history/vmtsuafo14805/`（name「笔记本 MacBook 150 元件（30.4×21.2×1.55cm）」，tags「laptop 150元件 30命名/19连接 开合100° gia已导出」，150 笔 / 150 元件），页面「🕘 历史」面板首条即可加载。
- 加载即原样复原：strokes 150 + components 30 + links 19 + options 与 `exports/laptop/work.json` 逐字段相等；再由页面 strokes 复算 `/api/draw-model` → 150 件、10009003×145 + 10009008×5，与 `exports/laptop/items.json` 逐件（resourceId/position/rotation/scale）相等。
- 普通刷新也能看到：`localStorage('gms.draw.work.v1')` 已含整份作品，reload 后状态「✓ 150 笔 · 149 笔封闭 · 150 个元件」，3D 预览相机 target=[0,0.1074,-0.0169]、radius 2.4，渲染与 `views/view-iso.png` 同款（证据：`views/refresh-restored.png`、`views/history-loaded.png`）。
- 服务端补口：`scripts/web-server.js` 原先没有 `/api/history` 四个端点（只在 `web/server.ts` / `dist/web/server.js` 里），页面历史面板 fetch 得 404；已按 `web/server.ts:106-181` 语义补齐，零新增依赖，`GMS_EXPORT_DIR` 行为不变。记录见 `iteration-records/07-laptop-history.json`。
- 注意：页面「保存」按钮上传的是 `gms.export()`（`web/index.html:3277`，只含 version/strokes/options），会丢 components/links；本条目是直接 POST 完整 work.json 存的，故命名与连接齐全。

## 未闭合

**用户进游戏实测并签字**——唯一人类门。未获用户游戏验收，不得宣称完成。
