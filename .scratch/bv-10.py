import time, json
switch_tab('75133351E2FC746581BD73F4B7474C7E')
time.sleep(0.5)
# collect console errors
errs = drain_events()
for e in errs:
    s = json.dumps(e, ensure_ascii=False)
    if 'motion-review' in s or 'Exception' in s or 'error' in s.lower():
        print(s[:500])
print('---')
r = js("typeof window.motionState")
print('motionState:', r)
r2 = js("typeof window.motionReview")
print('motionReview:', r2)
# try switching to 02_10 manually
r3 = js("(function(){ var s=document.getElementById('clip'); s.value='02_10'; s.dispatchEvent(new Event('change')); return 'ok'; })()")
print('change:', r3)
time.sleep(0.6)
print('motionState after change:', js('typeof window.motionState'))
print('stats:', js("document.getElementById('stats').textContent.slice(0,200)"))
print('err div:', js("document.getElementById('err').textContent"))
