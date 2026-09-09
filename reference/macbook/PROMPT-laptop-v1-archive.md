# 笔记本电脑精细建模提示词 —— Genshin Model Studio 一轮长跑

> ⚠ **历史版本，非当前提示词**：当前提示词是仓库根目录的 `PROMPT-laptop-max.md`。
> 本文件里所有「不改源码 / 不加依赖」之类的禁令**已作废**——仓库源码可自由修改升级。

> 用途：把下面全部内容作为一条指令交给执行模型（一轮做完，不中途问人）。
> 仓库：/home/h/genshin-model-studio（甘雨建模 + 游戏导出 GIA 的既有工程）。

## 0. 定位句（名称 / 一句话目标 / 功能要求）

- **名称**：MacBook 式银灰极简笔记本（闭合 30.4 × 21.2 × 1.55 cm）。
- **一句话目标**：在本仓库用「gms 画线 route」一轮建出 150 个元件的笔记本电脑，先在网页 1:1 多视角预览通过，再导出 `.gia`，交用户进游戏实测。
- **功能要求（3±1，只做这三件事）**：
  1. 逐键帽键盘 + 触控板 + 屏内黑边；
  2. 接口（USB-C / 耳机孔）+ 散热格栅 + 转轴圆柱；
  3. 屏幕发光色 + 摄像头点 + 品牌 logo 位。
- **完成度档位**：最高质量 / maximum effort —— 一轮做完，中途不向用户索取决策；唯一留给用户的环节是「游戏实测签字」。

## 1. 交付形态锁定（critical）

- **单目录交付**：产物落 exports/laptop/ —— part 脚本的**输入副本**、work.json、items.json、laptop-structure-in.json（包装后的导出输入）、laptop.gia、laptop.gil、laptop.structure.json、laptop.summary.json、views/ 下六张 PNG（view-iso / view-top / view-front / view-left / view-right / view-closeup）。
- **part 脚本位置**：**输入脚本**写 scripts/parts/laptop-*.js（仓库既有约定）；`scripts/run-gms-parts.sh` 自己会把每个 part 的执行结果写到 **exports/laptop/parts/partN.json**（那是运行器产物，不是脚本目录）。**该脚本没有执行位（mode -rw-------）**，必须用 `bash` 调用；且**它按 host 取浏览器第一个标签页**执行 part —— 运行前浏览器必须停在 http://localhost:8787/ 建模页（若停在 /draw/*.html 之类无 `window.gms` 的页面，会报 `PART_EXEC_ERROR: gms is not defined`）。
- **证据例外**：落在 exports/laptop/ 之外的产物只有两类 —— part 输入脚本 scripts/parts/laptop-*.js 与 `iteration-records/NN-*.json`（NN = 从 01 起的两位序号）；两者都是仓库既有约定，必须写。
- **zero-dependency**：不新增任何 npm 依赖、不改 package.json、不改 web/index.html、不新增 CLI；只用仓库已有能力：`gms.part`、`gms.summary`、`gms.clear`、`gms.verify`、`gms.floating`、`gms.collides`、`gms.link`、`gms.props`、`gms.export`、`gms.import`、`scripts/run-gms-parts.sh`、`npm run export-mesh`、`/api/export`。
- **预算**：主档 140–350 个元件（逐键帽，清单见 §2）；超限时按 §7 切降级档（整块键盘色带，整机 ≈40–90 个元件），不得悄悄超预算。
- **产物判定**：每个 part 文件都是可独立重跑的**单文件**脚本（single file，不依赖未注入的全局），产物可复现。

## 2. 规格表（逐字用；数值全部可复算）

**坐标语义（全文唯一约定）**：x = 宽度（左右，±0.1520）；y = 高度（向上，**y = 0 = 底面后缘基准面**；脚垫中心 y = y_bottom(z) − 0.0003，四角内缩 0.0200 → 整机最低点 = 后脚垫底面 0.0004245）；z = 深度（+z 朝用户/前缘，−z 朝转轴/后缘，z ∈ [−0.1060, +0.1060]）。与 web/index.html:3003 的 up [0,1,0] / front [0,0,1] / side [1,0,0] 一致。
**方向核对（S1 必做）**：先用一块 0.1000 × 0.1000 的 quad 在网页预览里核对 w/h 与 x/z 的映射（含 normal 指向），把实测映射写进 exports/laptop/points.json 的 conventions 字段——不得凭猜。

