#!/usr/bin/env python3
"""像素指纹对照：真机参考图 vs 渲染图（评委法证指标）
指标：
  luma_sd      平坦区亮度噪声标准差
  chroma_ratio 平坦区色度噪声/亮度噪声（真图 ≈0.005–0.02）
  cov_RG       R-G 噪声相关系数
  v8_ratio     变差函数 γ(8)/mean(γ(1..7)) —— JPEG 8×8 块相位尖峰
  edge8_ratio  8 像素网格边界梯度 / 非边界梯度 —— 块效应直读
"""
import sys
import numpy as np
from PIL import Image


def luma(a):
    return 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]


def metric(path, maxlag=16):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    g = luma(a)
    gy, gx = np.gradient(g)
    mag = np.hypot(gx, gy)
    flat = mag < np.percentile(mag, 35)

    def resid(ch):
        p = np.pad(ch, 1, mode='edge')
        m3 = (p[:-2, :-2] + p[:-2, 1:-1] + p[:-2, 2:] +
              p[1:-1, :-2] + p[1:-1, 1:-1] + p[1:-1, 2:] +
              p[2:, :-2] + p[2:, 1:-1] + p[2:, 2:]) / 9.0
        return p[1:-1, 1:-1] - m3

    r, gg, b = resid(a[:, :, 0]), resid(a[:, :, 1]), resid(a[:, :, 2])
    m = flat
    if m.sum() < 200:
        m = np.ones_like(r, dtype=bool)
    luma_r = (r[m] + gg[m] + b[m]) / 3
    cb = b[m] - luma_r
    cr = r[m] - luma_r
    sd_l = float(np.std(luma_r)) + 1e-9
    sd_c = float(np.std((cb + cr) / 2))
    cov = float(np.corrcoef(r[m], gg[m])[0, 1]) if len(r[m]) > 10 else float('nan')

    # 变差函数（水平方向，整幅）
    var = np.zeros(maxlag + 1)
    cnt = np.zeros(maxlag + 1)
    for k in range(1, maxlag + 1):
        d = g[:, k:] - g[:, :-k]
        var[k] = float(np.mean(d * d))
        cnt[k] = d.size
    v8 = var[8] / (np.mean(var[1:8]) + 1e-12)

    # 8 像素网格边界梯度（水平方向，列边界 x≡0 mod 8）
    d = np.abs(np.diff(g, axis=1))
    col = np.arange(d.shape[1]) + 1
    on = d[:, (col % 8) == 0]
    off = d[:, (col % 8) != 0]
    edge8 = float(on.mean() / (off.mean() + 1e-12))

    return dict(file=path.split('/')[-1][:34], wh=f'{w}x{h}',
                luma_sd=round(sd_l, 3), chroma_ratio=round(sd_c / sd_l, 4),
                cov_RG=round(cov, 3), v8_ratio=round(float(v8), 3),
                edge8_ratio=round(edge8, 3))


if __name__ == '__main__':
    rows = [metric(p) for p in sys.argv[1:]]
    if not rows:
        sys.exit(1)
    keys = list(rows[0].keys())
    wd = {k: max(len(k), max(len(str(r[k])) for r in rows)) for k in keys}
    print('  '.join(k.ljust(wd[k]) for k in keys))
    for r in rows:
        print('  '.join(str(r[k]).ljust(wd[k]) for k in keys))
