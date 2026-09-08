import time, json
def stat():
    return json.loads(js('JSON.stringify(window.motionReview.status())'))
new_tab('http://localhost:8787/draw/motion-review.html?mocap=1&v=11')
time.sleep(5)
js("var s=document.getElementById('clip'); s.value='02_10'; s.dispatchEvent(new Event('change'))")
time.sleep(0.4)
js("document.getElementById('loop').checked=false; document.getElementById('loop').dispatchEvent(new Event('change'))")
js("document.getElementById('sequence').checked=true; document.getElementById('sequence').dispatchEvent(new Event('change'))")
js('window.motionReview.seek(21.7)')
time.sleep(0.2)
js("document.getElementById('play').click()")
prev=None
for i in range(30):
    st=stat()
    if prev and st['clipId']!=prev:
        n = len(json.loads(js('JSON.stringify(window.motionReview.propsDebug())')))
        st2=stat()
        print('ADVANCED %s -> %s playing=%s time=%.2f props_now=%d (02_10 had basin=1)' % (prev, st['clipId'], st2['playing'], st2['time'], n))
        break
    prev=st['clipId']
    time.sleep(0.4)
else:
    print('NO ADVANCE', stat()['clipId'], stat()['time'])
js("if (window.motionReview.status().playing) document.getElementById('play').click()")
