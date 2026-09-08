# 网格-面片元素校准包

本目录由 `npm run gen-calibration` 确定性生成（先 `npm run build --silent`）。包含：

- `MANIFEST.json`：汇总（样例、单元数、字节、开放项、生成说明）。
- `a1-plane-unit` … `d2-cylinder-panelized`：每个样例的 `input.json` / `structure.json` /
  `model.gil` / `model.gia` / `summary.json`。

> 说明：本目录是**候选输出**（不写回真实地图）；候选需导入游戏/编辑器或交给 genshin-ts
> 适配器对照，见 [`docs/calibration-mesh-elements.md`](../../docs/calibration-mesh-elements.md)。
>
> 「10009019 网格元件直出」的 `.gia/.gil` 只携带 resourceId + 变换（GIA/GIL 不承载自定义
> 网格几何），游戏侧是否按几何渲染需在对照后登记；若为空壳则走「面板化」路径导出官方面片。
>
> 预览截图：本仓库无轻量无头渲染路径（`scripts/capture-views.sh` 需本地服务 + 浏览器 CDP，
> 且渲染的是网页预览而非游戏语义），故本轮不生成截图，仅保留「观察点」字段。
