# 08 — 增量构建与性能（part cache + dirtyIds）

**What to build:** part 级构建缓存：仅重建变化的部位，未变化部位复用已落盘结果；拼装时同样复用。目标：单次工具步骤 ≤30 秒（对齐 >30s 禁令）。

**Blocked by:** None — can start immediately（工程化独立于原语）

**Status:** ready-for-agent

- [ ] 只改一个部位 → 仅该部位重建，其余复用（用 mtime 断言）
- [ ] 拼装全模总时间 ≤ 旧法一半；单步任意工具调用 ≤30s（记录时长）
