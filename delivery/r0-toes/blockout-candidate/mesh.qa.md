# 导出 QA 报告 — mesh

- 目录：/home/h/genshin-model-studio/delivery/r0-toes/blockout-candidate
- 结论：**通过**

## ID 规则 — ✅
- 通过

## 资源覆盖 — ✅
- 未校准基元（候选/待校准，不判失败）：
  - 平面(10009003) status=未校准（出现 548 次，首例 item[0]）
  - 三棱锥(10009006) status=未校准（出现 28 次，首例 item[199]）

## 单元预算 — ✅
- requested=null used=576 exceeded=false gate=passed

## 可回读 — ✅
- .gil：prefabId=1077936129 items=576 template=10005018 closureComplete=true
- .gia：items=576 idRange=[1073741825,1073742400] resources=[10009003,10009006] structureId=1077936129
- 通过

## 产物 — ✅
- ✅ mesh.structure.json (292205 bytes)
- ✅ mesh.summary.json (11522 bytes)
- ✅ mesh.gil (188596 bytes)
- ✅ mesh.gia (114919 bytes)
- 一致性：items=576 units=576 meshFaces=null

## 备注
- 资源覆盖：存在 2 类未校准基元（候选/待校准）：平面(10009003)×548、三棱锥(10009006)×28

