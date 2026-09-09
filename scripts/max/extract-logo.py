#!/usr/bin/env python3
"""从官方俯视图提取 Apple logo 轮廓（零依赖分析脚本，产物 = JSON 多边形）。
方法：阈值分割 → 连通域 → Moore 边界跟踪 → 弦高简化 → Chaikin 平滑。
输出：reference/macbook/logo-outline.json（归一化到 bbox [0,1]²，y 向下）
"""
import json, math, sys
from PIL import Image
import numpy as np

SRC = 'reference/macbook/img/official-mbp14-dimensions-1.jpg'
OUT = 'reference/macbook/logo-outline.json'


def load_mask():
    im = Image.open(SRC).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    lum = a.mean(axis=2)
    # logo 区域：机身内、暗
    sub = lum[200:380, 340:540]
    m = sub < 90
    return m


def components(m):
    h, w = m.shape
    seen = np.zeros_like(m, dtype=bool)
    comps = []
    for y in range(h):
        for x in range(w):
            if m[y, x] and not seen[y, x]:
                stack = [(y, x)]
                seen[y, x] = True
                cells = []
                while stack:
                    cy, cx = stack.pop()
                    cells.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True
                                stack.append((ny, nx))
                comps.append(cells)
    comps.sort(key=len, reverse=True)
    return comps


def trace(cells):
    """Moore 邻域边界跟踪 → 闭合多边形（像素坐标）"""
    s = set(cells)
    start = min(cells, key=lambda p: (p[0], p[1]))
    # 起点左侧必为空 → 起始方向向东
    dirs = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]
    poly = [start]
    cur = start
    d = 0
    for _ in range(20000):
        found = False
        for k in range(8):
            nd = (d + 6 + k) % 8  # 从上一方向的后退方向开始找
            ny, nx = cur[0] + dirs[nd][0], cur[1] + dirs[nd][1]
            if (ny, nx) in s:
                cur = (ny, nx)
                d = nd
                poly.append(cur)
                found = True
                break
        if not found:
            break
        if cur == start and len(poly) > 4:
            break
    return poly


def chord_simplify(poly, tol=0.6):
    """按弦高误差简化（保留形状）"""
    if len(poly) < 4:
        return poly
    out = [poly[0]]
    i = 0
    n = len(poly)
    while i < n - 1:
        j = min(i + 2, n - 1)
        best = j
        # 贪心：向前扩展直到偏差超限
        while j < n - 1:
            ax, ay = poly[i]
            bx, by = poly[j]
            seg = math.hypot(bx - ax, by - ay)
            if seg < 1e-6:
                j += 1
                continue
            maxd = 0.0
            for k in range(i + 1, j):
                px, py = poly[k]
                d = abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / seg
                maxd = max(maxd, d)
            if maxd > tol:
                break
            best = j
            j += 1
        out.append(poly[best])
        i = best
    return out


def chaikin(poly, iters=2):
    for _ in range(iters):
        new = []
        n = len(poly)
        for i in range(n):
            p, q = poly[i], poly[(i + 1) % n]
            new.append((0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]))
            new.append((0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]))
        poly = new
    return poly


def main():
    m = load_mask()
    comps = components(m)
    if len(comps) < 2:
        print('未找到两个连通域（果身+叶）', file=sys.stderr)
        sys.exit(1)
    body, leaf = comps[0], comps[1]
    print(f'果身 {len(body)} px, 叶 {len(leaf)} px')
    pb = trace(body)
    pl = trace(leaf)
    pb = chaikin(chord_simplify(pb, 0.75), 4)
    pl = chaikin(chord_simplify(pl, 0.75), 4)
    allp = pb + pl
    ys = [p[0] for p in allp]; xs = [p[1] for p in allp]
    y0, y1, x0, x1 = min(ys), max(ys), min(xs), max(xs)
    h = y1 - y0; w = x1 - x0
    def norm(poly):
        return [[round((p[1] - x0) / w, 5), round((p[0] - y0) / h, 5)] for p in poly]
    data = {
        'source': SRC,
        'note': 'Apple logo 轮廓，归一化到 bbox [0,1]^2，x 右、y 下（图像坐标）',
        'aspect_wh': round(w / h, 5),
        'body': norm(pb),
        'leaf': norm(pl),
    }
    with open(OUT, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print(f'写入 {OUT}: body {len(pb)} 点, leaf {len(pl)} 点, aspect {data["aspect_wh"]:.3f}')


if __name__ == '__main__':
    main()
