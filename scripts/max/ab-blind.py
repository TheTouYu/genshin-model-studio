#!/usr/bin/env python3
"""盲测编排 v3（裁判隔离版）：6 张自渲染 + 6 张真机参考 → 去标识混排到 /tmp。

与 v2 的差别：输出目录在**工作区之外**（/tmp/mb-blind-<seed>/），裁判只拿到该目录，
即使越界探索也读不到仓库里的 REPORT/答案。所有图统一重编码为 PNG ≤880px，
消除"文件格式/尺寸"这条捷径。答案 key 只写 .scratch/max/ab-key.json（不落裁判目录）。

用法：python3 scripts/max/ab-blind.py [seed]
"""
import json
import os
import random
import shutil
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KEY = os.path.join(ROOT, '.scratch', 'max', 'ab-key.json')

PAIRS = [
    ('p1-top',      'reference/macbook/img/official-mbp14-dimensions-1.jpg'),
    ('p2-front',    'reference/macbook/img/apple-mbp13-silver-official.png'),
    ('p3-ports',    'reference/macbook/img/official-mbp14-ports-1.jpg'),
    ('p4-hero',     'reference/macbook/img/official-mbp14-hero.jpg'),
    ('p5-closed34', 'reference/macbook/img/apple-mbp14-m3-official.png'),
    ('p6-bottom',   'reference/macbook/img/apple-mbp13-bottom-case-official.jpg'),
]


def prep(src, dst, maxdim=880):
    im = Image.open(src).convert('RGB')
    s = min(1.0, maxdim / max(im.width, im.height))
    if s < 1.0:
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    im.save(dst, 'PNG')


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 20260909
    out = f'/tmp/mb-blind-{seed}'
    rnd = random.Random(seed)
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out, exist_ok=True)
    items = []
    for name, ref in PAIRS:
        items.append(('render', os.path.join(ROOT, 'delivery', 'macbook-max', name + '.png'), name))
        items.append(('real', os.path.join(ROOT, ref), os.path.basename(ref)))
    rnd.shuffle(items)
    key = {}
    for i, (kind, src, label) in enumerate(items, start=1):
        fn = f'img{i:02d}.png'
        prep(src, os.path.join(out, fn))
        key[fn] = {'kind': kind, 'source': label}
    with open(KEY, 'w') as f:
        json.dump({'seed': seed, 'dir': out, 'key': key}, f, ensure_ascii=False, indent=1)
    print(f'wrote {out}/img01..img12.png  (key: {KEY})')
    print('n_real=%d n_render=%d' % (sum(1 for v in key.values() if v['kind'] == 'real'),
                                     sum(1 for v in key.values() if v['kind'] == 'render')))


if __name__ == '__main__':
    main()
