import time, json
switch_tab('75133351E2FC746581BD73F4B7474C7E')
time.sleep(0.5)
cdp('Emulation.setDeviceMetricsOverride', width=390, height=844, deviceScaleFactor=2, mobile=True)
time.sleep(1.5)
meta = js("""JSON.stringify({iw: innerWidth, ih: innerHeight, cw: document.querySelector('#stage canvas').clientWidth, ch: document.querySelector('#stage canvas').clientHeight})""")
if isinstance(meta, str): meta = json.loads(meta)
print('layout:', json.dumps(meta))
js("var s=document.getElementById('clip'); s.value='02_01'; s.dispatchEvent(new Event('change'))")
time.sleep(0.5)
js('window.motionReview.seek(1.0)')
time.sleep(0.3)
# feet-not-cropped: bright-row profile of the white model on mobile canvas
prof = js("""(function(){
  var c=document.querySelector('#stage canvas');
  var g=c.getContext('2d'); // may be null for webgl; use snapshotStats instead
  return null;
})()""")
snap = js('JSON.stringify(window.motionReview.snapshotStats())')
if isinstance(snap, str): snap = json.loads(snap)
print('snapshot:', json.dumps(snap))
# playback advance on mobile
js("var sp=document.getElementById('speed'); sp.value='1'; sp.dispatchEvent(new Event('change'))")
js('window.motionReview.seek(0)')
js("document.getElementById('play').click()")
time.sleep(1.5)
st = js('JSON.stringify(window.motionReview.status())')
if isinstance(st, str): st = json.loads(st)
print('after 1.5s play @1x: t=%.3f playing=%s' % (st['time'], st['playing']))
js("document.getElementById('play').click()")
capture_screenshot('/home/h/genshin-model-studio/delivery/mocap-retarget/browser-evidence/mobile-390-white-walk.png')
cdp('Emulation.clearDeviceMetricsOverride')
time.sleep(0.8)
print('done')
