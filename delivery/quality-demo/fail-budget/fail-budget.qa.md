# 导出 QA 报告 — fail-budget

- 目录：/home/h/genshin-model-studio/delivery/quality-demo/fail-budget
- 结论：**失败**

## ID 规则 — ✅
- 通过

## 资源覆盖 — ✅
- 未校准基元（候选/待校准，不判失败）：
  - 平面(10009003) status=未校准（出现 576 次，首例 item[0]）

## 单元预算 — ❌
- requested=10 used=576 exceeded=true gate=skipped
- 单元预算超限：需要 576 个单元，预算 10，超出 566

## 可回读 — ✅
- .gil：prefabId=1077936129 items=576 template=10005018 closureComplete=true
- .gia：items=576 idRange=[1073741825,1073742400] resources=[10009003] structureId=1077936129
- 通过

## 产物 — ✅
- ✅ fail-budget.structure.json (299103 bytes)
- ✅ fail-budget.summary.json (1268 bytes)
- ✅ fail-budget.gil (193075 bytes)
- ✅ fail-budget.gia (117169 bytes)
- ✅ fail-budget.mesh.json (94923 bytes)
- 一致性：items=576 units=576 meshFaces=1152

## 失败汇总
- 单元预算超限：需要 576 个单元，预算 10，超出 566

## 备注
- 资源覆盖：存在 1 类未校准基元（候选/待校准）：平面(10009003)×576

