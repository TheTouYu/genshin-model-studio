#!/usr/bin/env bash
# capture-lowpoly-views.sh — 低面数白模 框线/平滑 五视角截图
# 用法: scripts/capture-lowpoly-views.sh [url] [out] [--modes wire,smooth]
set -euo pipefail

URL="${1:-http://localhost:8787/draw/lowpoly-viewer.html}"
OUT="${2:-delivery/lowpoly-whitemodel/views}"
shift 2 2>/dev/null || true
MODES="wire,smooth"
while [ $# -gt 0 ]; do
  case "$1" in
    --modes) MODES="$2"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$OUT"
export URL OUT MODES
browser-harness <<'PY'
import time, os, math, base64

URL = os.environ['URL']
OUT = os.environ['OUT']
MODES = os.environ['MODES'].split(',')

tabs = [t for t in list_tabs() if t.get('url', '').startswith(URL)]
if not tabs:
    new_tab(URL)
    time.sleep(4)
else:
    sid = switch_tab(tabs[0])
    try:
        cdp("Emulation.setPageVisibilityStateOverride", session_id=sid, visibilityState="visible")
    except Exception as e:
        print("提示: 无法覆盖页面可见性（", e, "）")

# 等待预览就绪
ready = False
for _ in range(40):
    ready = bool(js("window.__PREVIEW_READY__ === true"))
    if ready: break
    time.sleep(0.5)
if not ready:
    print("ERROR: lowpoly 预览未就绪（检查 web/draw/lowpoly-model.json 是否存在）")
    raise SystemExit(1)

# 拉满画布
js("""(() => {
  const c = document.getElementById('canvas');
  c.style.position = 'fixed'; c.style.inset = '0';
  c.style.width = '100vw'; c.style.height = '100vh';
  c.style.zIndex = '9999'; c.style.border = 'none';
  window.dispatchEvent(new Event('resize'));
})()""")
time.sleep(1.0)

def snapshot(name):
    b64 = js("""(() => {
      const c = document.getElementById('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const w = c.width, h = c.height;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const c2 = document.createElement('canvas');
      c2.width = w; c2.height = h;
      const ctx2 = c2.getContext('2d');
      const img = ctx2.createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(buf.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
      ctx2.putImageData(img, 0, 0);
      return c2.toDataURL('image/png').split(',')[1];
    })()""")
    png = base64.b64decode(b64)
    with open(OUT + '/' + name + '.png', 'wb') as f:
        f.write(png)
    print('已截图:', OUT + '/' + name + '.png', len(png), '字节')

VIEWS = {
    'front': {'yaw': 0.0, 'pitch': 1.57},
    'side':  {'yaw': 1.5708, 'pitch': 1.57},
    'top':   {'yaw': 0.65, 'pitch': 0.12},
    'back':  {'yaw': 3.14159, 'pitch': 1.57},
    'iso':   {'yaw': 0.65, 'pitch': 0.85},
}

for mode in MODES:
    wire = mode == 'wire'
    js("window.gmsPreview.setWireframe(%s)" % ('true' if wire else 'false'))
    js("window.gmsPreview.resetView()")
    time.sleep(0.4)
    for name, cam in VIEWS.items():
        js("window.gmsPreview.setCamera(%s)" % __import__('json').dumps(cam))
        time.sleep(0.8)
        snapshot('%s-%s' % (mode, name))
PY
