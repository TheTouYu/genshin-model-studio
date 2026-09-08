import time, json

switch_tab('75133351E2FC746581BD73F4B7474C7E')
time.sleep(0.5)

def stat():
    r = js('JSON.stringify(window.motionReview.status())')
    if isinstance(r, str): r = json.loads(r)
    return r

def sample():
    r = js("""(function(){
      var vs=window.motionState.vertices;
      var s=0, ok=true, miny=1e9, maxy=-1e9;
      for (var i=0;i<vs.length;i++){
        for(var k=0;k<3;k++){var x=vs[i][k]; if(!isFinite(x)){ok=false;} s+=x;}
        miny=Math.min(miny,vs[i][1]); maxy=Math.max(maxy,vs[i][1]);
      }
      return {sum:+s.toFixed(4), finite:ok, miny:+miny.toFixed(3), maxy:+maxy.toFixed(3)};
    })()""")
    if isinstance(r, str): r = json.loads(r)
    return r

CLIPS = ['02_01','02_02','02_03','02_04','02_05','02_06','02_07','02_08','02_09','02_10']
results = {}
for cid in CLIPS:
    js("var s=document.getElementById('clip'); s.value='%s'; s.dispatchEvent(new Event('change'))" % cid)
    time.sleep(0.4)
    dur = stat()['duration']
    n = 60
    sums = []; fin = True; minys = []; maxys = []
    for i in range(n+1):
        t = dur * i / n
        if i == n: t = dur - 1e-4   # loop boundary (last real frame, pre-wrap)
        js('window.motionReview.seek(%s)' % repr(t))
        sm = sample()
        sums.append(sm['sum']); fin = fin and sm['finite']
        minys.append(sm['miny']); maxys.append(sm['maxy'])
    distinct_consecutive = sum(1 for a,b in zip(sums,sums[1:]) if abs(a-b) > 1e-6)
    # wrap consistency: t=0 vs t=dur should NOT be equal unless clip loops seamlessly
    js('window.motionReview.seek(0)')
    s0 = sample()
    ok = (fin and distinct_consecutive >= n*0.9
          and max(maxys) - min(minys) > 0.1)
    results[cid] = dict(dur=round(dur,3), samples=n+1, finite=fin,
                        changingFrames='%d/%d' % (distinct_consecutive, n),
                        minFootY=round(min(minys),3), maxHeadY=round(max(maxys),3),
                        PASS=ok)
    print(cid, json.dumps(results[cid]))
print('ALL:', all(r['PASS'] for r in results.values()))
json.dump(results, open('/home/h/genshin-model-studio/delivery/mocap-retarget/browser-evidence/timeline-sweep.json','w'), indent=1)
