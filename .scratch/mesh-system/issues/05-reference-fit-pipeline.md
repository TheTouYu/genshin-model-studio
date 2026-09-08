# 05 — 参考图拟合通用管线

**What to build:** 任意对象参考图 → 结构化 manifest（视图 / 地标 / 部件数）+ 轮廓 mask → 环数据（供任意轮廓环放样消费）+ 色带 + overlay / IoU 数值报告；对袜/脚样例产出可复核产物。管线对不确定区域显式标注，报告为「量化的可核验结论」而非观感描述。

**Blocked by:** None — can start immediately（与 02/04 并行；与 04 联调非硬依赖）

**Status:** done

**交付物**
- `scripts/reference-fit.py`（CLI，argparse 风格对齐 extract-ganyu-profile.py；确定性、无时间戳）
- npm script `reference-fit`（`./.venv/bin/python scripts/reference-fit.py`）
- `tests/reference-fit.test.ts`（node:test，4 项，全绿）
- 演示产物：`delivery/reference-fit-demo/`（manifest / rings / rings-ellipse / color_bands / overlay-{front,side} / summary / contour）
- 项目级 `.venv`（pillow+numpy；.gitignore 已忽略 `.venv/` 与 `__pycache__/`）

**三项验收逐项处理**
- [x] 输入一张参考图产出 manifest + 环数据 + overlay 图 + IoU 数值报告
  - 已产出 manifest.json / rings.json / rings-ellipse.json / color_bands.json / overlay-{front,side}.png / summary.json。
  - IoU：能力已实现（`--gt-mask`，前景 vs 前景 intersection/union）；用合成 fixture 验证 IoU≈0.9906（提取与基准高度一致）。
  - 真实样例（07-sock-shin.png + 08-shoe.png）**无基准 gt-mask → summary.iou=null**，已在 summary/method 注明「无 gt-mask 未闭合」——未冒充已闭合。
- [x] 报告标出「不确定区域」，且同一输入确定性可重跑
  - manifest.uncertainties 明示：无顶视图（深度椭圆近似待顶视轮廓）/ 前视图顶部被裁切（高度被低估）/ 前视 2 部件与侧视 4 部件（以最大连通域为主剪影）/ 前视与侧视来自不同图像（组合环为近似）。
  - landmarks：topVisibleRow / bottomVisibleRow / widestRow 给出数值；ankle / arch / toe / heel 标注「未知区域 + 原因」（无顶视/遮挡/前视语义不可定位）。
  - 确定性：两次运行 sha256 全字节一致（rings/manifest/summary/color_bands/rings-ellipse/overlay-front 均由测试断言），无时间戳。
- [x] 环数据格式与 04 消费接口一致（联调样例跑通一次）
  - `contour-model delivery/reference-fit-demo/rings-ellipse.json --points 64 --no-gate` 成功产出 `sock-foot.mesh.json`（faces=2048, quads=1024, degenerate=0, units=1024）+ `.gil/.gia/.structure.json/.summary.json`，gate=skipped（SKIPPED_GATE）。
  - 说明：rings 走 04 form①（topOutline/sideProfile/points/colorBands/cap）被正确消费；WITH gate 会因「椭圆盖扇瘦长三角（6.25%>5%）+ 面积比 p95/p5=34.6>20 + 相机跨部件切变致 76 个朝内法线面」被拒。
  - 原因（如实）：无顶视图 → 用椭圆近似（宽×深），其扇盖三角天然偏瘦，触 04 门禁（技能文档已知 tradeoff：cap both + 椭圆 → 用 --no-gate 并标注）；cross-part（sock front + shoe side）深度/宽度不一致加剧法线翻转。属几何质量 tradeoff，非格式不兼容。

**未闭合 / 待补**
- 顶视图轮廓提取（--top）：当前按角度绕质心排序 + 原始采样，未弧长重采样；深凹形会失真 → 标注不确定。
- 若提供「同一对象」的 front+side（如 ganyu-front.png + ganyu-side.png）可得到物理一致的组合环；本演示用 sock(shin)+shoe 为管线说明性示例。
