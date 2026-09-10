#!/usr/bin/env bash
# ensure-edge.sh —— 保证 CDP Edge（127.0.0.1:9222）在线。
# 背景：WSL2 里浏览器是 Windows 侧 msedge.exe，长时间批量开/关标签会整进程挂掉（本会话已两次），
# 一挂 page-shots 就全线 FAIL 且看不出原因。渲染前先跑这个（幂等）。
set -u
PORT=9222
# --force：CDP 端口活着但 **WebGL 上下文创建失败**（GPU 进程卡死，表现为页面
# "boot failed: Error creating WebGL context"）时用。杀 Windows 侧 msedge 再拉起。
if [ "${1:-}" = "--force" ]; then
  # 只关 CDP 实例（Browser.close）——**不杀用户自己的 Edge 窗口**。
  # 只有 --force-all 才退回到 taskkill（会连用户窗口一起杀）。
  echo "force restart: closing CDP instance (Browser.close)"
  node "$(dirname "$0")/edge-close.mjs" "${PORT}" >/dev/null 2>&1 || true
  sleep 4
fi
if [ "${1:-}" = "--force-all" ]; then
  echo "force-all: killing every msedge"
  /mnt/c/Windows/System32/taskkill.exe /F /IM msedge.exe >/dev/null 2>&1 || true
  sleep 4
fi
if curl -s -m 4 "http://127.0.0.1:${PORT}/json/version" | grep -q webSocketDebuggerUrl; then
  echo "edge ok (${PORT})"; exit 0
fi
echo "edge down -> relaunching"
cd /mnt/c/Users/touyu 2>/dev/null || exit 1
setsid nohup "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --remote-debugging-port=${PORT} --remote-debugging-address=0.0.0.0 \
  --user-data-dir="C:\edge-cdp-fan" --no-first-run --no-default-browser-check about:blank \
  >/dev/null 2>&1 &
for i in $(seq 1 20); do
  sleep 2
  if curl -s -m 4 "http://127.0.0.1:${PORT}/json/version" | grep -q webSocketDebuggerUrl; then
    echo "edge relaunched ok (${PORT})"; exit 0
  fi
done
echo "edge relaunch FAILED"; exit 1
