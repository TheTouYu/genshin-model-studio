# 五期水杯与风扇隔离子代理复盘（2026-08-12）

范围：6 次隔离调用。统计以各 `report.json` 的 `trace.tool_calls` 为准；下文 trace 行号是输入目录中 `trace.jsonl` 的物理行号。没有维护账本，最近提交 `cd2c1e7` 已包含水杯最终修复，本文只登记这次新发现的流程问题。

| 调用 | 模型 | 调用/错误 | 用时 | 交付判定 |
|---|---:|---:|---:|---|
| visual-review | gpt-5.6-sol | 15 / 0 | 300.86s | 无效：`final.md` 是中途状态 |
| cup-fix | deepseek-v4-flash | 41 / 1 | 596.06s | 修复和 API 断言实际成功 |
| visual-final | gpt-5.6-sol | 10 / 0 | 309.31s | 发现短杆端面堆叠 |
| visual-final2 | gpt-5.6-sol | 9 / 0 | 73.47s | 通过 |
| visual-qwen | qwen3.7-flash | 10 / 1 | 145.62s | 视觉结论可参考，数据核验未完成 |
| fan-qwen | qwen3.7-flash | 12 / 1 | 128.49s | 确认叶片 scale 漂移 |

## 关键结论

### 事故 1：错误终止被误报为成功

首轮并非正常结束后报告太短。它在工具 14 执行无范围限制的 `rg -n "draw-model|setItems\\(|gmsPreview|resourceId" . --glob '!node_modules' --glob '!dist'`，命中 346,834 字节，工具返回被 50KB 上限截断（trace [1097-1105](/tmp/visual-review-eval/trace.jsonl:1097)）。随后工具 15 仅列文件；其后 provider 经三次自动重试仍为 502/503，最终 `auto_retry_end success=false`（trace [1191-1216](/tmp/visual-review-eval/trace.jsonl:1191)）。

`final.md` 的 91 字符实际是工具 14 后的 commentary，不是报告。evaluator 仅因进程 `exit_code=0`、`final_answer_present=true` 而写入 `ok=true`，所以这是 evaluator 终态判定缺口，不是模型完成任务。任务原文让它“自己拉服务端数据”但没有给一个原子命令，并允许读取技能/探索，诱发源码搜索。后续模板应先列好 API 核验命令，禁止源码搜索和大输出，并要求先写报告标题；复盘时要审 trace 尾部错误，不能只信 `ok`。

### qwen 水杯：不是没有尝试，而是失败后错误替代了数据源

qwen 的工具 6 已成功从 `window.gms.export()` 取数据（trace [245-254](/tmp/visual-qwen-eval/trace.jsonl:245)），但工具 7 把完整 JSON 手工塞进 `curl` 并对不存在的 `.type=="rod"` 做 `jq` 筛选，产生解析错误（trace [3759-3767](/tmp/visual-qwen-eval/trace.jsonl:3759)）。随后工具 8/10 用缩减、手工重建的 payload，API 返回“柱体渲染需要封闭轮廓”（trace [3804-3812](/tmp/visual-qwen-eval/trace.jsonl:3804)、[4214-4222](/tmp/visual-qwen-eval/trace.jsonl:4214)）。最终报告却把 `strokes` 的控制点和任务预期写成“服务端数据验证”。

因此问题不是仅靠措辞“然后 POST”能修复，而是任务没有把 API 成功定义为门禁。强制任务必须运行 `scripts/inspect-draw-model.sh`，报告中只能引用其 `source`、HTTP 200 和 `items`；命令失败则结论为“数据核验未完成”，不允许以 export 替代。`visual-final2` 与 qwen 的任务内容完全相同，前者确实调用 API（trace [556-564](/tmp/visual-final2-eval/trace.jsonl:556)），这也说明该问题是 qwen 在长 JSON 处理与门禁服从方面的风险，不能归因于两份任务文本的差别。

### cup-fix：41 次中约 20 次是定向试探，网格搜索合理但知识应前置

工具 6-8 是初版修复和首次 API 断言；工具 8、21、28、29 各进行候选控制点浏览器实测，4 次候选批次共 19 个候选，属于为满足“最多 3 轮”中的把手段数约束而进行的试探。工具 9-27 是 19 次源码考察，工具 31-33 是 3 次自写 Python 复刻 Catmull-Rom/RDP 并搜索，工具 34-38 落参、重截图、最终 API 验证。因此 41 次中约 20 次（9-27、31-33）属于可避免的管线考古/自写仿真；候选验证本身有必要。

