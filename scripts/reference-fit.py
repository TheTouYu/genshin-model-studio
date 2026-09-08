#!/usr/bin/env python3
# coding: utf-8
"""reference-fit.py — 任意对象参考图 → 结构化 manifest + 轮廓 mask → 环数据 + 色带 + overlay + IoU/数值报告。

对齐 scripts/extract-ganyu-profile.py 的 CLI 风格（argparse、中文注释、确定性）；这是
「gms-modeling-reference-fit」链路的通用管线（docs/mesh-panel-system-design.md §4.2 / A4）。

输入（至少 front+side；top 可选）：
  --front <img>   前视图（宽度剖面来源）
  --side <img>    侧视图（深度剖面 + centerZ 偏置来源）
  --top <img>     顶视图（可选：顶视轮廓；缺省用椭圆近似）

输出（在 --out-dir 下，全部机器可读、确定性、无时间戳）：
  manifest.json      视图 / 地标 / 部件数 / 不确定区 / method+params
  rings.json         04 contour-model 输入 form①：{name,points,topOutline?,sideProfile,colorBands?,cap}
  rings-ellipse.json 无顶视时的可吞吐版：把 topOutline 补成「椭圆近似（宽×深）」
  color_bands.json   按高度分带的平均色 ["0xRRGGBB"]
  overlay-{front,side}.png  原图半透明 + 剪影/环样描线（验收可视化）
  summary.json       mask 面积/包围盒/环数/点数/带数；若给 --gt-mask → IoU

确定性契约：相同输入 + 相同参数 ⇒ 相同字节（无随机、无时间戳；所有阈值固定并记录进 manifest.method）。

用法：
  ./.venv/bin/python scripts/reference-fit.py --front a.png --side b.png --out-dir out [--top c.png] \\
      [--points 64] [--color-bands 0|K] [--no-color-bands] [--gt-mask m.png] [--name nm] [--height 0.4]
  ./.venv/bin/python scripts/reference-fit.py --make-fixture <dir>   # 生成确定性"脚型"合成样张（含 gt mask）
"""

import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

# ----------------------------- 确定性常量 -----------------------------
# 所有阈值固定；改任一值都会改变输出，因此以常量形式记录（manifest.method 会原样写出）。
BG_PATCH = 4            # 背景取样的角块边长（像素）
BG_THRESH = 40          # 前景判定：与背景色 max-channel 绝对差 > 阈
MORPH_K = 3             # 形态学开运算核（3×3：先腐蚀后膨胀，去噪/去细毛刺）
MIN_COMPONENT_FRAC = 0.01   # 忽略面积 < 总前景 1% 的连通域（防噪点成部件）
DEFAULT_HEIGHT_M = 0.40     # 物体高度（米，世界坐标 y 上界；脚底=0）
DEFAULT_RING_COUNT = 16     # 截面环（sideProfile）层数
DEFAULT_POINTS = 64         # 每环目标点数（04 预算档）
BAND_COLOR_TOL = 28         # 自动分带：相邻行平均色 max-channel 差 > 阈 → 开新带
AUTO_BAND_MIN_ROW = 3       # 自动分带：少于该行数的带并入相邻带
WIDTHSCALE_EPS = 1e-3       # widthScale 下限（防除零/退化，保持 > 0 的合法缩放）


# ----------------------------- 基础工具 -----------------------------

def hexint(v):
    return int(max(0, min(255, int(round(float(v))))))


def rgbhex(rgb):
    return "0x%02X%02X%02X" % (hexint(rgb[0]), hexint(rgb[1]), hexint(rgb[2]))


def load_rgb(path):
    img = Image.open(path).convert("RGB")
    a = np.asarray(img, dtype=np.int16)
    return img, a, a.shape[1], a.shape[0]


def bg_from_corners(a, patch=BG_PATCH):
    """背景 = 图像四角小块的平均色（前景 = 非背景）。"""
    corners = np.concatenate([
        a[:patch, :patch].reshape(-1, 3),
        a[:patch, -patch:].reshape(-1, 3),
        a[-patch:, :patch].reshape(-1, 3),
        a[-patch:, -patch:].reshape(-1, 3),
    ])
    return corners.mean(axis=0)


