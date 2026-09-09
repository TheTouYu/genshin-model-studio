#!/usr/bin/env bash
# v8 出图：当前几何（端口朝向/高度标定 + M.WELL 键槽 + 字标修复 + 触控板缝 0.25mm + 叶形曲率 + 底盖刻蚀）
# 条件与 v7 完全一致（配对参考图 / 画布 / 背景），只换几何与贴图 → 结果可直接对比 v7
set -u
cd "$(dirname "$0")/../.." || exit 1
RUN=scripts/max/page-shots.mjs
OPEN=./macbook-current.json
CLOSED=./macbook-closed.json
mkdir -p .scratch/r8 delivery/macbook-v8w delivery/macbook-v8d delivery/macbook-v8g

run() { # dir w h view preset mesh
  echo "=== $(date +%H:%M:%S) $1 $4 ${2}x${3} $5 $6 ==="
  node "$RUN" --out "$1" --views "$4" --w "$2" --h "$3" \
    --preset "$5" --mesh "$6" --report ".scratch/r8/$4.json" || echo "FAIL $4"
}

run delivery/macbook-v8w 900 724 closedtop  white "$CLOSED"
run delivery/macbook-v8w 1000 627 screenfront white "$OPEN"
run delivery/macbook-v8w 880 680 kb         white "$OPEN"
run delivery/macbook-v8d 1180 395 ports      dark "$CLOSED"
run delivery/macbook-v8d 860 520 hero        dark "$OPEN"
run delivery/macbook-v8g 880 600 bottom      grey "$CLOSED"
echo "=== ALL DONE $(date +%H:%M:%S) ==="
