#!/usr/bin/env python3
"""Consistency checks across all items: record order, transform sub-msg presence, axis omission."""
import sys, struct
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
        elif w == 1:
            yield f, w, None, (off, off+8); off += 8
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
        if f == target and w == 5: return struct.unpack('<f', buf[r[0]:r[1]])[0]
        if f == target and w == 2: return buf[r[0]:r[1]]
    return None

for sample in ['football', 'equiangular-spiral']:
    data = open(f'/tmp/gms-task-b/samples/{sample}.gia','rb').read()
    payload = data[20:-4]
    accs = get_all(payload, 2)
    f4sig = set(); f5sig = set(); t11sig = set(); name_ok = 0; name_bad = 0
    for acc in accs:
        f21 = get_all(acc, 21)[0]
        f211 = get_all(f21, 1)[0]
        f4 = get_all(f211, 4); f5 = get_all(f211, 5)
        f4sig.add(tuple(get_v(r, 1) for r in f4))
        f5sig.add(tuple(get_v(r, 1) for r in f5))
        # transform sub-messages
        for r5 in f5:
            if get_v(r5, 1) == 1:
                t11 = get_v(r5, 11)
                if isinstance(t11, bytes):
                    subs = tuple(sorted(f for f, w, v, r in fields(t11)))
                    t11sig.add(subs)
        # name check
        r4n = f4[0]
        nm = get_v(r4n, 11)
        nm2 = get_v(nm, 1) if isinstance(nm, bytes) else None
        if isinstance(nm2, bytes) and nm2.decode('utf-8').startswith('装饰物_'):
            name_ok += 1
        else:
            name_bad += 1
    print(f'{sample}: f4 order sigs={sorted(f4sig)} f5 order sigs={sorted(f5sig)} transform-submsg sigs={sorted(t11sig)} name_ok={name_ok} name_bad={name_bad}')

# axis presence: for transform 11.1/11.2/11.3, count which axes are written
for sample in ['football', 'equiangular-spiral']:
    data = open(f'/tmp/gms-task-b/samples/{sample}.gia','rb').read()
    payload = data[20:-4]
    accs = get_all(payload, 2)
    pos_sig = set(); rot_sig = set(); scl_sig = set()
    for acc in accs:
        f21 = get_all(acc, 21)[0]
        f211 = get_all(f21, 1)[0]
        for r5 in get_all(f211, 5):
            if get_v(r5, 1) == 1:
                t11 = get_v(r5, 11)
                subs = {f: tuple(w for f2, w, v, r in fields(sub) if False) or tuple(sorted(f2 for f2, w2, v2, r2 in fields(sub)))
                        for f, w, v, r in fields(t11) if w == 2 for sub in [t11[r[0]:r[1]]]}
                pos_sig.add(tuple(subs.get(1, ())))
                rot_sig.add(tuple(subs.get(2, ())))
                scl_sig.add(tuple(subs.get(3, ())))
    print(f'{sample}: pos axes={sorted(pos_sig)} rot axes={sorted(rot_sig)} scale axes={sorted(scl_sig)}')
