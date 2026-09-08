import time, json
EV = '/home/h/genshin-model-studio/delivery/mocap-retarget/browser-evidence'
TAB = '75133351E2FC746581BD73F4B7474C7E'

def ensure():
    for attempt in range(3):
        switch_tab(TAB)
        time.sleep(0.4)
        if js("!!document.getElementById('clip') && typeof window.motionReview === 'object'"):
            return True
        time.sleep(1.0)
    raise RuntimeError('tab context lost')

def setclip(cid):
    ensure()
    js("var s=document.getElementById('clip'); s.value='%s'; s.dispatchEvent(new Event('change'))" % cid)
    time.sleep(0.7)

def seek(t):
    js('window.motionReview.seek(%s)' % t)
    time.sleep(0.4)

# 02_05 punch
setclip('02_05'); seek(0.8)
ensure(); capture_screenshot(EV + '/02_05-punch-extended-side.png')

# 02_07 sword wireframe
setclip('02_07'); seek(0.5)
js("window.motionReview.setRender('wire')"); time.sleep(0.5)
ensure(); capture_screenshot(EV + '/02_07-sword-grip-WIRE-front.png')
js("window.motionReview.setRender('white')"); time.sleep(0.4)

# 02_06 box: on floor after drop + on support before pickup
setclip('02_06'); seek(16.0)
ensure(); capture_screenshot(EV + '/02_06-box-onfloor-after-drop.png')
seek(0.3)
ensure(); capture_screenshot(EV + '/02_06-box-support-rest.png')

# 02_10 basin + bones on
setclip('02_10'); seek(5.0)
ensure(); capture_screenshot(EV + '/02_10-basin-hands-front.png')
js("var cb=document.getElementById('bones'); cb.checked=true; cb.dispatchEvent(new Event('change'))"); time.sleep(0.5)
ensure(); capture_screenshot(EV + '/02_10-basin-bonesOn-front.png')
js("var cb=document.getElementById('bones'); cb.checked=false; cb.dispatchEvent(new Event('change'))")

# 02_02 walk heel-strike side
setclip('02_02'); seek(0.35)
js("window.motionReview.setView('side')"); time.sleep(0.4)
ensure(); capture_screenshot(EV + '/02_02-walk-heelstrike-side.png')
js("window.motionReview.setView('front')")
print('remaining shots done')
