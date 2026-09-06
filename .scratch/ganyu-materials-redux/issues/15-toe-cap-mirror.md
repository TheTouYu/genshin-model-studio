# 15 — 趾盖 toeCap + 左右镜像 mirrorX

**What to build:** toeCap(endRing, n≤5)：端面生成 n 个鼓包趾列；mirrorX(verts/faces)：x 轴取反 + 面绕序翻转，左右脚/左右肢一次定义复用。

**Blocked by:** 12

**Status:** done（demo：mirrorMeshData 左右脚分离±0.088、toeBumps 趾列可见、大趾内侧不对称（bigDir）；前视 read_image 核验）

- [ ] toeCap demo：趾列清晰、与原图脚趾方向一致（大趾在内侧）
- [ ] mirrorX 镜像后法线/外观正确（左右并排渲染）
