# 11 — 全模重建 + 全模核验

**What to build:** 用新原语把全部 10 部位原语化重建（角/鞋用 loft，余部 surface+decal+材质），拼装全模；三视图与参考并排 + 剪影 IoU/宽度误差复测；全模严格核验后才交付。

**Blocked by:** 06, 07, 08, 10

**Status:** ready-for-agent

- [ ] 全模三视图并排（front/back/side × 参考）read_image 核验
- [ ] 剪影 IoU 与宽度误差复测，汇报并对比基线
- [ ] 全模无缝隙/无浮贴/渐变连续（verify-suite 全绿）