**已知引擎约束（全部经实跑验证，违反即报错）**：

- `gms.part` 的 `quad` 取 `{x, y, z, w, h, thick, normal}` —— **`roll` 未实现**（web/index.html:2853 仅注释，全仓无代码读取 spec.roll）→ 朝向只由 normal 决定，**默认全部轴对齐**；确需平面内旋转时用 `gms.props` 覆写该 item 的 rotation（实测 `[0, 45, 0]` 在页面 items 与导出 .gia 双通道生效），仅限切角等必要处。
- `quad` 只有矩形（web/index.html:2870-2876 矩形五点）—— **圆形特征（摄像头点 / logo / 耳机孔）一律用等尺寸方形 quad 近似**；真圆只能用 `disc` / `el-disc`（实心圆柱 10009008），会占用 ≤6 件实心件配额。
- `disc` / `el-disc` 的 `lift = y − thick/2` **必须非负**（否则报 `lift 参数非法：应为非负有限数值`）→ 用 disc 的件必须满足 **y ≥ thick/2**；横向长圆柱（转轴）用 `rod`，不要用 disc。
- `gms.touches` 对 quad 用轴对齐包围盒 `half = [w/2, h/2, thick/2]`、**忽略 normal**（web/index.html:2994-2996）→ 对平面件**既会假阳性也会假阴性**（同中心异 normal 两片实测报 `contact: true, gap: 0`；同一 USB-C 口两侧壁相距 0.006 也报接触；而相距 0.09 / 0.004 / 0.055 的平行片能正确报出 gap）——**门禁对平面无区分力**，必须另做独立间距复算（见 §5）。

| 项 | 值 |
|---|---|
| 闭合外框 | 宽 W 0.3040 (x) × 深 D 0.2120 (z) × 高 H 0.0155 (y) |
| 底座楔形 | **顶面（键盘/掌托面）是水平面 y = 0.0115**；**底面是斜面** y_bottom(z) = 0.0006 + (z + 0.1060) / 0.2120 × 0.0045（后缘 z = −0.1060 → 0.0006；前缘 z = +0.1060 → 0.0051）→ 底座厚度 0.0109（后）→ 0.0064（前）；上盖厚 0.0040；**闭合总高恒 = 0.0115 + 0.0040 = 0.0155 = H（前后一致）** |
| 圆角 | 四角用**单张 45° 切角 quad** 近似，等效半径 R 0.0100（每角 1 张，底座/上盖各 4 张）；不做内角圆角 |
| 开合姿态 | 上盖绕转轴开 100°；转轴轴心 (x = 0, y = 0.0115, z = −0.1000)，轴沿 x，用 `rod` 表达（size 0.0040） |
| 键盘井 | x 宽 0.2760 × z 深 0.1090，中心 (0, 0.0115, −0.0395)，井深 0.0020（井底 y = 0.0095）；键距 0.0190（14 列）、行距 0.0180（6 行）；键帽 0.0150 × 0.0150 × 0.0010（y 0.0105–0.0115，顶面与机身顶面齐平）；共 79 键（行分布 14/14/14/13/13/11，空格 0.0780 × 0.0150）；列中心 x = −0.1235 + i × 0.0190（i = 0…13），行中心 z = −0.0845 + j × 0.0180（j = 0…5） |
| 触控板 | 0.1300 (x) × 0.0740 (z)，中心 (0, 0.0115, +0.0570)，厚 0.0006 内嵌（顶面 y = 0.0115，底面 y = 0.0109） |
| 顶面框条 | 顶面 y = 0.0115 拆成 **7 张框条**围出键盘井与触控板凹槽：① 前边距 0.3040 × 0.0120（z +0.0940…+0.1060）；②③ 触控板左右 0.0870 × 0.0740（x −0.1520…−0.0650 与 +0.0650…+0.1520，z +0.0200…+0.0940）；④ 中隔 0.3040 × 0.0050（z +0.0150…+0.0200）；⑤⑥ 键盘井左右 0.0140 × 0.1090（x −0.1520…−0.1380 与 +0.1380…+0.1520，z −0.0940…+0.0150）；⑦ 后边距 0.3040 × 0.0120（z −0.1060…−0.0940）。**不得用一整张顶面**（会遮住井底并与键帽共面） |
| 屏幕可视区 | 0.2920 × 0.1825（16:10），置于上盖内面居中；黑边 左/右 0.0060、上 0.0060、下 0.0120 |
| 摄像头 | 0.0020 × 0.0020 方形 quad（屏上边中点） |
| 品牌 logo 位 | 0.0140 × 0.0140 方形 quad（上盖背面中心） |
| 接口 | 2 × USB-C 0.0085 (z) × 0.0025 (y)，在 x = −0.1520 侧；耳机孔 0.0035 × 0.0035 方形 quad，在 x = +0.1520 侧（**视图预设按相机方位命名，侧别对应见 §7**） |
| 散热格栅 | 2 条，每条 = 1 张框面 0.1400 (x) × 0.0030 (z) + 4 片叶片 0.1400 (x) × 0.0005 (z) × 0.0003 (y)，片间距 0.00025（4 片占 0.00275 ≤ 0.0030）；沿 x 对称，间距 0.0200（总跨 0.3000 ≤ W），贴底面后缘（该处 y_bottom = 0.0006） |
| 脚垫 | 4 × Ø 0.0080 × 0.0006（用 `disc`，axis 'up'），底面四角内缩 0.0200，z = ±0.0860 → **中心 y = y_bottom(z) − 0.0003**（后脚垫 0.000725，前脚垫 0.004375；两者都 ≥ thick/2 = 0.0003，满足 lift ≥ 0） |

