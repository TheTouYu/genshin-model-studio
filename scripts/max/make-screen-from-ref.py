#!/usr/bin/env python3
"""make-screen-from-ref.py — 屏幕内容纹理取自用户参考图（确定性、可复现）

用户裁决（2026-09-09）：「亮屏的桌面 app 和 dock 显示需要好好设计细节，目前比较粗糙，
你可以就参考我提供的图片资源设计」。程序化绘制的 macOS 桌面（src/model/macbook/screen-ui.ts）
在近距特写下必然露馅（图标是色块、字是糊的），改用用户实拍桌面截图。

输入：/mnt/e/模型/笔记本/亮屏桌面.png（2229×939 RGBA）
  · 顶部 11 行 = 屏框黑边 → 去掉
  · 右侧 37 列 = 屏框黑边 → 去掉
  · 刘海（黑块）实测 x 1011..1178（宽 168px）、中心 x=1094 —— **按刘海居中裁剪**，
    使纹理里的刘海与模型自身刘海几何对齐（否则出现双刘海）
  · 屏幕活动区宽高比 = 302.4/196.4 = 1.5396 → 以刘海为心取 1429×928
输出：web/draw/screen-ui.png（1512×982，页面 emissiveMap 直接贴屏幕活动区）
用法：python3 scripts/max/make-screen-from-ref.py [--src <png>] [--out <png>]
"""
import argparse
import os
import sys

from PIL import Image

SRC_DEFAULT = '/mnt/e/模型/笔记本/亮屏桌面.png'
OUT_DEFAULT = 'web/draw/screen-ui.png'
SCREEN_ASPECT = 302.4 / 196.4          # 屏幕活动区宽高比
TEX_W, TEX_H = 1512, 982               # 纹理分辨率（≈5px/mm，特写够用）
TOP_BEZEL = 11                         # 实测：顶部纯黑行数
RIGHT_BEZEL = 37                       # 实测：右侧纯黑列数
NOTCH_CX = 1094                        # 实测：刘海中心 x


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=SRC_DEFAULT)
    ap.add_argument('--out', default=OUT_DEFAULT)
    ap.add_argument('--notch-cx', type=int, default=NOTCH_CX)
    a = ap.parse_args()
    if not os.path.exists(a.src):
        print(f'src not found: {a.src}', file=sys.stderr)
        return 2
    im = Image.open(a.src).convert('RGB')
    x0, y0 = 0, TOP_BEZEL
    x1, y1 = im.width - RIGHT_BEZEL, im.height
    ch = y1 - y0
    cw = int(round(ch * SCREEN_ASPECT))
    cx = a.notch_cx
    cx0 = max(x0, min(cx - cw // 2, x1 - cw))
    crop = im.crop((cx0, y0, cx0 + cw, y1)).resize((TEX_W, TEX_H), Image.LANCZOS)
    crop.save(a.out)
    print(f'{a.out} {crop.width}x{crop.height} from {a.src} '
          f'crop=({cx0},{y0})-({cx0 + cw},{y1}) notch_cx={cx} (rel {round((cx - cx0) / cw, 4)})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
