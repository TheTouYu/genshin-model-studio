#!/usr/bin/env python3
"""Hanfu reference-sheet measurement engine (L1 stage, schema v2).

Canonical geometry definition (matches .scratch/probe-mask-scan.py exactly):
  * extent mask: 3-view / original -> HSV-ish saturation > 25
                  dark-background sheets -> |luminance - bg| > 60
  * panels: column occupancy >= 3 px, split on gaps > 30 px
  * bbox rows: width >= 8 px kept only inside runs of >= 3 consecutive rows
    (removes the 1px sheet border and stray specks); columns: count >= 3

Extra profiles (for landmark placement, not for the canonical bbox):
  * body mask: background euclidean distance > 26 (keeps white hair + skin,
    which a saturation mask drops), same row-run trim
  * row-width profile + column profile per panel
  * candidate feature rows (top / head max / neck min / shoulder / waist /
    hip / hem max / bottom)

Usage:
  python scripts/measure-hanfu-refs.py            # measure, write json, print
  python scripts/measure-hanfu-refs.py --check    # gate: exit 0/1
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / 'reference' / 'hanfu'
OUT_JSON = REF / 'measurements.json'

SAT_THRESHOLD = 25
LUM_DELTA = 60.0
BG_DISTANCE = 26.0
MIN_ROW_WIDTH = 8
MIN_ROW_RUN = 3
MIN_COL_COUNT = 3
GAP_MIN = 30

# Task-brief claims (docs/hanfu-s1b-agent-prompt.md §1) used only for delta report.
BRIEF = {
    'img3_size': (2184, 1230),
    'img3_heights': (1168, 1158, 1166),
    'img3_x_ranges': ((144, 766), (982, 1316), (1438, 2046)),
    'img3_spread_pct': 0.86,
    'wire_size': (1661, 957),
    'wire_heights': (908, 902, 908),
    'wire_botFrac': 0.978,
    'white_size': (1675, 957),
}
# Tolerances justified in iteration-records/36: heights reproduce to +-1px,
# x-ranges depend on an unspecified mask (brief trims thin strands/veil).
TOL = {
    'height_px': 2,
    'wire_height_px': 12,
    'x_range_px': 32,
    'spread_pct': 0.15,
    'botFrac': 0.005,
}


def sat_mask(rgb):
    a = rgb.astype(np.float32)
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1.0) * 255.0, 0.0)
    return sat > SAT_THRESHOLD


def lum_mask(rgb, bg):
    a = rgb.astype(np.float32)
    lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    return np.abs(lum - bg) > LUM_DELTA


def bg_mask(rgb, bg_rgb):
    d = np.linalg.norm(rgb.astype(np.float32) - np.asarray(bg_rgb, np.float32), axis=2)
    return d > BG_DISTANCE


def keep_runs(keep, minlen):
    out = np.zeros_like(keep)
    i, n = 0, len(keep)
    while i < n:
        if keep[i]:
            j = i
            while j + 1 < n and keep[j + 1]:
                j += 1
            if j - i + 1 >= minlen:
                out[i:j + 1] = True
            i = j + 1
        else:
            i += 1
    return out


def split_panels(mask):
    occ = mask.sum(axis=0)
    cols = np.where(occ >= MIN_COL_COUNT)[0]
    if cols.size == 0:
        return []
    groups, start, prev = [], int(cols[0]), int(cols[0])
    for c in cols[1:]:
        c = int(c)
        if c - prev > GAP_MIN:
            groups.append((start, prev))
            start = c
        prev = c
    groups.append((start, prev))
    return groups


def panel_bbox(mask, x0, x1):
    sub = mask[:, x0:x1 + 1]
    rows = np.where(keep_runs(sub.sum(axis=1) >= MIN_ROW_WIDTH, MIN_ROW_RUN))[0]
    cols = np.where(sub.sum(axis=0) >= MIN_COL_COUNT)[0]
    if rows.size == 0 or cols.size == 0:
        return None
    return {'x': [int(cols[0]) + x0, int(cols[-1]) + x0],
            'y': [int(rows[0]), int(rows[-1])],
            'height': int(rows[-1] - rows[0] + 1)}


def row_profile(mask, x0, x1):
    sub = mask[:, x0:x1 + 1]
    widths = sub.sum(axis=1)
    keep = keep_runs(widths >= MIN_ROW_WIDTH, MIN_ROW_RUN)
    return widths, keep


def candidate_rows(widths, keep, y0, y1):
    """Silhouette station candidates from the row-width profile."""
    idx = np.arange(len(widths))
    valid = keep & (idx >= y0) & (idx <= y1)
    h = y1 - y0 + 1
    bands = {
        'top': (y0, y0 + int(0.08 * h)),
        'head': (y0 + int(0.08 * h), y0 + int(0.22 * h)),
        'neck': (y0 + int(0.20 * h), y0 + int(0.30 * h)),
        'shoulder': (y0 + int(0.25 * h), y0 + int(0.38 * h)),
        'chest': (y0 + int(0.33 * h), y0 + int(0.46 * h)),
        'waist': (y0 + int(0.42 * h), y0 + int(0.58 * h)),
        'hip': (y0 + int(0.55 * h), y0 + int(0.72 * h)),
        'hem': (y0 + int(0.85 * h), y1),
    }
    out = {}
    for name, (a, b) in bands.items():
        sel = valid & (idx >= a) & (idx <= b)
        if not sel.any():
            continue
        w = np.where(sel, widths, -1)
        out[name] = {'yMax': int(np.argmax(w)), 'wMax': int(w.max()),
                     'yMin': int(np.argmin(np.where(sel, widths, 10 ** 9))),
                     'wMin': int(widths[sel].min())}
    out['topRow'] = int(y0)
    out['bottomRow'] = int(y1)
    out['height'] = int(h)
    return out


def measure_sheet(path, mode, **kw):
    im = Image.open(path).convert('RGB')
    rgb = np.asarray(im)
    h, w = rgb.shape[:2]
    ext = sat_mask(rgb) if mode == 'sat' else lum_mask(rgb, kw['bg'])
    rec = {'size': [w, h], 'mode': mode, 'panels': [], 'panelsDetail': []}
    for x0, x1 in split_panels(ext):
        bb = panel_bbox(ext, x0, x1)
        if not bb:
            continue
        rec['panels'].append(bb)
        rec['panelsDetail'].append({'panelWindow': [x0, x1], **bb,
                                    'width': bb['x'][1] - bb['x'][0] + 1,
                                    'centerX': (bb['x'][0] + bb['x'][1]) / 2.0})
    if rec['panels']:
        hs = [p['height'] for p in rec['panels']]
        rec['heights'] = hs
        rec['spread_pct'] = round((max(hs) - min(hs)) / (sum(hs) / len(hs)) * 100.0, 3)
        if len(rec['panels']) == 1:
            rec['botFrac'] = round((rec['panels'][0]['y'][1] + 1) / h, 4)
    # body mask profile per panel (landmark support)
    bm = bg_mask(rgb, kw['bgRgb']) if 'bgRgb' in kw else None
    if bm is not None:
        rec['profiles'] = []
        for bb in rec['panels']:
            x0, x1 = bb['x']
            widths, keep = row_profile(bm, x0, x1)
            y0, y1 = bb['y']
            rec['profiles'].append({
                'x': [x0, x1],
                'rowWidth': [int(v) for v in widths[y0:y1 + 1]],
                'rowWidthOrigin': int(y0),
                'candidates': candidate_rows(widths, keep, y0, y1),
            })
    return rec


def build_measurements():
    sheets = {
        'img3': measure_sheet(REF / '古风甘雨三视图.png', 'sat',
                              bgRgb=(240, 239, 239)),
        'wire': measure_sheet(REF / '古风甘雨三视图-线框图.png', 'lum', bg=53.0,
                              bgRgb=(53, 53, 53)),
        'white': measure_sheet(REF / '甘雨-白膜线框图.png', 'lum', bg=51.0,
                               bgRgb=(51, 51, 50)),
        'orig': measure_sheet(REF / '甘雨.png', 'sat', bgRgb=None),
    }
    definition = {
        'extentMask': f'saturation>{SAT_THRESHOLD} (color sheets) / '
                      f'|lum-bg|>{LUM_DELTA:.0f} (dark sheets)',
        'bodyMask': f'euclidean distance from background >{BG_DISTANCE:.0f}',
        'panelSplit': f'column occupancy>={MIN_COL_COUNT}, gap>{GAP_MIN}',
        'rowTrim': f'row width>={MIN_ROW_WIDTH} inside runs of >={MIN_ROW_RUN}',
        'note': 'row-run trim removes the 1px sheet border row and stray specks',
    }
    return {'schemaVersion': 2, 'definition': definition, 'brief': {
        'img3_size': list(BRIEF['img3_size']),
        'img3_heights': list(BRIEF['img3_heights']),
        'img3_x_ranges': [list(r) for r in BRIEF['img3_x_ranges']],
        'img3_spread_pct': BRIEF['img3_spread_pct'],
        'wire_size': list(BRIEF['wire_size']),
        'wire_heights': list(BRIEF['wire_heights']),
        'wire_botFrac': BRIEF['wire_botFrac'],
        'white_size': list(BRIEF['white_size']),
    }, 'sheets': sheets}


def delta_report(m):
    d = {}
    i3 = m['sheets']['img3']
    d['img3_size'] = {'measured': i3['size'], 'brief': list(BRIEF['img3_size'])}
    d['img3_heights'] = {'measured': i3.get('heights'), 'brief': list(BRIEF['img3_heights']),
                         'delta': [a - b for a, b in zip(i3.get('heights', []),
                                                        BRIEF['img3_heights'])]}
    d['img3_x_ranges'] = {'measured': [p['x'] for p in i3['panels']],
                          'brief': [list(r) for r in BRIEF['img3_x_ranges']],
                          'delta': [[a - b for a, b in zip(p['x'], r)]
                                    for p, r in zip(i3['panels'], BRIEF['img3_x_ranges'])]}
    d['img3_spread_pct'] = {'measured': i3.get('spread_pct'),
                            'brief': BRIEF['img3_spread_pct']}
    w = m['sheets']['wire']
    d['wire_heights'] = {'measured': w.get('heights'), 'brief': list(BRIEF['wire_heights']),
                         'delta': [a - b for a, b in zip(w.get('heights', []),
                                                        BRIEF['wire_heights'])]}
    d['wire_botFrac'] = {'measured': round((w['panels'][0]['y'][1] + 1) / w['size'][1], 4)
                         if w['panels'] else None, 'brief': BRIEF['wire_botFrac']}
    d['white_size'] = {'measured': m['sheets']['white']['size'],
                       'brief': list(BRIEF['white_size'])}
    return d


def run_checks(m):
    checks = {}
    i3 = m['sheets']['img3']
    w = m['sheets']['wire']
    wh = m['sheets']['white']

    def chk(name, ok, detail):
        checks[name] = {'ok': bool(ok), 'detail': detail}

    chk('img3_size', tuple(i3['size']) == BRIEF['img3_size'],
        f"{i3['size']} vs {list(BRIEF['img3_size'])}")
    chk('img3_panels', len(i3['panels']) == 3, f"panels={len(i3['panels'])}")
    hd = [a - b for a, b in zip(i3.get('heights', []), BRIEF['img3_heights'])]
    chk('img3_heights', all(abs(x) <= TOL['height_px'] for x in hd) and len(hd) == 3,
        f"{i3.get('heights')} delta={hd} tol=±{TOL['height_px']}px")
    chk('img3_spread', abs(i3.get('spread_pct', 9) - BRIEF['img3_spread_pct'])
        <= TOL['spread_pct'],
        f"{i3.get('spread_pct')}% vs {BRIEF['img3_spread_pct']}% "
        f"tol=±{TOL['spread_pct']}pp")
    xd = [[a - b for a, b in zip(p['x'], r)]
          for p, r in zip(i3['panels'], BRIEF['img3_x_ranges'])]
    chk('img3_x_ranges', all(abs(v) <= TOL['x_range_px'] for d in xd for v in d),
        f"deltas={xd} tol=±{TOL['x_range_px']}px (mask-definition dependent)")
    chk('wire_size', tuple(w['size']) == BRIEF['wire_size'],
        f"{w['size']} vs {list(BRIEF['wire_size'])}")
    chk('wire_panels', len(w['panels']) == 3, f"panels={len(w['panels'])}")
    wd = [a - b for a, b in zip(w.get('heights', []), BRIEF['wire_heights'])]
    chk('wire_heights', all(abs(x) <= TOL['wire_height_px'] for x in wd)
        and len(wd) == 3, f"{w.get('heights')} delta={wd} tol=±{TOL['wire_height_px']}px")
    if w['panels']:
        bf = (w['panels'][0]['y'][1] + 1) / w['size'][1]
        chk('wire_botFrac', abs(bf - BRIEF['wire_botFrac']) <= TOL['botFrac'],
            f"{bf:.4f} vs {BRIEF['wire_botFrac']} tol=±{TOL['botFrac']}")
    chk('white_size', tuple(wh['size']) == BRIEF['white_size'],
        f"{wh['size']} vs {list(BRIEF['white_size'])}")
    return checks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    m = build_measurements()
    m['briefDelta'] = delta_report(m)
    m['checks'] = run_checks(m)
    OUT_JSON.write_text(json.dumps(m, ensure_ascii=False, indent=2))

    ok = all(c['ok'] for c in m['checks'].values())
    if not args.check:
        print(json.dumps({'definition': m['definition'],
                          'briefDelta': m['briefDelta'],
                          'checks': m['checks']}, ensure_ascii=False, indent=2))
    else:
        for name, c in m['checks'].items():
            print(f"[{'PASS' if c['ok'] else 'FAIL'}] {name}: {c['detail']}")
    print(f"-> {OUT_JSON.relative_to(ROOT)}  checks {'ALL PASS' if ok else 'HAS FAIL'}")
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
