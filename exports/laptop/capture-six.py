# capture-six.py —— 六视角截图（与 scripts/capture-views.sh 同预设值 + 陈旧帧守卫）
#
# 为什么不用 capture-views.sh 直接产出：实测该脚本的 iso 帧会残留上一个相机状态
# （run-gms-parts.sh 末尾把相机停在 front；随后 capture-views 的 iso 用 resetView() 后 0.6s 截图，
#  拿到的是上一帧 → view-iso.png 与 view-front.png 逐字节相同 sha256=87dff26c…）。
# 本脚本：每个视角 setCamera 后轮询「渲染帧哈希发生变化」再落盘（最多 8 次 × 0.5s），
# 并回读 gmsPreview.getCamera() 断言 yaw/pitch/radius 生效。
# 预设（PROMPT §7，与 capture-views.sh 完全一致）：
#   iso(yaw 0.65 / pitch 0.85) top(0.65 / 0.12) front(0 / 1.57) left(1.5708 / 1.57)
#   right(−1.5708 / 1.57) closeup(0.65 / 0.85 / radius 0.8)
import json, time, os, base64, hashlib

OUT = os.environ.get('OUT', '/home/h/genshin-model-studio/exports/laptop/views')
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

js("""(() => { const c = document.getElementById('previewCanvas'); c.style.position='fixed'; c.style.inset='0';
  c.style.width='100vw'; c.style.height='100vh'; c.style.zIndex='9999'; c.style.border='none';
  c.style.borderRadius='0'; c.style.background='#10151c'; document.body.style.overflow='hidden';
  window.dispatchEvent(new Event('resize')); })()""")
time.sleep(1.0)
js("window.gmsPreview.setGridVisible(false)")
js("window.gmsPreview.setBackground('#000000')")
js("window.gmsPreview.setWireframe(false)")
try:
    cdp("Page.bringToFront")   # 后台标签页 rAF 被节流 → 帧不更新；提到前台让渲染实时
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

_, prev = frame_hash()   # 先取当前帧作基线，避免第一个视角拿到陈旧帧
report = []
# 先 resetView 让相机自动取景，取到自动视距作为其余视角的 radius（与 capture-views.sh 行为一致）
js("window.gmsPreview.resetView()")
time.sleep(0.8)
auto_radius = json.loads(js("JSON.stringify(window.gmsPreview.getCamera())"))['radius']
print("auto radius:", auto_radius)

for name, cam in PRESETS:
    target = dict(cam)
    if target.get('radius') is None:
        target['radius'] = auto_radius
    fields = ",".join("%s: %s" % (k, v) for k, v in target.items() if v is not None)
    # 相机可能被页面拖拽事件扰动 → 设置后回读校验，不一致就重设（最多 6 次）
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
