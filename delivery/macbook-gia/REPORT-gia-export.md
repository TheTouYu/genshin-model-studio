# MacBook Pro 14" 模型 → .gia 交付报告

日期：2026-09-11｜几何版本：HEAD `4189c0b`（r80）+ R81 weld 边界修复｜管线：`build-macbook-gia.mjs` → `export-mesh` → `macbook-gia-finalize.mjs`

## 1. 交付清单（两档规格，同一标定源）

| 档 | 文件 | 字节 | sha256(16) | items | 输入三角 |
|---|---|---|---|---|---|
| **LOW**（引擎 LOD 0.12，轻量） | `macbook-pro-14-silver-open.gia` | 1,902,252 | `0afa9dc987ce7d94` | 9,695 | 19,361 |
| **HI**（LOD 1.0，全精度） | `macbook-pro-14-silver-open-hi.gia` | 13,466,075 | `baa788278cbcd513` | 67,943 | 135,740 |

每档另附 `.gil`（编辑器态 / QA 回读）、`.structure.json`、`.summary.json`（含 `opacityChannel` / `renderOnlyAppearance` / `selfIlluminationCandidates`）、`.qa.json`/`.qa.md`（**均 ok**）、`-mesh.json`（导出输入）。

> HI 档的 `.gil`（21.8 MB）与 `.structure.json`（31.7 MB）**未入 git**（体积；已加 `.gitignore`），一条命令可重生（§10）。

命令：
```
node scripts/max/build-macbook-gia.mjs --lod 0.12 --open 100 --color silver             # LOW 输入
node scripts/max/build-macbook-gia.mjs --lod 1.0  --open 100 --color silver --suffix -hi # HI 输入
node dist/src/cli/export-mesh.js delivery/macbook-gia/<name>-mesh.json --out-dir delivery/macbook-gia \
  --format both --assembly --max-skinny-pct 12 --max-area-ratio 60 --force
node scripts/max/macbook-gia-finalize.mjs [--name <name>]      # opacity 通道 + 同路径重编码 + QA
```

## 2. 格式忠实性（未自创格式）

`macbook-gia-finalize.mjs` 先做**空跑对照**：用 `export-mesh` 写出的 structure.json 重编码 `.gia`，必须与 CLI 自己的产出**逐字节相同**。两档均 **PASS** —— 证明透明度回写走的是 `encodeGia(makeGiaInput(name, items, {rootScale:0.1, overallScale:1}))` 同一路径。

## 3. 门禁读数（导出前）

| 档 | 退化面 | 未焊接顶点 | 法线 | 瘦三角 | 面积比 | 水密（装配语义） | 预算 | QA |
|---|---|---|---|---|---|---|---|---|
| LOW | 0 | **0** | ok | 6.00% ≤ 12% | 52.9 ≤ 60 | 开边 3643 / 非流形 0（只报不拦） | 9,695 | **ok** |
| HI | 0 | **0** | ok | 10.51% ≤ 12% | 52.9 ≤ 60 | 开边 27,671 / 非流形 65（只报不拦） | 67,943 | **ok** |

**默认门禁原始读数（未设参数）**：LOW `瘦三角 6.00%（≤5%）/ 面积比 52.9（≤20）` → 拒绝导出；HI 另有 `未焊接顶点 1 处` → 已由 R81 修复消除。
放宽理由（非隐藏缺陷）：瘦三角集中在形状固有薄件 —— vent 唇 `0x272728` 84.6%、端口凸缘 `0x959597` 100%、logo `0xfbfbfc` 68.2%、触控板玻璃/屏幕 70.6%；面积比 52.9 来自 312 mm 大平板与 0.2 mm 级细节同网格。

**R81 weld 边界修复**：旧 builder 用**未舍入坐标**算空间哈希格键、却存**舍入后**坐标 → 恰在容差 0.2000 mm 的顶点对可能落进相隔 2 格的箱而漏焊。修后 LOW 顶点 11,501 → **11,489**（多焊 12 对真裂缝），HI 消除门禁报的唯一未焊接点。

## 4. 资源与单元（仓库惯例）

- LOW：`10009003`（平面）×9,666 + `10009006`（三棱锥）×29 = **9,695**；quads 9,666 / tris 29 / 退化 0
- HI：quads 67,797 / tris 146 / 退化 0 = **67,943**
- idRange 自 `1073741825` 连续；prefabId `1077936129`；模板空模型 `10005018`
- 表面件一律 10009003（与 classroom v1/v12、ganyu 系列一致），不可归入平面者落 10009006

