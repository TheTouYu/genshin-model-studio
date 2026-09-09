#!/usr/bin/env python3
"""渲染图量测：非背景 bbox + 沿高度的亮度梯度（与参考图同法对比）"""
import sys
import numpy as np
from PIL import Image

def stats(path, bg_thr=None):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32).mean(axis=2)
    if bg_thr is None:
        bg = float(np.median(a[[0,0,-1,-1],[0,-1,0,-1]]))
        bg_thr = bg + 12
    m = a > bg_thr
    if m.sum() < 100:
        return {'path': path, 'empty': True, 'bg': bg}
    ys, xs = np.where(m)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    inside = a[m]
    grad = []
    for k in range(8):
        yy = int(y0 + (y1 - y0) * (k + 0.5) / 8)
        row = a[yy][m[yy]]
        grad.append(round(float(row.mean()), 1) if len(row) else None)
    return {
        'path': path, 'bg': round(bg,1), 'thr': round(bg_thr,1), 'bbox': [int(x0), int(y0), int(x1), int(y1)],
        'size': [int(x1 - x0 + 1), int(y1 - y0 + 1)],
        'p5': round(float(np.percentile(inside, 5)), 1),
        'p50': round(float(np.percentile(inside, 50)), 1),
        'p95': round(float(np.percentile(inside, 95)), 1),
        'mean': round(float(inside.mean()), 1),
        'gradient_top_to_bottom': grad,
    }

if __name__ == '__main__':
    import json
    for p in sys.argv[1:]:
        print(json.dumps(stats(p), ensure_ascii=False))
