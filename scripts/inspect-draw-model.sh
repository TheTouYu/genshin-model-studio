#!/usr/bin/env bash
# Export the model from an existing browser tab and validate it through /api/draw-model.
# Usage: scripts/inspect-draw-model.sh [url] [--stroke N]
#   --stroke N  单笔画核验：只测第 N 笔（自动构造合法 payload：含 options/显式闭合/0x 颜色）
set -euo pipefail

URL="${1:-http://localhost:8787/}"
STROKE_ONLY=""
if [[ "${2:-}" == "--stroke" ]]; then STROKE_ONLY="${3:-}"; fi
export URL STROKE_ONLY

browser-harness <<'PY'
import json
import os
from urllib.parse import urljoin
from urllib.request import Request, urlopen

url = os.environ["URL"]
host = url.split("//", 1)[-1].split("/", 1)[0]
# 修复（2026-08-14 复现）：排除 preview-demo 等无 gms 的页面——按 host 匹配且排除独立预览页
tabs = [tab for tab in list_tabs()
        if host in tab.get("url", "")
        and "preview-demo" not in tab.get("url", "")
        and tab.get("url", "").startswith("http")]
if not tabs:
    raise RuntimeError(f"No browser tab matches {url}")
switch_tab(tabs[0])

exported = json.loads(js("JSON.stringify(window.gms.export())"))
strokes = exported["strokes"]
if os.environ.get("STROKE_ONLY"):
    n = int(os.environ["STROKE_ONLY"])
    if n < 0:
        n += len(strokes)
    if not (0 <= n < len(strokes)):
        raise RuntimeError("stroke out of range: " + os.environ["STROKE_ONLY"])
    strokes = [strokes[n]]
    _ORIGINAL_STROKE = n
payload = {key: exported[key] for key in ("version", "options")}
payload["strokes"] = strokes
request = Request(
    urljoin(url, "/api/draw-model"),
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urlopen(request, timeout=30) as response:
    status = response.status
    result = json.load(response)

items = result.get("items")
if not isinstance(items, list):
    raise RuntimeError(f"API response has no items array: {result!r}")

# 十二期（基线复盘 1a）：按服务端 strokeItemCounts 做 stroke→items 映射——
# items 顺序与笔画一一对应（fitted 会跳过拟合失败笔画，必须用显式计数，不能靠顺序猜）。
# 输出每笔的 items 区间摘要，模型不再需要几何反推"哪些 items 属于哪笔"。
counts = result.get("strokeItemCounts")
per_stroke = []
if isinstance(counts, list) and len(counts) == len(payload["strokes"]):
    cursor = 0
    for si, n in enumerate(counts):
        group = items[cursor : cursor + n]
        cursor += n
        per_stroke.append({
            "stroke": si,
            "points": len(payload["strokes"][si].get("points", [])),
            "itemCount": n,
            "sample": [
                {
                    "index": gi + cursor - n,
                    "resourceId": item.get("resourceId"),
                    "position": item.get("position"),
                    "rotation": item.get("rotation"),
                    "scale": item.get("scale"),
                }
                for gi, item in enumerate(group[:3])  # 每笔最多 3 个样本，防输出截断
            ],
        })

print(json.dumps({
    "source": "POST /api/draw-model from window.gms.export()",
    "httpStatus": status,
    "strokeCount": len(payload["strokes"]),
    "itemCount": len(items),
    "perStroke": per_stroke,
    "originalStroke": os.environ.get("STROKE_ONLY") and int(os.environ["STROKE_ONLY"]),
    "items": [
        {
            "index": index,
            "resourceId": item.get("resourceId"),
            "position": item.get("position"),
            "rotation": item.get("rotation"),
            "scale": item.get("scale"),
        }
        for index, item in enumerate(items)
    ],
}, ensure_ascii=False, indent=2))
PY