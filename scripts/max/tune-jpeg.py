#!/usr/bin/env python3
"""JPEG 伪影模拟参数标定：在已有渲染 PNG 上扫 quality × chroma_denoise，
使指纹命中真机参考图区间（edge8_ratio>1.1, chroma_ratio<0.02）。"""
import sys
import numpy as np
from PIL import Image

QY = np.array([
    16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99], dtype=np.float32).reshape(8, 8)
QC = np.array([
    17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99,
    24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99], dtype=np.float32).reshape(8, 8)

# 8x8 DCT-II 矩阵
n = np.arange(8)
D = np.cos((2 * n[:, None] + 1) * n[None, :] * np.pi / 16) * np.sqrt(2 / 8)
D[0] *= np.sqrt(0.5)


def dct2(b):
    return D @ b @ D.T


def idct2(b):
    return D.T @ b @ D


def plane_quant(plane, qt):
    h, w = plane.shape
    ph, pw = (-h) % 8, (-w) % 8
    p = np.pad(plane, ((0, ph), (0, pw)), mode='edge')
    H, W = p.shape
    blk = p.reshape(H // 8, 8, W // 8, 8).transpose(0, 2, 1, 3)
    coef = dct2(blk)
    coef = np.round(coef / qt) * qt
    out = idct2(coef).transpose(0, 2, 1, 3).reshape(H, W)
    return out[:h, :w]


def box3(a, w):
    p = np.pad(a, 1, mode='edge')
    s = np.zeros_like(a)
    for dy in range(3):
        for dx in range(3):
            s += p[dy:dy + a.shape[0], dx:dx + a.shape[1]]
    return a * (1 - w) + (s / 9.0) * w


def simulate(a, quality, cd):
    """a: HxWx3 in [0,1] display domain"""
    scale = (200 - 2 * quality) / 100 if quality >= 50 else 5000 / quality / 100
    qy, qc = np.maximum(1, np.round(QY * scale)), np.maximum(1, np.round(QC * scale))
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    Y = 0.299 * r + 0.587 * g + 0.114 * b
    Cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 0.5
    Cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 0.5
    if cd > 0:
        Cb, Cr = box3(Cb, cd), box3(Cr, cd)
    h, w = Y.shape
    cw, ch = (w + 1) // 2, (h + 1) // 2
    padv = np.pad(Cb, ((0, ch * 2 - h), (0, cw * 2 - w)), mode='edge')
    Cb2 = padv.reshape(ch, 2, cw, 2).mean(axis=(1, 3))
    padv = np.pad(Cr, ((0, ch * 2 - h), (0, cw * 2 - w)), mode='edge')
    Cr2 = padv.reshape(ch, 2, cw, 2).mean(axis=(1, 3))
    Y = plane_quant(Y, qy)
    Cb2 = plane_quant(Cb2, qc)
    Cr2 = plane_quant(Cr2, qc)
    # 双线性上采样
    yi = np.clip((np.arange(h) / 2 - 0.25), 0, ch - 1)
    xi = np.clip((np.arange(w) / 2 - 0.25), 0, cw - 1)
    y0, x0 = np.floor(yi).astype(int), np.floor(xi).astype(int)
    y1, x1 = np.minimum(ch - 1, y0 + 1), np.minimum(cw - 1, x0 + 1)
    ty, tx = (yi - y0)[:, None], (xi - x0)[None, :]
    def up(p):
        a0 = p[np.ix_(y0, x0)] * (1 - tx) + p[np.ix_(y0, x1)] * tx
        a1 = p[np.ix_(y1, x0)] * (1 - tx) + p[np.ix_(y1, x1)] * tx
        return a0 * (1 - ty) + a1 * ty
    cb, cr = up(Cb2) - 0.5, up(Cr2) - 0.5
    out = np.stack([Y + 1.402 * cr, Y - 0.344136 * cb - 0.714136 * cr, Y + 1.772 * cb], axis=2)
    return np.clip(out, 0, 1)


def fingerprint(a):
    g = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    gy, gx = np.gradient(g)
    mag = np.hypot(gx, gy)
    flat = mag < np.percentile(mag, 35)
    def resid(ch):
        p = np.pad(ch, 1, mode='edge')
        m3 = sum(p[dy:dy + ch.shape[0], dx:dx + ch.shape[1]] for dy in range(3) for dx in range(3)) / 9.0
        return p[1:-1, 1:-1] - m3
    r, gg, b = resid(a[:, :, 0]), resid(a[:, :, 1]), resid(a[:, :, 2])
    m = flat if flat.sum() > 200 else np.ones_like(r, dtype=bool)
    lr = (r[m] + gg[m] + b[m]) / 3
    sd_l = float(np.std(lr)) + 1e-9
    sd_c = float(np.std((b[m] - lr + r[m] - lr) / 2))
    d = np.abs(np.diff(g, axis=1))
    col = np.arange(d.shape[1]) + 1
    e8 = float(d[:, col % 8 == 0].mean() / (d[:, col % 8 != 0].mean() + 1e-12))
    var = [float(np.mean((g[:, k:] - g[:, :-k]) ** 2)) for k in range(1, 9)]
    v8 = var[7] / (np.mean(var[:7]) + 1e-12)
    return sd_l, sd_c / sd_l, e8, v8


if __name__ == '__main__':
    base = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32) / 255.0
    print('base', ['%.3f' % x for x in fingerprint(base)])
    for q in (88, 92, 94, 96, 98):
        for cd in (0.4, 0.8):
            out = simulate(base, q, cd)
            sd, cr, e8, v8 = fingerprint(out)
            print(f'q={q} cd={cd}  luma_sd={sd:5.2f} chroma_ratio={cr:.4f} edge8={e8:.3f} v8={v8:.3f}')
