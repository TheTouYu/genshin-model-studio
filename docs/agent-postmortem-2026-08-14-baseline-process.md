# 基线执行过程复盘：聪明实习生为什么花了 12-15 分钟（2026-08-14）

> 对象：deepseek-v4-flash（32 turns/31 tools/750s）与 gpt-5.6-sol（42 turns/45 tools/877s）自由画风扇的完整 trace 逐轮追踪。
> 方法：从 trace.jsonl 重建每轮思考（thinking）与每次工具调用（命令+结果），定位时间花在哪、为什么。
> 结论先行：两模型能力合格（8/8 断言），但 50-60% 轮数花在"探针服务端语义"与"输出/索引管理"上——这些本可由接口文档与工具反馈直接给出。以下按三层给反馈。

## 一、核验层反馈（工具让模型"看得清"吗）

| # | 缺陷 | 证据 | 改进 |
|---|---|---|---|
| 1a | **items 无 stroke→items 映射**：模型只能靠几何启发式反推"哪些 items 属于哪笔" | ds T19-T20 用 rotation 分组反推环/辐条/支架，启发式反复错（"my classification was off"）；gpt 靠"1 笔画环=182 项"猜 items[0:182] 硬切（恰好对，但纯属猜测） | inspect-draw-model.sh 输出 items 时附 strokeId 分组（items 按笔画来源聚合） |
| 1b | **bash 输出 50KB 截断反复**：数据分析输出被截 → 换紧凑格式 → 又截 | ds T4/T5/T6 连续三轮，自己吐槽 "I keep making this mistake"；浪费 ~4 轮 | inspect 默认输出紧凑摘要（每笔画一行），大 JSON 落文件供 read；任务模板提示输出管理 |
| 1c | **非视觉模型无法截图自检**：ds read_image 被拒（模型不支持图像） | ds T28 失败后 T29 放弃视觉（"rely on API data"） | 任务模板明确"视觉自检仅视觉模型可用"；非视觉模型直接走数据核验，别浪费轮数 |
| 1d | **核验代理环境缺 numpy**：想验证旋转矩阵 → ModuleNotFoundError → 纯 Python 重写 | ds T25 | evaluate.py 环境装 numpy（或任务文件禁用 numpy 依赖） |
| 1e | **任务页面残留作品干扰**：页面有上一轮 12 笔风扇，ds 花 6 轮分析它（以为是任务示例）才 clear | ds T1-T6 | 基线任务开头强制"先 gms.clear() 并确认 0 笔"；或任务环境提供干净页面 |

## 二、代码层反馈（接口让模型"看得懂"吗）

| # | 缺陷 | 证据 | 改进 |
|---|---|---|---|
| 2a | **gms.summary() 字段语义不透明**：显式 render:'rod' 与缺省都显示 null，模型无法区分"没设"与"设了默认值" | ds T15（"I passed render:'rod' but summary shows render=None"——把 axis 的 None 误读成 render 的） | summary 显示有效值（缺省归一化）：rod 笔画 render 显示 'rod'（缺省），并标 axis/height 的有效值 |
| 2b | **gms.rotate 索引隐式、无确认反馈**：索引是全局序号，插入/删除后易漂移；rotate 返回不说明复制了哪笔 | ds 正式 v1 索引错位（把第 4 根辐条复制成叶片，6 辐条+1 叶，全量重画）；gpt 干脆规避 rotate（手动 3×circle+props 摆位，多了 3 笔和 1 轮修正） | rotate 返回"已复制笔画 N（类型/bbox）→ N+1..N+k"；新增 gms.list() 列出每笔 {索引, 点数, closed, render, 中心} 供 rotate 前核对 |
| 2c | **接口文档缺"服务端语义"节**：y 归一化（全部笔画 bbox 底=地面）、rod height=抬升、lift 公式、闭合阈值、loop 实体形状限制——这些是接口事实，不是画法经验 | gpt 花 ~6 轮推导 y 映射公式（T11-T14 反复 jq 查 ring yMin/yMax/均值），~4 轮探 height 语义；ds 探针 2 轮同样在摸这些 | gms 接口文档补"服务端语义"专节（这些已进 drawing-rules.md G3/G4/G11/G12，应同时进基线任务模板的接口知识） |

## 三、模型层反馈（模型怎么用这套系统）

| # | 发现 | 证据 | 改进 |
|---|---|---|---|
| 3a | **探针是主要成本**：ds ~14/32 轮、gpt ~22/42 轮花在探针服务端语义；这些语义 drawing-rules.md v1 全部已记录（G2/G3/G4/G11/G12），但基线任务没给文档 | 两模型时间线 | **知识前置是最大杠杆**：建模任务模板必须内嵌/引用 drawing-rules.md；预期探针轮 14/22 → 2-3 |
| 3b | **模型会用"规避策略"绕过不友好的接口**：gpt 不用 rotate 改用手动 props 摆位 | gpt T23/T27 | 2b 的 rotate 确认反馈后，模型会更放心用 rotate（画法更简洁：3 笔 vs 6 笔） |
| 3c | **长任务触发上下文压缩**：ds 32 轮 compaction（cache_read 4.35M tokens），压缩后细节丢失风险 | ds compaction 事件 | 任务模板建议：探针结果即时写入文件、每阶段 summary 沉淀；或拆"探针/建模/核验"为多任务 |
| 3d | **模型"认真但缺经验"的典型损耗**：ds 5 轮输出管理、gpt 3 次 jq 语法错（Cannot index number with string）——都是工具熟练度问题，不是建模能力问题 | 两模型 trace | 任务模板给"数据核验代码示例"（已验证的 jq/python 片段），模型直接改参数而非从零写 |

## 四、结论：三个最值得做的改进（按杠杆排序）

1. **建模任务模板内嵌 drawing-rules.md**（3a，砍掉 50-60% 探针轮——从 12-15 分钟预期降到 5-8 分钟）
2. **inspect-draw-model.sh 输出 stroke→items 映射 + 紧凑摘要**（1a+1b，砍掉几何反推与截断反复）
3. **gms.rotate 确认反馈 + gms.list()**（2b，砍掉索引错位重画与规避策略）

> 基线 v2 预期：同样 8/8 断言，迭代轮数 3-4 → 1-2，时长减半以上。此假设待 v2 验证。