# 笔记本电脑细节升级交付（exports/laptop-v2/）

**任务**：PROMPT-laptop-detail.md —— 在 `exports/laptop/` 上轮 150 件成品上升级（元件数不设上限），
消掉上轮 6 处妥协、升级 D1–D10 十类细节，保持既有坐标/尺寸/开合姿态/全部硬门禁不变，导出 `.gia` 交用户游戏实测。

**结论（待用户签字）**：570 元件（534 平面 10009003 + 36 实心 10009008），`.gia` 112,223 B / `.gil` 183,630 B，
导出主链 exit 0（5 s），门禁 `gms.verify()` ok、独立精确 AABB 复算 0 孤立/0 悬空/应贴合对 0 缝隙，
六视角 + 21 张近景互不相同。**未获用户游戏实测签字，不得宣称完成。**

## 1. 交付清单

| 类别 | 文件 |
|---|---|
| part 输入脚本（仓库约定） | `scripts/parts/laptop-v2-{base,keyboard-1..4,trackpad,lid,screen,ports,grille,bottom,hinge,feet}.js` + `laptop-v2-gate.js`（门禁专用 31 命名件） |
| part 脚本副本 | `exports/laptop-v2/parts-src/*.js`（14 个） |
| 作品/元件 | `work.json`（570 笔）、`work-named.json`（含 components 31 + links 22）、`items.json`（裸数组 570 件）、`laptop-structure-in.json` |
| 游戏产物 | `laptop.gia`（112,830 B）、`laptop.gil`（184,628 B）、`laptop.structure.json`、`laptop.summary.json` |
| 六视角 | `views/view-{iso,top,front,left,right,closeup}.png` + `views/capture-report.json` |
| 近景/证据 | `views/diag/`（21 张：D1–D10 逐项 + 整机紧凑）、`views/view-{iso,front,back,left,front-clean}.png`（运行器产物） |
| 读数 | `spec-v2.json`、`points-v2.json`、`rdp-table.json`、`s0-preflight.json`、`s4-gate.json`、`independent-aabb.json`、`s4-verify.json`、`parsed.json`、`summary.json`、`eval/` |
| 工具（可复现） | `gen-parts-v2.mjs`、`assemble.mjs`、`build-named.mjs`、`run-pipeline.sh`、`final-pass.sh`、`capture-six.py`、`diag-views.py`、`gate-check.py`、`independent-check.mjs`、`assemble-s4-verify.mjs` |

## 2. 关键读数（§4 报告项）

- **itemCount 570**：平面 10009003 × **534**（93.7%）、实心 10009008 × **36**（上盖边缘圆角管 24 段 + 转轴 6 段 + 脚垫 4 件 + 耳机孔金属圈/暗孔 2 件）。
  实心件逐件理由见 `s4-verify.json.solidsJustification`：24 段圆角管 = 引擎无 roll、平面件无法表达任意 3D 朝向的圆角边；
  6 段转轴 = D6 分段要求；4 脚垫 = §2 规格（disc）；2 件耳机孔圆件 = 平面件只有矩形，方形孔不属于耳机孔形态（独立视觉复核指出）。
- **`.gia` 112,223 B / `.gil` 183,630 B**；导出主链 **exit 0，耗时 5 s**（上轮 150 件时 29,553 B）。
- 六视角：`view-iso.png` / `view-top.png` / `view-front.png` / `view-left.png` / `view-right.png` / `view-closeup.png`
  （sha256 互不相同，见 `views/capture-report.json`；五视角视距 2.4 m 与上轮基线一致便于逐视角对照，closeup 0.8 m）。
- 尺寸（items.json 精确反推，`independent-check.mjs`）：顶面 y **0.0115**（水平）、上盖厚 **0.0040**、闭合总高 **0.0155**、
  开合角 **100.000°**、上盖远端 y **0.21437**（§6 期望 ≈0.2144）、整机最低点 = 后脚垫 **0.000425**、
  世界包围盒 **0.304000 × 0.213998 × 0.245711**（x 向回到精确 0.3040，上轮 0.3048）。