def fg_mask(a, bg, thresh=BG_THRESH):
    return (np.abs(a - bg).max(axis=2) > thresh)


# ----------------------------- 形态学（numpy 二进制开运算） -----------------------------

def binary_erode(fg, k=MORPH_K):
    fg = fg.astype(bool)
    pad = k // 2
    p = np.pad(fg, pad, mode="constant", constant_values=False)
    out = fg.copy()
    for dr in range(-pad, pad + 1):
        for dc in range(-pad, pad + 1):
            out &= p[pad + dr:pad + dr + fg.shape[0], pad + dc:pad + dc + fg.shape[1]]
    return out


def binary_dilate(fg, k=MORPH_K):
    fg = fg.astype(bool)
    pad = k // 2
    p = np.pad(fg, pad, mode="constant", constant_values=False)
    out = fg.copy()
    for dr in range(-pad, pad + 1):
        for dc in range(-pad, pad + 1):
            out |= p[pad + dr:pad + dr + fg.shape[0], pad + dc:pad + dc + fg.shape[1]]
    return out


def binary_opening(fg, k=MORPH_K):
    return binary_dilate(binary_erode(fg, k), k)


# ----------------------------- 连通域（无 scipy，BFS 行主序，确定性） -----------------------------

def label_components(fg):
    fg = fg.astype(bool)
    H, W = fg.shape
    labels = np.zeros((H, W), dtype=np.int32)
    current = 0
    areas = []
    # np.argwhere 以行主序（C order）返回前景坐标 ⇒ 迭代顺序确定。
    for r, c in np.argwhere(fg):
        if labels[r, c]:
            continue
        current += 1
        stack = [(int(r), int(c))]
        labels[r, c] = current
        area = 0
        while stack:
            rr, cc = stack.pop()
            area += 1
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nr, nc = rr + dr, cc + dc
                if 0 <= nr < H and 0 <= nc < W and fg[nr, nc] and labels[nr, nc] == 0:
                    labels[nr, nc] = current
                    stack.append((nr, nc))
        areas.append(area)
    return labels, current, areas


# ----------------------------- 单视图分析 -----------------------------

def analyze_view(path, role, height_m, ring_count):
    """单视图 → 前景 mask（开运算）+ 部件数 + 逐行宽/中心 + 高度分层采样。

    前景自动取 = 非背景（背景 = 角落取样）；提取失败（无前景）抛中文错。
    """
    img, a, W, H = load_rgb(path)
    bg = bg_from_corners(a)
    raw = fg_mask(a, bg)
    mask = binary_opening(raw, MORPH_K)
    labels, ncomp, areas = label_components(mask)
    if ncomp == 0:
        raise RuntimeError("[reference-fit] 视图 %s 无法提取前景（自动阈值失败：全屏与背景无差异）" % role)

    total = int(mask.sum())
    big = [(i + 1, int(areas[i])) for i in range(ncomp) if areas[i] > MIN_COMPONENT_FRAC * total]
    part_count = len(big)
    largest_label = (max(big, key=lambda t: t[1])[0] if big else (int(np.argmax(areas)) + 1))

    primary = (labels == largest_label)
    xs = np.where(primary.any(axis=0))[0]
    ys = np.where(primary.any(axis=1))[0]
    if len(ys) == 0:
        raise RuntimeError("[reference-fit] 视图 %s 主部件为空" % role)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())

    widths = {}
    centers = {}
    for r in range(y0, y1 + 1):
        cols = np.where(primary[r])[0]
        if len(cols):
            widths[r] = int(cols[-1] - cols[0] + 1)
            centers[r] = float((cols[0] + cols[-1]) / 2.0)

    w_ref = max(widths.values()) if widths else 0
    hh = y1 - y0 + 1

    levels = []
    for i in range(ring_count):
        t = i / (ring_count - 1) if ring_count > 1 else 0.0
        row = int(round(y1 - t * (y1 - y0)))
        row = max(y0, min(y1, row))
        levels.append({
            "t": round(t, 4),
            "y": round(t * height_m, 4),
            "row": row,
            "widthPx": int(widths.get(row, 0)),
            "centerPx": float(centers.get(row, w_ref and (x0 + x1) / 2.0 or W / 2.0)),
        })

    return {
        "img": img, "a": a, "bg": list(bg), "raw": raw, "mask": mask,
        "primary": primary, "labels": labels, "ncomp": ncomp, "areas": int(total),
        "partCount": part_count, "W_ref": w_ref, "bbox": [x0, y0, x1, y1],
        "heightPx": hh, "levels": levels, "widths": widths, "centers": centers,
        "shape": (W, H),
    }


