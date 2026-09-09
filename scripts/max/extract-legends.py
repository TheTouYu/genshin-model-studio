#!/usr/bin/env python3
"""从官方顶壳正交图提取真实键帽字符（零依赖分析脚本，v2：可变尺寸 tile + 单字形拼装）。
产物：reference/macbook/legend-atlas.png（灰度图集）+ legend-atlas.json（键名→矩形 + 布局表）
标定：键距 90px = 19.05mm（由触控板井宽 613px = 129.9mm 交叉验证），键缝 1.7mm。
"""
import json
from PIL import Image
import numpy as np

SRC = 'reference/macbook/img/apple-mbp13-top-case-official.png'
OUT_PNG = 'reference/macbook/legend-atlas.png'
OUT_JSON = 'reference/macbook/legend-atlas.json'

PITCH_PX = 90.0
BLOCK_X0 = 90.0
ROW_Y = [(162, 241), (250, 329), (338, 417), (426, 504), (514, 592)]

ROWS = [
    [('`', 1.065), ('1', 1), ('2', 1), ('3', 1), ('4', 1), ('5', 1), ('6', 1), ('7', 1), ('8', 1), ('9', 1), ('0', 1),
     ('-', 1), ('=', 1), ('delete', 1.585)],
    [('tab', 1.568), ('Q', 1), ('W', 1), ('E', 1), ('R', 1), ('T', 1), ('Y', 1), ('U', 1), ('I', 1), ('O', 1), ('P', 1),
     ('[', 1), (']', 1), ('\\', 1.082)],
    [('caps', 1.809), ('A', 1), ('S', 1), ('D', 1), ('F', 1), ('G', 1), ('H', 1), ('J', 1), ('K', 1), ('L', 1),
     (';', 1), ("'", 1), ('return', 1.841)],
    [('lshift', 2.312), ('Z', 1), ('X', 1), ('C', 1), ('V', 1), ('B', 1), ('N', 1), ('M', 1), (',', 1), ('.', 1),
     ('/', 1), ('rshift', 2.338)],
    [('fn', 1.065), ('control', 1), ('option', 1), ('command', 1.243), ('space', 5.013), ('command', 1.243),
     ('option', 1), ('left', 1), ('down', 1), ('right', 1)],
]

INSET = 9  # 去掉键帽斜面


def crop_key(a, ri, name):
    y0, y1 = ROW_Y[ri]
    x = BLOCK_X0
    for n, u in ROWS[ri]:
        wpx = u * PITCH_PX
        if n == name:
            return a[y0 + INSET:y1 - INSET, int(x + INSET):int(x + wpx - 8 - INSET)]
        x += wpx
    raise KeyError(name)


def norm(p):
    return np.clip((p.astype(np.float32) - 62.0) / 118.0, 0, 1)


