#!/usr/bin/env python3
"""底盖激光雕刻铭牌贴图（零依赖：仅 Pillow，走 .venv 的 python）。

契约（与 web/draw/photo.html 的 etch 分支对齐）：
  · 输出 web/draw/bottom-etch.png，尺寸 = 1120×224 px = 70mm × 14mm @16 px/mm（几何在
    src/model/macbook/geometry.ts 的 M.ETCH 段，quad 70×14mm，距前缘 33mm）。
  · **底色必须是铝色本身**（#f3f3f4 = 页面里浅色铝组的 hex）：页面把该组材质 color 设成白、
    用 map 相乘，底色若写白 → 铭牌区比周围铝亮 12%，渲染成一块"浅色贴纸"（踩过）。
  · 字色比底色暗一点点（真机是极淡的激光蚀刻），认证标记用小方块/圆圈占位。

用法：.venv/bin/python scripts/max/make-bottom-etch.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1248, 224          # 78mm × 14mm @ 16px/mm（几何 quad 在 geometry.ts 的 M.ETCH 段，同为 78×14mm）
# ⚠ 底色必须 = 底盖那张板在**页面里**的最终底色：底盖是 M.ALU_GLOSS，其 baseColor 与 M.ALU 同为
#   aluCol（0.897/0.900/0.907 → hex 0xf3f3f4），页面按 hex 出材质 → 底色就是 0xf3f3f4。
#   （曾误以为底面是"更暗的 0xdadadb"→ 改成暗底后铭牌区比周围暗 21 级，实测 177 vs 199，回退。）
# 实测：贴图组比周围金属板暗 ~10 级（灰度预设下 189 vs 199；同一材质参数、同底色，
#   差异来自 page 的 metal+map 路径 vs 纯 color 路径）。底色直接写白，让两者的**渲染结果**对齐——
#   否则铭牌区会读成一块"可见的矩形贴纸"（踩到第三次）。
BG = (255, 255, 255)
INK = (238, 239, 241)     # 蚀刻字色（渲染后比周围暗 ~10 级，接近真机的极淡蚀刻）
INK2 = (245, 246, 248)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'web', 'draw', 'bottom-etch.png')
FONTS = [
    '/usr/share/fonts/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]


def font(px):
    for p in FONTS:
        if os.path.exists(p):
            return ImageFont.truetype(p, px)
    return ImageFont.load_default()


def ctext(d, cx, y, s, f, fill):
    w = d.textlength(s, font=f)
    d.text((cx - w / 2, y), s, font=f, fill=fill)


def main():
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    cx = W / 2
    f_model = font(30)     # "MacBook Pro"
    f_body = font(19)      # 型号 / 电气参数
    f_fine = font(15)      # 法规行

    ctext(d, cx, 22, 'MacBook Pro', f_model, INK)
    ctext(d, cx, 70, 'Model A2918    Input 20V 5A', f_body, INK)
    ctext(d, cx, 104, 'Designed by Apple in California    Assembled in China', f_fine, INK2)

    # 认证标记行：一串小方块（CE/FCC/CMIIT/VCCI/KC/UKCA 等的位形占位）+ 中间夹细字符
    marks = ['CE', 'FCC', 'CMIIT ID', 'VCCI', 'KC', 'UKCA', 'NOM', 'BIS', 'EAC', 'WEEE']
    y = 142
    widths = [d.textlength(m, font=f_fine) + 26 for m in marks]
    total = sum(widths) + 14 * (len(marks) - 1)
    x = cx - total / 2
    for m, w in zip(marks, widths):
        d.rectangle([x, y, x + w - 18, y + 22], outline=INK2, width=2)
        d.text((x + 9, y + 3), m, font=f_fine, fill=INK2)
        x += w + 14

    ctext(d, cx, 180, 'CMIIT ID: 2023AJ1234    IC: 579C-A2918    FCC ID: BCG-A2918', f_fine, INK2)
    im.save(OUT)
    print('wrote %s (%dx%d, %.0f px/mm)' % (os.path.relpath(OUT), W, H, W / 78.0))


if __name__ == '__main__':
    main()
