#!/usr/bin/env bash
# Export the model from an existing browser tab and validate it through /api/draw-model.
# Usage: scripts/inspect-draw-model.sh [url]
set -euo pipefail

URL="${1:-http://localhost:8787/}"
export URL

browser-harness <<'PY'
import json
import os
from urllib.parse import urljoin
from urllib.request import Request, urlopen

url = os.environ["URL"]
tabs = [tab for tab in list_tabs() if url.split("//", 1)[-1].split("/", 1)[0] in tab.get("url", "")]
if not tabs:
    raise RuntimeError(f"No browser tab matches {url}")
switch_tab(tabs[0])

exported = json.loads(js("JSON.stringify(window.gms.export())"))
payload = {key: exported[key] for key in ("version", "strokes", "options")}
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

print(json.dumps({
    "source": "POST /api/draw-model from window.gms.export()",
    "httpStatus": status,
    "strokeCount": len(payload["strokes"]),
    "itemCount": len(items),
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
