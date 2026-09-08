#!/usr/bin/env bash
set -euo pipefail
browser-harness <<'PY'
import json
from pathlib import Path
tabs=[t for t in list_tabs() if '/draw/motion-review.html' in t['url']]
if tabs:switch_tab(tabs[0]['targetId']);cdp('Page.navigate',url='http://localhost:8787/draw/motion-review.html?mocap=1')
else:new_tab('http://localhost:8787/draw/motion-review.html?mocap=1')
cdp('Emulation.setFocusEmulationEnabled',enabled=True)
wait_for_load()
print(js("new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(window.motionReview){clearInterval(timer);resolve(true)}else if(++n>150){clearInterval(timer);reject(new Error('asset readiness timeout'))}},100)})"))
r=js("(()=>{const checks=motionReview.asset.clips.map(c=>{motionReview.pose(c.id,c.duration);return {id:c.id,time:motionState.time,duration:c.duration,finite:motionState.vertices.flat().every(Number.isFinite)}});document.querySelector('#rest').click();return {checks,restExact:JSON.stringify(motionState.vertices)===JSON.stringify(motionReview.asset.mesh.vertices)}})()")
assert r['restExact'] and all(c['finite'] and c['time']==c['duration'] for c in r['checks']),r
js("motionReview.pose('02_01',2.84);document.querySelector('#loop').checked=false;document.querySelector('#sequence').checked=false;document.querySelector('#play').click()")
end=js("new Promise(resolve=>setTimeout(()=>resolve(motionReview.status()),350))")
assert not end['playing'] and end['time']==end['duration'],end
js("motionReview.pose('02_01',2.84);document.querySelector('#sequence').checked=true;document.querySelector('#play').click()")
sequence=js("new Promise(resolve=>setTimeout(()=>{const s=motionReview.status();document.querySelector('#play').click();return resolve(s)},350))")
assert sequence['clip']=='02_02' and sequence['time']>0,sequence
r['stopAtEnd']=end;r['sequenceTransition']=sequence;r['humanAcceptanceReady']=False
Path('delivery/mocap-retarget/browser-playback-controls.json').write_text(json.dumps(r,indent=2))
print(json.dumps(r))
PY
