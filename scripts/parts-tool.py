#!/usr/bin/env python3
"""parts-tool.py — 甘雨细节拆分 ticket 工具（用户方法论：细节拆分 → 局部优化 → 汇总）

用法:
  python3 scripts/parts-tool.py gen                 # 从 v15 按部位切出 scripts/parts/ganyu-<part>.js + manifest
  python3 scripts/parts-tool.py list                # 列出 tickets（状态/说明）
  python3 scripts/parts-tool.py update <id> <status> [note]   # 更新 ticket
  python3 scripts/parts-tool.py run <id1> [id2...] # 只运行这些部分（缓存其余）→ parts/<id>.json
  python3 scripts/parts-tool.py compose [outdir]   # 用缓存 parts 汇总 → POST → 导入 → 截图
"""
import json, os, sys, subprocess, glob, urllib.request, base64

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTS = os.path.join(ROOT, 'scripts', 'parts')
MANIFEST = os.path.join(PARTS, 'manifest.json')
SRC = os.path.join(ROOT, 'scripts', 'draw-ganyu-soccer-v15.js')
URL = 'http://localhost:8787/'

SECTIONS = [
    ('torso', '/* ---------- 躯干皮肤', '/* ---------- 短裤壳层'),
    ('shorts', '/* ---------- 短裤壳层', '/* ---------- 腿（皮肤底座'),
    ('legs', '/* ---------- 腿（皮肤底座', '/* ---------- 臂（皮肤 + 白袖'),
    ('arms', '/* ---------- 臂（皮肤 + 白袖', '/* ---------- 头 + 五官'),
    ('face', '/* ---------- 头 + 五官', '/* ---------- 头发：头皮壳'),
    ('hair', '/* ---------- 头发：头皮壳', '/* ---------- 球鞋'),
    ('shoes', '/* ---------- 球鞋', '/* ---------- 贴面图案'),
    ('patterns', '/* ---------- 贴面图案', 'window.__gmsBatchEnd'),
]
DEFAULT_STATUS = {'face': 'optimizing', 'hair': 'optimizing', 'arms': 'done', 'legs': 'done',
                  'torso': 'done', 'shorts': 'done', 'shoes': 'done', 'patterns': 'done'}

def prelude(src):
    return src[:src.index('/* ---------- 躯干皮肤')]

def gen():
    src = open(SRC).read(); pre = prelude(src); manifest = []
    for pid, start, end in SECTIONS:
        i = src.index(start); j = src.index(end, i)
        body = src[i:j].rstrip()
        open(os.path.join(PARTS, f'ganyu-{pid}.js'), 'w').write(f'{pre}\n{body}\nwindow.__gmsBatchEnd && window.__gmsBatchEnd();\n')
        manifest.append({'id': pid, 'file': f'ganyu-{pid}.js', 'status': DEFAULT_STATUS.get(pid, 'todo'),
                         'note': '', 'view': 'front/side/back', 'crop': ''})
    json.dump({'parts': manifest}, open(MANIFEST, 'w'), ensure_ascii=False, indent=1)
    print('gen done:', ', '.join(m['id'] for m in manifest))

def load_manifest():
    if not os.path.exists(MANIFEST): gen()
    return json.load(open(MANIFEST))

def run_browser(script):
    return subprocess.run(['browser-harness'], input=script, capture_output=True, text=True, timeout=900)

def run_part(pid):
    m = load_manifest()
    entry = next(x for x in m['parts'] if x['id'] == pid)
    jsfile = os.path.join(PARTS, entry['file'])
    outjson = os.path.join(PARTS, pid + '.json')
    script = f'''
import time, json
tabs=[t for t in list_tabs() if '8787' in t.get('url','')]
if not tabs: new_tab('{URL}'); time.sleep(4)
else: switch_tab(tabs[0])
for _ in range(20):
    if js("typeof window.gms === 'object'"): break
    time.sleep(0.5)
expr = '(() => {{ try {{ ' + open({jsfile!r}).read() + ' return {{ok:true}} }} catch (e) {{ return {{ok:false, error:String(e && e.message || e)}} }} }})()'
try:
    r = js(expr)
except Exception as e:
    print("inj-timeout(ok):", e)
time.sleep(3)
for _ in range(60):
    time.sleep(1.0)
    try:
        st=js("(document.getElementById('drawStatus')||{{}}).textContent") or ''
        if '元件' in st and '生成中' not in st and '失败' not in st: break
    except Exception: pass
work=js("JSON.stringify(window.gms.export())")
open({outjson!r},'w').write(work)
print("part", {pid!r}, "strokes:", len(json.loads(work)['strokes']))
'''
    r = run_browser(script)
    print(r.stdout[-400:]); print(r.stderr[-300:])
    return r.returncode == 0

