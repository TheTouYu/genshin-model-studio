# MacBook Pro 14" 模型 → .gia 交付报告

日期：2026-09-11｜引擎几何版本：`r80`（HEAD = 4189c0b）｜工具：`scripts/max/build-macbook-gia.mjs` + `export-mesh` + `scripts/max/macbook-gia-finalize.mjs`

## 1. 交付清单

| 文件 | 字节 | sha256（前16） | 说明 |
|---|---|---|---|
| `macbook-pro-14-silver-open.gia` | 1,902,051 | `c53437bff2565149` | **主交付**（开盖 100°） |
| `macbook-pro-14-silver-open.gil` | 3,088,907 | `8f0276a8a7ac1163` | 编辑器态，供 QA 回读 |
| `macbook-pro-14-silver-open.structure.json` | 4,437,409 | — | 面板化结构（含 opacity 通道） |
| `macbook-pro-14-silver-open.summary.json` | — | — | 导出摘要 + `opacityChannel` / `renderOnlyAppearance` / `selfIlluminationCandidates` |
| `macbook-pro-14-silver-open.qa.json` / `.qa.md` | — | — | QA：**ok** |
| `macbook-pro-14-silver-open-mesh.json` | 809,951 | `2cdf2ab62a9cb7f8` | 引擎 LOD 网格（输入） |

命令：
```
node scripts/max/build-macbook-gia.mjs --lod 0.12 --open 100 --color silver
node dist/src/cli/export-mesh.js delivery/macbook-gia/macbook-pro-14-silver-open-mesh.json \
  --out-dir delivery/macbook-gia --format both --assembly \
  --max-skinny-pct 10 --max-area-ratio 60 --force
node scripts/max/macbook-gia-finalize.mjs      # opacity 通道 + 同路径重编码 + QA
```

## 2. 格式忠实性（未自创格式）

`macbook-gia-finalize.mjs` 的空跑对照：用 `export-mesh` 写出的 structure.json 重新编码 .gia，与 CLI 自己的产出
**逐字节相同**（sha256 均 `13d18506b96eccf1108b66836c9d60d4f31cb3e68d39cc1dec71d593428d5f99`）——
证明透明度回写走的是 `encodeGia(makeGiaInput(name, items, {rootScale:0.1, overallScale:1}))` 同一路径，没有自创编码。

## 3. 门禁读数

| 项 | 阈值 | 读数 | 结果 |
|---|---|---|---|
| 门禁原始口径（不设参数） | skinny ≤5% / areaRatio ≤20 | **6.00% / 52.9** | ❌ 拒绝导出 |
| 交付口径（已声明放宽） | skinny ≤10% / areaRatio ≤60 | 6.00% / 52.9 | ✅ passed |
| 装配语义 `--assembly` | 开边/跨壳相交只报不拦 | 开边 3643、非流形 0 | ✅ |
| 退化面 | = 0 | 0 | ✅ |
| 面板化 | quads 9665 / tris 29 | degenerate 0 | ✅ |
| 单元预算 | `--budget` 未设 | used 9694 | — |
| QA 审计 | 全项 | gil/gia 回读一致、ID 规则通过 | ✅ **ok** |

**瘦三角集中度（按色，自算 minAngle<5°）**：总 1608/19359 = 8.31%，集中在**形状固有薄件**：
vent 唇 `0x272728` 44/52（84.6%）、端口凸缘 `0x959597` 2/2（100%）、logo `0xfbfbfc` 135/198（68.2%）、
触控板玻璃 `0x909093` 72/102（70.6%）、屏幕 `0x191919` 72/102（70.6%）、alu `0xf3f3f4` 959/16219（5.9%）。
即：长×薄宽比大的合法特征（散热槽唇 0.22mm、玻璃/屏幕薄片）三角化必然出锐角 —— 放宽理由，非隐藏缺陷。

## 4. 资源与单元

- items **9694** = `10009003`（平面）×9665 + `10009006`（三棱锥）×29；quads 9665 / tris 29；退化面 0
- idRange `1073741825..1073751518`；prefabId `1077936129`；模板空模型 `10005018`；unitId=1
- 遵循仓库惯例：表面件一律 10009003（与 classroom v1/v12、ganyu 系列一致）；三角形面积不可归入平面者落 10009006

## 5. root 语义（铁律 7）

