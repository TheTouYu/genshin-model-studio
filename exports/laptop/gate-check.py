# gate-check.py —— 门禁复核（no-clear 全量装配 → 声明 link → gms.verify）
#
# 为什么这样跑：run-gms-parts.sh 每个 part 先 clear（保证 partN.json 只含本批），因此
# 名字/连接表在批间不共存，无法在同一页面状态里跑 gms.verify。本脚本设 window.__gmsNoClear=true
# 后顺序执行全部 part 文件（各 part 文件内 `if (!window.__gmsNoClear) G.clear()`），
# 于是 150 件 + 30 个命名件共存，再逐对 gms.touches 判接触并 gms.link 声明，最后 gms.verify()。
#
# 产物：exports/laptop/s4-gate.json（names/links/verify 全量读数 + 每对 gap）
#       exports/laptop/work-named.json（含 components/links 的完整作品，供复现）
import json, time, os, re

ROOT = '/home/h/genshin-model-studio'
OUT = os.path.join(ROOT, 'exports/laptop')
PART_FILES = [
    'scripts/parts/laptop-base.js', 'scripts/parts/laptop-lid.js', 'scripts/parts/laptop-hinge.js',
    'scripts/parts/laptop-keyboard.js', 'scripts/parts/laptop-trackpad.js', 'scripts/parts/laptop-screen.js',
    'scripts/parts/laptop-ports.js', 'scripts/parts/laptop-grille.js', 'scripts/parts/laptop-feet.js',
]

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

js("window.__gmsNoClear = true")
for f in PART_FILES:
    src = open(os.path.join(ROOT, f)).read()
    r = js("(() => { try { %s\n  return {ok:true} } catch (e) { return {ok:false, error:String(e && e.message || e)} } })()" % src)
    print('%-38s %s' % (f, r))
    if not r.get('ok'):
        raise SystemExit('PART_EXEC_ERROR ' + str(r))
    time.sleep(0.4)
# 等生成结束
for _ in range(90):
    st = js("(document.getElementById('drawStatus')||{}).textContent") or ''
    if '元件' in st and '生成中' not in st and '失败' not in st: break
    time.sleep(1.0)
print('status:', st)

result = js("""(() => {
  const names = (window.gms.parts ? window.gms.parts() : []).map(p => p.name)
  const pairs = []
  let links = 0, linkErr = []
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      let t
      try { t = window.gms.touches(names[i], names[j]) } catch (e) { linkErr.push([names[i], names[j], 'touches:' + e.message]); continue }
      pairs.push({ a: names[i], b: names[j], contact: t.contact, gap: t.gap })
      if (t.contact) {
        try { window.gms.link(names[i], names[j]); links++ }
        catch (e) { linkErr.push([names[i], names[j], 'link:' + e.message]) }
      }
    }
  }
  const v = window.gms.verify()
  const work = window.gms.export()
  let stored = null
  try { stored = JSON.parse(localStorage.getItem('gms.draw.work.v1') || 'null') } catch (e) {}
  return JSON.stringify({ names, links, linkErr, verify: v, strokes: work.strokes.length,
                          components: stored && stored.components ? stored.components : null,
                          storedLinks: stored && stored.links ? stored.links : null })
})()""")
d = json.loads(result)
verify = d['verify']
report = {
    'stage': 'S4-gate',
    'method': 'window.__gmsNoClear=true → 顺序执行 9 个 part 文件（150 件 + 30 命名件共存）→ 逐对 gms.touches → 接触对 gms.link → gms.verify()',
    'whyNoClear': 'run-gms-parts.sh 每批 clear（partN.json 只含本批），批间名字/连接表不共存；门禁复核需单页全量状态',
    'status': st,
    'strokes': d['strokes'],
    'namedParts': len(d['names']),
    'names': d['names'],
    'linkCount': d['links'],
    'linkErrors': d['linkErr'],
    'verify': verify,
    'contactPairs': [p for p in json.loads(result)['verify']['links']],
    'allPairGaps': None,
}
# 逐对 gap 全量（供审计）
pairs = js("""(() => {
  const names = window.gms.parts().map(p => p.name)
  const out = []
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const t = window.gms.touches(names[i], names[j])
    out.push([names[i], names[j], t.gap, t.contact])
  }
  return JSON.stringify(out)
})()""")
report['allPairGaps'] = json.loads(pairs)
open(os.path.join(OUT, 's4-gate.json'), 'w').write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

# 完整作品（含 components/links）落盘
work = js("JSON.stringify(window.gms.export())")
w = json.loads(work)
stored = js("localStorage.getItem('gms.draw.work.v1')")
try:
    s = json.loads(stored)
    if s.get('components'): w['components'] = s['components']
    if s.get('links'): w['links'] = s['links']
except Exception as e:
    print('localStorage parse:', e)
open(os.path.join(OUT, 'work-named.json'), 'w').write(json.dumps(w, ensure_ascii=False) + '\n')

print('named:', len(d['names']), '| links:', d['links'], '| linkErr:', len(d['linkErr']))
print('verify.ok =', verify['ok'], '| floating:', verify['floating'], '| collides:', verify['collides'])
print('links:', json.dumps(verify['links'], ensure_ascii=False))
assert verify['ok'] is True, 'GATE FAIL: ' + json.dumps(verify, ensure_ascii=False)
print('GATE OK')
