#!/usr/bin/env python3
"""kb-row-measure.py —— 键位对齐取证（#3）：在「参考图」与「我的渲染」上量同一行键帽中心，逐键对比。

用法：
  .venv/bin/python scripts/max/kb-row-measure.py ref  <图片> <px_per_mm>
  .venv/bin/python scripts/max/kb-row-measure.py mine <图片> <px_per_mm>

做法：键帽 = 暗连通域（参考图与我的渲染里键帽都比甲板暗），按 y 聚类成行；
输出每行键帽的 (x 中心 mm, 宽 mm)，原点取该行最左键帽中心。
"""
import sys
from collections import deque

import numpy as np
from PIL import Image


def caps(img, thr=120):
    dark = img < thr
    H, W = dark.shape
    lbl = np.zeros_like(dark, np.int32)
    cur = 0
    out = []
    for y in range(H):
        for x in range(W):
            if not dark[y, x] or lbl[y, x]:
                continue
            cur += 1
            q = deque([(y, x)]); lbl[y, x] = cur
            ys, xs = [], []
            while q:
                cy, cx = q.popleft(); ys.append(cy); xs.append(cx)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < H and 0 <= nx < W and dark[ny, nx] and not lbl[ny, nx]:
                        lbl[ny, nx] = cur; q.append((ny, nx))
            h = max(ys) - min(ys) + 1; w = max(xs) - min(xs) + 1
            if h >= 14 and w >= 14:
                out.append({'cy': (min(ys) + max(ys)) / 2, 'cx': (min(xs) + max(xs)) / 2, 'w': w, 'h': h})
    return out


def main():
    mode, path, ppm = sys.argv[1], sys.argv[2], float(sys.argv[3])
    img = np.asarray(Image.open(path).convert('L')).astype(float)
    cs = caps(img)
    # 只保留"键帽尺寸"的块：宽 12..110mm 且高 8..20mm（滤掉触控板/井/大黑块）
    cs = [c for c in cs if 12 * ppm / 2 <= c['w'] <= 110 * ppm and 8 * ppm <= c['h'] <= 20 * ppm]
    # 行聚类
    cs.sort(key=lambda c: c['cy'])
    rows = []
    for c in cs:
        if rows and abs(rows[-1][-1]['cy'] - c['cy']) < 0.45 * max(c['h'], rows[-1][-1]['h']):
            rows[-1].append(c)
        else:
            rows.append([c])
    rows = [r for r in rows if len(r) >= 6]
    print(f'== {mode} ({path}, {ppm} px/mm) 检出 {len(cs)} 键帽 / {len(rows)} 行 ==')
    for ri, r in enumerate(rows):
        r.sort(key=lambda c: c['cx'])
        x0 = r[0]['cx']
        parts = [f"{(c['cx']-x0)/ppm:7.2f}({c['w']/ppm:5.2f})" for c in r]
        print(f'  行{ri} [{len(r)}键] 相对x(宽): ' + ' '.join(parts))


if __name__ == '__main__':
    main()
