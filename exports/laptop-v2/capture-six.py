# capture-six.py —— 笔记本 v2 六视角截图（capture-views.sh 同预设 + 陈旧帧守卫）
# 用法：browser-harness < exports/laptop-v2/capture-six.py
import json, time, os, base64, hashlib

OUT = os.environ.get('OUT', '/home/h/genshin-model-studio/exports/laptop-v2/views')
os.makedirs(OUT, exist_ok=True)
PRESETS = [
    ('iso',     {"yaw": 0.65, "pitch": 0.85, "radius": None}),
    ('top',     {"yaw": 0.65, "pitch": 0.12, "radius": None}),
    ('front',   {"yaw": 0.0,  "pitch": 1.57, "radius": None}),
    ('left',    {"yaw": 1.5708, "pitch": 1.57, "radius": None}),
    ('right',   {"yaw": -1.5708, "pitch": 1.57, "radius": None}),
    ('closeup', {"yaw": 0.65, "pitch": 0.85, "radius": 0.8}),
]

tabs = [t for t in list_tabs() if t.get('url', '') == 'http://localhost:8787/']
if not tabs:
    tabs = [t for t in list_tabs() if 'localhost:8787' in t.get('url', '')]
switch_tab(tabs[0])
for _ in range(20):
    if js("typeof window.gms === 'object' && typeof window.gmsPreview === 'object'"): break
    time.sleep(0.5)

# 载入全量作品（页面历史端点；避免大字符串经 CDP 传参）
HIST_ID = os.environ.get('HIST_ID') or open('/home/h/genshin-model-studio/exports/laptop-v2/history-id.txt').read().strip()
js("window.__histWork = null")
js("fetch('/api/history/get?id=%s').then(r=>r.json()).then(w=>{window.__histWork=w; return 'ok'})" % HIST_ID)
for _ in range(40):
    if js("!!window.__histWork"): break
    time.sleep(0.5)
js("window.gms.import(window.__histWork)")
for _ in range(120):
    _st = js("(document.getElementById('drawStatus')||{}).textContent") or ''
    if '元件' in _st and '生成中' not in _st and '失败' not in _st: break
    time.sleep(1.0)
print("model:", js("JSON.stringify(window.gms.summary())"))

js("""(() => { const c = document.getElementById('previewCanvas'); c.style.position='fixed'; c.style.inset='0';
  c.style.width='100vw'; c.style.height='100vh'; c.style.zIndex='9999'; c.style.border='none';
  c.style.borderRadius='0'; c.style.background='#10151c'; document.body.style.overflow='hidden';
  window.dispatchEvent(new Event('resize')); })()""")
time.sleep(1.0)
js("window.gmsPreview.setGridVisible(false)")
js("window.gmsPreview.setBackground('#000000')")
js("window.gmsPreview.setWireframe(false)")
try:
    cdp("Page.bringToFront")
    time.sleep(0.5)
except Exception as e:
    print("bringToFront 失败:", e)

def frame_hash():
    b64 = js("""(() => {
      const c = document.getElementById('previewCanvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const w = c.width, h = c.height;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const c2 = document.createElement('canvas'); c2.width=w; c2.height=h;
      const ctx2 = c2.getContext('2d'); const img = ctx2.createImageData(w,h);
      for (let y=0;y<h;y++) img.data.set(buf.subarray(y*w*4,(y+1)*w*4),(h-1-y)*w*4);
      ctx2.putImageData(img,0,0);
      return c2.toDataURL('image/png').split(',')[1];
    })()""")
    return b64, hashlib.sha256(base64.b64decode(b64)).hexdigest()

_, prev = frame_hash()
report = []
js("window.gmsPreview.resetView()")
time.sleep(0.8)
auto_radius = json.loads(js("JSON.stringify(window.gmsPreview.getCamera())"))['radius']
# 五视角与 closeup 必须「互不相同」：closeup 固定 0.8，若自动取景半径接近 0.8 则两者视觉相同
# → 五视角取 max(自动半径, 1.25)，保证与 closeup 有明显视距差（2026-09-08 实测 auto=0.799）。
far_radius = 2.4   # 与上轮基线一致（逐视角对照），且与 closeup 0.8 明显不同
print("auto radius:", auto_radius, "| five-view radius:", far_radius)

for name, cam in PRESETS:
    target = dict(cam)
    if target.get('radius') is None:
        target['radius'] = far_radius
    fields = ",".join("%s: %s" % (k, v) for k, v in target.items() if v is not None)
    for attempt in range(6):
        js("window.gmsPreview.setCamera({%s})" % fields)
        time.sleep(0.4)
        now = json.loads(js("JSON.stringify(window.gmsPreview.getCamera())"))
        ok = abs(now['yaw'] - target['yaw']) < 1e-3 and abs(now['pitch'] - target['pitch']) < 1e-3 \
             and abs(now['radius'] - target['radius']) < 1e-3
        if ok: break
    time.sleep(0.6)
    b64, h = frame_hash()
    tries = 0
    while h == prev and tries < 12:
        time.sleep(0.5)
        b64, h = frame_hash()
        tries += 1
    prev = h
    png = base64.b64decode(b64)
    path = os.path.join(OUT, 'view-%s.png' % name)
    open(path, 'wb').write(png)
    cam_now = json.loads(js("JSON.stringify(window.gmsPreview.getCamera())"))
    report.append({"view": name, "requested": target, "actual": cam_now, "bytes": len(png),
                   "sha256": h, "staleRetries": tries})
    print("%-8s %7d B  retries=%d  cam=%s" % (name, len(png), tries, json.dumps(cam_now)))
open(os.path.join(OUT, 'capture-report.json'), 'w').write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print("report:", os.path.join(OUT, 'capture-report.json'))
