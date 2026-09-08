import time, json

def stat():
    return json.loads(js('JSON.stringify(window.motionReview.status())'))

def centroid():
    return json.loads(js("JSON.stringify(window.motionState.vertices.reduce((a,v)=>[a[0]+v[0],a[1]+v[1],a[2]+v[2],a[3]+1],[0,0,0,0]).slice(0,3).map(x=>x/window.motionState.vertices.length))"))

print('=== inPlace centroid collapse (walk 02_01, late t=2.7) ===')
js("var s=document.getElementById('clip'); s.value='02_01'; s.dispatchEvent(new Event('change'))")
time.sleep(0.4)
js("var cb=document.getElementById('inplace'); cb.checked=false; cb.dispatchEvent(new Event('change'))")
js('window.motionReview.seek(2.7)'); time.sleep(0.3)
c_norm = centroid()
js("var cb=document.getElementById('inplace'); cb.checked=true; cb.dispatchEvent(new Event('change'))")
time.sleep(0.3)
c_ip = centroid()
print('normal  centroid [%.3f %.3f %.3f]' % tuple(c_norm))
print('inPlace centroid [%.3f %.3f %.3f]' % tuple(c_ip))

print('=== sequence advance with loop OFF (02_10 end -> next) ===')
js("var s=document.getElementById('clip'); s.value='02_10'; s.dispatchEvent(new Event('change'))")
time.sleep(0.4)
nprops_10 = len(json.loads(js('JSON.stringify(window.motionReview.propsDebug())')))
js("document.getElementById('loop').checked=false; document.getElementById('loop').dispatchEvent(new Event('change'))")
js("document.getElementById('sequence').checked=true; document.getElementById('sequence').dispatchEvent(new Event('change'))")
js("document.getElementById('play').click()")
time.sleep(0.6)
prev=None
for i in range(50):
    st=stat()
    if prev and st['clipId']!=prev:
        time.sleep(0.4)
        nprops_new = len(json.loads(js('JSON.stringify(window.motionReview.propsDebug())')))
        print('ADVANCED %s -> %s, playing=%s, props %d->%d (scene reset OK)' % (prev, st['clipId'], st['playing'], nprops_10, nprops_new))
        break
    prev=st['clipId']
    time.sleep(0.4)
else:
    print('NO ADVANCE; final', stat()['clipId'], stat()['time'])
js("document.getElementById('play').click()")

print('=== purebody toggle (02_07 sword) ===')
js("var s=document.getElementById('clip'); s.value='02_07'; s.dispatchEvent(new Event('change'))")
time.sleep(0.4)
js('window.motionReview.seek(0.5)'); time.sleep(0.3)
d1 = json.loads(js('JSON.stringify(window.motionReview.propsDebug())'))
js("document.getElementById('props').checked=false; document.getElementById('props').dispatchEvent(new Event('change'))")
time.sleep(0.3)
d2 = json.loads(js('JSON.stringify(window.motionReview.propsDebug())'))
js("document.getElementById('props').checked=true; document.getElementById('props').dispatchEvent(new Event('change'))")
time.sleep(0.3)
d3 = json.loads(js('JSON.stringify(window.motionReview.propsDebug())'))
print('on :', [(p['kind'], p['visible']) for p in d1])
print('off:', [(p['kind'], p['visible']) for p in d2])
print('on2:', [(p['kind'], p['visible']) for p in d3])
