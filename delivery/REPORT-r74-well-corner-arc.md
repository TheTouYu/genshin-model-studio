# R74 — 键盘井四角「换成新算法」：扫描线开孔 → 真弧补角

用户指令（2026-09-10 晚）：「**测试通过。现在把键盘四个角的这个弧度换成新算法。**」+ 截图：键盘井角部沿弧出现明显阶梯（红箭头两处）。

## 1. 归属（先证明「那段像素是哪张面」，再动手）

`plateWithHoles` 按 z 分带（`maxCell = mc(1.0)` ≈ 1mm）扫描开孔，**每带只在带中点求一次孔的 x 区间** →
孔的圆角弧被量化成方阶梯。键盘井孔 = `{cx:0, cz:wellCz=-42.5, w:284.9, d:113.8, r:4.0}`，
四角即用户箭头所指处；栅格孔 / 触控板孔 / 转轴槽孔同族（同一段代码、同一死法）。

量化读数（新资产 `scripts/max/hole-arc-qa.mjs`，直接从 page 网格取**真实孔边折线**——
只被一个三角形使用的边——再与理想圆弧按角度密采比距离）：

| 孔 | 修前 maxArcDev | 修后 maxArcDev | 修前角部 x 档数 | 修后 |
|---|---|---|---|---|
| **keyboard-well** | **1.0880 mm** | **0.0608 mm** | 13 | 34 |
| grille-L | 1.1880 mm | 0.1631 mm | 10 | 22 |
| grille-R | 1.1880 mm | 0.1631 mm | 11 | 24 |
| hinge-slot | 0.3471 mm | 0.1240 mm | 6 | 11 |
| trackpad | 0.2994 mm | 0.1655 mm | 15 | 38 |

修前「最长水平平段」实测 1.00 / 4.00 / 2.00 / 6.99 mm = 阶梯宽度，与人眼看到的方阶梯一致。

**残余 0.12–0.17mm 的归因（不粉饰）**：不是圆角算法——栅格内边与井口边在 x=±142.45 相切，
两孔之间的板件薄带 < `plateWithHoles` 的 `SNAP=0.3mm` → 薄带被并档，孔边整体偏移。
键盘井（本轮目标件）0.061mm 已达标。

## 2. 新算法（端口第四版同族：真弧 + 扇补角）

`src/geom/solids.ts` 新增 `plateHoleCorners(b, q, y, {segs, flip})`：
把孔以 **r=0（纯矩形）** 交给 `plateWithHoles`（直边扫描线精确、无阶梯），
四角再用**真弧三角扇**把「方角 − 四分之一圆」之间本该属于板件的区域补回；
分段数按半径给（`hq(clamp(r*6,8,32), clamp(r*1.5,4,…))`，r=4 → 24 段/角 → 弦高 2µm）。
不变量：存储法线 `(0, flip, 0)`、绕序与 `plateWithHoles.emit()` 同族
（`sx*sz === -flip ? tri(C,A,B) : tri(C,B,A)`），DoubleSide 下与整块板明暗一致。

`src/model/macbook/geometry.ts` 台面板：
`plateWithHoles(b, outline, holes.map(h => ({...h, r: 0})), deckY, …)` + 对每个孔 `plateHoleCorners(...)`。
五个孔（井 / 左右栅格 / 转轴槽 / 触控板）一次全换 —— 同族扩展，不留半截。

## 3. 验收（铁律 ④：参考物 + 固定机位 + 必须看图）

- **机器判据**：`node scripts/max/hole-arc-qa.mjs web/draw/macbook-current.json --out DIR`
  （tol 0.20mm；键盘井 0.0608 PASS）
- **看图**：新固定机位 `wellcorner`（azim 250 / elev 32 / dist 105mm / fov 26，
  target (−138, 11.6, −92)mm，标签「键盘井角」）→ `delivery/r74/{before,after}/p1-wellcorner.png`；
  3× 裁切并排 `delivery/r74/sbs-well-corner-x3.png`：修前方阶梯 → 修后连续圆弧。
- **回归**：`lipfront` / `groove34`（R72 前唇白线的验收机位）修后同口径复查 —— 前唇「中间亮两边黑」
  未回归（ROI mean 94.9 / >200 2.13%，与 R72 修复后同量级）；`npm test` **252/252**。
- 网格：开盖 90164 verts / 148855 tris、合盖 90165 / 148856（三角数与修前同量级：孔边改真弧、
  去掉了扫描线的阶梯薄带，净增 ≈ 4 段/角 × 5 孔 × 2 三角）。

## 4. 资产（可复用）

- `scripts/max/hole-arc-qa.mjs` — 孔边真弧度审计（本文件的表格即其输出；孔参数从 `dist` 的 spec 现算，
  单一真源，避免审计脚本自带副本不同步）。
- `plateHoleCorners()` — 任何「扫描线开孔 + 圆角」的板件都可直接调用（几何原语层）。
- 固定机位 `wellcorner` — 键盘井角验收机位（页面按钮「键盘井角」）。

## 5. 环境（原样保留）

- 改 `src/**` → `npm run build --silent` + `grep dist` 确认（`page-mesh.mjs` import 的是 `dist/`）；
- `node scripts/max/page-mesh.mjs --lod 1.0 --open 100|0 --out web/draw/macbook-current.json|macbook-closed.json`（同时写 .gz，页面优先读 .gz）；
- 出图 `node scripts/max/page-shots.mjs --out DIR --views wellcorner,kb --w 1400 --h 900 --preset dark --url '…photo.html?v=<epoch>'`（**必须 cache-bust**）；
- CDP：`bash scripts/max/ensure-edge.sh`；页签：`node scripts/max/page-set.mjs --list|--match|--js`（用户页签不可关）。
