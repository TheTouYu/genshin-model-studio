#!/usr/bin/env python3
"""Byte-exact comparison: sample accessory vs rebuilt accessory for current-version items."""
import sys
sys.path.insert(0, '/tmp/gms-task-b/src')
from wire_scan import read_varint

def fields(buf, off=0, end=None):
    end = len(buf) if end is None else end
    while off < end:
        key, off = read_varint(buf, off)
        f = key >> 3; w = key & 7
        if w == 0:
            v, off = read_varint(buf, off)
            yield f, w, v, None
        elif w == 2:
            ln, off = read_varint(buf, off)
            yield f, w, None, (off, off+ln); off += ln
        elif w == 5:
            yield f, w, None, (off, off+4); off += 4
        else:
            raise ValueError(f'wire {w}')

def get_all(buf, target):
    return [buf[r[0]:r[1]] for f, w, v, r in fields(buf) if f == target and w == 2]

def get_v(buf, target):
    for f, w, v, r in fields(buf):
        if f == target and w == 0: return v
        if f == target and w == 2: return buf[r[0]:r[1]]
    return None

for sample, rebuilt in [('football', 'football-rebuilt'), ('equiangular-spiral', 'equiangular-spiral-rebuilt')]:
    a = open(f'/tmp/gms-task-b/samples/{sample}.gia','rb').read()[20:-4]
    b = open(f'/tmp/gms-task-b/out/{rebuilt}.gia','rb').read()[20:-4]
    accs_a = get_all(a, 2)
    accs_b = get_all(b, 2)
    # map sample accessories by item id
    by_id = {}
    for acc in accs_a:
        f21 = get_v(acc, 21); f211 = get_v(f21, 1)
        by_id[get_v(f211, 1)] = acc
    identical = 0; diff = 0
    diffs = []
    for acc in accs_b:
        f21 = get_v(acc, 21); f211 = get_v(f21, 1)
        iid = get_v(f211, 1)
        if iid in by_id:
            if acc == by_id[iid]:
                identical += 1
            else:
                diff += 1
                if len(diffs) < 3:
                    diffs.append((iid, len(acc), len(by_id[iid])))
    print(f'{sample}: rebuilt accessories byte-identical to sample: {identical}, different: {diff}', diffs if diffs else '')
    # version unit f11 comparison (current version)
    gu_a = get_all(a, 1)[-1]
    gu_b = get_all(b, 1)[-1]
    f11_a = get_v(gu_a, 11); f11_b = get_v(gu_b, 11)
    print(f'  version unit f11: sample len={len(f11_a)} rebuilt len={len(f11_b)} identical={f11_a == f11_b}')
    # full graph unit
    print(f'  version unit full: sample len={len(gu_a)} rebuilt len={len(gu_b)} identical={gu_a == gu_b}')
