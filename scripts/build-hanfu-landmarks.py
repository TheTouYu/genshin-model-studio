#!/usr/bin/env python3
"""Build reference/ganyu-hanfu-landmarks.json (schema v1) from measured pixels.

Sources
  * reference/hanfu/measurements.json  (canonical panel geometry + row profiles)
  * reference/hanfu/古风甘雨三视图.png  (front / side / back landmarks)
  * reference/hanfu/甘雨.png            (pose truth: 回眸持剑 3/4 背身)

Every landmark is extracted by an explicit pixel rule (color segmentation,
silhouette extremes, profile stations).  A small override table carries the
human visual readings used to cross-check the automatic picks; the reported
uncertaintyPx is max(rule softness, |auto - visual|) so the table never claims
more precision than the pixels support.  Front clothing points double their
uncertainty and carry confidence "low" per the task brief.
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / 'reference' / 'hanfu'
SHEET = REF / '古风甘雨三视图.png'
ORIG = REF / '甘雨.png'
OUT = ROOT / 'reference' / 'ganyu-hanfu-landmarks.json'
MEAS = REF / 'measurements.json'

HEIGHT_METERS = 1.6           # inherited provisional scale (old record), hair crown -> hem
EXCLUDES = 'horns and ahoge'
FRONT_CLOTHING_POINTS = {
    'chest_gem', 'corset_top_center', 'corset_bottom_center', 'waist_center',
    'waist_belt_center', 'sash_gem', 'hem_bottom_center', 'hem_left', 'hem_right',
    'wrist_left', 'wrist_right', 'hand_left', 'hand_right',
    'shoulder_left', 'shoulder_right',
}


# ---------------------------------------------------------------- mask helpers
def lum(rgb):
    return 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]


def masks(rgb, bg):
    a = rgb.astype(np.float32)
    L = lum(a)
    d = np.linalg.norm(a - np.asarray(bg, np.float32), axis=2)
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return {
        'lm': d > 12.0,
        'hair': (B > R + 12) & (B > 170) & (L > 120),
        'horn': (((R > G + 25) & (R > B + 25) & (R > 60)) | ((L < 75) & (R >= G - 5))),
        'skin': (R > 205) & (G > 175) & (B < G + 18) & (R > B + 8),
        'dark': L < 95,
        'blue_dark': (B > R + 35) & (L < 130),
        'gold': (R > 140) & (G > 110) & (B < G - 10) & (L > 120),
        'red': (R > G + 45) & (R > B + 45) & (R > 110),
        'white': (L > 235) & (np.abs(R - B) < 14),
    }


def region(mask, x0, x1, y0, y1):
    out = np.zeros_like(mask)
    out[y0:y1, x0:x1] = mask[y0:y1, x0:x1]
    return out


def blobs(mask, min_px=30):
    """4-connected components via BFS; returns list of dicts."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    ys, xs = np.where(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        q = deque([(y0, x0)])
        seen[y0, x0] = True
        pts = []
        while q:
            y, x = q.popleft()
            pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if len(pts) >= min_px:
            arr = np.asarray(pts)
            out.append({
                'n': len(pts),
                'cx': float(arr[:, 1].mean()), 'cy': float(arr[:, 0].mean()),
                'x0': int(arr[:, 1].min()), 'x1': int(arr[:, 1].max()),
                'y0': int(arr[:, 0].min()), 'y1': int(arr[:, 0].max()),
                'pts': arr,
            })
    out.sort(key=lambda b: -b['n'])
    return out


def row_extent(mask, y, x0, x1):
    idx = np.where(mask[y, x0:x1 + 1])[0]
    if idx.size == 0:
        return None
    return int(idx[0]) + x0, int(idx[-1]) + x0


def col_extent(mask, x, y0, y1):
    idx = np.where(mask[y0:y1 + 1, x])[0]
    if idx.size == 0:
        return None
    return int(idx[0]) + y0, int(idx[-1]) + y0


def topmost(mask, x0, x1, y0, y1, min_w=1):
    for y in range(y0, y1):
        e = row_extent(mask, y, x0, x1)
        if e and e[1] - e[0] + 1 >= min_w:
            return (int((e[0] + e[1]) / 2), y)
    return None


def bottommost(mask, x0, x1, y0, y1, min_w=1):
    for y in range(y1, y0, -1):
        e = row_extent(mask, y, x0, x1)
        if e and e[1] - e[0] + 1 >= min_w:
            return (int((e[0] + e[1]) / 2), y)
    return None


def extreme_x(mask, x0, x1, y0, y1, want_min=True):
    sub = mask[y0:y1, x0:x1]
    ys, xs = np.where(sub)
    if xs.size == 0:
        return None
    k = np.argmin(xs) if want_min else np.argmax(xs)
    return int(xs[k]) + x0, int(ys[k]) + y0


def band_stats(mask, xa, xb, ya, yb, min_count):
    """Row-band stats: robust to gold-filigree fragmentation of the blue fabric."""
    rows = []
    for y in range(ya, yb):
        e = row_extent(mask, y, xa, xb)
        if e and mask[y, xa:xb + 1].sum() >= min_count:
            rows.append((y, e))
    if not rows:
        return None
    y0b, y1b = rows[0][0], rows[-1][0]
    xl = int(np.median([e[0] for _, e in rows]))
    xr = int(np.median([e[1] for _, e in rows]))
    return {'y0': y0b, 'y1': y1b, 'xl': xl, 'xr': xr,
            'cx': (xl + xr) / 2, 'cy': (y0b + y1b) / 2}


def lm_point(name, pixel, unc, **extra):
    d = {'name': name, 'pixel': [int(round(pixel[0])), int(round(pixel[1]))],
         'uncertaintyPx': int(round(unc))}
    d.update(extra)
    return d


