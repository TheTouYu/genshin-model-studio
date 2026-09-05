# 甘雨 v16 — 细节拆分 ticket 局部优化（对照原图重读 → 逐细节调优）

## 方法论落地（用户：先轮廓 → 再局部 → 再细节，像画画一样）
1. **重读原图 + 拆细节图**：从三视图原图切出 **13 张局部细节图**（`reference/details/01-13`：发/脸/胸/腰/短裤/膝/袜/鞋/臂手×2/侧马尾/侧躯干/背GANYU），已逐张 read_image 核对：
   - **脸**：紫瞳大眼、上挑睫、眉高、淡唇；**发**：高位大波浪马尾（至臀）+ 大弯月黑红角（后弯）；**躯干**：蓝斜襟+金藤枝+侧腹藏青+胸大10+藏青腰带+双徽章；**短裤**：右前10+左鸢尾小徽+蓝包边+金藤+左髋流苏；**袜**：双蓝条纹+正侧鸢尾纹；**鞋**：白蓝钉鞋+白带格+蓝鞋头/后跟+黑钉+金藤；**臂手**：蓝腕带→黑露指手套；**背**：GANYU+大10+蓝色脊披饰品+金藤。
2. **ticket 工具**（`scripts/parts-tool.py`）：`gen/list/update/run/compose`
   - `gen`：把 v15 按 8 部位切出 `scripts/parts/ganyu-{torso,shorts,legs,arms,face,hair,shoes,patterns}.js` + `manifest.json`（tickets：部位/状态/说明）。
   - `run <ids>`：**只运行指定局部**（秒级，其余缓存 `parts/<id>.json`）。
   - `compose <out>`：缓存 parts 汇总（version:3）→ POST → base64 分块注入 → 截图。
3. **本轮局部优化（painting-like，按细节图核对）**：
   - face：**紫瞳**（#8a6fd8）+ 深睫 + 高光 + 淡唇腮红（对照 02）；
   - hair：**弯月大角**后弯放大（对照 01/11）；马尾大波浪待下轮；
   - torso：**侧腹藏青** + **下摆深蓝腰带**（对照 03/04）；胸前 10 加大；
   - patterns：胸/背 10 加大（GANYU 排列保留，对照 13）。

## 数据
- **6383 面**（10009003×6309 + 10009008×65 + 10009002×3 + 10009009×2 + 10009006×4）。
- 量化：IoU = **0.6599**；**宽度平均误差 10.4%**、最大 30.1%（靴行）——平均误差已进 ≤12% 目标带；IoU 未达 0.70（诚实）。
- 历史 `vmtor0h2nyo4n`；对比图 `reference/compare-front-v16.png`（read_image 复核：紫瞳/大10/藏青侧/双条纹袜/弯角出现）。

## 交付物
- `scripts/parts-tool.py` + `scripts/parts/manifest.json`（tickets）+ 8 个部位脚本 + 各部位 JSON 缓存
- `scripts/parts/ganyu-*.js`（细节拆分后按部位维护）
- `reference/details/01..13`（细节对照图库）
- `delivery/ganyu-v16/`（work/items/六视角/clean）

## 下一步（目标 active）
1. hair ticket：**高位大波浪马尾**（发量/发丝加密，对照 11）+ 角颜色（红黑渐变）；
2. shoes ticket：蓝鞋头/后跟 + 黑色鞋钉（对照 08）；patterns：蓝色脊披饰品（对照 13）；
3. 每步 `parts-tool.py run <ids> && compose`（分钟级）→ 对比图 → 更新 ticket；
4. 目标：**IoU≥0.70 & 宽度误差≤12%** 达成后更新 REPORT + 技能同步 + 完成。
