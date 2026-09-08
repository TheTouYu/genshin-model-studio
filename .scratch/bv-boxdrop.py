import time, json
goto_url('http://localhost:8787/draw/motion-review.html?mocap=1&v=9')
time.sleep(5)
print('status:', js('JSON.stringify(window.motionReview.status())'))
js("var s=document.getElementById('clip'); s.value='02_06'; s.dispatchEvent(new Event('change'))")
time.sleep(0.5)
for t in [1.0, 14.0, 14.4, 14.7, 15.0, 16.0, 18.6]:
    js('window.motionReview.seek(%s)' % t)
    time.sleep(0.25)
    d = json.loads(js('JSON.stringify(window.motionReview.propsDebug())'))
    box = d[0]
    print('t=%.1f' % t, 'box y=%.3f' % box['position'][1])
