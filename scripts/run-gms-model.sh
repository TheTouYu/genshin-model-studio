#!/usr/bin/env bash
# run-gms-model.sh — 执行一段 gms 组件脚本（模型交付物），产出可核验产物。
#
# 管道（用户工作流的程序化版）：
#   注入组件脚本（window.gms.* 声明式 API）→ 页面生成 → gms.export() 作品 JSON
#   → POST /api/draw-model → items 落盘 → 多视角截图（网页渲染结果）
#
# 用法:
#   scripts/run-gms-model.sh <组件脚本.js> <输出目录> [URL]
#   输出: <输出目录>/work.json        作品 JSON（strokes+options，可回灌 gms.import）
#         <输出目录>/items.json      生成元件（draw-model 产物，核验输入）
#         <输出目录>/view-*.png      多视角截图（iso/front/top/left/right/closeup）
#         <输出目录>/summary.json    摘要（笔画数/元件数/状态）
DRAW_FILE="$1"
OUT="${2:-/tmp/gms-model}"
URL="${3:-http://localhost:8787/}"
DATA_FILE="${4:-}"
[ -z "$DRAW_FILE" ] && { echo "用法: run-gms-model.sh <组件脚本.js> <输出目录> [URL] [DATA_FILE.js]" >&2; exit 1; }
mkdir -p "$OUT"
export URL OUT DRAW_FILE DATA_FILE

browser-harness <<'PY'
import time, os, json, urllib.request

URL = os.environ['URL']
OUT = os.environ['OUT']
DRAW_FILE = os.environ['DRAW_FILE']

tabs = [t for t in list_tabs() if URL.split('//')[1].split('/')[0] in t.get('url', '')]
if not tabs:
    new_tab(URL)
    time.sleep(4)
else:
    sid = switch_tab(tabs[0])
    try:
        cdp("Emulation.setPageVisibilityStateOverride", session_id=sid, visibilityState="visible")
    except Exception:
        pass

for _ in range(20):
    s = js("typeof window.gms === 'object' && typeof window.gmsPreview === 'object'")
    if s:
        break
    time.sleep(0.5)
if not s:
    print("ERROR: 页面未就绪（gms/gmsPreview 未暴露）")
    raise SystemExit(1)

# 可选预注入数据（如 ganyu-dense.js：window.GANYU_DENSE 测量数据）
DATA_FILE = os.environ.get('DATA_FILE', '')
if DATA_FILE:
    with open(DATA_FILE) as f:
        js(f.read())
    time.sleep(0.5)

# 注入组件脚本（模型交付物）
with open(DRAW_FILE) as f:
    draw_js = f.read()
errors = js(f"""(() => {{
  try {{ {draw_js}
    return {{ ok: true, error: null }}
  }} catch (e) {{ return {{ ok: false, error: String(e && e.message || e) }} }}
}})()""")
time.sleep(2.0)  # 等拟合 + 生成 + 预览重建

if not errors.get('ok'):
    print(f"ERROR: 组件脚本执行失败: {errors.get('error')}")
    with open(f"{OUT}/summary.json", "w") as f:
        json.dump({"ok": False, "error": errors.get('error')}, f, ensure_ascii=False, indent=1)
    raise SystemExit(1)

work_raw = js("JSON.stringify(window.gms.export())")
work = json.loads(work_raw)
with open(f"{OUT}/work.json", "w") as f:
    json.dump(work, f, ensure_ascii=False, indent=1)

# 生成元件（与页面 scheduleGen 同一端点，确定性）
try:
    req = urllib.request.Request(URL + 'api/draw-model', data=work_raw.encode(),
                                 headers={'Content-Type': 'application/json'})
    result = json.loads(urllib.request.urlopen(req, timeout=120).read())
    items = result['items'] if isinstance(result, dict) and 'items' in result else result
    with open(f"{OUT}/items.json", "w") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    summary = {"ok": True, "strokes": len(work.get('strokes', [])), "items": len(items),
               "closed": sum(1 for c in result.get('closed', []) if c)}
except Exception as e:
    summary = {"ok": False, "error": f"draw-model 失败: {e}"}
    print("ERROR:", summary)
with open(f"{OUT}/summary.json", "w") as f:
    json.dump(summary, f, ensure_ascii=False, indent=1)
print(f"summary: {summary}")

# 多视角截图（网页渲染结果，供核验）
js("""(() => {
  const c = document.getElementById('previewCanvas');
  c.style.position = 'fixed'; c.style.inset = '0';
  c.style.width = '100vw'; c.style.height = '100vh';
  c.style.zIndex = '9999'; c.style.border = 'none'; c.style.background = '#10151c';
  document.body.style.overflow = 'hidden';
  window.dispatchEvent(new Event('resize'));
})()""")
time.sleep(1.0)

import math, base64

def snapshot(name):
    b64 = js("""(() => {
      const c = document.getElementById('previewCanvas');
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
    with open(f"{OUT}/view-{name}.png", "wb") as f:
        f.write(base64.b64decode(b64))
    print(f"截图: {OUT}/view-{name}.png")

PRESETS = {
    "iso":     {"yaw": 0.65, "pitch": 0.85, "radius": None},
    "front":   {"yaw": 0.0, "pitch": 1.57, "radius": None},
    "top":     {"yaw": 0.65, "pitch": 0.12, "radius": None},
    "left":    {"yaw": math.pi / 2, "pitch": 1.57, "radius": None},
    "closeup": {"yaw": 0.65, "pitch": 0.85, "radius": 0.8},
}
for name, cam in PRESETS.items():
    if name == "iso":
        js("window.gmsPreview.resetView()")
    else:
        fields = ",".join(f"{k}: {v}" for k, v in cam.items() if v is not None)
        js(f"window.gmsPreview.setCamera({{{fields}}})")
    time.sleep(0.6)
    snapshot(name)
PY