**布局预算（z 轴自前向后，相加必须 = D = 0.2120，交付前逐项复算）**：
前缘边距 0.0120 + 触控板 0.0740 + 间隙 0.0050 + 键盘井 0.1090 + 铰链区 0.0120 = 0.2120。
**键盘自检**：6 行 × 0.0180 = 0.1080 ≤ 井深 0.1090；键帽纵向占位 5 × 0.0180 + 0.0150 = 0.1050 ≤ 0.1090；14 列 × 0.0190 = 0.2660 ≤ 井宽 0.2760；键帽横向占位 13 × 0.0190 + 0.0150 = 0.2620 ≤ 0.2760；79 ≤ 14 × 6 = 84 个槽位。
**屏幕自检**：0.2920 + 2 × 0.0060 = 0.3040 = W；0.1825 + 0.0060 + 0.0120 = 0.2005 ≤ D。
**高度自检**：顶面水平 → 任意 z 处闭合高都是 0.0115 + 0.0040 = 0.0155 = H；底面从 0.0006（后）斜升到 0.0051（前）。
**顶面自检**：7 条框条 + 触控板面 + 井底恰好铺满 y = 0.0115 平面且无重叠（前条 0.0120 + 触控板 0.0740 + 中隔 0.0050 + 井 0.1090 + 后条 0.0120 = 0.2120；横向 0.0140 + 0.2760 + 0.0140 = 0.3040，触控板左右 0.0870 × 2 + 0.1300 = 0.3040）。

**元件清单（合计 150 件，主档下限 140 的依据；实心件单列）**：
- 底座 5（底面 1 + 前/后/左/右 4）+ 顶面框条 7 + 切角 4 = 16
- 上盖 6 面 + 切角 4 = 10
- 键盘井 井底 1 + 侧壁 4 = 5
- 键帽 79（含空格）
- 触控板 面 1 + 侧壁 4 = 5
- 屏幕 可视区 1 + 黑边 4 + 背板 1 = 6
- 摄像头 1 + logo 1 = 2
- 接口 2 × USB-C（底 1 + 3 壁 = 4）× 2 = 8；耳机孔 底 1 + 内壁 1 = 2
- 散热格栅 2 框 + 8 片 = 10
- 脚垫 4
- 转轴 1 + 铰链盖 2 = 3
- 合计 = 16 + 10 + 5 + 79 + 5 + 6 + 2 + 10 + 10 + 4 + 3 = **150 件**；其中实心件（`10009008`）：转轴 1 + 脚垫 4 = 5 件（5/150 = 3.33% ≤ 5%），平面件 145/150 = 96.7% ≥ 95%。

