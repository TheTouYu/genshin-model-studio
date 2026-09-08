import time, json
TAB = 'ED42B2558A3B33C950B6BD31601DE9E4'
switch_tab(TAB)
time.sleep(0.5)
# page error state
print('err div:', repr(js("document.getElementById('err').style.display + '/' + document.getElementById('err').textContent")))
# drain console/exception events and filter to page-origin errors
evs = drain_events()
bad = []
for e in evs:
    m = e.get('method', '')
    if m in ('Runtime.exceptionThrown', 'Log.entryAdded', 'Runtime.consoleAPICalled'):
        p = e.get('params', {})
        if m == 'Runtime.consoleAPICalled' and p.get('type') in ('error', 'assert'):
            bad.append(('console', json.dumps(p.get('args', []))[:300]))
        elif m == 'Runtime.exceptionThrown':
            bad.append(('exception', json.dumps(p.get('exceptionDetails', {}))[:400]))
        elif m == 'Log.entryAdded' and p.get('entry', {}).get('level') == 'error':
            bad.append(('log', p['entry'].get('text', '')[:300]))
print('page errors:', len(bad))
for b in bad[:10]:
    print(' ', b)
