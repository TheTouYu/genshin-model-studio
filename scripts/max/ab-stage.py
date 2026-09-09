#!/usr/bin/env python3
"""盲测暂存/隔离 v2（工作区内，绝不碰 /tmp）。

为什么不能用 /tmp：每个 bash 调用与每个子代理沙箱都有**独立私有 /tmp tmpfs**，
工作区文件 mv 到 /tmp 会在该次调用结束时被销毁（2026-09-09 一次误操作丢过
delivery/macbook-max 与 delivery/macbook-gia）。因此图集必须在工作区内暂存。

隔离措施（stage 期间）：
  ① 图集写进 .blind-<seed>/，**重编码**（quality/尺寸微变 → 与源 p*.png 字节不同，哈希对不上）
  ② ab-key.json 删除（可确定性再生：同 seed 重跑本脚本即得同一映射）
  ③ 源渲染目录 delivery/macbook-max → delivery/.mhold（不透明名）
  ④ docs/macbook-max-rubric.md → docs/.mrubric（复盘文档里写明了哪些是渲染）

用法：python3 scripts/max/ab-stage.py stage|restore [seed]
"""
import json
import os
import random
import shutil
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KEY = os.path.join(ROOT, '.scratch', 'max', 'ab-key.json')

# 协议 v5：前 3 对换用用户新补的高质量参考图（/mnt/e/模型/笔记本/），后 3 对沿用官方图
# （带尺寸标注的规格图不入基准：判官靠标注线即可分辨，计入会虚高误判率）
NEWREF = '/mnt/e/模型/笔记本/'
PAIRS = [
    ('p6-top',      NEWREF + '俯视图.png'),
    ('p2-front',    NEWREF + '正视图.png'),
    ('p3-kb',       NEWREF + '键盘和触控板.png'),
    ('p4-ports',    'reference/macbook/img/official-mbp14-ports-1.jpg'),
    ('p5-screen34', 'reference/macbook/img/apple-mbp14-m3-official.png'),
    ('p1-hero',     'reference/macbook/img/official-mbp14-hero.jpg'),
]


def build_set(seed):
    """确定性生成混排集合（同 seed → 同映射），返回 key。"""
    rnd = random.Random(seed)
    items = []
    for name, ref in PAIRS:
        items.append(('render', os.path.join(ROOT, 'delivery', 'macbook-page', name + '.png'), name))
        items.append(('real', os.path.join(ROOT, ref), os.path.basename(ref)))
    rnd.shuffle(items)
    key = {}
    for i, (kind, src, label) in enumerate(items, start=1):
        key[f'img{i:02d}.png'] = {'kind': kind, 'source': label, 'src': src}
    return key


def stage(seed):
    key = build_set(seed)
    d = os.path.join(ROOT, f'.blind-{seed}')
    if os.path.isdir(d):
        shutil.rmtree(d)
    os.makedirs(d)
    for fn, meta in key.items():
        im = Image.open(meta['src']).convert('RGB')
        s = min(1.0, 880 / max(im.width, im.height))
        if s < 1.0:
            im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
        # 重编码：与源文件字节不同（防哈希对号）
        im.save(os.path.join(d, fn), 'PNG', optimize=False, compress_level=6)
    # 删除 key（stage 期间不可见）
    if os.path.exists(KEY):
        os.remove(KEY)
    # 源渲染目录/复盘文档改名
    for src, hold in (('macbook-max', '.mhold'), ('macbook-page', '.mhold-page'), ('macbook-gia', '.mhold-gia')):
        a, h = os.path.join(ROOT, 'delivery', src), os.path.join(ROOT, 'delivery', hold)
        if os.path.isdir(a) and not os.path.isdir(h):
            os.rename(a, h)
    rub = os.path.join(ROOT, 'docs', 'macbook-max-rubric.md')
    if os.path.exists(rub):
        os.rename(rub, os.path.join(ROOT, 'docs', '.mrubric.md'))
    print(f'staged {d} ({len(key)} images, re-encoded)')
    print(f'key deleted ({KEY}); regenerate deterministically with: ab-stage.py restore {seed}')
    print('held: delivery/.mhold* , docs/.mrubric.md')


def restore(seed):
    d = os.path.join(ROOT, f'.blind-{seed}')
    if os.path.isdir(d):
        shutil.rmtree(d)
    for hold, tgt in (('.mhold', 'macbook-max'), ('.mhold-page', 'macbook-page'), ('.mhold-gia', 'macbook-gia')):
        h, t = os.path.join(ROOT, 'delivery', hold), os.path.join(ROOT, 'delivery', tgt)
        if not os.path.isdir(h):
            continue
        if os.path.isdir(t):
            for f in os.listdir(h):          # 合并（渲染任务可能已重建目标目录）
                shutil.move(os.path.join(h, f), os.path.join(t, f))
            shutil.rmtree(h)
        else:
            os.rename(h, t)
    rub = os.path.join(ROOT, 'docs', '.mrubric.md')
    if os.path.exists(rub):
        os.rename(rub, os.path.join(ROOT, 'docs', 'macbook-max-rubric.md'))
    key = build_set(seed)
    for v in key.values():
        v.pop('src', None)
    with open(KEY, 'w') as f:
        json.dump({'seed': seed, 'key': key}, f, ensure_ascii=False, indent=1)
    print(f'restored; key rebuilt at {KEY}')
    print('delivery/:', 'macbook-max' if os.path.isdir(os.path.join(ROOT, 'delivery', 'macbook-max')) else 'MISSING')


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'stage'
    sd = int(sys.argv[2]) if len(sys.argv) > 2 else 20260909
    if mode == 'stage':
        stage(sd)
    elif mode == 'restore':
        restore(sd)
    else:
        print('usage: ab-stage.py stage|restore [seed]')
        sys.exit(1)