- 门禁：`gms.verify()` → `ok=true`、**floating=[]、collides=[]**、31 命名件 / 22 条 link 全接触（`s4-gate.json`）。
- 独立精确 AABB 复算：**162,165 对**逐对 → **0 孤立件、0 无地面链件、应贴合对 0 缝隙**（`independent-aabb.json`）。
- RDP 存活余量最小 **1.30×**（`rdp-table.json`，全 534 平面件逐件余量）。
- 独立视觉复核：`eval/`（aijws / gpt-5.6-sol，只读六视角 + 13 张近景）。
  **复核循环（两轮发现 → 处置）**：
  - 第一轮 reject：唯一 major = 耳机孔在 `jack-macro.png` 里呈方形轮廓 → 改用引擎原生圆形件
    （`disc` axis=side：金属圈 Ø0.0034 + 暗孔 Ø0.0022），重跑全链路。报告留档 `eval-round1/`。
  - 第二轮 reject：唯一 major = 「接口左右侧别反置」→ **经逐像素复核判定为审方误读**：把 `view-left.png`/`view-right.png`
    的底座侧壁 12× 放大后可见 `view-left`（相机 +X → x=+0.1520 壁）**只有 1 个圆孔**、
    `view-right`（相机 −X → x=−0.1520 壁）**有 2 个矩形开口**，与 §2 规格及 `items.json` 坐标一致；
    证据图 `views/diag/view-left-portzoom.png`、`view-right-portzoom.png`（本轮新增），第二轮报告留档 `eval-round2/`。
  - 第三轮 **pass**：0 blocking / 0 major / 0 minor（`eval/`，14 张图；审方明确确认「view-left 显示 +X 侧单个耳机孔，view-right 显示 −X 侧两个 USB-C 开口」）。

## 3. D1–D10 逐项结论

| 项 | 结论 | 做法 / 读数 | 截图 |
|---|---|---|---|
| **D1 屏幕发光渐变** | ✅ 做了 | 可视区 0.2920×0.1825 拆 **12 行** quad，`#0E1B2A`（下）→`#1B3A5C`（上）逐行线性插值；黑边 0.0060/0.0060/0.0120 不变 | `views/diag/screen-glow.png` |
| **D2 键帽斜壁** | ✅ 做了 | 79 键 × 5 件（顶面 0.0150² + 4 侧斜壁，45° ≥ 8°，下沿 0.0184 → **相邻键间隙 0.0006**，斜壁落在井底 y=0.0095 无悬空）；空格 0.0780×0.0150 同构 | `views/diag/keycap-macro.png`、`keyboard-zoom.png` |
| **D3 四角圆角** | ✅ 做了 | 底座每角 **4 段竖直折线**（R 0.0100，弦高误差 **1.92e-4** ≤ 5e-4）；上盖边缘改为 **R 0.0100 圆角管**（每弧 5 段，弦高误差 **9.8e-5**），同时消掉 roll 依赖 | `views/diag/corner-macro.png` |
| **D4 接口内腔** | ✅ 做了 | USB-C：在左壁**开孔**（0.0085×0.0025）→ 内腔底板（深 0.0035）+ 顶/底/两侧壁 + 舌片；耳机孔：右壁开孔（0.0035²）→ 内腔（深 0.0040）+ 圆形金属圈 Ø0.0034 + 暗孔 Ø0.0022（disc axis=side，首轮视觉复核指出方孔不属于耳机孔形态后改用圆件）；不再是外凸浅槽 | `views/diag/usbc-macro.png`、`jack-macro.png` |
| **D5 散热格栅** | ✅ 做了 | 在底面**开孔**（0.1400×0.0030），内嵌暗底衬（下沉 0.0012）+ 4 片叶片 **0.1400×0.0005×0.0003、间距 0.00025**（恢复 §2 原值）；叶片沿 x 分 2 段（0.0700）满足 RDP 存活条件 | `views/diag/grille-macro.png`、`bottom-zoom.png` |
| **D6 转轴** | ✅ 做了 | rod 沿 x **6 段**（每段 0.0500，段间 0.0008）；铰链盖 2 × 3 面，与机身留 **0.0004** 缝隙 | `views/diag/hinge-zoom.png` |
| **D7 底面** | ✅ 做了 | 铭牌位（0.0600×0.0090 开孔 + #B9BEC6 底衬）+ 序列号槽（0.0400×0.0022 开孔 + 暗底衬）+ **2×4 扬声器孔**（0.0016×0.0070 各 4 孔，暗底衬） | `views/diag/nameplate-macro.png`、`speaker-macro.png` |
| **D8 触控板** | ✅ 做了 | 面下沉 **0.0008**（凹陷边框四侧壁，前/后壁沿 x 分 2 段满足 RDP）；材质色差 面 `#B9BEC6` / 壁 `#ADB3BC` | `views/diag/trackpad-zoom.png` |
| **D9 摄像头** | ✅ 做了 | 方形孔圈：外框 4 条（外 0.0036、条宽 0.0008，#4A4E55）+ 内芯 0.0020²（#0A0A0C，凹陷 0.0003）+ 状态点 0.0005² | `views/diag/screen-camera.png` |
| **D10 logo** | ✅ 做了 | 分层：底衬 0.0160²（#B9BEC6）+ 面层 0.0120²（#E8EAED，凸起 0.0003） | `views/diag/logo-zoom.png` |

