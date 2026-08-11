#!/usr/bin/env python3
"""
GIA static-model asset parser (schema-driven, fail-closed).

Decodes the container (20B BE header + protobuf Root payload + 4B BE tail) and the
full message tree of the static-model asset family observed in the two real samples
(等角螺线.gia / 足球.gia). Unknown fields are reported, never silently dropped.

Usage:
  python3 gia_parser.py <sample.gia> [--json out.json] [--summary]
"""
import sys, struct, json, argparse

# ---------- protobuf wire primitives ----------
def read_varint(buf, off):
    val = 0; shift = 0
    while off < len(buf):
        b = buf[off]; off += 1
        val |= (b & 0x7f) << shift
        if not (b & 0x80):
            return val, off
        shift += 7
        if shift > 70:
            raise ValueError('varint too long')
    raise ValueError('truncated varint')

def iter_fields(buf, off=0, end=None):
    """Yield (field, wire, value_or_None, (start,end)) at one message level."""
    end = len(buf) if end is None else end
    while off < end:
        key, off = read_varint(buf, off)
        f = key >> 3; w = key & 7
        if w == 0:
            v, off = read_varint(buf, off)
            yield f, w, v, None
        elif w == 1:
            yield f, w, None, (off, off + 8); off += 8
        elif w == 2:
            ln, off = read_varint(buf, off)
            if ln < 0 or off + ln > end:
                raise ValueError(f'len {ln} out of range at {off}')
            yield f, w, None, (off, off + ln); off += ln
        elif w == 5:
            yield f, w, None, (off, off + 4); off += 4
        else:
            raise ValueError(f'unsupported wire type {w} at {off}')

def field_bytes(buf, target):
    for f, w, v, r in iter_fields(buf):
        if f == target and w == 2:
            return buf[r[0]:r[1]]
    return None

def field_varint(buf, target):
    for f, w, v, r in iter_fields(buf):
        if f == target and w == 0:
            return v
    return None

def all_field_bytes(buf, target):
    return [buf[r[0]:r[1]] for f, w, v, r in iter_fields(buf) if f == target and w == 2]

def field_w5(buf, target):
    for f, w, v, r in iter_fields(buf):
        if f == target and w == 5:
            return buf[r[0]:r[1]]
    return None

def f32(buf):
    return struct.unpack('<f', buf)[0]

def utf8(buf):
    return buf.decode('utf-8')

def vec3(buf, what):
    """Vec3 message {1:x, 2:y, 3:z}; omitted axis = 0."""
    out = [0.0, 0.0, 0.0]
    for f, w, v, r in iter_fields(buf):
        if w == 5 and 1 <= f <= 3:
            out[f - 1] = f32(buf[r[0]:r[1]])
        elif w == 0 and 1 <= f <= 3:
            out[f - 1] = float(v)
        else:
            raise ValueError(f'{what}: unexpected field {f} wire {w}')
    return out

# ---------- container ----------
def parse_container(data):
    if len(data) < 24:
        raise ValueError('file too small')
    left_size, schema, head_tag, file_type = struct.unpack_from('>IIII', data, 0)
    proto_size = struct.unpack_from('>I', data, 16)[0]
    tail_tag = struct.unpack_from('>I', data, len(data) - 4)[0]
    if left_size != len(data) - 4:
        raise ValueError(f'leftSize {left_size} != size-4 {len(data)-4}')
    if 20 + proto_size != len(data) - 4:
        raise ValueError(f'20+protoSize {20+proto_size} != size-4 {len(data)-4}')
    return {
        'leftSize': left_size, 'schema': schema, 'headTag': hex(head_tag),
        'fileType': file_type, 'protoSize': proto_size, 'tailTag': hex(tail_tag),
    }, data[20:-4]

# ---------- static model messages ----------
def parse_id(buf, ctx):
    """GraphUnit.Id {2: class, 3: type, 4: id} (field numbers per gia.proto)."""
    out = {}
    for f, w, v, r in iter_fields(buf):
        if f == 2 and w == 0: out['class'] = v
        elif f == 3 and w == 0: out['type'] = v
        elif f == 4 and w == 0: out['id'] = v
        else: out.setdefault('unknown', []).append(f'f{f}/w{w}')
    return out

