# diag-views.py —— 诊断视角（不是交付六视图；用于近景复核接口/格栅/脚垫/铰链/键盘）
# 用法：browser-harness < exports/laptop/diag-views.py
import json, time, os, base64, hashlib, math

OUT = '/home/h/genshin-model-studio/exports/laptop/views/diag'
os.makedirs(OUT, exist_ok=True)
SHOTS = [
    ('side-plusx-jack',  {'yaw': 1.5708,  'pitch': 1.5708, 'radius': 0.42}),   # 相机在 +X → 看 +x 侧（耳机孔）
    ('side-minusx-usbc', {'yaw': -1.5708, 'pitch': 1.5708, 'radius': 0.42}),   # 相机在 −X → 看 −x 侧（USB-C）
    ('bottom-grille',    {'yaw': 0.65,    'pitch': math.pi - 0.12, 'radius': 0.55}),
    ('front-tight',      {'yaw': 0.0,     'pitch': 1.5708, 'radius': 0.55}),
    ('top-tight',        {'yaw': 0.65,    'pitch': 0.12,   'radius': 0.60}),
    ('iso-tight',        {'yaw': 0.65,    'pitch': 0.85,   'radius': 0.50}),
    ('hinge-close',      {'yaw': 1.15,    'pitch': 1.15,   'radius': 0.35}),
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
for name, cam in SHOTS:
    fields = ",".join("%s: %s" % (k, v) for k, v in cam.items())
    for attempt in range(6):
        js("window.gmsPreview.setCamera({%s})" % fields)
        time.sleep(0.4)
        now = json.loads(js("JSON.stringify(window.gmsPreview.getCamera())"))
        if abs(now['yaw'] - cam['yaw']) < 1e-3 and abs(now['pitch'] - cam['pitch']) < 1e-3 and abs(now['radius'] - cam['radius']) < 1e-3:
            break
    time.sleep(0.5)
    b64, h = frame()
    tries = 0
    while h == prev and tries < 10:
        time.sleep(0.4)
        b64, h = frame()
        tries += 1
    prev = h
    p = os.path.join(OUT, '%s.png' % name)
    open(p, 'wb').write(base64.b64decode(b64))
    print("%-18s %7d B retries=%d" % (name, len(b64) * 3 // 4, tries))