## 4. 上轮 6 处妥协：逐条消掉

| 上轮妥协 | v2 处置 | 证据 |
|---|---|---|
| ① 薄壁被 RDP 抽稀（格栅叶片 0.0005→0.0010、框面 0.0030→0.0060、触控板壁 0.0006→0.0010） | 先用 15 组 quad 实跑**测出存活条件** `min(w,h) > max(0.0002174, 0.005×hypot(w,h))`（460px=1m），再按阈值设计：叶片恢复 **0.0005×0.0003/间距 0.00025**（沿 x 分 2 段）、触控板壁按凹陷深度 0.0008 | `s0-preflight.json`、`rdp-table.json`（最小余量 1.30×） |
| ② 屏幕单色 `#14294A` | D1：12 行渐变 `#0E1B2A`→`#1B3A5C` | `views/diag/screen-glow.png` |
| ③ 接口=微外凸浅槽 | D4：侧壁开孔 + 真内腔（底板/3 壁/舌片、内圈/芯）；x 包围盒不再被外凸撑大 | `views/diag/usbc-macro.png`、`jack-macro.png` |
| ④ 格栅框面/叶片外凸 0.0001/0.0002 避 z-fighting | 底面开孔 + 叶片**下沉 0.0003**、底衬下沉 0.0012（无共面、无外凸补偿） | `views/diag/grille-macro.png` |
| ⑤ 圆角单张 45° 切角 | D3：底座 4 段折线（1.92e-4）+ 上盖圆角管（9.8e-5），比上轮 2.929e-3 收紧一个量级 | `views/diag/corner-macro.png` |
| ⑥ `gms.props` 覆写 6 面 rotation（roll 未实现） | **needProps = 0**：上盖边缘改圆角管（poly 3D 段），底座四角改竖直折线，全部走引擎原生朝向 | `gen-parts-v2.mjs` 断言（`PROPS NEEDED` 为 0 才出脚本）、`spec-v2.json.parts[].needProps` 全 false |
| （上轮另记）x 包围盒 0.3048 | **0.304000**（接口改为开孔后不再外凸） | `independent-aabb.json.dimensions.widthX` |

## 5. 与 §2 规格的偏差（逐条记录，均为引擎约束或细节定义补充）

1. **格栅 z 中心 −0.1030 → −0.1025**：开孔后缘到机身背缘的剩余带从 0.0015 加宽到 0.0020，否则该带（0.3040×0.0015）低于 RDP 存活阈值会被抽稀（实测阈值 0.00152）。
2. **键帽总高 0.0020（顶面在 y=0.0112–0.0115）**：§2 的「键帽厚 0.0010」保留为顶面板厚 0.0003 + 斜壁；斜壁下沿落到井底 y=0.0095（避免 1 mm 悬空间隙）。
3. **触控板凹陷 0.0008**：§2 未规定凹陷深度与侧壁高度，0.0008 为满足 RDP 阈值（长边 0.1300 时阈值 0.00065）的取值。
4. **上盖边缘为 R 0.0100 圆角管（rod 24 段，直径 0.0040 = 上盖厚）**：外轮廓仍是 0.3040×0.2120（管外表面 = 圆角矩形轮廓），取代上轮的平侧缘 + 切角面。
5. **D7 铭牌/序列号槽/扬声器孔的坐标**：§2 未给坐标，本轮取底面掌托区（z 0.0500–0.0770，x ±0.030 / ±0.11），互不重叠且每个孔带 ≥0.0022。
6. **摄像头孔圈外框 0.0036**：§2 的「摄像头 0.0020×0.0020」保留为**内芯**尺寸，外框为其加 0.0008 边框。
7. **底面被 12 个开孔分解为 25 片**（§2 只有 1 张底面）：这是「真开孔」的必要代价；RDP 余量最差件 base_bottom_20 = 1.30×。
8. **实心件 34 件**：§4 明确「不设配额，每件须写明为什么平面表达不了」（见 `s4-verify.json.solidsJustification`）。

