import time, json
# open the mocap review page in a fresh tab and bring it to front
new_tab('http://localhost:8787/draw/motion-review.html?mocap=1')
time.sleep(4)
cdp('Page.bringToFront')
time.sleep(1)
# confirm it loaded with correct defaults
st = js("JSON.stringify(window.motionReview.status())")
if isinstance(st, str): st = json.loads(st)
print('loaded:', json.dumps({k: st[k] for k in ('mode','clipId','time','playing','render','ground','bones','speed','view')}, ensure_ascii=False))
print('url:', json.dumps(page_info().get('url', '')))