# ----------------------------- 顶视轮廓提取（--top，未用于演示） -----------------------------

def extract_top_outline(top_view, points):
    """顶视主部件边界按角度绕质心排序 → 有向闭合轮廓（像素→米）。

    说明：此为「原始采样 + 角度排序」，未做弧长重采样（04 的 contourFromViews 会再按 points
    弧长重采样）。若主部件非星形凸（如深凹形）本排序会失真 —— 此类情况在 manifest 标注不确定。
    """
    primary = top_view["primary"]
    er = binary_erode(primary, 3)
    edge = primary & (~er)
    eys, exs = np.where(edge)
    cx, cy = float(exs.mean()), float(eys.mean())
    ang = np.arctan2(eys - cy, exs - cx)
    order = np.argsort(ang)
    mpp = DEFAULT_HEIGHT_M / max(top_view["heightPx"], 1)
    # 以质心为原点，映射到米（x 右、z 后；这里 z 用顶视图像纵轴方向）。
    pts = []
    for k in order:
        pts.append([
            round(float((exs[k] - cx)) * mpp, 5),
            round(float((eys[k] - cy)) * mpp, 5),
        ])
    # 需要至少 3 点且总弧长非 0；否则回退椭圆。
    if len(pts) < 3:
        return None
    return pts


def ellipse_outline(a_x, a_z, points):
    pts = []
    for i in range(points):
        th = 2.0 * math.pi * i / points
        pts.append([round(a_x * math.cos(th), 5), round(a_z * math.sin(th), 5)])
    return pts


# ----------------------------- 色带 -----------------------------

def row_colors(primary, a, y0, y1):
    out = {}
    for r in range(y0, y1 + 1):
        cols = np.where(primary[r])[0]
        if len(cols):
            out[r] = a[r, cols].reshape(-1, 3).mean(axis=0)
    return out


def row_to_t(row, y0, y1):
    return (y1 - row) / (y1 - y0) if y1 != y0 else 0.0


def auto_bands(primary, a, y0, y1):
    rc = row_colors(primary, a, y0, y1)
    rows = sorted(rc.keys())
    if not rows:
        return []
    bands = []
    cur_start = rows[0]
    cur_sum = np.array(rc[rows[0]], dtype=float).copy()
    cur_n = 1
    last_row = rows[0]

    def close():
        bands.append({
            "row0": cur_start,
            "row1": last_row,
            "color": cur_sum / max(cur_n, 1),
        })

    for r in rows[1:]:
        mean = cur_sum / max(cur_n, 1)
        if np.abs(rc[r] - mean).max() > BAND_COLOR_TOL or (r - last_row) > (y1 - y0) * 0.5:
            close()
            cur_start = r
            cur_sum = np.array(rc[r], dtype=float).copy()
            cur_n = 1
        else:
            cur_sum = cur_sum + rc[r]
            cur_n += 1
        last_row = r
    close()

    # 合并过小带（行数 < 阈）到上一带。
    merged = []
    for b in bands:
        if (b["row1"] - b["row0"] + 1) < AUTO_BAND_MIN_ROW and merged:
            merged[-1]["row1"] = b["row1"]
            prev = merged[-1]
            n0 = prev["row1"] - prev["row0"] + 1
            n1 = b["row1"] - b["row0"] + 1
            merged[-1]["color"] = (prev["color"] * n0 + b["color"] * n1) / (n0 + n1)
        else:
            merged.append(dict(b))
    bands = merged

    out = []
    for b in bands:
        t_lo = row_to_t(b["row1"], y0, y1)
        t_hi = row_to_t(b["row0"], y0, y1)
        out.append({
            "t0": round(min(t_lo, t_hi), 4),
            "t1": round(max(t_lo, t_hi), 4),
            "color": rgbhex(b["color"]),
            "row0": b["row0"], "row1": b["row1"],
        })
    return out


