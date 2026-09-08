#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
render-contact-sheet.py — 多视角正交投影 contact sheet（确定性，PIL + numpy）。

从 mesh.json（或从 .structure.json 的 mesh item / contour-model 产物目录）读取网格，
做正交投影，合成「六视角 + 45° 补充」共 8 格 PNG contact sheet：
  iso / front / side / top / back / iso-45-a / iso-45-b / iso-45-c
每格带视角标签；flat 填色按面（颜色带 or 默认灰）+ 简单深度排序（painter's algorithm）。
确定性：无随机、无时间戳；同一输入两次渲染 sha256 一致。

与既有 --views 的 SVG 共存：SVG 保留完整细节证据，本 contact sheet 供快速验收。
输出目录不删除既有 view-*.svg。

用法：
  python3 scripts/render-contact-sheet.py <mesh.json|structure.json|导出目录> [--out out.png] [--cell 300] [--views iso,front,...]
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

DEFAULT_LIGHT = np.array([0.42, 0.8, 0.46])
DEFAULT_LIGHT = DEFAULT_LIGHT / np.linalg.norm(DEFAULT_LIGHT)

CELL_DEFAULT = 300  # 每格内容边长（px）
LABEL_H = 26        # 每格标签高度（px）
MARGIN = 12         # 网格外边距（px）
GAP = 8             # 格间距（px）
DEFAULT_FILL = '0xC7C7CE'

VIEWS = ['iso', 'front', 'side', 'top', 'back', 'iso-45-a', 'iso-45-b', 'iso-45-c']
# 每个视角的 (yaw°, pitch°)：定义正投影相机朝向（yaw 绕 Y，pitch 为仰角）。
VIEW_ANGLES = {
    'iso': (45.0, 30.0),
    'front': (0.0, 0.0),
    'side': (90.0, 0.0),
    'top': (0.0, 90.0),
    'back': (180.0, 0.0),
    'iso-45-a': (135.0, 30.0),
    'iso-45-b': (225.0, 30.0),
    'iso-45-c': (315.0, 30.0),
}


def clamp255(x):
    return max(0, min(255, int(round(x))))


def hex_to_rgb(hexstr):
    m = (hexstr or '').strip()
    if m.startswith('0x'):
        m = m[2:]
    if len(m) != 6:
        return (0xC7, 0xC7, 0xCE)
    try:
        v = int(m, 16)
        return ((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF)
    except ValueError:
        return (0xC7, 0xC7, 0xCE)


def normalize(v):
    n = np.linalg.norm(v)
    if n < 1e-12:
        return np.array([0.0, 1.0, 0.0])
    return v / n


def basis(yaw_deg, pitch_deg):
    """返回正投影基：forward(进屏幕), right(屏幕右), up(屏幕上)。"""
    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)
    f = np.array([
        math.sin(yaw) * math.cos(pitch),
        -math.sin(pitch),
        -math.cos(yaw) * math.cos(pitch),
    ])
    if abs(f[1]) > 0.999:
        ref_up = np.array([0.0, 0.0, 1.0])
    else:
        ref_up = np.array([0.0, 1.0, 0.0])
    right = normalize(np.cross(f, ref_up))
    up = normalize(np.cross(right, f))
    return f, right, up


def load_mesh(input_path):
    """从 mesh.json / structure.json / 导出目录 解析 {vertices,faces,colors}。"""
    p = os.path.abspath(input_path)
    if os.path.isdir(p):
        mesh_file = None
        for root, _dirs, files in os.walk(p):
            for f in files:
                if f.endswith('.mesh.json'):
                    mesh_file = os.path.join(root, f)
                    break
            if mesh_file:
                break
        if not mesh_file:
            raise SystemExit(f'[render-contact-sheet] 目录 {p} 未找到 .mesh.json')
        p = mesh_file

    with open(p, 'r', encoding='utf-8') as fh:
        data = json.load(fh)

    if isinstance(data, dict) and isinstance(data.get('vertices'), list) and isinstance(data.get('faces'), list):
        return data['vertices'], data['faces'], data.get('colors')

    if isinstance(data, dict) and isinstance(data.get('items'), list):
        for item in data['items']:
            if (item.get('resourceId') == 10009019
                    and isinstance(item.get('vertices'), list)
                    and isinstance(item.get('faces'), list)):
                return item['vertices'], item['faces'], item.get('colors')
        raise SystemExit(f'[render-contact-sheet] {p} 未含 10009019 mesh item（无 vertices/faces）')

    raise SystemExit(f'[render-contact-sheet] 无法从 {p} 解析网格（需 mesh.json 或 structure.json）')


