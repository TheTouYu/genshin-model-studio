import time, json

def stat():
    r = js('JSON.stringify(window.motionReview.status())')
    if isinstance(r, str): r = json.loads(r)
    return r

def vsum():
    r = js("""(function(){
      var vs=window.motionState.vertices; var s=0; var ok=true;
      for (var i=0;i<vs.length;i++){for(var k=0;k<3;k++){var x=vs[i][k]; if(!isFinite(x)){ok=false;} s+=x;}}
      return {n:vs.length, finite:ok, sum:+s.toFixed(4)};
    })()""")
    if isinstance(r, str): r = json.loads(r)
    return r

def setcb(idc, val):
    js("var cb=document.getElementById('%s'); cb.checked=%s; cb.dispatchEvent(new Event('change'))" % (idc, 'true' if val else 'false'))

switch_tab('75133351E2FC746581BD73F4B7474C7E')
CLIPS = ['02_01','02_02','02_03','02_04','02_05','02_06','02_07','02_08','02_09','02_10']
results = {}
for cid in CLIPS:
    cdp('Page.bringToFront')
    time.sleep(0.3)
    assert js("!!document.getElementById('loop')"), 'wrong tab context'
    setcb('loop', False); setcb('sequence', False)
    if stat()['playing']:
        js("document.getElementById('play').click()")
        time.sleep(0.2)
    js("var s=document.getElementById('clip'); s.value='%s'; s.dispatchEvent(new Event('change'))" % cid)
    time.sleep(0.5)
    dur = stat()['duration']
    js('window.motionReview.seek(0)')
    time.sleep(0.2)
    assert stat()['playing'] == False, 'should start paused'
    c0 = vsum()
    js("document.getElementById('play').click()")
    time.sleep(dur*0.2)
    cm = vsum()
    time.sleep(dur*0.4)
    c6 = vsum()
    t_end = time.time() + dur + 4
    while time.time() < t_end:
        if not stat()['playing']:
            break
        time.sleep(0.25)
    st = stat(); cE = vsum()
    sums = [c0['sum'], cm['sum'], c6['sum'], cE['sum']]
    ok = (st['playing'] == False and st['clipId'] == cid
          and st['time'] >= dur - 0.15
          and all([c0['finite'], cm['finite'], c6['finite'], cE['finite']])
          and len(set(sums)) >= 3)
    results[cid] = dict(dur=round(dur,2), endT=round(st['time'],3), endClip=st['clipId'],
                        playing=st['playing'], sums=sums, finite=all([c0['finite'],cm['finite'],c6['finite'],cE['finite']]),
                        PASS=ok)
    print(cid, json.dumps(results[cid]))
print('ALL:', all(r['PASS'] for r in results.values()))
json.dump(results, open('/home/h/genshin-model-studio/delivery/mocap-retarget/browser-evidence/fullplay-results.json','w'), indent=1)