def compose(outdir):
    outdir = outdir or '/tmp/ganyu-parts'
    os.makedirs(outdir + '/parts', exist_ok=True)
    files = [f for f in sorted(glob.glob(os.path.join(PARTS, '*.json'))) if os.path.basename(f) != 'manifest.json']
    works = [json.load(open(f)) for f in files]
    if not works: print('NO PARTS'); return
    base = works[0]; strokes = []; seen = set()
    for w in works:
        for s in w['strokes']:
            if s['id'] in seen: s['id'] = s['id'] + '_x'
            seen.add(s['id']); strokes.append(s)
    c = {'version': 3, 'strokes': strokes, 'options': base['options']}
    json.dump(c, open(outdir + '/work.json', 'w'))
    req = urllib.request.Request(URL + 'api/draw-model', data=json.dumps(c).encode(), headers={'Content-Type': 'application/json'}, method='POST')
    items = json.loads(urllib.request.urlopen(req, timeout=300).read())['items']
    json.dump(items, open(outdir + '/items.json', 'w'))
    print('ITEMS:', len(items))
    script = """
import time, json, base64
tabs=list_tabs(); switch_tab(tabs[0])
data=open(__OUTDIR__ + '/work.json','rb').read()
b64=base64.b64encode(data).decode()
js('window.__w=""')
for i in range(0, len(b64), 60000):
    js('window.__w += atob("%s")' % b64[i:i+60000])
js("window.gms.import(JSON.parse(window.__w))")
time.sleep(3)
for k in range(40):
    time.sleep(3)
    try:
        st=js("(document.getElementById('drawStatus')||{}).textContent") or ''
    except Exception: st='BUSY'
    if '元件' in st and '生成中' not in st and '失败' not in st: break
print("status:", st)
js('(() => { const c = document.getElementById("previewCanvas"); c.style.position="fixed"; c.style.inset="0"; c.style.width="100vw"; c.style.height="100vh"; c.style.zIndex="9999"; c.style.border="none"; c.style.background="#000000"; document.body.style.overflow="hidden"; window.dispatchEvent(new Event("resize")); })()')
time.sleep(1.0)
js("window.gmsPreview.setGridVisible(false)"); js("window.gmsPreview.setBackground('#000000')")
for name, cam in [('front', {"yaw":0,"pitch":1.57,"radius":None}), ('iso', {"yaw":0.65,"pitch":0.85,"radius":None}), ('back', {"yaw":3.14159,"pitch":1.57,"radius":None})]:
    js("window.gmsPreview.resetView()"); time.sleep(0.4)
    js("window.gmsPreview.setCamera(%s)" % json.dumps(cam)); time.sleep(1.0)
    print(name, capture_screenshot(path=__OUTDIR__ + '/view-' + name + '.png'))
js("window.gmsPreview.resetView()"); time.sleep(0.4)
js('window.gmsPreview.setCamera({"yaw":0,"pitch":1.57,"radius":null})'); time.sleep(1.2)
print("clean", capture_screenshot(path=__OUTDIR__ + '/view-front-clean.png'))
""".replace('__OUTDIR__', repr(outdir))
    r = run_browser(script)
    print(r.stdout[-500:]); print(r.stderr[-300:])

def update(pid, status, note=''):
    m = load_manifest()
    for e in m['parts']:
        if e['id'] == pid:
            e['status'] = status
            if note: e['note'] = note
            json.dump(m, open(MANIFEST, 'w'), ensure_ascii=False, indent=1)
            print('updated', pid, status, note); return
    print('unknown part:', pid)

def listparts():
    m = load_manifest()
    print(f"{'id':<9} {'status':<10} note")
    for e in m['parts']:
        print(f"{e['id']:<9} {e['status']:<10} {e['note']}")

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'
    if cmd == 'gen': gen()
    elif cmd == 'list': listparts()
    elif cmd == 'update': update(sys.argv[2], sys.argv[3], ' '.join(sys.argv[4:]))
    elif cmd == 'run':
        for pid in sys.argv[2:]: run_part(pid)
    elif cmd == 'compose': compose(sys.argv[2] if len(sys.argv) > 2 else None)
    else:
        print(__doc__)