def parse_color(c32, ctx):
    out = {}
    for f, w, v, r in iter_fields(c32):
        if f == 1 and w == 0: out['enabled'] = bool(v)
        elif f == 3 and w == 0: out['rgbARGB'] = v          # 0xFF000000 | rgb
        elif f == 4 and w == 5: out['opacity'] = f32(c32[r[0]:r[1]])
        elif f == 5 and w == 0: out['rgb'] = v              # 0xRRGGBB
        elif f == 6 and w == 0: out['const6'] = v           # always 6700
        else: out.setdefault('unknown', []).append(f'f{f}/w{w}')
    if 'rgb' in out and 'rgbARGB' in out and out['rgbARGB'] != (0xFF000000 | out['rgb']):
        ctx['warnings'].append('color f3 != 0xFF000000|f5')
    return out

def parse_transform(t11, ctx):
    out = {}
    for f, w, v, r in iter_fields(t11):
        if w == 2 and f == 1: out['position'] = vec3(t11[r[0]:r[1]], 'pos')
        elif w == 2 and f == 2: out['rotation'] = vec3(t11[r[0]:r[1]], 'rot')
        elif w == 2 and f == 3: out['scale'] = vec3(t11[r[0]:r[1]], 'scl')
        else: out.setdefault('unknown', []).append(f'f{f}/w{w}')
    return out

def parse_item_f211(f211, ctx):
    """f21.1 = item record {1:id, 2:resourceId, 3:1, 4*:defs, 5*:values, 11:{}}"""
    out = {'defs': [], 'values': []}
    for f, w, v, r in iter_fields(f211):
        if f == 1 and w == 0: out['id'] = v
        elif f == 2 and w == 0: out['resourceId'] = v
        elif f == 3 and w == 0: out['field3'] = v
        elif f == 4 and w == 2: out['defs'].append(f211[r[0]:r[1]])
        elif f == 5 and w == 2: out['values'].append(f211[r[0]:r[1]])
        elif f == 11 and w == 2:
            if r[1] - r[0] != 0: ctx['warnings'].append('item f11 not empty')
        else: out.setdefault('unknown', []).append(f'f{f}/w{w}')
    return out

def parse_item_def(rec, ctx):
    """field-4 record: {1: type, <valField>: value}"""
    t = field_varint(rec, 1)
    if t == 1:
        inner = field_bytes(rec, 11)
        return {'type': 1, 'name': utf8(field_bytes(inner, 1)) if inner else None}
    if t == 40:
        inner = field_bytes(rec, 50)
        return {'type': 40, 'structureId': field_varint(inner, 502)}
    if t == 111:
        return {'type': 111, 'empty': True}
    return {'type': t, 'raw': rec.hex()}

def parse_item_value(rec, ctx):
    """field-5 record: {1: type, <valField>: value}"""
    t = field_varint(rec, 1)
    if t == 1:
        return {'type': 1, 'transform': parse_transform(field_bytes(rec, 11), ctx)}
    if t == 5:
        inner = field_bytes(rec, 15)
        return {'type': 5, 'field15': {'f1': field_varint(inner, 1), 'f2': field_varint(inner, 2)}}
    if t == 2:
        return {'type': 2, 'empty': True}
    if t == 22:
        return {'type': 22, 'color': parse_color(field_bytes(rec, 32), ctx)}
    return {'type': t, 'raw': rec.hex()}

def parse_accessory(acc, ctx):
    """accessory GraphUnit {1:id, 3:name, 5:which=28, 21:itemData}"""
    out = {'id': parse_id(field_bytes(acc, 1), ctx)}
    out['name'] = utf8(field_bytes(acc, 3))
    out['which'] = field_varint(acc, 5)
    f21 = field_bytes(acc, 21)
    if f21 is not None:
        f211 = parse_item_f211(field_bytes(f21, 1), ctx)
        f211['defs'] = [parse_item_def(r, ctx) for r in f211['defs']]
        f211['values'] = [parse_item_value(r, ctx) for r in f211['values']]
        out['data'] = f211
    unknown = [f for f, w, v, r in iter_fields(acc) if f not in (1, 3, 5, 21)]
    if unknown: out['unknownFields'] = unknown
    return out

