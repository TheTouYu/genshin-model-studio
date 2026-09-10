#!/usr/bin/env python3
"""port-metric.py —— 开口"中段完整性"自动核验（哑铃类 bug 的机器判据）

配方（老师 2026-09-11 给，已实测标定）：
  dark  = gray < 0.45 * median(gray)      # 暗带像素
  hprof = 每列暗像素占比（高度剖面）
  pinch = min(hprof 中段 60%) / max(hprof)
  notch = 中心凹口检测：最小值位置 |pos-0.5|<0.15 且左右对称（±25% 段均值差 <10%）且 pinch<0.9

⚠ pinch 不是绝对门槛：用户无标注真机参考图也有 0.55~0.97（内舌/触点/反光本身造成起伏）。
   → 判缺陷看 notch（哑铃凹口在正中央且对称），或与**同口型参考图**的健康带比。
用法：python3 scripts/max/port-metric.py <img.png> [...]   （-v 打印剖面）
"""
import sys
import numpy as np
from PIL import Image


def metric(path, verbose=False, cw=0.55, ch=0.45):
    im = Image.open(path).convert('L')
    W, H = im.size
    if cw < 1.0 or ch < 1.0:      # 固定机位：开口在正中，取中心窗口
        bw, bh = int(W * cw), int(H * ch)
        im = im.crop(((W - bw) // 2, (H - bh) // 2, (W + bw) // 2, (H + bh) // 2))
    im.save('/tmp/.pm-crop.png')
    g = np.asarray(im).astype(float)
    med = float(np.median(g))
    bright = g > 0.45 * med           # 机身壁面（亮）
    dark = ~bright                     # 开口 + 背景都可能暗
    # 只在"机身壁面行"里找开口：否则黑背景会被当成一条巨大的暗带（实测踩过）
    rowb = bright.mean(axis=1)
    wall = rowb > 0.45
    if wall.sum() < 10:
        return None
    # 取包含最多壁面像素的连续行段
    best = cur = None
    for i, w in enumerate(wall):
        if w:
            cur = [i, i] if cur is None else [cur[0], i]
            if best is None or (cur[1] - cur[0]) > (best[1] - best[0]):
                best = cur
        else:
            cur = None
    wy0, wy1 = best
    sub = dark[wy0:wy1 + 1, :]
    cols = sub.sum(axis=0) / max(1, sub.shape[0])
    on = np.where(cols > 0.5)[0]      # 该列一半以上是暗 = 开口内部
    if len(on) < 5:
        return None
    x0, x1 = int(on.min()), int(on.max())
    band = sub[:, x0:x1 + 1]
    rows = band.sum(axis=1)
    ys = np.where(rows >= 0.5 * (x1 - x0 + 1))[0]
    y0, y1 = (int(ys.min()), int(ys.max())) if len(ys) else (0, band.shape[0] - 1)
    band = band[y0:y1 + 1, :]
    hprof = band.sum(axis=0) / max(1, band.shape[0])
    n = len(hprof)
    mid = hprof[int(0.2 * n):int(0.8 * n)]
    pinch = float(mid.min() / max(1e-6, hprof.max()))
    imin = int(np.argmin(hprof))
    pos = imin / max(1, n - 1)
    q = max(1, n // 4)
    sym = float(abs(hprof[:q].mean() - hprof[-q:].mean()) / max(1e-6, hprof.max()))
    # 端部与中段的对比（哑铃 = 两端饱满、中段凹）
    endm = (hprof[:max(1, n // 6)].max() + hprof[-max(1, n // 6):].max()) / 2
    notch = bool(pinch < 0.9 and abs(pos - 0.5) < 0.15 and sym < 0.10 and mid.mean() < 0.8 * endm)
    if verbose:
        prof = ''.join(' .:-=+*#%@'[min(9, int(v * 9.99))] for v in hprof[::max(1, n // 100)])
        print(f'    profile: {prof}')
    return dict(w=x1 - x0 + 1, h=y1 - y0 + 1, pinch=round(pinch, 3), minpos=round(pos, 2),
                sym=round(sym, 3), notch=notch)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    verbose = '-v' in sys.argv
    for p in args:
        r = metric(p, verbose)
        tag = 'DUMBBELL-NOTCH ✗' if (r and r['notch']) else 'ok' if r else 'no-opening'
        print(f'{p}: {r} -> {tag}')
