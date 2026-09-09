# 导出 QA 报告 — macbook-pro-14-silver-open

- 目录：/home/h/genshin-model-studio/delivery/macbook-gia
- 结论：**失败**

## ID 规则 — ✅
- 通过

## 资源覆盖 — ✅
- 未校准基元（候选/待校准，不判失败）：
  - 平面(10009003) status=未校准（出现 1832 次，首例 item[0]）
  - 三棱锥(10009006) status=未校准（出现 13 次，首例 item[1026]）

## 单元预算 — ✅
- requested=null used=1845 exceeded=false gate=passed

## 可回读 — ❌
- .gia：items=1845 idRange=[1073741825,1073743669] resources=[10009003,10009006] structureId=1077936129
- 回读：.gil 不存在（/home/h/genshin-model-studio/delivery/macbook-gia/macbook-pro-14-silver-open.gil），无法回读

## 产物 — ✅
- ✅ macbook-pro-14-silver-open.structure.json (865523 bytes)
- ✅ macbook-pro-14-silver-open.summary.json (34391 bytes)
- ✅ macbook-pro-14-silver-open.gia (365220 bytes)
- 一致性：items=1845 units=1845 meshFaces=null

## 失败汇总
- 回读：.gil 不存在（/home/h/genshin-model-studio/delivery/macbook-gia/macbook-pro-14-silver-open.gil），无法回读

## 备注
- 资源覆盖：存在 2 类未校准基元（候选/待校准）：平面(10009003)×1832、三棱锥(10009006)×13

