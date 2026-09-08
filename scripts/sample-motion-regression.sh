#!/usr/bin/env bash
set -euo pipefail
browser-harness <<'PY'
import json
from pathlib import Path
tabs=[t for t in list_tabs() if '/draw/motion-review.html' in t['url']]
if tabs:switch_tab(tabs[0]['targetId']);cdp('Page.navigate',url='http://localhost:8787/draw/motion-review.html')
else:new_tab('http://localhost:8787/draw/motion-review.html')
wait_for_load()
r=js("(async()=>{const a=motionReview.asset;const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(a))))).map(x=>x.toString(16).padStart(2,'0')).join('');const out=[];for(const c of a.clips)for(let t=0;t<=4;t+=.125){const p=motionReview.pose(c.id,t);out.push({clip:c.id,time:t,vertices:p.vertices,joints:p.joints})}const reset=motionReview.pose(a.clips[0].id,0);return {bundleSha256:fingerprint,sourceSha256:a.rig.sourceSha256,rigVersion:a.rig.schemaVersion,samples:out,resetExact:JSON.stringify(reset.vertices)===JSON.stringify(a.mesh.vertices)}})()")
Path('delivery/motion-regression-v2/samples.json').write_text(json.dumps(r))
print({'samples':len(r['samples']),'resetExact':r['resetExact'],'rigVersion':r['rigVersion']})
PY
node scripts/parts/verify-motion-samples.mjs
