#!/usr/bin/env bash
set -euo pipefail
browser-harness <<'PY'
import json, hashlib
from pathlib import Path
expected=json.loads(Path('delivery/body-blockout-r1/mesh.json').read_text())
expected_hash=hashlib.sha256(json.dumps(expected,sort_keys=True,separators=(',',':')).encode()).hexdigest()
results=[]
for tab in list_tabs():
 if not tab['url'].startswith('http://localhost:8787/'):continue
 switch_tab(tab['targetId'])
 cdp('Page.reload',ignoreCache=True)
 wait_for_load()
 result=js("new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{const stats=window.gmsPreview?.getMeshStats?.();if(stats?.length){clearInterval(timer);resolve({url:location.href,stats,loaded:window.gmsPreview.getMeshSnapshot()[0],mesh:JSON.parse(localStorage.getItem('gms.draw.work.v1')).strokes[0].mesh})}else if(++n>100){clearInterval(timer);reject(new Error('preview startup timeout'))}},100)})")
 actual_hash=hashlib.sha256(json.dumps(result.pop('mesh'),sort_keys=True,separators=(',',':')).encode()).hexdigest()
 loaded_hash=hashlib.sha256(json.dumps(result.pop('loaded'),sort_keys=True,separators=(',',':')).encode()).hexdigest()
 assert loaded_hash==actual_hash==expected_hash,(result,loaded_hash,actual_hash,expected_hash)
 result['loadedMeshSha256']=loaded_hash
 assert result['stats']==[{'resourceId':10009019,'vertices':113,'triangles':222}],result
 result['savedMeshSha256']=actual_hash
 results.append(result)
assert len(results)>=2,results
print(json.dumps({'checks':results,'browserProcessRestarted':False},ensure_ascii=False,indent=2))
PY