# ------------------------------------------------------------------ front view
def front_landmarks(rgb, m, p):
    x0, x1 = p['x']
    y0, y1 = p['y']
    cx = (x0 + x1) / 2.0
    lm, hair, horn, skin = m['lm'], m['hair'], m['horn'], m['skin']
    dark, blue_dark, gold, red = m['dark'], m['blue_dark'], m['gold'], m['red']
    L = []

    # --- head: hair crown, ahoge, horns
    ahoge = topmost(lm, int(cx - 70), int(cx + 70), y0, y0 + 140, min_w=2)
    ht = topmost(hair, int(cx - 180), int(cx + 180), y0, y0 + 300, min_w=100)
    hair_top_y = ht[1] if ht else y0 + 90
    if ahoge:
        L.append(lm_point('ahoge_tip', ahoge, 4, source='rule:topmost lm row in cx±70'))
    L.append(lm_point('hair_crown_top', ht, 4,
                      source='rule:topmost hair row width>=100 in cx±180 (head mass, ahoge excluded)'))

    hb = blobs(region(horn, x0, x1, y0, y0 + 190), min_px=120)
    for side, blob in (('left', min(hb, key=lambda b: b['cx'], default=None)),
                       ('right', max(hb, key=lambda b: b['cx'], default=None))):
        if not blob:
            continue
        pts = blob['pts']
        d2 = (pts[:, 1] - cx) ** 2 + (pts[:, 0] - hair_top_y) ** 2
        tip = pts[np.argmax(d2)]
        root = pts[np.argmin(d2)]
        L.append(lm_point(f'horn_tip_{side}', (tip[1], tip[0]), 5,
                          source='rule:horn blob point farthest from head crown'))
        L.append(lm_point(f'horn_root_{side}', (root[1], root[0]), 6,
                          source='rule:horn blob point nearest head crown'))

    # head widest row (hair mass)
    best = None
    for y in range(hair_top_y, min(hair_top_y + 170, y1)):
        e = row_extent(hair, y, int(cx - 200), int(cx + 200))
        if e and (best is None or e[1] - e[0] > best[2] - best[1]):
            best = (y, e[0], e[1])
    if best:
        y, a, b = best
        L.append(lm_point('head_widest_left', (a, y), 5, source='rule:hair widest row left edge'))
        L.append(lm_point('head_widest_right', (b, y), 5, source='rule:hair widest row right edge'))

    # eyes: small dark blobs in the face band, horns excluded
    eb = blobs(region(dark & ~horn, int(cx - 110), int(cx + 110),
                      hair_top_y + 40, hair_top_y + 200), min_px=25)
    eb = [b for b in eb if b['n'] <= 4000][:2]
    eb.sort(key=lambda b: b['cx'])
    for i, e in enumerate(eb):
        L.append(lm_point(f'eye_{"left" if i == 0 else "right"}', (e['cx'], e['cy']), 4,
                          source='rule:dark (non-horn) blob centroid in face band'))

    # face skin blob -> chin / neck (chest skin excluded by blob height)
    face = None
    fb = [b for b in blobs(region(skin, int(cx - 150), int(cx + 150), hair_top_y,
                                 min(hair_top_y + 380, y1)), min_px=300)
          if b['y1'] - b['y0'] < 300]
    if fb:
        face = min(fb, key=lambda b: b['y0'])
    chin = None
    if face:
        pts = face['pts']
        k = np.argmax(pts[:, 0])
        chin = (int(pts[k][1]), int(pts[k][0]))
        L.append(lm_point('chin', chin, 5, source='rule:face skin blob lowest point'))
        L.append(lm_point('face_left', (int(pts[np.argmin(pts[:, 1])][1]),
                                        int(pts[np.argmin(pts[:, 1])][0])), 6,
                          source='rule:face skin blob lateral extreme'))
        L.append(lm_point('face_right', (int(pts[np.argmax(pts[:, 1])][1]),
                                         int(pts[np.argmax(pts[:, 1])][0])), 6,
                          source='rule:face skin blob lateral extreme'))

    # neck: narrowest skin row (>=15px) between chin and shoulders
    neck = None
    if chin:
        for y in range(chin[1] + 6, min(chin[1] + 140, y1)):
            e = row_extent(skin, y, int(cx - 90), int(cx + 90))
            if e and e[1] - e[0] + 1 >= 15 and (neck is None or
                                                (e[1] - e[0]) < (neck[1][1] - neck[1][0])):
                neck = (y, e)
    if neck:
        y, (a, b) = neck
        L.append(lm_point('neck_left', (a, y), 5, source='rule:narrowest skin row, left edge'))
        L.append(lm_point('neck_right', (b, y), 5, source='rule:narrowest skin row, right edge'))

    # shoulders: steepest silhouette widening below the neck
    if chin:
        band = [(y, row_extent(lm, y, x0, x1)) for y in range(chin[1] + 20,
                                                              min(chin[1] + 240, y1))]
        band = [(y, e) for y, e in band if e]
        best = None
        for i in range(5, len(band) - 5):
            y, e = band[i]
            w = e[1] - e[0]
            w0 = band[i - 5][1][1] - band[i - 5][1][0]
            w1 = band[i + 5][1][1] - band[i + 5][1][0]
            slope = (w1 - w0) / 10.0
            if best is None or slope > best[0]:
                best = (slope, y, e)
        if best:
            _, y, (a, b) = best
            L.append(lm_point('shoulder_left', (a, y), 10,
                              source='rule:steepest silhouette widening below chin, left edge'))
            L.append(lm_point('shoulder_right', (b, y), 10,
                              source='rule:steepest silhouette widening below chin, right edge'))
            L.append(lm_point('shoulder_line_center', ((a + b) / 2, y - 6), 6,
                              source='rule:shoulder row centre, 6px above'))
            if neck:
                L.append(lm_point('neck_base', ((neck[1][0] + neck[1][1]) / 2, neck[0]), 5,
                                  source='rule:neck narrowest skin row centre'))

    # corset / belt / sash: row-band counting (robust to gold filigree fragmentation)
    gem = [b for b in blobs(region(blue_dark, int(cx - 60), int(cx + 60), 250, 360),
                            min_px=25) if abs(b['cx'] - cx) < 45]
    if gem:
        L.append(lm_point('chest_gem', (gem[0]['cx'], gem[0]['cy']), 6,
                          source='rule:dark blue blob centroid near centre, sternum band'))

    cor = band_stats(blue_dark, int(cx - 160), int(cx + 160), 330, 395, 10)
    if cor:
        L.append(lm_point('corset_top_center', (cor['cx'], cor['y0']), 7,
                          source='rule:centred dark-blue row band top'))
        L.append(lm_point('corset_bottom_center', (cor['cx'], cor['y1']), 7,
                          source='rule:centred dark-blue row band bottom'))
        L.append(lm_point('waist_center', (cor['cx'], cor['cy']), 7,
                          source='rule:centred dark-blue row band centre'))
    belt = band_stats(gold, int(cx - 150), int(cx + 150), 378, 448, 8)
    if belt:
        L.append(lm_point('waist_belt_center', (belt['cx'], belt['cy']), 8,
                          source='rule:centred gold row band centre'))
    rg = [b for b in blobs(region(red, int(cx - 60), int(cx + 60), 360, 430), min_px=20)
          if abs(b['cx'] - cx) < 40]
    if rg:
        L.append(lm_point('sash_gem', (rg[0]['cx'], rg[0]['cy']), 8,
                          source='rule:red gem blob centroid on belt'))

    # hands / wrists: dark glove blobs on both sides (lowest point = fingers)
    for side, xr in (('left', (x0, int(cx - 60))), ('right', (int(cx + 60), x1))):
        gb = [b for b in blobs(region(dark, xr[0], xr[1], 540, 700), min_px=400)
              if b['y0'] > 520]
        if not gb:
            continue
        g = max(gb, key=lambda b: b['n'])
        pts = g['pts']
        tip = pts[np.argmax(pts[:, 0])]
        L.append(lm_point(f'hand_{side}', (tip[1], tip[0]), 8,
                          source='rule:glove blob lowest point (fingers)'))
        L.append(lm_point(f'wrist_{side}', ((g['x0'] + g['x1']) / 2, g['y0']), 10,
                          source='rule:glove blob top edge centre'))

    # hem
    hem = bottommost(lm, x0, x1, y1 - 60, y1 + 1, min_w=20)
    if hem:
        L.append(lm_point('hem_bottom_center', hem, 6, source='rule:lowest lm row centre'))
    e = row_extent(lm, hem[1] if hem else y1, x0, x1)
    if e:
        L.append(lm_point('hem_left', (e[0], hem[1] if hem else y1), 8,
                          source='rule:bottom row left edge'))
        L.append(lm_point('hem_right', (e[1], hem[1] if hem else y1), 8,
                          source='rule:bottom row right edge'))
    return L, {'hair_top_y': hair_top_y, 'chin': chin, 'neck': neck}


