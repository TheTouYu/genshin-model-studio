#!/usr/bin/env python3
"""compare-ganyu.py — 量化验收：模型正视剪影 vs 参考正面剪影（IoU + 宽度曲线误差）。"""
import sys
import numpy as np
from PIL import Image

def mask_ref(img):
    a = np.asarray(img.convert('RGB')).astype(np.int16)
    bg = np.concatenate([a[:4, :4].reshape(-1,3), a[:4,-4:].reshape(-1,3), a[-4:,:4].reshape(-1,3), a[-4:,-4:].reshape(-1,3)]).mean(axis=0)
    return (np.abs(a - bg).max(axis=2) > 40)

def mask_model(img):
    a = np.asarray(img.convert('RGB')).astype(int)
    return (a.mean(axis=2) > 45)

def bbox(m):
    ys, xs = np.where(m)
    return xs.min(), ys.min(), xs.max(), ys.max()

def clean(m):
    # 去掉网格/坐标轴全行/全列（前景占比 > 90% 视为辅助线）
    m = m.copy()
    H, W = m.shape
    rows = m.sum(axis=1)
    for y in range(H):
        if rows[y] > 0.9 * W: m[y] = False
    cols = m.sum(axis=0)
    for x in range(W):
        if cols[x] > 0.9 * H: m[:, x] = False
    return m

def norm_mask(m, W=220, H=640):
    m = clean(m)
    x0,y0,x1,y1 = bbox(m)
    crop = m[y0:y1+1, x0:x1+1]
    im = Image.fromarray((crop*255).astype(np.uint8)).resize((W,H), Image.NEAREST)
    return (np.asarray(im) > 127)

def width_profile(m, n=20):
    out = []
    H = m.shape[0]
    for i in range(n):
        y = int((H-1) * (n-1-i) / (n-1))  # 0=底
        xs = np.where(m[y])[0]
        out.append(0 if len(xs)==0 else (xs.max()-xs.min()+1)/m.shape[1])
    return out

def main():
    ref = Image.open('reference/ganyu-front.png')
    model = Image.open('/tmp/ganyu-v10/view-front.png')
    mr, mm = mask_ref(ref), mask_model(model)
    nr, nm = norm_mask(mr), norm_mask(mm)
    inter = (nr & nm).sum(); union = (nr | nm).sum()
    iou = inter / union
    pr, pm = width_profile(nr), width_profile(nm)
    errs = [abs(a-b)/max(a,1e-6) for a,b in zip(pr, pm)]
    avg_err = sum(errs)/len(errs)
    max_err = max(errs)
    # 默认分档对齐
    print(f"IOU={iou:.4f}")
    print(f"WIDTH_AVG_ERR={avg_err*100:.1f}%  WIDTH_MAX_ERR={max_err*100:.1f}%")
    for i,(a,b,e) in enumerate(zip(pr,pm,errs)):
        print(f"  h={ (i+0.5)/20:.2f} ref_w={a:.3f} model_w={b:.3f} err={e*100:.1f}%")
    # 保存对比掩码
    vis = np.zeros((640, 220*2+10, 3), np.uint8)
    vis[:, :220][nr] = [60,120,255]
    vis[:, 230:230+220][nm] = [255,120,60]
    Image.fromarray(vis).save('reference/iou-vis-v10.png')

if __name__ == '__main__':
    main()
