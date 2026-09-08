import time, json
tabs = list_tabs()
print(json.dumps([{k: t.get(k) for k in ('targetId','url','title')} for t in tabs if not str(t.get('url','')).startswith('chrome')], indent=1, ensure_ascii=False))