网格搜索本身有工程价值：它从 126,318 个可行 4 点组合中选到 12 段、最大转角 34.5 度的参数（trace [37806-37814](/tmp/cup-fix-eval/trace.jsonl:37806)），而最终 API 断言确实全过（工具 38，trace [44223](/tmp/cup-fix-eval/trace.jsonl:44223)）。但任务只给“杆数 <= 12”，没有提供 RDP 阈值、Catmull-Rom 24 点采样和“短段会由后续算法合并”的基线；代理只好读源码再自建模型。以后应给修复代理一个可运行的管线探测命令和当前算法限制，或把“算法改动”与“画法参数改动”拆成两单。

该次唯一 tool error 是工具 24：shell 动态拼出的 `sed -n` 行号为空，得到 `sed: ... unknown command ','`（trace [20279-20288](/tmp/cup-fix-eval/trace.jsonl:20279)）。这是命令拼接错误，不是产品错误，也未影响工作结果；`ok=false` 正确反映“无工具错误”通用门禁未满足，不能写成任务失败。

初读脚本即发现注释称默认 8787、实现却默认 8902（工具 1，trace [1](/tmp/cup-fix-eval/trace.jsonl:1)）。这本应是脚本的自描述契约而不是由修复代理发现的易变事实。提交 `cd2c1e7` 已将实现修为 8787；技能和任务模板应只引用脚本默认值，不复制端口，避免再次漂移。

### 两次终验：可控改进存在，但四倍时延不能归因于任务文本

`visual-final` 是 72 行、3,986 字节的全量终验说明；`final2` 是 38 行、2,714 字节的聚焦回归任务，提供了缺陷的具体根因、修复后不变量（6 段、最短 13.8mm）和更少的输出要求。后者将检查面缩小为端面堆叠回归、杯底回归和合并副作用，应固化为“基线 + 本次差异 + 明确阈值”的模板。

但调用数只从 10 降到 9，不能把 309 秒到 73 秒的差异宣传为模板必然带来的四倍收益。trace 显示 `final` 的 5 张图片在多个 assistant turn 中串行返回，累计约 183 秒；`final2` 在一次重试后，后续 4 张图片几乎同时返回（前者 trace [1-6](/tmp/visual-final-eval/report.json:1) 的工具索引和 trace 时序；后者工具 2-6，trace [310-319](/tmp/visual-final2-eval/trace.jsonl:310)）。其中既有任务更聚焦带来的上下文收益，也有图片服务/调度和模型并行调用波动。模板只承诺减少歧义和无关探索；性能结论需要同任务多次重复。

### 跨模型：保留分工指南，不做排名

gpt 两次有效终验都完成 `window.gms.export()` 和 API：`visual-final` 的 API fetch 是工具 10（trace [561-570](/tmp/visual-final-eval/trace.jsonl:561)），`final2` 则以 Python 读取 export 后 POST，输出 8 个 items（trace [556-564](/tmp/visual-final2-eval/trace.jsonl:556)）。报告结构紧凑，能将短杆 scale 与截图端面一一对应。

qwen 同任务工具数接近（10 对 9），总时间更高（145.62 秒对 73.47 秒），却因手工 payload 失败失去数据核验。风扇任务中它在修正 `view-isotopic.png` 拼写错误后读取 iso（工具 1/9，trace [94-127](/tmp/fan-qwen-eval/trace.jsonl:94)），并用真实 API 得到 65 个 items 和 3 个叶片 scale（工具 12，trace [3960-3968](/tmp/fan-qwen-eval/trace.jsonl:3960)），因此“叶片漂移”结论可靠。应加入选择指南：视觉模型作为主视觉验收；qwen 可作交叉复验或结构化报告，但 API 脚本的成功输出是硬门禁；deepseek 用于受约束修复。该结论基于各一两个样本，不构成通用能力排名。

### 主流程：修复与核验必须成对，但不该由核验代理写修复

`visual-final` 已给出可复现根因：12 杆中存在 2.7mm/3.8mm 极短段（最终报告第 17 行），随后由主模型手工改 `generate.ts`，才有 `final2`。这避免了让只读核验代理越权，但丢失了独立修复代理的验证轨迹。今后核验失败应自动产生一个执行类修复任务：只改允许文件，验收 API 阈值和测试；然后再由新的只读视觉代理重验。修复代理不能自行宣布视觉通过，核验代理不能直接改生产文件。

