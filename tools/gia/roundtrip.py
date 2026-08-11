#!/usr/bin/env python3
"""
Round-trip validation: parse sample -> extract current version -> encode -> re-parse -> compare.
Usage: python3 roundtrip.py <sample.gia>
"""
import sys, json, subprocess, os, math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gia_parser import parse_gia

def close(a, b, tol=1e-4):
    return all(abs(x - y) <= tol for x, y in zip(a, b))

def main():
    sample = sys.argv[1]
    stem = os.path.splitext(os.path.basename(sample))[0]
    work = '/tmp/gms-task-b/out'
    os.makedirs(work, exist_ok=True)
    parsed = parse_gia(sample)

    # current version = LAST graph unit (matches file name & item structure links)
    cur = parsed['versions'][-1]
    item_ids = set(cur['relatedIds'])
    cur_items = [it for it in parsed['items'] if it['data']['id'] in item_ids]
    assert len(cur_items) == len(cur['relatedIds']), (len(cur_items), len(cur['relatedIds']))
    # order must follow relatedIds
    order = {iid: k for k, iid in enumerate(cur['relatedIds'])}
    cur_items.sort(key=lambda it: order[it['data']['id']])

    def item_to_input(it):
        d = it['data']
        tr = next(v['transform'] for v in d['values'] if v.get('type') == 1)
        col = next(v['color'] for v in d['values'] if v.get('type') == 22)
        nm = next(v['name'] for v in d['defs'] if v.get('type') == 1)
        return {
            'id': d['id'], 'resourceId': d['resourceId'], 'name': nm,
            'position': tr['position'], 'rotation': tr['rotation'], 'scale': tr['scale'],
            'color': {'enabled': col['enabled'], 'rgb': col['rgb'], 'opacity': col['opacity'],
                      'overlay': 'overwrite'},
        }

    enc_in = {
        'schemaVersion': 1,
        'model': {
            'name': cur['name'],
            'unitId': cur['id']['id'],
            'templatePrefabId': cur['data']['templatePrefabId'],
            'rootTransform': {
                'position': cur['data']['rootTransform']['position'],
                'rotation': cur['data']['rootTransform']['rotation'],
                'scale': cur['data']['rootTransform']['scale'],
            },
            'items': [item_to_input(it) for it in cur_items],
        },
        'file': {
            'filePath': parsed['root']['filePath'],
            'gameVersion': parsed['root']['gameVersion'],
        },
    }
    in_path = f'{work}/{stem}-encoder-input.json'
    out_path = f'{work}/{stem}-rebuilt.gia'
    json.dump(enc_in, open(in_path, 'w'), ensure_ascii=False)

    r = subprocess.run(['node', '/tmp/gms-task-b/src/gia-encoder.ts', in_path, out_path],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    print(r.stdout.strip())

    # re-parse rebuilt
    rebuilt = parse_gia(out_path)
    rv = rebuilt['versions'][-1]
    rv_items = [it for it in rebuilt['items'] if it['data']['id'] in set(rv['relatedIds'])]
    rv_items.sort(key=lambda it: order.get(it['data']['id'], 0))

    print(f'--- roundtrip {stem}: sample vs rebuilt ---')
    checks = []
    def check(name, cond, detail=''):
        checks.append((name, bool(cond)))
        print(f'  [{"PASS" if cond else "FAIL"}] {name} {detail}')

    rc = rebuilt['container']
    check('container header/tail (tags + internal consistency)',
          rc['headTag'] == '0x326' and rc['tailTag'] == '0x679' and rc['schema'] == 1
          and rc['fileType'] == 3 and rc['protoSize'] == rc['leftSize'] - 20
          and rc['leftSize'] == os.path.getsize(out_path) - 4,
          f"leftSize={rc['leftSize']} protoSize={rc['protoSize']}")
    check('filePath', rebuilt['root']['filePath'] == parsed['root']['filePath'])
    check('gameVersion', rebuilt['root']['gameVersion'] == parsed['root']['gameVersion'])
    check('version name', rv['name'] == cur['name'])
    check('unitId', rv['id']['id'] == cur['id']['id'])
    check('structureId', rv['data']['structureId'] == cur['data']['structureId'])
    check('templatePrefabId', rv['data']['templatePrefabId'] == cur['data']['templatePrefabId'])
    check('rootTransform', rv['data']['rootTransform'] == cur['data']['rootTransform'],
          f"{rv['data']['rootTransform']} vs {cur['data']['rootTransform']}")
    check('modelVars f7/f8 counts',
          rv['data']['modelVarsF7Count'] == cur['data']['modelVarsF7Count']
          and rv['data']['modelVarsF8Count'] == cur['data']['modelVarsF8Count'],
          f"f7 {rv['data']['modelVarsF7Count']}/{cur['data']['modelVarsF7Count']} f8 {rv['data']['modelVarsF8Count']}/{cur['data']['modelVarsF8Count']}")
    check('item count', len(rv_items) == len(cur_items), f"{len(rv_items)} vs {len(cur_items)}")
    check('which/class/type pattern',
          rv['id'] == {'class': 1, 'type': 1, 'id': cur['id']['id']})
    if rv_items and cur_items:
        ok_id = ok_res = ok_pos = ok_rot = ok_scl = ok_col = ok_nm = True
        for a, b in zip(cur_items, rv_items):
            da, db = a['data'], b['data']
            ta = next(v['transform'] for v in da['values'] if v.get('type') == 1)
            tb = next(v['transform'] for v in db['values'] if v.get('type') == 1)
            ca = next(v['color'] for v in da['values'] if v.get('type') == 22)
            cb = next(v['color'] for v in db['values'] if v.get('type') == 22)
            na = next(v['name'] for v in da['defs'] if v.get('type') == 1)
            nb = next(v['name'] for v in db['defs'] if v.get('type') == 1)
            ok_id &= da['id'] == db['id']
            ok_res &= da['resourceId'] == db['resourceId']
            ok_pos &= close(ta['position'], tb['position'])
            ok_rot &= close(ta['rotation'], tb['rotation'])
            ok_scl &= close(ta['scale'], tb['scale'])
            ok_col &= ca['rgb'] == cb['rgb'] and ca['opacity'] == cb['opacity'] and ca['enabled'] == cb['enabled']
            ok_nm &= na == nb
        check('per-item id', ok_id)
        check('per-item resourceId', ok_res)
        check('per-item position', ok_pos)
        check('per-item rotation', ok_rot)
        check('per-item scale', ok_scl)
        check('per-item color', ok_col)
        check('per-item name', ok_nm)
    # version history: rebuilt has exactly 1 version unit (documented difference)
    check('rebuilt version count == 1 (fresh file, no editor history)',
          rebuilt['versionCount'] == 1, f"sample had {parsed['versionCount']}")
    fails = [n for n, ok in checks if not ok]
    print('---', 'ALL PASS' if not fails else f'FAILED: {fails}')
    return 0 if not fails else 1

if __name__ == '__main__':
    sys.exit(main())
