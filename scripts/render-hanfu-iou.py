#!/usr/bin/env python3
"""L4-G8：IoU 三视图叠图（绿=交集 / 蓝=参考独有 / 红=模型独有），落 delivery/hanfu-l1/iou-<view>.png。"""
import json
import sys
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path('/home/h/genshin-model-studio')
g1 = SourceFileLoader('g1', str(ROOT / 'scripts/check-hanfu-g1-3d.py')).load_module()
SIGNS = {'front': 1, 'side': -1, 'back': 1}


def main():
    mesh = json.loads((ROOT / 'delivery/hanfu-cage/cage-mesh.json').read_text())
    V, F = mesh['vertices'], mesh['faces']
    rgb = np.array(Image.open(ROOT / 'reference/hanfu/古风甘雨三视图.png').convert('RGB'))
    out = {}
    for name, panel in g1.PANEL.items():
        sign = SIGNS[name]
        ref = g1.body_mask(rgb, panel)
        cage = g1.cage_mask_view(V, F, panel, sign)
        h, w = ref.shape
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[ref & cage] = (60, 220, 90)      # 绿：交集
        img[ref & ~cage] = (70, 130, 255)    # 蓝：参考独有
        img[cage & ~ref] = (240, 70, 70)     # 红：模型独有
        Image.fromarray(img).save(ROOT / f'delivery/hanfu-l1/iou-{name}.png')
        inter = int((ref & cage).sum()); union = int((ref | cage).sum())
        out[name] = {'iou': round(inter / union, 4), 'interPx': inter, 'bluePx': int((ref & ~cage).sum()),
                     'redPx': int((cage & ~ref).sum())}
        print(f'{name}: IoU={out[name]["iou"]} 绿={inter} 蓝={out[name]["bluePx"]} 红={out[name]["redPx"]}')
    (ROOT / 'delivery/hanfu-l1/iou-overlay-report.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
