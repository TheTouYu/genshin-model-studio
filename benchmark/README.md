# Genshin Model Studio · A/B 基准测试体系（benchmark/）

把《压缩三维为二维》论文的工程范式引入本项目，并用客观 A/B 测试驱动与验证每一轮优化。
设计依据：`docs/principles/voxel-2d-paradigm.md`；架构决策：`docs/adr/0003-voxel-2d-paradigm-and-benchmark.md`。

## 结构

```
benchmark/
  protocols/           版本协议文本（v0 直接生成 / v2 分层 2D 推理 / v3 自检回退）
  tasks/T1..T5/        五类基准任务（冻结：prompt.txt / spec.md / validator.ts，hash 见 hashes.json）
  runs/roundN/         每轮原始输出存档（{A,B}-T{n}-r{k}.json）+ scores.json
  results.json         得分趋势表（每轮 A/B 对比 + 采纳判定）
  README.md            本文档
src/benchmark/         框架代码（types/geo/parse/repair/tasks/versions/runner）
tests/benchmark.test.ts 框架单元测试（校验器自检/确定性/修复幂等/解析容错）
```

## 五类任务（对应论文五类任务）

| ID | 任务 | 论文对应 | 校验方式 |
|---|---|---|---|
| T1 | 精确规格石亭（6 元件逐条规格） | 精确规格小屋 | 元件级 IoU + 特征分解（GT 由校验器生成） |
| T2 | 旋转 90°+平移变换 | 坐标旋转变换 | 变换公式逐点核对（对 GT 施加同一变换） |
| T3 | 拱桥（N 由规则推导，不给出总数） | 螺旋楼梯塔 | 模式与规则一致性（网格/步长/支撑/无缺口） |
| T4 | 自由生成四腿桌（只给功能要求） | 自由生成小屋 | 结构不变量（贴地/支撑/净空/对称/比例/无穿模），每轮 2 次取均值 |
| T5 | 箱体重力（4 箱含悬空） | 重力物理 | 确定性重力求解器（列式分解）+ 支撑不变量 |

## 版本（被比较的变量）

| 版本 | 协议 | 管线 |
|---|---|---|
| v0 | 直接生成（基线） | identity（原样） |
| v1 | 同 v0 协议 | repair（校验修复：贴地吸附/支撑修复/轴对齐吸附/去重） |
| v2 | 分层 2D 推理（论文范式） | repair |
| v3 | 分层 2D 推理 + 自检回退 | repair |

## 运行流程（每轮）

1. 两个持久会话：A「基线」、B「候选」（同一模型配置，被比较变量只有版本）；
2. 向 A 发送「协议 v_{n-1} + 任务提示词原文」，向 B 发送「协议 v_n + 同一任务提示词」；
3. 原始输出存档到 `runs/roundN/`（含 promptSha256）；
4. `npm run benchmark -- score-round --round N --a-version vX --b-version vY` 打分并更新 results.json；
5. 采纳规则：B 全部任务得分 ≥ A 才采纳，并把新版本回灌 A（A 升级为 v_n）进入下一轮；否则回滚并分析。

## 会话操作协议（公平性执行细节）

- 会话系统提示词两会话逐字一致（仅身份标记 A/B 不同）；协议文本由消息内联下发（会话禁止读 benchmark/）；
- **发一条 → 等该回合结算通知 → 存原始输出 → 再发下一条**。不得在消息排队期间重复发送（2026-08-15 事故：重复发送使会话产生"元评论"回合，输出被污染）；
- 会话输出仅为推理文字、未落地 JSON 时：如实存档（parse_ok=false 记 0 分），不补发、不重试（重试会破坏"一次提示词一次输出"的客观性）；
- 若会话历史因操作事故被污染（重复消息/无关内容），弃用该会话、换全新会话重跑整轮，旧存档保留为诊断证据（runs/roundN/OLD-*.json，不参与打分）。

## 客观性规则（不可妥协）

1. 任务提示词逐字相同：每份存档记录 promptSha256，runner 与冻结 hash 双重校验，不一致 = 运行失败，拒绝写结果；
2. 校验器纯确定性、与模型无关、模型不可见；结果以脚本重算为准，不采信会话自述；
3. 任务文件先冻结后优化（`freeze` 记录 hash，`check` 校验）；修改必须走勘误流程（改文件 → freeze 记录 errata → `score-round --rescore` 全量重算历史轮次）；
4. 原始输出全存档（`runs/roundN/*.json`），可离线重算（`--rescore`）。

## CLI

```bash
npm run benchmark -- freeze               # 冻结任务文件并记录 sha256
npm run benchmark -- check                # 校验冻结 hash 与当前文件一致
npm run benchmark -- score-round --round 1 --a-version v0 --b-version v1
npm run benchmark -- score-round --rescore # 按 results.json 记录全量重算（勘误流程）
npm run benchmark -- report               # 打印趋势表
```

## 公平性约定（会话侧）

- 会话系统提示词（两会话逐字一致）：只按消息中的【协议】与【任务】建模，只输出 JSON；
  禁止读取 benchmark/、docs/adr/、docs/REVIEW.md、examples/；不与其他会话通信；
- 校验器实现、对方输出、汇总分数一律不进会话（信息暴露对称，防止污染对比）。

## 方法学（论文教训）

- 小样本结论方向性：T4 每条件 2 次取均值；趋势表跨轮观察；
- 方向翻转容错：盒体绕 Y k×90° 等价类规范化（不算加分）；
- 悬空判定警惕误报：支撑检查用"底面投影重叠"（角支撑有效），重力用"中心点"（与提示词一致）；
- 评分器缺陷发现即修：改后 `--rescore` 全量重算（原始输出存档保证可重算）。