**配色（写进 quad 的 color 字段，视觉方向：银灰极简、无花纹）**：
机身 #C9CDD4 / 键井 #1A1A1C / 键帽 #2A2A2E / 触控板 #B9BEC6 / 转轴 #8A8F96 / 接口 #4A4E55 / logo #E8EAED / 屏幕发光 #0E1B2A → #1B3A5C（按行渐变，越靠上越亮）。

**调用形态示例（照抄这三行，参数含义以此为准）**：

```js
gms.part('quad', { x: -0.1235, y: 0.0110, z: -0.0845, w: 0.0150, h: 0.0150, thick: 0.0010, normal: [0, 1, 0] })
gms.part('rod',  { x1: -0.1520, y1: 0.0115, x2: 0.1520, y2: 0.0115, z: -0.1000, size: 0.0040 })  // rod 只读 x1/y1/x2/y2 + 单值 z；z1/z2 被引擎忽略
gms.part('disc', { x: -0.1320, y: 0.000725, z: -0.0860, r: 0.0040, thick: 0.0006, axis: 'up' })
```

## 3. 路线与阶段（五阶段，每阶段：命令 + 产物）

1. **S0 预检**（`gms-modeling-preflight` + `model-build-test`）：`npm run build` 与 `npm test` 必须全绿；**先探测 http://localhost:8787 是否已有服务（HTTP 200 即复用，不要重复启动——端口占用时 `npm run web` 会 EADDRINUSE）**，需要时才起 `npm run web`；**把浏览器标签切到 http://localhost:8787/ 建模页并确认 `window.gms` 存在**（part 运行器取第一个标签页，页面不对会报 `PART_EXEC_ERROR: gms is not defined`）；浏览器操作只走 `browser-harness`（Edge CDP 9222 是唯一通道）；用 `gms.summary` 读标定，确认 canvasWidthPx / canvasHeightPx 非零并全程保留（任何重建 options 的路径都必须保留 canvasWidthPx —— model-build-test 坑 #17）。
   - 命令：`npm run build`、`npm test`、`npm run web`（仅在 8787 无服务时）、`npm run capabilities`；产物：exports/laptop/s0-preflight.json（含 8787 探测结果 + 当前标签 URL + window.gms 存在性）。
2. **S1 规格→关键点**（`gms-modeling-reference-fit`）：先算数、不画线。按 §2 生成关键点表（中心点 x/y/z + normal + w/h），先做 §2 的「方向核对」。
   - 命令：node 脚本按 §2 生成坐标 + 一次 0.1×0.1 quad 的网页核对；产物：exports/laptop/points.json（关键点 + conventions 实测映射，每点附来源规格行）。
   - **不得依赖 `roll`**（未实现，见 §2）；斜置元件用 normal 表达；确需平面内旋转（如四角切角的朝向）时按 §2 用 `gms.props` 覆写该 item 的 rotation。
3. **S2 粗骨架**（`gms-modeling-blockout`）：`gms.clear` 后只建底座（5 面 + 7 框条 + 4 切角）+ 上盖 6 面 + 转轴 rod，≤ 40 元件。
   - 命令：`bash scripts/run-gms-parts.sh` exports/laptop scripts/parts/laptop-base.js scripts/parts/laptop-lid.js；再 `scripts/capture-views.sh` http://localhost:8787/ exports/laptop/views `--views` iso,top,front,left,right,closeup；产物：exports/laptop/parts/partN.json、items.json、summary.json、exports/laptop/views/view-*.png 六张（read_image 逐张复核）。
4. **S3 细节**（`gms-modeling-detail`）：逐键帽 79 件 + 触控板 + 屏幕 + 黑边 + 摄像头 + logo + 接口 + 散热格栅 + 脚垫；累计 ≤ 350 元件；每加一批就截图复核一次。
   - 命令：`bash scripts/run-gms-parts.sh`（每批一个 part 文件）+ `scripts/capture-views.sh`；产物：exports/laptop/parts/partN.json、items.json、summary.json、每批截图。
   - 注意：`scripts/run-gms-parts.sh` 自己会往 **exports/laptop/ 根**写 5 张 view-*.png（view-iso/front/back/left + view-front-clean）；那与 `scripts/capture-views.sh` 写到 `exports/laptop/views/view-<名称>.png` 是两套产物，验收以 views/ 下六张为准，运行器那 5 张一并保留。