## 5. root 语义（铁律 7）

`rootTransform.scale = [0.1,0.1,0.1]`，item `position/scale` 均 ÷0.1（双向补偿）；游戏内实际尺寸 = 建模尺寸：**312.7 × 229.2 × 263.2 mm**（开盖 100°）。合盖可 `--open 0` 再导一份。
独立解析器抽检：`item_1 pos=[1.5615,0.1135,-0.8522]` → ÷0.1 = 0.156 m = 156.2 mm = 机身半宽 ✓

## 6. 透明度通道（color.opacity）

格式依据：`docs/gia-format.md:170` = 颜色记录 `32.4`：**opacity（0-100 浮点，100 = 不透明）**（`docs/input-format.md:53` 同）。

| 档 | 部件 | rgb | items | opacity |
|---|---|---|---|---|
| LOW | 屏幕前玻璃 `M.GLASS` | `0x151516` | 64 | 12 |
| HI | 屏幕前玻璃 `M.GLASS` | `0x151516` | 384 | 12 |

保持一致不透明的：屏幕活动区 `0x191919`、触控板玻璃 `0x909093`、端口腔体/内舌 `0x1d1d1e`。
❗**未验证声明**：仓库既有 delivery 无任何 structure.json 用过非 100 opacity（classroom v1/v12/v13、ganyu 全 100）→ **12 未在真机验证**；进游戏请优先看屏幕玻璃是否过透/过实，不对就改 `--glass-opacity` 重跑。
独立回读（`tools/gia/gia_parser.py`）：LOW 9,695 项中 `rgb=0x151516` 组 opacity=**12.0** 恰 64 项，其余全 100.0。

## 7. 仅存在于渲染侧的外观（.gia 无法携带）

1. 键帽字标 `web/draw/kb-legends.png` —— .gia 只有逐面 color，无贴图/UV
2. 屏幕内容 `web/draw/screen-ui.png`；底盖激光刻蚀 `web/draw/bottom-etch.png`
3. 材质参数 metalness / roughness / clearcoat / envMapIntensity（`web/draw/photo.html` 的 makeMat 分支）
4. 环境光照（影棚 cubemap + PMREM、三盏平行光）与后处理（DOF/色散/暗角/噪声/ACES/2× 超采样）
5. 接触阴影与倒影 `web/draw/shadow-mask.png` + 镜像副本
6. 连续倒角的镜面高光带（mirror shine）退化为相邻面 color 分界（逐面颜色无曲率信息）

→ .gia 交付的是**形体 + 逐件颜色 + 件级透明度**；照片感来自渲染侧配方，两者互不替代。

## 8. 自发光候选件（游戏侧接入待配置，不阻塞交付）

| 部件 | rgb | 备注 |
|---|---|---|
| 屏幕活动区 | `0x191919` | **主候选**：游戏侧配置实体自发光即可亮屏 |
| 键盘背光/字标 | `0x1d1d1f` | 次选：字标仅在渲染侧贴图，需游戏侧贴图支持 |
| Touch ID 环 / 摄像头孔 | `0x0b0b0c` | 可选装饰发光 |

本 .gia 不含发光位（格式未闭合）。

## 9. 未闭合 / 风险

1. `opacity=12` 未在真机验证（§6）。
2. 门禁 skinny/areaRatio 已声明放宽（§3），未做几何优化去消它们。
3. 端口腔体是 v7「可见边界=开口真实轮廓 + 浅腔」，**无真实深腔**（R29-9 同一取舍）。
4. MagSafe 开口四周浅凹陷台面（shelf）未建模；侧壁散热槽已建模。
5. 当前交付为开盖 100°，合盖需另导。
6. **HI 档导出耗时异常**：135,740 三角形 → 约 **5.5 min / 峰值 1.8 GB RSS**（疑似面板化中某 O(n²) 去重/装配步骤，**本轮未 profile**）；LOW 档正常。建议后续 profile 热点后再决定是否默认走 HI。

## 10. 复核命令（均轻量）

```
.venv/bin/python tools/gia/gia_parser.py delivery/macbook-gia/macbook-pro-14-silver-open.gia --json .scratch/r81/gia-parsed.json
node scripts/max/macbook-gia-finalize.mjs --nulltest-only          # 空跑对照（对未打补丁的 CLI 产出才 PASS）
```
重生 HI 的 `.gil`/`.structure.json`：重跑 §1 第三条命令即可。
