# 20 — R1 基础比例（灰模；无丝袜/褶皱/材质）

**What to build:** 参数化基础脚型灰模：foot_length / forefoot_width / instep_height / arch_depth / heel_projection / ankle_width / ankle_height / achilles_width / ball_spread；比例以参考多视图校准（多视角轮廓一致）。

**Blocked by:** None（新阶段起点；沿用 profileLoft/toe/ryB）

**Status:** implemented-but-review-failed(用户终审未过：趾列不可见→由更强模型按 R0 重做)（R1 灰模比例：脚长0.142/背高0.031/跟弧/前掌展开；四视图连续；迭代记录 01）

- [ ] 侧视：脚长:背高:跟高按参考比例；踝↔背连续（无台阶）
- [ ] 顶视：前掌>中足>趾根展开；趾总长占比合理
- [ ] 正/背/剖面轮廓无硬折线
- [ ] 迭代记录 JSON（params 原值/新值/原因/影响/副作用/误差）
