# 完整复盘：甘雨 R0 腿部·踝凸包 GIA 导出链路（2026-09-06）

> 范围：本会话「甘雨腿部：大腿-袜-脚」局部重建 R0 到「踝凸包最小版本」GIA 游戏实测通过全程（约 23 轮迭代）。
> 视角：建模智能体（浏览器注入 ganyu-lib / profileLoft）+ GIA 面板化导出（panelize/export-mesh）+ 游戏实测闭环。
> 证据：`git log`（R1~R7 历史）+ 本会话 browser-harness 实拍（`delivery/r0-toes/*.png`）+ 用户游戏截图回读 + `iteration-records/08..22-*.json`。
> 状态：**游戏实测通过（v12）**；网页保存完成；待进入趾部算法。

## 一、错误谱系总览（按根因层）

| # | 日期 | 根因层 | 具体错误 | 修复 | 轮次/版本 |
|---|---|---|---|---|---|
| 1 | 09-06 | 库执行顺序 | `profileLoft` 的 `toeF2`/`dyLift` 未初始化即使用；`dataOnly` 早退跳过失能封口；`getSec` 端点用 `pts2.length` 到不了末截面 | 变量前置、cap 后置、端点改 `len-1` | R8 |
| 2 | 09-06 | 表达模型 | 角域高斯瓣无法表达五个纵向趾尖（顶视挤成一团） | 新增纵向连续前伸/横移、后改自适应细分+面板化 | R8~R12 |
| 3 | 09-06 | 连续性 | `jitterMesh` 每环独立随机相位 → 水平断层（用户判 bug） | 相位沿环线性推进 + 低频正弦高度 | v3→v4 |
| 4 | 09-06 | 扰动哲学 | 靠扰动顶点/旋转制造“不规律”必断连 | 不规则来自**细分**（adaptiveAngularStops 曲率驱动、全环共享停靠点） | v5 |
| 5 | 09-06 | 游戏语义 | `rootTransform.scale` 与游戏显示尺寸的关系不清（0.1→50、0.0002→0.01 均不符线性） | 用户给公式：**真实尺寸 = root × 装饰物缩放（位置与缩放都被 root 乘）** → root=0.1 + 双向 ÷0.1 补偿 | v8~v12 |
| 6 | 09-06 | 单元类型 | 网页用 10009003 平面、GIA 用 10009001 盒体 → 游戏“饼环堆叠”与网页不一致 | 导出切回 10009003 平面，旋转用网页同款 `rotFromNormal` | v12 |
| 7 | 09-06 | 配对容差 | `panelize` 默认 normalTolerance=0.999 把凸包区弯四边形拆成 214 个三角单元 → 游戏凸包周边尖刺/撕裂 | 导出时 normalTolerance=0.2 → 全四边形配对（728 平面/0 三角） | v12 |
| 8 | 09-06 | 持久化 | 网页刷新后 `gms.part('mesh')` 模型消失 | `applyWork` 白名单补 `resourceId 10009019 + mesh/material`（v3.6） | 15轮 |
| 9 | 09-06 | 取景/验证 | 预览器 setItems→fitCameraToContent 异步覆盖手动相机；18 个 WebGL 上下文被回收致画布空白 | 提交后延迟设相机；**单渲染器+2D 拷贝** | 14轮起 |
| 10 | 09-06 | UI 判定 | 页面存在两个「导出 .gia」按钮（一期 vs 画线建模）→ 抓错导出了 box 示例 | 取最后一个按钮（画线建模区） | 17轮 |
| 11 | 09-06 | 应用导出 | `/api/export?format=gia` 只回字节不落盘；文件头带中文路径会 400 | 服务端写 `GMS_EXPORT_DIR`（默认游戏目录），响应头不放路径 | 22轮 |

## 二、最近一次错误的完整调查链（v12 游戏不一致）

