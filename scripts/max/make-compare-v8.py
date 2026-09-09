#!/usr/bin/env python3
"""make-compare-v8.py — v8 出图与配对参考图并排比对图（每行：我方渲染 | 参考图）

用法：python3 scripts/max/make-compare-v8.py [out.png]
仅作分析/评审用途（PIL），不参与运行时管线。
"""
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

PAIRS = [
    ("1 闭合俯视 closedtop", "delivery/macbook-v8w/p1-closedtop.png", "/mnt/e/模型/笔记本/俯视图.png"),
    ("2 屏幕正面 screenfront", "delivery/macbook-v8w/p1-screenfront.png", "/mnt/e/模型/笔记本/正视图.png"),
    ("3 键盘+触控板 kb", "delivery/macbook-v8w/p1-kb.png", "/mnt/e/模型/笔记本/键盘和触控板.png"),
    ("4 左侧接口 ports", "delivery/macbook-v8d/p1-ports.png", "reference/macbook/img/official-mbp14-ports-1.jpg"),
    ("5 3/4 开盖 hero", "delivery/macbook-v8d/p1-hero.png", "reference/macbook/img/official-mbp14-hero.jpg"),
    ("6 底面 bottom", "delivery/macbook-v8g/p1-bottom.png", "reference/macbook/img/apple-mbp13-bottom-case-official.jpg"),
]

H = 300          # 每张图统一高度
GAP = 14         # 左右图间距
PAD = 10
CAP = 22         # 行标题高度


def load(p):
    path = p if os.path.isabs(p) else os.path.join(ROOT, p)
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    return im.resize((max(1, round(im.width * H / im.height)), H), Image.LANCZOS)


rows = []
for title, mine, ref in PAIRS:
    a, b = load(mine), load(ref)
    rows.append((title, mine, a, ref, b))

W = max(PAD + a.width + GAP + b.width + PAD for _, _, a, _, b in rows)
HT = sum(CAP + H + PAD for _ in rows) + PAD
sheet = Image.new("RGB", (W, HT), (250, 250, 252))
d = ImageDraw.Draw(sheet)

y = PAD
for title, mp, a, rp, b in rows:
    d.text((PAD, y + 5), f"{title}    ← 我方 {mp}    → 参考 {os.path.basename(rp)}", fill=(20, 20, 24))
    y += CAP
    sheet.paste(a, (PAD, y))
    sheet.paste(b, (PAD + a.width + GAP, y))
    d.rectangle([PAD - 1, y - 1, PAD + a.width, y + H], outline=(210, 60, 60))
    d.rectangle([PAD + a.width + GAP - 1, y - 1, PAD + a.width + GAP + b.width, y + H], outline=(60, 120, 210))
    y += H + PAD

out = sys.argv[1] if len(sys.argv) > 1 else "delivery/macbook-v8/compare-v8.png"
out = out if os.path.isabs(out) else os.path.join(ROOT, out)
os.makedirs(os.path.dirname(out), exist_ok=True)
sheet.save(out)
print(f"wrote {out} {sheet.width}x{sheet.height}")
