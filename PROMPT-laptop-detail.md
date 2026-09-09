# 笔记本电脑细节升级提示词（续作）—— 不设元件数量上限

> 用法：把下面全部内容作为一条指令交给执行模型（一轮做完，不中途问人）。
> 仓库：/home/h/genshin-model-studio（甘雨建模 + 游戏导出 GIA 的既有工程）。

## 0. 定位句（名称 / 一句话目标 / 范围）

- **名称**：MacBook 式银灰极简笔记本 · 细节升级版（在既有 150 件成品上升级，**不设元件数量上限**）。
- **一句话目标**：把 `exports/laptop/` 上轮留下的 6 处妥协全部消掉、把 10 类细节用细分做到"近景经得起看"，元件数由细节目标决定，最后导出 `.gia` 交用户游戏实测。
- **功能要求（3±1，只做这三件事）**：
  1. 消掉上轮 6 处妥协（屏幕单色、薄壁被抽稀、接口浅槽、圆角单切角、z-fighting 外凸补偿、`gms.props` 兜底）；
  2. 升级 10 类细节（屏幕渐变 / 键帽斜壁 / 圆角多段 / 接口内腔 / 格栅加密 / 转轴分段 / 底面铭牌与扬声器孔 / 触控板凹陷 / 摄像头孔圈 / logo 层次）；
  3. 保持既有坐标、尺寸、开合姿态与**全部硬门禁**不变（只升细节，不动骨架）。
- **完成度档位**：maximum effort —— 细节做到"近景可辨"，一轮做完，中途不向用户索取决策；唯一留给用户的环节是「游戏实测签字」。

## 1. 交付形态锁定（critical）

- **单目录交付**：产物落 `exports/laptop-v2/` —— part 脚本副本、`work.json`、`items.json`、`laptop-structure-in.json`、`laptop.gia`、`laptop.gil`、`laptop.structure.json`、`laptop.summary.json`、`views/` 六张 PNG、`DELIVERY-v2.md`。
- **不要覆盖 `exports/laptop/`**：那是已核验的基线（150 件 / `.gia` 29,553 B / 门禁全绿），必须可回滚对比。
- **part 脚本位置**：输入脚本写 `scripts/parts/laptop-v2-*.js`；允许新增 `scripts/parts/lib/laptop-v2-*.js` 工具原语（零依赖、浏览器侧）。
- **zero-dependency**：不新增 npm 依赖、不改 `package.json`、不改 `web/index.html`、不改既有 `src/`、不新增 CLI。
- **预算**：元件数量**不设上限**（见 §4），但每一批新增都必须换来可指认的视觉改善。

## 2. 基线（开工前必读，S0 一次读完）

1. `exports/laptop/DELIVERY.md` —— 上轮 6 处妥协 + 全部实测读数（本轮要逐条消掉）。
2. `PROMPT-laptop-model.md` §2/§4 —— 坐标规格与硬门禁，本轮**逐条沿用、不改数值**。
3. `exports/laptop/items.json` 与 `scripts/parts/laptop-*.js` —— 上轮 150 件的实际坐标，可直接复用为骨架。
4. 页面「🕘 历史」首条（`benchmark/history/vmtsuafo14805/`）可加载上轮成品，做逐视角对照。
5. `reference/macbook/screen-ui-component.md` + `scripts/parts/laptop-screen-ui.js` + `reference/macbook/screen-ui/preview-full.png` —— D11 亮屏桌面组件的坐标规格、可执行 part 脚本与 1:1 视觉基准。

## 3. 细节升级清单（11 项，按此优先级）

