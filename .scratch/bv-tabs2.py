import time, json
tabs = list_tabs()
mr = [t for t in tabs if 'motion-review' in str(t.get('url',''))]
print(json.dumps([{k: t.get(k) for k in ('targetId','url')} for t in mr], indent=1))