def parse_version_f6(rec, ctx):
    """version record {1: type, <valField>: value}"""
    t = field_varint(rec, 1)
    if t == 1:
        inner = field_bytes(rec, 11)
        return {'type': 1, 'name': utf8(field_bytes(inner, 1))}
    if t == 13:
        inner = field_bytes(rec, 22)
        return {'type': 13, 'field22': {'f4': field_varint(inner, 4)}}
    if t == 14:
        inner = field_bytes(rec, 23)
        inner2 = field_bytes(inner, 1)
        return {'type': 14, 'field23': {'group': utf8(field_bytes(inner2, 3))}}
    if t == 38:
        inner = field_bytes(rec, 48)
        return {'type': 38, 'field48': {'f1': f32(field_w5(inner, 1))}}
    if t == 40:
        inner = field_bytes(rec, 50)
        packed = field_bytes(inner, 501)
        ids = []
        off = 0
        while off < len(packed):
            v, off = read_varint(packed, off)
            ids.append(v)
        return {'type': 40, 'itemIds': ids}
    if t == 111:
        return {'type': 111, 'empty': True}
    if t == 61:
        return {'type': 61, 'empty': True}
    if t == 62:
        return {'type': 62, 'empty': True}
    return {'type': t, 'raw': rec.hex()}

def parse_root_transform(rec, ctx):
    """f7[0] {1:1, 11:{1:pos, 2:rot, 3:scale, 501:-1}} — 模型根节点 Transform"""
    t11 = field_bytes(rec, 11)
    return {
        'position': vec3(field_bytes(t11, 1), 'root-pos') if field_bytes(t11, 1) else [0.0, 0.0, 0.0],
        'rotation': vec3(field_bytes(t11, 2), 'root-rot') if field_bytes(t11, 2) else [0.0, 0.0, 0.0],
        'scale': vec3(field_bytes(t11, 3), 'root-scl') if field_bytes(t11, 3) else [1.0, 1.0, 1.0],
        'field501': field_varint(t11, 501),
    }

def parse_version_unit(gu, ctx, current):
    """version GraphUnit {1:id, 2:relatedIds, 3:name, 5:which=1, 11:data}"""
    out = {'id': parse_id(field_bytes(gu, 1), ctx)}
    out['relatedIds'] = [parse_id(b, ctx)['id'] for b in all_field_bytes(gu, 2)]
    out['name'] = utf8(field_bytes(gu, 3))
    out['which'] = field_varint(gu, 5)
    f11 = field_bytes(gu, 11)
    f111 = field_bytes(f11, 1)
    f7s = all_field_bytes(f111, 7)
    out['data'] = {
        'structureId': field_varint(f111, 1),
        'templatePrefabId': field_varint(f111, 2),
        'records': [parse_version_f6(r, ctx) for r in all_field_bytes(f111, 6)],
        'rootTransform': parse_root_transform(f7s[0], ctx) if f7s else None,
        'modelVarsF7Count': len(f7s),
        'modelVarsF8Count': len(all_field_bytes(f111, 8)),
        'field10': field_varint(f111, 10),
    }
    unknown = [f for f, w, v, r in iter_fields(gu) if f not in (1, 2, 3, 5, 11)]
    if unknown: out['unknownFields'] = unknown
    return out

