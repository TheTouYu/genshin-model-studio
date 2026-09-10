#!/usr/bin/env python3
"""make-kb-legends.py — 键盘字标世界坐标图集合成（页面通道）

输入：.scratch/max/kb-legend-rects.json（make-kb-legends.mjs 产出的键位表）
      reference/macbook/legend-atlas.png（字形图集，14.0008 px/mm）
输出：web/draw/kb-legends.png（灰度图；页面当 map 用，材质 color 必须为白）

原则（前几版踩过的坑，逐条对应）：
  ① 图集是**灰度掩膜**（白=字形，黑=背景）→ 只把白像素写成字标色，其余保持键帽底色。
     旧版整块矩形贴上去 → 键帽上出现纯黑补丁、空格键中缝被读成"断开"。
  ② **按图集自然尺度贴**（atlas px × 9/14.0008），矩形整体居中于键心。
     旧版把裁剪后的字形 bbox 拉伸填满整个矩形框 → 字形放大 3 倍溢出到邻键。
  ③ fn 行图集矩形混入邻键碎片（"!1"/"@2"）→ 单独合成：图标（程序化）+ 图集 F 模板 + 数字。
  ④ 污染清理：贯穿高度的细竖条（键帽亮边）、过矮行组（下一行字标碎片）。
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ATLAS = 'reference/macbook/legend-atlas.png'
RECTS = '.scratch/max/kb-legend-rects.json'
OUT = 'web/draw/kb-legends.png'
KEYCAP = 40
GLYPH = 220
THRESH = 96


def groups(m, axis, gap=6):
    proj = m.any(axis=axis)
    out, run = [], None
    for i, v in enumerate(proj):
        if v and run is None:
            run = i
        elif not v and run is not None:
            out.append((run, i))
            run = None
    if run is not None:
        out.append((run, len(proj)))
    merged = []
    for lo, hi in out:
        if merged and lo - merged[-1][1] < gap:
            merged[-1] = (merged[-1][0], hi)
        else:
            merged.append((lo, hi))
    return merged


def bbox(m):
    ys, xs = np.where(m)
    return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def clean_inplace(m):
    H, W = m.shape
    # 图集边缘格（4:left / 4:right）混入大片背景白：贴到键帽上会变成一块亮矩形（实测渲染
    # 方向键上半截发白）。规则：连通块贴住上边缘且横向跨度 > 80% 格宽 = 背景，删掉。
    lbl = np.zeros((H, W), np.int32)
    cur = 0
    for y in range(H):
        for x in range(W):
            if not m[y, x] or lbl[y, x]:
                continue
            cur += 1
            stack = [(y, x)]
            lbl[y, x] = cur
            while stack:
                cy, cx = stack.pop()
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not lbl[ny, nx]:
                        lbl[ny, nx] = cur
                        stack.append((ny, nx))
    for c in range(1, cur + 1):
        ys, xs = np.where(lbl == c)
        if ys.min() == 0 and (xs.max() - xs.min() + 1) > 0.8 * W:
            m[ys.min():ys.max() + 1, xs.min():xs.max() + 1] = False
    keep = np.ones(W, bool)
    for lo, hi in groups(m, axis=0, gap=2):
        w = hi - lo
        if 0 < w < 0.10 * W and m[:, lo:hi].any(axis=1).mean() > 0.6:
            keep[lo:hi] = False
    m = m.copy()
    m[:, ~keep] = False
    # 行组清理：旧版对任何 < 25% 格高的行组一律删 → 数字行键的上档符号（% ^ & * 等）
    # 被当成污染删掉（裁判 C 实测：4/9/0 有符号、5/6/7/8 没有）。规则改为按行组数量分档：
    #   ≥3 组 → 小碎块（< 25% 高）判为污染删掉；
    #   ==2 组 → 只删极薄线（< 8% 高），保留"符号 + 数字"两行。
    rgs = groups(m, axis=1, gap=2)
    if len(rgs) >= 3:
        for lo, hi in rgs:
            if (hi - lo) < 0.25 * H:
                m[lo:hi, :] = False
    elif len(rgs) == 2:
        for lo, hi in rgs:
            if (hi - lo) < 0.08 * H:
                m[lo:hi, :] = False
    return m


def split_symbol_digit(m):
    H = m.shape[0]
    ink = m.sum(axis=1).astype(float)
    lo, hi = int(0.30 * H), int(0.80 * H)
    if hi <= lo:
        return bbox(m)
    cut = lo + int(np.argmin(ink[lo:hi]))
    m2 = m[cut + 1:] if ink[cut] < 0.35 * ink.max() else m[int(0.45 * H):]
    return bbox(m2) if m2.any() else None


def paste(sheet, mask, cx, cy, w, h):
    w, h = max(1, int(round(w))), max(1, int(round(h)))
    img = Image.fromarray((mask * 255).astype(np.uint8), 'L').resize((w, h), Image.LANCZOS)
    a = np.asarray(img) > 110
    x0, y0 = int(round(cx - w / 2)), int(round(cy - h / 2))
    H, W = sheet.shape
    sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(W, x0 + w), min(H, y0 + h)
    if sx1 <= sx0 or sy1 <= sy0:
        return
    sub = a[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0]
    sheet[sy0:sy1, sx0:sx1][sub] = GLYPH


def _ic_sun(d, big):
    import math
    r, c = (46, 128) if big else (34, 128)
    d.ellipse([c - r, c - r, c + r, c + r], fill=255)
    for i in range(8):
        a = math.pi * 2 * i / 8 + math.pi / 8
        r0, r1 = r + 14, r + (40 if big else 30)
        d.line([c + r0 * math.cos(a), c + r0 * math.sin(a), c + r1 * math.cos(a), c + r1 * math.sin(a)], fill=255, width=13)


def _ic_mission(d):
    d.rounded_rectangle([38, 44, 218, 104], radius=12, outline=255, width=13)
    d.rounded_rectangle([38, 130, 118, 212], radius=10, outline=255, width=13)
    d.rounded_rectangle([138, 130, 218, 212], radius=10, outline=255, width=13)


def _ic_spotlight(d):
    d.ellipse([46, 40, 172, 166], outline=255, width=15)
    d.line([166, 162, 220, 216], fill=255, width=20)


def _ic_mic(d):
    d.rounded_rectangle([100, 34, 156, 146], radius=28, fill=255)
    d.arc([66, 84, 190, 186], start=0, end=180, fill=255, width=14)
    d.line([128, 182, 128, 212], fill=255, width=14)
    d.line([96, 214, 160, 214], fill=255, width=14)


def _ic_moon(d):
    d.ellipse([48, 44, 208, 204], fill=255)
    d.ellipse([86, 20, 246, 180], fill=0)


def _ic_rewind(d):
    d.polygon([(120, 128), (120, 44), (58, 128), (120, 212)], fill=255)
    d.polygon([(206, 128), (206, 44), (144, 128), (206, 212)], fill=255)


def _ic_playpause(d):
    d.polygon([(74, 40), (74, 216), (168, 128)], fill=255)
    d.rectangle([188, 44, 208, 212], fill=255)
    d.rectangle([222, 44, 242, 212], fill=255)


def _ic_ff(d):
    d.polygon([(50, 128), (50, 44), (112, 128), (50, 212)], fill=255)
    d.polygon([(136, 128), (136, 44), (198, 128), (136, 212)], fill=255)


def _ic_speaker(d, mode):
    d.polygon([(40, 100), (86, 100), (140, 46), (140, 210), (86, 156), (40, 156)], fill=255)
    if mode == 'mute':
        d.line([166, 92, 226, 164], fill=255, width=16)
        d.line([226, 92, 166, 164], fill=255, width=16)
    else:
        d.arc([128, 78, 200, 178], start=-58, end=58, fill=255, width=14)
        if mode == 'up':
            d.arc([128, 44, 236, 212], start=-52, end=52, fill=255, width=14)


def _ic_arrow(d, dirn):
    # 方向键三角：图集里 4:left / 4:right 的格子混入大片背景白、4:down 被行分组规则切掉
    # （实测渲染成"半截白键帽"/空键帽）→ 直接程序化绘制，完全确定。
    if dirn == 'left':
        d.polygon([(52, 128), (204, 44), (204, 212)], fill=255)
    elif dirn == 'right':
        d.polygon([(204, 128), (52, 44), (52, 212)], fill=255)
    elif dirn == 'up':
        d.polygon([(128, 52), (44, 204), (212, 204)], fill=255)
    else:
        d.polygon([(128, 204), (44, 52), (212, 52)], fill=255)


ICONS = {
    'left': lambda d: _ic_arrow(d, 'left'), 'right': lambda d: _ic_arrow(d, 'right'),
    'up': lambda d: _ic_arrow(d, 'up'), 'down': lambda d: _ic_arrow(d, 'down'),
    'F1': lambda d: _ic_sun(d, False), 'F2': lambda d: _ic_sun(d, True),
    'F3': _ic_mission, 'F4': _ic_spotlight, 'F5': _ic_mic, 'F6': _ic_moon,
    'F7': _ic_rewind, 'F8': _ic_playpause, 'F9': _ic_ff,
    'F10': lambda d: _ic_speaker(d, 'mute'),
    'F11': lambda d: _ic_speaker(d, 'down'),
    'F12': lambda d: _ic_speaker(d, 'up'),
}


def icon_mask(name):
    c = Image.new('L', (256, 256), 0)
    ICONS[name](ImageDraw.Draw(c))
    return bbox(np.asarray(c) > 110)


def main():
    meta = json.load(open(RECTS))
    W, H = meta['W'], meta['H']
    PPM = 9.0
    SCALE = PPM / meta['pxPerMm']
    BX0, Z0 = meta['blockX0'], meta['z0']
    at = np.asarray(Image.open(ATLAS).convert('L'))
    sheet = np.full((H, W), KEYCAP, np.uint8)
    R = {e['key']: e for e in meta['rects']}

    digits = {}
    for n in '1234567890':
        e = R.get('1:' + n)
        if not e:
            continue
        sub = at[e['ay']:e['ay'] + e['ah'], e['ax']:e['ax'] + e['aw']] > THRESH
        if not sub.any():
            continue
        d = split_symbol_digit(sub)
        if d is not None:
            digits[n] = d

    ef = R.get('3:F')
    F_TPL = bbox(clean_inplace(at[ef['ay']:ef['ay'] + ef['ah'], ef['ax']:ef['ax'] + ef['aw']] > THRESH)) if ef else None

    try:
        FONT = ImageFont.truetype('/usr/share/fonts/liberation/LiberationSans-Regular.ttf', 200)
    except Exception:
        FONT = None

    stat = {'keys': 0, 'fn': 0, 'empty': 0}
    for e in meta['rects']:
        key, name = e['key'], e['name']
        sx = (e['cx'] - BX0) * PPM
        sy = (e['cz'] - Z0) * PPM
        # 注：尝试过"向右扩 90px 重取墨迹"来救 control/command 被裁的尾字母，实测会把整块区域
        # 变空（empty 4→9），已回退。真正的修法要在 extract-legends.py 里重算这些键的矩形。
        ax, ay, aw, ah = e['ax'], e['ay'], e['aw'], e['ah']
        sub = at[ay:ay + ah, ax:ax + aw] > THRESH
        wmm, hmm = e['aw'] * SCALE, e['ah'] * SCALE

        if key == '0:esc':
            if FONT is not None:
                tmp = Image.new('L', (600, 300), 0)
                ImageDraw.Draw(tmp).text((10, 10), 'esc', font=FONT, fill=255)
                em = bbox(np.asarray(tmp) > 110)
                h = 2.8 * PPM
                paste(sheet, em, sx, sy, h * em.shape[1] / em.shape[0], h)
            stat['keys'] += 1
            continue

        if name in ('left', 'right', 'up', 'down'):
            im = icon_mask(name)
            ih = 2.6 * PPM
            paste(sheet, im, sx, sy, ih * im.shape[1] / im.shape[0], ih)
            stat['keys'] += 1
            continue

        if name in ICONS:
            im = icon_mask(name)
            ih = 4.4 * PPM
            paste(sheet, im, sx, sy - 2.3 * PPM, ih * im.shape[1] / im.shape[0], ih)
            fh = 2.4 * PPM
            fw = fh * F_TPL.shape[1] / F_TPL.shape[0] if F_TPL is not None else fh * 0.6
            parts = [(digits[c], fh * digits[c].shape[1] / digits[c].shape[0]) for c in name[1:] if c in digits]
            gapx = 0.25 * PPM
            total = fw + sum(w for _, w in parts) + gapx * len(parts)
            x = sx - total / 2
            paste(sheet, F_TPL, x + fw / 2, sy + 3.7 * PPM, fw, fh)
            x += fw
            for dm, dw in parts:
                x += gapx
                paste(sheet, dm, x + dw / 2, sy + 3.7 * PPM, dw, fh)
                x += dw
            stat['fn'] += 1
            continue

        m = clean_inplace(sub)
        if not m.any():
            stat['empty'] += 1
            continue
        # 文字块图集的矩形常比键宽（command 258px=18.4mm > 键 17.25mm）→ 直接居中贴会被键边裁掉
        # 最后一个字母（用户 2026-09-10 看到 "contro" / "comman"）。按**墨迹 bbox** 重新贴合：
        # 宽高都按 bbox 比例缩放，并限制在键宽的 86%、键高的 52% 以内。
        mb = bbox(m)
        wmm, hmm = e['aw'] * SCALE, e['ah'] * SCALE
        if mb is not None and mb.any():
            # ⚠️ 回归修复（用户 2026-09-10「键盘字母全部异常变大」）：
            # 裁到墨迹 bbox 之后必须**按 bbox 占原矩形的比例**重算尺寸，否则小图又被拉回原矩形尺寸，
            # 等于把每个字形整体放大 (rect/bbox) 倍（单个字母约 1.4–3×）——r12 就是这么引入的。
            wmm *= mb.shape[1] / m.shape[1]
            hmm *= mb.shape[0] / m.shape[0]
            m = mb
        key_w = e.get('keyW', 17.35) * PPM
        key_h = e.get('keyH', 16.95) * PPM
        lim_w, lim_h = key_w * 0.86, key_h * 0.52
        k = min(lim_w / wmm, lim_h / hmm, 1.0)
        if k < 1.0:
            wmm, hmm = wmm * k, hmm * k
        paste(sheet, m, sx, sy, wmm, hmm)
        stat['keys'] += 1

    Image.fromarray(sheet, 'L').save(OUT)
    print(f'{OUT}: {W}x{H} keys={stat["keys"]} fn={stat["fn"]} empty={stat["empty"]} scale={SCALE:.4f}')


if __name__ == '__main__':
    sys.exit(main())
