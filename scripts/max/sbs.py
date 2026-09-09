#!/usr/bin/env python3
"""并排对比：参考图 | 渲染图（按机身宽度归一化）"""
import sys
import numpy as np
from PIL import Image

def bbox(img, thr=14):
    a = np.asarray(img.convert('RGB')).astype(np.float32).mean(axis=2)
    m = a > thr
    ys, xs = np.where(m)
    return xs.min(), ys.min(), xs.max(), ys.max()

def norm(img, target_w):
    x0, y0, x1, y1 = bbox(img)
    crop = img.crop((x0, y0, x1 + 1, y1 + 1))
    s = target_w / crop.width
    return crop.resize((int(crop.width * s), int(crop.height * s)), Image.LANCZOS)

def main():
    ref_path, ren_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
    W = int(sys.argv[4]) if len(sys.argv) > 4 else 760
    ref = norm(Image.open(ref_path), W)
    ren = norm(Image.open(ren_path), W)
    H = max(ref.height, ren.height)
    canvas = Image.new('RGB', (W * 2 + 24, H + 8), (10, 10, 10))
    canvas.paste(ref, (0, 4))
    canvas.paste(ren, (W + 24, 4))
    canvas.save(out)
    print(f'{out}: ref {ref.size} | render {ren.size}')

if __name__ == '__main__':
    main()
