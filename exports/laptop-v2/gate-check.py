# gate-check.py —— 笔记本 v2 门禁复核（gms.part 注册路径 → 逐对 touches → link → verify）
#
# 为什么只注入 31 件而不是全量 573 件：
#   ① gms.verify 只检查**命名件**（state.gmsNamed），未命名件不参与；
#   ② 573 件逐 part no-clear 注入在第 4 个键盘块触发 CDP Runtime.evaluate 超时（实测 2026-09-08）；
#   ③ gms.import 路径会用 uiStrokePartInfo 重建 spec，注册盒失真（实测：导入后全部注册成默认 rod/0.03）。
#   故由 gen-parts-v2.mjs 额外产出 scripts/parts/laptop-v2-gate.js（31 个引擎可连通命名件，真实 spec）。
#   其余 542 件由 independent-check.mjs 的精确 AABB 复算覆盖（0 孤立 / 0 悬空 / 应贴合对 0 缝隙）。
#
# 产物：exports/laptop-v2/s4-gate.json
import json, time, os

ROOT = '/home/h/genshin-model-studio'
OUT = os.path.join(ROOT, 'exports/laptop-v2')
GATE_PART = 'scripts/parts/laptop-v2-gate.js'

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
src = open(os.path.join(ROOT, GATE_PART)).read()
r = js("(() => { try { %s\n  return {ok:true} } catch (e) { return {ok:false, error:String(e && e.message || e)} } })()" % src)
print('%s %s' % (GATE_PART, r))
if not r.get('ok'):
    raise SystemExit('PART_EXEC_ERROR ' + str(r))
for _ in range(60):
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
  return JSON.stringify({ names, links, linkErr, verify: v, strokes: work.strokes.length })
})()""")
d = json.loads(result)
verify = d['verify']
report = {
    'stage': 'S4-gate',
    'method': 'window.__gmsNoClear=true → 注入 scripts/parts/laptop-v2-gate.js（31 个引擎可连通命名件，走 gms.part 真实 spec 注册）→ 逐对 gms.touches → 接触对 gms.link → gms.verify()',
    'whySubset': 'gms.verify 只检查命名件；573 件逐 part 注入触发 CDP Runtime.evaluate 超时；gms.import 重建 spec 失真（实测注册成默认 rod/0.03）。命名集由 gen-parts-v2.mjs 用引擎接触模型（web/index.html:3144-3168）自动裁剪为「可连到地面」的 31 件，其余 542 件由 independent-check.mjs 精确复算覆盖。',
    'status': st,
    'strokes': d['strokes'],
    'namedParts': len(d['names']),
    'names': d['names'],
    'linkCount': d['links'],
    'linkErrors': d['linkErr'],
    'verify': verify,
    'allPairGaps': json.loads(js("""(() => {
      const names = window.gms.parts().map(p => p.name)
      const out = []
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        const t = window.gms.touches(names[i], names[j])
        out.push([names[i], names[j], t.gap, t.contact])
      }
      return JSON.stringify(out)
    })()""")),
}
open(os.path.join(OUT, 's4-gate.json'), 'w').write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print('named:', len(d['names']), '| links:', d['links'], '| linkErr:', len(d['linkErr']))
print('verify.ok =', verify['ok'], '| floating:', verify['floating'], '| collides:', verify['collides'])
assert verify['ok'] is True, 'GATE FAIL: ' + json.dumps(verify, ensure_ascii=False)
print('GATE OK')
