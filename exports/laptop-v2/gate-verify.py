# gate-verify.py —— 笔记本 v2 门禁：从页面历史载入完整作品（含 components/links）→ gms.verify()
#
# 为什么用历史端点而不是逐 part 注入：573 件模型下逐 part no-clear 注入会在第 4 个键盘块触发
# CDP Runtime.evaluate 超时（实测 2026-09-08）；applyWork 会按 components 逐条重注册命名件并恢复 links
# （web/index.html:2068-2090），语义与逐 part 注入等价。
# 用法：HIST_ID=$(cat exports/laptop-v2/history-id.txt) browser-harness < exports/laptop-v2/gate-verify.py
import json, time, os

ROOT = '/home/h/genshin-model-studio'
OUT = os.path.join(ROOT, 'exports/laptop-v2')
HIST_ID = os.environ.get('HIST_ID') or open(os.path.join(OUT, 'history-id.txt')).read().strip()
print('history id:', HIST_ID)

tabs = [t for t in list_tabs() if 'localhost:8787' in t.get('url', '')]
keep = None
for t in tabs:
    if t.get('url', '').rstrip('/') == 'http://localhost:8787':
        keep = keep or t
    else:
        close_tab(t)
if keep is None:
    new_tab('http://localhost:8787/'); time.sleep(5)
    keep = [t for t in list_tabs() if t.get('url', '').rstrip('/') == 'http://localhost:8787'][0]
switch_tab(keep)
js("try{localStorage.removeItem('gms.draw.work.v1')}catch(e){}")
js("location.reload()"); time.sleep(6)
for _ in range(20):
    if js("typeof window.gms === 'object'"): break
    time.sleep(0.5)

# 从历史端点取完整作品到页面全局（不经 js 表达式传大字符串）
js("window.__histWork = null")
js("fetch('/api/history/get?id=%s').then(r=>r.json()).then(w=>{window.__histWork=w; return 'ok'})" % HIST_ID)
for _ in range(40):
    if js("!!window.__histWork"): break
    time.sleep(0.5)
meta = json.loads(js("JSON.stringify({strokes: (window.__histWork.strokes||[]).length, comps: Object.keys(window.__histWork.components||{}).length, links: (window.__histWork.links||[]).length})"))
print('loaded work:', meta)

js("window.gms.import(window.__histWork)")
for _ in range(120):
    st = js("(document.getElementById('drawStatus')||{}).textContent") or ''
    if '元件' in st and '生成中' not in st and '失败' not in st: break
    time.sleep(1.0)
print('status:', st)
print('summary:', js("JSON.stringify(window.gms.summary())"))

result = js("""(() => {
  const names = (window.gms.parts ? window.gms.parts() : []).map(p => p.name)
  const v = window.gms.verify()
  const work = window.gms.export()
  const stored = (() => { try { return JSON.parse(localStorage.getItem('gms.draw.work.v1') || 'null') } catch (e) { return null } })()
  return JSON.stringify({ names, verify: v, strokes: work.strokes.length,
                          components: stored && stored.components ? Object.keys(stored.components).length : 0,
                          storedLinks: stored && stored.links ? stored.links.length : 0 })
})()""")
d = json.loads(result)
verify = d['verify']
report = {
    'stage': 'S4-gate',
    'method': 'POST /api/history/save（完整 work 含 components/links）→ 页面 fetch /api/history/get → gms.import → gms.verify()',
    'whyNotPartInjection': '573 件模型下逐 part no-clear 注入在第 4 个键盘块触发 CDP Runtime.evaluate 超时（实测）；applyWork 按 components 重注册命名件（web/index.html:2068-2090）语义等价',
    'historyId': HIST_ID,
    'status': st,
    'strokes': d['strokes'],
    'componentsRestored': d['components'],
    'linksRestored': d['storedLinks'],
    'namedParts': len(d['names']),
    'names': d['names'],
    'verify': verify,
}
open(os.path.join(OUT, 's4-gate.json'), 'w').write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print('named:', len(d['names']), '| components:', d['components'], '| links:', d['storedLinks'])
print('verify.ok =', verify['ok'], '| floating:', verify['floating'], '| collides:', verify['collides'])
print('links:', json.dumps(verify['links'], ensure_ascii=False))
assert verify['ok'] is True, 'GATE FAIL: ' + json.dumps(verify, ensure_ascii=False)
print('GATE OK')
