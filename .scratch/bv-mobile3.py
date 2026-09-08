import time, json
EV = '/home/h/genshin-model-studio/delivery/mocap-retarget/browser-evidence'
TAB = 'ED42B2558A3B33C950B6BD31601DE9E4'

def ready():
    try:
        return js("(function(){ if(typeof window.motionReview!=='object') return 'no-api'; var st=window.motionReview.status(); return (st && st.mode==='mocap' && window.motionState && window.motionState.vertices) ? 'ready' : 'loading'; })()")
    except Exception:
        return 'error'

def ensure(timeout=25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        switch_tab(TAB)
        if ready() == 'ready':
            return True
        time.sleep(1.0)
    raise RuntimeError('not ready')

ensure()
goto_url('http://localhost:8787/draw/motion-review.html?mocap=1&v=13')
time.sleep(3)
ensure()
cdp('Emulation.setDeviceMetricsOverride', width=390, height=844, deviceScaleFactor=2, mobile=True)
time.sleep(1.5)
ensure()
meta = js("JSON.stringify({iw: innerWidth, ih: innerHeight, docH: document.documentElement.scrollHeight, cw: document.querySelector('#stage canvas').clientWidth, ch: document.querySelector('#stage canvas').clientHeight})")
if isinstance(meta, str): meta = json.loads(meta)
print('layout:', json.dumps(meta), '| page fits viewport:', meta['docH'] <= meta['ih'] + 2)
js('window.motionReview.seek(1.0)')
time.sleep(0.4)
snap = js('JSON.stringify(window.motionReview.snapshotStats())')
if isinstance(snap, str): snap = json.loads(snap)
print('snapshot whiteFrac=%.3f nonEmpty=%s content=%s' % (snap['whiteFrac'], snap['nonEmpty'], json.dumps(snap['content'])))
capture_screenshot(EV + '/mobile-390-white-walk.png')
cdp('Emulation.clearDeviceMetricsOverride')
time.sleep(0.8)
print('mobile retake done')