# ------------------------------------------------------------------- side view
def side_landmarks(rgb, m, p):
    x0, x1 = p['x']
    y0, y1 = p['y']
    lm, hair, horn, skin, dark = m['lm'], m['hair'], m['horn'], m['skin'], m['dark']
    L = []
    ht = topmost(hair, x0, x1, y0, y0 + 260, min_w=30)
    hair_top_y = ht[1] if ht else y0 + 60
    L.append(lm_point('hair_crown_top', ht, 4, source='rule:topmost hair row width>=30'))
    ah = topmost(lm, x0, x1, y0, hair_top_y, min_w=2)
    if ah:
        L.append(lm_point('ahoge_tip', ah, 4, source='rule:topmost lm row'))

    hb = blobs(region(horn, x0, x1, y0, y0 + 200), min_px=120)
    if hb:
        h = hb[0]
        pts = h['pts']
        L.append(lm_point('horn_tip_back', (pts[np.argmax(pts[:, 1])][1],
                                           pts[np.argmax(pts[:, 1])][0]), 5,
                          source='rule:horn blob rearmost point'))
        d2 = (pts[:, 1] - (x0 + 60)) ** 2 + (pts[:, 0] - hair_top_y) ** 2
        r = pts[np.argmin(d2)]
        L.append(lm_point('horn_root', (r[1], r[0]), 6,
                          source='rule:horn blob point nearest head crown'))

    # face profile: skin extremes (side view faces -x)
    face = region(skin, x0, x1, hair_top_y, hair_top_y + 330)
    fb = blobs(face, min_px=400)
    if fb:
        f = fb[0]
        pts = f['pts']
        L.append(lm_point('forehead_front', (pts[np.argmin(pts[:, 1])][1],
                                             pts[np.argmin(pts[:, 1])][0]), 5,
                          source='rule:skin blob frontmost point (forehead/nose)'))
        L.append(lm_point('chin', (pts[np.argmax(pts[:, 0])][1],
                                   pts[np.argmax(pts[:, 0])][0]), 5,
                          source='rule:skin blob lowest point'))
        L.append(lm_point('face_back', (pts[np.argmax(pts[:, 1])][1],
                                        pts[np.argmax(pts[:, 1])][0]), 6,
                          source='rule:skin blob rearmost point (ear line)'))

    # silhouette stations from the row profile
    stations = [('neck', 0.28), ('chest', 0.40), ('waist', 0.52), ('hip', 0.62),
                ('knee', 0.80), ('hem', 0.995)]
    h = y1 - y0
    for name, frac in stations:
        y = int(y0 + frac * h)
        e = row_extent(lm, y, x0, x1)
        if not e:
            continue
        L.append(lm_point(f'{name}_front', (e[0], y), 8,
                          source='rule:silhouette front edge at station row'))
        L.append(lm_point(f'{name}_back', (e[1], y), 8,
                          source='rule:silhouette back edge at station row'))

    # bust apex = frontmost silhouette point in the chest band
    band = region(lm, x0, x1, y0 + int(0.33 * h), y0 + int(0.46 * h))
    ys, xs = np.where(band)
    if xs.size:
        k = np.argmin(xs)
        L.append(lm_point('bust_front_apex', (xs[k], ys[k]), 7,
                          source='rule:frontmost silhouette point, chest band'))

    # glute apex = rearmost silhouette point in the hip band
    band = region(lm, x0, x1, y0 + int(0.55 * h), y0 + int(0.70 * h))
    ys, xs = np.where(band)
    if xs.size:
        k = np.argmax(xs)
        L.append(lm_point('glute_back_apex', (xs[k], ys[k]), 7,
                          source='rule:rearmost silhouette point, hip band'))

    # long hair tail (restricted to this panel)
    hb2 = blobs(region(hair, x0, x1, y0, y1), min_px=800)
    if hb2:
        pts = max(hb2, key=lambda b: b['n'])['pts']
        k = np.argmax(pts[:, 0])
        L.append(lm_point('hair_tail_tip', (int(pts[k][1]), int(pts[k][0])), 8,
                          source='rule:hair blob lowest point in this panel'))

    # glove / hand
    gb = blobs(region(dark, x0, x1, y0 + int(0.45 * h), y0 + int(0.75 * h)), min_px=150)
    if gb:
        g = gb[0]
        pts = g['pts']
        k = np.argmax(pts[:, 0])
        L.append(lm_point('hand_front', (pts[k][1], pts[k][0]), 9,
                          source='rule:glove blob lowest point'))
    return L, {'hair_top_y': hair_top_y}


