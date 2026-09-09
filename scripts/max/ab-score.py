#!/usr/bin/env python3
"""盲测计分：评委 JSON 判定 vs 私有 key → 误判率（≥50% 为达标线）。

用法：python3 scripts/max/ab-score.py <judge1.json> [judge2.json ...]
评委 JSON 形态：[{"file":"img01.png","verdict":"photo"|"render","confidence":0.8,"reason":"..."}, ...]
"""
import json
import sys

KEY = '.scratch/max/ab-key.json'


def main():
    key = json.load(open(KEY))['key']
    total_all = 0
    wrong_all = 0
    for path in sys.argv[1:]:
        data = json.load(open(path))
        if isinstance(data, dict):
            data = data.get('verdicts') or data.get('results') or data.get('answers') or []
        rows = []
        wrong = 0
        for item in data:
            fn = item.get('file') or item.get('name')
            if fn not in key:
                # 容错：允许 "img01" 这种省略扩展名
                cand = [k for k in key if k.startswith(str(fn))]
                if len(cand) == 1:
                    fn = cand[0]
                else:
                    continue
            truth = key[fn]['kind']            # 'real' | 'render'
            v = str(item.get('verdict', '')).strip().lower()
            said_render = v.startswith('render') or v in ('cg', 'synthetic', 'ai')
            said_photo = v.startswith('photo') or v in ('real', 'photograph')
            if not (said_render or said_photo):
                continue
            guess = 'render' if said_render else 'real'
            ok = guess == truth
            if not ok:
                wrong += 1
            rows.append((fn, truth, guess, 'OK' if ok else 'MISS'))
        n = len(rows)
        rate = 100.0 * wrong / n if n else 0.0
        print(f'== {path}: {wrong}/{n} 误判 → 误判率 {rate:.1f}%  (达标线 50%)')
        for fn, truth, guess, tag in sorted(rows):
            print(f'   {fn}  truth={truth:6s} said={guess:6s} {tag}  [{key[fn]["source"]}]')
        total_all += n
        wrong_all += wrong
    if total_all:
        print(f'\n== 合计 {wrong_all}/{total_all} 误判 → {100.0*wrong_all/total_all:.1f}%')


if __name__ == '__main__':
    main()
