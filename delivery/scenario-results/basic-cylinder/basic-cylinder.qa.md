# 导出 QA 报告 — basic-cylinder

- 目录：/home/h/genshin-model-studio/delivery/scenario-results/basic-cylinder
- 结论：**通过**

## ID 规则 — ✅
- 通过

## 资源覆盖 — ✅
- 未校准基元（候选/待校准，不判失败）：
  - 平面(10009003) status=未校准（出现 48 次，首例 item[0]）

## 单元预算 — ✅
- requested=null used=48 exceeded=false gate=passed

## 可回读 — ✅
- .gil：prefabId=1077936129 items=48 template=10005018 closureComplete=true
- .gia：items=48 idRange=[1073741825,1073741872] resources=[10009003] structureId=1077936129
- 通过

## 产物 — ✅
- ✅ basic-cylinder.structure.json (16073 bytes)
- ✅ basic-cylinder.summary.json (2073 bytes)
- ✅ basic-cylinder.gil (16217 bytes)
- ✅ basic-cylinder.gia (10364 bytes)
- ✅ basic-cylinder.mesh.json (5672 bytes)
- 一致性：items=48 units=48 meshFaces=96

## 备注
- 资源覆盖：存在 1 类未校准基元（候选/待校准）：平面(10009003)×48

