#!/usr/bin/env bash
# v10 出图：r11 修复（上盖深 218 与底座齐平 / 前缘凹槽内凹 / 底面螺丝齐平 / 端口补片绕序）
# 条件与 v7/v8 完全一致（配对参考图 / 画布 / 背景），只换几何 → 结果可直接对比
set -u
cd "$(dirname "$0")/../.." || exit 1
RUN=scripts/max/page-shots.mjs
OPEN=./macbook-current.json
CLOSED=./macbook-closed.json
mkdir -p .scratch/r13 delivery/macbook-v13w delivery/macbook-v13d delivery/macbook-v13g

run() { # dir w h view preset mesh
  echo "=== $(date +%H:%M:%S) $1 $4 ${2}x${3} $5 $6 ==="
  node "$RUN" --out "$1" --views "$4" --w "$2" --h "$3" \
    --preset "$5" --mesh "$6" --report ".scratch/r13/$4.json" || echo "FAIL $4"
}

run delivery/macbook-v13w 900 724 closedtop  white "$CLOSED"
run delivery/macbook-v13w 1000 627 screenfront white "$OPEN"
run delivery/macbook-v13w 880 680 kb         white "$OPEN"
run delivery/macbook-v13d 1180 395 portstele  dark "$CLOSED"
run delivery/macbook-v13d 860 520 hero        dark "$OPEN"
run delivery/macbook-v13g 880 600 bottom      grey "$CLOSED"
echo "=== ALL DONE $(date +%H:%M:%S) ==="
