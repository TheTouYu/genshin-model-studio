import time, json

def stat():
    return json.loads(js('JSON.stringify(window.motionReview.status())'))

print('=== reload page (pick up propsDebug fix) ===')
goto_url('http://localhost:8787/draw/motion-review.html?mocap=1&v=10')
time.sleep(5)

print('=== sequence advance, state-driven ===')
js("var s=document.getElementById('clip'); s.value='02_10'; s.dispatchEvent(new Event('change'))")
time.sleep(0.4)
nprops_10 = len(json.loads(js('JSON.stringify(window.motionReview.propsDebug())')))
js("document.getElementById('loop').checked=false; document.getElementById('loop').dispatchEvent(new Event('change'))")
js("document.getElementById('sequence').checked=true; document.getElementById('sequence').dispatchEvent(new Event('change'))")
st = stat()
if st['playing']:
    js("document.getElementById('play').click()")
    time.sleep(0.2)
js('window.motionReview.seek(21.7)')
time.sleep(0.2)
st = stat()
print('pre: clip=%s t=%.2f playing=%s loop=%s seq=%s' % (st['clipId'], st['time'], st['playing'], st['loop'], st['sequence']))
if not st['playing']:
    js("document.getElementById('play').click()")
prev=None
for i in range(40):
    st=stat()
    if prev and st['clipId']!=prev:
        time.sleep(0.4)
        nprops_new = len(json.loads(js('JSON.stringify(window.motionReview.propsDebug())')))
        st2 = stat()
        print('ADVANCED %s -> %s playing=%s props %d->%d' % (prev, st['clipId'], st2['playing'], nprops_10, nprops_new))
        break
    prev=st['clipId']
    time.sleep(0.4)
else:
    print('NO ADVANCE; final', stat())
js("if (window.motionReview.status().playing) document.getElementById('play').click()")

print('=== purebody toggle after reload ===')
js("var s=document.getElementById('clip'); s.value='02_07'; s.dispatchEvent(new Event('change'))")
time.sleep(0.4)
js('window.motionReview.seek(0.5)'); time.sleep(0.3)
d1 = json.loads(js('JSON.stringify(window.motionReview.propsDebug())'))
js("document.getElementById('props').checked=false; document.getElementById('props').dispatchEvent(new Event('change'))")
time.sleep(0.3)
d2 = json.loads(js('JSON.stringify(window.motionReview.propsDebug())'))
js("document.getElementById('props').checked=true; document.getElementById('props').dispatchEvent(new Event('change'))")
print('on :', [(p['kind'], p['visible']) for p in d1])
print('off:', [(p['kind'], p['visible']) for p in d2])
