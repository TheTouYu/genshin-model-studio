#!/usr/bin/env bash
# run-gms-parts.sh — 局部作品「先生成 + 最后拼装」流水线（2026-09-06 用户效率优化）
#
# 用法: scripts/run-gms-parts.sh <输出目录> <part1.js> <part2.js> ...
#   每人 part 独立小构建（秒级），导出 <out>/parts/partN.json；
#   随后合成完整 work（strokes 拼接）→ POST → items；
#   再注入 `window.gms.import(composed)` → 全量预览 → 六视角截图 + 干净剪影。
#
# 价值：迭代单个局部（如鞋/发/腿）只重跑该 part；框架不变，最后拼装复核。
URL="${URL:-http://localhost:8787/}"
OUT="$1"; [ -z "$OUT" ] && { echo "用法: run-gms-parts.sh <输出目录> <part.js>..." >&2; exit 1; }
shift
mkdir -p "$OUT/parts"
export URL OUT
i=0
for p in "$@"; do
  i=$((i+1)); name="part$i"
  export PART_FILE="$p" PART_OUT="$OUT/parts/$name.json"
  echo "== 生成局部 part$i: $p"
  browser-harness <<'PY' || { echo "PART FAIL: $p"; exit 1; }
import time, os, json
URL=os.environ['URL']; OUT=os.environ['OUT']; PART_FILE=os.environ['PART_FILE']; PART_OUT=os.environ['PART_OUT']
tabs=[t for t in list_tabs() if URL.split('//')[1].split('/')[0] in t.get('url','')]
if not tabs: new_tab(URL); time.sleep(4)
else: switch_tab(tabs[0])
for _ in range(20):
    if js("typeof window.gms === 'object'"): break
    time.sleep(0.5)
src=open(PART_FILE).read()
r=js(f"""(() => {{ try {{ {src}
  return {{ok:true}}
}} catch (e) {{ return {{ok:false, error:String(e && e.message || e)}} }} }})()""")
time.sleep(2.0)
if not r.get('ok'):
    print("PART_EXEC_ERROR:", r.get('error')); raise SystemExit(1)
for _ in range(60):
    time.sleep(1.0)
    try:
        st=js("(document.getElementById('drawStatus')||{}).textContent") or ''
        if '元件' in st and '生成中' not in st and '失败' not in st: break
    except Exception: pass
work=js("JSON.stringify(window.gms.export())")
open(PART_OUT,'w').write(work)
print("  -> ", PART_OUT, "strokes:", len(json.loads(work)['strokes']))
PY
done

echo "== 拼装 + POST"
python3 - <<'PY'
import json, glob, urllib.request, urllib.error, os
OUT=os.environ['OUT']; URL=os.environ['URL']
files=sorted(glob.glob(OUT+'/parts/part*.json'))
works=[json.load(open(f)) for f in files]
base=works[0]; strokes=[]; seen=set(); dup=0
for w in works:
    for s in w['strokes']:
        if s['id'] in seen:
            s['id']=s['id']+'_x'+str(dup); dup+=1
        seen.add(s['id']); strokes.append(s)
composed={'version': 3, 'strokes': strokes, 'options': base['options']}
json.dump(composed, open(OUT+'/work.json','w'))
try:
    req=urllib.request.Request(URL+'api/draw-model', data=json.dumps(composed).encode(), headers={'Content-Type':'application/json'}, method='POST')
    items=json.loads(urllib.request.urlopen(req, timeout=300).read())['items']
    json.dump(items, open(OUT+'/items.json','w'))
    summary={'ok':True,'strokes':len(strokes),'items':len(items),'parts':len(works)}
except Exception as e:
    summary={'ok':False,'error':str(e)}
json.dump(summary, open(OUT+'/summary.json','w'))
print("SUMMARY:", summary)
PY

echo "== 注入拼装作品 + 截图"
export COMPOSED="$OUT/work.json"
browser-harness <<'PY'
import json, time, os
OUT=os.environ['OUT']
composed=json.load(open(OUT+'/work.json'))
tabs=list_tabs(); switch_tab(tabs[0])
import base64
b64=base64.b64encode(json.dumps(composed).encode()).decode()
js('window.__w=""')
for _i in range(0, len(b64), 60000):
    js('window.__w += atob("%s")' % b64[_i:_i+60000])
js("window.gms.import(JSON.parse(window.__w))")
time.sleep(3.0)
for _ in range(60):
    time.sleep(1.0)
    try:
        st=js("(document.getElementById('drawStatus')||{}).textContent") or ''
        if '元件' in st and '生成中' not in st and '失败' not in st: break
    except Exception: pass
js("""(() => { const c = document.getElementById('previewCanvas'); c.style.position='fixed'; c.style.inset='0'; c.style.width='100vw'; c.style.height='100vh'; c.style.zIndex='9999'; c.style.border='none'; c.style.background='#000000'; document.body.style.overflow='hidden'; window.dispatchEvent(new Event('resize')); })()""")
time.sleep(1.0)
js("window.gmsPreview.setGridVisible(false)"); js("window.gmsPreview.setBackground('#000000')")
js("window.gmsPreview.resetView()"); time.sleep(0.6)
for name, cam in [('iso', {"yaw":0.65,"pitch":0.85,"radius":None}), ('front', {"yaw":0,"pitch":1.57,"radius":None}), ('back', {"yaw":3.14159,"pitch":1.57,"radius":None}), ('left', {"yaw":1.5708,"pitch":1.57,"radius":None})]:
    js("window.gmsPreview.resetView()"); time.sleep(0.4)
    js("window.gmsPreview.setCamera(%s)" % json.dumps(cam)); time.sleep(1.0)
    print(name, capture_screenshot(path=OUT+'/view-%s.png' % name))
js("window.gmsPreview.resetView()"); time.sleep(0.4)
js("window.gmsPreview.setCamera({yaw:0, pitch:1.57, radius:null})"); time.sleep(1.2)
print("clean", capture_screenshot(path=OUT+'/view-front-clean.png'))
PY
