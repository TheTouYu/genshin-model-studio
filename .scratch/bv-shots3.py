import time, json
EV = '/home/h/genshin-model-studio/delivery/mocap-retarget/browser-evidence'
TAB = '75133351E2FC746581BD73F4B7474C7E'

def ready():
    try:
        r = js("(function(){ if(typeof window.motionReview!=='object') return 'no-api'; var st=window.motionReview.status(); return (st && st.mode==='mocap' && document.getElementById('clip') && document.getElementById('clip').options.length>=10 && window.motionState && window.motionState.vertices) ? 'ready' : 'loading'; })()")
        return r
    except Exception:
        return 'error'

def ensure(timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        switch_tab(TAB)
        st = ready()
        if st == 'ready':
            return True
        time.sleep(1.0)
    raise RuntimeError('tab not ready: %s' % ready())

def shot(cid, t, path, pre=None, post=None):
    for attempt in range(3):
        ensure()
        try:
            js("var s=document.getElementById('clip'); s.value='%s'; s.dispatchEvent(new Event('change'))" % cid)
            time.sleep(0.8)
            ensure()
            if pre: pre()
            js('window.motionReview.seek(%s)' % t)
            time.sleep(0.5)
            ensure()
            capture_screenshot(path)
            if post: post()
            return True
        except Exception as e:
            print('retry %s %s: %s' % (cid, attempt, str(e)[-120:]))
            time.sleep(2.0)
    return False

ok1 = shot('02_05', 0.8, EV+'/02_05-punch-extended-side.png')
ok2 = shot('02_07', 0.5, EV+'/02_07-sword-grip-WIRE-front.png',
           pre=lambda: (js("window.motionReview.setRender('wire')"), time.sleep(0.4)),
           post=lambda: (js("window.motionReview.setRender('white')"), time.sleep(0.3)))
ok3 = shot('02_06', 16.0, EV+'/02_06-box-onfloor-after-drop.png')
ok4 = shot('02_06', 0.3, EV+'/02_06-box-support-rest.png')
ok5 = shot('02_10', 5.0, EV+'/02_10-basin-hands-front.png')
ok6 = shot('02_10', 5.0, EV+'/02_10-basin-bonesOn-front.png',
           pre=lambda: (js("var cb=document.getElementById('bones'); cb.checked=true; cb.dispatchEvent(new Event('change'))"), time.sleep(0.4)),
           post=lambda: (js("var cb=document.getElementById('bones'); cb.checked=false; cb.dispatchEvent(new Event('change'))"), time.sleep(0.3)))
ok7 = shot('02_02', 0.35, EV+'/02_02-walk-heelstrike-side.png',
           pre=lambda: (js("window.motionReview.setView('side')"), time.sleep(0.4)),
           post=lambda: (js("window.motionReview.setView('front')"), time.sleep(0.3)))
print('results:', [ok1,ok2,ok3,ok4,ok5,ok6,ok7])
