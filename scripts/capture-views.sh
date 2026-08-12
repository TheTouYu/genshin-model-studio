#!/usr/bin/env bash
# 多视角截图脚本（通用版）：用 gmsPreview.setCamera 从任意视角观察当前 3D 模型并截图。
# 视角与画法解耦：画法通过 --draw 注入（不传则直接截当前页面模型），视角可预设或自定义。
#
# 截图方式：readPixels 直接读 WebGL 帧缓冲 → 2D canvas 中转 → toDataURL。
# 不用 Page.captureScreenshot（WebGL 画布截出全白）也不用 canvas.toDataURL（后台标签页
# 与 WebGL 缓冲不同步，返回旧帧）。
#
# 用法:
#   scripts/capture-views.sh [url] [out] [--draw <js文件>] [--views 列表] [--view yaw,pitch,radius ...]
#   url 默认 http://localhost:8787/ ；out 默认 /tmp/model-views
#   --draw <js文件>  画法脚本（一段在页面执行的 JS，通常调 window.gms.*）；省略 = 截当前页面已有模型
#   --views a,b,...  视角子集（默认全部 8 个预设）
#   --view yaw,pitch,radius   自定义视角（弧度），可多次传入，与预设合并
#
# 输出: <out>/view-<名称>.png
# 预设视角（球坐标：yaw 方位角 / pitch 极角 φ，0=天顶，π/2=水平，π=正下方）:
#   iso / top / bottom / front / back / left / right / closeup
URL="${1:-http://localhost:8787/}"
OUT="${2:-/tmp/model-views}"
shift 2 2>/dev/null || true

DRAW_FILE=""
VIEWS_ARG=""
CUSTOM_VIEWS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --draw) DRAW_FILE="$2"; shift 2 ;;
    --views) VIEWS_ARG="$2"; shift 2 ;;
    --view) CUSTOM_VIEWS+=("$2"); shift 2 ;;
    *) echo "未知参数: $1（支持 --draw/--views/--view）" >&2; exit 1 ;;
  esac
done

mkdir -p "$OUT"
export URL OUT DRAW_FILE VIEWS_ARG
# 自定义视角经环境变量传 Python（避免 shell 转义问题）
CUSTOM_VIEWS_JSON=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1:]))" "${CUSTOM_VIEWS[@]}")
export CUSTOM_VIEWS_JSON

browser-harness <<'PY'
import time, os, math, base64, json

URL = os.environ['URL']
OUT = os.environ['OUT']
DRAW_FILE = os.environ.get('DRAW_FILE', '')
VIEWS_ARG = os.environ.get('VIEWS_ARG', '')
CUSTOM_VIEWS = json.loads(os.environ.get('CUSTOM_VIEWS_JSON', '[]'))

tabs = [t for t in list_tabs() if URL.split('//')[1].split('/')[0] in t.get('url', '')]
if not tabs:
    tid = new_tab(URL)
    time.sleep(4)
else:
    sid = switch_tab(tabs[0])
    # 强制页面可见：后台标签页 rAF/布局冻结会导致 setCamera 不生效、canvas 尺寸不更新
    try:
        cdp("Emulation.setPageVisibilityStateOverride", session_id=sid, visibilityState="visible")
    except Exception as e:
        print("提示: 无法覆盖页面可见性（", e, "）——依赖同步渲染截图")

# 确认页面就绪 + gmsPreview 暴露
for _ in range(20):
    s = js("typeof window.gmsPreview === 'object' && !!document.getElementById('previewCanvas')")
    if s: break
    time.sleep(0.5)
if not s:
    print("ERROR: 页面未就绪或 gmsPreview 未暴露（页面需加载最新 preview.js 并刷新）")
    raise SystemExit(1)

# 可选：注入画法（--draw <js 文件>，内容为在页面执行的 JS）
if DRAW_FILE:
    with open(DRAW_FILE) as f:
        draw_js = f.read()
    js(f"(() => {{\n{draw_js}\nreturn true;}})()")
    time.sleep(1.5)  # 等拟合 + 预览重建

# 将预览 canvas 拉满窗口（覆盖 #previewCanvas 固定高度 CSS），便于看清模型细节
js("""(() => {
  const c = document.getElementById('previewCanvas');
  c.style.position = 'fixed'; c.style.inset = '0';
  c.style.width = '100vw'; c.style.height = '100vh';
  c.style.zIndex = '9999'; c.style.border = 'none'; c.style.borderRadius = '0';
  c.style.background = '#10151c';
  document.body.style.overflow = 'hidden';
  window.dispatchEvent(new Event('resize'));
})()""")
time.sleep(1.0)  # 等 resize + 自动取景渲染

def snapshot(name):
    # readPixels 直接读 WebGL 帧缓冲 → 2D canvas 中转 → toDataURL
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
    png = base64.b64decode(b64)
    with open(f"{OUT}/view-{name}.png", "wb") as f:
        f.write(png)
    print(f"已截图: {OUT}/view-{name}.png ({len(png)} 字节)")

# 预设视角（pitch 是 Three.js Spherical 极角：0=正上方，π/2=水平，π=正下方）
PRESETS = {
    "iso":      {"yaw": 0.65, "pitch": 0.85, "radius": None},
    "top":      {"yaw": 0.65, "pitch": 0.12, "radius": None},  # 俯视（接近天顶）
    "bottom":   {"yaw": 0.65, "pitch": math.pi - 0.12, "radius": None},  # 仰视（正下方）
    "front":    {"yaw": 0.0,  "pitch": 1.57, "radius": None},  # 正对 +X
    "back":     {"yaw": math.pi, "pitch": 1.57, "radius": None},  # 正对 -X
    "left":     {"yaw": math.pi / 2, "pitch": 1.57, "radius": None},  # 正对 -Z
    "right":    {"yaw": -math.pi / 2, "pitch": 1.57, "radius": None},  # 正对 +Z
    "closeup":  {"yaw": 0.65, "pitch": 0.85, "radius": 0.8},  # 等距特写
}

names = VIEWS_ARG.split(',') if VIEWS_ARG else list(PRESETS.keys())
for v in CUSTOM_VIEWS:
    parts = v.split(',')
    if len(parts) != 3:
        raise SystemExit(f"自定义视角格式错误: {v}（应为 yaw,pitch,radius，弧度）")
    cam = {"yaw": float(parts[0]), "pitch": float(parts[1]), "radius": float(parts[2])}
    # 命名归一：yaw 取两位小数避免文件名冲突
    name = f"custom-{float(parts[0]):.2f}-{float(parts[1]):.2f}"
    PRESETS[name] = cam
    names.append(name)

for name in names:
    cam = PRESETS[name]
    if name == "iso":
        js("window.gmsPreview.resetView()")
    else:
        # None 字段表示不动该相机参数（尤其 radius，避免覆盖自动取景）
        fields = ",".join(f"{k}: {v}" for k, v in cam.items() if v is not None)
        js(f"window.gmsPreview.setCamera({{{fields}}})")
    time.sleep(0.6)  # 等一帧渲染
    snapshot(name)
PY
