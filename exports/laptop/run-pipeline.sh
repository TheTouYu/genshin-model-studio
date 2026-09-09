#!/usr/bin/env bash
# run-pipeline.sh —— 笔记本电脑建模流水线（确定性重跑）
#
# 解决两个实测坑：
#   ① 页面 localStorage 残留（gms.draw.work.v1）+ 多标签页 storage 事件 → 某批 part 的导出被
#      restoreLocal 覆盖（实测 part5.json 只剩 1 笔探针残留，summary items=146≠150）。
#      → 跑前只保留唯一建模标签页、清 localStorage、reload。
#   ② run-gms-parts.sh 按 host 取 tabs[0]，多标签会打错页（hanfu-cage 无 window.gms）。
# 用法：bash exports/laptop/run-pipeline.sh
set -euo pipefail
cd /home/h/genshin-model-studio
OUT=exports/laptop
PARTS=(scripts/parts/laptop-base.js scripts/parts/laptop-lid.js scripts/parts/laptop-hinge.js
       scripts/parts/laptop-keyboard.js scripts/parts/laptop-trackpad.js scripts/parts/laptop-screen.js
       scripts/parts/laptop-ports.js scripts/parts/laptop-grille.js scripts/parts/laptop-feet.js)
EXPECT=(16 10 3 84 5 8 10 10 4)

echo "== 0. 清理标签页 + localStorage + reload"
browser-harness <<'PY'
import time
tabs = [t for t in list_tabs() if 'localhost:8787' in t.get('url', '')]
keep = None
for t in tabs:
    if t.get('url', '').rstrip('/') == 'http://localhost:8787':
        keep = keep or t
    else:
        close_tab(t)
if keep is None:
    new_tab('http://localhost:8787/')
    time.sleep(5)
    tabs = [t for t in list_tabs() if t.get('url', '').rstrip('/') == 'http://localhost:8787']
    keep = tabs[0]
switch_tab(keep)
js("try{localStorage.removeItem('gms.draw.work.v1')}catch(e){}")
js("location.reload()")
time.sleep(6)
for _ in range(20):
    if js("typeof window.gms === 'object' && typeof window.gmsPreview === 'object'"): break
    time.sleep(0.5)
print("page:", js("location.href"), "| gms:", js("typeof window.gms"))
PY

echo "== 1. 跑 part 流水线"
bash scripts/run-gms-parts.sh "$OUT" "${PARTS[@]}"

echo "== 2. 断言每批笔画数"
python3 - "$OUT" "${EXPECT[@]}" <<'PY'
import json, sys, glob, os
out = sys.argv[1]; expect = [int(x) for x in sys.argv[2:]]
files = sorted(glob.glob(out + '/parts/part*.json'), key=lambda f: int(''.join(c for c in os.path.basename(f) if c.isdigit())))
bad = []
total = 0
for i, f in enumerate(files):
    n = len(json.load(open(f))['strokes']); total += n
    ok = i < len(expect) and n == expect[i]
    print('  %-14s strokes=%-4d expect=%s %s' % (os.path.basename(f), n, expect[i] if i < len(expect) else '?', 'OK' if ok else 'MISMATCH'))
    if not ok: bad.append(f)
summ = json.load(open(out + '/summary.json'))
print('  composed strokes=%d items=%d ok=%s (expect %d)' % (summ.get('strokes', -1), summ.get('items', -1), summ.get('ok'), sum(expect)))
if bad or total != sum(expect) or summ.get('items') != sum(expect):
    print('PIPELINE FAIL'); sys.exit(1)
print('PIPELINE OK')
PY
