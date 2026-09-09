#!/usr/bin/env bash
# run-pipeline.sh —— 笔记本 v2 细节升级版建模流水线（确定性重跑）
#
# 与 v1 相同的两个坑规避：
#   ① 页面 localStorage 残留 + 多标签 storage 事件 → 跑前只保留唯一 8787 建模标签、清 localStorage、reload；
#   ② run-gms-parts.sh 取 tabs[0] → 必须先切到 http://localhost:8787/ 建模页。
# 用法：bash exports/laptop-v2/run-pipeline.sh
set -euo pipefail
cd /home/h/genshin-model-studio
OUT=exports/laptop-v2
PARTS=(scripts/parts/laptop-v2-base.js
       scripts/parts/laptop-v2-keyboard-1.js scripts/parts/laptop-v2-keyboard-2.js
       scripts/parts/laptop-v2-keyboard-3.js scripts/parts/laptop-v2-keyboard-4.js
       scripts/parts/laptop-v2-trackpad.js scripts/parts/laptop-v2-lid.js scripts/parts/laptop-v2-screen.js
       scripts/parts/laptop-v2-ports.js scripts/parts/laptop-v2-grille.js scripts/parts/laptop-v2-bottom.js
       scripts/parts/laptop-v2-hinge.js scripts/parts/laptop-v2-feet.js)
EXPECT=(55 100 100 100 100 7 26 25 19 18 4 12 4)

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
# 关键加固（2026-09-08 实测坑）：页面在 part 运行途中若发生重载，restoreLocal() 会把旧作品灌回来
# → 某一批 part 的导出变成整机状态（实测 part5.json 573 笔而非 100 笔）。
# 这里把 Storage.prototype.setItem 打成 no-op：本轮不落盘，重载也无旧状态可恢复。
js("window.__origSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(){ }")
print("page:", js("location.href"), "| gms:", js("typeof window.gms"),
      "| persisted strokes:", js("(() => { try { const w = JSON.parse(localStorage.getItem('gms.draw.work.v1')||'null'); return w && w.strokes ? w.strokes.length : 0 } catch(e) { return 'err' } })()"),
      "| setItem patched:", js("Storage.prototype.setItem !== window.__origSetItem"))
PY

echo "== 1. 跑 part 流水线"
bash scripts/run-gms-parts.sh "$OUT" "${PARTS[@]}"

echo "== 1b. 数值序拼装（覆盖运行器字典序拼装）"
node exports/laptop-v2/assemble.mjs

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
    print('  %-16s strokes=%-4d expect=%s %s' % (os.path.basename(f), n, expect[i] if i < len(expect) else '?', 'OK' if ok else 'MISMATCH'))
    if not ok: bad.append(f)
summ = json.load(open(out + '/summary.json'))
print('  composed strokes=%d items=%d ok=%s (expect %d)' % (summ.get('strokes', -1), summ.get('items', -1), summ.get('ok'), sum(expect)))
if bad or total != sum(expect) or summ.get('items') != sum(expect):
    print('PIPELINE FAIL'); sys.exit(1)
import collections
print('  resources:', dict(collections.Counter(i['resourceId'] for i in json.load(open(out + '/items.json')))))
print('PIPELINE OK')
PY
