#!/usr/bin/env bash
# 多视角截图脚本：用 gmsPreview.setCamera 从预设视角观察当前 3D 模型并截图。
# 供视觉核验评估器 / 人工检查使用——评估器不再需要模拟鼠标拖拽旋转（CDP 鼠标事件易超时）。
#
# 截图方式：canvas.toDataURL() 直接导出 WebGL 像素（本页 Page.captureScreenshot 对 WebGL
# 画布会截出全白，必须用 toDataURL 导出）。
#
# 用法:
#   scripts/capture-views.sh [url] [输出目录]
#   默认 url=http://localhost:8787/ ，输出目录=/tmp/cup-views
#
# 输出: <输出目录>/view-<名称>.png（iso 为默认视角，不调用 setCamera）
# 预设视角（球坐标，弧度）:
#   iso     yaw=0.65 pitch=0.85（自动取景）
#   top     俯视杯口
#   front   正对杯壁
#   side    侧视（杯把侧）
#   handle  杯把特写（拉近）
URL="${1:-http://localhost:8787/}"
OUT="${2:-/tmp/cup-views}"
mkdir -p "$OUT"
export URL OUT

browser-harness <<'PY'
import time, os, math, base64

URL = os.environ['URL']
OUT = os.environ['OUT']

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

# 先画水杯（lathe 模式：母线车削空心杯身 + solid 杯底 + rod 把手），再验证视角。
# 注意：height 对 lathe 母线是抬升语义（会悬浮），母线高度由画布像素决定；
# 把手必须标 render:'rod'，否则会被车削成小圆筒。
js("""(() => {
  window.gms.mode('lathe');
  window.gms.clear();
  // 杯身母线：轴 x=302（与杯底同心），半径 30px，高 51px ≈ 0.16m（1m/320px 标定）
  const pts = [];
  for (let i = 0; i <= 20; i++) pts.push([302 + (30*i)/20, 300]);
  for (let i = 1; i <= 20; i++) pts.push([332, 300 - (51*i)/20]);
  window.gms.polyline(pts);
  // 杯底：实心薄盘，圆心 = 母线轴
  window.gms.circle(302, 250, 27, {render:'solid', height:0.005});
  // 把手：rod 杆，控制点 y∈[250,285]（杯身顶部 y=249 以下才贴壁；extrude 时代的 y≈230 会悬空）
  window.gms.curve([[332,252],[354,259],[358,266],[332,290]], false, {render:'rod'});
  return true;
})()""")
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
    # readPixels 直接读 WebGL 帧缓冲 → 2D canvas 中转 → toDataURL。
    # 不用 Page.captureScreenshot（WebGL 画布截出全白）也不用 canvas.toDataURL（后台标签页
    # 与 WebGL 缓冲不同步，返回旧帧）——readPixels 实测与渲染内容一致。
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

# 预设视角：名称 → {yaw, pitch, radius}（None 表示不动该字段）
# 注意：pitch 是 Three.js Spherical 极角（phi，从 +Y 天顶算，0=正上方，π/2=水平）
VIEWS = [
    ("iso",     {"yaw": 0.65, "pitch": 0.85, "radius": None}),  # 默认方位，自动取景半径
    ("top",     {"yaw": 0.65, "pitch": 0.3,  "radius": 1.6}),   # 俯视杯口（phi 小 = 接近天顶）
    ("front",   {"yaw": 0.0,  "pitch": 1.57, "radius": 1.6}),   # 正对杯壁（phi=π/2 水平）
    ("side",    {"yaw": math.pi / 2 - 0.45, "pitch": 1.57, "radius": 1.6}),  # 杯把侧（略偏角，正侧时把手被杯壁遮挡）
    ("handle",  {"yaw": math.pi / 2 - 0.45, "pitch": 1.3,  "radius": 0.8}),   # 杯把特写
]

for name, cam in VIEWS:
    if name == "iso":
        js("window.gmsPreview.resetView()")
    else:
        js(f"window.gmsPreview.setCamera({cam})")
    time.sleep(0.6)  # 等一帧渲染
    snapshot(name)
PY
