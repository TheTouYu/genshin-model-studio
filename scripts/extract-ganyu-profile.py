#!/usr/bin/env python3
"""extract-ganyu-profile.py — 从用户提供的三视图原图提取身体曲线/颜色分带（不靠记忆）。

输出：
  reference/ganyu-3view.png        原图（已保存）
  reference/ganyu-{front,side,back}.png   三视图裁剪
  reference/ganyu-{front,side,back}-overlay.png  剪影轮廓叠加（人工复核）
  reference/ganyu-profile.json     归一化高度 → 宽度/深度/色带占比（供建模脚本读数）
"""
import json, os
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'reference', 'ganyu-3view.png')
OUT = os.path.join(ROOT, 'reference')

img = Image.open(REF).convert('RGB')
W, H = img.size
a = np.asarray(img).astype(np.int16)

# 背景 = 图像四角/边缘灰色（均值颜色），前景 = 与背景距离 > 阈值
corners = np.concatenate([a[:4, :4].reshape(-1, 3), a[:4, -4:].reshape(-1, 3),
                          a[-4:, :4].reshape(-1, 3), a[-4:, -4:].reshape(-1, 3)])
bg = corners.mean(axis=0)
dist = np.abs(a - bg).max(axis=2)
fg = dist > 40

def col_ranges(mask, min_gap=20):
    cols = mask.any(axis=0)
    ranges, start = [], None
    for x, v in enumerate(cols):
        if v and start is None: start = x
        elif not v and start is not None:
            if start is not None: ranges.append([start, x]); start = None
    if start is not None: ranges.append([start, W])
    # 合并小间隙
    merged = []
    for r in ranges:
        if merged and r[0] - merged[-1][1] < min_gap: merged[-1][1] = r[1]
        else: merged.append(r)
    return [r for r in merged if r[1] - r[0] > W * 0.08]