def project_view(vertices, faces, colors, view):
    """正交投影 + 按面 flat 填色 + 深度排序。返回 (tris, minu, maxu, minv, maxv)。"""
    yaw, pitch = VIEW_ANGLES[view]
    f, right, up = basis(yaw, pitch)
    vmat = np.asarray(vertices, dtype=float)
    screen_u = vmat @ right
    screen_v = vmat @ up
    depth = vmat @ f

    tris = []
    for fi in range(0, len(faces) - 2, 3):
        a, b, c = faces[fi], faces[fi + 1], faces[fi + 2]
        if a >= len(vertices) or b >= len(vertices) or c >= len(vertices):
            continue
        p0 = np.asarray(vertices[a], dtype=float)
        p1 = np.asarray(vertices[b], dtype=float)
        p2 = np.asarray(vertices[c], dtype=float)
        u0, u1, u2 = screen_u[a], screen_u[b], screen_u[c]
        v0, v1, v2 = screen_v[a], screen_v[b], screen_v[c]
        area2 = abs((u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0))
        if area2 < 1e-12:
            continue
        n = normalize(np.cross(p1 - p0, p2 - p0))
        bright = 0.42 + 0.58 * max(0.0, float(np.dot(n, DEFAULT_LIGHT)))
        if colors and fi // 3 < len(colors):
            rgb = hex_to_rgb(colors[fi // 3])
        else:
            rgb = hex_to_rgb(DEFAULT_FILL)
        fill = (clamp255(rgb[0] * bright), clamp255(rgb[1] * bright), clamp255(rgb[2] * bright))
        d = (depth[a] + depth[b] + depth[c]) / 3.0
        tris.append((d, [(u0, v0), (u1, v1), (u2, v2)], fill))

    if not tris:
        return [], 0.0, 0.0, 0.0, 0.0

    tris.sort(key=lambda t: t[0], reverse=True)  # 远 → 近（painter's algorithm）

    minu = min(min(pts[0] for pts in t[1]) for t in tris)
    maxu = max(max(pts[0] for pts in t[1]) for t in tris)
    minv = min(min(pts[1] for pts in t[1]) for t in tris)
    maxv = max(max(pts[1] for pts in t[1]) for t in tris)
    return tris, minu, maxu, minv, maxv


def render_cell(draw, x0, y0, size, label, content, font):
    """把 content（某视角三角列表 + 投影范围）绘制进 (x0,y0) 的 size×size 格子。"""
    tris, minu, maxu, minv, maxv = content
    if not tris:
        draw.rectangle([x0, y0, x0 + size, y0 + size], fill=(242, 242, 244))
    else:
        span = max(maxu - minu, maxv - minv, 1e-9)
        pad = span * 0.06
        span = span + 2 * pad
        scale = (size - 12) / span
        cu = (minu + maxu) / 2.0
        cv = (minv + maxv) / 2.0
        for _d, pts, fill in tris:
            pix = []
            for (u, v) in pts:
                px = x0 + size / 2.0 + (u - cu) * scale
                py = y0 + size / 2.0 - (v - cv) * scale
                pix.append((px, py))
            draw.polygon(pix, fill=fill, outline=(30, 30, 35))
    draw.rectangle([x0, y0, x0 + size, y0 + size], outline=(180, 180, 185))
    draw.rectangle([x0, y0 + size, x0 + size, y0 + size + LABEL_H], fill=(246, 246, 248))
    draw.text((x0 + 8, y0 + size + (LABEL_H - 11) // 2), label, fill=(40, 40, 45), font=font)


def main():
    ap = argparse.ArgumentParser(description='Render a deterministic multi-view contact sheet PNG from a mesh.')
    ap.add_argument('input', help='mesh.json / structure.json / 导出目录')
    ap.add_argument('--out', default=None, help='输出 PNG 路径（缺省：<input 同名>.contact.png）')
    ap.add_argument('--cell', type=int, default=CELL_DEFAULT, help='每格内容边长（px）')
    ap.add_argument('--views', default=','.join(VIEWS), help='逗号分隔的视角列表')
    args = ap.parse_args()

    vertices, faces, colors = load_mesh(args.input)
    if not colors or len(colors) < (len(faces) // 3):
        colors = None

    views = [v.strip() for v in args.views.split(',') if v.strip()]
    unknown = [v for v in views if v not in VIEW_ANGLES]
    if unknown:
        raise SystemExit(f'[render-contact-sheet] 未知视角：{", ".join(unknown)}（可选：{", ".join(VIEWS)}）')

    cell = args.cell
    cells = [project_view(vertices, faces, colors, v) for v in views]

    cols = 4
    rows = math.ceil(len(views) / cols)
    cell_h = cell + LABEL_H
    img_w = MARGIN * 2 + cols * cell + GAP * (cols - 1)
    img_h = MARGIN * 2 + rows * cell_h + GAP * (rows - 1) + LABEL_H
    image = Image.new('RGB', (img_w, img_h), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    draw.text((MARGIN, 6), 'Contact sheet (%d views)' % len(views), fill=(80, 80, 90), font=font)

    for i, (view, content) in enumerate(zip(views, cells)):
        col = i % cols
        row = i // cols
        x0 = MARGIN + col * (cell + GAP)
        y0 = MARGIN + LABEL_H + row * (cell_h + GAP)
        render_cell(draw, x0, y0, cell, view, content, font)

    out = args.out
    if not out:
        stem = os.path.splitext(os.path.basename(args.input))[0]
        out = os.path.join(os.path.dirname(args.input) or '.', stem + '.contact.png')
    out_abs = os.path.abspath(out)
    os.makedirs(os.path.dirname(out_abs), exist_ok=True)
    image.save(out_abs, format='PNG')
    sys.stdout.write('contact.png=%s (%dx%d, %d views)\n' % (out_abs, image.width, image.height, len(views)))


if __name__ == '__main__':
    main()
