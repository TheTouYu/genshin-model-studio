import time, json
switch_tab('75133351E2FC746581BD73F4B7474C7E')
time.sleep(0.5)

print('=== mobile viewport 390x844 ===')
cdp('Emulation.setDeviceMetricsOverride', width=390, height=844, deviceScaleFactor=2, mobile=True)
time.sleep(1.5)
info = page_info()
print('viewport:', json.dumps({k: info.get(k) for k in ('width','height')} if isinstance(info, dict) else str(info)[:200]))
st = json.loads(js('JSON.stringify(window.motionReview.status())') if isinstance(js('JSON.stringify(window.motionReview.status())'), str) else '{}')
# snapshot stats (non-empty canvas + feet margin) at default walk paused t=0
snap = js('JSON.stringify(window.motionReview.snapshotStats())')
if isinstance(snap, str): snap = json.loads(snap)
print('snapshot keys:', list(snap.keys()) if isinstance(snap, dict) else str(snap)[:200])
print(json.dumps(snap, ensure_ascii=False)[:1200])
capture_screenshot('/home/h/genshin-model-studio/delivery/mocap-retarget/browser-evidence/mobile-390-white-walk.png')
# play briefly at 0.5x to show time advances even mobile
js("var sp=document.getElementById('speed'); sp.value='0.5'; sp.dispatchEvent(new Event('change'))")
js("document.getElementById('play').click()")
time.sleep(1.2)
t1 = json.loads(js('JSON.stringify({t: window.motionState.time}')  if False else js('JSON.stringify(window.motionReview.status())'))
print('mobile playback t after 1.2s @0.5x:', round(t1['time'],3), 'playing:', t1['playing'])
js("document.getElementById('play').click()")
# restore desktop metrics
cdp('Emulation.clearDeviceMetricsOverride')
time.sleep(0.8)
print('restored desktop')