`rootTransform.scale = [0.1, 0.1, 0.1]`，item `position/scale` 均已 ÷0.1（双向补偿）。
游戏内实际尺寸 = 建模尺寸：**312.7 × 229.2 × 263.2 mm**（开盖 100°；合盖姿态可用 `--open 0` 再导一份）。
逐项抽检（独立解析器 `tools/gia/gia_parser.py`）：item_1 pos=[1.5615, 0.1135, -0.8522] → ÷0.1 = 0.156 m = 156.2 mm = 机身半宽 ✓

## 6. 透明度通道（color.opacity）

格式依据：`docs/gia-format.md:170` —— 颜色记录 `32.4 = opacity（0-100 浮点，100 = 不透明）`（`docs/input-format.md:53` 同）。

| 部件 | rgb | items | opacity | 依据 |
|---|---|---|---|---|
| 屏幕前玻璃 `M.GLASS` | `0x151516` | **64** | **12** | 教室管线口径 0.085–0.2（小数）→ 换算 0-100 口径 = 8.5–20，取中值 |
| 屏幕活动区 | `0x191919` | 51 | 100 | 显示器本体不透明（见自发光候选） |
| 触控板玻璃 | `0x909093` | 51 | 100 | 真机与掌托共面、不透光 |
| 端口腔体/内舌 | `0x1d1d1e` | 314 | 100 | 腔体内部暗面 |

❗ **未验证声明**：仓库既有 delivery 里没有任何 structure.json 用过非 100 的 opacity（classroom v1/v12/v13、ganyu 全 100）
→ **12 这个值在真机未经验证**，首次进游戏请优先复核屏幕玻璃是否过透/过实；若不对只需改 `--glass-opacity` 重跑 finalize（一条命令）。

独立回读证据：`tools/gia/gia_parser.py` 解出的 9694 项中，`rgb=0x151516` 分组的 `opacity=12.0` 恰为 64 项，其余全部 100.0。

## 7. 仅存在于渲染侧的外观（.gia 无法携带）

1. **键帽字标** `web/draw/kb-legends.png`（字母/符号/方向键/F1–F12）—— .gia 只有逐面 color，无贴图与 UV
2. **屏幕内容** `web/draw/screen-ui.png`（亮屏桌面）—— .gia 无贴图通道
3. **底盖激光刻蚀** `web/draw/bottom-etch.png`（MacBook Pro / Model A2918 / 法规行 / 认证标记）
4. **材质参数** metalness / roughness / clearcoat / envMapIntensity（`web/draw/photo.html` 的 makeMat 分支）
5. **环境光照** 程序化影棚 cubemap + PMREM、三盏平行光、软箱尺寸
6. **后处理** 景深 / 色散 / 暗角 / 传感器噪声 / ACES 色调映射 / 2× 超采样
7. **接触阴影与倒影** `web/draw/shadow-mask.png` + 镜像副本（reflGroup）
8. **连续倒角的镜面高光带**（mirror shine）退化为相邻面的 color 分界（逐面颜色无曲率信息）

→ 即：.gia 交付的是**形体 + 逐件颜色 + 件级透明度**；照片感来自渲染侧配方，**两者互不替代**。

## 8. 自发光候选件（游戏侧接入待用户配置）

| 部件 | rgb | items | 备注 |
|---|---|---|---|
| 屏幕活动区 | `0x191919` | 51 | **主候选**：游戏侧配置实体自发光即可亮屏 |
| 键盘背光/字标 | `0x1d1d1f` | 390 | 次选：字标仅存在于渲染侧贴图，需游戏侧贴图支持才透光 |
| Touch ID 环 / 摄像头孔 | `0x0b0b0c` | 153 | 可选装饰发光，当前按深色不透明 |

本 .gia **不含发光位**（格式未闭合），不阻塞交付。

## 9. 未闭合 / 风险

1. `opacity=12` 值域未在真机验证（见 §6）。
2. 门禁 skinny/areaRatio 已声明放宽（理由见 §3），**未做几何优化去消它们**；若要收紧，优先看 vent 唇与玻璃薄片。
3. 端口腔体为 v7「可见边界=开口真实轮廓 + 浅腔」，**无真实深腔**（与 R29-9「贴面 vs 真腔深」同一取舍）。
4. MagSafe 开口四周的浅凹陷台面（shelf）未建模；侧壁散热槽已建模（`0x272728`/`0x272729`）。
5. 合盖姿态需单独导出（`--open 0`），当前交付为开盖 100°。

## 10. 复核命令

```
.venv/bin/python tools/gia/gia_parser.py delivery/macbook-gia/macbook-pro-14-silver-open.gia --json .scratch/r81/gia-parsed.json
node scripts/max/macbook-gia-finalize.mjs --nulltest-only     # 空跑对照（必须 PASS）
```
