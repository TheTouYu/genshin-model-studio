#!/usr/bin/env python3
"""缝带指标（资产）：同一机位、同一画布口径下，量「触控板四周」是否出现亮带。

用法: .venv/bin/python scripts/max/seam-metric.py <render.png> [--rows A,B] [--cols C,D]
     [--baseline <other.png>]

判据（r42 定）:
  band_mean  缝带区均值（参考：真机 键盘和触控板.png 该区 ~215–237，无亮线）
  band_max   缝带区最大亮度（>240 且伴随 dev 高 = 亮带嫌疑）
  bright     dev>60 的像素数（中值背景高通；越少越好）
  真机锚点：键盘和触控板.png 触控板区域 dev>25 像素 = 0（亮线全在键盘区）

为什么需要它：这台机器的亮线类缺陷每次都由用户肉眼先发现，代价高；
2026-09-11/12 的 r41–r42 排查里，同一个"缝带"读数横跨 5 组对照实验
（绕序 / 台面抬高 / 剖面段数 / 槽底高度 / 解析法线），必须用同一把尺子。
"""
import sys
from PIL import Image, ImageFilter
import numpy as np


def stat(path, rows, cols):
    g = Image.open(path).convert("L")
    a = np.asarray(g).astype(float)
    med = np.asarray(g.filter(ImageFilter.MedianFilter(21))).astype(float)
    dev = a - med
    band = a[rows[0]:rows[1], cols[0]:cols[1]]
    return dict(mean=band.mean(), mx=band.max(), bright=int((dev > 60).sum()),
                whole=a.mean(), size=g.size)


def main():
    args = [x for x in sys.argv[1:]]
    path = args[0]
    rows, cols, base = (275, 310), (150, 850), None
    if "--rows" in args:
        i = args.index("--rows"); rows = tuple(int(v) for v in args[i + 1].split(","))
    if "--cols" in args:
        i = args.index("--cols"); cols = tuple(int(v) for v in args[i + 1].split(","))
    if "--baseline" in args:
        base = args[args.index("--baseline") + 1]
    s = stat(path, rows, cols)
    print(f"{path}: 画布 {s['size']} 缝带 mean={s['mean']:.1f} max={s['mx']:.0f} "
          f"bright(dev>60)={s['bright']} 全图均值={s['whole']:.1f}")
    if base:
        b = stat(base, rows, cols)
        print(f"baseline {base}: 缝带 mean={b['mean']:.1f} max={b['mx']:.0f} bright={b['bright']}")
        print(f"Δ mean={s['mean']-b['mean']:+.1f}  Δ bright={s['bright']-b['bright']:+d}")


if __name__ == "__main__":
    main()