5. **S4 验证与导出**（`gms-modeling-verify` → `gms-modeling-export`）：先用 `gms.verify` / `gms.floating` / `gms.collides` / `gms.link` 逐项扫描；再跑 `scripts/inspect-draw-model.sh` http://localhost:8787/，输出必须含 source="POST /api/draw-model from window.gms.export()"、httpStatus 200、items 非空；然后走**导出主链**（见下）；最后做独立视觉复核。
   - **导出主链（唯一能施加 root 0.1 的路径）**：`npm run export-mesh` `--` exports/laptop/laptop-structure-in.json `--out-dir` exports/laptop `--format` both `--force` `--no-qa`。
     - **必须带 `--` 分隔**：npm 会把自己不认识的 `--format` 当成 npm 参数吞掉（实测报 `Invalid abbreviated flag "--format". Did you mean "--format-package-lock"?` 并 exit 1）；在 `npm run export-mesh` 后加 `--` 再接参数，实测 exit 0（等价写法：直接用 `node dist/src/cli/export-mesh.js` 接参数）。
     - 前置：/api/draw-model 返回的 items.json 是**裸数组**；export-mesh 要求 `items` 字段 → **另存**为 exports/laptop/laptop-structure-in.json，内容 `{"name": "laptop", "items": [...]}`（**不要覆盖 items.json**——它是运行器唯一命名的产物）。否则报 "export-mesh input must be a JSON object"。item 的 color 必须是对象 `{"enabled": true, "rgb": "0xRRGGBB", "opacity": 100, "overlay": "overwrite"}`（不是 hex 字符串，否则报 "structure.items[N].color must be an object"）。
     - 行为（均已实跑核对）：非 mesh item 原样透传（src/cli/export-mesh.ts:209）；无 mesh item 时门禁不拦截（gateRan = !noGate && meshes.length > 0，src/cli/export-mesh.ts:269）；root 0.1 由 makeGiaInput(name, structure.items) 在导出内部施加（src/cli/export-mesh.ts:319，ROOT_SCALE 默认 0.1，src/cli/gia-common.ts）。
     - 为什么必须带 `--no-qa`：QA 的一致性检查假设「面板化件数 = summary.budget.used」，纯 quad 透传导出下 budget.used = 0 → 必然误报「.structure.json items=N 与 summary.budget.used=0 不一致」并 exit 1（实测）；`--format` both 同时产出 .gil 以满足回读。用 `--no-qa` 时必须在 s4-verify.json 里写明这条理由。
     - 产物（名称取自输入的 name 字段）：exports/laptop/laptop.gia、laptop.gil、laptop.structure.json、laptop.summary.json；**退出码必须为 0**。
     - 验收读数：laptop.summary.json 的 model.itemCount 与 model.resources 列表（应全为 `10009003`，实心件为 `10009008`）；root 读数用 `python3 tools/gia/gia_parser.py` 时**必须给 `--json` 带一个输出文件名**（例如 `--json exports/laptop/parsed.json`；只写 `--json` 会报 `argument --json: expected one argument` 并 exit 2），再取 `versions[0].data.rootTransform.scale`（**默认 stdout 与 --summary 都不打印 rootTransform**），期望 ≈ [0.1, 0.1, 0.1]，且 `items[].data.values[0].transform.scale` 已按 ×10 补偿。
   - **网页副本（可选，不是交付主链、不能当 root 0.1 的证据）**：`/api/export` 的 rootTransform.scale = data.scale ?? [1,1,1]（src/web-shared.ts:351），默认不施加 root 0.1，且写 GMS_EXPORT_DIR（scripts/web-server.js:27）；若要用它，启动服务前设 GMS_EXPORT_DIR=exports/laptop。
   - **独立视觉复核**：python3 ~/.agents/skills/isolated-model-evaluator/scripts/evaluate.py --task-file exports/laptop/eval-task.md --provider aijws --model gpt-5.6-sol --tools read,bash --output-dir exports/laptop/eval（任务文件写清：读 exports/laptop/views/ 下六张 PNG，逐张报告破面/悬空/错位/比例问题，输出 JSON）。若该模型的 read 工具不渲染图像，则如实标注「视觉复核降级为用户人工确认」，不阻断交付。
   - 产物：exports/laptop/s4-verify.json（接触/缝隙/尺寸实测 + 独立 AABB 复算 + root 读数 + 视觉复核结论）。

