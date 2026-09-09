#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../.."
OUT=${1:-delivery/macbook-max}
mkdir -p "$OUT"
R() { node scripts/max/render.mjs "$@"; }
R --view top --w 900 --h 620 --spp 450 --open 0 --env apple --black-bg --camera --denoise-iters 3 --out "$OUT/p1-top.png"
R --view front --w 700 --h 620 --spp 400 --open 105 --env product --black-bg --bg-color 255,255,255 --dist 0.62 --camera --denoise-iters 3 --out "$OUT/p2-front.png"
R --view ports --w 820 --h 300 --spp 400 --open 0 --env product --black-bg --bg-color 255,255,255 --azim 90 --elev 1.2 --dist 0.52 --fov 10 --camera --denoise-iters 3 --out "$OUT/p3-ports.png"
R --view hero --w 700 --h 620 --spp 400 --open 100 --env appleopen --black-bg --dist 0.72 --camera --denoise-iters 3 --out "$OUT/p4-hero.png"
R --view closed34 --w 700 --h 560 --spp 400 --open 0 --env apple --black-bg --bg-color 255,255,255 --color spaceblack --dist 0.72 --camera --denoise-iters 3 --out "$OUT/p5-closed34.png"
R --view bottom --w 700 --h 560 --spp 400 --open 0 --env product --black-bg --bg-color 255,255,255 --dist 1.15 --camera --denoise-iters 3 --out "$OUT/p6-bottom.png"
echo DONE