# ------------------------------------------------------------------- back view
def back_landmarks(rgb, m, p):
    x0, x1 = p['x']
    y0, y1 = p['y']
    cx = (x0 + x1) / 2.0
    lm, hair, horn, skin = m['lm'], m['hair'], m['horn'], m['skin']
    dark, blue_dark, gold, red = m['dark'], m['blue_dark'], m['gold'], m['red']
    L = []
    ht = topmost(hair, int(cx - 180), int(cx + 180), y0, y0 + 260, min_w=40)
    hair_top_y = ht[1] if ht else y0 + 65
    L.append(lm_point('hair_crown_top', ht, 4, source='rule:topmost hair row width>=40'))
    ah = topmost(lm, int(cx - 70), int(cx + 70), y0, hair_top_y, min_w=2)
    if ah:
        L.append(lm_point('ahoge_tip', ah, 4, source='rule:topmost lm row in cx±70'))
    hb = blobs(region(horn, x0, x1, y0, y0 + 190), min_px=120)
    for side, blob in (('left', min(hb, key=lambda b: b['cx'], default=None)),
                       ('right', max(hb, key=lambda b: b['cx'], default=None))):
        if not blob:
            continue
        pts = blob['pts']
        d2 = (pts[:, 1] - cx) ** 2 + (pts[:, 0] - hair_top_y) ** 2
        tip = pts[np.argmax(d2)]
        root = pts[np.argmin(d2)]
        L.append(lm_point(f'horn_tip_{side}', (tip[1], tip[0]), 5,
                          source='rule:horn blob farthest point from crown'))
        L.append(lm_point(f'horn_root_{side}', (root[1], root[0]), 6,
                          source='rule:horn blob nearest point to crown'))
    best = None
    for y in range(hair_top_y, min(hair_top_y + 170, y1)):
        e = row_extent(hair, y, int(cx - 200), int(cx + 200))
        if e and (best is None or e[1] - e[0] > best[2] - best[1]):
            best = (y, e[0], e[1])
    if best:
        y, a, b = best
        L.append(lm_point('head_widest_left', (a, y), 5, source='rule:hair widest row left edge'))
        L.append(lm_point('head_widest_right', (b, y), 5, source='rule:hair widest row right edge'))

    # nape gem + spine chain
    rg = blobs(region(red, int(cx - 80), int(cx + 80), 300, 400), min_px=20)
    if rg:
        L.append(lm_point('nape_gem', (rg[0]['cx'], rg[0]['cy']), 7,
                          source='rule:red gem blob centroid at nape'))
    ch = blobs(region(gold, int(cx - 90), int(cx + 90), 330, 620), min_px=250)
    if ch:
        c = ch[0]
        L.append(lm_point('spine_chain_mid', (c['cx'], c['cy']), 8,
                          source='rule:gold chain blob centroid on spine'))

    # bare-back skin blob: V bottom; shoulder line = top of the bare back
    sk = blobs(region(skin, x0, x1, 320, 560), min_px=800)
    if sk:
        s = max(sk, key=lambda b: b['n'])
        pts = s['pts']
        L.append(lm_point('back_v_bottom', (int(pts[np.argmax(pts[:, 0])][1]),
                                            int(pts[np.argmax(pts[:, 0])][0])), 9,
                          source='rule:bare-back skin blob lowest point (V back)'))
        y_sh = s['y0'] + 8
        e = row_extent(lm, y_sh, x0, x1)
        if e:
            L.append(lm_point('shoulder_left', (e[0], y_sh), 10,
                              source='rule:silhouette extents at bare-back top (hair-inclusive)'))
            L.append(lm_point('shoulder_right', (e[1], y_sh), 10,
                              source='rule:silhouette extents at bare-back top (hair-inclusive)'))

    cor = band_stats(blue_dark, int(cx - 170), int(cx + 170), 392, 570, 8)
    if cor:
        L.append(lm_point('corset_top_center', (cor['cx'], cor['y0']), 7,
                          source='rule:centred dark-blue row band top (back corset)'))
        L.append(lm_point('corset_bottom_center', (cor['cx'], cor['y1']), 7,
                          source='rule:centred dark-blue row band bottom (back corset)'))
        L.append(lm_point('waist_center', (cor['cx'], cor['cy']), 7,
                          source='rule:centred dark-blue row band centre (back corset)'))
    tas = blobs(region(blue_dark, int(cx - 220), int(cx + 220), 500, 700), min_px=200)
    tas = [b for b in tas if b['n'] < 4000][:2]
    tas.sort(key=lambda b: b['cx'])
    for i, t in enumerate(tas):
        L.append(lm_point(f'tassel_{"left" if i == 0 else "right"}', (t['cx'], t['cy']), 9,
                          source='rule:blue tassel blob centroid'))
    for side, xr in (('left', (x0, int(cx - 60))), ('right', (int(cx + 60), x1))):
        gb = blobs(region(dark, xr[0], xr[1], 470, 700), min_px=200)
        if not gb:
            continue
        g = gb[0]
        pts = g['pts']
        tip = pts[np.argmax(pts[:, 1])] if side == 'left' else pts[np.argmin(pts[:, 1])]
        L.append(lm_point(f'hand_{side}', (tip[1], tip[0]), 8,
                          source='rule:glove blob outermost point'))
        L.append(lm_point(f'wrist_{side}', ((g['x0'] + g['x1']) / 2, g['y0']), 10,
                          source='rule:glove blob top edge centre'))

    hem = bottommost(lm, x0, x1, y1 - 60, y1 + 1, min_w=20)
    if hem:
        L.append(lm_point('hem_bottom_center', hem, 6, source='rule:lowest lm row centre'))
    e = row_extent(lm, hem[1] if hem else y1, x0, x1)
    if e:
        L.append(lm_point('hem_left', (e[0], hem[1] if hem else y1), 8,
                          source='rule:bottom row left edge'))
        L.append(lm_point('hem_right', (e[1], hem[1] if hem else y1), 8,
                          source='rule:bottom row right edge'))
    return L, {'hair_top_y': hair_top_y}


