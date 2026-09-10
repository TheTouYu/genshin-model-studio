#!/usr/bin/env python3
"""measure-seam-ref.py —— 从官方侧视图量「闭合缝」的真实形态（判据来源）

用户三轮重复：「盖着的时候上下两面完全大小相等」「闭合成一条线」「官方严丝闭合」。
本脚本量真机侧视图在分缝处的**亮度剖面**，得出：
  - 机器上下沿像素位置（标定 px/mm）
  - 分缝暗线的行数 → 换算成 mm（V 型槽深度/暗带宽度）
对两张权威图各量一次，作为建模目标值。
"""
import sys
from PIL import Image

def profile(path, x0, x1, label, px_per_mm=None):
    im = Image.open(path).convert('L')
    W, H = im.size
    px = im.load()
    rows = []
    for y in range(H):
        s = 0
        for x in range(x0, x1):
            s += px[x, y]
        rows.append(s / (x1 - x0))
    bg = max(rows)
    thr = bg * 0.35
    top = next((y for y, v in enumerate(rows) if v > thr), None)
    bot = next((y for y in range(H - 1, -1, -1) if rows[y] > thr), None)
    print(f'\n== {label} ==  size {W}x{H}  band x[{x0},{x1})  bg(max row mean)={bg:.0f}')
    if top is None:
        print('  未找到机身（全暗？）'); return
    print(f'  机身顶沿 y={top}  底沿 y={bot}  高 {bot-top} px')
    if px_per_mm is None:
        px_per_mm = (bot - top) / 15.5
        print(f'  标定：整机高 15.5mm → {px_per_mm:.3f} px/mm')
    else:
        print(f'  用给定标定 {px_per_mm:.3f} px/mm')
    # 分缝：在顶沿下方 15%~45% 机身高度内找最暗行
    a, b = top + int((bot - top) * 0.15), top + int((bot - top) * 0.55)
    seg = [(y, rows[y]) for y in range(a, b + 1)]
    ymin, vmin = min(seg, key=lambda t: t[1])
    # 暗带宽度：连续低于 (vmin+ peak/2)/2 的行数
    mid = (vmin + max(rows[top:bot + 1])) / 2
    lo = ymin
    while lo > a and rows[lo - 1] < mid: lo -= 1
    hi = ymin
    while hi < b and rows[hi + 1] < mid: hi += 1
    print(f'  分缝最暗行 y={ymin} 亮度 {vmin:.0f}（亮面峰值 {max(rows[top:bot+1]):.0f}）')
    print(f'  暗带 y[{lo},{hi}] = {hi-lo+1} px = **{(hi-lo+1)/px_per_mm:.2f} mm**')
    print(f'  分缝距顶沿 {ymin-top} px = {(ymin-top)/px_per_mm:.2f} mm（真机上盖侧壁高 ≈3.97mm）')
    print('  逐行剖面（顶沿起 0..40px）：')
    for y in range(top, min(top + 41, H)):
        bar = '#' * int(rows[y] / 6)
        mark = '  <== 分缝' if y == ymin else ''
        print(f'    y+{y-top:2d}  {rows[y]:6.1f} {bar}{mark}')

if __name__ == '__main__':
    # 官方银机左壁侧视（reference/macbook/img/official-mbp14-ports-1.jpg，818x274）
    profile('reference/macbook/img/official-mbp14-ports-1.jpg', 430, 470, 'official-mbp14-ports-1.jpg（银/左壁）')
    # 用户给的官方截图（深空黑左壁，support.apple.com/zh-cn/121553）
    profile('/home/h/.dsh/attachments/v1/objects/8e/8e811d1cbfc68c48ab14ca9bcec6798de802001754b543ec31d71fb6c8727fe2', 600, 660, '用户图3：官方左壁（深空黑）')
    profile('/home/h/.dsh/attachments/v1/objects/4b/4bd24896a98d481c469b644d736635258aaa6aca4f828f6cd028b4c9acc79fa9', 600, 660, '用户图4：官方右壁（深空黑）')
