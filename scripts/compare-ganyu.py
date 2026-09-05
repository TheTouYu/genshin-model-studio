#!/usr/bin/env python3
"""compare-ganyu.py — 量化验收：模型正视剪影 vs 参考正面剪影（IoU + 宽度曲线误差）。

方法：两边剪影各自 bbox 裁剪 → 统一高度 640、保持宽高比 → 按中心对齐到同一画布 → IoU；
宽度曲线用「宽度/剪影高度」比值（消除分辨率与拉伸差异），逐高度对比误差。
"""
import numpy as np
from PIL import Image

def mask_ref(img):
    a = np.asarray(img.convert('RGB')).astype(np.int16)
    bg = np.concatenate([a[:4, :4].reshape(-1,3), a[:4,-4:].reshape(-1,3), a[-4:,:4].reshape(-1,3), a[-4:,-4:].reshape(-1,3)]).mean(axis=0)
    return (np.abs(a - bg).max(axis=2) > 40)

def mask_model(img):
    m = np.asarray(img.convert('RGB')).astype(int).mean(axis=2) > 15
    m[:12, :] = False; m[-12:, :] = False; m[:, :12] = False; m[:, -12:] = False  # 去边沿噪点
    return m

def clean(m):
    m = m.copy()
    H, W = m.shape
    cnt_c = m.sum(axis=0); cnt_r = m.sum(axis=1)
    # 细坐标轴/网格线：前后景占比高但左右邻居几乎为空（孤立细线）
    for x in range(W):
        c = cnt_c[x]
        if c > 0.7 * H and (x == 0 or cnt_c[x-1] < 0.2 * H) or (x > 0 and c > 0.7 * H and (x == W-1 or cnt_c[x+1] < 0.2 * H)):
            m[:, x] = False
    for y in range(H):
        c = cnt_r[y]
        if c > 0.7 * W and (y == 0 or cnt_r[y-1] < 0.2 * W) or (y > 0 and c > 0.7 * W and (y == H-1 or cnt_r[y+1] < 0.2 * W)):
            m[y] = False
    return m

def bbox(m):
    colcnt = m.sum(axis=0); rowcnt = m.sum(axis=1)
    xs = np.where(colcnt > 40)[0]; ys = np.where(rowcnt > 5)[0]
    return xs.min(), ys.min(), xs.max(), ys.max()

def norm_mask(m, H=640):
    m = clean(m)
    x0, y0, x1, y1 = bbox(m)
    crop = m[y0:y1+1, x0:x1+1]
    hc, wc = crop.shape
    W = max(1, int(round(wc * H / hc)))
    im = Image.fromarray((crop*255).astype(np.uint8)).resize((W, H), Image.NEAREST)
    return (np.asarray(im) > 127)

def width_profile(m, H=640, n=20):
    out = []
    for i in range(n):
        y = int((H-1) * (n-1-i) / (n-1))
        xs = np.where(m[y])[0]
        out.append(0.0 if len(xs)==0 else (xs.max()-xs.min()+1) / H)
    return out

def center_pad(m, W, H=640):
    out = np.zeros((H, W), bool)
    x = (W - m.shape[1]) // 2
    out[:, x:x+m.shape[1]] = m
    return out

def main():
    ref = Image.open('reference/ganyu-front.png')
    model = Image.open('/tmp/ganyu-v13/view-front-clean.png')
    nr = norm_mask(mask_ref(ref))
    nm = norm_mask(mask_model(model))
    W = max(nr.shape[1], nm.shape[1])
    nr2, nm2 = center_pad(nr, W), center_pad(nm, W)
    iou = (nr2 & nm2).sum() / ((nr2 | nm2).sum() or 1)
    pr, pm = width_profile(nr), width_profile(nm)
    errs = [abs(a-b)/max(a, 1e-6) for a, b in zip(pr, pm)]
    avg_err = sum(errs)/len(errs); max_err = max(errs)
    print(f"IOU={iou:.4f}")
    print(f"WIDTH_AVG_ERR={avg_err*100:.1f}%  WIDTH_MAX_ERR={max_err*100:.1f}%")
    for i, (a, b, e) in enumerate(zip(pr, pm, errs)):
        print(f"  h={(i+0.5)/20:.2f} ref={a:.3f} model={b:.3f} err={e*100:.1f}%")
    vis = np.zeros((640, W*2+10, 3), np.uint8)
    vis[:, :W][nr2] = [60,120,255]
    vis[:, W+10:W*2+10][nm2] = [255,120,60]
    Image.fromarray(vis).resize((min(1200, vis.shape[1]), 640), Image.NEAREST).save('reference/iou-vis-v10.png')

if __name__ == '__main__':
    main()