# ------------------------------------------------------- meter-space stations
def compute_stations(meas, rgb, m, panels, hair_crown_y):
    """Section stations in metres for the L2 cage: rx from the front view,
    ryF/ryB from the side view (silhouette-inclusive: garment + hair)."""
    front, side = panels['front'], panels['side']
    lm_f, lm_s = m['lm'], m['lm']
    sc_top, sc_bot, h_m = hair_crown_y, 1197, HEIGHT_METERS
    pxm_f = (sc_bot - sc_top) / h_m
    # side view: its own hair-crown row (width>=100) -> hem, same 1.6 m span
    side_crown = topmost(m['hair'], side['x'][0], side['x'][1], side['y'][0],
                         side['y'][0] + 320, min_w=100)
    sc_top_s = side_crown[1] if side_crown else side['y'][0] + 90
    pxm_s = (side['y'][1] - sc_top_s) / h_m

    def y_m_front(py):
        return h_m - (py - sc_top) / pxm_f

    def side_row(y_m):
        return int(sc_top_s + (h_m - y_m) * pxm_s)

    # side-view body axis: centre of the neck row extents
    neck_y_m = y_m_front(259)
    e = row_extent(lm_s, side_row(neck_y_m), side['x'][0], side['x'][1])
    body_cx = (e[0] + e[1]) / 2 if e else side['centerX']

    def front_extent(py):
        return row_extent(lm_f, py, front['x'][0], front['x'][1])

    def side_extent(py):
        return row_extent(lm_s, py, side['x'][0], side['x'][1])

    # corset band extents (torso width without the sleeves)
    cor = band_stats(m['blue_dark'], int(front['centerX'] - 160), int(front['centerX'] + 160),
                     330, 395, 10)
    # chest-skin blob top edge -> shoulder row
    sh_row = None
    sk = blobs(region(m['skin'], front['x'][0], front['x'][1], 240, 420), min_px=800)
    if sk:
        sk.sort(key=lambda b: -b['n'])
        sh_row = sk[0]['y0'] + 4

    # corset band row widths -> waist uses the narrowest row
    waist_rx = None
    if cor:
        widths = []
        for yy in range(cor['y0'], cor['y1'] + 1):
            e2 = row_extent(m['blue_dark'], yy, int(front['centerX'] - 160),
                            int(front['centerX'] + 160))
            if e2:
                widths.append((e2[1] - e2[0]) / 2 / pxm_f)
        if widths:
            waist_rx = min(widths)
    spec = [
        ('hem',        1190, 'silhouette'),
        ('skirt_wide', 1100, 'silhouette'),
        ('hip',         710, 'silhouette'),
        ('waist',       354, 'corset_min'),
        ('shoulder',    341, 'silhouette'),
        ('upper_chest', 331, 'corset'),
        ('neck',        259, 'silhouette'),
        ('head_base',   229, 'silhouette'),
        ('head_widest', 146, 'silhouette'),
        ('crown', hair_crown_y, 'silhouette'),
    ]
    out = []
    for name, py, src in spec:
        if src.startswith('corset') and cor:
            rx = waist_rx if src == 'corset_min' and waist_rx else (cor['xr'] - cor['xl']) / 2 / pxm_f
            f_row = cor['y0'] if src == 'corset' else cor['y1']
        else:
            e = front_extent(py)
            if not e:
                continue
            rx = (e[1] - e[0]) / 2 / pxm_f
            f_row = py
        ym = y_m_front(py)
        sp = side_row(ym)
        se = side_extent(sp)
        if se:
            ryF = max(0.01, (body_cx - se[0]) / pxm_s)
            ryB = max(0.01, (se[1] - body_cx) / pxm_s)
        else:
            ryF = ryB = rx * 0.8
        out.append({'name': name, 'yM': round(ym, 4), 'rx': round(rx, 4),
                    'ryF': round(ryF, 4), 'ryB': round(ryB, 4),
                    'frontRowPx': int(f_row), 'sideRowPx': int(sp),
                    'rxSource': src, 'frontExtentPx': list(e) if src != 'corset' else [cor['xl'], cor['xr']],
                    'sideExtentPx': list(se) if se else None})
    meta = {'pxPerMeterFront': round(pxm_f, 2), 'pxPerMeterSide': round(pxm_s, 2),
            'frontCrownRowPx': int(sc_top), 'frontHemRowPx': int(sc_bot),
            'sideCrownRowPx': int(sc_top_s), 'sideHemRowPx': int(side['y'][1]),
            'sideBodyAxisX': round(body_cx, 1), 'heightMeters': h_m,
            'note': 'rx from front silhouette/corset band; ryF/ryB from side silhouette '
                    '(garment+hair inclusive); +Z front = smaller side-view x'}
    return {'stations': out, 'meta': meta}


