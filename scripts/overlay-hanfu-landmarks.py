#!/usr/bin/env python3
"""Render landmark-verification overlays (G1 evidence) + a mechanical G1 report.

For each view: crop the panel with a 25px grid, draw every landmark as a cross
with its index, and save under delivery/hanfu-l1/overlay-<view>.png.
The report prints, per landmark, the distance to the nearest silhouette edge
(background-distance mask boundary) so alignment can be judged numerically.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / 'reference' / 'hanfu'
SHEET = REF / '古风甘雨三视图.png'
LM = ROOT / 'reference' / 'ganyu-hanfu-landmarks.json'
OUT = ROOT / 'delivery' / 'hanfu-l1'


def body_mask(rgb):
    d = np.linalg.norm(rgb.astype(np.float32) - np.asarray((240, 239, 239), np.float32), axis=2)
    return d > 12.0


def edge_map(mask):
    e = np.zeros_like(mask)
    e[:-1, :] |= mask[:-1, :] & ~mask[1:, :]
    e[1:, :] |= mask[1:, :] & ~mask[:-1, :]
    e[:, :-1] |= mask[:, :-1] & ~mask[:, 1:]
    e[:, 1:] |= mask[:, 1:] & ~mask[:, :-1]
    return e


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads(LM.read_text())
    rgb = np.asarray(Image.open(SHEET).convert('RGB'))
    mask = body_mask(rgb)
    edge = edge_map(mask)
    ys, xs = np.where(edge)
    ed = np.stack([xs, ys], axis=1).astype(np.float32)
    font = ImageFont.load_default(size=14)

    panels = data['measurementMetadata']['panelGeometry']
    report = {}
    for view in ('front', 'side', 'back'):
        p = panels[view]
        x0, x1 = p['x']
        y0, y1 = p['y']
        pad = 30
        cx0, cx1 = max(0, x0 - pad), min(rgb.shape[1], x1 + pad + 1)
        cy0, cy1 = max(0, y0 - pad), min(rgb.shape[0], y1 + pad + 1)
        scale = 1.5 if view != 'side' else 2.0
        crop = Image.fromarray(rgb[cy0:cy1, cx0:cx1].copy())
        crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), Image.LANCZOS)
        d = ImageDraw.Draw(crop, 'RGBA')
        # 50px grid
        for gx in range(cx0 - cx0 % 50, cx1 + 50, 50):
            X = (gx - cx0) * scale
            d.line([(X, 0), (X, crop.height)], fill=(0, 150, 210, 70))
            d.text((X + 2, 2), str(gx), fill=(255, 60, 60, 230), font=font)
        for gy in range(cy0 - cy0 % 50, cy1 + 50, 50):
            Y = (gy - cy0) * scale
            d.line([(0, Y), (crop.width, Y)], fill=(0, 150, 210, 70))
            d.text((2, Y + 1), str(gy), fill=(255, 60, 60, 230), font=font)
        rows = []
        for i, lm in enumerate(data[view]['landmarks']):
            lx, ly = lm['pixel']
            X, Y = (lx - cx0) * scale, (ly - cy0) * scale
            r = 6
            d.line([(X - r, Y), (X + r, Y)], fill=(255, 0, 0, 255), width=2)
            d.line([(X, Y - r), (X, Y + r)], fill=(255, 0, 0, 255), width=2)
            d.text((X + 7, Y - 16), str(i), fill=(255, 0, 0, 255), font=font)
            dist = float(np.min(np.linalg.norm(ed - np.array([lx, ly], np.float32), axis=1)))
            rows.append({'i': i, 'name': lm['name'], 'pixel': [lx, ly],
                         'uncertaintyPx': lm['uncertaintyPx'],
                         'distToSilhouetteEdgePx': round(dist, 1)})
        crop.save(OUT / f'overlay-{view}.png')
        report[view] = rows
        print(f'--- {view}: {len(rows)} landmarks -> {OUT.name}/overlay-{view}.png')
        for r in rows:
            print(f"   {r['i']:2d} {r['name']:<24} {r['pixel']} ±{r['uncertaintyPx']:<3}"
                  f" edgeDist={r['distToSilhouetteEdgePx']}")

    (OUT / 'g1-edge-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    h = data['scale']['bottomPixel'] - data['scale']['topPixel']
    print(f'\nheight px = {h}; G1 tolerance = 2% = {h * 0.02:.1f}px')
    return 0


if __name__ == '__main__':
    sys.exit(main())
