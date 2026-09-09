#!/usr/bin/env python3
"""check-screen.py — 跨视角屏幕内容一致性自检（逐视角与贴图核对，内容空间比对）

真机同一块面板，任何视角看到的都必须是同一张桌面内容。做法：页面 __photo.screenQuad()
给出屏幕活动区四角在当前视口的像素坐标 + UV → 解出 内容空间→屏幕 的单应 H →
把贴图逐点前向映射到该视角的可见像素上 → 与该视角的实际渲染像素比对。
每个视角都通过 = 所有视角看到的必然是同一张桌面（传递性）。
用法：python3 scripts/max/check-screen.py <page-shots.json> [corr阈值,默认0.55]
"""
import json
import sys

import numpy as np
from PIL import Image

CW, CH = 320, 208          # 内容空间（桌面贴图）比对分辨率
STEP = 3                   # 内容空间采样步长


def homography(src, dst):
    """4 组对应点精确解 H（src/dst 各 4 个 (x,y)）"""
    A = []
    for (x, y), (X, Y) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -X * x, -X * y, -X])
        A.append([0, 0, 0, x, y, 1, -Y * x, -Y * y, -Y])
    A = np.array(A, float)
    _, _, Vt = np.linalg.svd(A)
    return Vt[-1].reshape(3, 3)


def sample_bilinear(im, xs, ys):
    a = np.asarray(im.convert('RGB'), float)
    h, w, _ = a.shape
    x0 = np.floor(xs).astype(int)
    y0 = np.floor(ys).astype(int)
    fx = (xs - x0)[:, None]
    fy = (ys - y0)[:, None]
    x1 = np.clip(x0 + 1, 0, w - 1)
    y1 = np.clip(y0 + 1, 0, h - 1)
    x0 = np.clip(x0, 0, w - 1)
    y0 = np.clip(y0, 0, h - 1)
    return (a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x1] * fx * (1 - fy)
            + a[y1, x0] * (1 - fx) * fy + a[y1, x1] * fx * fy)


def main():
    path = sys.argv[1]
    thr = float(sys.argv[2]) if len(sys.argv) > 2 else 0.55
    raw = open(path).read()
    data = json.loads(raw[raw.index('{'):])   # 容忍前置日志行（page-shots 会打印自检信息）
    shots = data['shots'] if isinstance(data, dict) else data
    tex = Image.open('web/draw/screen-ui.png').convert('RGB').resize((CW, CH), Image.LANCZOS)
    texa = np.asarray(tex, float)
    entries = [e for e in shots if e.get('screenQuad')]
    if not entries:
        print('screenQuad: 无视角可见屏幕')
        return 0
    bad = 0
    print(f'内容空间 {CW}×{CH} · 阈值 corr≥{thr:.2f}')
    for e in entries:
        im = Image.open(e['file']).convert('RGB')
        W, H = im.size
        by = {(round(c['u']), round(c['v'])): (c['px'], c['py']) for c in e['screenQuad']}
        if len(by) != 4:
            print(f"{e['view']:12s} 四角不完整 → 跳过")
            continue
        # 内容图像坐标：(0,0)=UV(0,1) 左上，(CW,CH)=UV(1,0) 右下（three.js flipY=true）
        src = [(0, 0), (0, CH), (CW, CH), (CW, 0)]
        dst = [by[(0, 1)], by[(0, 0)], by[(1, 0)], by[(1, 1)]]
        Hm = homography(src, dst)
        # 前向映射内容像素 → 屏幕像素，只保留落在画布内的
        ys, xs = np.mgrid[0:CH:STEP, 0:CW:STEP]
        pts = np.stack([xs.ravel(), ys.ravel(), np.ones(xs.size)], 1)
        q = pts @ Hm.T
        px = q[:, 0] / q[:, 2]
        py = q[:, 1] / q[:, 2]
        inside = (px >= 0) & (px < W - 1) & (py >= 0) & (py < H - 1)
        if inside.sum() < 200:
            print(f"{e['view']:12s} 可见屏幕过小（{inside.sum()} 采样点）→ 跳过")
            continue
        rendered = sample_bilinear(im, px[inside], py[inside])
        content = texa[ys.ravel()[inside], xs.ravel()[inside]]
        a = rendered - rendered.mean()
        b = content - content.mean()
        corr = float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum()))
        mad = float(np.abs(rendered - content).mean())
        # 色偏方向（渲染偏暖/偏冷）
        drift = (rendered.mean(0) - content.mean(0)).round(1)
        flag = 'OK' if corr >= thr else 'MISMATCH'
        if flag == 'MISMATCH':
            bad += 1
        print(f"{e['view']:12s} 采样 {inside.sum():5d} 点  corr {corr:+.3f}  |Δ| {mad:5.1f}  ΔRGB {drift}  {flag}")
    print('结论：' + ('所有视角屏幕内容 = 同一张贴图 ✓' if bad == 0 else f'{bad} 个视角与贴图不符 —— 必须修'))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
