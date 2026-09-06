# 13 — 预览受光材质 + 平滑法线（mesh 曲面不再"平片"）

**What to build:** preview 中 10009019 网格改用受光材质（Lambert/Standard，与其它元件一致）+ 平滑顶点法线（computeVertexNormals 已接入，需材质配合）→ 白袜/球衣的形体高光与褶皱阴影可读。

**Blocked by:** None（preview 层独立）

**Status:** done（mesh 受光 Standard+顶点色+双面：曲面柔和明暗、双条纹分色可见）

- [ ] 袜/脚 demo：随形体有柔和明暗（无"平片拼接"感）
- [ ] 与其它元件光照一致（不刺眼/不过暗）