- **D1 屏幕发光渐变**：拆成 **N ≥ 12 行** quad，色带 `#0E1B2A` → `#1B3A5C` 逐行插值（上轮因件数上限退化为单色 `#14294A`）；黑边保持 0.0060 / 上 0.0060 / 下 0.0120。→ **被 D11 承接并升级**（D11 的壁纸用 96 条带，D1 不再单独做）。
- **D2 键帽**：顶面 0.0150 × 0.0150 + **4 侧斜壁**（上小下大，斜角 ≥ 8°）；键帽间隙 0.0006；空格键 0.0780 × 0.0150 单独处理。
- **D3 四角圆角**：单张 45° 切角 → 每角 **3–4 段折线**，等效半径 R 0.0100，弦高误差 ≤ 0.0005（比上轮的 0.002929 偏差收紧一个量级）。
- **D4 接口**：USB-C 做**内腔**（底板 + 3 壁 + 舌片）、耳机孔做**内圈**；不再用"外凸浅槽"糊过去。
- **D5 散热格栅**：叶片加密到视觉连续（片间距 ≤ 0.0003）；**厚度必须先算 RDP 阈值**（见 §5），上轮 0.0005 / 0.0003 被抽稀。
- **D6 转轴**：圆柱沿 x **分段 ≥ 5 段** + 铰链盖与机身缝隙。
- **D7 底面**：铭牌位 + 序列号槽 + 扬声器孔阵列（≥ 6 孔）。
- **D8 触控板**：凹陷边框（四侧壁）+ 材质色差（`#B9BEC6` → `#ADB3BC`）。
- **D9 摄像头**：方形孔圈（外框 + 内芯）+ 状态点。
- **D10 logo**：分层（底衬 + 面层），可选。
- **D11 亮屏桌面组件（可拆分，本轮新增）**：屏幕活动区（0.3024 × 0.1964）内铺 macOS 桌面——96 条带渐变壁纸 + 菜单栏 4.8mm + 居中刘海 40×6mm + Dock 12.8mm（11 应用 + 分隔线 + 废纸篓）+ 白色窗口（标题栏 5.6mm / 三交通灯 2.4mm / 侧栏 22mm / 5×3 缩略图网格）+ 光标。**规格与坐标已给死**：`reference/macbook/screen-ui-component.md`；**可直接跑的 part 脚本**：`scripts/parts/laptop-screen-ui.js`（顶部 `TIER='full'` 换档 182/103/40 件）。要求：全部 `10009003`、四层 z（0.0002/0.0007/0.0012/0.0017）、同层零重叠、开盖法线 `[0, 0.173648, 0.984808]`、屏顶边 y=0.2144。视觉基准：`reference/macbook/screen-ui/preview-full.png`（同角度并排比对）。
- **质量红线**：每新增 100 件必须能指认一个具体视觉改善（写进 `DELIVERY-v2.md`），指认不出就删掉——**不设数量上限，但不许无意义堆件**。

## 4. 数量与性能（本轮不设上限，但必须报告）

- 元件数由细节目标决定，**不设人为上限**；实心件（`10009008`）不设配额，但每件必须在 `DELIVERY-v2.md` 写明"为什么平面表达不了"。
- 必须报告：`itemCount`、资源分布、`laptop.gia` 字节、`laptop.gil` 字节、导出耗时、六视角截图清单。
- 游戏加载时间与帧率由**用户实测**；执行方需预备**回退阶梯**：若实测明显劣化，按 D10 → D7 → D6 → D5 反向逐级回退（**保住 D1 屏幕渐变、D2 键帽斜壁、D4 接口内腔**），不许整片推倒重来。

## 5. 引擎硬约束（逐字沿用，全部实跑验证过，违反即报错）

- **导出主链**：`npm run export-mesh` `--` `exports/laptop-v2/laptop-structure-in.json` `--out-dir` `exports/laptop-v2` `--format` both `--force` `--no-qa`。
  - **必须带 `--`**：npm 会把自己不认识的 `--format` 当 npm 参数吞掉（实测报 `Invalid abbreviated flag "--format"` 并 exit 1）。
  - `--format both` 补出 `.gil` 以满足回读；`--no-qa` 因纯 quad 透传下 `summary.budget.used = 0` 必然误报（实测），**理由必须写进 `s4-verify.json`**。
- **part 运行**：`bash scripts/run-gms-parts.sh` `<out>` `<part.js>…` —— 脚本**没有执行位**（`-rw-------`），必须 `bash` 调用；运行器取**浏览器第一个标签页**，运行前浏览器必须停在 http://localhost:8787/ 建模页（否则报 `PART_EXEC_ERROR: gms is not defined`）。
- **RDP 抽稀阈值 = 0.005 × 包围盒对角线**：aspect 低于此的短边会被抽掉（上轮格栅叶片与触控板壁因此被加厚，服务端报 400「平面渲染需要矩形轮廓」）→ **本轮细节件先算阈值再定厚度**。
- `quad` 只有矩形（真圆只能用 `disc` / `el-disc`）；`roll` 未实现 → 确需平面内旋转时用 `gms.props` 覆写该 item 的 rotation。
- `disc` / `el-disc` 的 `lift = y − thick/2` **必须非负**；横向长圆柱（转轴）用 `rod`（只读 `x1/y1/x2/y2` + **单值 `z`**，`z1/z2` 被忽略）。
- 可见缝隙 ≤ **0.001 m**（引擎接触判定 `contact: gap <= 0.001`，`web/index.html:3127`）；`gms.touches` 对 quad 用 AABB 且**忽略 normal** → 必须另做独立 AABB 复算。
- root 0.1 由导出主链内部 `makeGiaInput` 施加（`src/cli/export-mesh.ts:319`）；`/api/export` 不施加，**不得当 root 证据**。
- 表面一律用 `10009003` 平面；**禁止** `10009001` 盒做表面、**禁止** `10009019` 网格直出 `.gia`；不规则必须来自细分（`adaptiveAngularStops` / `subdivSurface`），**禁止** jitterMesh 随机扰动。
- 细节=关键点+算法连线，**禁止贴小方块/小柱子式假细节**；先补工具原语再上算法。