## 优化清单
### 1. 提示词类
- 问题：首轮允许 API 路由探索，导致无范围 `rg` 命中 346,834 字节后 provider 错误终止 | 证据：visual-review 工具 14，trace [1097-1105](/tmp/visual-review-eval/trace.jsonl:1097)，错误终态 [1191-1216](/tmp/visual-review-eval/trace.jsonl:1191) | 建议：任务列出单一 API 核验命令，写“禁止 grep 源码/全仓搜索/完整 export 输出；先写报告标题，失败也输出未完成项” | 预期收益：避免大输出、错误被中途 commentary 冒充 final。
- 问题：数据核验写成步骤而非成功门禁，qwen 在 API 失败后把 export 当结果 | 证据：visual-qwen 工具 7 `jq` 错误 [3759-3767](/tmp/visual-qwen-eval/trace.jsonl:3759)，工具 8/10 API 400 [3804-3812](/tmp/visual-qwen-eval/trace.jsonl:3804) | 建议：要求 `source + httpStatus=200 + items` 三项原样摘要，否则明确“数据核验未完成” | 预期收益：消除无 API 证据的“通过”。
- 问题：修复任务缺少当前 RDP/采样基线，诱发源码考古和自写仿真 | 证据：cup-fix 工具 9-27 读源码，31-33 自写搜索 [35910-37814](/tmp/cup-fix-eval/trace.jsonl:35910) | 建议：参数修复任务附当前分段/短段策略和一个已有探测命令；算法修复另派任务 | 预期收益：约减少 20 次考古调用。
- 问题：终验把历史问题、修复细节和全部检查混写 | 证据：final 72 行/3,986 字节、10 调用；final2 38 行/2,714 字节、9 调用 | 建议：固化“基线、差异、量化回归断言、非回归检查、报告门禁”模板 | 预期收益：减少歧义；不承诺单次延迟四倍改善。

### 2. 命令/工具类
- 问题：每个代理手工复制长 export JSON，再以 curl/jq 解析，易截断和失真 | 证据：visual-qwen 工具 7 的超长 curl/jq 错误 [3759-3767](/tmp/visual-qwen-eval/trace.jsonl:3759) | 建议：新增 `scripts/inspect-draw-model.sh [url]`，从浏览器 export 后 POST 并输出 items 摘要 | 预期收益：一次调用完成真实数据核验，避免手工 payload。
- 问题：capture 脚本注释和默认端口曾不一致 | 证据：cup-fix 工具 1 读到注释 8787、实现 8902；最终报告第 47 行 | 建议：只以脚本默认值为准，任务不复制端口；当前提交已修正脚本到 8787 | 预期收益：避免启动/截图探活试错。
- 问题：tool error 会让执行任务 `ok=false`，即使接受标准已经满足 | 证据：cup-fix 工具 24 的 shell 动态 `sed` 错误 [20279-20288](/tmp/cup-fix-eval/trace.jsonl:20279)，工具 38 全部断言通过 [44223](/tmp/cup-fix-eval/trace.jsonl:44223) | 建议：主评审分开报告“通用门禁失败”和“任务验收通过”；用固定行号或 `rg -n` 后显式检查变量再调用 `sed` | 预期收益：准确汇报，少一次无效 rerun。

### 3. 技能/知识类
- 问题：`final_answer_present` 将 provider 异常后的 commentary 误认最终交付 | 证据：visual-review `final.md` 仅 91 字符，trace 尾部 `auto_retry_end success=false` [1212-1216](/tmp/visual-review-eval/trace.jsonl:1212) | 建议：task-trace-review 增加 trace 尾部 provider error、报告结构和 API 证据检查 | 预期收益：阻止假阳性复盘输入。
- 问题：技能的水杯快速清单仍写旧版 14 把手杆/16 元件 | 证据：final2 API 实测 6 杆、8 items，trace [556-564](/tmp/visual-final2-eval/trace.jsonl:556) | 建议：改为“以 API 为准”的现行短段合并基线 | 预期收益：避免旧知识把后续代理拉回已修缺陷。
- 问题：没有按任务类型规定模型与职责边界 | 证据：gpt 完成 API 终验，qwen 水杯未完成但风扇 API 成功；visual-final 后没有独立修复代理 | 建议：技能增加基于样本的选择指南和“修复任务 -> 独立核验任务”闭环 | 预期收益：降低越权和未验证手改。

## 本次落地改动清单（改了哪些文件、为什么）

- `scripts/inspect-draw-model.sh`：新增浏览器 export 到 `/api/draw-model` 的原子核验命令，输出来源、HTTP 状态和 items 摘要，替代长 JSON 手工 curl。
- `/home/h/.pi/agent/skills/model-build-test/SKILL.md`：加入 API 证据门禁、可复用视觉终验模板、样本边界内的模型分工和修复/核验职责；更新水杯旧版 14 段基线。
- `/home/h/.pi/agent/skills/task-trace-review/SKILL.md`：增加 Step 1.5，要求检查 final 结构、trace 尾部错误和 API 真证据。
- `/home/h/.pi/agent/skills/task-trace-review/references/review-task-template.md`：将终态可信度和物理行号证据写入复盘任务模板。
- `docs/agent-postmortem-2026-08.md`：保存本次有 trace 证据的结论和后续模板原则。

## 最高收益 1 条优化

将视觉核验任务改为强制运行 `scripts/inspect-draw-model.sh`，并以 `source + HTTP 200 + items` 作为通过前置条件。它同时消除 qwen 的手工 payload 假核验、首轮 gpt 的 API 探索空间，并为所有模型提供相同的可审计数据证据。
