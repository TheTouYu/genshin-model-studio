# Genshin Model Studio — 产品需求文档（PRD）

版本：v1.0（2026-08-11）
状态：已确认，进入开发
项目根：`/home/h/genshin-model-studio/`（家目录新建独立仓库）

---

## 1. 背景与定位

我们把"原神千星沙箱静态模型制作"的经验沉淀为一个**独立、开源、可被他人直接使用**的建模工具包：输入描述（JSON / 示例 / 网页操作 / AI 自然语言），输出游戏可加载的模型文件（`.gil` 候选 / `.gia`）。

仓库**不含任何游戏素材文件**，只含代码、文档、规则与资源 ID 引用（资源 ID 对应游戏内官方元件，属事实数据）。

一句话定位：**"输入描述 → 生成千星沙箱静态模型文件"的独立工具包 + 网页 + AI 技能文档**。

## 2. 用户画像与使用入口（四大入口，缺一不可）

| 入口 | 用户 | 形式 | 优先级 |
|---|---|---|---|
| ① AI 技能模式 | 有 AI 助手（pi/Claude Code/Cursor 等）的人 | 脱敏版 SKILL.md + references，AI 读后自动完成"人话 → 模型" | P0 |
| ② 手写数据结构 | 开发者 | structure.json 超集格式文档 + 资源 ID 速查表 | P0 |
| ③ 网页可视化 | 普通用户 | 上传/编辑数据、选择示例、画线建模、一键导出 | P1 |
| ④ 单命令 CLI | 所有人 | `gen-model <input.json> → <output>.gil/.gia` | P0 |

## 3. 功能需求

### FR1 核心引擎（P0，一切的基础）

- 输入：`structure.json` 超集（见 §6）。
- 模型规划器：参数化生成器，至少覆盖：房子（长方体 + 三棱柱屋顶）、长方体/平面、简单拼装、沿曲线铺放（等角螺线）、足球（复用已验证几何算法）。
- 编码器：`structure → .gil 候选`，**只编码不写回**（不依赖 genshin-ts 全仓库、不碰真实地图与本机路径）。
- 编码器参考 genshin-ts 的 wire 编码与 root 4/8/27 闭包实现（MIT），抽取最小子集，独立成库。
- 示例文件（内置，随仓库分发）：
  - 简单示例：房子、长方体、简单拼装；
  - 真实案例（脱敏后内置）：足球、球门/足球网、等角螺线。

### FR2 单命令 CLI（P0）

- `gen-model house.json` → 输出 `.gil` 候选 + 对应 structure.json + 摘要。
- 后续支持 `--format gia` 输出 `.gia`（依赖 FR6）。

### FR3 资源速查表（P0）

- 官方基础元件 ID + 尺寸语义（如 10009001 = 1×1×1 长方体、10009005 = 外接圆直径 1 的五棱柱）。
- 存在于三处：README 附录、`docs/input-format.md`、网页内置。
- 这是陌生人最大的知识门槛，必须显式提供。

### FR4 网页（P1，二期）

- 静态网页（无后端），功能：
  1. 数据文件区：粘贴 / 上传 / 在线编辑 JSON；
  2. 示例库：一键加载 FR1 的全部示例；
  3. 导出区：一键下载 `.gil` 候选 / `.gia` 与 structure.json；
  4. 模型预览（若成本可控，先用文本/结构摘要，不做 3D 渲染）。

### FR5 画线建模（P2，三期，可选）

- 小画板：用户画线 → 算法抽取坐标/颜色 → 自动转建模输入（沿曲线铺放）。
- 明确为增强项，不阻塞一期二期。

### FR6 GIA 输出（P0 研究 / P1 实现）

- 破译 `.gia` 容器格式（20 字节头 + protobuf 主体 + 尾部）。
- 样本资产（已确认存在，结构一致）：
  - `C:\Users\touyu\AppData\LocalLow\miHoYo\原神\BeyondLocal\Beyond_Local_Export\user_edit\模型\等角螺线.gia`（401,378 字节）
  - 同目录 `足球.gia`（277,019 字节）
  - WSL 路径：`/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/模型/`
- 破译后产出：格式文档 + 编码器，`structure.json → .gia`。
- 若样本不足以闭合规则，再配合用户做受控实验（增量调查流程）。

### FR7 AI 技能文档（P0）

- 脱敏版 SKILL.md + references：保留技术结论（校准规则、曲线铺放算法、ID 区间、颜色编码等），个人路径/真实地图 ID/PKC 依赖占位化或删除。
- 作为入口①的说明书，同时是仓库的"最强文档"。

## 4. 非功能需求

- **零游戏依赖**：核心引擎 + CLI + 网页可在无 genshin-ts、无游戏环境下运行。
- **单命令可跑**：clone → install → `gen-model examples/house.json` 出结果。
- **MIT 许可**；README 声明：不含游戏素材，资源 ID 仅为游戏内官方元件引用。
- **确定性**：相同输入必得相同输出（便于测试与回放）。
- **测试**：核心编码器有最小自动化测试（golden files：给定输入 → 期望字节）。

## 5. 技术选型

- 语言：**TypeScript**（核心引擎、CLI、网页共用一套代码，网页可在浏览器直接运行）。
- 运行时：Node.js ≥ 20；CLI 用 `tsx` 直接跑 TS，或编译后分发。
- 网页：静态页（Vite 或纯 TS 构建，不引后端）。
- 依赖最小化：不引入不必要第三方库；二进制编码自实现（参考 genshin-ts MIT 实现）。

## 6. 输入格式（structure.json 超集）

