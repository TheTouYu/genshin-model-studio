/**
 * edge-close.mjs —— 只关闭 **CDP 那个 Edge 实例**（`Browser.close`，走 9222 的浏览器级 WS）。
 * 为什么不用 `taskkill /IM msedge.exe`：那会连用户自己开的 Edge 窗口一起杀掉（`ensure-edge.sh --force` 早期版本）。
 * 用途：CDP 实例的 GPU 进程卡死（页面报 "boot failed: Error creating WebGL context"，端口却仍活）时重启它。
 * 用法：node scripts/max/edge-close.mjs [port]
 */
const port = process.argv[2] || '9222';
const r = await fetch(`http://127.0.0.1:${port}/json/version`);
const v = await r.json();
const ws = new WebSocket(v.webSocketDebuggerUrl);
ws.addEventListener('open', () => ws.send(JSON.stringify({ id: 1, method: 'Browser.close' })));
ws.addEventListener('message', () => { try { ws.close(); } catch {} process.exit(0); });
setTimeout(() => process.exit(0), 4000);
