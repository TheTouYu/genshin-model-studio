# 16 — 索引化平滑网格（法线平滑，修 F4/F2）

**What to build:** preview 的 10009019 从"非索引三角（逐面法线=平涂）"改为**索引 BufferGeometry**（共享顶点 + setIndex）+ 顶点色（引用面首色）→ computeVertexNormals 平均共享法线 = 平滑着色。

**Blocked by:** None

**Status:** done（索引化→平滑法线：面片感消失，demo 放大核验）

- [ ] 袜+脚 demo 侧/顶特写（与原图等比放大）：面片感明显消失、曲面平滑
- [ ] 条纹/分区色在索引化下仍正确（边缘可轻微软化=类抗锯齿）
- [ ] 回归：97/97 测试通过