```jsonc
{
  "name": "house",            // 模型名
  "template": "空模型",        // 宿主模板（自定义元件）
  "position": [0, 0, 0],      // 场景层 Transform（可选）
  "rotation": [0, 0, 0],
  "scale": [1, 1, 1],
  "items": [                  // 装饰物列表（局部 Transform）
    {
      "resourceId": 10009001, // 官方基础元件 ID
      "position": [0, 0.5, 0],
      "rotation": [0, 0, 0],
      "scale": [6, 0.02, 4],
      "color": { "enabled": true, "rgb": 0xFFFFFF, "opacity": 100, "overlay": "overwrite" }
    }
  ]
}
```

- 完整字段文档见 `docs/input-format.md`（含资源速查表、坐标语义、颜色编码）。
- 生成器输出与手写输入共用同一格式（生成器 = 把高级描述展开成 items）。

## 7. 架构

```
输入（JSON / 示例 / 画线 / AI 自然语言）
   │
   ▼
模型规划器（参数化生成器：房子/长方体/曲线铺放/足球/画线→items）
   │
   ▼
structure.json 超集（中间格式，可手写、可导出）
   │
   ▼
编码器（structure → 二进制）
   ├── .gil 候选（root 4/8/27 闭包 + wire 编码，只编码不写回）
   └── .gia（容器头 + protobuf 主体，FR6）
   │
   ▼
产物（可下载/可交给 genshin-ts 适配器写回真实地图）
```

- **写回真实地图不在本仓库范围**：作为可选适配器示例或用户自行接入 genshin-ts。
- 网页与 CLI 共用同一 `core` 模块。

## 8. 里程碑分期

| 期 | 内容 | 出口标准 |
|---|---|---|
| 一期 | 项目骨架 + GIA 结构研究（并行）+ 核心引擎 + CLI + 示例库 + AI 技能文档 | `gen-model examples/house.json` 产出 .gil 候选；GIA 格式文档 + 编码器可用 |
| 二期 | 网页（上传/示例/导出）+ .gia 输出联调 | 网页可加载全部示例并导出 .gil/.gia |
| 三期 | 画线建模 | 画线 → 自动建模 → 导出 |

## 9. 一阶段任务拆分（两个任务并行）

### 任务 A：项目骨架（P0）

- 在 `/home/h/genshin-model-studio/` 新建项目：
  - `package.json`、`tsconfig.json`、目录结构（src/core、src/cli、src/web、docs、examples、tools）；
  - README 骨架（定位/四大入口/快速上手/资源速查表初稿/边界声明）、LICENSE（MIT）；
  - `gen-model` CLI 骨架（参数解析 + 示例 house.json 可跑通）；
  - 核心编码器最小实现：structure → .gil 候选（抽取 genshin-ts wire/闭包编码）；
  - golden-file 测试最小集；
  - 示例文件：房子、长方体、简单拼装（真实案例待 GIA 任务产出后补充）。
- 验收：`npm install && npm run gen-model examples/house.json` 产出有效 .gil 候选；测试通过。

### 任务 B：GIA 结构研究（P0，独立子代理）

- 输入：§FR6 两个样本 .gia 文件。
- 目标：完整破译容器格式（文件头 20 字节字段语义、protobuf 主体消息树、尾部），输出：
  - `docs/gia-format.md` 格式文档；
  - `src/core/gia-encoder.ts`（或等价）编码器：structure.json → .gia，对两个样本可回放/字节级对比验证。
- 约束：样本不足时不猜字节（fail-closed），登记未闭合项，必要时向用户请求受控实验。

## 10. 明确不做（本期）

- 不写回真实地图（.gil 写回 = genshin-ts 适配器，另行提供示例）；
- 不打包任何游戏素材文件；
- 不实现节点图/玩法逻辑；
- 不做 3D 网页渲染（一期二期）；
- 不做 .gia 解析回 structure 的逆向（除非用户需要）。

## 11. 验收标准（总）

1. 陌生人在无 genshin-ts、无游戏环境下：clone → install → 用 README 任一路径（AI/手写/网页/CLI）生成一个模型文件。
2. 输出 .gil 候选结构与真实地图闭包规则一致（可交给 genshin-ts 写回）。
3. 输出 .gia 与两个样本格式一致（可被游戏加载，用户核验）。
4. 示例库包含：房子、长方体、简单拼装、足球、球门、等角螺线。
5. 核心引擎确定性：相同输入 → 相同字节输出。
6. 全仓库 `git diff --check` 干净，测试通过。

## 12. 风险与对策

| 风险 | 对策 |
|---|---|
| .gia 结构样本不足无法闭合 | fail-closed 登记未闭合项；用户配合受控实验（增量调查流程） |
| .gil 编码抽取不完整（依赖 genshin-ts 内部实现） | 以 golden-file 对比 genshin-ts 输出；必要时标记"适配器需在 genshin-ts 环境验证" |
| 网页一期做不完 | 网页明确为二期，不阻塞 CLI/AI 路径 |
| 示例资产含个人路径/ID | 脱敏后再入库；真实案例仅保留结构数据 |

---

## 附：已确认决策记录

- 核心引擎语言：TypeScript（用户已拍板）。
- .gia 输出：必须做（用户 100% 确定，有样本）。
- 仓库位置：`/home/h/genshin-model-studio/`（家目录）。
- 一期两个任务并行：A 项目骨架、B GIA 结构（各自独立子代理执行）。
- 执行方式：主会话（本会话）指挥子代理执行任务；B 任务单独一个子代理。
