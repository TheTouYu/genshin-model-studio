#!/usr/bin/env python3
"""connectivity-check.py — 组件连接图核验（方法论见 METHODOLOGY.md）

用法: python3 benchmark/connectivity-check.py <items.json> [--task T6]

对 T6 摩天轮：按受力链逐对核验"应当接触"的连接点（间隙 ≤ 0 = 接触/插入）
与"应当分离"的空间对（不重叠），输出间隙表 + 悬空/重叠清单。
确定性、可离线重算（--rescore 语义：同一输入同一输出）。
"""
import json, math, sys

def cyl_axis(rot):
    rx, ry, rz = (math.radians(x) for x in rot)
    cx, sx = math.cos(rx), math.sin(rx); cy, sy = math.cos(ry), math.sin(ry); cz, sz = math.cos(rz), math.sin(rz)
    v = [0, 1, 0]
    v = [v[0], cx*v[1]-sx*v[2], sx*v[1]+cx*v[2]]
    v = [cy*v[0]+sy*v[2], v[1], -sy*v[0]+cy*v[2]]
    v = [cz*v[0]-sz*v[1], sz*v[0]+cz*v[1], v[2]]
    return v

def endpoints(it):
    d, L, _ = it['scale']
    ax = cyl_axis(it['rotation'])
    h = L / 2
    return ([it['position'][i] - ax[i]*h for i in range(3)],
            [it['position'][i] + ax[i]*h for i in range(3)])

def dist(p, q): return math.dist(p, q)
def near(a, b, tol=1e-3): return abs(a - b) <= tol

def classify(items):
    """角色聚类（T6：环段/支架/轮辐/横杆/挂杆/绳索/座舱/轴盘）"""
    rings, poles, spokes, beams, hangs, ropes, cabins, hub = [], [], [], [], [], [], [], None
    for it in items:
        d, L, _ = it['scale']
        if near(d, 0.025) and L < 0.1: rings.append(it)
        elif near(d, 0.025) and L > 1: poles.append(it)
        elif near(d, 0.012) and 0.6 < L < 0.8: spokes.append(it)
        elif near(d, 0.04): beams.append(it)
        elif near(d, 0.012) and near(L, 0.14): hangs.append(it)
        elif near(d, 0.012) and near(L, 0.06): ropes.append(it)
        elif near(d, 0.2): cabins.append(it)
        elif near(d, 0.11): hub = it
    return rings, poles, spokes, beams, hangs, ropes, cabins, hub

def surface_gap(it, pt):
    """点到圆柱表面间隙（<0 = 插入）"""
    ax = cyl_axis(it['rotation'])
    d, L, _ = it['scale']
    c = it['position']
    v = [pt[i]-c[i] for i in range(3)]
    along = sum(v[i]*ax[i] for i in range(3))
    radial = math.sqrt(max(0, sum(x*x for x in v) - along*along))
    if abs(along) > L/2:
        return math.sqrt((abs(along)-L/2)**2 + max(0, radial-d/2)**2)
    return radial - d/2

T6 = dict(H=1.25, R=0.75, ringZ=0.12, ringInnerZ=0.1075, hubR=0.055,
          spokeR=0.006, beamR=0.020, beamSurfaceR=0.730, poleZ=0.2225,
          axleFaceZ=0.21, spokeInnerR=0.061)

