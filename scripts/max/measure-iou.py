#!/usr/bin/env python3
"""同角度剪影 IoU：我方渲染 vs 参考图（对齐后）。用于评分表 C1-①。

用法：python3 scripts/max/measure-iou.py <mine.png> <ref.png> [thresh]
对齐方式：各自取非背景掩膜 → 裁到 bbox → 缩放到同一尺寸 → IoU。
"""
import sys
import numpy as np
from PIL import Image


def mask_of(path, thresh=None):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    # 背景 = 四角中位色
    corners = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3),
                              a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
    bg = np.median(corners, 0)
    d = np.abs(a - bg).max(2)
    t = thresh if thresh is not None else max(12.0, float(np.percentile(d, 99.5)) * 0.25)
    m = d > t
    # 去掉孤立噪声：只保留最大连通块（用简单的行列投影近似——目标都是单一主体）
    ys, xs = np.where(m)
    if len(ys) == 0:
        return m, (0, 0, im.width, im.height)
    return m, (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)


def crop_resize(m, box, size=(600, 600)):
    x0, y0, x1, y1 = box
    sub = m[y0:y1, x0:x1].astype(np.uint8) * 255
    im = Image.fromarray(sub).resize(size, Image.LANCZOS)
    return np.asarray(im).astype(np.float32) > 127


def main():
    mine, ref = sys.argv[1], sys.argv[2]
    th = float(sys.argv[3]) if len(sys.argv) > 3 else None
    m1, b1 = mask_of(mine, th)
    m2, b2 = mask_of(ref, th)
    # 保持各自长宽比：按 bbox 尺寸归一化到同一高度
    h = 600
    def norm(m, b):
        x0, y0, x1, y1 = b
        w = max(1, int(round((x1 - x0) * h / max(1, y1 - y0))))
        sub = m[y0:y1, x0:x1].astype(np.uint8) * 255
        return np.asarray(Image.fromarray(sub).resize((w, h), Image.LANCZOS)).astype(np.float32) > 127
    a, c = norm(m1, b1), norm(m2, b2)
    W = max(a.shape[1], c.shape[1])
    def pad(x):
        out = np.zeros((h, W), bool)
        off = (W - x.shape[1]) // 2
        out[:, off:off + x.shape[1]] = x
        return out
    a, c = pad(a), pad(c)
    inter = (a & c).sum()
    union = (a | c).sum()
    print(f'mine bbox {b1}  ref bbox {b2}')
    print(f'mine aspect {(b1[2]-b1[0])/max(1,b1[3]-b1[1]):.4f}  ref aspect {(b2[2]-b2[0])/max(1,b2[3]-b2[1]):.4f}')
    print(f'IoU = {inter/union:.4f}  (intersection {inter} / union {union})')


if __name__ == '__main__':
    main()
