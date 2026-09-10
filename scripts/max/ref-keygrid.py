#!/usr/bin/env python3
"""ref-keygrid.py —— 从官方正交俯视图 `apple-mbp13-top-case-official.png` 提取**键帽栅格真值**。

用途（一次测量、两个问题一起解决）：
  1. #3 键位偏移：把键帽中心换算成 mm（相对键盘块中心），与我的 spec KB_ROWS 计算出的键心逐键对比；
  2. #7/#2 字标：为底行文字键（esc/tab/caps/shift/control/option/command/return/delete/fn）
     提供**未裁切**的字形掩膜（图集里这些键的矩形被裁掉了尾字母，渲染成 "contro"/"comman"）。

标定：官方图 px_per_mm = 4.7244（由键帽 82px = 17.36mm 与列距 90px = 19.05mm 双重确认）。
键帽 = 暗块（<120）连通域，尺寸带 55..230px。
输出：`.scratch/max/ref-keygrid.json`（每个键帽的 mm 中心/尺寸）与 `.scratch/max/words/*.png`（文字键掩膜）。
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) + '/'
REF = ROOT + 'reference/macbook/img/apple-mbp13-top-case-official.png'
OUTJ = ROOT + '.scratch/max/ref-keygrid.json'
OUTW = ROOT + '.scratch/max/words'
PPM = 4.7244          # px per mm（官方 top-case 标定）
KEY_W, KEY_H = 17.25, 16.93
PITCH_X, PITCH_Y = 19.05, 18.5

# 13" 键位（US）：列宽单位 u；与我的 spec KB_ROWS 同序，用于把键帽映射到键名
ROWS = [
    (['esc'] + ['F%d' % i for i in range(1, 13)] + ['touchid'], [1.0] * 14),
    (['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'delete'], [1] * 13 + [2]),
    (['tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'], [1.5] + [1] * 12 + [1.5]),
    (['caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'return'], [1.75] + [1] * 11 + [2.25]),
    (['lshift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'rshift'], [2.25] + [1] * 10 + [2.75]),
    (['fn', 'control', 'option', 'lcommand', 'space', 'rcommand', 'option', 'left', 'down', 'right'],
     [1.0, 1.0, 1.0, 1.25, 5.0, 1.25, 1.0, 0.5, 0.5, 0.5]),
]
WORDS = {'esc', 'tab', 'caps', 'shift', 'control', 'option', 'command', 'return', 'delete', 'fn',
         'lshift', 'rshift', 'lcommand', 'rcommand'}


def keycaps(img):
    dark = img < 120
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
            if 40 <= h <= 130 and 40 <= w <= 230:
                out.append({'y0': min(ys), 'x0': min(xs), 'y1': max(ys), 'x1': max(xs),
                            'cy': (min(ys) + max(ys)) / 2, 'cx': (min(xs) + max(xs)) / 2,
                            'w': w, 'h': h})
    return out


def main():
    img = np.asarray(Image.open(REF).convert('L')).astype(float)
    caps = keycaps(img)
    # 行聚类（按 cy，容差 8px）
    caps.sort(key=lambda c: c['cy'])
    rows = []
    for c in caps:
        if rows and abs(rows[-1][-1]['cy'] - c['cy']) < 8:
            rows[-1].append(c)
        else:
            rows.append([c])
    print('键帽 %d 个 / %d 行（尺寸中位 %.1f×%.1f px = %.2f×%.2f mm）' % (
        len(caps), len(rows), np.median([c['w'] for c in caps]), np.median([c['h'] for c in caps]),
        np.median([c['w'] for c in caps]) / PPM, np.median([c['h'] for c in caps]) / PPM))
    # 键盘块中心（所有键帽的包围盒中心）作为原点
    x0 = min(c['x0'] for c in caps); x1 = max(c['x1'] for c in caps)
    y0 = min(c['y0'] for c in caps); y1 = max(c['y1'] for c in caps)
    ox, oy = (x0 + x1) / 2, (y0 + y1) / 2
    print('键盘块 %.2f × %.2f mm' % ((x1 - x0 + 1) / PPM, (y1 - y0 + 1) / PPM))

    grid = []
    for ri, row in enumerate(rows):
        row.sort(key=lambda c: c['cx'])
        names = ROWS[ri][0] if ri < len(ROWS) else []
        units = ROWS[ri][1] if ri < len(ROWS) else []
        exp = []
        if names:
            tot = sum(units)
            x = -tot * PITCH_X / 2
            for n, u in zip(names, units):
                exp.append((n, x + u * PITCH_X / 2, u))
                x += u * PITCH_X
        print('  行%d: %d 键  期望 %d 键' % (ri, len(row), len(exp)))
        for c in row:
            mx = (c['cx'] - ox) / PPM
            my = (c['cy'] - oy) / PPM
            hit = None
            for n, ex, u in exp:
                if abs(ex - mx) < 6:
                    hit = (n, ex, u); break
            grid.append({'row': ri, 'x_mm': round(mx, 2), 'z_mm': round(my, 2),
                         'w_mm': round(c['w'] / PPM, 2), 'h_mm': round(c['h'] / PPM, 2),
                         'key': hit[0] if hit else None, 'dx_mm': round(mx - hit[1], 2) if hit else None,
                         'u': hit[2] if hit else None})
    os.makedirs(os.path.dirname(OUTJ), exist_ok=True)
    json.dump({'ppm': PPM, 'origin_px': [ox, oy], 'keys': grid}, open(OUTJ, 'w'), indent=1)
    print('写出', OUTJ)

    # 文字键掩膜
    os.makedirs(OUTW, exist_ok=True)
    made = 0
    for c in caps:
        mx, my = (c['cx'] - ox) / PPM, (c['cy'] - oy) / PPM
        name = None
        for g in grid:
            if abs(g['x_mm'] - mx) < 0.6 and abs(g['z_mm'] - my) < 0.6:
                name = g['key']
        if not name or name not in WORDS:
            continue
        iw, ih = c['x1'] - c['x0'] + 1, c['y1'] - c['y0'] + 1
        sub = img[c['y0']:c['y1'] + 1, c['x0']:c['x1'] + 1]
        inner = sub[int(ih * 0.14):ih - int(ih * 0.14), int(iw * 0.05):iw - int(iw * 0.05)]
        mask = (inner > 150)
        # 去掉贴住裁剪边界的连通块（那是键帽边缘高光/邻键渗色，不是字标）
        hh, ww = mask.shape
        lbl2 = np.zeros((hh, ww), np.int32)
        cur2 = 0
        for y in range(hh):
            for x in range(ww):
                if not mask[y, x] or lbl2[y, x]:
                    continue
                cur2 += 1
                q = deque([(y, x)]); lbl2[y, x] = cur2
                comp = []
                while q:
                    cy, cx = q.popleft(); comp.append((cy, cx))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < hh and 0 <= nx < ww and mask[ny, nx] and not lbl2[ny, nx]:
                            lbl2[ny, nx] = cur2; q.append((ny, nx))
                if any(cy in (0, hh - 1) or cx in (0, ww - 1) for cy, cx in comp):
                    for cy, cx in comp:
                        mask[cy, cx] = False
        ys, xs = np.where(mask)
        if len(xs) < 12:
            continue
        m = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        Image.fromarray((m * 255).astype(np.uint8), 'L').save('%s/%s.png' % (OUTW, name))
        made += 1
        print('  字标 %-10s %.2f × %.2f mm' % (name, m.shape[1] / PPM, m.shape[0] / PPM))
    print('写出 %d 个字标掩膜到 %s' % (made, OUTW))


if __name__ == '__main__':
    sys.exit(main())
