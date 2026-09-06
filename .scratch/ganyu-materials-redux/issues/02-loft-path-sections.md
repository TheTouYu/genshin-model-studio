# 02 — 沿路径放样原语 loft(path, sections)

**What to build:** 新增"路径放样"：一条曲线控制点路径 + 沿路径的变截面序列（圆/椭圆/圆角矩形，半径可随路径变化）→ 输出弯曲变截面微曲面网格（沿用微曲面子面做法）。这是角/鞋/袖/绳/马尾的通用基础原语。

**Blocked by:** 01（需先有公共库，避免原语再复制 10 份）

**Status:** in-progress（工具层结论：平面片无法水密表达弯曲体 → 新增【网格基础元件 10009019】全链路打通（part→stroke.mesh→API vertices/faces→preview BufferGeometry，UI 1笔=1元件渲染成功）；下一步：loft 改为输出单个 mesh 项（顶点+面，水密）→ 重跑三用例 demo 核验）

- [ ] 直线路径 + 等截面 = 圆柱（与已有 surface 圆柱几何一致）
- [ ] 弯月路径 + 变截面 = 弯曲锥状体
- [ ] 渲染特写（直/弯/变径三组）无缝隙、无 z-fighting、法线一致