# ------------------------------------------------------------------- pose truth
def pca_axis_deg(pts_xy):
    """Principal-axis angle in degrees, image convention (dx, dy) from +x."""
    p = pts_xy.astype(np.float64)
    p = p - p.mean(axis=0)
    cov = np.cov(p.T)
    w, v = np.linalg.eigh(cov)
    ax = v[:, np.argmax(w)]
    return float(np.degrees(np.arctan2(ax[1], ax[0])))


def measure_pose():
    """Pose truth from 甘雨.png. The illustration is strongly blue-tinted, so
    hue-based masks are unreliable; this uses luminance edges plus the pale
    bare-back region (the one large low-saturation bright area)."""
    rgb = np.asarray(Image.open(ORIG).convert('RGB')).astype(np.float32)
    L = lum(rgb)
    R, G, B = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    dark = L < 95
    pale = (L > 170) & (R > G - 15) & (B < G + 40) & (R > 150)
    ev = {}

    # --- eyes (dark iris blobs) and nose/face centre
    eb = blobs(region(dark, 900, 1150, 230, 370), min_px=40)[:2]
    eb.sort(key=lambda b: b['cx'])
    if len(eb) == 2:
        p1 = (eb[0]['cx'], eb[0]['cy'])
        p2 = (eb[1]['cx'], eb[1]['cy'])
        ev['eye_line'] = {'pixel': [[round(p1[0], 1), round(p1[1], 1)],
                                    [round(p2[0], 1), round(p2[1], 1)]],
                          'angle_deg': round(float(np.degrees(np.arctan2(p2[1] - p1[1],
                                                                        p2[0] - p1[0]))), 2)}
        ev['eye_midpoint'] = [round((p1[0] + p2[0]) / 2, 1), round((p1[1] + p2[1]) / 2, 1)]

    # --- bare back: top line (shoulder axis) and centreline (spine axis)
    top_pts = []
    for x in range(900, 1045, 5):
        ys = np.where(pale[330:520, x])[0]
        if ys.size:
            top_pts.append((x, int(ys[0]) + 330))
    if len(top_pts) > 5:
        tp = np.asarray(top_pts, np.float64)
        fit = np.polyfit(tp[:, 0], tp[:, 1], 1)
        ev['back_top_line'] = {'pixel': [[int(tp[0, 0]), int(tp[0, 1])],
                                         [int(tp[-1, 0]), int(tp[-1, 1])]],
                               'slope': round(float(fit[0]), 4),
                               'angle_deg': round(float(np.degrees(np.arctan(fit[0]))), 2)}
    spine = []
    for y in range(400, 620, 5):
        xs = np.where(pale[y, 850:1100])[0]
        if xs.size > 30:
            spine.append((int(xs.mean()) + 850, y))
    if len(spine) > 5:
        sp = np.asarray(spine, np.float64)
        fit = np.polyfit(sp[:, 1], sp[:, 0], 1)
        chord_dev = float(np.max(np.abs(sp[:, 0] - np.polyval(
            np.polyfit([sp[0, 1], sp[-1, 1]], [sp[0, 0], sp[-1, 0]], 1), sp[:, 1]))))
        ev['back_centreline'] = {'pixel_first': [int(sp[0, 0]), int(sp[0, 1])],
                                 'pixel_last': [int(sp[-1, 0]), int(sp[-1, 1])],
                                 'slope_dxdy': round(float(fit[0]), 4),
                                 'chord_deviation_px': round(chord_dev, 1),
                                 'span_y_px': int(sp[-1, 1] - sp[0, 1])}

    # --- corset (dark band) top/bottom edges -> waist axis and hip axis
    def edge_line(xa, xb, yscan, downward):
        pts = []
        for x in range(xa, xb, 5):
            col = L[yscan[0]:yscan[1], x]
            idx = np.where(col < 140)[0]
            if idx.size:
                k = idx[0] if downward else idx[-1]
                pts.append((x, int(k) + yscan[0]))
        if len(pts) < 5:
            return None
        p = np.asarray(pts, np.float64)
        fit = np.polyfit(p[:, 0], p[:, 1], 1)
        return {'pixel': [[int(p[0, 0]), int(p[0, 1])], [int(p[-1, 0]), int(p[-1, 1])]],
                'slope': round(float(fit[0]), 4),
                'angle_deg': round(float(np.degrees(np.arctan(fit[0]))), 2)}

    cor_top = edge_line(920, 1100, (560, 760), True)
    if cor_top:
        ev['corset_top_edge'] = cor_top
    cor_bot = edge_line(920, 1100, (700, 860), False)
    if cor_bot:
        ev['corset_bottom_edge'] = cor_bot

    # --- sword arm: dark glove blob
    gb = blobs(region(dark, 1050, 1320, 600, 880), min_px=800)
    if gb:
        g = max(gb, key=lambda b: b['n'])
        pts = g['pts'].astype(np.float64)
        mean = pts.mean(axis=0)
        p = pts - mean
        cov = np.cov(p.T)
        w, v = np.linalg.eigh(cov)
        ax = v[:, np.argmax(w)]
        t = p @ ax
        e1, e2 = mean + ax * t.min(), mean + ax * t.max()
        if e1[1] > e2[1]:
            e1, e2 = e2, e1
        ev['sword_glove'] = {'proximal': [round(float(e1[1]), 1), round(float(e1[0]), 1)],
                             'distal': [round(float(e2[1]), 1), round(float(e2[0]), 1)],
                             'axis_deg': round(pca_axis_deg(pts[:, [1, 0]]), 1),
                             'n': int(g['n'])}

    # --- hair flow (long hair mass left of the head)
    hair2 = (B > R + 20) & (L < 185)
    hb = blobs(region(hair2, 180, 950, 130, 900), min_px=20000)
    if hb:
        h = max(hb, key=lambda b: b['n'])
        ev['hair_flow'] = {'n': int(h['n']), 'centroid': [round(h['cx'], 1), round(h['cy'], 1)],
                           'axis_deg': round(pca_axis_deg(h['pts'][:, [1, 0]]), 1),
                           'bbox': [h['x0'], h['y0'], h['x1'], h['y1']]}

    # --- skirt flow: leftmost silhouette extent per row in the skirt band
    edge_pts = []
    for y in range(660, 1050, 10):
        xs = np.where(pale[y, 250:1150] | (L[y, 250:1150] > 150))[0]
        if xs.size:
            edge_pts.append((int(xs[0]) + 250, y))
    if len(edge_pts) > 5:
        ep = np.asarray(edge_pts, np.float64)
        fit = np.polyfit(ep[:, 1], ep[:, 0], 1)
        ev['skirt_left_edge'] = {'pixel_first': [int(ep[0, 0]), int(ep[0, 1])],
                                 'pixel_last': [int(ep[-1, 0]), int(ep[-1, 1])],
                                 'slope_dxdy': round(float(fit[0]), 4),
                                 'angle_from_down_deg': round(float(np.degrees(np.arctan(
                                     fit[0]))), 2)}
    return ev


