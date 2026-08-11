# 二期：画线建模（Draw-to-Model）PRD

状态：设计中（2026-08-12）
负责人：主会话（技术指导 / 任务派发 / 验收）；子模型（实现）
仓库：`genshin-model-studio`（一期编码管线已闭合：structure.json → .gil/.gia）

---

## 1. 背景与目标

一期已打通「structure.json（官方基础元件 items）→ .gil/.gia」编码管线与网页 JSON 编辑/导出。
二期在网页端补上**管线最上游**：用户手画线条 → 算法拟合 → 自动拆成基础元件装饰物 → 实时 3D 预览 → 复用一期管线导出。

长期愿景（三期+）：画一画 + 点一点颜色 → 生成效果好的模型（房子/碗/线条/字体）。
本 PRD 按长期方向设计分层，但只实现本期范围（见 §4 非目标）。

## 2. 用户流程

```
画布手绘（多笔画，鼠标/触摸）→ 选模式（挤出/旋转）→ 调参数（元件样式/数量）
→ 画布叠加显示拟合曲线 → 实时 3D 预览（拖拽旋转/缩放）
→ 导出 .gil/.gia（复用 /api/export）│ 作品自动保存 localStorage
```

## 3. 架构：分层管线（长期方向）

```
① 输入层   笔画（原始点，画布坐标） + 参数（模式/样式/数量）
      ↓
② 矢量层   Stroke：拟合曲线（抽稀→平滑→弧长均匀重采样）+ 封闭检测     ← 长期核心
      ↓ 渲染器 renderStroke（本期两个实现：extrude / lathe）
③ 元件层   TaggedItem[]（带 group 来源标签，颜色槽预留）
      ↓ 拍平 toStructureItems（strip 内部标签）
   标准 structure.json → .gil/.gia（一期管线，零改动）
```

演化路径（数据模型不堵路即可，不提前建抽象）：
- 渲染器扩展：fill（封闭填充）、沿路径排布、扫掠体 → 新实现，接口不变
- 颜色：Stroke 挂 color，渲染/拍平时写 item.color（一期字段已支持）
- 分组 → 部件化（墙/屋顶/门独立编辑）
- 曲线分析：形状识别/自动规整（远期）

## 4. 非目标（本期不做）

- 颜色功能（默认材质；数据模型预留颜色槽，见契约 §5.1）
- 封闭笔画填充（fill 渲染器；本期只做封闭检测与 UI 提示）
- 形状识别 / 自动规整
- 作品分享链接（本期只做 localStorage + JSON 导入导出）

## 5. 接口契约（主模型定，跨任务协调，实现必须遵守）

### 5.1 内部数据模型（src/draw/types.ts，任务 A 实现）

```ts
// 笔画：原始画布点（像素，x 右 y 下），不做任何处理，原样保存
export type Stroke = { id: string; points: ReadonlyArray<readonly [number, number]> }

// 生成参数
export type ModelOptions = {
  mode: 'extrude' | 'lathe'
  shape: 'cylinder' | 'box'        // extrude 杆样式；lathe 忽略
  size: number                     // 米：圆柱直径 / 方杆截面边长
  count: number                    // 每个笔画生成的元件数（extrude=段数，lathe=盘片层数）
  heightMeters: number             // 归一化后模型高度（包络盒高映射到此值）
}

// 带内部标签的元件（导出前必须拍平）
export type TaggedItem = {
  resourceId: number
  position: [number, number, number]   // 米
  rotation: [number, number, number]   // 度，编辑器 YXZ 内旋
  scale: [number, number, number]
  group: string                        // 来源笔画 id（颜色二期按组附着）
}

export function generateModel(strokes: Stroke[], opts: ModelOptions): { items: TaggedItem[]; closed: boolean[] }
export function toStructureItems(items: TaggedItem[]): StructureItem[]   // strip group 等内部字段
```

### 5.2 坐标语义（生成模块负责，任务 A 实现）

- 归一化：全部笔画包络盒 → 保持宽高比，高度 = `heightMeters` 米；映射后 y 向上（画布 y 翻转）、最低点贴 y=0、水平居中 x=0；z=0 平面。
- extrude：每段一个杆（圆柱 10009008 / 长方体 10009001），轴向对齐线段，位置 = 段中点。尺寸语义见 `docs/input-format.md` 资源速查表。
- lathe：旋转轴 = **归一化前**笔画包围盒左边缘（minX），半径 = `x - minX`；按采样点高度叠放圆盘（10009008），盘厚 = 总高 / count，scale.x/z = 直径 = 2r。

### 5.3 预览渲染器（web/draw/preview.js，任务 B 实现）

```js
// 无构建、原生 JS、零 npm 依赖；Three.js 走 CDN（unpkg/jsdelivr 均可，可多源 fallback）
createPreview(canvasEl) // → { setItems(structureItems), dispose() }
// setItems 输入 = 拍平后的 structure item（字段同 docs/input-format.md item）
// 内置拖拽旋转 + 滚轮缩放；环境光 + 方向光；MeshStandardMaterial 默认色
```