**part 执行约定**：part 文件在页面上下文执行；`scripts/run-gms-parts.sh` 不会注入 `scripts/parts/lib/ganyu-lib.js`（只有 scripts/build-*.mjs 自己注入），所以每个 part 文件必须自包含 —— 自带 quad 包装函数，或先注入 lib 再执行；禁止依赖未注入的全局。

## 4. 硬门禁（违反即返工）

- 表面一律用 `gms.part` 的 `quad`（落到 `10009003` 平面）；**禁止**用 `10009001` 盒做表面（游戏里呈饼环堆叠）；实心件只用 `rod`（转轴）与 `disc`（脚垫），落到 `10009008`，且总数 ≤ 6 件；用 disc 的件必须满足 **y ≥ thick/2**（否则 `lift 参数非法`）。
- **禁止** `10009019` 网格直出 .gia（不带几何）；**禁止**用 jitterMesh 随机扰动造不规则 —— 不规则必须来自细分（`adaptiveAngularStops` / `subdivSurface`）。
- root = 0.1：由导出主链内部的 makeGiaInput 施加（src/cli/export-mesh.ts:319，`ROOT_SCALE` 默认 0.1）；若手改 root，必须位置与缩放同乘 1/`ROOT_SCALE` 双向补偿；**禁止**把 `/api/export` 当作 root 0.1 的证据。
- 无浮空（`gms.floating` 为空）、无穿模（`gms.collides` 为空）、所有接触经 `gms.link` 声明；可见缝隙 ≤ 0.001 m（引擎接触判定 `contact: gap <= 0.001`，web/index.html:3127；gap 取三位小数）。
- **门禁不可当唯一依据**：`gms.touches` 对 quad 用 AABB 且忽略 normal（web/index.html:2994-2996），平面件的接触判定会同时出现假阳性与假阴性 —— 必须另写 node 脚本读 items.json 逐对复算轴对齐盒间距并报告最大缝隙（见 §5）。
- 每批改动留 `iteration-records/NN-*.json` + 截图 + read_image 复核；回归立刻回退。
- 顺序铁律：先网页 1:1 预览通过（state.items 与 .gia 同源）→ 再导出 .gia → 再等用户游戏实测；**用户签字前不得宣称完成**。
- **禁止**用 `--no-gate` 跳过门禁；`--no-qa` 仅限导出主链并必须写明理由（见 §3-S4），不得用它掩盖其它 QA 失败。

## 5. 验收标准（逐条可核对）

- **尺寸（两态分开量，不要求同时成立）**：闭合态量外框（高前后一致 = 0.0155、顶面水平，误差 ≤ 0.002 m）；开合态量角度（100° ± 2°，此时上盖远端 y ≈ 0.2144）；四角为单张 45° 切角（等效半径 R 0.0100），**切角对真圆弧的最大偏差 0.002929 → 允许 ≤ 0.003**（不按弧长测量）；§2 布局预算逐项相加 = 0.2120。
- **结构**：items 合计 150（主档 140–350；降级档 40–90）；`10009003` 占比 ≥ 95%（实心件 5 件 → 5/150 = 3.33% ≤ 5%）；无 `10009001`、无 `10009019`。
- **接触**：`gms.verify` 通过（links 全接触、floating 空、collides 空）**并且**独立 AABB 复算报告无 > 0.001 m 的意外缝隙（因 touches 对平面无区分力，二者都要）。
- **视觉**：六视角（`--views` iso,top,front,left,right,closeup）截图非空白，read_image 逐张复核无破面 / 悬空 / 错位；独立视觉复核报告无阻断项。
- **导出**：导出主链退出码 = 0；exports/laptop/ 下 laptop.gia / laptop.gil / laptop.structure.json / laptop.summary.json 四件齐备且 .gia 字节 > 0；laptop.summary.json 的 model.itemCount = 150、model.resources 全为 `10009003`（实心件为 `10009008`）；用 `python3 tools/gia/gia_parser.py <gia> --json <outfile>` 读出 `versions[0].data.rootTransform.scale` ≈ [0.1, 0.1, 0.1]（`--json` 必须带输出文件名，见 §3-S4）；游戏内初始尺寸以用户实测为准。
- **终验（唯一人类门）**：用户进游戏实测并签字。

