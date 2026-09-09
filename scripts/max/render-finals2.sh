#!/usr/bin/env bash
# 最终交付渲染 v2：1600spp 等效 + 2× 超采样 + 4 轮降噪 + clamp 12（灭萤火虫）
# 变更（vs v1）：键帽字符图集比例修正（3× 字形 bug）、纹理 LOD 不再强制 ≥1、
#   机身/上盖圆角与边缘倒角细分 2–8×、屏幕增益 1.2、jpegSim 首行/列 NaN 修复。
set -e
cd "$(dirname "$0")/../.."
OUT=${1:-delivery/macbook-max}
mkdir -p "$OUT"
R() { node scripts/max/render.mjs "$@" --ss 2 --spp 900 --denoise-iters 4 --clamp 12 --screen-gain 1.8; }
R --view top      --w 900 --h 620 --open 0   --env apple      --black-bg --elev 89 --dist 0.52 --fov 26 --camera --out "$OUT/p1-top.png"
R --view front    --w 700 --h 620 --spp 900 --open 105 --env product --black-bg --bg-color 255,255,255 --dist 0.50 --elev 6 --camera --out "$OUT/p2-front.png"
R --view ports    --w 820 --h 300 --spp 900 --open 0   --env product --black-bg --bg-color 255,255,255 --azim 90 --elev 1.2 --dist 0.25 --fov 12 --camera --out "$OUT/p3-ports.png"
R --view hero     --w 700 --h 620 --open 100 --env appleopen  --black-bg --dist 0.60 --azim 12 --elev 18 --camera --out "$OUT/p4-hero.png"
R --view closed34 --w 700 --h 560 --open 0   --env apple      --black-bg --bg-color 255,255,255 --color spaceblack --dist 0.60 --camera --out "$OUT/p5-closed34.png"
R --view bottom   --w 700 --h 560 --open 0   --env product    --black-bg --bg-color 255,255,255 --dist 0.60 --camera --out "$OUT/p6-bottom.png"
echo DONE