def verify(items, params=T6):
    rings, poles, spokes, beams, hangs, ropes, cabins, hub = classify(items)
    H, R = params['H'], params['R']
    fails, table = [], []

    def record(name, gap, detail='', sep=False):
        # 接触类（sep=False）：gap ≤ 0 = 接触/插入（OK）；gap > 0 = 悬空（X）
        # 分离类（sep=True）：gap ≥ 0 = 有间隙（OK）；gap < 0 = 重叠/穿模（X）
        table.append((name, round(gap, 4), detail, sep))
        bad = (gap > 1e-3) if not sep else (gap < -1e-3)
        if bad: fails.append((name, round(gap, 4), detail))

    def record_sep(name, gap, detail=''):
        record(name, gap, detail, sep=True)

    # 1) 支架：底接地 + 顶贴轴端面
    for p in poles:
        e1, e2 = endpoints(p)
        ymin = min(e1[1], e2[1]); top = e1 if e1[1] > e2[1] else e2
        record('支架底接地', ymin)
        record('支架顶贴轴端面', abs(abs(top[2]) - params['axleFaceZ']) - 0.0125)

    # 2) 轮辐：内端贴轴盘 + 外端插横杆
    for s in spokes:
        e1, e2 = endpoints(s)
        d1, d2 = dist(e1, [0, H, 0]), dist(e2, [0, H, 0])
        inner, outer = (e1, e2) if d1 < d2 else (e2, e1)
        record('轮辐内端贴轴盘', dist(inner, [0, H, inner[2]]) - params['spokeInnerR'])
        th = math.atan2(outer[1]-H, outer[0])
        beam = next((b for b in beams if abs(math.atan2(b['position'][1]-H, b['position'][0]) - th) < 0.1), None)
        if beam is None:
            fails.append(('轮辐外端无横杆承接', 999, '')); continue
        record('轮辐外端插横杆', surface_gap(beam, outer))

    # 3) 横杆两端插环
    for b in beams:
        e1, e2 = endpoints(b)
        record('横杆端插环', params['ringInnerZ'] - max(abs(e1[2]), abs(e2[2])))

    # 4) 挂杆：根在轮辐中心线 + 悬臂端不穿横杆
    for hg in hangs:
        e1, e2 = endpoints(hg)
        d1, d2 = dist(e1, [0, H, 0]), dist(e2, [0, H, 0])
        root = e1 if d1 < d2 else e2
        th = math.atan2(root[1]-H, root[0])
        spoke = next((s for s in spokes if abs(math.atan2(s['position'][1]-H, s['position'][0]) - th) < 0.1), None)
        if spoke is not None:
            se1, se2 = endpoints(spoke)
            s_inner = se1 if dist(se1, [0, H, 0]) < dist(se2, [0, H, 0]) else se2
            s_outer = se1 if dist(se1, [0, H, 0]) > dist(se2, [0, H, 0]) else se2
            dirv = [(s_outer[i]-s_inner[i]) for i in range(3)]
            Ls = math.sqrt(sum(x*x for x in dirv)); dirv = [x/Ls for x in dirv]
            w = [root[i]-s_inner[i] for i in range(3)]
            along = sum(w[i]*dirv[i] for i in range(3))
            rad = math.sqrt(sum((w[i]-dirv[i]*along)**2 for i in range(3)))
            record('挂杆根在轮辐上', rad - 2*params['spokeR'])
        tip = e1 if dist(e1, [0, H, 0]) > dist(e2, [0, H, 0]) else e2
        rr = math.sqrt(tip[0]**2 + (tip[1]-H)**2)
        record_sep('挂杆悬臂端不穿横杆', params['beamSurfaceR'] - rr - params['spokeR'])

    # 5) 绳索：上端插挂杆端 + 下端插座舱顶
    for rp in ropes:
        e1, e2 = endpoints(rp)
        top = e1 if e1[1] > e2[1] else e2
        best = min(hangs, key=lambda h: min(dist(endpoints(h)[0], top), dist(endpoints(h)[1], top)))
        b1, b2 = endpoints(best)
        record('绳索上端插挂杆', min(dist(b1, top), dist(b2, top)) - 2*params['spokeR'])
        bot = e1 if e1[1] < e2[1] else e2
        cab = min(cabins, key=lambda c: dist(c['position'], bot))
        ce1, ce2 = endpoints(cab)
        top_c = ce1 if ce1[1] > ce2[1] else ce2
        record('绳索下端插座舱', top_c[1] - bot[1])

    # 6) 座舱：竖直 + 中心面 + 不穿环 + 不接地
    for c in cabins:
        ax = cyl_axis(c['rotation'])
        record('座舱竖直', 1 - abs(ax[1]))
        record('座舱在中心面', abs(c['position'][2]))
        record_sep('座舱不穿环', params['ringInnerZ'] - (abs(c['position'][2]) + 0.1))
        ce1, ce2 = endpoints(c)
        record_sep('座舱不接地', min(ce1[1], ce2[1]))

    # 7) 角色分离：环连接横杆数量 = 挂杆数量 = 6（各司其职）
    record('结构/悬挂角色分离', abs(len(beams) - len(hangs)))

    return table, fails, (len(rings), len(poles), len(spokes), len(beams), len(hangs), len(ropes), len(cabins), hub is not None, len(items) - sum([len(rings), len(poles), len(spokes), len(beams), len(hangs), len(ropes), len(cabins)]) - (1 if hub else 0))

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'benchmark/runs/round5/items.json'
    params = dict(T6)
    # --param key=value 覆盖（自选尺寸时无需改脚本：python3 connectivity-check.py items.json --param R=0.6 --param ringInnerZ=0.08）
    rest = [a for a in sys.argv[2:] if a.startswith('--param')]
    for a in rest:
        _, kv = a.split('=', 1) if '=' in a else (a, None)
        if kv is None:
            i = sys.argv.index(a)
            kv = sys.argv[i + 1]
        key, _, val = kv.partition('=')
        if key not in params:
            print(f'未知参数 {key}（可用: {list(params.keys())}）', file=sys.stderr)
            return 2
        params[key] = float(val)
    items = json.load(open(path))
    table, fails, counts = verify(items, params)
    rings, poles, spokes, beams, hangs, ropes, cabins, hub, unclass = counts
    print('角色: 环段%d 支架%d 轮辐%d 横杆%d 挂杆%d 绳索%d 座舱%d 轴盘%s（未分类 %d）' % (rings, poles, spokes, beams, hangs, ropes, cabins, '有' if hub else '无', unclass))
    print('%-22s %10s %s' % ('连接点', '间隙', '判定'))
    for name, gap, _, sep in table:
        ok = (gap <= 1e-3) if not sep else (gap >= -1e-3)
        mark = 'OK ' if ok else 'X  '
        print('%-22s %+8.4f  %s' % (name, gap, mark))
    print()
    if fails:
        print('共 %d 处异常:' % len(fails))
        for name, gap, _ in fails:
            print('  X %s 间隙 %+.4f' % (name, gap))
        return 1
    print('OK 全部连接点实体接触，无悬空、无重叠、受力链连续！')
    return 0

if __name__ == '__main__':
    sys.exit(main())