## 6. 排除项（不要什么）

- 不要 mesh 面板化路线；不要 `10009001` 盒体表面；不要随机扰动造面；不要依赖 `roll`（未实现；确需平面内旋转只能显式用 `gms.props` 覆写 rotation）；不要用 disc 表达横向长圆柱（转轴用 rod）；不要用一整张顶面盖住键盘井；不要用真圆表达摄像头/logo/耳机孔（quad 只有矩形）；不要外部依赖 / 新框架；不要改 package.json / web/index.html / 新增 CLI；不要跳过门禁；不要一次性画完（必须分阶段留证据）；不要把 `/api/export` 的产物当 root 0.1 证据；不要在无截图证据时宣称完成；除「游戏实测签字」外不要向用户提问。

## 7. 演示数据与降级档（开箱即用）

- **预置相机**：六视角截图直接用 `scripts/capture-views.sh` 的预设（`--views` 生效的就是这些值，不是另抄一套）：iso(yaw 0.65 / pitch 0.85)、top(0.65 / 0.12)、bottom(0.65 / π−0.12)、front(0 / 1.57)、back(π / 1.57)、left(π/2 = 1.5708)、right(−π/2)、closeup(0.65 / 0.85 / radius 0.8)。需要微调时才用 `setCamera`（projection 'perspective'，fov 50 → half-FOV 25°，可视高 = 2 × radius × tan(25°)）。
- **侧别对应（必须实测确认后写进 conventions）**：预设名按**相机方位**命名 —— left 预设 yaw = 1.5708 时相机在 +X 侧，看到的是 **x = +0.1520 那一侧（耳机孔）**；right 预设看到 x = −0.1520 侧（USB-C）。**不得凭名字推断左右**，S2 首次截图后核对并把结论写进 points.json 的 conventions。
- **预置示例数据**：§2 的布局预算 + 元件清单 + 三行调用形态即为演示数据，可直接跑通 S2 粗骨架。
- **降级档（预算超限时按序启用）**：① 键盘由 79 键帽降为整块色带（键盘本体 6–12 个色带块，整机 ≈40–90 个元件；触控板与屏内黑边必须保留）；② 格栅降为 1 条，logo 与摄像头点保留；③ 脚垫合并为 2 件。

## 8. 输出协议

- 每阶段**直接输出**：阶段名 / 命令原文 / 产物绝对路径 / 截图路径 / 自检数值；**不要附加**解释性散文。
- 失败时只报三行：错误原文 + 修复动作 + 复验命令。
- 收尾输出一段交付摘要：items 数、资源分布、尺寸实测值、root 读数、截图清单，以及一句「未获用户游戏验收，不得宣称完成」。

## 9. 参照锚定

- **现实参照**：MacBook 式银灰极简（楔形收薄、无花纹、按键等距、屏幕内黑边）。
- **仓库参照**：AGENTS.md 铁律 1–9（root 双补偿 / 平面不用盒 / 网页预览即 gate / 不规则来自细分 / 先工具后算法 / 网格不直出 / 每步留证据 / 仿人类建模顺序 / 细节靠关键点+算法连线）；`docs/capabilities.md`（命令、元件、阈值的单一来源）；`docs/mesh-panel-system-design.md`（面板化三层）；`docs/preview-camera-api.md`（预览相机）；PROMPT-ganyu-footballer.md（本仓提示词写法先例：点名真实 API + 硬门禁 + 分阶段证据 + 未签字不宣称完成）。
- **历史基线的适用边界（重要）**：delivery/r0-toes/ankle-bump-v12.gia（728 平面 / 0 三角）走的是 **mesh-panelize 路线**（其 summary 的 input 是 ankle-bump-v12-mesh.json），**不构成本路线（gms.part 直出 items → export-mesh 透传）的先例**；本路线的 root 行为必须在 S4 用 makeGiaInput 实测读数 + 用户游戏实测确认。
