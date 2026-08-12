#!/usr/bin/env bash
# 电风扇多视角截图（薄包装）：画法与视角已解耦，见 capture-views.sh。
# 用法: scripts/capture-fan-views.sh [url] [输出目录]
exec "$(dirname "$0")/capture-views.sh" "${1:-http://localhost:8787/}" "${2:-/tmp/fan-views}" --draw "$(dirname "$0")/draw-fan.js"