views = col_ranges(fg)
print("VIEW_RANGES:", views)
if len(views) != 3:
    # 兜底：按期望三分
    views = [[0, W // 3], [W // 3, 2 * W // 3], [2 * W // 3, W]]
    print("forced 3-way split")

names = ['front', 'side', 'back']

def classify(px):
    r, g, b = int(px[0]), int(px[1]), int(px[2])
    if r > 200 and g > 200 and b > 200: return 'white'
    if b > 150 and b > r + 30 and b > g + 10: return 'hair'      # 浅蓝发
    if r > 150 and g > 110 and b > 90 and r > g > b: return 'skin'  # 肤色（粉/黄白）
    if r < 90 and g < 90 and b < 90: return 'dark'
    if r > 100 and r > g + 50 and r > b + 50: return 'red'        # 暗红角
    if b > r + 20 and b > g + 8: return 'blue'
    return 'other'

classes = ['white', 'hair', 'skin', 'blue', 'red', 'dark', 'other']
profile = {}
for name, (x0, x1) in zip(names, views):
    sub = fg[:, x0:x1]
    ys = np.where(sub.any(axis=1))[0]
    if len(ys) == 0: continue
    y0, y1 = int(ys.min()), int(ys.max())   # y0=顶部, y1=脚底
    subimg = a[y0:y1 + 1, x0:x1]
    subfg = sub[y0:y1 + 1]
    hh = y1 - y0 + 1
    # 中轴：脚/腿行（w 较小、双臂未张开）的中点中位数
    axis = None
    cand_axis = []
    for k in range(4, 24):
        yy = int(round((63 - k) / 63.0 * (hh - 1)))
        m = subfg[yy]
        xs2 = np.where(m)[0]
        if len(xs2): cand_axis.append((xs2.min() + xs2.max()) / 2)
    if cand_axis:
        cand_axis.sort()
        axis = cand_axis[len(cand_axis) // 2]
    def row_runs(m, xs):
        runs, s = [], None
        for xx in range(int(xs.min()), int(xs.max()) + 2):
            if xx <= int(xs.max()) and m[xx]:
                if s is None: s = xx
            else:
                if s is not None: runs.append([s, xx - 1]); s = None
        return runs
    # 归一化行样本（0=脚底, 1=头顶），64 档
    rows = []
    for k in range(64):
        yy = int(round((63 - k) / 63.0 * (hh - 1)))
        row = max(0, min(hh - 1, yy))
        m = subfg[row]
        xs = np.where(m)[0]
        if len(xs) == 0:
            rows.append({'h': round(k / 63.0, 3), 'w': 0, 'bodyW': 0, 'minX': 0, 'maxX': 0, 'bands': {}})
            continue
        wpx = int(xs.max() - xs.min() + 1)
        # 身体宽度 = 包含身体中轴（axis）的连续段（避开张开的双臂/马尾，提取躯干/腿主段）
        runs = row_runs(m, xs)
        bodyW = 0
        if runs:
            cand = None
            if axis is not None:
                for r in runs:
                    if r[0] - 6 <= axis <= r[1] + 6: cand = r; break
            if cand is None:
                cand = min(runs, key=lambda r: abs((r[0] + r[1]) / 2 - (axis if axis is not None else (xs.min() + xs.max()) / 2)))
            # 若中轴 run 明显小于最大 run（臂/发与躯干分离），仍以中轴 run 为准（躯干主体）
            bodyW = int(cand[1] - cand[0] + 1)
        counts = {}
        for j in xs:
            c = classify(subimg[row, int(j)])
            counts[c] = counts.get(c, 0) + 1
        tot = sum(counts.values()) or 1
        rows.append({'h': round(k / 63.0, 3), 'w': wpx, 'bodyW': bodyW,
                     'minX': int(xs.min()), 'maxX': int(xs.max()),
                     'runsPx': [[int(a), int(b)] for a, b in runs],
                     'bands': {c: round(v / tot, 3) for c, v in counts.items()}})
    # 平滑身体宽度（5 点中值，过滤影子行）
    bw = [r['bodyW'] for r in rows]
    for i in range(len(rows)):
        lo = max(0, i - 2); hi = min(len(rows), i + 3)
        vals = [bw[j] for j in range(lo, hi) if bw[j] > 2]
        if vals: rows[i]['bodyW'] = int(sorted(vals)[len(vals) // 2])
    profile[name] = {'x0': x0, 'x1': x1, 'yTop': y0, 'yBot': y1, 'heightPx': hh, 'axis': axis, 'rows': rows}
    # 保存裁剪图 + 轮廓叠加
    crop = img.crop((x0, y0, x1, y1 + 1))
    crop.save(os.path.join(OUT, f'ganyu-{name}.png'))
    ov = crop.convert('RGB').copy()
    d = ImageDraw.Draw(ov)
    for row in rows:
        yy = int((1 - row['h']) * (hh - 1))
        if row['w']:
            d.line([(row['minX'], yy), (row['maxX'], yy)], fill=(255, 0, 0), width=1)
    ov.save(os.path.join(OUT, f'ganyu-{name}-overlay.png'))

with open(os.path.join(OUT, 'ganyu-profile.json'), 'w') as f:
    json.dump(profile, f, ensure_ascii=False, indent=1)

# ---------- 生成「测量环」：front 宽度 + side 深度 → 世界截面环（供建模脚本直接使用） ----------
H_M = 1.18  # 脚底→发顶/角顶 总高（米），按我们模型世界比例
def nearest(rows, h):
    return min(rows, key=lambda r: abs(r['h'] - h))
RINGS_HS = [0.46, 0.52, 0.58, 0.64, 0.70, 0.76, 0.82, 0.88, 0.94]
rings = []
for h in RINGS_HS:
    fr = nearest(profile['front']['rows'], h)
    sd = nearest(profile['side']['rows'], h)
    sy = profile['front']['heightPx']
    ss = profile['side']['heightPx']
    scale_f = H_M / max(sy, 1)
    scale_s = H_M / max(ss, 1)
    rx = max(fr['bodyW'] or fr['w'], 0) / 2 * scale_f
    ry = max(sd['bodyW'] or sd['w'], 0) / 2 * scale_s
    bands = fr['bands']
    label = max([c for c in bands if c != 'other'], key=bands.get) if bands else 'other'
    rings.append({'h': round(h, 3), 'y': round(h * H_M, 4), 'rx': round(rx, 4), 'ry': round(ry, 4), 'cz': -0.02, 'label': label})
with open(os.path.join(OUT, 'ganyu-rings.json'), 'w') as f:
    json.dump({'H_M': H_M, 'rings': rings}, f, ensure_ascii=False, indent=1)
print("\n== MEASURED RINGS (embed into model script) ==")
for r in rings:
    print(f"  {{ y: {r['y']}, rx: {r['rx']}, ry: {r['ry']}, cz: -0.02 }}, // h={r['h']} {r['label']}")

print("SAVED:", [p for p in sorted(os.listdir(OUT)) if p.startswith('ganyu')])

# ---------- 密集测量数据（v9 建模脚本直接消费） ----------
def dominant(bands):
    cand = {k: v for k, v in bands.items() if k != 'other' and v > 0.15}
    if not cand: cand = bands
    if not cand: return 'other'
    return max(cand, key=cand.get)
TORSO_HS = [round(0.42 + i * 0.028, 3) for i in range(21)]  # 0.42..0.98
leg_hs = [0.04, 0.08, 0.12, 0.16, 0.21, 0.26, 0.31, 0.36, 0.41, 0.46, 0.50, 0.55]
arm_hs = [0.52, 0.56, 0.60, 0.64, 0.68, 0.72, 0.76, 0.80]
front = profile['front']; side = profile['side']
scf = H_M / front['heightPx']; scs = H_M / side['heightPx']
axis_f = front.get('axis', 193)
dense = {'H_M': H_M, 'torso': [], 'leg': [], 'arm': [], 'marks': {}}
for h in TORSO_HS:
    fr = nearest(front['rows'], h); sd = nearest(side['rows'], h)
    rx = max(fr['bodyW'] or fr['w'], 0) / 2 * scf
    ry = max(sd['bodyW'] or sd['w'], 0) / 2 * scs
    dense['torso'].append({'y': round(h * H_M, 4), 'rx': round(rx * 1.15, 4), 'ry': round(ry, 4),
                           'cz': -0.02, 'color': dominant(fr['bands'])})
for h in leg_hs:
    fr = nearest(front['rows'], h); sd = nearest(side['rows'], h)
    runs = [r for r in fr.get('runsPx', []) if r[1] - r[0] >= 4]
    Ls = [r for r in runs if (r[0] + r[1]) / 2 < axis_f]
    Rs = [r for r in runs if (r[0] + r[1]) / 2 > axis_f]
    L = max(Ls, key=lambda r: r[1] - r[0]) if Ls else [axis_f - 5, axis_f - 5]
    R = max(Rs, key=lambda r: r[1] - r[0]) if Rs else [axis_f + 5, axis_f + 5]
    ry = max(sd.get('bodyW') or sd.get('w'), 0) / 2 * scs
    dense['leg'].append({'y': round(h * H_M, 4),
                         'cxL': round(((L[0] + L[1]) / 2 - axis_f) * scf, 4),
                         'cxR': round(((R[0] + R[1]) / 2 - axis_f) * scf, 4),
                         'rx': round(max(L[1] - L[0] + 1, R[1] - R[0] + 1) / 2 * scf, 4),
                         'ry': round(ry, 4), 'color': dominant(fr['bands'])})
for h in arm_hs:
    fr = nearest(front['rows'], h)
    runs = [r for r in fr.get('runsPx', []) if r[1] - r[0] >= 6]
    Ls = [r for r in runs if (r[0] + r[1]) / 2 < axis_f - 40]
    Rs = [r for r in runs if (r[0] + r[1]) / 2 > axis_f + 40]
    D = {'y': round(h * H_M, 3), 'color': dominant(fr['bands'])}
    if Ls:
        L = max(Ls, key=lambda r: r[1] - r[0]); D['cxL'] = round(((L[0] + L[1]) / 2 - axis_f) * scf, 4); D['rL'] = round((L[1] - L[0] + 1) / 2 * scf, 4)
    if Rs:
        R = max(Rs, key=lambda r: r[1] - r[0]); D['cxR'] = round(((R[0] + R[1]) / 2 - axis_f) * scf, 4); D['rR'] = round((R[1] - R[0] + 1) / 2 * scf, 4)
    dense['arm'].append(D)
# 衣装边界：按主导色变迁
prev = None
for h in [round(i * 0.02, 2) for i in range(0, 51)]:
    fr = nearest(front['rows'], h); c = dominant(fr['bands'])
    if c != prev and c in ('white', 'skin', 'hair', 'blue'):
        dense['marks']["%.2f" % h] = c
    prev = c
with open(os.path.join(OUT, 'ganyu-dense.js'), 'w') as f:
    f.write('// 自动生成：extract-ganyu-profile.py → 甘雨三视图逐行测量（不靠记忆）\n')
    f.write('window.GANYU_DENSE = ' + json.dumps(dense, ensure_ascii=False, indent=1) + ';\n')
print("\nDENSE torso rings:", len(dense['torso']), "leg:", len(dense['leg']), "arm:", len(dense['arm']), "marks:", len(dense['marks']))
print("SAVED ganyu-dense.js")
for name in names:
    p = profile.get(name)
    if not p: continue
    print(f"\n== {name} heightPx={p['heightPx']} ==")
    for row in p['rows'][::6]:
        print(f"  h={row['h']:.2f} w={row['w']} bands={row['bands']}")
