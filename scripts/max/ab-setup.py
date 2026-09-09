#!/usr/bin/env python3
"""盲测编排：6 张自渲染 + 6 张真机参考 → 去标识混排。
输出 ab-test/imgNN.png（无任何来源线索）+ 私有答案 key.json（不在给评委的目录里）
"""
import json
import os
import random
import shutil
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'delivery', 'macbook-max', 'ab-test')
KEY = os.path.join(ROOT, '.scratch', 'max', 'ab-key.json')

PAIRS = [
    ('p1-top',     'reference/macbook/img/official-mbp14-dimensions-1.jpg'),
    ('p2-front',   'reference/macbook/img/apple-mbp13-silver-official.png'),
    ('p3-ports',   'reference/macbook/img/official-mbp14-ports-1.jpg'),
    ('p4-hero',    'reference/macbook/img/official-mbp14-hero.jpg'),
    ('p5-closed34','reference/macbook/img/apple-mbp14-m3-official.png'),
    ('p6-bottom',  'reference/macbook/img/apple-mbp13-bottom-case-official.jpg'),
]


def prep(src, dst, maxdim=880):
    im = Image.open(src).convert('RGB')
    s = min(1.0, maxdim / max(im.width, im.height))
    if s < 1.0:
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    im.save(dst, 'PNG')


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 20260909
    rnd = random.Random(seed)
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))
    items = []
    for name, ref in PAIRS:
        items.append(('render', os.path.join(ROOT, 'delivery', 'macbook-max', name + '.png'), name))
        items.append(('real', os.path.join(ROOT, ref), os.path.basename(ref)))
    rnd.shuffle(items)
    key = {}
    for i, (kind, src, label) in enumerate(items, start=1):
        fn = f'img{i:02d}.png'
        prep(src, os.path.join(OUT, fn))
        key[fn] = {'kind': kind, 'source': label}
    with open(KEY, 'w') as f:
        json.dump({'seed': seed, 'key': key}, f, ensure_ascii=False, indent=1)
    print(f'{len(items)} 张已写入 {OUT}（顺序已打乱，seed={seed}）')
    print('答案 key 存于', KEY, '（评委不可见）')


if __name__ == '__main__':
    main()
