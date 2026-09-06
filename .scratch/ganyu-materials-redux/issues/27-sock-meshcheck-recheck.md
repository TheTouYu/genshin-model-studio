# 27 — 遗留：sock 层 meshCheck 复检（R7 后修）

**Status:** done（根因：irreg 顶点循环误用 undefined j → NaN 顶点；修复为 a；sock gate：deg0/1.27%/11.7 PASS）
- [ ] 定位 __GMS_CHECK__.sock zeros 根因（疑 hook 顺序/数据引用）
- [ ] sock deg=0 & skinny<3% & ratio<20 gate 通过
