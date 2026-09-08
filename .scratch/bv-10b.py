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

js("var s=document.getElementById('clip'); s.value='02_10'; s.dispatchEvent(new Event('change'))")
for i in range(20):
    time.sleep(0.5)
    if js('typeof window.motionState') == 'object':
        break
dur = stat()['duration']
n = 60
sums = []; fin = True; minys = []; maxys = []
for i in range(n+1):
    t = dur * i / n
    if i == n: t = dur - 1e-4
    js('window.motionReview.seek(%s)' % repr(t))
    sm = sample()
    sums.append(sm['sum']); fin = fin and sm['finite']
    minys.append(sm['miny']); maxys.append(sm['maxy'])
distinct = sum(1 for a,b in zip(sums,sums[1:]) if abs(a-b) > 1e-6)
res = dict(dur=round(dur,3), samples=n+1, finite=fin,
           changingFrames='%d/%d' % (distinct, n),
           minFootY=round(min(minys),3), maxHeadY=round(max(maxys),3),
           PASS=(fin and distinct >= n*0.9 and max(maxys)-min(minys) > 0.1))
print('02_10', json.dumps(res))
# merge into timeline-sweep.json
p = '/home/h/genshin-model-studio/delivery/mocap-retarget/browser-evidence/timeline-sweep.json'
data = json.load(open(p)); data['02_10'] = res
json.dump(data, open(p,'w'), indent=1)
print('ALL 10:', all(v['PASS'] for v in data.values()))
