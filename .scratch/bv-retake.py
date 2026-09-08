import time, json
EV = '/home/h/genshin-model-studio/delivery/mocap-retarget/browser-evidence'
TAB = 'ED42B2558A3B33C950B6BD31601DE9E4'

# v=12 tab already has the reloaded page (stand fix active)

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
    raise RuntimeError('not ready: %s' % ready())

def hud():
    r = js("document.getElementById('stats').textContent.split('\\n')[0]")
    return r

def shot(cid, t, path, pre=None, post=None, settle=0.6):
    for attempt in range(3):
        ensure()
        try:
            js("var s=document.getElementById('clip'); s.value='%s'; s.dispatchEvent(new Event('change'))" % cid)
            time.sleep(settle)
            ensure()
            if pre: pre()
            js('window.motionReview.seek(%s)' % t)
            time.sleep(0.5)
            ensure()
            h = hud()
            capture_screenshot(path)
            if post: post()
            print('shot', path.split('/')[-1], '|', h)
            return True
        except Exception as e:
            print('retry %s: %s' % (attempt, str(e)[-100:]))
            time.sleep(2.0)
    return False

ensure()
# 02_04 real apex t=1.183 and landing t=1.667 (side views)
shot('02_04', 1.183, EV+'/02_04-jump-apex-side.png',
     pre=lambda: js("window.motionReview.setView('side')"),
     post=lambda: js("window.motionReview.setView('front')"))
shot('02_04', 1.667, EV+'/02_04-jump-landing-side.png',
     pre=lambda: js("window.motionReview.setView('side')"),
     post=lambda: js("window.motionReview.setView('front')"))
# 02_06 with stand fix: rest-on-support t=0.3, carry t=8.0, dropped t=16.0
shot('02_06', 0.3, EV+'/02_06-box-support-rest.png')
shot('02_06', 8.0, EV+'/02_06-box-carry-front.png')
shot('02_06', 16.0, EV+'/02_06-box-onfloor-after-drop.png')
print('retakes done')