def k_bands(primary, a, y0, y1, k):
    out = []
    for i in range(k):
        t0 = i / k
        t1 = (i + 1) / k
        r_hi = int(round(y1 - t0 * (y1 - y0)))
        r_lo = int(round(y1 - t1 * (y1 - y0)))
        lo = min(r_hi, r_lo)
        hi = max(r_hi, r_lo)
        px = []
        for r in range(lo, hi + 1):
            cols = np.where(primary[r])[0]
            if len(cols):
                px.append(a[r, cols])
        mean = np.concatenate(px).reshape(-1, 3).mean(axis=0) if px else np.zeros(3)
        out.append({"t0": round(t0, 4), "t1": round(t1, 4), "color": rgbhex(mean)})
    return out


# ----------------------------- IoU -----------------------------

def compute_iou(mask, gt_path):
    gt = np.asarray(Image.open(gt_path).convert("L"))
    gtm = gt > 128
    if gtm.shape != mask.shape:
        gti = Image.fromarray((gtm.astype(np.uint8)) * 255).resize(
            (mask.shape[1], mask.shape[0]), Image.NEAREST)
        gtm = np.asarray(gti) > 128
    inter = int(((mask) & (gtm)).sum())
    union = int(((mask) | (gtm)).sum())
    return (inter / union) if union > 0 else 1.0


# ----------------------------- overlay -----------------------------

def make_overlay(img, primary, levels, outpath, y0, y1):
    ov = img.convert("RGB").copy()
    tint = Image.new("RGB", img.size, (255, 0, 0))
    comp = Image.composite(
        tint, img, Image.fromarray((primary.astype(np.uint8)) * 255))
    ov = Image.blend(comp, img, 0.45)
    d = ImageDraw.Draw(ov)
    xs = np.where(primary.any(axis=0))[0]
    ys = np.where(primary.any(axis=1))[0]
    d.rectangle([int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
                outline=(0, 180, 0))
    for lv in levels:
        r = lv["row"]
        w = lv["widthPx"]
        if w > 0:
            cx = lv["centerPx"]
            d.line([(cx - w / 2.0, r), (cx + w / 2.0, r)], fill=(0, 255, 255), width=1)
    ov.save(outpath)


# ----------------------------- 合成 fixture（确定性"脚型"） -----------------------------

def make_fixture(outdir):
    os.makedirs(outdir, exist_ok=True)
    W, H = 320, 420
    bg = (172, 172, 178)
    fgc = (248, 248, 250)
    a_f, b_f = 88, 150          # front 脚型椭圆半轴（像素）
    a_s, b_s = 58, 145          # side 椭圆半轴（窄：深度）
    cx_f, cy = W // 2, H // 2
    cx_s = W // 2 + 40          # side 偏右 → 测 centerZ

    front_img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(front_img)
    d.ellipse([cx_f - a_f, cy - b_f, cx_f + a_f, cy + b_f], fill=fgc)
    front_img.save(os.path.join(outdir, "fixture-front.png"))

    side_img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(side_img)
    d.ellipse([cx_s - a_s, cy - b_s, cx_s + a_s, cy + b_s], fill=fgc)
    side_img.save(os.path.join(outdir, "fixture-side.png"))

    # gt mask（front）：与绘制椭圆一致的二值掩膜。
    yy, xx = np.mgrid[0:H, 0:W]
    gt = (((xx - cx_f) / float(a_f)) ** 2 + ((yy - cy) / float(b_f)) ** 2 <= 1.0)
    Image.fromarray((gt.astype(np.uint8)) * 255).save(os.path.join(outdir, "fixture-front-gt.png"))

    return {
        "front": os.path.join(outdir, "fixture-front.png"),
        "side": os.path.join(outdir, "fixture-side.png"),
        "gt": os.path.join(outdir, "fixture-front-gt.png"),
        "params": {"W": W, "H": H, "a_front": a_f, "b_front": b_f, "a_side": a_s, "b_side": b_s,
                   "expected_area": round(math.pi * a_f * b_f, 1)},
    }


# ----------------------------- 主流程 -----------------------------

def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="任意对象参考图 → manifest + 环数据 + 色带 + overlay + IoU/数值报告（确定性）")
    p.add_argument("--front", help="前视图（宽度剖面）")
    p.add_argument("--side", help="侧视图（深度剖面 + centerZ）")
    p.add_argument("--top", default=None, help="顶视图（可选；缺省用椭圆近似）")
    p.add_argument("--out-dir", default=".", help="输出目录")
    p.add_argument("--points", type=int, default=DEFAULT_POINTS, help="每环目标点数（默认 64）")
    p.add_argument("--color-bands", type=int, default=0,
                   help="色带数 K；0=自动（默认）；>0=等高分 K 带；配合 --no-color-bands 关闭")
    p.add_argument("--no-color-bands", action="store_true", help="关闭色带输出")
    p.add_argument("--gt-mask", default=None, help="可选基准前视 gt-mask（IoU）")
    p.add_argument("--name", default="reference-fit", help="输出基名")
    p.add_argument("--height", type=float, default=DEFAULT_HEIGHT_M, help="物体高度（米）")
    p.add_argument("--ring-count", type=int, default=DEFAULT_RING_COUNT,
                   help="截面环（sideProfile 层数，默认 %d）" % DEFAULT_RING_COUNT)
    p.add_argument("--make-fixture", default=None,
                   help="不跑提取：在指定目录生成确定性'脚型'合成样张与 gt mask，并打印路径")
    return p.parse_args(argv)


