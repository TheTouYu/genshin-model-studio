/**
 * page-set.mjs —— 对**指定页签**做「重载 + 设定状态」，用于把最新几何送到用户复核的那个页签。
 *
 * 用法：
 *   node scripts/max/page-set.mjs --match 'draw/photo.html$' --js "__photo.setLid(0); __photo.preset('dark')"
 *   node scripts/max/page-set.mjs --match 'draw/photo.html$' --close      # 只关闭匹配到的页签
 *   node scripts/max/page-set.mjs --list
 *
 * 为什么不用 page-probe：page-probe 按 URL 前缀选目标，会命中我自己开的 `?v=` QA 页签；
 * 这里按**正则**精确匹配用户那个页签，并支持只对它操作（不关、只重载）。
 */
const args = process.argv.slice(2);
const arg = (k, d = '') => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : (args.includes('--' + k) ? 'true' : d); };
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const pages = list.filter((t) => t.type === 'page');
if (args.includes('--list') || !args.length) {
  for (const t of pages) console.log(t.id.slice(0, 8), '|', t.url.slice(0, 90));
  process.exit(0);
}
const re = new RegExp(arg('match', 'draw/photo\\.html$'));
const targets = pages.filter((t) => re.test(t.url));
if (!targets.length) { console.error('没有匹配的页签:', re); process.exit(1); }
if (arg('id')) {
  // --id <targetId>：按页签 id 精确关闭（同一 URL 开了多个页签时 --match 无法区分）
  const id = arg('id');
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const t = list.find((x) => x.id === id);
  if (!t) { console.log('没有该页签:', id); process.exit(1); }
  await fetch('http://127.0.0.1:9222/json/close/' + id);
  console.log('closed', t.url);
  process.exit(0);
}
if (args.includes('--close')) {
  for (const t of targets) { await fetch('http://127.0.0.1:9222/json/close/' + t.id); console.log('closed', t.url.slice(0, 80)); }
  process.exit(0);
}
const url = arg('url', '');
for (const t of targets) {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable');
  await send('Page.bringToFront');
  const go = url || t.url;
  await send('Page.navigate', { url: go });
  // 等页面就绪
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 700));
    const r = await send('Runtime.evaluate', { expression: '!!(window.__photo && window.__photo.ready && (!window.__screenMat || !!window.__screenMat.map))', returnByValue: true });
    if (r.result?.result?.value) { ready = true; break; }
  }
  console.log(ready ? 'ready' : 'NOT ready', t.url.slice(0, 70));
  const js = arg('js', '');
  if (js && ready) {
    const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
    console.log('  js ->', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.text ?? 'ok'));
  }
  ws.close();
}