1. 现象：游戏凸包区出现一圈三角尖刺/撕裂，与网页平滑面不同；尺寸 vs 1×1m 参考偏大（1.7m）。
2. 差分：网页侧全部为四边面单元（part('quad')=10009003）；GIA 摘要 `621 quads + 214 tris`。
3. 定位：摘要中 214 tris = 凸包区高曲率四边形法线夹角超 0.999 容差而被拆成 10009006 三角单元。
4. 修复：`panelize(mesh,{rotationMode:'normal', normalTolerance:0.2})` → `728 quads / 0 tris / 0 degenerate`；尺寸 WORLD 24→14（真实 ≈1.0m）。
5. 验证：游戏实测通过（用户签字）。教训：**摘要数值是游戏不一致的“前哨”**——先看 quads/tris 分布再进游戏。

## 三、系统性根因（3 条可复用规律）

1. **“真实显示 = 导出数据 × 根缩放”必须双向补偿**：游戏内 root 同时乘位置与缩放；改动 root 时位置与缩放必须同乘 `1/root`，否则必出“大板压小管”或缝隙。
2. **网页与游戏的一致性取决于“单元类型+旋转公式”同源**：面片（10009003 平面）与实体（10009001 盒）视觉不同；旋转公式必须以网页已验证的 `rotFromNormal` 为准（`rotationMode:'normal'`）。
3. **“不规则”的正解是自适应细分而非扰动**：顶点/旋转随机扰动必断连（v3 断层）；曲率驱动的非均匀采样（adaptiveAngularStops，全环共享停靠点）保持曲面连续且每格不同。

## 四、流程与方法论教训（用户纠偏，逐字收录）

- 「先补全工具的不足。我们的工具首先得支持生成不同大小、不同性质得多边形。然后再构思算法」→ 先工具后算法。
- 「曲面需要是光滑连续的，但能够使用一些不同的多边形来表达出来… 不是去调整它的旋转让它变得不规律且不连续」→ 细分驱动。
- 「正确的计算公式应该是：主模型的缩放尺寸乘以装饰物的缩放尺寸等于 1… 填 0.07，真实尺寸就是 0.07 米。如果主模型变成 0.1 米… 缩放就要变大，变成 0.7」→ GIA root 双补偿公式（根+装饰物=1 语义）。
- 「渲染里面用的是真实的面、没有厚度的面，但是游戏导入之后它变了。是不是你把模型切换了？游戏里面它的确是有这个面的」→ 导出必须用面片单元。
- 「我已经亲自核验了… 我想先在这一层做核验」→ 网页 1:1 预览是游戏导入前的强制 gate（state.items 与 GIA 同源）。
- 「这一版的改动，是一个 bug」→ 连续性回归要立即回退，不继续叠加。

## 五、风险探索与未闭合项

- 游戏“初始空模型”显示的 500 常量（f7[6]）语义仍未闭合；root=0.1 已是实测正确值，但公式未从格式文档闭合。
- 网页端整体优化（用户明确暂缓，后续再做）。
- 旧导出器 `scripts/export-mesh-gia.js`（已弃用标注）与现行 `src/mesh/panelize.ts + src/cli/export-mesh.ts` 并存——**已完成清理：旧导出器已删除，现行管线唯一**（export-mesh / contour-model 共用 `src/cli/gia-common.ts` + `panelizeMesh`）。
- `profileLoft` 老 `toes` 角域/lofted 分支仍闲置（新方案为自适应细分+面板化）；趾部算法将复用新工具。
- 500×root 假设与 root=0.1 实测的关联未验证完成（见 §四用户公式已覆盖需求，标记待重新标定）。

## 六、产出清单

- 工具/库：`ganyu-lib.js`（dense/faceProps/angularStops/adaptiveAngularStops/jitterMesh 平滑版/reliefYTube/polyGrid/polyDomePatch/profileLoft 修复）；`applyWork` v3.6 持久化修复（web+public/index.html）；`web-server.js` 默认导出目录；`panelize.ts` rotationMode + `export-mesh.ts` ROOT 双补偿。
- 候选/产物：`delivery/r0-toes/ankle-bump-v12.{gia,structure,summary}`、`ankle-bump-v12-work.json`（网页存档）；游戏目录 `ankle-bump-v12.gia`。
- 文档：`iteration-records/08..22-*.json`；pipeline 相关 `docs/mesh-panel-system-design.md`。
- 本复盘 + 技能回灌：gms-modeling-export/preflight、model-build-test 增补实战节；AGENTS.md 新建（规则路由 + 铁律）。
- 用户验收：游戏实测通过（v12）；网页刷新恢复通过。
