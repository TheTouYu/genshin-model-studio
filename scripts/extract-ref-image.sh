#!/usr/bin/env bash
# extract-ref-image.sh — 从 DSH Web GUI (127.0.0.1:3100) 会话 DOM 提取参考附件图
# 期望 sha256 = 5249385ba33da365f3152286c49011cf3579e53c65afd4638ad597c59132e93b
set -euo pipefail
browser-harness <<'PY'
import time, os, hashlib, base64

GUI = 'http://127.0.0.1:3100'
TARGET_HASH = '5249385ba33da365f3152286c49011cf3579e53c65afd4638ad597c59132e93b'
OUT = os.environ.get('REF_OUT', 'reference/user-upload-5249385.png')
os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)

tabs = [t for t in list_tabs() if '127.0.0.1:3100' in t.get('url', '') or 'localhost:3100' in t.get('url', '')]
if not tabs:
    new_tab(GUI)
    time.sleep(6)
else:
    switch_tab(tabs[0])
    time.sleep(2)

# 1) 先同步扫描 data:image 的 img
info = js("Array.from(document.querySelectorAll('img')).map(im => ({src: (im.getAttribute('src')||'').slice(0, 4000000), w: im.naturalWidth||0, h: im.naturalHeight||0}))") or []
found = None
for im in info:
    s = im.get('src') or ''
    if s.startswith('data:image/') and ';base64,' in s:
        try:
            data = base64.b64decode(s.split(';base64,', 1)[1])
        except Exception:
            continue
        h = hashlib.sha256(data).hexdigest()
        print('img[data-url]', im.get('w'), 'x', im.get('h'), 'sha256=', h, 'bytes=', len(data))
        if h == TARGET_HASH:
            found = data
            break

# 2) 若未见，则异步 fetch blob/http src 并轮询
if not found:
    js("""(() => {
      window.__refB64s = null;
      const imgs = Array.from(document.querySelectorAll('img'));
      Promise.all(imgs.map(im => {
        const src = im.getAttribute('src');
        if (!src || src.startsWith('data:')) return Promise.resolve(null);
        return fetch(src).then(r => r.blob()).then(b => new Promise(resolve => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result).split(',')[1] || null);
          fr.onerror = () => resolve(null);
          fr.readAsDataURL(b);
        })).catch(() => null);
      })).then(list => { window.__refB64s = list; });
      return true;
    })()""")
    for _ in range(20):
        time.sleep(0.5)
        list_b64 = js("window.__refB64s") or []
        if list_b64:
            for b64 in list_b64:
                if not b64:
                    continue
                try:
                    data = base64.b64decode(b64)
                except Exception:
                    continue
                h = hashlib.sha256(data).hexdigest()
                print('img[fetch] sha256=', h, 'bytes=', len(data))
                if h == TARGET_HASH:
                    found = data
                    break
        if found:
            break

if not found:
    print('ERROR: 未在 GUI DOM 找到 sha256=%s 的图片（img 标签数=%d）' % (TARGET_HASH, len(info or [])))
    raise SystemExit(1)

with open(OUT, 'wb') as f:
    f.write(found)
print('已保存参考图:', OUT, len(found), '字节, sha256=', hashlib.sha256(found).hexdigest())
PY