def components(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not seen[y, x]:
                stack = [(y, x)]; seen[y, x] = True; cells = []
                while stack:
                    cy, cx = stack.pop(); cells.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True; stack.append((ny, nx))
                ys = [c[0] for c in cells]; xs = [c[1] for c in cells]
                out.append((min(ys), max(ys), min(xs), max(xs), len(cells)))
    out.sort(key=lambda b: (b[0], b[2]))
    return out


def glyph_of(patch, pick='all'):
    """返回 patch 内字符的裁剪（pick='all'|'bottom'|'top'）"""
    n = norm(patch)
    mask = n > 0.42
    if not mask.any():
        return None
    comps = [c for c in components(mask) if c[4] >= 6]
    if not comps:
        return None
    if pick == 'bottom':
        # 按行带分组，取最低带
        comps.sort(key=lambda c: c[0])
        rows = []
        for c in comps:
            if rows and c[0] <= rows[-1][1] + 4:
                rows[-1] = (min(rows[-1][0], c[0]), max(rows[-1][1], c[1]), min(rows[-1][2], c[2]), max(rows[-1][3], c[3]))
            else:
                rows.append(c)
        band = rows[-1]
        sel = [c for c in comps if c[0] >= band[0] - 2 and c[1] <= band[1] + 2]
    elif pick == 'top':
        comps.sort(key=lambda c: c[0])
        rows = []
        for c in comps:
            if rows and c[0] <= rows[-1][1] + 4:
                rows[-1] = (min(rows[-1][0], c[0]), max(rows[-1][1], c[1]), min(rows[-1][2], c[2]), max(rows[-1][3], c[3]))
            else:
                rows.append(c)
        band = rows[0]
        sel = [c for c in comps if c[0] >= band[0] - 2 and c[1] <= band[1] + 2]
    else:
        sel = comps
    y0 = min(c[0] for c in sel); y1 = max(c[1] for c in sel)
    x0 = min(c[2] for c in sel); x1 = max(c[3] for c in sel)
    return norm(patch)[y0:y1 + 1, x0:x1 + 1]


def paste(dst, tile, cx, cy):
    if tile is None:
        return
    th, tw = tile.shape
    y0 = int(round(cy - th / 2)); x0 = int(round(cx - tw / 2))
    y0 = max(0, min(dst.shape[0] - th, y0)); x0 = max(0, min(dst.shape[1] - tw, x0))
    dst[y0:y0 + th, x0:x0 + tw] = np.maximum(dst[y0:y0 + th, x0:x0 + tw], tile)


def main():
    im = Image.open(SRC).convert('L')
    a = np.asarray(im)
    tiles = []  # (name, 2D array)

    for ri in range(5):
        for name, _u in ROWS[ri]:
            tiles.append((f'{ri}:{name}', norm(crop_key(a, ri, name))))

    # ---- 功能键行（14 键）用已提取字形拼装 ----
    g_e = glyph_of(crop_key(a, 1, 'E'))
    g_s = glyph_of(crop_key(a, 2, 'S'))
    g_c = glyph_of(crop_key(a, 3, 'C'))
    g_F = glyph_of(crop_key(a, 2, 'F'))
    digits = {str(d): glyph_of(crop_key(a, 0, str(d) if d else '0'), 'bottom') for d in range(10)}
    # 数字 0 的键名是 '0'
    fh = g_F.shape[0]
    gap = max(2, int(fh * 0.22))
    def compose(parts):
        w = sum(p.shape[1] for p in parts if p is not None) + gap * (len(parts) - 1)
        out = np.zeros((fh, max(1, w)), dtype=np.float32)
        x = 0
        for p in parts:
            if p is None:
                continue
            # 统一高度
            sc = fh / p.shape[1] if False else 1.0
            ph = p.shape[0]
            oy = (fh - ph) // 2
            out[oy:oy + ph, x:x + p.shape[1]] = p
            x += p.shape[1] + gap
        return out
    fkeys = [('esc', compose([g_e, g_s, g_c]))]
    for i in range(1, 13):
        fkeys.append((f'F{i}', compose([g_F, digits[str(i % 10)] if i < 10 else digits['1'], digits[str(i % 10)] if i >= 10 else None])))
    # Touch ID：程序化指纹图标
    fp = np.zeros((48, 48), dtype=np.float32)
    yy, xx = np.mgrid[0:48, 0:48]
    d = np.sqrt((xx - 23.5) ** 2 + (yy - 23.5) ** 2)
    fp[((d > 17) & (d < 20)) | ((d > 11) & (d < 14)) | ((d > 5) & (d < 8))] = 1.0
    fp[(yy > 23) & (d < 20) & (d > 2)] = np.maximum(fp[(yy > 23) & (d < 20) & (d > 2)], 0.0)
    fkeys.append(('touchid', fp))
    for name, tile in fkeys:
        tiles.append((f'f:{name}', tile))

    # ---- 3x 放大 + 锐化（提升渲染端字符清晰度） ----
    SC = 3
    up = []
    from PIL import ImageFilter
    for name, t in tiles:
        im = Image.fromarray((np.clip(t, 0, 1) * 255).astype(np.uint8))
        im = im.resize((im.width * SC, im.height * SC), Image.LANCZOS)
        im = im.filter(ImageFilter.UnsharpMask(radius=1.6, percent=55, threshold=3))
        up.append((name, np.asarray(im).astype(np.float32) / 255.0))
    tiles = up

    # ---- 打包到图集（简单行式装箱） ----
    AW = 3072
    x = 0; y = 0; rowh = 0
    placed = []
    for name, t in tiles:
        w = t.shape[1]; h = t.shape[0]
        if x + w > AW:
            x = 0; y += rowh + 2; rowh = 0
        placed.append((name, t, x, y, w, h))
        x += w + 2
        rowh = max(rowh, h)
    AH = y + rowh + 2
    atlas = np.zeros((AH, AW), dtype=np.float32)
    rects = {}
    for name, t, px, py, w, h in placed:
        atlas[py:py + h, px:px + w] = t
        rects[name] = [px, py, w, h]
    Image.fromarray((atlas * 255).astype(np.uint8)).save(OUT_PNG)
    meta = {
        'source': SRC,
        'note': '真实键帽字符图集（灰度，0=键帽底 1=字符）；键名 ri:name / f:name',
        'pitch_mm': 19.05,
        'px_per_mm': round(PITCH_PX / 19.05, 4),
        # 图集坐标下的 px/mm：rects 是「放大 SC 倍后」的坐标，几何侧必须用这个值，
        # 用源图 px_per_mm 会把字形放大 SC 倍（v1 的 3× 字形 bug）
        'atlas_px_per_mm': round(SC * PITCH_PX / 19.05, 4),
        'inset_px': INSET,
        'atlas': [AW, AH],
        'rows': [[[n, u] for n, u in row] for row in ROWS],
        'rects': rects,
    }
    with open(OUT_JSON, 'w') as f:
        json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{OUT_PNG} {AW}x{AH}, {len(placed)} tiles')


if __name__ == '__main__':
    main()