## 6. 验收标准（逐条可核对）

- **尺寸不劣化**：沿用上轮口径——顶面 y = 0.0115（水平）、上盖厚 0.0040、闭合总高 0.0155（前后一致）、开合 100° ± 2°（上盖远端 y ≈ 0.2144）、整机最低点 = 后脚垫底面 0.000425。
- **结构**：`gms.verify()` ok、`gms.floating` 空、`gms.collides` 空、links 全接触；独立 AABB 复算 0 孤立件、应贴合对 0 缝隙。
- **视觉**：六视角（`--views` iso,top,front,left,right,closeup）非空且互不相同，`read_image` 逐张复核无破面 / 悬空 / 错位；独立视觉复核 `python3 ~/.agents/skills/isolated-model-evaluator/scripts/evaluate.py --task-file <task.md> --provider aijws --model gpt-5.6-sol --tools read,bash --output-dir <dir>` 无阻断项。
- **导出**：退出码 0；四件齐备；`python3 tools/gia/gia_parser.py <gia> --json <outfile>` 读出 `versions[0].data.rootTransform.scale` ≈ [0.1, 0.1, 0.1]（`--json` 必须带输出文件名）。
- **细节**：D1–D11 逐项在 `DELIVERY-v2.md` 给出"做了 / 为何没做"的结论 + 对应截图路径；D11 另需报告实际件数（182/103/40 之一）、同层重叠检查结果、开盖法线与屏顶边 y 实测值。
- **终验（唯一人类门）**：用户进游戏实测并签字。

## 7. 排除项（不要什么）

不要推倒重来（在既有 150 件上升级）；不要覆盖 `exports/laptop/`；不要随机扰动造细节；不要贴小方块/小柱子式假细节；不要 mesh 面板化路线；不要 `10009001` 盒体表面、不要 `10009019` 网格直出；不要新增 npm 依赖；不要改既有 `src/`、`package.json`、`web/index.html`；不要跳过门禁；不要一次性画完（必须分阶段留证据）；不要在无截图证据时宣称完成；除「游戏实测签字」外不要向用户提问。

## 8. 输出协议

- 每阶段**直接输出**：阶段名 / 命令原文 / 产物绝对路径 / 自检读数；**不要附加**解释性散文。
- 失败时只报三行：错误原文 + 修复动作 + 复验命令。
- 收尾输出一段交付摘要：`itemCount`、资源分布、`.gia` 字节、尺寸实测值、门禁结论、截图清单，以及一句「未获用户游戏实测签字，不得宣称完成」。

## 9. 参照锚定

- **现实参照**：MacBook Pro 真机细节（键帽圆角与等距间隙、屏内黑边、转轴缝隙、格栅密度、接口内腔）。
- **仓库参照**：`AGENTS.md` 铁律 1–9（root 双补偿 / 平面不用盒 / 网页预览即 gate / 不规则来自细分 / 先工具后算法 / 网格不直出 / 每步留证据 / 仿人类建模顺序 / 细节靠关键点+算法连线）；`docs/capabilities.md`（命令、元件、阈值单一来源）；`exports/laptop/DELIVERY.md`（上轮 6 处妥协）；`PROMPT-laptop-model.md`（本轮是它的续作，坐标与门禁沿用）。
- **长跑范式参照**：tidewright（source: winchxyz/tidewright README，date: 2026-09-07，license: MIT，Claude Opus 5 单指令长跑 7h47m / 2,596 轮）——「锁方向 + 标准 + 边界，其余授权模型自主」。
- **预置演示数据**：上轮 `exports/laptop/`（150 件 + 六视角 + 门禁读数）即为开箱即用基线，直接在其上增量，不必从零造。

## 10. 决策点（默认值，可改）

| 决策点 | 默认值 |
|---|---|
| 细节优先级 | D1 屏幕 > D2 键帽 > D4 接口 > D3 圆角 > D5 格栅 > D6 转轴 > D8 触控板 > D7 底面 > D9 摄像头 > D10 logo |
| 实心件配额 | 不设配额，每件须写明"平面为何表达不了" |
| 元件数量 | 不设上限；每 +100 件须对应一个可指认的视觉改善 |
| 性能底线 | 由用户游戏实测决定；执行方只报告数字 + 备好回退阶梯 |
| 开合姿态 | 保持 100°（与上轮一致，便于逐视角对照） |
| 输出目录 | `exports/laptop-v2/`（不覆盖上轮基线） |
