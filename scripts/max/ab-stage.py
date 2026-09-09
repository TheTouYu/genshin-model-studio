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
    # 协议 v7：6 张**各自不同画布尺寸**（v6 教训：我方 6 张同尺寸 → 判官按尺寸聚类）。
    # 尺寸与配对参考图的画幅比对齐；背景 3 白 / 2 暗 / 1 灰，两侧同分布。
    ('macbook-v7w/p1-closedtop',   NEWREF + '俯视图.png'),              # 900x724  AR 1.243（参考 433x348）
    ('macbook-v7w/p2-screenfront', NEWREF + '正视图.png'),              # 1000x627 AR 1.595（参考 528x331）
    ('macbook-v7w/p3-kb',          NEWREF + '键盘和触控板.png'),        # 880x680  AR 1.294（参考 490x379）
    ('macbook-v7d/p4-ports',       'reference/macbook/img/official-mbp14-ports-1.jpg'),   # 1180x395 AR 2.987
    ('macbook-v7d/p5-hero',        'reference/macbook/img/official-mbp14-hero.jpg'),      # 860x520  AR 1.654
    ('macbook-v7g/p6-bottom',      'reference/macbook/img/apple-mbp13-bottom-case-official.jpg'),  # 880x600
]


def build_set(seed):
    """确定性生成混排集合（同 seed → 同映射），返回 key。"""
    rnd = random.Random(seed)
    items = []
    for name, ref in PAIRS:
        items.append(('render', os.path.join(ROOT, 'delivery', name + '.png'), name))
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
    for src, hold in (('macbook-max', '.mhold'), ('macbook-page', '.mhold-page'), ('macbook-gia', '.mhold-gia'),
                      ('macbook-v7w', '.mhold-v7w'), ('macbook-v7d', '.mhold-v7d'), ('macbook-v7g', '.mhold-v7g'),
                      ('macbook-v6w', '.mhold-v6w'), ('macbook-v6d', '.mhold-v6d')):
        a, h = os.path.join(ROOT, 'delivery', src), os.path.join(ROOT, 'delivery', hold)
        if os.path.isdir(a) and not os.path.isdir(h):
            os.rename(a, h)
    # 隐藏自查材料（对比图/调色扫描里直接标着哪张是我渲染的）
    for src, hold in (('.scratch/max', '.scratch/.maxhold'), ('.scratch/r6', '.scratch/.r6hold')):
        a, h = os.path.join(ROOT, src), os.path.join(ROOT, hold)
        if os.path.isdir(a) and not os.path.isdir(h):
            os.rename(a, h)
    rub = os.path.join(ROOT, 'docs', 'macbook-max-rubric.md')
    if os.path.exists(rub):
        os.rename(rub, os.path.join(ROOT, 'docs', '.mrubric.md'))
    for pf in ('AB-PROTOCOL-v7.md', 'AB-PROTOCOL-v6.md', 'AB-PROTOCOL-v5.md', 'AB-PROTOCOL-v4.md'):
        a2 = os.path.join(ROOT, 'delivery', pf)
        if os.path.exists(a2):
            os.rename(a2, os.path.join(ROOT, 'delivery', '.' + pf))
    print(f'staged {d} ({len(key)} images, re-encoded)')
    print(f'key deleted ({KEY}); regenerate deterministically with: ab-stage.py restore {seed}')
    print('held: delivery/.mhold* , docs/.mrubric.md')


def restore(seed):
    d = os.path.join(ROOT, f'.blind-{seed}')
    if os.path.isdir(d):
        shutil.rmtree(d)
    for hold, tgt in (('.mhold', 'macbook-max'), ('.mhold-page', 'macbook-page'), ('.mhold-gia', 'macbook-gia'),
                      ('.mhold-v7w', 'macbook-v7w'), ('.mhold-v7d', 'macbook-v7d'), ('.mhold-v7g', 'macbook-v7g'),
                      ('.mhold-v6w', 'macbook-v6w'), ('.mhold-v6d', 'macbook-v6d')):
        h, t = os.path.join(ROOT, 'delivery', hold), os.path.join(ROOT, 'delivery', tgt)
        if not os.path.isdir(h):
            continue
        if os.path.isdir(t):
            for f in os.listdir(h):          # 合并（渲染任务可能已重建目标目录）
                shutil.move(os.path.join(h, f), os.path.join(t, f))
            shutil.rmtree(h)
        else:
            os.rename(h, t)
    for hn, tn in (('.maxhold', 'max'), ('.r6hold', 'r6')):
        hm = os.path.join(ROOT, '.scratch', hn)
        if os.path.isdir(hm) and not os.path.isdir(os.path.join(ROOT, '.scratch', tn)):
            os.rename(hm, os.path.join(ROOT, '.scratch', tn))
    rub = os.path.join(ROOT, 'docs', '.mrubric.md')
    if os.path.exists(rub):
        os.rename(rub, os.path.join(ROOT, 'docs', 'macbook-max-rubric.md'))
    for pf in ('AB-PROTOCOL-v7.md', 'AB-PROTOCOL-v6.md', 'AB-PROTOCOL-v5.md', 'AB-PROTOCOL-v4.md'):
        a2 = os.path.join(ROOT, 'delivery', '.' + pf)
        if os.path.exists(a2):
            os.rename(a2, os.path.join(ROOT, 'delivery', pf))
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
