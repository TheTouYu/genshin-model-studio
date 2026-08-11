# Genshin Model Studio

[GitHub 仓库](https://github.com/TheTouYu/genshin-model-studio) · 输入描述 → 生成千星沙箱静态模型文件（`.gil` 候选 / `.gia`）的独立工具包。

把"原神千星沙箱静态模型制作"的工程经验沉淀为开源工具：手写 JSON、AI 助手、
网页或单命令 CLI，产出**游戏可加载的静态元件闭包**（空模型宿主 + 官方基础元件
装饰物）。本仓库**不含任何游戏素材文件**，只含代码、文档、规则与资源 ID 引用
（资源 ID 对应游戏内官方元件，属事实数据）。

> 一期（当前）：核心编码器（.gil 候选 + .gia）+ CLI + 示例 + golden 测试。产物只做**候选**
> 输出（不写回真实地图）；网页为二期。

## 四大入口

| 入口 | 用户 | 形式 | 状态 |
| --- | --- | --- | --- |
| ① AI 技能模式 | 有 AI 助手（pi / Claude Code / Cursor）的人 | 脱敏版 SKILL.md + references | 见 genshin-ts 技能 `static-gil-model-builder` |
| ② 手写数据结构 | 开发者 | [`docs/input-format.md`](docs/input-format.md)（全字段 + 资源速查表） | ✅ 一期 |
| ③ 网页可视化 | 普通用户 | 上传/编辑/示例/导出 | 二期 |
| ④ 单命令 CLI | 所有人 | `gen-model <input.json>` → `.gil` 候选；`gen-gia <input.json> <out.gia>` → `.gia` | ✅ 一期 |

## 快速上手

```bash
npm install
npm run build
npm run gen-model examples/house.json
# 或一条命令（自动先构建）：
npm run gen-model examples/box.json
npm run gen-gia examples/football.json out.gia   # .gia 输出（GIA 格式破译自真实样本）

node dist/src/cli/gen-model.js --list-resources   # 可选：打印资源速查表
```

输出（默认与输入同目录，`--out-dir` 可改目录）。重复生成需覆盖时，
经 npm 传参要用 `--` 分隔（`--force` 会被 npm 自身吞掉）：

```bash
npm run gen-model -- examples/house.json --force
```

```text
house.gil                .gil 候选（最小新地图骨架 + 静态元件闭包 root 4/6/8/27）
house.structure.json     规范化后的输入（可回灌）
house.summary.json       摘要（ID 计划 / 字节数 / SHA-256 / 回读状态）
```

```bash
npm test                 # golden-file 测试（17 条：字节 golden + 确定性 + 回读 + 拒绝路径）
```

## GIA 输出

`.gia` 编码器（`src/gia/gia-encoder.ts`）基于两个真实样本（足球/等角螺线）破译的容器格式：
20 字节 BE 头 + protobuf Root + 4 字节尾，与 GIL 同一容器约定。格式细节、字段映射与未闭合项见 [`docs/gia-format.md`](docs/gia-format.md)。

```bash
npm run gen-gia examples/football.json out.gia   # structure.json 超集 → .gia
node dist/src/gia/gia-encoder.js examples/equiangular-spiral.json out.gia
```

回放验证（解析重建文件并与样本对比）：

```bash
python3 tools/gia/roundtrip.py examples/../tools/gia/samples/football.gia
```

## 示例

`examples/`：`house.json`（房子）、`box.json`（长方体）、`simple-assembly.json`（简单拼装）、
`football.json`（足球 132 项）、`equiangular-spiral.json`（等角螺线 801 项，真实导出）。

## 架构

```text
输入（structure.json 超集 / 示例 / AI 自然语言）
   │
   ▼
模型规划器（参数化生成器：房子/长方体/简单拼装/曲线铺放/足球 —— 后续迭代）
   │
   ▼
structure.json 超集（中间格式，可手写、可导出）
   │
   ▼
编码器（src/core/encoder.ts：structure → .gil 候选；src/gia/gia-encoder.ts：structure → .gia）
   ├── .gil：最小新地图骨架（maps:create 同构，确定性占位）+ 静态元件闭包 root 4/8/27 + root 6 页签
   └── .gia：20B 头 + protobuf Root（版本单元 + 装饰物项单元），逐字节对齐真实样本
   │
   ▼
产物（候选 .gil / structure.json / 摘要 —— 可交给 genshin-ts 适配器写回真实地图）
```

编码参考 genshin-ts（MIT）的 wire/闭包实现抽取最小子集，语义逐一对齐
（`src/core/binary.ts`、`wire.ts`、`official-resources.ts`、`encoder.ts`、`readback.ts`）。

## 资源速查表（初稿）

完整版见 [`docs/input-format.md §资源速查表`](docs/input-format.md)。

| resID | 元件 | 尺寸语义（scale=1） |
| ---: | --- | --- |
| 10005018 | 空模型 | 宿主模板，无可见几何 |
| 10009001 | 长方体 | 1×1×1；scale=[宽,高,长]，长轴=Z |
| 10009002 | 球体 | 直径 1 |
| 10009003 | 平面 | 1×1（未校准） |
| 10009004 | 三棱柱 | 高 1，底面外接圆直径 1；顶点朝 -Z |
| 10009005 | 五棱柱 | 高 1，底面外接圆直径 1；顶点朝 -Z |
| 10009006 | 三棱锥 | 未校准 |
| 10009008 | 圆柱 | 截面直径 1；零旋转轴向 Y |
| 10009009 | 圆锥 | 未校准 |
| 10009010/11 | 线框长方体/圆柱 | 未校准 |

## 边界声明

- **不写回真实地图**：`.gil` 候选的写回 = genshin-ts 适配器职责（`apply-candidate`
  哈希安全门、ID 双查、Temp 同步），本仓库只产出候选与可回读结构。
- **不含游戏素材**：仓库无任何游戏资源文件；resID 仅为游戏内官方元件引用。
- **一期不实现**：节点图/玩法逻辑、3D 网页渲染、`.gia`→structure 逆向、写回真实地图（由 genshin-ts 适配器提供）。
- **候选 ≠ 游戏核验**：`compatibility=not-proven`；闭包结构正确不代表编辑器/游戏视觉
  已通过。尺寸/颜色语义以 `docs/input-format.md` 的校准记录为准，未校准资源
  首次用于精确模型前先做最小校准板。
- **确定性**：相同输入 ⇒ 相同字节输出（golden 测试保证）。

## 测试

```bash
npm test
```

golden 断言（`tests/golden/*.gil.hex`）+ 确定性 + 编码后自检回读 + 输入拒绝路径。
候选与 genshin-ts 只读工具交叉验证示例：

```bash
node /home/h/genshin-ts/bin/gsts.mjs assets:static-assemblies inspect --gil examples/house.gil
node /home/h/genshin-ts/bin/gsts.mjs assets:static-assemblies export  --gil examples/house.gil
```

## License

MIT（见 [LICENSE](LICENSE)）。编码器/wire 原语抽取自 [genshin-ts](https://github.com/josStorer/genshin-ts)（MIT）。
