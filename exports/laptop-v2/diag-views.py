# diag-views.py —— 笔记本 v2 诊断近景（D1–D10 逐项取证；用 setTarget 精确对准特征）
# 用法：browser-harness < exports/laptop-v2/diag-views.py
import json, time, os, base64, hashlib, math

OUT = '/home/h/genshin-model-studio/exports/laptop-v2/views/diag'
os.makedirs(OUT, exist_ok=True)
PI = math.pi
SHOTS = [
    ('screen-glow',      [0, 0.110, -0.118], 0.0, 1.35, 0.40),
    ('screen-camera',    [0, 0.205, -0.133], 0.0, 1.40, 0.14),
    ('screen-chin',      [0, 0.020, -0.102], 0.0, 1.40, 0.14),
    ('keyboard-zoom',    [0, 0.011, -0.040], 0.35, 0.90, 0.28),
    ('keycap-macro',     [-0.05, 0.011, -0.075], 0.35, 0.95, 0.10),
    ('trackpad-zoom',    [0, 0.011, 0.057], 0.30, 0.95, 0.20),
    ('side-minusx-usbc', [-0.152, 0.007, -0.040], -PI/2, PI/2, 0.22),
    ('usbc-macro',       [-0.152, 0.006, -0.040], -PI/2, PI/2, 0.08),
    ('side-plusx-jack',  [0.152, 0.006, -0.070], PI/2, PI/2, 0.16),
    ('jack-macro',       [0.152, 0.006, -0.070], PI/2, PI/2, 0.07),
    ('bottom-zoom',      [0, 0.004, -0.010], 0.65, PI-0.18, 0.45),
    ('grille-macro',     [-0.075, 0.001, -0.1025], 0.65, PI-0.42, 0.13),
    ('nameplate-macro',  [0, 0.003, 0.058], 0.0, PI-0.40, 0.16),
    ('speaker-macro',    [0.110, 0.003, 0.0735], 0.0, PI-0.40, 0.10),
    ('hinge-zoom',       [0, 0.013, -0.100], 1.10, 1.20, 0.14),
    ('hinge-rod-macro',  [0, 0.0115, -0.100], 3.1416, 1.30, 0.11),
    ('corner-macro',     [0.145, 0.007, 0.100], 0.90, 1.20, 0.09),
    ('logo-zoom',        [0, 0.109, -0.122], PI, 1.25, 0.16),
    ('iso-tight',        [0, 0.070, -0.020], 0.65, 0.85, 0.50),
    ('top-tight',        [0, 0.011, -0.010], 0.65, 0.12, 0.45),
    ('front-tight',      [0, 0.040, 0.000], 0.0, PI/2, 0.45),
]

tabs = [t for t in list_tabs() if t.get('url', '') == 'http://localhost:8787/']
if not tabs:
    tabs = [t for t in list_tabs() if 'localhost:8787' in t.get('url', '')]
switch_tab(tabs[0])
for _ in range(20):
    if js("typeof window.gmsPreview === 'object'"): break
    time.sleep(0.5)
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

def frame():
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

prev = frame()[1]
for name, tgt, yaw, pitch, radius in SHOTS:
    js("window.gmsPreview.setTarget(%f, %f, %f)" % tuple(tgt))
    time.sleep(0.2)
    fields = "yaw: %f, pitch: %f, radius: %f" % (yaw, pitch, radius)
    for attempt in range(6):
        js("window.gmsPreview.setCamera({%s})" % fields)
        time.sleep(0.3)
        now = json.loads(js("JSON.stringify(window.gmsPreview.getCamera())"))
        if abs(now['yaw'] - yaw) < 1e-3 and abs(now['pitch'] - pitch) < 1e-3 and abs(now['radius'] - radius) < 1e-3:
            break
    time.sleep(0.4)
    b64, h = frame()
    tries = 0
    while h == prev and tries < 10:
        time.sleep(0.4)
        b64, h = frame()
        tries += 1
    prev = h
    p = os.path.join(OUT, '%s.png' % name)
    open(p, 'wb').write(base64.b64decode(b64))
    print("%-18s %7d B retries=%d target=%s" % (name, len(b64) * 3 // 4, tries, tgt))