def down_angle(vec):
    dx, dy = vec
    return float(np.degrees(np.arctan2(dx, dy)))


def build_pose(ev):
    eye = ev.get('eye_line', {})
    mid = ev.get('eye_midpoint')
    spine = ev.get('back_centreline', {})
    ctop = ev.get('corset_top_edge', {})
    hair = ev.get('hair_flow', {})

    # --- joint pixels: visual grid readings on the zoom crops, verified in the overlay
    nose = (1021, 324)                 # .scratch/grid/orig_head.png
    shoulder = (1004, 382)             # .scratch/grid/orig_shoulders.png (right shoulder top)
    elbow = (1120, 680)                # .scratch/grid/orig_swordarm.png
    hand = (1228, 800)                 # .scratch/grid/orig_swordarm.png (fingers on the hilt)
    hip_ornament = (950, 730)          # .scratch/grid/orig_skirt.png
    streamer_tip = (280, 790)          # .scratch/grid/orig_skirt.png (farthest left tip)
    hair_tip = (250, 700)              # .scratch/grid/orig_full.png

    face_yaw = None
    if mid:
        face_yaw = round(float(np.degrees(np.arcsin(
            max(-1.0, min(1.0, (nose[0] - mid[0]) / 90.0))))), 1)
    sh_angle = round(down_angle((elbow[0] - shoulder[0], elbow[1] - shoulder[1])), 1)
    el_angle = round(down_angle((hand[0] - elbow[0], hand[1] - elbow[1])), 1)

    hip_slope = ctop.get('slope')
    if hip_slope is None:
        weight = {'value': 'unknown', 'method': 'waist edge not detected'}
    elif hip_slope > 0.02:
        weight = {'value': '画面左腿（她的左腿）承重',
                  'method': 'waist line (corset top edge) falls to the image right',
                  'waist_line_slope_dydx': hip_slope, 'waist_line_px': ctop.get('pixel')}
    else:
        weight = {'value': '画面右腿（她的右腿）承重',
                  'method': 'waist line (corset top edge) falls to the image left',
                  'waist_line_slope_dydx': hip_slope, 'waist_line_px': ctop.get('pixel')}

    skirt_vec = (streamer_tip[0] - hip_ornament[0], streamer_tip[1] - hip_ornament[1])
    skirt_ang = round(float(np.degrees(np.arctan2(skirt_vec[1], skirt_vec[0]))), 1)
    hair_vec = (hair_tip[0] - nose[0], hair_tip[1] - nose[1])
    hair_ang = round(float(np.degrees(np.arctan2(hair_vec[1], hair_vec[0]))), 1)

    return {
        'source': 'reference/hanfu/甘雨.png (1926x1088) — 逐项带像素实测',
        'stance': '3/4 背身回眸持剑（背视证据：颈-腰整片裸背 + 腰后蓝流苏 + 肩后蝴蝶饰）',
        'handedness': '画面右侧持剑臂=她的右臂（背视图：她的左=画面左）',
        'head_yaw_over_shoulder': {
            'value_deg': 45,
            'value_kind': 'model-clamped estimate（原画回眸超出解剖极限，取可实现角）',
            'eye_line_px': eye.get('pixel'), 'eye_line_deg': eye.get('angle_deg'),
            'eye_midpoint_px': mid, 'nose_px': list(nose),
            'face_yaw_vs_camera_deg': face_yaw,
            'face_yaw_method': 'asin((nose_x - eye_mid_x)/90)，半脸宽 90px（眼距 81px ≈ 0.45 脸宽）',
            'torso_facing': '背面朝相机 3/4（裸背顶线 + 腰后流苏可见）',
            'note': '面部投影近正面而躯干背面朝相机 → 几何差 >100°（超人体），模型取 45°'},
        'spine_arc_direction': '向画面左（她的右）',
        'spine_arc_amplitude': {
            'method': 'bare-back centreline lateral offset from the neck->waist chord',
            'chord_deviation_px': spine.get('chord_deviation_px'),
            'span_y_px': spine.get('span_y_px'),
            'centreline_px': [spine.get('pixel_first'), spine.get('pixel_last')],
            'slope_dxdy': spine.get('slope_dxdy'),
            'note': '中线由 pale(裸背) 行均值得到，含链饰/发丝遮挡，仅作幅度量级'},
        'sword_arm_shoulder_angle': {
            'value_deg': sh_angle,
            'method': 'angle of (elbow - right shoulder) from straight down',
            'shoulder_px': list(shoulder), 'elbow_px': list(elbow)},
        'sword_arm_elbow_angle': {
            'value_deg': el_angle,
            'method': 'angle of (hand - elbow) from straight down',
            'elbow_px': list(elbow), 'hand_px': list(hand),
            'glove_blob_px': ev.get('sword_glove')},
        'weight_leg': weight,
        'skirt_flow_direction': {
            'value': '向画面左下（约 175° 极角）',
            'method': 'hip ornament -> farthest streamer tip vector',
            'hip_ornament_px': list(hip_ornament), 'streamer_tip_px': list(streamer_tip),
            'angle_deg': skirt_ang,
            'left_edge_fit': ev.get('skirt_left_edge')},
        'hair_flow_direction': {
            'value': '向画面左（略向下）成束狂流，约 142° 极角',
            'method': 'nose -> hair tip vector + hair mask PCA axis',
            'nose_px': list(nose), 'hair_tip_px': list(hair_tip), 'angle_deg': hair_ang,
            'pca_axis_deg': hair.get('axis_deg'), 'bbox_px': hair.get('bbox')},
        'corset_top_edge': ctop,
        'evidence_px': ev,
    }


