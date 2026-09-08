import time, json
EV = '/home/h/genshin-model-studio/delivery/mocap-retarget/browser-evidence'
switch_tab('75133351E2FC746581BD73F4B7474C7E')
time.sleep(0.5)

def setclip(cid):
    js("var s=document.getElementById('clip'); s.value='%s'; s.dispatchEvent(new Event('change'))" % cid)
    time.sleep(0.6)

def seek(t):
    js('window.motionReview.seek(%s)' % t)
    time.sleep(0.35)

def view(v):
    js("window.motionReview.setView('%s')" % v)
    time.sleep(0.3)

# 02_03 run: mid-flight (both feet off at swing) - front + side
setclip('02_03'); seek(0.55)
capture_screenshot(EV + '/02_03-run-mid-front.png')
view('side')
capture_screenshot(EV + '/02_03-run-mid-side.png')
view('front')

# 02_04 jump: apex + landing
setclip('02_04'); seek(1.9)
capture_screenshot(EV + '/02_04-jump-apex-side.png')
seek(3.2)
capture_screenshot(EV + '/02_04-jump-landing-side.png')

# 02_05 punch: extended strike
setclip('02_05'); seek(0.8)
capture_screenshot(EV + '/02_05-punch-extended-side.png')

# 02_07 sword in WIREFRAME mode (both render modes evidence)
setclip('02_07'); seek(0.5)
js("window.motionReview.setRender('wire')")
time.sleep(0.4)
capture_screenshot(EV + '/02_07-sword-grip-WIRE-front.png')
js("window.motionReview.setRender('white')")
time.sleep(0.4)

# 02_06 box after release (deterministic drop -> on floor) + rest on support at t=0.5
setclip('02_06'); seek(16.0)
capture_screenshot(EV + '/02_06-box-onfloor-after-drop.png')
seek(0.5)
capture_screenshot(EV + '/02_06-box-support-rest.png')

# 02_10 basin hands-in-water moment + bones toggle on for skeleton evidence
setclip('02_10'); seek(5.0)
capture_screenshot(EV + '/02_10-basin-hands-front.png')
js("var cb=document.getElementById('bones'); cb.checked=true; cb.dispatchEvent(new Event('change'))")
time.sleep(0.4)
capture_screenshot(EV + '/02_10-basin-bonesOn-front.png')
js("var cb=document.getElementById('bones'); cb.checked=false; cb.dispatchEvent(new Event('change'))")

# 02_02 walk side view (heel-strike evidence) white
setclip('02_02'); seek(0.35)
view('side')
capture_screenshot(EV + '/02_02-walk-heelstrike-side.png')
view('front')
print('screenshots done')
