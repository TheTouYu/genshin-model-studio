#!/usr/bin/env bash
# final-pass.sh —— 终验流水线（从最终 part 脚本一键复现全部交付产物）
#   1) run-pipeline.sh（9 批 part → partN.json → work.json/items.json/summary.json + 断言 150）
#   2) 独立 AABB 复算（independent-check.mjs，150 件逐对 + 接触图 + 应贴合对）
#   3) 导出主链（laptop-structure-in.json → export-mesh --format both --no-qa）+ gia_parser 读 root
#   4) 门禁复核（gate-check.py：no-clear 全量装配 → gms.link → gms.verify）
#   5) 六视角 + 诊断近景（capture-six.py / diag-views.py）
set -euo pipefail
cd /home/h/genshin-model-studio
OUT=exports/laptop

echo "########## 1/5 建模流水线"
bash "$OUT/run-pipeline.sh"

echo "########## 2/5 独立 AABB 复算"
node "$OUT/independent-check.mjs"

echo "########## 3/5 导出主链"
python3 - <<'PY'
import json
items = json.load(open('exports/laptop/items.json'))
json.dump({"name": "laptop", "items": items}, open('exports/laptop/laptop-structure-in.json', 'w'), ensure_ascii=False)
print('laptop-structure-in.json items =', len(items))
PY
npm run export-mesh --silent -- "$OUT/laptop-structure-in.json" --out-dir "$OUT" --format both --force --no-qa
echo "export-mesh exit=$?"
python3 tools/gia/gia_parser.py "$OUT/laptop.gia" --json "$OUT/parsed.json" | tail -3
python3 - <<'PY'
import json
d = json.load(open('exports/laptop/parsed.json'))
v = d['versions'][0]['data']
s = json.load(open('exports/laptop/laptop.summary.json'))
print('summary.itemCount =', s['model']['itemCount'])
print('resources =', {r: s['model']['resources'].count(r) for r in set(s['model']['resources'])})
print('rootTransform.scale =', v['rootTransform']['scale'])
t0 = d['items'][0]['data']['values'][0]['transform']
print('item0 position =', t0['position'], 'scale =', t0['scale'])
PY

echo "########## 4/5 门禁复核"
timeout 900 browser-harness < "$OUT/gate-check.py" | tail -5

echo "########## 5/5 六视角 + 诊断近景"
timeout 900 browser-harness < "$OUT/capture-six.py" | tail -7
timeout 900 browser-harness < "$OUT/diag-views.py" | tail -8
echo "########## DONE"
