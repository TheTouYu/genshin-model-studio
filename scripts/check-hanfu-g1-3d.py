#!/usr/bin/env python3
"""R4 / L3-G1：cage 剪影 IoU + 逐点 3D 误差（对 L1 关键点表）。

定义（写死，可复算）：
  投影：正/背视 (u=x, v=y)，侧视 (u=z, v=y)；像素 px = centerX + s*u*pxm，py = bottom - v*pxm
  s：正/背/侧各试 ±1，取 IoU 高者为该视图手性（R3 镜像判定即此）
  cage 剪影：cage-mesh.json 全部三角正交投影填充（PIL polygon，面数动态读）
  参考剪影：canonical extentMask = saturation>25 + 行宽≥8 且行连续≥3
  IoU：面板窗口内 cage 剪影 ∩/∪ 参考剪影
  逐点误差（S5 改口径）：每个 L1 关键点像素 → **到模型表面的最近距离**——落在剪影内=0
    （射线与模型相交），落在剪影外=到剪影边界距离（行/列极值法，px → m）
  站点 3D：L1 stations 的 (yM, rx, ryF, ryB) vs cage RINGS 同名环（缺环则线性插值）

输出 delivery/hanfu-l1/g1-3d-report.json；--check 模式仅返回退出码（全绿 0）。
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path('/home/h/genshin-model-studio')
CAGE = ROOT / 'delivery/hanfu-cage/cage-mesh.json'
REPORT = ROOT / '.scratch/l5-build-report.json'
CAGE_JSON = ROOT / 'delivery/hanfu-cage/cage.json'
LANDMARKS = ROOT / 'reference/ganyu-hanfu-landmarks.json'
SHEET = ROOT / 'reference/hanfu/古风甘雨三视图.png'
OUT = ROOT / 'delivery/hanfu-l1/g1-3d-report.json'
HEIGHT_M = 1.6
TOL_PCT = 0.02
TOL_M = HEIGHT_M * TOL_PCT
IOU_MIN = {'front': 0.88, 'back': 0.88, 'side': 0.82}   # L5-G1 阶段门（终态 0.88 另报）
AREA_RATIO_RANGE = (0.97, 1.06)                    # L5-G1 剪影收口
PANEL = {
    'front': {'x': (136, 773), 'y': (30, 1197), 'centerX': 454.5, 'bottom': 1197, 'pxm': 697.5, 'axis': 'x'},
    'side': {'x': (982, 1313), 'y': (40, 1196), 'centerX': 1147.5, 'bottom': 1196, 'pxm': 685.0, 'axis': 'z'},
    'back': {'x': (1430, 2052), 'y': (30, 1196), 'centerX': 1741.0, 'bottom': 1196, 'pxm': 697.5, 'axis': 'x'},
}


def body_mask(rgb, panel):
    """参考剪影：背景欧氏距离>26 + 行宽≥8/连续≥3 + 外部背景洪水填充（洞填充）。
    注意 extentMask(sat>25) 会漏掉浅色纱/白发 → 不能当剪影用（实测 cagePx/refPx=2.1）。"""
    x0, x1 = panel['x']
    y0, y1 = panel['y']
    win = rgb[y0:y1 + 1, x0:x1 + 1].astype(np.int32)
    bg = np.array([240, 239, 239])
    m = np.sqrt(((win - bg) ** 2).sum(axis=2)) > 26
    width = m.sum(axis=1)
    keep = np.zeros(m.shape[0], dtype=bool)
    run = 0
    for r in range(m.shape[0]):
        if width[r] >= 8:
            run += 1
            if run >= 3:
                keep[r - 2:r + 1] = True
        else:
            run = 0
    m[~keep] = False
    # 外部背景传播（PIL 12.3 floodfill 实测 no-op）
    ext = np.zeros_like(m)
    ext[0, :] = ~m[0, :]; ext[-1, :] = ~m[-1, :]; ext[:, 0] = ~m[:, 0]; ext[:, -1] = ~m[:, -1]
    for _ in range(4000):
        g = np.zeros_like(ext)
        g[1:, :] |= ext[:-1, :]; g[:-1, :] |= ext[1:, :]
        g[:, 1:] |= ext[:, :-1]; g[:, :-1] |= ext[:, 1:]
        g &= ~m
        if not (g & ~ext).any():
            break
        ext |= g
    filled = m | (~ext)
    filled[~keep] = False
    return filled


def cage_mask_view(verts, faces, panel, sign):
    """正交投影 + 三角填充 → 面板窗口布尔掩码"""
    x0, x1 = panel['x']
    y0, y1 = panel['y']
    w = x1 - x0 + 1
    h = y1 - y0 + 1
    img = Image.new('1', (w, h), 0)
    dr = ImageDraw.Draw(img)
    ax = 0 if panel['axis'] == 'x' else 2
    for f in range(0, len(faces), 3):
        pts = []
        for k in range(3):
            v = verts[faces[f + k]]
            u = v[ax]
            px = panel['centerX'] + sign * u * panel['pxm'] - x0
            py = panel['bottom'] - v[1] * panel['pxm'] - y0
            pts.append((px, py))
        dr.polygon(pts, fill=1)
    return np.array(img, dtype=bool)


def dist_to_mask(m, px, py, panel):
    """点到 cage 剪影边界距离（行/列极值法）：返回 (d_px, inside)"""
    x0, _ = panel['x']
    y0, _ = panel['y']
    cx = int(round(px - x0))
    cy = int(round(py - y0))
    h, w = m.shape
    if not (0 <= cy < h and 0 <= cx < w):
        return float('nan'), False
    inside = bool(m[cy, cx])
    d = float('inf')
    row = np.flatnonzero(m[cy])
    if row.size:
        d = min(d, abs(cx - row[0]), abs(cx - row[-1]))
    col = np.flatnonzero(m[:, cx])
    if col.size:
        d = min(d, abs(cy - col[0]), abs(cy - col[-1]))
    return d, inside


def ring_at(rings, y):
    """cage RINGS 在高度 y 处的 (rx, ryF, ryB)（线性插值）"""
    ys = [r['y'] for r in rings]
    if y <= ys[0]:
        r = rings[0]
        return r['rx'], r['ryF'], r['ryB']
    if y >= ys[-1]:
        r = rings[-1]
        return r['rx'], r['ryF'], r['ryB']
    for i in range(len(rings) - 1):
        if ys[i] <= y <= ys[i + 1]:
            t = (y - ys[i]) / (ys[i + 1] - ys[i])
            a, b = rings[i], rings[i + 1]
            return (a['rx'] + t * (b['rx'] - a['rx']),
                    a['ryF'] + t * (b['ryF'] - a['ryF']),
                    a['ryB'] + t * (b['ryB'] - a['ryB']))
    raise AssertionError('unreachable')


def main():
    cage = json.loads(CAGE.read_text())
    global CAGE_META
    CAGE_META = json.loads(CAGE_JSON.read_text()) if CAGE_JSON.exists() else {}
    verts = cage['vertices']
    faces = cage['faces']
    lm = json.loads(LANDMARKS.read_text())
    rep = json.loads(REPORT.read_text())
    rings = rep['rings']
    rgb = np.array(Image.open(SHEET).convert('RGB'))

    views = {}
    ok = True
    for name, panel in PANEL.items():
        ref = body_mask(rgb, panel)
        best = None
        for sign in (1, -1):
            cm = cage_mask_view(verts, faces, panel, sign)
            inter = int((cm & ref).sum())
            union = int((cm | ref).sum())
            iou = inter / union if union else 0.0
            if best is None or iou > best['iou']:
                best = {'sign': sign, 'iou': iou, 'mask': cm, 'inter': inter, 'union': union}
        cm = best['mask']
        points = []
        for p in lm[name]['landmarks']:
            px, py = p['pixel']
            d_px, inside = dist_to_mask(cm, px, py, panel)
            edge_m = None if np.isnan(d_px) else round(float(d_px) / panel['pxm'], 4)
            points.append({
                'name': p['name'],
                'pixel': [px, py],
                'insideCage': inside,
                'distToCageEdgePx': None if np.isnan(d_px) else round(float(d_px), 2),
                'distToCageEdgeM': edge_m,
                # S5 口径：剪影内=0（视线与模型相交，关键点落在模型上）；剪影外=到剪影边界距离
                'distToSurfaceM': 0.0 if inside else edge_m,
            })
        ds = [q['distToCageEdgeM'] for q in points if q['distToCageEdgeM'] is not None]
        ss = [q['distToSurfaceM'] for q in points if q['distToSurfaceM'] is not None]
        max_m = max(ds) if ds else None
        max_surf = max(ss) if ss else None
        views[name] = {
            'sign': best['sign'],
            'iou': round(best['iou'], 4),
            'intersectionPx': best['inter'],
            'unionPx': best['union'],
            'refPx': int(ref.sum()),
            'cagePx': int(cm.sum()),
            'landmarkCount': len(points),
            'maxDistToCageEdgeM': max_m,
            'meanDistToCageEdgeM': round(float(np.mean(ds)), 4) if ds else None,
            'maxDistToSurfaceM': max_surf,
            'areaRatio': round(float(cm.sum()) / float(ref.sum()), 4) if ref.sum() else None,
            'points': points,
        }
        ar = views[name]['areaRatio']
        if best['iou'] < IOU_MIN[name] or max_surf is None or max_surf > TOL_M:
            ok = False
        if ar is None or not (AREA_RATIO_RANGE[0] <= ar <= AREA_RATIO_RANGE[1]):
            ok = False

    # 站点 3D：L1 stations vs cage 环（同名环直接取，否则插值）
    ring_by_name = {r['name']: r for r in rings}
    stations = []
    for st in lm['stations']:
        r = ring_by_name.get(st['name'])
        if r is None:
            rx, ryF, ryB = ring_at(rings, st['yM'])
            src = 'interpolated'
        else:
            rx, ryF, ryB = r['rx'], r['ryF'], r['ryB']
            src = 'ring'
        dy = abs(r['y'] - st['yM']) if r else 0.0
        ex = abs(rx - st['rx'])
        ef = abs(ryF - st['ryF'])
        eb = abs(ryB - st['ryB'])
        stations.append({
            'name': st['name'], 'source': src,
            'yM_ref': st['yM'], 'yM_cage': r['y'] if r else None, 'dY': round(dy, 4),
            'rx_ref': st['rx'], 'rx_cage': round(rx, 4), 'dX': round(ex, 4),
            'ryF_ref': st['ryF'], 'ryF_cage': round(ryF, 4), 'dZF': round(ef, 4),
            'ryB_ref': st['ryB'], 'ryB_cage': round(ryB, 4), 'dZB': round(eb, 4),
            'maxDeltaM': round(max(ex, ef, eb), 4),
            'maxDeltaPct': round(max(ex, ef, eb) / HEIGHT_M * 100, 3),
            'pass': max(ex, ef, eb) <= TOL_M,
        })
    if not all(s['pass'] for s in stations):
        ok = False

    out = {
        'schemaVersion': 1,
        'iteration': CAGE_META.get('iteration'),
        'stage': CAGE_META.get('stage'),
        'definition': {
            'projection': 'orthographic; front/back u=x, side u=z; px=centerX+s*u*pxm, py=bottom-y*pxm',
            'signPolicy': 'per view: try s=±1, keep higher IoU (this is the R3 handedness verdict)',
            'cageSilhouette': f"cage-mesh.json {len(faces) // 3} triangles, PIL polygon fill",  # 面数动态（L5-G7 去硬编码）
            'referenceSilhouette': 'bodyMask: bg euclidean>26 + row width>=8 run>=3 + exterior flood fill (holes filled)',
            'iouMin': IOU_MIN,
            'areaRatioRange': AREA_RATIO_RANGE,
            'tolerancePctOfHeight': TOL_PCT,
            'toleranceM': TOL_M,
        },
        'views': views,
        'stations': stations,
        'checks': {
            'iou_front': views['front']['iou'], 'iou_side': views['side']['iou'], 'iou_back': views['back']['iou'],
            'iouAllPass': all(views[v]['iou'] >= IOU_MIN[v] for v in views),
            'iouMin': IOU_MIN,
            'areaRatioRange': AREA_RATIO_RANGE,
            'areaRatioFront': views['front']['areaRatio'], 'areaRatioSide': views['side']['areaRatio'],
            'areaRatioBack': views['back']['areaRatio'],
            'areaRatioPass': all(AREA_RATIO_RANGE[0] <= views[v]['areaRatio'] <= AREA_RATIO_RANGE[1] for v in views),
            'landmarkMinPerView': min(views[v]['landmarkCount'] for v in views),
            'landmarkCountPass': all(views[v]['landmarkCount'] >= 20 for v in views),
            'maxDistToSurfaceM': max(views[v]['maxDistToSurfaceM'] for v in views),
            'surfaceDistPass': all(views[v]['maxDistToSurfaceM'] <= TOL_M for v in views),
            'stationMaxDeltaPct': max(s['maxDeltaPct'] for s in stations),
            'stationPass': all(s['pass'] for s in stations),
        },
        'ok': bool(ok),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(json.dumps(out['checks'], ensure_ascii=False, indent=1))
    for v in views:
        print(f"{v}: sign={views[v]['sign']} IoU={views[v]['iou']} pts={views[v]['landmarkCount']} "
              f"maxDistM={views[v]['maxDistToCageEdgeM']} cagePx={views[v]['cagePx']} refPx={views[v]['refPx']}")
    print('ok =', out['ok'])
    return 0 if out['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