def write_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")


def build_rings(front, side, top_view, points, name, height_m, ring_count, bands, cap):
    W_ref_px = front["W_ref"]
    mpp_f = height_m / max(front["heightPx"], 1)
    mpp_s = height_m / max(side["heightPx"], 1)
    D_ref_px = side["W_ref"]
    a_x = (W_ref_px / 2.0) * mpp_f
    a_z = (D_ref_px / 2.0) * mpp_s
    side_cx = (side["bbox"][0] + side["bbox"][2]) / 2.0

    side_profile = []
    for i in range(ring_count):
        fr = front["levels"][i]
        sd = side["levels"][i]
        ws = (fr["widthPx"] / W_ref_px) if W_ref_px > 0 else 0.0
        ws = max(WIDTHSCALE_EPS, min(1.0, ws))
        cz = (sd["centerPx"] - side_cx) * mpp_s
        side_profile.append({
            "y": fr["y"],
            "widthScale": round(ws, 4),
            "centerZ": round(cz, 4),
        })

    top_outline = None
    if top_view is not None:
        pts = extract_top_outline(top_view, points)
        if pts and len(pts) >= 3:
            top_outline = pts
        else:
            top_outline = ellipse_outline(a_x if a_x > 0 else 0.05, a_z if a_z > 0 else 0.05, points)

    base = {"name": name, "points": points, "sideProfile": side_profile, "cap": cap}
    if bands:
        base["colorBands"] = bands
    if top_outline is not None:
        base["topOutline"] = top_outline

    rings_out = dict(base)
    if top_outline is None:
        # 无顶视 → rings.json 省略 topOutline（spec），另出可吞吐的椭圆近似版。
        rings_ellipse = dict(base)
        rings_ellipse["topOutline"] = ellipse_outline(
            a_x if a_x > 0 else 0.05, a_z if a_z > 0 else 0.05, points)
        return rings_out, rings_ellipse, a_x, a_z, False
    return rings_out, rings_out, a_x, a_z, True


