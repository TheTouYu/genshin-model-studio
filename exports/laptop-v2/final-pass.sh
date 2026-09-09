#!/usr/bin/env bash
# final-pass.sh —— 笔记本 v2 终验流水线（从 part 脚本一键复现全部交付产物）
#   1) run-pipeline.sh（13 批 part → partN.json → 数值序拼装 → work.json/items.json + 断言 573）
#   2) 独立 AABB 复算（independent-check.mjs：573 件逐对 + 精确圆柱盒 + 接触图 + 应贴合对 + RDP 余量）
#   3) 命名作品构建（build-named.mjs：components/links + 入库页面历史）
#   4) 门禁复核（gate-check.py：gms.part 注册路径 → touches → link → gms.verify）
#   5) 导出主链（laptop-structure-in.json → export-mesh --format both --no-qa）+ gia_parser 读 root
#   6) 六视角 + 诊断近景（capture-six.py / diag-views.py）
set -euo pipefail
cd /home/h/genshin-model-studio
OUT=exports/laptop-v2

echo "########## 1/6 建模流水线"
bash "$OUT/run-pipeline.sh"

echo "########## 2/6 独立 AABB 复算"
node "$OUT/independent-check.mjs"

echo "########## 3/6 命名作品 + 历史入库"
node "$OUT/build-named.mjs"

echo "########## 4/6 门禁复核"
timeout 900 browser-harness < "$OUT/gate-check.py" | tail -4

echo "########## 5/6 导出主链"
python3 - <<'PY'
import json
items = json.load(open('exports/laptop-v2/items.json'))
json.dump({"name": "laptop", "items": items}, open('exports/laptop-v2/laptop-structure-in.json', 'w'), ensure_ascii=False)
print('laptop-structure-in.json items =', len(items))
PY
S=$(date +%s)
npm run export-mesh --silent -- "$OUT/laptop-structure-in.json" --out-dir "$OUT" --format both --force --no-qa
echo "export-mesh exit=$? elapsed=$(( $(date +%s) - S ))s"
python3 tools/gia/gia_parser.py "$OUT/laptop-v2.gia" --json "$OUT/parsed.json" | tail -2
python3 - <<'PY'
import json
d = json.load(open('exports/laptop-v2/parsed.json'))
v = d['versions'][0]['data']
s = json.load(open('exports/laptop-v2/laptop-v2.summary.json'))
print('summary.itemCount =', s['model']['itemCount'])
print('resources =', {r: s['model']['resources'].count(r) for r in set(s['model']['resources'])})
print('rootTransform.scale =', v['rootTransform']['scale'])
t0 = d['items'][0]['data']['values'][0]['transform']
print('item0 position =', t0['position'], 'scale =', t0['scale'])
PY

echo "########## 6/6 六视角 + 诊断近景"
timeout 900 browser-harness < "$OUT/capture-six.py" | tail -7
timeout 900 browser-harness < "$OUT/diag-views.py" | tail -21
echo "########## DONE"