## 6. 回退阶梯（用户实测若劣化，按序反向回退，保住 D1/D2/D4）

`D10 logo 分层（2 件）` → `D7 底面细节（12 件 + 8 孔开孔分解）` → `D6 转轴分段（6 段 → 1 段）` → `D5 格栅加密（叶片 16 → 8 件，间距 0.00025 → 0.0005）`；
回退只删对应件、不动骨架；**D1 屏幕渐变、D2 键帽斜壁、D4 接口内腔 保留**。回退后重跑 `bash exports/laptop-v2/final-pass.sh` 即可复现全部产物。

## 7. 复现

```bash
# 环境：8787 服务在跑（node scripts/web-server.js），浏览器停在 http://localhost:8787/ 建模页（CDP 9222）
node exports/laptop-v2/gen-parts-v2.mjs        # 生成 part 脚本 + spec/points/rdp-table（needProps 必须为 0）
bash exports/laptop-v2/final-pass.sh           # 全链路：13 批 part → 数值序拼装 → 独立复算 → 门禁 → 导出 → 六视角 + 近景
node exports/laptop-v2/assemble-s4-verify.mjs  # 汇总 s4-verify.json
```

关键命令原文：
- part 运行：`bash scripts/run-gms-parts.sh exports/laptop-v2 scripts/parts/laptop-v2-*.js`（脚本无执行位，必须 `bash`；运行器取浏览器第一个标签页）
- 导出主链：`npm run export-mesh -- exports/laptop-v2/laptop-structure-in.json --out-dir exports/laptop-v2 --format both --force --no-qa`
- root 读数：`python3 tools/gia/gia_parser.py exports/laptop-v2/laptop.gia --json exports/laptop-v2/parsed.json`

## 8. 本轮新增的引擎事实（写进工具与文档，避免重犯）

1. **RDP 存活条件（实跑标定）**：`min(w,h) > max(0.1px, 0.005×笔画包围盒对角线)`；460px=1m 时等价于
   `min(w,h) > max(0.0002174 m, 0.005×hypot(w,h))`。实测边界：0.14×0.0007 FAIL / 0.14×0.0008 OK；0.035×0.0002 FAIL（触发 0.1px 下限）/ 0.035×0.0003 OK。
2. **poly 3D 折线端到端存活**：`gms.part('poly',{points:[[x,y,z],…],size})` → 每段一根 10009008 圆柱（朝向由两端点决定）→ 上盖圆角管用它，绕开 roll 缺失。
3. **v1 屏幕上下颠倒**：黑边/摄像头沿 +z 方向错位（0.0120 下巴在开合后位于屏顶）→ v2 已修正（下巴在 −z）。
4. **`gms.import` 不保真**：导入走 `uiStrokePartInfo` 重建 spec，实测全部注册成默认 `rod/0.03`（注册盒失真）→ 门禁必须走 `gms.part` 真实注册路径。
5. **运行器内置拼装是字典序**（part1, part10, …, part2）→ items 与 spec 错位；本项目用 `assemble.mjs` 数值序拼装。
6. **570 件规模下逐 part no-clear 注入会触发 CDP `Runtime.evaluate` 超时**（第 4 个键盘块）→ 门禁改为只注入 31 个引擎可连通命名件（`laptop-v2-gate.js`）。
7. **part 运行途中页面若重载会恢复旧 localStorage 作品**（实测 part5 变成整机 573 笔）→ `run-pipeline.sh` 跑前把 `Storage.prototype.setItem` 打成 no-op。

## 9. 未闭合

**用户进游戏实测并签字**——唯一人类门。未获用户游戏验收，不得宣称完成。
游戏加载时间/帧率由用户实测；若明显劣化，按 §6 回退阶梯处理。