### 5.5 前端集成（任务 C 实现，补充）

- 静态文件：本地 `web/server.ts` 不服务静态文件（preview.js 会 404）——C 需新增静态路由；Vercel 端 `public/` 静态直达。
- 双 index.html：`web/index.html`（本地）与 `public/index.html`（Vercel）当前为同一 inode 硬链接，git 中为两份独立文件——改动必须两份同步。
- 算法前端调用：前端不内嵌算法（无 bundler），新增后端端点 `POST /api/draw-model`（本地 server.ts + Vercel api/draw.ts，逻辑 import src/draw 编译产物），返回 `{ items(已拍平), fitted, closed }`，前端画拟合曲线 + 预览 + 导出均基于此。
- 已知坑：three.min.js r150+ deprecation（r160 移除），集成时优先换 ES Modules 版（若 CDN 路径稳）或维持现状并记录。

## 6. 任务拆分与状态跟踪

| # | 任务 | 内容 | 依赖 | 状态 |
|---|---|---|---|---|
| A | 核心生成模块 | src/draw/：拟合（抽稀/平滑/均匀重采样/封闭检测）+ generateModel（extrude/lathe）+ 拍平 + 单元测试 | 无 | ✅ 2026-08-12 子模型完成，主模型修复 lathe 共轴 bug（盘心未居中于旋转轴），25 测试全绿 |
| B | Three.js 预览 | web/draw/preview.js + preview-demo.html 独立验证页 | 无 | ✅ 2026-08-12 子模型完成，浏览器实测通过（几何渲染/拖拽就绪）；遗留：three.min.js deprecation 警告（r160 移除），集成时若顺手可换 ESM 版 |
| C | 画布 UI + 集成 | index.html 画布/控制面板/拟合曲线叠加/localStorage/导出接入 + 后端 /api/draw-model | A、B | ✅ 2026-08-12 子模型完成，主模型浏览器实测全链路通过（画线→拟合→预览→导出）；主模型补充移动端首屏修复（窄屏压缩一期 textarea） |
| D | 主模型验收 | 浏览器实测（画线→预览→导出）+ 代码审查 | A、B、C | ✅ 2026-08-12 全链路验收通过，见下 |
| E | 文档与知识沉淀 | 用户操作说明、契约回写本 PRD | C | 🔲 待做（操作说明可并入 README） |

验收结论（2026-08-12）：build 零错误；25 测试全绿（8 draw + 17 golden 零回归）；API（extrude/lathe/400 校验）；浏览器全流程（画线→draw-model 调用→拟合琥珀色叠加→3D 预览渲染→状态栏元件计数→localStorage 自动保存→.gil 导出→移动端 390px 堆叠/touch-action:none）；修复：A 的 lathe 盘心未共轴、移动端首屏挤压。

遗留登记：① three.min.js deprecation（r160 移除，届时换 ESM）；② applyPreview(null) 清空场景时 preview.js 警告文案误导（无害）；③ 移动端预览区在首屏下方需滚动（设计如此）；④ git 提交与 Vercel 部署未做（待用户确认）。

验收标准（断言式）：
- A：`npm run build` 通过；`node --test dist/tests/*.test.js` 全绿；相同输入相同输出；拍平产物可被 `resolveStructure` 接受（未知字段报错机制兜底）
- B：demo 页浏览器打开零 console 报错、几何体可见、可拖拽旋转缩放
- C：浏览器实测全流程可走通（画→预览→导出文件）
- 整体：不破坏一期任何功能（golden 测试 17 条全绿）

## 7. 决策记录

| 决策 | 结论 | 理由 |
|---|---|---|
| 预览渲染 | Three.js（CDN 引入，非 npm 依赖） | 颜色二期必然重写自绘渲染器；预览是核心体验需实心材质+光照；CDN 不破坏零依赖；可镜像/内置降级 |
| 中间表示 | Stroke（原始点+拟合曲线+属性）为一等公民 | 保留原始点才能未来重拟合/识别；items 只是渲染产物 |
| 渲染器 | 统一接口 + 两个实现（extrude/lathe） | fill/路径排布等将来是"新实现"非重构 |
| 导出 | 内部模型拍平为标准 structure.json，复用一期管线 | structure.json fail-closed，未知字段报错；拍平逻辑必须在生成侧 |
| 颜色 | Stroke 挂 group 标签，item.color 槽预留 | 二期纯增量，不返工 |

## 8. 后续迭代路线

- 三期：颜色（按笔画上色，UI 色板 + 拍平写 item.color）
- 四期：封闭填充（fill 渲染器）、更多元件样式
- 远期：形状识别/规整、部件化编辑、分享链接