# ---------- top ----------
def parse_gia(path):
    data = open(path, 'rb').read()
    header, payload = parse_container(data)
    ctx = {'warnings': []}
    root_fields = {}
    units = []
    accs = []
    for f, w, v, r in iter_fields(payload):
        if f == 1 and w == 2:
            units.append(payload[r[0]:r[1]])
        elif f == 2 and w == 2:
            accs.append(payload[r[0]:r[1]])
        elif f == 3 and w == 2:
            root_fields['filePath'] = utf8(payload[r[0]:r[1]])
        elif f == 4 and w == 0:
            root_fields['modeFlag'] = v
        elif f == 5 and w == 2:
            root_fields['gameVersion'] = utf8(payload[r[0]:r[1]])
        else:
            ctx['warnings'].append(f'root unknown field f{f}/w{w}')
    versions = [parse_version_unit(u, ctx, i == len(units) - 1) for i, u in enumerate(units)]
    items = [parse_accessory(a, ctx) for a in accs]
    return {
        'container': header,
        'root': root_fields,
        'versionCount': len(versions),
        'itemCount': len(items),
        'versions': versions,
        'items': items,
        'warnings': ctx['warnings'],
    }

def summary(result):
    """Compact human-readable summary."""
    lines = []
    c = result['container']
    lines.append(f"container: leftSize={c['leftSize']} schema={c['schema']} headTag={c['headTag']} "
                 f"fileType={c['fileType']} protoSize={c['protoSize']} tailTag={c['tailTag']}")
    lines.append(f"root: filePath={result['root'].get('filePath')!r} modeFlag={result['root'].get('modeFlag')} "
                 f"gameVersion={result['root'].get('gameVersion')!r}")
    lines.append(f"versions: {result['versionCount']}  items: {result['itemCount']}")
    for i, v in enumerate(result['versions']):
        recs = ', '.join(
            (r.get('name') or r.get('group') or f"type{r['type']}") + (f"[{len(r['itemIds'])}]" if 'itemIds' in r else '')
            for r in v['data']['records'])
        lines.append(f"  version[{i}]: id={v['id']} name={v['name']!r} which={v['which']} "
                     f"structureId={v['data']['structureId']} template={v['data']['templatePrefabId']} "
                     f"relatedIds={len(v['relatedIds'])} records=({recs})")
    # group items by id runs (versions) and summarize
    from itertools import groupby
    cur = result['items'][0]['data']['id'] if result['items'] else None
    runs = []
    for it in result['items']:
        iid = it['data']['id']
        if runs and runs[-1][1] == iid - 1:
            runs[-1] = (runs[-1][0], iid)
        else:
            runs.append((iid, iid))
    lines.append('  item id runs: ' + ', '.join(f'{a}..{b}({b-a+1})' for a, b in runs))
    # item-level sample: first item of last run, with transform/color
    for v in result['versions']:
        v['_items'] = []
    # attach items to versions by id
    for it in result['items']:
        iid = it['data']['id']
        for v in result['versions']:
            if iid in set(v['relatedIds']):
                v['_items'].append(it)
                break
    for i, v in enumerate(result['versions']):
        items = v.get('_items', [])
        lines.append(f"  version[{i}] items={len(items)}")
        for it in items[:3]:
            d = it['data']
            tr = next((val['transform'] for val in d['values'] if val.get('type') == 1), None)
            col = next((val['color'] for val in d['values'] if val.get('type') == 22), None)
            nm = next((val['name'] for val in d['defs'] if val.get('type') == 1), None)
            lines.append(f"    item {d['id']} {nm!r} res={d['resourceId']} pos={tr['position'] if tr else None} "
                         f"rot={tr['rotation'] if tr else None} scl={tr['scale'] if tr else None} "
                         f"rgb=0x{col['rgb']:06X} op={col['opacity']} en={col['enabled']}" if col and tr else f"    item {d['id']} {nm!r} res={d['resourceId']}")
    for w in result['warnings']:
        lines.append(f'  WARNING: {w}')
    return '\n'.join(lines)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('gia')
    ap.add_argument('--json', help='write full JSON dump')
    ap.add_argument('--summary', action='store_true')
    args = ap.parse_args()
    result = parse_gia(args.gia)
    if args.json:
        json.dump(result, open(args.json, 'w'), ensure_ascii=False, indent=1)
    print(summary(result))
