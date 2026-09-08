# 06 — 技能与知识重构（链式子技能 + 网格规则）

**What to build:** 把单一大建模技能拆成链式可加载子技能（预检 / 参考拟合 / 粗模 / 细节 / 验证 / 导出）+ 索引页；画法铁律增补网格章节（网格元件、面板化导出、验证门禁、诚实边界）；网格/放样/验证能力做编目（可发现、可运行、参数说明），使新模型在不依赖隐藏上下文的前提下完成一次完整建模。

**Blocked by:** 02（网格到最小单元导出器）+ 03（网格验证门禁）

**Status:** in-progress（2/3 验收达成：规则一致 ✅ + 编目 ✅；子技能独立加载 ✅；唯一保留 = 独立模型「水杯链」待评，见 §未完成项 2）

- [x] 画法铁律网格章节与 02/03 的实际行为一致（门禁/导出/面板化内容不漂移）
- [x] 能力编目可被「发现-选择-运行」，参数说明与真实接口一致
- [ ] 干净上下文按子技能链完成一个标准任务（如水杯），且每个子技能可单独加载

## 验收处理（2026-09-07）

### 1. 干净上下文按子技能链完成标准任务 + 每个子技能可单独加载 — **部分达成 / 待评**

- **可单独加载**：已达成。`tests/mesh-rules.test.ts` 的「子技能 lint」解析全部 `.dsh/skills/gms-modeling-<stage>/SKILL.md`：front-matter（name/description）存在、六个名字唯一、主技能 §0 路由引用名与文件名一致（`gms-modeling-<stage>` ⇔ 目录名）、正文提及的命令均在 `package.json` scripts 找到、未写禁用字段（disable-model-invocation / user-invocable）。已随 `npm test` 全绿（147/147）。
- **干净上下文跑链**：**待评**。`isolated-model-evaluator` 的 `evaluate.py` 需调用 Pi 模型（默认 provider `opencode-go`）+ API 凭据并产生调用成本；本会话为 delegated 子代理、无法新增付费/凭据，故未执行。验收项保留未勾。若具备凭据：`python3 ~/.pi/agent/skills/isolated-model-evaluator/scripts/evaluate.py --root <repo> --skill <repo>/.dsh/skills --task-file <水杯链任务>.md --provider opencode-go --model deepseek-v4-flash --timeout 1500`。

### 2. 画法铁律网格章节与 02/03 行为一致 — **已达成**

- `docs/drawing-rules.md` 追加「§6 网格-面片体系铁律（G18–G25）」，阈值逐字取自 `src/mesh/verify.ts` / `panelize.ts` / `contour-loft.ts` 的 `const DEFAULT_*`。
- `tests/mesh-rules.test.ts`（Part 1）读取三个源码文件的 `const DEFAULT_*` 常量，断言规则文档（drawing-rules.md §6 / 主技能补丁 / 子技能）中出现相同默认值字符串。随 `npm test` 全绿。
- 实测核验（`contour-model`）：foot 示例 `points=64 cap both` → gate=passed（skinny 2.78% ≤ 5%）；`points=200 cap both` → gate=failed（瘦长三角 675 个、占比 18.75% > 5%），确认文档「64 设计预算档 / 200 触发门禁」与实现一致。

### 3. 能力编目可「发现-选择-运行」，参数与真实接口一致 — **已达成**

- `scripts/list-capabilities.mjs` → `docs/capabilities.md` + `docs/capabilities.json`（注册到 `package.json` 的 `capabilities` script）。覆盖：6 个 CLI（名称/命令/参数/输出/源码）、gms 命令组（几何/组件/物理声明/工具 + part 类型）、网格验证阈值、官方基元资源表。
- `tests/capabilities.test.ts` 断言：package.json scripts 中的官方 CLI 都在编目里；编目引用的源码文件存在、command 可运行；网格阈值与源码 `const DEFAULT_*` 逐字一致；编目 gms 命令在 `web/index.html` 的 `window.gms = {…}` 真实存在、part 类型在 `const TYPES = […]` 真实存在。随 `npm test` 全绿。

## 相对交付物清单的完成/未完成

| 交付物 | 状态 | 说明 |
|---|---|---|
| ① 六个子技能 `gms-modeling-{preflight,reference-fit,blockout,detail,verify,export}/SKILL.md` | ✅ | 均已创建，front-matter 仅 name/description，可独立加载 |
| ② 主技能 §0 链式路由 + §11 网格-面片体系 | ✅ 已应用 | 主会话已把 `.scratch/mesh-system/issues/06-main-skill-patch.md` 的位置 A（§0）与位置 B（§11）写入 `/home/h/.pi/agent/skills/model-build-test/SKILL.md`（仅追加；现 644 行，`grep '^## '` 确认 §0 与 §11 存在；`npm test` 147/147 无回归） |
| ③ docs/drawing-rules.md 网格-面片体系铁律（G18–G25） | ✅ | 已追加 §6 |
| ④ 能力编目 `list-capabilities.mjs` → `docs/capabilities.{md,json}` + 轻量测试 | ✅ | 脚本、编目、`capabilities.test.ts` 均完成 |
| ⑤ 本 issue 验收项逐项处理 | ✅ | 见上方验收处理 |

## 未完成项（如实）

1. ~~主技能 SKILL.md 更新未写入目标文件~~ → **已解决**：主会话已把补丁位置 A/B 应用到 `/home/h/.pi/agent/skills/model-build-test/SKILL.md`（§0 链式路由 + §11 网格-面片体系，仅追加；`npm test` 全绿）。
2. `isolated-model-evaluator` 水杯链未跑（需 LLM provider 凭据/成本）——验收项 1 保留未勾，标记「待评」。具备凭据时执行：`python3 ~/.pi/agent/skills/isolated-model-evaluator/scripts/evaluate.py --root /home/h/genshin-model-studio --skill /home/h/genshin-model-studio/.dsh/skills --task-file <水杯链任务>.md --provider opencode-go --model deepseek-v4-flash --timeout 1500`（是否执行属于用户预算决策）。