# ------------------------------------------------------------------------ main
def main():
    meas = json.loads(MEAS.read_text())
    rgb = np.asarray(Image.open(SHEET).convert('RGB'))
    m = masks(rgb, (240, 239, 239))
    i3 = meas['sheets']['img3']['panelsDetail']
    front, side, back = i3[0], i3[1], i3[2]

    fl, finfo = front_landmarks(rgb, m, front)
    sl, _ = side_landmarks(rgb, m, side)
    bl, _ = back_landmarks(rgb, m, back)
    # task brief: front-view CLOTHING points double their uncertainty and are low confidence
    for p_ in fl:
        if p_['name'] in FRONT_CLOTHING_POINTS:
            p_['baseUncertaintyPx'] = p_['uncertaintyPx']
            p_['uncertaintyPx'] = p_['uncertaintyPx'] * 2
            p_['confidence'] = 'low'
            p_['confidenceReason'] = '正面视图为生成推测（任务书：正面服饰点低置信，uncertainty x2）'
    pose_ev = measure_pose()
    pose = build_pose(pose_ev)

    data = {
        'schemaVersion': 1,
        'reference': 'reference/hanfu/古风甘雨三视图.png (+ 甘雨.png for pose)',
        'imageSize': meas['sheets']['img3']['size'],
        'method': ('Pillow/numpy pixel measurement on the full-resolution sheets: '
                   'background-distance silhouette (>12), colour segmentation for hair/horn/'
                   'skin/dark-blue/gold/red, silhouette extremes and row-profile stations. '
                   'Every landmark carries a rule: source string; human grid-overlay readings '
                   'are used only as cross-checks and are folded into uncertaintyPx.'),
        'status': 'measured_v2',
        'coordinateConvention': ('Image x right, y down, absolute pixels of '
                                 'reference/hanfu/古风甘雨三视图.png (2184x1230). '
                                 'Body world: +Y up, +Z front (front view looks along -Z).'),
        'scale': {
            'heightMeters': HEIGHT_METERS,
            'status': 'provisional (inherited from the previous iteration record)',
            'topPixel': finfo['hair_top_y'],
            'topPixelRule': 'topmost hair-mask row with width>=100px (head mass; ahoge+horns excluded)',
            'bottomPixel': max(p['y'][1] for p in (front, side, back)),
            'excludes': EXCLUDES,
            'note': 'hair crown to skirt hem envelope; feet hidden by the dress'},
        'measurementMetadata': {
            'sourceSheet': 'reference/hanfu/古风甘雨三视图.png',
            'panelGeometry': {'front': front, 'side': side, 'back': back},
            'panelGeometrySource': 'reference/hanfu/measurements.json (canonical mask definition)',
            'poseSource': 'reference/hanfu/甘雨.png',
            'landmarkRules': {'front': len(fl), 'side': len(sl), 'back': len(bl)}},
        'front': {'centerX': front['centerX'], 'landmarks': fl},
        'side': {'centerX': side['centerX'], 'landmarks': sl},
        'back': {'centerX': back['centerX'], 'landmarks': bl},
        'pose': pose,
    }
    st = compute_stations(meas, rgb, m, {'front': front, 'side': side},
                          finfo['hair_top_y'])
    data['stations'] = st['stations']
    data['measurementMetadata']['stationMeta'] = st['meta']
    data['measurementMetadata']['pixelPerMeter'] = round(
        (data['scale']['bottomPixel'] - data['scale']['topPixel']) / HEIGHT_METERS, 2)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    print(f"front={len(fl)} side={len(sl)} back={len(bl)}")
    for view, pts in (('front', fl), ('side', sl), ('back', bl)):
        print(f'--- {view} (centerX={data[view]["centerX"]})')
        for p in pts:
            print(f"   {p['name']:<24} {p['pixel']}  ±{p['uncertaintyPx']}px")
    print('--- pose evidence')
    print(json.dumps(pose_ev, ensure_ascii=False, indent=2)[:1800])
    print('--- pose')
    print(json.dumps({k: v for k, v in pose.items() if k != 'evidence_px'},
                     ensure_ascii=False, indent=2))
    print(f'-> {OUT.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