def main(argv=None):
    args = parse_args(argv)

    if args.make_fixture:
        result = make_fixture(args.make_fixture)
        # 打印路径（machine-readable JSON），供测试读取。
        print(json.dumps(result, ensure_ascii=False, indent=1))
        return 0

    if not args.front or not args.side or not args.out_dir:
        print("[reference-fit] 需要 --front --side --out-dir（或使用 --make-fixture）", file=sys.stderr)
        return 2

    outdir = args.out_dir
    os.makedirs(outdir, exist_ok=True)
    height_m = args.height
    ring_count = args.ring_count
    points = args.points

    front = analyze_view(args.front, "front", height_m, ring_count)
    side = analyze_view(args.side, "side", height_m, ring_count)
    top_view = None
    if args.top:
        try:
            top_view = analyze_view(args.top, "top", height_m, ring_count)
        except RuntimeError:
            top_view = None  # 顶视提取失败 → 回退椭圆 + manifest 不确定标注

    # 色带
    bands_given = args.color_bands > 0
    if args.no_color_bands:
        bands = []
    elif bands_given:
        bands = k_bands(front["primary"], front["a"], front["bbox"][1], front["bbox"][3], args.color_bands)
    else:
        bands = auto_bands(front["primary"], front["a"], front["bbox"][1], front["bbox"][3])

    bands_out = [{"t0": b["t0"], "t1": b["t1"], "color": b["color"]} for b in bands]
    cap = "both"

    rings_out, rings_ellipse, a_x, a_z, has_top = build_rings(
        front, side, top_view, points, args.name, height_m, ring_count, bands_out, cap)

    # IoU
    iou = None
    if args.gt_mask:
        iou = compute_iou(front["primary"], args.gt_mask)

    # ---- 写出 ----
    base = args.name
    write_json(os.path.join(outdir, "rings.json"), rings_out)
    if not has_top:
        write_json(os.path.join(outdir, "rings-ellipse.json"), rings_ellipse)
    write_json(os.path.join(outdir, "color_bands.json"),
               {"name": base, "bands": bands_out, "bandCount": len(bands_out)})

    make_overlay(front["img"], front["primary"], front["levels"],
                 os.path.join(outdir, "overlay-front.png"), front["bbox"][1], front["bbox"][3])
    make_overlay(side["img"], side["primary"], side["levels"],
                 os.path.join(outdir, "overlay-side.png"), side["bbox"][1], side["bbox"][3])

    f_bb = front["bbox"]
    s_bb = side["bbox"]
    summary = {
        "name": base,
        "inputs": {
            "front": args.front, "side": args.side, "top": args.top,
            "gtMask": args.gt_mask,
        },
        "views": [
            {"role": "front", "image": args.front, "imageWidthPx": front["shape"][0],
             "imageHeightPx": front["shape"][1], "bbox": f_bb, "bboxHeightPx": front["heightPx"],
             "maskAreaPx": int(front["primary"].sum()),
             "componentCount": front["ncomp"], "partCount": front["partCount"],
             "refWidthPx": front["W_ref"]},
            {"role": "side", "image": args.side, "imageWidthPx": side["shape"][0],
             "imageHeightPx": side["shape"][1], "bbox": s_bb, "bboxHeightPx": side["heightPx"],
             "maskAreaPx": int(side["primary"].sum()),
             "componentCount": side["ncomp"], "partCount": side["partCount"],
             "refWidthPx": side["W_ref"]},
        ],
        "rings": {
            "ringCount": len(rings_out["sideProfile"]),
            "points": rings_out["points"],
            "hasTopOutline": "topOutline" in rings_out,
            "heightM": height_m,
            "topHalfWidthM": round(a_x, 5),
            "topHalfDepthM": round(a_z, 5),
        },
        "bands": {"count": len(bands_out)},
        "iou": {"computed": iou is not None,
                "value": (round(iou, 5) if iou is not None else None),
                "gtMask": args.gt_mask},
        "method": {
            "bgPatch": BG_PATCH, "bgThresh": BG_THRESH, "morphK": MORPH_K,
            "minComponentFrac": MIN_COMPONENT_FRAC,
            "heightM": height_m, "ringCount": ring_count, "points": points,
            "colorBandsMode": ("off" if args.no_color_bands else
                               ("k=%d" % args.color_bands if bands_given else "auto")),
            "bandColorTol": BAND_COLOR_TOL, "cap": cap,
            "topApprox": "ellipse(width x depth)" if not has_top else "extracted",
        },
    }
    write_json(os.path.join(outdir, "summary.json"), summary)

    # ---- manifest ----
    uncertainties = []
    if not args.top and top_view is None:
        uncertainties.append("无顶视图素材：前后向深度经「椭圆近似（宽×深）」合成，待顶视轮廓后可精确化。")
    if args.top and top_view is None:
        uncertainties.append("顶视图提取失败/未提供 → 顶视轮廓回退为椭圆近似。")
    if f_bb[2] - f_bb[0] >= front["shape"][0] * 0.98:
        uncertainties.append("前视图疑似在左右边缘被裁切或合并多部件 → 宽度为画面内可见范围。")
    if f_bb[1] <= 1:
        uncertainties.append("前视图顶部疑被裁切（前景触及画面上缘）→ 高度被低估，实际物体更高。")
    if args.name == "reference-fit":
        uncertainties.append("未提供 --name；产物基名用缺省值。")
    for role, view in (("front", front), ("side", side)):
        if view["partCount"] > 1:
            uncertainties.append(
                "视图 %s 检出 %d 个部件（多部件/遮挡/细节碎片）→ 以最大连通域为主剪影，宽度/深度为该部件范围；其余部件未纳入剖面。"
                % (role, view["partCount"]))
    uncertainties.append(
        "前视与侧视来自不同图像；若二者为同一对象的不同视角则物理一致，否则组合环为近似（管线不校验两图对象同一性）。")

    f_y0, f_y1 = f_bb[1], f_bb[3]
    widest = max(front["widths"].items(), key=lambda kv: kv[1]) if front["widths"] else (0, 0)
    top_row = f_y0
    bottom_row = f_y1
    landmarks = {
        "topVisibleRow": {"pixelRow": top_row, "heightFrac": round(row_to_t(top_row, f_y0, f_y1), 4),
                          "class": "objectTop"},
        "bottomVisibleRow": {"pixelRow": bottom_row, "heightFrac": round(row_to_t(bottom_row, f_y0, f_y1), 4),
                             "class": "groundOrSole"},
        "widestRow": {"pixelRow": widest[0], "widthPx": int(widest[1]),
                      "heightFrac": round(row_to_t(widest[0], f_y0, f_y1), 4),
                      "class": "widestCrossSection"},
        "ankle": {"class": "未知区域",
                  "reason": "前视袜筒无法语义定位踝部（需侧视/顶视或人工标注）；无稳定高对比特征。"},
        "arch": {"class": "未知区域", "reason": "足弓需顶视/侧视轮廓；前视不可稳定提取。"},
        "toe": {"class": "未知区域", "reason": "趾部需顶视轮廓区分；无顶视图素材。"},
        "heel": {"class": "未知区域", "reason": "后跟需侧视轮廓；侧视为近鞋/袜近似，不可靠。"},
    }

    manifest = {
        "name": args.name,
        "views": [
            {"name": args.name + "-front", "file": args.front, "role": "front",
             "purpose": "宽度剖面（x 向）", "widthPx": front["shape"][0], "heightPx": front["shape"][1],
             "bbox": f_bb, "maskAreaPx": int(front["primary"].sum()),
             "partCount": front["partCount"], "componentCount": front["ncomp"]},
            {"name": args.name + "-side", "file": args.side, "role": "side",
             "purpose": "深度剖面 + centerZ 偏置（z 向）", "widthPx": side["shape"][0], "heightPx": side["shape"][1],
             "bbox": s_bb, "maskAreaPx": int(side["primary"].sum()),
             "partCount": side["partCount"], "componentCount": side["ncomp"]},
        ] + ([{"name": args.name + "-top", "file": args.top, "role": "top",
               "purpose": "顶视轮廓", "partCount": top_view["partCount"] if top_view else None,
               "status": "ok" if top_view else "fallback-ellipse"}]
             if (args.top or top_view) else []),
        "landmarks": landmarks,
        "partCount": front["partCount"],
        "uncertainties": uncertainties,
        "method": summary["method"],
    }
    write_json(os.path.join(outdir, "manifest.json"), manifest)

    # ---- stdout 摘要（machine-readable） ----
    print(json.dumps({
        "outDir": outdir,
        "rings": {"count": len(rings_out["sideProfile"]), "points": rings_out["points"],
                  "hasTopOutline": "topOutline" in rings_out},
        "bands": len(bands_out),
        "iou": (round(iou, 5) if iou is not None else None),
        "frontMaskAreaPx": int(front["primary"].sum()),
        "frontPartCount": front["partCount"],
    }, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
