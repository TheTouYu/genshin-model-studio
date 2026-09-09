#!/usr/bin/env python3
"""噪声指纹：亮度/色度噪声比 + R-G 噪声协方差（真机照片 vs 路径追踪）"""
import sys
import numpy as np
from PIL import Image

def metric(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    # 平坦区域（局部梯度低）
    g = a.mean(axis=2)
    gy, gx = np.gradient(g)
    flat = np.hypot(gx, gy) < np.percentile(np.hypot(gx, gy), 35)
    # 高频残差（3x3 均值差）
    k = np.ones((3, 3)) / 9.0
    from numpy.lib.stride_tricks import sliding_window_view
    pad = np.pad(g, 1, mode='edge')
    mean3 = sliding_window_view(pad, (3, 3)).mean(axis=(2, 3))
    resid = g - mean3
    # 通道残差
    ch_res = []
    for c in range(3):
        p = np.pad(a[:, :, c], 1, mode='edge')
        m3 = sliding_window_view(p, (3, 3)).mean(axis=(2, 3))
        ch_res.append(p[1:-1, 1:-1] - m3)
    r, gg, b = ch_res
    m = flat[1:-1, 1:-1] if flat.shape[0] == r.shape[0] + 2 else flat
    if m.sum() < 100:
        m = np.ones_like(r, dtype=bool)
    luma = (r[m] + gg[m] + b[m]) / 3
    cb = b[m] - luma
    cr = r[m] - luma
    sd_l = float(np.std(luma)) + 1e-9
    sd_c = float(np.std((cb + cr) / 2))
    cov = float(np.corrcoef(r[m], gg[m])[0, 1]) if len(r[m]) > 10 else float('nan')
    return {'file': path.split('/')[-1], 'luma_sd': round(sd_l, 3), 'chroma_ratio': round(sd_c / sd_l, 3), 'cov_RG': round(cov, 3)}

if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(metric(p))
