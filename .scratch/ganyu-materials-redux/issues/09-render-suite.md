# 09 — 渲染/核验套件 render-suite + 稳定性修复

**What to build:** 一键渲染套件：指定部位输出五特写（front/side/top/3-4/closeup）+ 与参考拆解图并排 PNG；verify-suite 断言（缝隙宽度阈值/贴花脱离/渐变连续性）；并修复页面路由/就绪问题（gms 未就绪自动等待+重载 fallback）。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 任一部位一键出图（含与拆解图并排）成功
- [ ] 页面加载稳定：gms 未就绪时自动重试，不再出现 undefined 卡死
- [ ] verify-suite 三项断言可运行（故障样例能变红）
